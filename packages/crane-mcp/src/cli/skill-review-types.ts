/**
 * skill-review-types - shared type definitions for the skill-review CLI.
 *
 * Extracted to avoid circular imports between sibling modules.
 */

export type Severity = 'error' | 'warning' | 'info'

export interface Violation {
  rule: string
  severity: Severity
  path: string
  line?: number
  message: string
  fix: string
}

export interface ReviewResult {
  skills_reviewed: number
  total_violations: number
  by_severity: Record<Severity, number>
  violations: Violation[]
}
