/**
 * Main entrypoint for crane_worktree_doctor.
 * Orchestrates scanning, classification, and destructive cleanup.
 */

import { execSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { classifyWorktree, shellEscape } from './classify.js'
import { parseWorktreeList, resolveWorktreesDir } from './parse.js'
import type {
  CleanedEntry,
  ClassificationContext,
  ClassificationOutcome,
  DoctorReport,
  ErrorEntry,
  NeedsReviewEntry,
  PidChecker,
  WorktreeDoctorInput,
  WorktreeDoctorResult,
  WorktreeRecord,
} from './types.js'

// ----------------------------------------------------------------------------
// PidChecker abstraction (injectable for tests)
// ----------------------------------------------------------------------------

/**
 * Default PID liveness check. signal 0 is a no-op that exists only to test
 * whether the target PID exists and we're allowed to signal it.
 *   - Returns 0 → process exists, treat as alive.
 *   - ESRCH → process doesn't exist, dead.
 *   - EPERM → process exists but we don't own it; treat as alive (not ours,
 *     leave alone — could be a parallel agent owned by another user).
 */
export const defaultPidChecker: PidChecker = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ESRCH') return false
    if (err.code === 'EPERM') return true
    throw e
  }
}

// ----------------------------------------------------------------------------
// Merged-PR cache
// ----------------------------------------------------------------------------

interface MergedPrEntry {
  number: number
  headRefName: string
}

function fetchMergedPrs(repoRoot: string): Set<string> {
  try {
    const output = execSync('gh pr list --state merged --limit 100 --json number,headRefName', {
      encoding: 'utf-8',
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: repoRoot,
    })
    const list = JSON.parse(output) as MergedPrEntry[]
    return new Set(list.map((p) => p.headRefName))
  } catch {
    // Offline or gh unauthenticated — treat as empty. Other gates still cover.
    return new Set()
  }
}

// ----------------------------------------------------------------------------
// Candidate scanning
// ----------------------------------------------------------------------------

interface Candidate {
  id: string
  path: string
  mtime: number
}

function scanCandidates(
  worktreesDir: string,
  cap: number
): { candidates: Candidate[]; deferred_by_cap: number } | { error: string } {
  const all: Candidate[] = []
  try {
    const entries = readdirSync(worktreesDir, { withFileTypes: true })
    for (const ent of entries) {
      if (!ent.isDirectory()) continue
      const p = path.join(worktreesDir, ent.name)
      try {
        const st = statSync(p)
        all.push({ id: ent.name, path: p, mtime: st.mtimeMs })
      } catch {
        // Skip unreadable entries.
      }
    }
  } catch (e) {
    return { error: `scan failed: ${(e as Error).message}` }
  }
  all.sort((a, b) => b.mtime - a.mtime)
  const deferred_by_cap = Math.max(0, all.length - cap)
  return { candidates: all.slice(0, cap), deferred_by_cap }
}

// ----------------------------------------------------------------------------
// Destructive removal
// ----------------------------------------------------------------------------

function applyRemove(
  cand: Candidate,
  record: WorktreeRecord,
  repoRoot: string,
  reason: string,
  unlocked: boolean
): { entry: CleanedEntry } | { error: string } {
  try {
    execSync(`git worktree remove --force ${shellEscape(cand.path)}`, {
      encoding: 'utf-8',
      timeout: 30_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: repoRoot,
    })
    if (record.branch) {
      try {
        execSync(`git branch -D ${shellEscape(record.branch)}`, {
          encoding: 'utf-8',
          timeout: 10_000,
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: repoRoot,
        })
      } catch {
        // Branch already gone or other reason — non-fatal.
      }
    }
    return { entry: { id: cand.id, branch: record.branch ?? '(no branch)', reason, unlocked } }
  } catch (e) {
    return { error: `remove failed: ${(e as Error).message}` }
  }
}

// ----------------------------------------------------------------------------
// Per-candidate dispatch
// ----------------------------------------------------------------------------

interface DispatchAccumulators {
  cleaned: CleanedEntry[]
  needs_review: NeedsReviewEntry[]
  errors: ErrorEntry[]
}

