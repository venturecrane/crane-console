/**
 * Scans ~/dev for git repos and maps them to ventures
 */

import { execSync } from 'child_process'
import { readdirSync, statSync, existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { Venture } from './crane-api.js'

export interface LocalRepo {
  path: string
  name: string
  remote: string
  org: string
  repoName: string
}

export interface VentureRepo extends LocalRepo {
  venture: Venture
}

// Cache for session duration
let repoCache: LocalRepo[] | null = null

/**
 * Scan ~/dev for git repositories
 */
export function scanLocalRepos(): LocalRepo[] {
  if (repoCache) {
    return repoCache
  }

  const devDir = join(homedir(), 'dev')
  const repos: LocalRepo[] = []

  if (!existsSync(devDir)) {
    return repos
  }

  try {
    const entries = readdirSync(devDir)

    for (const entry of entries) {
      const fullPath = join(devDir, entry)

      try {
        const stat = statSync(fullPath)
        if (!stat.isDirectory()) continue

        const gitDir = join(fullPath, '.git')
        if (!existsSync(gitDir)) continue

        // Get remote URL
        const remote = execSync('git remote get-url origin 2>/dev/null', {
          cwd: fullPath,
          encoding: 'utf-8',
        }).trim()

        // Parse org/repo from remote
        const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
        if (match) {
          repos.push({
            path: fullPath,
            name: entry,
            remote,
            org: match[1],
            repoName: match[2],
          })
        }
      } catch {
        // Skip repos we can't read
        continue
      }
    }
  } catch {
    // ~/dev doesn't exist or isn't readable
  }

  repoCache = repos
  return repos
}

/**
 * Get current directory's git info
 */
export function getCurrentRepoInfo(): { org: string; repo: string; branch: string } | null {
  try {
    const remote = execSync('git remote get-url origin 2>/dev/null', {
      encoding: 'utf-8',
    }).trim()

    const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
    if (!match) return null

    let branch = 'main'
    try {
      branch = execSync('git branch --show-current 2>/dev/null', {
        encoding: 'utf-8',
      }).trim()
    } catch {
      // default to main
    }

    return {
      org: match[1],
      repo: match[2],
      branch,
    }
  } catch {
    return null
  }
}

export interface RepoSyncStatus {
  branch: string
  upstream: string | null
  ahead: number
  behind: number
  dirty: number
  /** Seconds since .git/FETCH_HEAD was last touched. null if never fetched. */
  lastFetchSecondsAgo: number | null
}

/**
 * Report git sync state for the current repo without mutating it.
 *
 * No `git fetch` — callers (the launcher, precommit hooks, operators) own fetch timing.
 * This function reads local refs and the working tree only, so it's cheap and safe to
 * call from the SoS briefing path.
 *
 * Returns null when cwd is not a git repo or when basic git introspection fails.
 */
export function getRepoSyncStatus(): RepoSyncStatus | null {
  try {
    const branch = execSync('git branch --show-current 2>/dev/null', {
      encoding: 'utf-8',
    }).trim()
    if (!branch) return null

    let upstream: string | null = null
    try {
      upstream = execSync('git rev-parse --abbrev-ref @{u} 2>/dev/null', {
        encoding: 'utf-8',
      }).trim()
      if (!upstream) upstream = null
    } catch {
      upstream = null
    }

    let ahead = 0
    let behind = 0
    if (upstream) {
      try {
        const counts = execSync(
          `git rev-list --left-right --count HEAD...${upstream} 2>/dev/null`,
          { encoding: 'utf-8' }
        ).trim()
        const [a, b] = counts.split(/\s+/).map((n) => parseInt(n, 10) || 0)
        ahead = a ?? 0
        behind = b ?? 0
      } catch {
        // leave zeroed
      }
    }

    let dirty = 0
    try {
      const porcelain = execSync('git status --porcelain 2>/dev/null', {
        encoding: 'utf-8',
      })
      dirty = porcelain.split('\n').filter(Boolean).length
    } catch {
      // leave zero
    }

    let lastFetchSecondsAgo: number | null = null
    try {
      const gitDir = execSync('git rev-parse --git-dir 2>/dev/null', {
        encoding: 'utf-8',
      }).trim()
      const fetchHead = join(gitDir, 'FETCH_HEAD')
      if (existsSync(fetchHead)) {
        const mtimeMs = statSync(fetchHead).mtimeMs
        lastFetchSecondsAgo = Math.round((Date.now() - mtimeMs) / 1000)
      }
    } catch {
      // leave null
    }

    return { branch, upstream, ahead, behind, dirty, lastFetchSecondsAgo }
  } catch {
    return null
  }
}

export type NodeModulesState =
  | 'absent' // no package.json — not a node project
  | 'missing' // package-lock.json exists but node_modules is empty/missing
  | 'stale' // node_modules/.package-lock.json is older than root package-lock.json
  | 'current' // node_modules/.package-lock.json matches root package-lock.json mtime
  | 'unknown' // package.json exists but no root package-lock.json

export interface NodeModulesDrift {
  state: NodeModulesState
  /** Age gap in seconds when state === 'stale'. null otherwise. */
  staleBySeconds: number | null
}

/**
 * Detect node_modules drift for the repo at `repoPath` (default cwd).
 *
 * The cheap, authoritative signal: npm writes `node_modules/.package-lock.json`
 * as a snapshot of what it installed, and keeps its mtime in step with the
 * source `package-lock.json`. If the root lockfile mtime is newer, deps have
 * drifted; if the marker is missing entirely, `npm ci` was never run (or
 * ran against an empty/failed install, as in the ss-console incident).
 *
 * Surfaced in `/sos` Session block and the launcher pre-handoff banner so
 * operators see the gap before a pre-push verify blows up.
 */
export function getNodeModulesDrift(repoPath: string = process.cwd()): NodeModulesDrift {
  // `repoPath` is always trusted internal state — either process.cwd() from
  // an agent session, or venture.localPath from scanLocalRepos() (which walks
  // ~/dev). There is no HTTP boundary in the call chain, so semgrep's
  // path-traversal heuristic is a false positive here.
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal — repoPath is trusted internal state per the block comment above; no HTTP boundary in call chain
  const pkgJson = join(repoPath, 'package.json')
  if (!existsSync(pkgJson)) {
    return { state: 'absent', staleBySeconds: null }
  }

  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal — repoPath is trusted internal state (see getNodeModulesDrift header)
  const rootLock = join(repoPath, 'package-lock.json')
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal — repoPath is trusted internal state (see getNodeModulesDrift header)
  const installedMarker = join(repoPath, 'node_modules', '.package-lock.json')
  const hasRootLock = existsSync(rootLock)
  const hasInstalled = existsSync(installedMarker)

  if (hasRootLock && !hasInstalled) {
    return { state: 'missing', staleBySeconds: null }
  }
  if (!hasRootLock) {
    return { state: 'unknown', staleBySeconds: null }
  }

  try {
    const rootMtime = statSync(rootLock).mtimeMs
    const installedMtime = statSync(installedMarker).mtimeMs
    // A 2-second fudge handles same-second writes across fs granularities
    // (HFS+, some network mounts) without masking real drift.
    if (rootMtime - installedMtime > 2000) {
      return {
        state: 'stale',
        staleBySeconds: Math.round((rootMtime - installedMtime) / 1000),
      }
    }
    return { state: 'current', staleBySeconds: null }
  } catch {
    return { state: 'unknown', staleBySeconds: null }
  }
}

/**
 * Find venture for a given org and repo name.
 *
 * All ventures share the same GitHub org (venturecrane), so org-only
 * matching is ambiguous. Match against each venture's `repos` array.
 */
export function findVentureByRepo(
  ventures: Venture[],
  org: string,
  repoName: string
): Venture | null {
  return (
    ventures.find((v) => {
      if (v.org.toLowerCase() !== org.toLowerCase()) return false
      return v.repos?.includes(repoName) ?? false
    }) || null
  )
}

/**
 * Find local repo for a venture.
 *
 * All ventures live under the same GitHub org (venturecrane), so org-only
 * matching is ambiguous. Match by org + repo name convention:
 *   {code}-console  (ke → ke-console, dc → dc-console)
 *   crane-console   (special case for vc, the infra venture)
 */
export function findRepoForVenture(venture: Venture): LocalRepo | null {
  const repos = scanLocalRepos()
  return (
    repos.find((r) => {
      if (r.org.toLowerCase() !== venture.org.toLowerCase()) return false
      return (
        r.repoName === `${venture.code}-console` ||
        (venture.code === 'vc' && r.repoName === 'crane-console')
      )
    }) || null
  )
}

/**
 * Get all ventures with their local repo info
 */
export function mapVenturesToRepos(ventures: Venture[]): Map<string, LocalRepo | null> {
  const map = new Map<string, LocalRepo | null>()

  for (const venture of ventures) {
    map.set(venture.code, findRepoForVenture(venture))
  }

  return map
}
