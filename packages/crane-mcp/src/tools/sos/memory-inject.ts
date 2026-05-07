/**
 * Memory injection helpers for the SOS tool.
 * Fetches captain-approved anti-patterns and context-matched lessons.
 */

import { type CraneApi } from '../../lib/crane-api.js'
import { getApiBase } from '../../lib/config.js'
import {
  validateAndBuildRecord,
  fetchAllMemories,
  scoreMemory,
  severityWeight,
  type MemoryRecord,
  type MemorySeverity,
} from '../memory.js'

// Fire-and-forget surfaced telemetry for injected memories. Sampling (1/10)
// is handled inside recordMemoryInvocation. Best-effort — never blocks SOS.
export async function recordMemorySurfaced(records: MemoryRecord[]): Promise<void> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) return
  const { CraneApi } = await import('../../lib/crane-api.js')
  const api = new CraneApi(apiKey, getApiBase())
  for (const r of records) {
    if (Math.random() >= 0.1) continue // 1/10 sampling
    try {
      await api.recordMemoryInvocation({
        memory_id: r.id,
        event: 'surfaced',
        venture: process.env.CRANE_VENTURE_CODE,
        repo: process.env.CRANE_REPO,
      })
    } catch {
      // best-effort
    }
  }
}

interface MemoryInjectionResult {
  criticalAntiPatterns: MemoryRecord[]
  relevantLessons: MemoryRecord[]
  memoryAuditDaysSince: number | null
}

function filterEligibleRecords(
  allRecords: MemoryRecord[],
  gate: string,
  ventureCode: string
): MemoryRecord[] {
  return allRecords.filter((r) => {
    if (r.parse_error || r.frontmatter.status === 'parse_error') return false
    if (r.frontmatter.status !== 'stable') return false
    const captainOk = !!r.frontmatter.captain_approved
    const injectableOk = !!r.injectable
    if (gate === 'captain_approved' && !captainOk) return false
    if (gate === 'injectable' && !injectableOk) return false
    if (gate === 'both' && !(captainOk && injectableOk)) return false
    const scope = r.frontmatter.scope
    return scope === 'enterprise' || scope === 'global' || scope === `venture:${ventureCode}`
  })
}

function buildAntiPatterns(eligible: MemoryRecord[]): MemoryRecord[] {
  const severityOrder: Record<string, number> = { P0: 3, P1: 2, P2: 1 }
  return eligible
    .filter((r) => r.frontmatter.kind === 'anti-pattern')
    .sort(
      (a, b) =>
        (severityOrder[b.frontmatter.severity ?? ''] ?? 0) -
        (severityOrder[a.frontmatter.severity ?? ''] ?? 0)
    )
}

function buildRelevantLessons(
  eligible: MemoryRecord[],
  ventureCode: string,
  fullRepo: string
): MemoryRecord[] {
  return eligible
    .filter((r) => r.frontmatter.kind === 'lesson')
    .map((r) => ({
      record: r,
      score:
        scoreMemory(r, { venture: ventureCode, repo: fullRepo }) +
        severityWeight(r.frontmatter.severity as MemorySeverity | undefined),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.record)
}

export async function fetchMemoryInjection(
  api: CraneApi,
  ventureCode: string,
  fullRepo: string
): Promise<MemoryInjectionResult> {
  const result: MemoryInjectionResult = {
    criticalAntiPatterns: [],
    relevantLessons: [],
    memoryAuditDaysSince: null,
  }

  try {
    const scheduleItems = await api.getScheduleItems().catch(() => ({ items: [] }))
    const auditItem = scheduleItems.items.find((i) => i.name === 'memory-audit')
    if (auditItem?.last_completed_at) {
      const then = new Date(auditItem.last_completed_at)
      result.memoryAuditDaysSince = Math.floor((Date.now() - then.getTime()) / 86_400_000)
    }

    // Only inject if audit is not >60 days overdue
    if (result.memoryAuditDaysSince !== null && result.memoryAuditDaysSince > 60) {
      return result
    }

    const allMemoryNotes = await fetchAllMemories(api, 'memory', 200)
    const allRecords = allMemoryNotes.map(validateAndBuildRecord)
    const gate = await api.getMemoryInjectionGate()
    const eligible = filterEligibleRecords(allRecords, gate, ventureCode)

    result.criticalAntiPatterns = buildAntiPatterns(eligible)
    result.relevantLessons = buildRelevantLessons(eligible, ventureCode, fullRepo)
  } catch {
    // Graceful degradation — memory system may not have data yet
  }

  return result
}
