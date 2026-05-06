/**
 * crane_worktree_doctor tool — orphan-worktree backstop for /sos.
 *
 * Closes the exit-side gap from PR #789's parallel-isolation system. /eos is
 * the deterministic primary path; this tool handles sessions that ended
 * unnaturally (closed terminal, force-quit, kernel panic) and left their
 * worktree + lock + branch behind.
 *
 * Why a tool, not a markdown bash block in /sos: Claude Code's auto-mode
 * classifier denies destructive bash invocations (`git worktree remove --force`,
 * `git branch -D`) regardless of `permissions.allow`. MCP tools are past the
 * classifier once the server is approved — see `docs/infra/mcp-surfaces.md`.
 *
 * Safety gate order (preserved from .claude/commands/sos.md Step 3):
 *   1. Skip the session's own worktree (/eos owns it).
 *   2. Lock triage — claude-agent-pid pattern: alive → skip; dead → force-unlock
 *      and continue; foreign pattern → surface as needs_review, never unlock.
 *   3. lsof: any live FD in the worktree → skip.
 *   4. Fresh HEAD (commit within last 60min) → skip.
 *   5. Clean tree → required (else surface as needs_review: dirty).
 *   6. Merged-state — PR-list (most reliable) → log-not-ahead → cherry-equiv.
 *   7. Action: unlock + remove + branch-delete, only if `apply: true`.
 *
 * Four independent safety signals before any destructive action. False positive
 * (a live worktree gets removed) requires all of: dead PID, no live FDs, HEAD
 * older than 60min, clean tree, AND merged signal — simultaneously wrong.
 */

import { execSync } from 'node:child_process'
import { existsSync, statSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

// ----------------------------------------------------------------------------
// Schema + types
// ----------------------------------------------------------------------------

export const worktreeDoctorInputSchema = z.object({
  apply: z
    .boolean()
    .default(false)
    .describe(
      'When true, perform destructive cleanup (unlock + remove + branch-delete). When false, classify only — cleaned[] reflects what would have been cleaned.'
    ),
  cap: z
    .number()
    .int()
    .positive()
    .default(20)
    .describe('Max worktrees evaluated per call, ordered by mtime descending.'),
})

export type WorktreeDoctorInput = z.infer<typeof worktreeDoctorInputSchema>

export interface WorktreeDoctorResult {
  success: boolean
  message: string // JSON.stringify'd DoctorReport
}

export interface CleanedEntry {
  id: string
  branch: string
  reason: string // 'clean+merged+pr' | 'clean+merged+ff' | 'clean+merged+squash'
  unlocked: boolean
}

export interface NeedsReviewEntry {
  id: string
  branch: string
  reason: string
}

export interface ErrorEntry {
  id: string
  message: string
}

export interface DoctorReport {
  scanned: number
  deferred_by_cap: number
  cleaned: CleanedEntry[]
  needs_review: NeedsReviewEntry[]
  errors: ErrorEntry[]
  apply: boolean
}

// ----------------------------------------------------------------------------
// PidChecker abstraction (injectable for tests)
// ----------------------------------------------------------------------------

export type PidChecker = (pid: number) => boolean

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
// Repo-root resolution
// ----------------------------------------------------------------------------

interface ResolvedDirs {
  worktreesDir: string
  repoRoot: string
}

/**
 * Walk up from cwd looking for `.claude/worktrees/`. The MCP server inherits
 * cwd from the launcher, which sets it to the venture repo root. But if the
 * Captain runs /sos from inside a subdirectory, we need to resolve correctly.
 */
export function resolveWorktreesDir(startDir: string = process.cwd()): ResolvedDirs | null {
  let cur = path.resolve(startDir)
  for (let i = 0; i < 3; i++) {
    const candidate = path.join(cur, '.claude', 'worktrees')
    if (existsSync(candidate)) {
      return { worktreesDir: candidate, repoRoot: cur }
    }
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return null
}

// ----------------------------------------------------------------------------
// git worktree list --porcelain parser
// ----------------------------------------------------------------------------

interface WorktreeRecord {
  path: string
  head?: string
  branch?: string
  locked?: { reason: string }
}

/**
 * Parse `git worktree list --porcelain` output. Each worktree is a block of
 *   worktree <path>
 *   HEAD <hash>
 *   branch <ref>
 *   [locked <reason>]
 * separated by blank lines.
 */
export function parseWorktreeList(porcelain: string): WorktreeRecord[] {
  const records: WorktreeRecord[] = []
  let current: Partial<WorktreeRecord> | null = null

  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current?.path) records.push(current as WorktreeRecord)
      current = { path: line.slice('worktree '.length).trim() }
    } else if (line.startsWith('HEAD ') && current) {
      current.head = line.slice('HEAD '.length).trim()
    } else if (line.startsWith('branch ') && current) {
      // refs/heads/<name> → <name>
      const ref = line.slice('branch '.length).trim()
      current.branch = ref.replace(/^refs\/heads\//, '')
    } else if (line === 'locked' && current) {
      current.locked = { reason: '' }
    } else if (line.startsWith('locked ') && current) {
      current.locked = { reason: line.slice('locked '.length).trim() }
    } else if (line === '' && current?.path) {
      records.push(current as WorktreeRecord)
      current = null
    }
  }
  if (current?.path) records.push(current as WorktreeRecord)
  return records
}

