/**
 * Build staleness detection and venture repo sync utilities.
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync, execSync } from 'node:child_process'
import { CRANE_CONSOLE_ROOT } from './constants.js'

/**
 * Get the newest mtime (ms since epoch) of files with the given extension
 * in a directory tree. Returns 0 if no matching files found.
 */
function getNewestMtime(dir: string, ext: string): number {
  try {
    const files = readdirSync(dir, { recursive: true }) as string[]
    let newest = 0
    for (const file of files) {
      if (file.endsWith(ext)) {
        const stat = statSync(join(dir, file))
        if (stat.mtimeMs > newest) newest = stat.mtimeMs
      }
    }
    return newest
  } catch {
    return 0
  }
}

/**
 * Check if the crane-mcp build is stale (source newer than dist).
 * If stale, rebuild and re-exec so the fresh code runs.
 *
 * This solves the fleet deployment gap: once a machine does `git pull`,
 * the next `crane` invocation auto-rebuilds and runs the new code.
 * Without this, every machine needs manual `npm run build` after pulling.
 */
export function ensureFreshBuild(): void {
  // Guard: prevent infinite re-exec if rebuild doesn't update mtimes
  if (process.env.CRANE_FRESH_BUILD === '1') return

  const mcpDir = join(CRANE_CONSOLE_ROOT, 'packages', 'crane-mcp')
  const srcDir = join(mcpDir, 'src')
  const distDir = join(mcpDir, 'dist')

  // If no dist directory, checkMcpBinary() handles the full rebuild later
  if (!existsSync(distDir)) return

  // If no src directory (installed package, not dev checkout), skip
  if (!existsSync(srcDir)) return

  const newestSrc = getNewestMtime(srcDir, '.ts')
  const newestDist = getNewestMtime(distDir, '.js')

  // Build is fresh (or we can't determine)
  if (newestSrc === 0 || newestDist === 0 || newestSrc <= newestDist) return

  console.log('-> crane-mcp source is newer than build, rebuilding...')
  try {
    execSync('npm run build', {
      cwd: mcpDir,
      stdio: 'pipe',
      timeout: 30_000,
    })
    console.log('-> Rebuild complete, restarting...\n')
  } catch {
    console.warn('-> Auto-rebuild failed, continuing with existing build')
    return
  }

  // Re-exec with fresh build - the new dist/ files will be picked up
  const result = spawnSync(process.argv[0], process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, CRANE_FRESH_BUILD: '1' },
  })
  process.exit(result.status ?? 0)
}

function makeGitOut(repoPath: string): (args: string[], timeout: number) => string | null {
  return (args, timeout) => {
    const r = spawnSync('git', args, {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      encoding: 'utf-8',
    })
    if (r.status !== 0 || r.error) return null
    return (r.stdout ?? '').trim()
  }
}

interface RepoSyncState {
  branch: string
  upstream: string
  behind: number
  ahead: number
  dirty: number
}

function readRepoSyncState(
  repoPath: string,
  gitOut: (args: string[], timeout: number) => string | null
): RepoSyncState | null {
  const branch = gitOut(['rev-parse', '--abbrev-ref', 'HEAD'], 5_000)
  if (!branch || branch === 'HEAD') return null

  const upstream = gitOut(['rev-parse', '--abbrev-ref', '@{u}'], 5_000)
  if (!upstream) return null

  // upstream is derived from git itself (e.g., "origin/main") — not user input.
  const behindStr = gitOut(['rev-list', '--count', `HEAD..${upstream}`], 5_000)
  const aheadStr = gitOut(['rev-list', '--count', `${upstream}..HEAD`], 5_000)
  const dirtyStr = gitOut(['status', '--porcelain'], 5_000)

  return {
    branch,
    upstream,
    behind: parseInt(behindStr ?? '0', 10) || 0,
    ahead: parseInt(aheadStr ?? '0', 10) || 0,
    dirty: (dirtyStr ?? '').split('\n').filter(Boolean).length,
  }
}

function applyFastForward(repoPath: string, state: RepoSyncState): void {
  const pullResult = spawnSync('git', ['pull', '--ff-only', '--quiet'], {
    cwd: repoPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  })
  if (pullResult.status === 0 && !pullResult.error) {
    console.log(`-> ✓ synced ${state.branch} +${state.behind} from ${state.upstream}`)
  } else {
    console.warn(`-> git pull --ff-only failed on ${state.branch}; continuing with stale tree`)
  }
}

function evaluateSyncState(state: RepoSyncState): 'current' | 'pull' | 'skip' {
  if (state.behind === 0 && state.ahead === 0 && state.dirty === 0) return 'current'
  if (state.dirty > 0 && state.behind > 0) return 'skip'
  if (state.ahead > 0) return 'skip'
  if (state.dirty > 0) return 'current' // dirty but current — no action needed
  return 'pull'
}

/**
 * Sync the venture repo with origin before handing control to the agent.
 *
 * Fixes the "stale checkout" class of bug: `crane vc` / `crane ss` / etc. used
 * to chdir into a possibly-weeks-stale working tree and start the agent there.
 * Agents that trusted `git log` / `git grep` would then report "feature doesn't
 * exist" when it had been merged upstream the whole time.
 *
 * Behavior:
 *   - `git fetch origin` (quiet, 15s timeout) — offline failure is non-fatal.
 *   - If dirty → warn with counts, never auto-pull (preserves in-progress work).
 *   - If ahead → warn, never auto-pull (avoid merge conflicts mid-launch).
 *   - If clean + behind → `git pull --ff-only`, print "✓ synced +N".
 *   - If current → silent.
 *
 * Never throws; sync hygiene must not block the launcher.
 */
export function syncVentureRepo(repoPath: string): void {
  try {
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal — repoPath sourced from venture registry (API), not user input
    if (!existsSync(join(repoPath, '.git'))) return

    const gitOut = makeGitOut(repoPath)

    const fetchResult = spawnSync('git', ['fetch', 'origin', '--quiet'], {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    })
    if (fetchResult.status !== 0 || fetchResult.error) {
      console.warn('-> git fetch failed (offline?); skipping sync check')
      return
    }

    const state = readRepoSyncState(repoPath, gitOut)
    if (!state) return

    const action = evaluateSyncState(state)
    if (action === 'current') return
    if (action === 'skip') {
      if (state.dirty > 0 && state.behind > 0) {
        console.warn(
          `-> ⚠ ${state.branch}: ${state.dirty} dirty file(s), ${state.behind} behind ${state.upstream} — not auto-syncing`
        )
      } else if (state.ahead > 0) {
        console.warn(
          `-> ⚠ ${state.branch}: ${state.ahead} ahead of ${state.upstream} — push when ready`
        )
      }
      return
    }

    applyFastForward(repoPath, state)
  } catch {
    // Never fail the launcher over sync hygiene
  }
}