function processCandidate(
  cand: Candidate,
  record: WorktreeRecord,
  outcome: ClassificationOutcome,
  ctx: Pick<ClassificationContext, 'apply' | 'repoRoot'>,
  acc: DispatchAccumulators
): void {
  const branch = record.branch ?? '(no branch)'

  if (outcome.bucket === 'skip') return
  if (outcome.bucket === 'error') {
    acc.errors.push({ id: cand.id, message: outcome.message ?? 'unknown error' })
    return
  }
  if (outcome.bucket === 'needs_review') {
    acc.needs_review.push({ id: cand.id, branch, reason: outcome.reason ?? 'unknown' })
    return
  }

  // bucket === 'cleaned'
  const reason = outcome.reason ?? 'clean+merged'
  const unlocked = outcome.unlocked ?? false
  if (ctx.apply) {
    const result = applyRemove(cand, record, ctx.repoRoot, reason, unlocked)
    if ('error' in result) {
      acc.errors.push({ id: cand.id, message: result.error })
    } else {
      acc.cleaned.push(result.entry)
    }
  } else {
    acc.cleaned.push({ id: cand.id, branch, reason, unlocked })
  }
}

// ----------------------------------------------------------------------------
// Worktree list fetch + index
// ----------------------------------------------------------------------------

function fetchWorktreeIndex(
  repoRoot: string,
  deferred_by_cap: number,
  apply: boolean
): Map<string, WorktreeRecord> | WorktreeDoctorResult {
  try {
    const porcelain = execSync('git worktree list --porcelain', {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: repoRoot,
    })
    const records = parseWorktreeList(porcelain)
    const index = new Map<string, WorktreeRecord>()
    for (const r of records) index.set(path.resolve(r.path), r)
    return index
  } catch (e) {
    return makeResult(apply, {
      scanned: 0,
      deferred_by_cap,
      cleaned: [],
      needs_review: [],
      errors: [{ id: '<scan>', message: `git worktree list failed: ${(e as Error).message}` }],
    })
  }
}

// ----------------------------------------------------------------------------
// Main entrypoint
// ----------------------------------------------------------------------------

export async function executeWorktreeDoctor(
  input: WorktreeDoctorInput,
  pidChecker: PidChecker = defaultPidChecker
): Promise<WorktreeDoctorResult> {
  const { apply, cap } = input

  const resolved = resolveWorktreesDir()
  if (!resolved) {
    return makeResult(apply, {
      scanned: 0,
      deferred_by_cap: 0,
      cleaned: [],
      needs_review: [],
      errors: [{ id: '<init>', message: '.claude/worktrees not found within 3 levels of cwd' }],
    })
  }

  const { worktreesDir, repoRoot } = resolved
  try {
    execSync('git fetch origin main --quiet', {
      encoding: 'utf-8',
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: repoRoot,
    })
  } catch {
    // Offline or auth issue — proceed with stale main; gates still safe.
  }

  const scanResult = scanCandidates(worktreesDir, cap)
  if ('error' in scanResult) {
    return makeResult(apply, {
      scanned: 0,
      deferred_by_cap: 0,
      cleaned: [],
      needs_review: [],
      errors: [{ id: '<scan>', message: scanResult.error }],
    })
  }
  const { candidates, deferred_by_cap } = scanResult

  const indexOrResult = fetchWorktreeIndex(repoRoot, deferred_by_cap, apply)
  if (!('set' in indexOrResult)) return indexOrResult as WorktreeDoctorResult
  const recordsByPath = indexOrResult

  const ctx: ClassificationContext = {
    repoRoot,
    apply,
    pidChecker,
    mergedPrs: fetchMergedPrs(repoRoot),
    now: Math.floor(Date.now() / 1000),
    ownWorktreePath: path.resolve(process.cwd()),
  }
  const acc: DispatchAccumulators = { cleaned: [], needs_review: [], errors: [] }
  let scanned = 0

  for (const cand of candidates) {
    const record = recordsByPath.get(path.resolve(cand.path))
    if (!record) {
      acc.errors.push({ id: cand.id, message: 'git worktree list does not include this path' })
      continue
    }
    scanned++
    const outcome = classifyWorktree(record, ctx)
    processCandidate(cand, record, outcome, ctx, acc)
  }

  return makeResult(apply, { scanned, deferred_by_cap, ...acc })
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function makeResult(apply: boolean, partial: Omit<DoctorReport, 'apply'>): WorktreeDoctorResult {
  const report: DoctorReport = { ...partial, apply }
  return { success: true, message: JSON.stringify(report, null, 2) }
}
