/**
 * Per-worktree safety-gate classification for crane_worktree_doctor.
 *
 * Safety gate order (preserved from .claude/commands/sos.md Step 3):
 *   1. Skip the session's own worktree (/eos owns it).
 *   2. Lock triage — claude-agent-pid: alive → skip; dead → force-unlock;
 *      foreign → needs_review, never unlock.
 *   3. lsof: any live FD in the worktree → skip.
 *   4. Fresh HEAD (commit within last 60min) → skip.
 *   5. Clean tree → required (else needs_review: dirty).
 *   6. Merged-state — PR-list → log-not-ahead → cherry-equiv.
 */

import { execSync } from 'node:child_process'
import path from 'node:path'
import { classifyLock } from './parse.js'
import type { ClassificationContext, ClassificationOutcome, WorktreeRecord } from './types.js'

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

export function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

const SIXTY_MIN_SECONDS = 60 * 60

// ----------------------------------------------------------------------------
// Gate implementations
// ----------------------------------------------------------------------------

function gateOwnWorktree(wtPath: string, ownWorktreePath: string): ClassificationOutcome | null {
  if (
    path.resolve(wtPath) === path.resolve(ownWorktreePath) ||
    ownWorktreePath.startsWith(path.resolve(wtPath) + path.sep)
  ) {
    return { bucket: 'skip' }
  }
  return null
}

function gateLock(
  record: WorktreeRecord,
  ctx: ClassificationContext
): { outcome: ClassificationOutcome | null; unlocked: boolean } {
  if (!record.locked) return { outcome: null, unlocked: false }

  const cls = classifyLock(record.locked.reason)
  if (cls.kind === 'foreign') {
    const r = cls.reason.length > 80 ? cls.reason.slice(0, 77) + '...' : cls.reason
    return { outcome: { bucket: 'needs_review', reason: `locked: ${r}` }, unlocked: false }
  }

  // claude-agent-pid pattern
  if (ctx.pidChecker(cls.pid)) {
    return { outcome: { bucket: 'skip' }, unlocked: false }
  }

  // Dead PID — force-unlock if applying.
  if (ctx.apply) {
    try {
      execSync(`git worktree unlock ${shellEscape(record.path)}`, {
        encoding: 'utf-8',
        timeout: 10_000,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: ctx.repoRoot,
      })
    } catch (e) {
      return {
        outcome: { bucket: 'error', message: `unlock failed: ${(e as Error).message}` },
        unlocked: false,
      }
    }
  }
  return { outcome: null, unlocked: true }
}

function gateLsof(wtPath: string): ClassificationOutcome | null {
  try {
    const lsof = execSync(`lsof +D ${shellEscape(wtPath)} 2>/dev/null || true`, {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (lsof.trim().length > 0) {
      return { bucket: 'needs_review', reason: 'live process' }
    }
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException & { signal?: string }
    if (err.signal === 'SIGTERM' || /timed? out/i.test(err.message ?? '')) {
      return { bucket: 'needs_review', reason: 'lsof timeout' }
    }
    // Other lsof failures are non-fatal — assume no live FDs (consistent with `|| true`).
  }
  return null
}

function gateFreshHead(wtPath: string, now: number): ClassificationOutcome | null {
  try {
    const headTs = execSync(`git -C ${shellEscape(wtPath)} log -1 --format=%ct HEAD`, {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    const ts = parseInt(headTs, 10)
    if (!isNaN(ts) && now - ts < SIXTY_MIN_SECONDS) {
      return { bucket: 'needs_review', reason: 'fresh HEAD' }
    }
  } catch {
    // No HEAD or git error — fall through.
  }
  return null
}

function gateCleanTree(wtPath: string): ClassificationOutcome | null | 'error' {
  try {
    const status = execSync(`git -C ${shellEscape(wtPath)} status --porcelain`, {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (status.trim().length > 0) {
      const dirtyCount = status.split('\n').filter((l) => l.trim().length > 0).length
      return { bucket: 'needs_review', reason: `dirty: ${dirtyCount}` }
    }
  } catch (e) {
    return { bucket: 'error', message: `git status failed: ${(e as Error).message}` }
  }
  return null
}

function gateMerged(
  wtPath: string,
  branch: string,
  mergedPrs: Set<string>,
  unlocked: boolean
): { outcome: ClassificationOutcome; logAhead: number } {
  // Primary: PR-merged (ground truth from GitHub).
  if (branch && mergedPrs.has(branch)) {
    return { outcome: { bucket: 'cleaned', reason: 'clean+merged+pr', unlocked }, logAhead: 0 }
  }

  // Secondary: log-not-ahead.
  let logAhead = -1
  try {
    const logOut = execSync(
      `git -C ${shellEscape(wtPath)} log ${shellEscape(branch)} --not origin/main --oneline`,
      { encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const lines = logOut.split('\n').filter((l) => l.trim().length > 0)
    logAhead = lines.length
    if (logAhead === 0) {
      return {
        outcome: { bucket: 'cleaned', reason: 'clean+merged+ff', unlocked },
        logAhead,
      }
    }
  } catch {
    // Branch missing or git error — fall through to cherry.
  }

  // Tertiary: cherry-equivalent (squash-merge detection).
  // KNOWN LIMITATION: unreliable for multi-commit squash-merges where the squash
  // commit's patch differs from any single source commit.
  try {
    const cherryOut = execSync(
      `git -C ${shellEscape(wtPath)} cherry origin/main ${shellEscape(branch)}`,
      { encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const plusLines = cherryOut.split('\n').filter((l) => l.startsWith('+'))
    if (plusLines.length === 0) {
      return {
        outcome: { bucket: 'cleaned', reason: 'clean+merged+squash', unlocked },
        logAhead,
      }
    }
  } catch {
    // Branch missing — surface as needs_review below.
  }

  const aheadDesc = logAhead > 0 ? `${logAhead} commit(s) ahead` : 'unmerged'
  return { outcome: { bucket: 'needs_review', reason: aheadDesc }, logAhead }
}

// ----------------------------------------------------------------------------
// Main classifier
// ----------------------------------------------------------------------------

/**
 * Classify a single worktree through all safety gates. Returns the bucket and
 * (when applicable) the reason. Side effects (git worktree unlock when apply=true)
 * happen here; the caller handles destructive remove+branch-delete.
 */
export function classifyWorktree(
  record: WorktreeRecord,
  ctx: ClassificationContext
): ClassificationOutcome {
  const wtPath = record.path
  const branch = record.branch ?? ''

  // Gate 1: skip own worktree
  const own = gateOwnWorktree(wtPath, ctx.ownWorktreePath)
  if (own) return own

  // Gate 2: lock triage
  const { outcome: lockOutcome, unlocked } = gateLock(record, ctx)
  if (lockOutcome) return lockOutcome

  // Gate 3: lsof
  const lsofOutcome = gateLsof(wtPath)
  if (lsofOutcome) return lsofOutcome

  // Gate 4: fresh HEAD
  const freshOutcome = gateFreshHead(wtPath, ctx.now)
  if (freshOutcome) return freshOutcome

  // Gate 5: clean tree
  const cleanOutcome = gateCleanTree(wtPath)
  if (cleanOutcome) return cleanOutcome as ClassificationOutcome

  // Gate 6: merged-state
  const { outcome } = gateMerged(wtPath, branch, ctx.mergedPrs, unlocked)
  return outcome
}
