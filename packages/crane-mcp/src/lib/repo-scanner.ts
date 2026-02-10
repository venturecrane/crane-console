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

/**
 * Find venture for a given org
 */
export function findVentureByOrg(ventures: Venture[], org: string): Venture | null {
  return ventures.find((v) => v.org.toLowerCase() === org.toLowerCase()) || null
}

/**
 * Find local repo for a venture
 */
export function findRepoForVenture(venture: Venture): LocalRepo | null {
  const repos = scanLocalRepos()
  return repos.find((r) => r.org.toLowerCase() === venture.org.toLowerCase()) || null
}

/**
 * Get all ventures with their local repo info
 */
export function mapVenturesToRepos(ventures: Venture[]): Map<string, LocalRepo | null> {
  const repos = scanLocalRepos()
  const map = new Map<string, LocalRepo | null>()

  for (const venture of ventures) {
    const repo = repos.find((r) => r.org.toLowerCase() === venture.org.toLowerCase())
    map.set(venture.code, repo || null)
  }

  return map
}