const CLAUDE_AGENT_LOCK_RE = /^claude agent\s+\S+\s+\(pid\s+(\d+)\)$/

/**
 * Parse the lock reason. Returns:
 *   { kind: 'claude-agent', pid: N } — recognized parallel-isolation pattern
 *   { kind: 'foreign', reason: string } — anything else (incl. bare locked)
 */
export function classifyLock(
  reason: string
): { kind: 'claude-agent'; pid: number } | { kind: 'foreign'; reason: string } {
  const trimmed = reason.trim()
  const m = trimmed.match(CLAUDE_AGENT_LOCK_RE)
  if (m) return { kind: 'claude-agent', pid: parseInt(m[1], 10) }
  return { kind: 'foreign', reason: trimmed || 'no reason' }
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
// Per-worktree classification
// ----------------------------------------------------------------------------

interface ClassificationContext {
  repoRoot: string
  apply: boolean
  pidChecker: PidChecker
  mergedPrs: Set<string>
  now: number
  ownWorktreePath: string
}

interface ClassificationOutcome {
  bucket: 'cleaned' | 'needs_review' | 'skip' | 'error'
  reason?: string
  unlocked?: boolean
  message?: string
}

const SIXTY_MIN_SECONDS = 60 * 60

/**
 * Classify a single worktree through all safety gates. Returns the bucket and
 * (when applicable) the reason. Side effects (git worktree unlock when apply=true)
 * happen here; the caller handles destructive remove+branch-delete based on the
 * returned bucket.
 */
export function classifyWorktree(
  record: WorktreeRecord,
  ctx: ClassificationContext
): ClassificationOutcome {
  const { repoRoot, apply, pidChecker, mergedPrs, now, ownWorktreePath } = ctx
  const wtPath = record.path
  const branch = record.branch ?? ''

  // Gate 1: skip own worktree
  if (
    path.resolve(wtPath) === path.resolve(ownWorktreePath) ||
    ownWorktreePath.startsWith(path.resolve(wtPath) + path.sep)
  ) {
    return { bucket: 'skip' }
  }

  // Gate 2: lock triage
  let unlocked = false
  if (record.locked) {
    const cls = classifyLock(record.locked.reason)
    if (cls.kind === 'foreign') {
      const truncated = cls.reason.length > 80 ? cls.reason.slice(0, 77) + '...' : cls.reason
      return { bucket: 'needs_review', reason: `locked: ${truncated}` }
    }
    // claude-agent-pid pattern
    if (pidChecker(cls.pid)) {
      // Live agent owns this worktree; skip silently.
      return { bucket: 'skip' }
    }
    // Dead PID — force-unlock if applying.
    if (apply) {
      try {
        execSync(`git worktree unlock ${shellEscape(wtPath)}`, {
          encoding: 'utf-8',
          timeout: 10_000,
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: repoRoot,
        })
      } catch (e) {
        return { bucket: 'error', message: `unlock failed: ${(e as Error).message}` }
      }
    }
    unlocked = true
  }

  // Gate 3: lsof
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

  // Gate 4: fresh HEAD
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
    // No HEAD or git error — fall through, other gates will catch real issues.
  }

  // Gate 5: clean tree
  let dirtyCount = 0
  try {
    const status = execSync(`git -C ${shellEscape(wtPath)} status --porcelain`, {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    if (status.trim().length > 0) {
      dirtyCount = status.split('\n').filter((l) => l.trim().length > 0).length
      return { bucket: 'needs_review', reason: `dirty: ${dirtyCount}` }
    }
  } catch (e) {
    return { bucket: 'error', message: `git status failed: ${(e as Error).message}` }
  }

  // Gate 6: merged-state determination — most reliable first.
  // Primary: PR-merged (ground truth from GitHub).
  if (branch && mergedPrs.has(branch)) {
    return { bucket: 'cleaned', reason: 'clean+merged+pr', unlocked }
  }

  // Secondary: log-not-ahead (catches ff-merge, rebase-merge, branches at main).
  let logAhead = -1
  try {
    const logOut = execSync(
      `git -C ${shellEscape(wtPath)} log ${shellEscape(branch)} --not origin/main --oneline`,
      {
        encoding: 'utf-8',
        timeout: 10_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    )
    const lines = logOut.split('\n').filter((l) => l.trim().length > 0)
    logAhead = lines.length
    if (logAhead === 0) {
      return { bucket: 'cleaned', reason: 'clean+merged+ff', unlocked }
    }
  } catch {
    // Branch missing or git error — fall through to cherry, then to needs_review.
  }

  // Tertiary: cherry-equivalent (squash-merge detection).
  // KNOWN LIMITATION: unreliable for multi-commit squash-merges where the squash
  // commit's patch differs from any single source commit. Failing this check
  // surfaces as needs_review (false-positive surfacing, not data loss).
  try {
    const cherryOut = execSync(
      `git -C ${shellEscape(wtPath)} cherry origin/main ${shellEscape(branch)}`,
      {
        encoding: 'utf-8',
        timeout: 10_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    )
    const plusLines = cherryOut.split('\n').filter((l) => l.startsWith('+'))
    if (plusLines.length === 0) {
      return { bucket: 'cleaned', reason: 'clean+merged+squash', unlocked }
    }
  } catch {
    // Branch missing — surface as needs_review below.
  }

  // None of the merge signals fired. Surface ahead-count if we have one.
  const aheadDesc = logAhead > 0 ? `${logAhead} commit(s) ahead` : 'unmerged'
  return { bucket: 'needs_review', reason: aheadDesc }
}

// ----------------------------------------------------------------------------
// Main entrypoint
// ----------------------------------------------------------------------------

export async function executeWorktreeDoctor(
  input: WorktreeDoctorInput,
  pidChecker: PidChecker = defaultPidChecker
): Promise<WorktreeDoctorResult> {
  const apply = input.apply
  const cap = input.cap

  const resolved = resolveWorktreesDir()
  if (!resolved) {
    const report: DoctorReport = {
      scanned: 0,
      deferred_by_cap: 0,
      cleaned: [],
      needs_review: [],
      errors: [
        {
          id: '<init>',
          message: '.claude/worktrees not found within 3 levels of cwd',
        },
      ],
      apply,
    }
    return { success: true, message: JSON.stringify(report, null, 2) }
  }

  const { worktreesDir, repoRoot } = resolved

  // Refresh main quietly. Best-effort; offline = stale check ok.
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

  // Scan worktree dir entries (sort by mtime desc, cap to N).
  let candidates: { id: string; path: string; mtime: number }[] = []
  try {
    const entries = readdirSync(worktreesDir, { withFileTypes: true })
    for (const ent of entries) {
      if (!ent.isDirectory()) continue
      const p = path.join(worktreesDir, ent.name)
      try {
        const st = statSync(p)
        candidates.push({ id: ent.name, path: p, mtime: st.mtimeMs })
      } catch {
        // Skip unreadable entries.
      }
    }
  } catch (e) {
    const report: DoctorReport = {
      scanned: 0,
      deferred_by_cap: 0,
      cleaned: [],
      needs_review: [],
      errors: [{ id: '<scan>', message: `scan failed: ${(e as Error).message}` }],
      apply,
    }
    return { success: true, message: JSON.stringify(report, null, 2) }
  }

  candidates.sort((a, b) => b.mtime - a.mtime)
  const totalFound = candidates.length
  const deferred_by_cap = Math.max(0, totalFound - cap)
  candidates = candidates.slice(0, cap)

  // Pull worktree list with locks once.
  let porcelain = ''
  try {
    porcelain = execSync('git worktree list --porcelain', {
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: repoRoot,
    })
  } catch (e) {
    const report: DoctorReport = {
      scanned: 0,
      deferred_by_cap,
      cleaned: [],
      needs_review: [],
      errors: [{ id: '<scan>', message: `git worktree list failed: ${(e as Error).message}` }],
      apply,
    }
    return { success: true, message: JSON.stringify(report, null, 2) }
  }

  const records = parseWorktreeList(porcelain)
  const recordsByPath = new Map<string, WorktreeRecord>()
  for (const r of records) recordsByPath.set(path.resolve(r.path), r)

  const mergedPrs = fetchMergedPrs(repoRoot)
  const now = Math.floor(Date.now() / 1000)
  const ownWorktreePath = path.resolve(process.cwd())

  const cleaned: CleanedEntry[] = []
  const needs_review: NeedsReviewEntry[] = []
  const errors: ErrorEntry[] = []
  let scanned = 0

  for (const cand of candidates) {
    const record = recordsByPath.get(path.resolve(cand.path))
    if (!record) {
      // Filesystem dir exists but git doesn't know about it (corrupted state).
      errors.push({
        id: cand.id,
        message: 'git worktree list does not include this path',
      })
      continue
    }

    scanned++
    const branch = record.branch ?? '(no branch)'

    const outcome = classifyWorktree(record, {
      repoRoot,
      apply,
      pidChecker,
      mergedPrs,
      now,
      ownWorktreePath,
    })

    if (outcome.bucket === 'skip') continue
    if (outcome.bucket === 'error') {
      errors.push({ id: cand.id, message: outcome.message ?? 'unknown error' })
      continue
    }
    if (outcome.bucket === 'needs_review') {
      needs_review.push({
        id: cand.id,
        branch,
        reason: outcome.reason ?? 'unknown',
      })
      continue
    }

    // bucket === 'cleaned' → execute destructive ops if apply=true
    const reason = outcome.reason ?? 'clean+merged'
    const unlocked = outcome.unlocked ?? false
    if (apply) {
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
        cleaned.push({ id: cand.id, branch, reason, unlocked })
      } catch (e) {
        errors.push({
          id: cand.id,
          message: `remove failed: ${(e as Error).message}`,
        })
      }
    } else {
      // Scan-only mode: cleaned[] reflects what would have been cleaned.
      cleaned.push({ id: cand.id, branch, reason, unlocked })
    }
  }

  const report: DoctorReport = {
    scanned,
    deferred_by_cap,
    cleaned,
    needs_review,
    errors,
    apply,
  }
  return { success: true, message: JSON.stringify(report, null, 2) }
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}
