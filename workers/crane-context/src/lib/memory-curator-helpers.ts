/**
 * Internal helpers for memory-curator.ts.
 * Not exported from the worker surface — imported only by memory-curator.ts.
 */

import type { Env, NoteRecord } from '../types'
import { parseFrontmatter } from './memory-curator'

type ContradictionResult = { score: 0 | 1; rationale: string; parse_error: boolean }

/** Build FTS5 OR expression from a memory name; returns empty string if no usable tokens. */
export function buildFtsExpr(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter((t) => t.length >= 3)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(' OR ')
}

/** Query top-1 FTS5 similar memory excluding self. Returns null on FTS unavailable. */
export async function queryTopFtsMatch(
  env: Env,
  ftsExpr: string,
  noteId: string
): Promise<NoteRecord | null | 'fts_unavailable'> {
  try {
    const result = await env.DB.prepare(
      `SELECT n.* FROM notes_fts JOIN notes n ON notes_fts.rowid = n.rowid
       WHERE notes_fts MATCH ? AND n.id != ?
         AND n.tags LIKE '%"memory"%'
       ORDER BY bm25(notes_fts) ASC LIMIT 1`
    )
      .bind(ftsExpr, noteId)
      .first<NoteRecord>()
    return result
  } catch {
    return 'fts_unavailable'
  }
}

/** Extract raw string from Workers AI response union. */
export function extractAiRaw(out: unknown): string {
  if (typeof out === 'object' && out !== null && 'response' in out) {
    return String((out as { response: unknown }).response ?? '')
  }
  if (typeof out === 'string') return out
  return JSON.stringify(out ?? '')
}

/** Parse first non-empty line of AI output into a contradiction result. */
export function parseAiFirstLine(raw: string): ContradictionResult {
  const firstLine = raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)[0]
  if (!firstLine) {
    return { score: 1, rationale: 'empty model output; fail-open', parse_error: true }
  }
  if (/^NO_CONTRADICTION\b/i.test(firstLine)) {
    return { score: 1, rationale: 'no contradiction detected', parse_error: false }
  }
  if (/^CONTRADICTS\b/i.test(firstLine)) {
    return { score: 0, rationale: firstLine.slice(0, 200), parse_error: false }
  }
  return {
    score: 1,
    rationale: `unparseable: ${firstLine.slice(0, 100)}; fail-open`,
    parse_error: true,
  }
}

/** Invoke Workers AI contradiction check between two memory bodies. Fail-open on error. */
export async function invokeAiContradiction(
  env: Env,
  bodyA: string,
  bodyB: string
): Promise<ContradictionResult> {
  if (!env.AI || typeof env.AI.run !== 'function') {
    return { score: 1, rationale: 'AI binding unavailable; skipped', parse_error: true }
  }
  const prompt = `Two engineering memories. Decide if memory A directly contradicts memory B
(i.e., following A would violate B, or vice versa). If they are merely
different/orthogonal, that is NOT a contradiction. Respond with exactly:
NO_CONTRADICTION
or
CONTRADICTS: <brief reason>

Memory A:
${bodyA.slice(0, 1500)}

Memory B:
${bodyB.slice(0, 1500)}
`
  let raw: string
  try {
    const out: unknown = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      prompt,
      max_tokens: 80,
    })
    raw = extractAiRaw(out)
  } catch {
    return { score: 1, rationale: 'AI invocation failed; fail-open', parse_error: true }
  }
  return parseAiFirstLine(raw)
}

type NoteReport = {
  memory_id: string
  scores: {
    schema_score: 0 | 1
    save_time_tests_score: 0 | 1
    contradiction_score: 0 | 1
    severity_validation_score: 0 | 1
    citation_health: 0 | 1
  }
  all_pass: boolean
  needs_captain_review: boolean
  curator_parse_error: boolean
  rationale: string
  promoted: boolean
  injectable_set: boolean
}

/** Persist the curator scores row for a memory. */
async function persistScoreRow(
  env: Env,
  report: NoteReport,
  curatorVersion: string,
  computedAt: string
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO memory_curator_scores (
        memory_id, schema_score, save_time_tests_score, contradiction_score,
        severity_validation_score, citation_health, all_pass,
        needs_captain_review, curator_parse_error,
        computed_at, curator_version, rationale
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        report.memory_id,
        report.scores.schema_score,
        report.scores.save_time_tests_score,
        report.scores.contradiction_score,
        report.scores.severity_validation_score,
        report.scores.citation_health,
        report.all_pass ? 1 : 0,
        report.needs_captain_review ? 1 : 0,
        report.curator_parse_error ? 1 : 0,
        computedAt,
        curatorVersion,
        report.rationale
      )
      .run()
  } catch {
    /* swallow */
  }
}

/** Flip injectable flag and promote draft->stable when all axes pass. */
async function applyPromotions(
  env: Env,
  note: NoteRecord,
  report: NoteReport,
  computedAt: string
): Promise<void> {
  if (report.all_pass && (note.injectable ?? 0) === 0) {
    try {
      await env.DB.prepare('UPDATE notes SET injectable = 1, updated_at = ? WHERE id = ?')
        .bind(computedAt, note.id)
        .run()
      report.injectable_set = true
    } catch {
      /* swallow */
    }
  }

  const parsed = parseFrontmatter(note.content)
  if (report.all_pass && parsed?.fields.status === 'draft') {
    const newContent = note.content.replace(/^(\s*status:\s*)draft/m, '$1stable')
    try {
      await env.DB.prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?')
        .bind(newContent, computedAt, note.id)
        .run()
      report.promoted = true
    } catch {
      /* swallow */
    }
  }
}

/**
 * Apply per-note DB mutations: flip injectable, promote draft->stable,
 * flag curator_parse_error, persist scores row.
 */
export async function applyNoteUpdates(
  env: Env,
  note: NoteRecord,
  report: NoteReport,
  curatorVersion: string,
  computedAt: string
): Promise<void> {
  await applyPromotions(env, note, report, computedAt)

  if (report.curator_parse_error) {
    try {
      await env.DB.prepare('UPDATE notes SET curator_parse_error = 1 WHERE id = ?')
        .bind(note.id)
        .run()
    } catch {
      /* swallow */
    }
  }

  await persistScoreRow(env, report, curatorVersion, computedAt)
}
