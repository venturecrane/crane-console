/**
 * Memory curator - daily 5-axis pass over memory-tagged notes.
 *
 * Replaces the human captain_approved gate with agent-judgable signals.
 * Captain may still flip captain_approved=true to force-pin; curator never
 * needs Captain action to promote drafts.
 *
 * Axes (each 0 or 1):
 *   1. schema_score - frontmatter parses; required fields present
 *   2. save_time_tests_score - 3 memoryability tests still hold
 *      (regex/length/structural; deterministic, no model)
 *   3. contradiction_score - top-1 FTS5-similar stable memory does not
 *      directly contradict (Workers AI; fail-open on parse error)
 *   4. severity_validation_score - frontmatter.severity matches /^P[012]$/
 *      for anti-patterns and is absent for other kinds (deterministic)
 *   5. citation_health - age <14d (grace) OR >=1 distinct session cited it
 *      OR severity=P0
 *
 * When all 5 pass: notes.injectable=1; status promoted draft -> stable.
 * needs_captain_review surfaces ambiguous cases (severity missing on AP);
 * curator_parse_error surfaces unparseable model outputs from axis 3.
 *
 * See plan: /Users/scottdurgan/.claude/plans/distributed-dreaming-swing.md
 */

import type { Env, NoteRecord } from '../types'
import { nowIso } from '../utils'
import {
  buildFtsExpr,
  queryTopFtsMatch,
  invokeAiContradiction,
  applyNoteUpdates,
} from './memory-curator-helpers'

const CURATOR_VERSION = '1.0.0'
const REQUIRED_FRONTMATTER = ['name', 'description', 'kind', 'scope', 'status']
const VALID_KINDS = ['lesson', 'anti-pattern', 'runbook', 'incident'] as const
const VALID_SEVERITY_REGEX = /^P[012]$/

export interface CuratorAxisScores {
  schema_score: 0 | 1
  save_time_tests_score: 0 | 1
  contradiction_score: 0 | 1
  severity_validation_score: 0 | 1
  citation_health: 0 | 1
}

export interface CuratorMemoryReport {
  memory_id: string
  scores: CuratorAxisScores
  all_pass: boolean
  needs_captain_review: boolean
  curator_parse_error: boolean
  rationale: string
  promoted: boolean
  injectable_set: boolean
}

export interface CuratorReport {
  curator_version: string
  computed_at: string
  total_memories: number
  all_pass_count: number
  needs_review_count: number
  parse_error_count: number
  per_memory: CuratorMemoryReport[]
}

interface ParsedFrontmatter {
  fields: Record<string, string>
  raw: string
  body: string
}

export function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content)
  if (!match) return null
  const fmText = match[1]
  const body = content.slice(match[0].length)
  const fields: Record<string, string> = {}
  for (const line of fmText.split('\n')) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim()
    let value = line.slice(colon + 1).trim()
    // Strip surrounding quotes on simple scalar values
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) fields[key] = value
  }
  return { fields, raw: fmText, body }
}

// Axis 1
function scoreSchema(parsed: ParsedFrontmatter | null): { score: 0 | 1; rationale: string } {
  if (!parsed) {
    return { score: 0, rationale: 'no frontmatter block' }
  }
  const missing = REQUIRED_FRONTMATTER.filter((f) => !parsed.fields[f])
  if (missing.length > 0) {
    return { score: 0, rationale: `missing required fields: ${missing.join(',')}` }
  }
  if (!VALID_KINDS.includes(parsed.fields.kind as (typeof VALID_KINDS)[number])) {
    return { score: 0, rationale: `invalid kind: ${parsed.fields.kind}` }
  }
  return { score: 1, rationale: 'schema valid' }
}

// Axis 2 - reproduces the save-time memoryability checks
function scoreSaveTimeTests(parsed: ParsedFrontmatter | null): {
  score: 0 | 1
  rationale: string
} {
  if (!parsed) return { score: 0, rationale: 'no frontmatter to evaluate body against' }
  const kind = parsed.fields.kind
  // Runbook and incident skip memoryability per existing save handler
  if (kind === 'runbook' || kind === 'incident') {
    return { score: 1, rationale: `${kind} skips memoryability checks` }
  }
  const body = parsed.body.trim()
  if (body.length < 20) {
    return { score: 0, rationale: 'body shorter than 20 chars' }
  }
  // Actionable: imperative-shape detection. Match an imperative verb
  // anywhere near the start. Cheap heuristic; matches the save-time check.
  const startsImperative =
    /\b(?:always|never|don'?t|do not|use|run|verify|check|prefer|avoid|fix|skip|cap|kill|own|measure|require|treat|invoke|gate|emit|halt|surface|wait|read|write|commit|push|deploy|rebase|stash)\b/i.test(
      body.slice(0, 200)
    )
  if (!startsImperative) {
    return { score: 0, rationale: 'body does not begin with imperative verb pattern' }
  }
  return { score: 1, rationale: 'save-time tests pass' }
}

