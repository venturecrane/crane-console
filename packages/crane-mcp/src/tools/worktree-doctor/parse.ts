/**
 * Parsing helpers for crane_worktree_doctor:
 *   - resolveWorktreesDir: walk up to find .claude/worktrees/
 *   - parseWorktreeList: parse `git worktree list --porcelain`
 *   - classifyLock: determine lock kind (claude-agent vs foreign)
 */

import { existsSync } from 'node:fs'
import path from 'node:path'
import type { WorktreeRecord } from './types.js'

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

/**
 * Apply one porcelain line to the current in-progress record.
 * Returns true if the record should be committed and reset (blank separator).
 */
function applyPorcelainLine(line: string, current: Partial<WorktreeRecord>): boolean {
  if (line.startsWith('HEAD ')) {
    current.head = line.slice('HEAD '.length).trim()
    return false
  }
  if (line.startsWith('branch ')) {
    const ref = line.slice('branch '.length).trim()
    current.branch = ref.replace(/^refs\/heads\//, '')
    return false
  }
  if (line === 'locked') {
    current.locked = { reason: '' }
    return false
  }
  if (line.startsWith('locked ')) {
    current.locked = { reason: line.slice('locked '.length).trim() }
    return false
  }
  // blank line = block separator
  return line === ''
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
      continue
    }
    if (!current) continue
    const flush = applyPorcelainLine(line, current)
    if (flush && current.path) {
      records.push(current as WorktreeRecord)
      current = null
    }
  }
  if (current?.path) records.push(current as WorktreeRecord)
  return records
}

// ----------------------------------------------------------------------------
// Lock classifier
// ----------------------------------------------------------------------------

/**
 * Locks written by Claude Code when a session enters a worktree.
 *
 * TWO SPELLINGS, BOTH LIVE. The original was `claude agent <name> (pid N)`.
 * Current harnesses write `claude session <name> (pid N start <ctime>)`:
 *
 *   claude session sos-2026-07-31 (pid 50065 start Fri Jul 31 15:33:23 2026)
 *
 * Matching only the first spelling is not a cosmetic miss. Every real lock
 * fell through to `foreign`, which routes to `needs_review` and SKIPS the
 * alive/dead-pid triage entirely — so the orphan backstop silently stopped
 * backstopping. Observed 2026-07-31 in ss-console: `/sos` reported four
 * locked worktrees and cleaned none, and one of them (pid 1712) died during
 * the session and stayed locked and unattended, which is exactly the case
 * the triage exists to catch. Every fixture in worktree-doctor.test.ts used
 * the synthetic first spelling, so CI was green against a format that no
 * longer occurs on disk.
 *
 * The trailing group is deliberately `[^)]*` rather than `start .*`: only the
 * pid is load-bearing, and a third spelling should degrade to a correct pid
 * rather than back to `foreign`.
 */
const CLAUDE_SESSION_LOCK_RE = /^claude (?:agent|session)\s+\S+\s+\(pid\s+(\d+)(?:\s+[^)]*)?\)$/

/**
 * Parse the lock reason. Returns:
 *   { kind: 'claude-agent', pid: N } — recognized parallel-isolation pattern
 *   { kind: 'foreign', reason: string } — anything else (incl. bare locked)
 */
export function classifyLock(
  reason: string
): { kind: 'claude-agent'; pid: number } | { kind: 'foreign'; reason: string } {
  const trimmed = reason.trim()
  const m = trimmed.match(CLAUDE_SESSION_LOCK_RE)
  if (m) return { kind: 'claude-agent', pid: parseInt(m[1], 10) }
  return { kind: 'foreign', reason: trimmed || 'no reason' }
}
