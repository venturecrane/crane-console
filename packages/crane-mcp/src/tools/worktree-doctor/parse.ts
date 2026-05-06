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
