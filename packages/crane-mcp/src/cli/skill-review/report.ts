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

export function aggregateResults(allViolations: Violation[], skillCount: number): ReviewResult {
  const by_severity: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const v of allViolations) {
    by_severity[v.severity]++
  }
  return {
    skills_reviewed: skillCount,
    total_violations: allViolations.length,
    by_severity,
    violations: allViolations,
  }
}

export function formatHuman(result: ReviewResult): string {
  const lines: string[] = []

  lines.push(
    `Reviewed ${result.skills_reviewed} skill(s) — ` +
      `${result.total_violations} violation(s) ` +
      `(${result.by_severity.error} error, ${result.by_severity.warning} warning, ${result.by_severity.info} info)`
  )

  if (result.violations.length === 0) {
    lines.push('All skills pass.')
    return lines.join('\n')
  }

  lines.push('')
  for (const v of result.violations) {
    lines.push(`${v.severity.toUpperCase()} [${v.rule}] ${v.path}: ${v.message}`)
    lines.push(`  Fix: ${v.fix}`)
  }

  return lines.join('\n')
}

export function formatJson(result: ReviewResult): string {
  return JSON.stringify(result, null, 2)
}
