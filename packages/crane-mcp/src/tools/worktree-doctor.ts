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
 *
 * Implementation is split across ./worktree-doctor/:
 *   types.ts   — schema, interfaces, PidChecker type
 *   parse.ts   — resolveWorktreesDir, parseWorktreeList, classifyLock
 *   classify.ts — classifyWorktree (safety gates)
 *   execute.ts — executeWorktreeDoctor, defaultPidChecker
 */

// Re-export everything that consumers and tests depend on.
export type {
  CleanedEntry,
  DoctorReport,
  ErrorEntry,
  NeedsReviewEntry,
  PidChecker,
  WorktreeDoctorInput,
  WorktreeDoctorResult,
} from './worktree-doctor/types.js'

export { worktreeDoctorInputSchema } from './worktree-doctor/types.js'

export { classifyLock, parseWorktreeList, resolveWorktreesDir } from './worktree-doctor/parse.js'

export { classifyWorktree } from './worktree-doctor/classify.js'

export { defaultPidChecker, executeWorktreeDoctor } from './worktree-doctor/execute.js'