// Axis 3 - top-1 FTS5 similar stable other memory; ask Workers AI if it
// directly contradicts. Fail-open on parse error.
async function scoreContradiction(
  env: Env,
  note: NoteRecord
): Promise<{ score: 0 | 1; rationale: string; parse_error: boolean }> {
  const parsed = parseFrontmatter(note.content)
  if (!parsed || parsed.fields.status !== 'stable') {
    return { score: 1, rationale: 'skipped (not stable)', parse_error: false }
  }

  const ftsExpr = buildFtsExpr(parsed.fields.name)
  if (!ftsExpr) {
    return { score: 1, rationale: 'no usable tokens for similarity check', parse_error: false }
  }

  const topMatch = await queryTopFtsMatch(env, ftsExpr, note.id)
  if (topMatch === 'fts_unavailable') {
    return { score: 1, rationale: 'FTS5 unavailable; skipped', parse_error: false }
  }
  if (!topMatch) {
    return { score: 1, rationale: 'no similar memory found', parse_error: false }
  }

  const otherParsed = parseFrontmatter(topMatch.content)
  if (!otherParsed || otherParsed.fields.status === 'deprecated') {
    return { score: 1, rationale: 'similar memory deprecated or unparseable', parse_error: false }
  }

  return invokeAiContradiction(env, parsed.body, otherParsed.body)
}

// Axis 4 - severity declared correctly per kind (deterministic)
function scoreSeverityValidation(parsed: ParsedFrontmatter | null): {
  score: 0 | 1
  rationale: string
  needs_review: boolean
} {
  if (!parsed) return { score: 0, rationale: 'no frontmatter', needs_review: false }
  const kind = parsed.fields.kind
  const severity = parsed.fields.severity
  if (kind === 'anti-pattern') {
    if (!severity) {
      return {
        score: 0,
        rationale: 'anti-pattern missing severity',
        needs_review: true,
      }
    }
    if (!VALID_SEVERITY_REGEX.test(severity)) {
      return { score: 0, rationale: `invalid severity ${severity}`, needs_review: true }
    }
    return { score: 1, rationale: 'severity valid', needs_review: false }
  }
  // Other kinds: severity should be absent (or empty)
  if (severity) {
    return {
      score: 0,
      rationale: `severity present on non-anti-pattern (kind=${kind})`,
      needs_review: true,
    }
  }
  return { score: 1, rationale: 'severity absent (correct for kind)', needs_review: false }
}

// Axis 5 - citation health
async function scoreCitationHealth(
  env: Env,
  note: NoteRecord,
  parsed: ParsedFrontmatter | null
): Promise<{ score: 0 | 1; rationale: string }> {
  // Grace period: < 14 days old
  const created = new Date(note.created_at).getTime()
  const ageMs = Date.now() - created
  if (ageMs < 14 * 86_400_000) {
    return { score: 1, rationale: `grace period (age ${Math.round(ageMs / 86_400_000)}d)` }
  }
  // P0 anti-patterns always pass
  if (parsed?.fields.severity === 'P0') {
    return { score: 1, rationale: 'P0 anti-pattern auto-passes citation health' }
  }
  // At least 1 distinct session cited
  try {
    const result = await env.DB.prepare(
      `SELECT COUNT(DISTINCT session_id) as n FROM memory_invocations
       WHERE memory_id = ? AND event = 'cited' AND session_id IS NOT NULL`
    )
      .bind(note.id)
      .first<{ n: number }>()
    if (result && result.n > 0) {
      return { score: 1, rationale: `${result.n} distinct sessions cited` }
    }
  } catch {
    return { score: 0, rationale: 'citation query failed' }
  }
  return { score: 0, rationale: 'no citations and past grace period' }
}

export async function curateMemory(env: Env, note: NoteRecord): Promise<CuratorMemoryReport> {
  const parsed = parseFrontmatter(note.content)

  const schema = scoreSchema(parsed)
  const saveTime = scoreSaveTimeTests(parsed)
  const contradiction = await scoreContradiction(env, note)
  const severity = scoreSeverityValidation(parsed)
  const citation = await scoreCitationHealth(env, note, parsed)

  const scores: CuratorAxisScores = {
    schema_score: schema.score,
    save_time_tests_score: saveTime.score,
    contradiction_score: contradiction.score,
    severity_validation_score: severity.score,
    citation_health: citation.score,
  }

  const all_pass =
    scores.schema_score === 1 &&
    scores.save_time_tests_score === 1 &&
    scores.contradiction_score === 1 &&
    scores.severity_validation_score === 1 &&
    scores.citation_health === 1

  const needs_captain_review = severity.needs_review

  const rationale = [
    `schema: ${schema.rationale}`,
    `save_time: ${saveTime.rationale}`,
    `contradiction: ${contradiction.rationale}`,
    `severity: ${severity.rationale}`,
    `citation: ${citation.rationale}`,
  ].join(' | ')

  return {
    memory_id: note.id,
    scores,
    all_pass,
    needs_captain_review,
    curator_parse_error: contradiction.parse_error,
    rationale,
    promoted: false,
    injectable_set: false,
  }
}

export async function runMemoryCurator(env: Env): Promise<CuratorReport> {
  const computed_at = nowIso()
  const result = await env.DB.prepare(
    `SELECT * FROM notes WHERE archived = 0 AND tags LIKE '%"memory"%' LIMIT 500`
  ).all<NoteRecord>()
  const notes = result.results || []

  const per_memory: CuratorMemoryReport[] = []

  for (const note of notes) {
    const report = await curateMemory(env, note)
    await applyNoteUpdates(env, note, report, CURATOR_VERSION, computed_at)
    per_memory.push(report)
  }

  return {
    curator_version: CURATOR_VERSION,
    computed_at,
    total_memories: per_memory.length,
    all_pass_count: per_memory.filter((r) => r.all_pass).length,
    needs_review_count: per_memory.filter((r) => r.needs_captain_review).length,
    parse_error_count: per_memory.filter((r) => r.curator_parse_error).length,
    per_memory,
  }
}
