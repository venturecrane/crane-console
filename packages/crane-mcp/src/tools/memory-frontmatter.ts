/**
 * memory-frontmatter.ts — Types, parsing, validation, and serialization
 * for crane_memory frontmatter. Split from memory.ts to satisfy line/
 * complexity ESLint ceilings.
 */

import matter from 'gray-matter'
import type { Note } from '../lib/crane-api.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryKind = 'lesson' | 'anti-pattern' | 'runbook' | 'incident'
export type MemoryScope = 'enterprise' | 'global' | `venture:${string}`
export type MemoryStatus = 'draft' | 'stable' | 'deprecated' | 'parse_error'
export type MemorySeverity = 'P0' | 'P1' | 'P2'

export interface MemoryFrontmatter {
  name: string
  description: string
  kind: MemoryKind
  scope: MemoryScope
  owner: string
  status: MemoryStatus
  captain_approved: boolean
  version: string
  severity?: MemorySeverity
  applies_when?: {
    commands?: string[]
    files?: string[]
    skills?: string[]
  }
  supersedes?: string[]
  supersedes_source?: string[]
  last_validated_on?: string
}

export interface MemoryRecord {
  id: string
  frontmatter: MemoryFrontmatter
  body: string
  created_at: string
  updated_at: string
  title: string | null
  venture: string | null
  parse_error?: boolean
  raw_content?: string
  // Curator-set flag mirrored from notes.injectable (PR 2). The SOS
  // gate reads this when MEMORY_INJECTION_GATE is 'injectable' or 'both'.
  injectable?: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REQUIRED_MEMORY_FIELDS = ['name', 'description', 'kind', 'scope', 'status'] as const

export const VALID_KINDS: MemoryKind[] = ['lesson', 'anti-pattern', 'runbook', 'incident']
export const VALID_SCOPES = ['enterprise', 'global']

// ---------------------------------------------------------------------------
// Internal raw frontmatter type
// ---------------------------------------------------------------------------

export interface RawFrontmatter {
  name?: string
  description?: string
  kind?: string
  scope?: string
  owner?: string
  status?: string
  captain_approved?: boolean
  version?: string
  severity?: string
  applies_when?: {
    commands?: string[]
    files?: string[]
    skills?: string[]
  }
  supersedes?: string[]
  supersedes_source?: string[]
  last_validated_on?: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Array/date coercion helpers
// ---------------------------------------------------------------------------

// Coerce parsed YAML values to a string array. gray-matter returns proper arrays;
// the simple-YAML fallback returns the literal string "[]" — without coercion,
// downstream `.join()` calls crash on it (#829).
export function asStringArray(v: unknown): string[] | undefined {
  if (v === undefined || v === null) return undefined
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  return []
}

// gray-matter parses ISO date scalars as Date objects; downstream code template-strings
// the value back into YAML, which would emit `Wed May 06 2026 ...`. Normalize to YYYY-MM-DD.
export function asISODateString(v: unknown): string | undefined {
  if (typeof v === 'string') return v
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().split('T')[0]
  return undefined
}

// ---------------------------------------------------------------------------
// Frontmatter normalization
// ---------------------------------------------------------------------------

export function normalizeFrontmatter(raw: RawFrontmatter): RawFrontmatter {
  const out: RawFrontmatter = { ...raw }
  const supersedes = asStringArray(raw.supersedes)
  const supersedesSource = asStringArray(raw.supersedes_source)
  const lastValidated = asISODateString(raw.last_validated_on)
  if (supersedes !== undefined) out.supersedes = supersedes
  else delete out.supersedes
  if (supersedesSource !== undefined) out.supersedes_source = supersedesSource
  else delete out.supersedes_source
  if (lastValidated !== undefined) out.last_validated_on = lastValidated
  else delete out.last_validated_on
  return out
}

// ---------------------------------------------------------------------------
// Simple YAML fallback parser (used when gray-matter throws)
// ---------------------------------------------------------------------------

function parseArrayValue(rawVal: string): string[] {
  const arrayMatch = rawVal.match(/^\[(.*)\]$/)
  if (!arrayMatch) return []
  return arrayMatch[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

function parseScalarValue(rawVal: string): unknown {
  if (rawVal === 'true') return true
  if (rawVal === 'false') return false
  if (rawVal === '[]') return []
  const arrayMatch = rawVal.match(/^\[(.*)\]$/)
  if (arrayMatch) return parseArrayValue(rawVal)
  return rawVal.replace(/^['"]|['"]$/g, '')
}

export function parseSimpleFrontmatter(content: string): RawFrontmatter {
  const result: RawFrontmatter = {}
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return result

  const yaml = match[1]
  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const rawVal = line.slice(colonIdx + 1).trim()
    if (!key || rawVal === '') continue
    result[key] = parseScalarValue(rawVal)
  }
  return result
}

// ---------------------------------------------------------------------------
// Public frontmatter parser (gray-matter with simple-YAML fallback)
// ---------------------------------------------------------------------------

export function parseFrontmatter(content: string): RawFrontmatter {
  try {
    return normalizeFrontmatter(matter(content).data as RawFrontmatter)
  } catch {
    return normalizeFrontmatter(parseSimpleFrontmatter(content))
  }
}

export function extractBody(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/)
  return match ? match[1].trim() : content.trim()
}

// ---------------------------------------------------------------------------
// Validate frontmatter and produce a MemoryRecord (or parse_error)
// ---------------------------------------------------------------------------

function buildParseErrorRecord(note: Note, fm: RawFrontmatter, body: string): MemoryRecord {
  return {
    id: note.id,
    frontmatter: {
      name: (fm.name as string) || note.id,
      description: (fm.description as string) || '',
      kind: (fm.kind as MemoryKind) || 'lesson',
      scope: (fm.scope as MemoryScope) || 'enterprise',
      owner: (fm.owner as string) || 'unknown',
      status: 'parse_error',
      captain_approved: false,
      version: (fm.version as string) || '0.0.0',
    },
    body,
    created_at: note.created_at,
    updated_at: note.updated_at,
    title: note.title,
    venture: note.venture,
    parse_error: true,
    raw_content: note.content,
    injectable: (note.injectable ?? 0) === 1,
  }
}

export function validateAndBuildRecord(note: Note): MemoryRecord {
  const fm = parseFrontmatter(note.content)
  const body = extractBody(note.content)

  const missingFields = REQUIRED_MEMORY_FIELDS.filter((f) => !fm[f])
  const hasValidKind = VALID_KINDS.includes(fm.kind as MemoryKind)
  const hasValidScope =
    VALID_SCOPES.includes(fm.scope as string) ||
    (typeof fm.scope === 'string' && fm.scope.startsWith('venture:'))

  if (missingFields.length > 0 || !hasValidKind || !hasValidScope) {
    return buildParseErrorRecord(note, fm, body)
  }

  return {
    id: note.id,
    frontmatter: fm as unknown as MemoryFrontmatter,
    body,
    created_at: note.created_at,
    updated_at: note.updated_at,
    title: note.title,
    venture: note.venture,
    injectable: (note.injectable ?? 0) === 1,
  }
}

// ---------------------------------------------------------------------------
// Frontmatter serialization helpers
// ---------------------------------------------------------------------------

function serializeAppliesWhen(fm: Partial<MemoryFrontmatter>, lines: string[]): void {
  if (!fm.applies_when) return
  lines.push('applies_when:')
  if (fm.applies_when.commands?.length) {
    lines.push(`  commands: [${fm.applies_when.commands.join(', ')}]`)
  }
  if (fm.applies_when.files?.length) {
    lines.push(`  files: [${fm.applies_when.files.map((f) => `"${f}"`).join(', ')}]`)
  }
  if (fm.applies_when.skills?.length) {
    lines.push(`  skills: [${fm.applies_when.skills.join(', ')}]`)
  }
}

function serializeSupersedes(fm: Partial<MemoryFrontmatter>, lines: string[]): void {
  const supersedes = asStringArray(fm.supersedes) ?? []
  if (supersedes.length) {
    lines.push(`supersedes: [${supersedes.join(', ')}]`)
  } else {
    lines.push('supersedes: []')
  }

  const supersedesSource = asStringArray(fm.supersedes_source) ?? []
  if (supersedesSource.length) {
    lines.push('supersedes_source:')
    for (const s of supersedesSource) {
      lines.push(`  - ${s}`)
    }
  }
}

export function serializeFrontmatter(fm: Partial<MemoryFrontmatter>): string {
  const lines: string[] = ['---']

  if (fm.name) lines.push(`name: ${fm.name}`)
  if (fm.description) lines.push(`description: "${fm.description.replace(/"/g, '\\"')}"`)
  if (fm.kind) lines.push(`kind: ${fm.kind}`)
  if (fm.scope) lines.push(`scope: ${fm.scope}`)
  if (fm.owner) lines.push(`owner: ${fm.owner}`)
  if (fm.status) lines.push(`status: ${fm.status}`)
  lines.push(`captain_approved: ${fm.captain_approved ?? false}`)
  if (fm.version) lines.push(`version: ${fm.version}`)
  if (fm.severity) lines.push(`severity: ${fm.severity}`)

  serializeAppliesWhen(fm, lines)
  serializeSupersedes(fm, lines)

  if (fm.last_validated_on) lines.push(`last_validated_on: ${fm.last_validated_on}`)
  lines.push('---')

  return lines.join('\n')
}
