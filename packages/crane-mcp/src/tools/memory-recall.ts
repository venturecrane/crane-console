/**
 * memory-recall.ts — Scoring, glob matching, memoryability checks,
 * and recall/context-mode logic for crane_memory.
 * Split from memory.ts to satisfy line/complexity ESLint ceilings.
 */

import type { CraneApi } from '../lib/crane-api.js'
import type { MemoryRecord, MemoryKind, MemorySeverity } from './memory-frontmatter.js'
import { validateAndBuildRecord } from './memory-frontmatter.js'

// ---------------------------------------------------------------------------
// Memoryability tests (enforced for lesson and anti-pattern kinds)
// ---------------------------------------------------------------------------

export interface MemoryabilityResult {
  ok: boolean
  failed_test?: string
  warning?: string
}

const IMPERATIVE_PATTERN =
  /\b(always|never|use|avoid|run|call|prefer|check|ensure|set|add|pass|require|must|do not|don['']t|stop|start)\b/i
const ONE_OFF_PATTERN = /\b(PR#?\d+|commit [0-9a-f]{7,40}|issue #?\d+)\b/i
const GENERAL_RULE_PATTERN = /\b(when|whenever|any|all|every|pattern|class|case)\b/i

function checkActionable(body: string): MemoryabilityResult | null {
  if (!IMPERATIVE_PATTERN.test(body)) {
    return {
      ok: false,
      failed_test:
        'Actionable: body must contain an imperative verb or "do not" pattern. Memories tell future agents what to do or avoid.',
    }
  }
  return null
}

function checkNonObvious(
  body: string,
  existingNames: string[],
  candidateName: string
): MemoryabilityResult | null {
  if (body.trim().length < 40) {
    return {
      ok: false,
      failed_test:
        'Non-obvious: body is too short (<40 chars). Expand with context that makes this non-obvious.',
    }
  }
  if (existingNames.includes(candidateName)) {
    return {
      ok: false,
      failed_test: `Non-obvious: a memory named "${candidateName}" already exists. Use a unique name or update the existing memory.`,
    }
  }
  return null
}

function checkGeneralEnough(body: string): MemoryabilityResult | null {
  if (ONE_OFF_PATTERN.test(body) && !GENERAL_RULE_PATTERN.test(body)) {
    return {
      ok: true,
      warning:
        'General-enough: body references a one-off identifier (PR/commit/issue) without stating a general rule. Consider generalizing.',
    }
  }
  return null
}

export function checkMemoryability(
  body: string,
  kind: MemoryKind,
  existingNames: string[],
  candidateName: string
): MemoryabilityResult {
  if (kind !== 'lesson' && kind !== 'anti-pattern') {
    return { ok: true }
  }

  const actionableResult = checkActionable(body)
  if (actionableResult) return actionableResult

  const nonObviousResult = checkNonObvious(body, existingNames, candidateName)
  if (nonObviousResult) return nonObviousResult

  const generalEnoughResult = checkGeneralEnough(body)
  if (generalEnoughResult) return generalEnoughResult

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Scoring for recall
// ---------------------------------------------------------------------------

export interface RecallContext {
  venture?: string
  repo?: string
  files?: string[]
  commands?: string[]
  skills?: string[]
}

/**
 * Glob match without dynamic RegExp (avoids ReDoS). Supports simple patterns:
 *   - "foo"      → exact match on basename or full path suffix
 *   - "foo*"     → prefix match (e.g., ".infisical*" matches ".infisical.json")
 *   - "*.foo"    → suffix match (e.g., "*.toml" matches "wrangler.toml")
 *   - "*foo*"    → substring match
 * Pattern is matched against both the full path and its basename.
 */
export function globMatchSimple(pattern: string, path: string): boolean {
  const basename = path.split('/').pop() ?? path
  const targets = [path, basename]

  if (!pattern.includes('*')) {
    return targets.some((t) => t === pattern || t.endsWith('/' + pattern))
  }

  const startsWithStar = pattern.startsWith('*')
  const endsWithStar = pattern.endsWith('*')
  const core = pattern.slice(startsWithStar ? 1 : 0, endsWithStar ? -1 : undefined)

  for (const t of targets) {
    if (startsWithStar && endsWithStar) {
      if (t.includes(core)) return true
    } else if (startsWithStar) {
      if (t.endsWith(core)) return true
    } else if (endsWithStar) {
      if (t.startsWith(core)) return true
    } else {
      if (t === pattern) return true
    }
  }
  return false
}

function scoreFiles(ctxFiles: string[], awFiles: string[]): number {
  let score = 0
  for (const pattern of awFiles) {
    if (ctxFiles.some((f) => globMatchSimple(pattern, f))) {
      score += 1
    }
  }
  return score
}

export function scoreMemory(record: MemoryRecord, ctx: RecallContext): number {
  const aw = record.frontmatter.applies_when
  if (!aw) return 1

  let score = 0

  if (ctx.commands?.length && aw.commands?.length) {
    score += ctx.commands.filter((c) => aw.commands!.includes(c)).length * 3
  }

  if (ctx.skills?.length && aw.skills?.length) {
    score += ctx.skills.filter((s) => aw.skills!.includes(s)).length * 2
  }

  if (ctx.files?.length && aw.files?.length) {
    score += scoreFiles(ctx.files, aw.files)
  }

  return score
}

export function severityWeight(severity?: MemorySeverity): number {
  if (severity === 'P0') return 100
  if (severity === 'P1') return 10
  return 1
}

// ---------------------------------------------------------------------------
// Scope filter helper
// ---------------------------------------------------------------------------

function matchesScope(record: MemoryRecord, ventureCode: string | undefined): boolean {
  const scope = record.frontmatter.scope
  if (scope === 'enterprise' || scope === 'global') return true
  if (ventureCode && scope === `venture:${ventureCode}`) return true
  return false
}

// ---------------------------------------------------------------------------
// FTS5 query-mode recall
// ---------------------------------------------------------------------------

interface QueryRecallOptions {
  tag: string
  query: string
  limit: number
  captainApprovedOnly: boolean
  ventureCode: string | undefined
  ctx: RecallContext
}

export async function recallByQuery(
  api: CraneApi,
  opts: QueryRecallOptions
): Promise<MemoryRecord[]> {
  const { tag, query, limit, captainApprovedOnly, ventureCode, ctx } = opts
  const fetchLimit = Math.min(Math.max(limit * 3, 15), 50)
  const result = await api.listNotes({ tag, q: query, limit: fetchLimit })
  const records = result.notes.map(validateAndBuildRecord)

  const filtered = records.filter((r) => {
    if (r.parse_error || r.frontmatter.status === 'parse_error') return false
    if (r.frontmatter.status === 'deprecated') return false
    if (captainApprovedOnly && !r.frontmatter.captain_approved) return false
    return matchesScope(r, ventureCode)
  })

  const scored = filtered.map((r, ftsIdx) => {
    const ftsRank = 1 / (ftsIdx + 1)
    const appliesScore = scoreMemory(r, ctx)
    const sevWeight = severityWeight(r.frontmatter.severity) / 100
    const hybrid = 0.4 * ftsRank + 0.3 * appliesScore + 0.3 * sevWeight
    return { record: r, score: hybrid }
  })

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.record)
}

// ---------------------------------------------------------------------------
// Context-only (legacy) recall
// ---------------------------------------------------------------------------

interface ContextRecallOptions {
  tag: string
  limit: number
  captainApprovedOnly: boolean
  ventureCode: string | undefined
  ctx: RecallContext
}

export async function recallByContext(
  api: CraneApi,
  opts: ContextRecallOptions
): Promise<MemoryRecord[]> {
  const { tag, limit, captainApprovedOnly, ventureCode, ctx } = opts
  const result = await api.listNotes({ tag, limit: 100 })
  const records = result.notes.map(validateAndBuildRecord)

  const filtered = records.filter((r) => {
    if (r.parse_error || r.frontmatter.status === 'parse_error') return false
    if (r.frontmatter.status === 'deprecated') return false
    if (r.frontmatter.status === 'draft') return false
    if (captainApprovedOnly && !r.frontmatter.captain_approved) return false
    return matchesScope(r, ventureCode)
  })

  return filtered
    .map((r) => ({
      record: r,
      score: scoreMemory(r, ctx) + severityWeight(r.frontmatter.severity),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.record)
}

// ---------------------------------------------------------------------------
// Best-effort surfaced telemetry
// ---------------------------------------------------------------------------

export function fireSurfacedTelemetry(
  api: CraneApi,
  candidates: MemoryRecord[],
  ventureCode: string | undefined,
  repo: string | undefined
): void {
  for (const r of candidates) {
    try {
      void Promise.resolve(
        api.recordMemoryInvocation({
          memory_id: r.id,
          event: 'surfaced',
          venture: ventureCode,
          repo,
        })
      ).catch(() => {})
    } catch {
      // best-effort
    }
  }
}
