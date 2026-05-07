/**
 * Content sections (cadence, memory, enterprise context, doc audit, health checks)
 * for the SOS message builder.
 */

import { type DocAuditResult, type ScheduleBriefingResponse } from '../../lib/crane-api.js'
import { truncate, formatTruthfulCount } from '../../lib/truthful-display.js'
import { type HealthCheckResult, formatHealthCheckSection } from '../../lib/health-checks.js'
import { type MemoryRecord } from '../memory.js'
import { calendarDaysSince, formatAgeDays } from './format-helpers.js'
import { type HealingResults } from './doc-heal.js'
import { recordMemorySurfaced } from './memory-inject.js'

export function renderCadenceBlock(scheduleBriefing: ScheduleBriefingResponse): string {
  if (scheduleBriefing.items.length === 0) return ''

  const MAX_CADENCE_ITEMS = 5
  const actionHints: Record<string, string> = {
    'portfolio-review': '/portfolio-review',
    'fleet-health': 'scripts/fleet-health.sh',
    'command-sync': 'scripts/sync-commands.sh --fleet',
    'code-review-vc': '/code-review',
    'code-review-ke': '/code-review',
    'code-review-dfg': '/code-review',
    'code-review-sc': '/code-review',
    'code-review-dc': '/code-review',
    'enterprise-review': '/enterprise-review',
    'dependency-freshness': 'npm audit / npm outdated',
    'secrets-rotation-review': 'docs/infra/secrets-rotation-runbook.md',
    'context-refresh': '/context-refresh',
  }

  const sorted = [...scheduleBriefing.items].sort((a, b) => a.priority - b.priority)
  const actionable = sorted.filter((i) => i.status === 'overdue' || i.status === 'due')
  const untracked = sorted.filter((i) => i.status === 'untracked')
  const toShow =
    actionable.length < 3
      ? [...actionable, ...untracked].slice(0, MAX_CADENCE_ITEMS)
      : actionable.slice(0, MAX_CADENCE_ITEMS)

  if (toShow.length === 0) {
    return `## Cadence\n\nAll current. Full list: \`crane_schedule(action: 'list')\`\n\n`
  }

  let out = `## Cadence\n\n`
  out += `| Priority | Item | Status | Days Ago | Action |\n`
  out += `|----------|------|--------|----------|--------|\n`

  for (const item of toShow) {
    const priority =
      item.priority === 0
        ? 'P0'
        : item.priority === 1
          ? 'HIGH'
          : item.priority === 2
            ? 'NORMAL'
            : 'LOW'
    const status = item.status.toUpperCase()
    const daysAgo = item.days_since !== null ? String(item.days_since) : 'never'
    const action = actionHints[item.name] ?? item.name
    out += `| ${priority} | ${item.title} | ${status} | ${daysAgo} | ${action} |\n`
  }

  const parts: string[] = []
  if (scheduleBriefing.overdue_count > 0) parts.push(`${scheduleBriefing.overdue_count} overdue`)
  if (scheduleBriefing.due_count > 0) parts.push(`${scheduleBriefing.due_count} due`)
  if (parts.length > 0) out += `\n${parts.join(', ')}`

  const cadenceTruncated = truncate(toShow, scheduleBriefing.items.length)
  out += parts.length > 0 ? ' | ' : '\n'
  out += `${formatTruthfulCount(cadenceTruncated, 'cadence item(s)', { hint: `run \`crane_schedule(action: 'list')\`` })}`
  out += '\n\n'
  return out
}

export function renderMemoryBlock(params: {
  criticalAntiPatterns?: MemoryRecord[]
  relevantLessons?: MemoryRecord[]
  memoryAuditDaysSince?: number | null
}): string {
  const { criticalAntiPatterns, relevantLessons, memoryAuditDaysSince } = params
  const auditOverdueDays = memoryAuditDaysSince ?? null

  if (auditOverdueDays !== null && auditOverdueDays > 60) {
    return `## Critical Anti-Patterns\n\nMemory system unaudited for ${auditOverdueDays} days. Anti-pattern injection paused. Run \`/memory-audit\`.\n\n`
  }

  let out = ''
  if (auditOverdueDays !== null && auditOverdueDays > 30) {
    out += `> **Memory system unaudited for ${auditOverdueDays} days** — run \`/memory-audit\`.\n\n`
  }

  if (criticalAntiPatterns && criticalAntiPatterns.length > 0) {
    const ANTI_PATTERN_CAP = 5
    const toShow = criticalAntiPatterns.slice(0, ANTI_PATTERN_CAP)
    const overflow = criticalAntiPatterns.length - ANTI_PATTERN_CAP
    out += `## Critical Anti-Patterns\n\n`
    for (const m of toShow) {
      const fm = m.frontmatter
      const severityLabel = fm.severity ? `[${fm.severity}] ` : ''
      out += `- ${severityLabel}**${fm.name}**: ${fm.description}\n`
    }
    if (overflow > 0) {
      out += `- _+${overflow} more: \`crane_memory(action: 'list', kind: 'anti-pattern')\`_\n`
    }
    out += '\n'
    void recordMemorySurfaced(toShow)
  }

  if (relevantLessons && relevantLessons.length > 0) {
    out += `## Relevant Lessons\n\n`
    for (const m of relevantLessons) {
      const fm = m.frontmatter
      out += `- **${fm.name}**: ${fm.description}\n`
    }
    out += '\n'
    void recordMemorySurfaced(relevantLessons)
  }

  return out
}

