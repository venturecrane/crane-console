/**
 * Auto-apply logic for crane_memory_audit:
 * - Promote eligible drafts (draft → stable)
 * - Auto-deprecate zero-usage memories
 */

import type { CraneApi } from '../../lib/crane-api.js'
import { extractBody, serializeFrontmatter } from '../memory.js'
import type { MemoryRecord, MemoryFrontmatter } from '../memory.js'
import type { SchemaGap, ZeroUsageEntry } from './types.js'
import { daysSince } from './checks.js'

interface AutoApplyResult {
  promoted: string[]
  deprecated_auto: string[]
  flagged: string[]
}

async function promoteEligibleDrafts(
  records: MemoryRecord[],
  schemaGaps: SchemaGap[],
  api: CraneApi,
  now: Date
): Promise<{ promoted: string[]; flagged: string[] }> {
  const promoted: string[] = []
  const flagged: string[] = []

  for (const r of records) {
    if (r.frontmatter.status !== 'draft') continue
    if (r.parse_error) continue
    if (schemaGaps.some((g) => g.id === r.id)) continue

    const hasSupersedesSource = (r.frontmatter.supersedes_source ?? []).length > 0
    const isOldEnough = daysSince(r.created_at, now) >= 14

    if (hasSupersedesSource || isOldEnough) {
      const fm = r.frontmatter
      const newFm: MemoryFrontmatter = { ...fm, status: 'stable' }
      const body = extractBody(r.raw_content ?? '')
      const content = `${serializeFrontmatter(newFm)}\n\n${body}`

      try {
        await api.updateNote(r.id, { content, title: fm.name })
        promoted.push(fm.name)
      } catch {
        flagged.push(`${fm.name}: failed to promote (API error)`)
      }
    }
  }

  return { promoted, flagged }
}

async function deprecateZeroUsage(
  zeroCandidates: ZeroUsageEntry[],
  recordById: Map<string, MemoryRecord>,
  api: CraneApi
): Promise<{ deprecated_auto: string[]; flagged: string[] }> {
  const deprecated_auto: string[] = []
  const flagged: string[] = []

  for (const entry of zeroCandidates) {
    const r = recordById.get(entry.id)
    if (!r) continue

    const fm = r.frontmatter
    const newFm: MemoryFrontmatter = { ...fm, status: 'deprecated' }
    const body = extractBody(r.raw_content ?? '')
    const content =
      `${serializeFrontmatter(newFm)}\n\n${body}\n\n` +
      `_Auto-deprecated: zero citations in 90 days with ${entry.surfaced_count} surfaces._`

    try {
      await api.updateNote(r.id, { content, title: fm.name })
      deprecated_auto.push(fm.name)
    } catch {
      flagged.push(`${fm.name}: failed to auto-deprecate (API error)`)
    }
  }

  return { deprecated_auto, flagged }
}

export interface AutoApplyInput {
  records: MemoryRecord[]
  recordById: Map<string, MemoryRecord>
  schemaGaps: SchemaGap[]
  zeroCandidates: ZeroUsageEntry[]
  api: CraneApi
  now: Date
}

export async function applyAutoChanges({
  records,
  recordById,
  schemaGaps,
  zeroCandidates,
  api,
  now,
}: AutoApplyInput): Promise<AutoApplyResult> {
  const promoteResult = await promoteEligibleDrafts(records, schemaGaps, api, now)
  const deprecateResult = await deprecateZeroUsage(zeroCandidates, recordById, api)

  return {
    promoted: promoteResult.promoted,
    deprecated_auto: deprecateResult.deprecated_auto,
    flagged: [...promoteResult.flagged, ...deprecateResult.flagged],
  }
}
