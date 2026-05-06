/**
 * Shared types for crane_worktree_doctor.
 */

import { z } from 'zod'

// ----------------------------------------------------------------------------
// Schema + input types
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

// ----------------------------------------------------------------------------
// Result types
// ----------------------------------------------------------------------------

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
// Internal types
// ----------------------------------------------------------------------------

export interface WorktreeRecord {
  path: string
  head?: string
  branch?: string
  locked?: { reason: string }
}

export interface ClassificationContext {
  repoRoot: string
  apply: boolean
  pidChecker: PidChecker
  mergedPrs: Set<string>
  now: number
  ownWorktreePath: string
}

export interface ClassificationOutcome {
  bucket: 'cleaned' | 'needs_review' | 'skip' | 'error'
  reason?: string
  unlocked?: boolean
  message?: string
}

export type PidChecker = (pid: number) => boolean