export function renderEnterpriseContextBlock(params: {
  rawEcNotes: Array<{
    id: string
    title: string | null
    content: string
    tags: string | null
    venture: string | null
    archived: number
    created_at: string
    updated_at: string
    actor_key_id: string | null
    meta_json: string | null
  }>
  ventureCode: string
}): string {
  const { rawEcNotes, ventureCode } = params
  const ecNotes = rawEcNotes
    .filter((n) => n.venture === ventureCode)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  if (ecNotes.length === 0) return ''

  let out = `## Enterprise Context\n\n`
  const primary = ecNotes[0]
  out += `**${primary.title || '(untitled)'}**\n\n`

  const EC_PREVIEW_LIMIT = 800
  const totalChars = primary.content.length
  if (totalChars <= EC_PREVIEW_LIMIT) {
    out += `${primary.content}\n\n`
  } else {
    const totalKb = Math.round(totalChars / 1024)
    out += `${primary.content.slice(0, EC_PREVIEW_LIMIT)}\n\n`
    out += `_[Showing first ${EC_PREVIEW_LIMIT} of ${totalChars.toLocaleString()} chars (~${totalKb} KB). Full: \`crane_notes(q: "${primary.title || primary.id}")\`]_\n\n`
  }

  const ecAge = calendarDaysSince(new Date(primary.updated_at))
  if (ecAge > 30) {
    out += `**Executive summary is ${formatAgeDays(ecAge)}.** Run \`/context-refresh\` to update.\n\n`
  }

  out += `Full: \`crane_notes(tag: 'executive-summary', venture: '${ventureCode}')\`\n\n`

  if (rawEcNotes.some((n) => n.venture !== ventureCode)) {
    out += `Other ventures: \`crane_notes(tag: 'executive-summary')\`\n\n`
  }
  return out
}

function renderFullDocAudit(healingResults: HealingResults, docAudit?: DocAuditResult): string {
  let out = ''
  if (healingResults.generated.length > 0) {
    out += `### Documentation (self-healed)\n`
    for (const doc of healingResults.generated) {
      out += `- Generated: ${doc}\n`
    }
    out += '\n'
  }
  if (healingResults.failed.length > 0) {
    out += `### Missing Documentation (auto-generation failed)\n`
    for (const { doc, reason } of healingResults.failed) {
      out += `- ${doc}: ${reason}\n`
    }
    out += '\n'
  }
  if (docAudit && docAudit.stale.length > 0) {
    const unhealable = docAudit.stale.filter((d) => !d.auto_generate)
    if (unhealable.length > 0) {
      out += `### Stale Documentation (manual update needed)\n`
      for (const doc of unhealable) {
        out += `- ${doc.doc_name} (${doc.days_since_update} days old, threshold: ${doc.staleness_threshold_days})\n`
      }
      out += '\n'
    }
  }
  return out
}

export function renderDocAuditBlock(params: {
  healingResults: HealingResults
  docAudit?: DocAuditResult
  isFleet: boolean
}): string {
  const { healingResults, docAudit, isFleet } = params

  if (!isFleet) {
    return renderFullDocAudit(healingResults, docAudit)
  }

  if (docAudit) {
    const missing = docAudit.missing?.length ?? 0
    const stale = docAudit.stale?.length ?? 0
    if (missing > 0 || stale > 0) {
      return `Docs: ${missing} missing, ${stale} stale. Run \`crane_doc_audit()\` for details.\n\n`
    }
  }
  return ''
}

export function renderHealthChecksBlock(healthCheckResults?: HealthCheckResult[]): string {
  if (!healthCheckResults || healthCheckResults.length === 0) return ''
  return formatHealthCheckSection(healthCheckResults)
}
