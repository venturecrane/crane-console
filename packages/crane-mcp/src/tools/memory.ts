/**
 * crane_memory tool - Enterprise memory system (save/list/get/update/deprecate/recall)
 *
 * Memories are VCMS notes carrying one of four tags (lesson, anti-pattern, runbook, incident)
 * with mandatory YAML frontmatter enforcing the governance schema.
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
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
}

// ---------------------------------------------------------------------------
// Required frontmatter fields (governance.md §Required fields)
// ---------------------------------------------------------------------------

const REQUIRED_MEMORY_FIELDS = ['name', 'description', 'kind', 'scope', 'status'] as const

const VALID_KINDS: MemoryKind[] = ['lesson', 'anti-pattern', 'runbook', 'incident']
const VALID_SCOPES = ['enterprise', 'global']

// ---------------------------------------------------------------------------
// Frontmatter parsing (reused from skill-audit.ts pattern)
// ---------------------------------------------------------------------------

interface RawFrontmatter {
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

export function parseFrontmatter(content: string): RawFrontmatter {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const matter = require('gray-matter')
    return matter(content).data as RawFrontmatter
  } catch {
    return parseSimpleFrontmatter(content)
  }
}

function parseSimpleFrontmatter(content: string): RawFrontmatter {
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

    if (rawVal === 'true') {
      result[key] = true
    } else if (rawVal === 'false') {
      result[key] = false
    } else {
      result[key] = rawVal.replace(/^['"]|['"]$/g, '')
    }
  }
  return result
}

function extractBody(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/)
  return match ? match[1].trim() : content.trim()
}

// ---------------------------------------------------------------------------
// Validate frontmatter and produce a MemoryRecord (or parse_error)
// ---------------------------------------------------------------------------

function validateAndBuildRecord(note: Note): MemoryRecord {
  const fm = parseFrontmatter(note.content)
  const body = extractBody(note.content)

  const missingFields = REQUIRED_MEMORY_FIELDS.filter((f) => !fm[f])
  const hasValidKind = VALID_KINDS.includes(fm.kind as MemoryKind)
  const hasValidScope =
    VALID_SCOPES.includes(fm.scope as string) ||
    (typeof fm.scope === 'string' && fm.scope.startsWith('venture:'))

  if (missingFields.length > 0 || !hasValidKind || !hasValidScope) {
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
    }
  }

  return {
    id: note.id,
    frontmatter: fm as unknown as MemoryFrontmatter,
    body,
    created_at: note.created_at,
    updated_at: note.updated_at,
    title: note.title,
    venture: note.venture,
  }
}

// ---------------------------------------------------------------------------
// Frontmatter serialization
// ---------------------------------------------------------------------------

function serializeFrontmatter(fm: Partial<MemoryFrontmatter>): string {
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

  if (fm.applies_when) {
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

  if (fm.supersedes?.length) {
    lines.push(`supersedes: [${fm.supersedes.join(', ')}]`)
  } else {
    lines.push('supersedes: []')
  }

  if (fm.supersedes_source?.length) {
    lines.push('supersedes_source:')
    for (const s of fm.supersedes_source) {
      lines.push(`  - ${s}`)
    }
  }

  if (fm.last_validated_on) lines.push(`last_validated_on: ${fm.last_validated_on}`)
  lines.push('---')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Three memoryability tests (enforced for lesson and anti-pattern kinds)
// ---------------------------------------------------------------------------

interface MemoryabilityResult {
  ok: boolean
  failed_test?: string
  warning?: string
}

const IMPERATIVE_PATTERN =
  /\b(always|never|use|avoid|run|call|prefer|check|ensure|set|add|pass|require|must|do not|don['']t|stop|start)\b/i
const ONE_OFF_PATTERN = /\b(PR#?\d+|commit [0-9a-f]{7,40}|issue #?\d+)\b/i
const GENERAL_RULE_PATTERN = /\b(when|whenever|any|all|every|pattern|class|case)\b/i

function checkMemoryability(
  body: string,
  kind: MemoryKind,
  existingNames: string[],
  candidateName: string
): MemoryabilityResult {
  if (kind !== 'lesson' && kind !== 'anti-pattern') {
    return { ok: true }
  }

  // Test 1: Actionable
  if (!IMPERATIVE_PATTERN.test(body)) {
    return {
      ok: false,
      failed_test:
        'Actionable: body must contain an imperative verb or "do not" pattern. Memories tell future agents what to do or avoid.',
    }
  }

  // Test 2: Non-obvious
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

  // Test 3: General enough to recur
  if (ONE_OFF_PATTERN.test(body) && !GENERAL_RULE_PATTERN.test(body)) {
    return {
      ok: true,
      warning:
        'General-enough: body references a one-off identifier (PR/commit/issue) without stating a general rule. Consider generalizing.',
    }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Scoring for recall
// ---------------------------------------------------------------------------

interface RecallContext {
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
function globMatchSimple(pattern: string, path: string): boolean {
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
      // Should not reach here since we checked includes('*') above
      if (t === pattern) return true
    }
  }
  return false
}

function scoreMemory(record: MemoryRecord, ctx: RecallContext): number {
  const aw = record.frontmatter.applies_when
  if (!aw) return 1

  let score = 0

  if (ctx.commands?.length && aw.commands?.length) {
    const matches = ctx.commands.filter((c) => aw.commands!.includes(c)).length
    score += matches * 3
  }

  if (ctx.skills?.length && aw.skills?.length) {
    const matches = ctx.skills.filter((s) => aw.skills!.includes(s)).length
    score += matches * 2
  }

  if (ctx.files?.length && aw.files?.length) {
    for (const pattern of aw.files) {
      // Use simple substring/suffix match instead of dynamic RegExp to avoid ReDoS.
      // Patterns like ".infisical*" match by prefix up to wildcard; "*.toml" by suffix.
      if (ctx.files.some((f) => globMatchSimple(pattern, f))) {
        score += 1
      }
    }
  }

  return score
}

function severityWeight(severity?: MemorySeverity): number {
  if (severity === 'P0') return 100
  if (severity === 'P1') return 10
  return 1
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

const applilesWhenSchema = z.object({
  commands: z.array(z.string()).optional(),
  files: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
})

export const memoryInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    name: z.string().describe('kebab-case unique name for this memory'),
    description: z.string().describe('1-2 sentence purpose statement'),
    kind: z.enum(['lesson', 'anti-pattern', 'runbook', 'incident']),
    scope: z.string().default('enterprise').describe('enterprise | global | venture:<code>'),
    owner: z.string().default('captain').describe('captain or agent-team'),
    status: z.enum(['draft', 'stable']).default('draft'),
    captain_approved: z.boolean().default(false),
    version: z.string().default('1.0.0'),
    severity: z.enum(['P0', 'P1', 'P2']).optional().describe('Anti-patterns only'),
    applies_when: applilesWhenSchema.optional(),
    supersedes: z.array(z.string()).optional(),
    supersedes_source: z.array(z.string()).optional(),
    last_validated_on: z.string().optional(),
    body: z.string().describe('Memory body content (the lesson/rule/procedure)'),
    venture: z.string().optional().describe('Venture code for venture-scoped memories'),
  }),
  z.object({
    action: z.literal('list'),
    kind: z.enum(['lesson', 'anti-pattern', 'runbook', 'incident']).optional(),
    status: z.enum(['draft', 'stable', 'deprecated', 'parse_error']).optional(),
    scope: z.string().optional(),
    venture: z.string().optional(),
    captain_approved: z.boolean().optional(),
    limit: z.number().optional().default(20),
  }),
  z.object({
    action: z.literal('get'),
    id: z.string().describe('Note ID of the memory'),
  }),
  z.object({
    action: z.literal('update'),
    id: z.string().describe('Note ID of the memory to update'),
    name: z.string().optional(),
    description: z.string().optional(),
    kind: z.enum(['lesson', 'anti-pattern', 'runbook', 'incident']).optional(),
    scope: z.string().optional(),
    owner: z.string().optional(),
    status: z.enum(['draft', 'stable', 'deprecated']).optional(),
    captain_approved: z.boolean().optional().describe('Only Captain can set to true'),
    version: z.string().optional(),
    severity: z.enum(['P0', 'P1', 'P2']).optional(),
    applies_when: applilesWhenSchema.optional(),
    supersedes: z.array(z.string()).optional(),
    supersedes_source: z.array(z.string()).optional(),
    last_validated_on: z.string().optional(),
    body: z.string().optional(),
    venture: z.string().optional(),
  }),
  z.object({
    action: z.literal('deprecate'),
    id: z.string().describe('Note ID of the memory to deprecate'),
    reason: z.string().optional().describe('Optional deprecation reason'),
  }),
  z.object({
    action: z.literal('recall'),
    venture: z.string().optional(),
    repo: z.string().optional(),
    files: z.array(z.string()).optional().describe('Currently active file paths'),
    commands: z.array(z.string()).optional().describe('Recently used commands'),
    skills: z.array(z.string()).optional().describe('Recently invoked skill names'),
    kind: z.enum(['lesson', 'anti-pattern', 'runbook', 'incident']).optional(),
    captain_approved_only: z
      .boolean()
      .default(true)
      .describe('Default true for SOS injection; set false for on-demand pulls'),
    limit: z.number().optional().default(5),
  }),
])

export type MemoryInput = z.infer<typeof memoryInputSchema>

export interface MemoryResult {
  success: boolean
  message: string
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

function kindToTag(kind: MemoryKind): string {
  return kind
}

function memoryTags(kind: MemoryKind): string[] {
  return ['memory', kind]
}

// ---------------------------------------------------------------------------
// Fetch all memories matching a tag filter
// ---------------------------------------------------------------------------

async function fetchAllMemories(api: CraneApi, tag: string, limit: number = 100): Promise<Note[]> {
  const result = await api.listNotes({ tag, limit })
  return result.notes
}

// ---------------------------------------------------------------------------
// Format a memory record for display
// ---------------------------------------------------------------------------

function formatMemoryRecord(record: MemoryRecord): string {
  const lines: string[] = []
  const fm = record.frontmatter

  lines.push(`**${fm.name}** (${record.id})`)
  lines.push(
    `Kind: ${fm.kind} | Scope: ${fm.scope} | Status: ${fm.status} | Captain approved: ${fm.captain_approved}`
  )
  if (fm.severity) lines.push(`Severity: ${fm.severity}`)
  lines.push(`Owner: ${fm.owner} | Version: ${fm.version}`)
  lines.push(`Description: ${fm.description}`)

  if (fm.applies_when) {
    const parts: string[] = []
    if (fm.applies_when.commands?.length)
      parts.push(`commands: ${fm.applies_when.commands.join(', ')}`)
    if (fm.applies_when.files?.length) parts.push(`files: ${fm.applies_when.files.join(', ')}`)
    if (fm.applies_when.skills?.length) parts.push(`skills: ${fm.applies_when.skills.join(', ')}`)
    if (parts.length) lines.push(`Applies when: ${parts.join(' | ')}`)
  }

  if (fm.supersedes?.length) lines.push(`Supersedes: ${fm.supersedes.join(', ')}`)
  if (fm.last_validated_on) lines.push(`Last validated: ${fm.last_validated_on}`)

  lines.push('')
  lines.push(record.body)
  lines.push('')
  lines.push(
    `Created: ${record.created_at.split('T')[0]} | Updated: ${record.updated_at.split('T')[0]}`
  )

  if (record.parse_error) {
    lines.unshift(
      '> **PARSE ERROR** — frontmatter validation failed. Memory quarantined from injection/recall until fixed.\n'
    )
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export async function executeMemory(input: MemoryInput): Promise<MemoryResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return { success: false, message: 'CRANE_CONTEXT_KEY not set. Cannot access memories.' }
  }

  const api = new CraneApi(apiKey, getApiBase())

  // --- save ---
  if (input.action === 'save') {
    try {
      // Fetch existing memory names for duplicate check
      const existingNotes = await fetchAllMemories(api, 'memory')
      const existingNames = existingNotes
        .map((n) => parseFrontmatter(n.content).name as string | undefined)
        .filter(Boolean) as string[]

      const memCheck = checkMemoryability(
        input.body,
        input.kind as MemoryKind,
        existingNames,
        input.name
      )
      if (!memCheck.ok) {
        return { success: false, message: `Memory rejected: ${memCheck.failed_test}` }
      }

      const fm: MemoryFrontmatter = {
        name: input.name,
        description: input.description,
        kind: input.kind as MemoryKind,
        scope: (input.scope || 'enterprise') as MemoryScope,
        owner: input.owner || 'captain',
        status: input.status as MemoryStatus,
        captain_approved: input.captain_approved,
        version: input.version || '1.0.0',
        ...(input.severity ? { severity: input.severity as MemorySeverity } : {}),
        ...(input.applies_when ? { applies_when: input.applies_when } : {}),
        ...(input.supersedes?.length ? { supersedes: input.supersedes } : {}),
        ...(input.supersedes_source?.length ? { supersedes_source: input.supersedes_source } : {}),
        ...(input.last_validated_on ? { last_validated_on: input.last_validated_on } : {}),
      }

      const frontmatterBlock = serializeFrontmatter(fm)
      const fullContent = `${frontmatterBlock}\n\n${input.body}`

      const note = await api.createNote({
        title: input.name,
        content: fullContent,
        tags: memoryTags(input.kind as MemoryKind),
        venture: input.venture,
      })

      let msg = `Memory saved. (${note.id})\nName: ${input.name}\nKind: ${input.kind} | Status: ${input.status} | Captain approved: ${input.captain_approved}`
      if (memCheck.warning) {
        msg += `\n\nWarning: ${memCheck.warning}`
      }
      return { success: true, message: msg }
    } catch (error) {
      return {
        success: false,
        message: `Failed to save memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  // --- list ---
  if (input.action === 'list') {
    try {
      const tag = input.kind ? kindToTag(input.kind as MemoryKind) : 'memory'
      const notes = await fetchAllMemories(api, tag, input.limit ?? 20)
      const records = notes.map(validateAndBuildRecord)

      let filtered = records

      if (input.status) {
        filtered = filtered.filter((r) => r.frontmatter.status === input.status)
      }
      if (input.scope) {
        filtered = filtered.filter((r) => r.frontmatter.scope === input.scope)
      }
      if (input.venture) {
        filtered = filtered.filter((r) => r.venture === input.venture)
      }
      if (input.captain_approved !== undefined) {
        filtered = filtered.filter((r) => r.frontmatter.captain_approved === input.captain_approved)
      }

      if (filtered.length === 0) {
        return { success: true, message: 'No memories found matching the specified filters.' }
      }

      const lines: string[] = [`${filtered.length} memory(ies):\n`]
      for (const r of filtered) {
        const fm = r.frontmatter
        const parseFlag = r.parse_error ? ' [PARSE ERROR]' : ''
        const approvedFlag = fm.captain_approved ? ' [approved]' : ''
        lines.push(
          `- **${fm.name}**${parseFlag}${approvedFlag} (${r.id}) — ${fm.kind} | ${fm.status} | ${fm.scope} | ${r.updated_at.split('T')[0]}`
        )
      }

      return { success: true, message: lines.join('\n') }
    } catch (error) {
      return {
        success: false,
        message: `Failed to list memories: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  // --- get ---
  if (input.action === 'get') {
    try {
      const note = await api.getNote(input.id)
      const record = validateAndBuildRecord(note)

      if (record.parse_error) {
        // Fire-and-forget telemetry for parse error
        void fireParseErrorTelemetry(record.id)
      }

      return { success: true, message: formatMemoryRecord(record) }
    } catch (error) {
      return {
        success: false,
        message: `Failed to get memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  // --- update ---
  if (input.action === 'update') {
    try {
      const note = await api.getNote(input.id)
      const record = validateAndBuildRecord(note)

      const existingFm = record.parse_error
        ? parseFrontmatter(note.content)
        : (record.frontmatter as unknown as Record<string, unknown>)

      const newFm: MemoryFrontmatter = {
        name: (input.name ?? (existingFm.name as string)) || '',
        description: (input.description ?? (existingFm.description as string)) || '',
        kind: (input.kind ?? (existingFm.kind as MemoryKind)) || 'lesson',
        scope: (input.scope ??
          (existingFm.scope as MemoryScope | undefined) ??
          'enterprise') as MemoryScope,
        owner: (input.owner ?? (existingFm.owner as string)) || 'captain',
        status: (input.status ?? (existingFm.status as MemoryStatus)) || 'draft',
        captain_approved:
          input.captain_approved !== undefined
            ? input.captain_approved
            : ((existingFm.captain_approved as boolean) ?? false),
        version: (input.version ?? (existingFm.version as string)) || '1.0.0',
        ...(input.severity
          ? { severity: input.severity }
          : existingFm.severity
            ? { severity: existingFm.severity as MemorySeverity }
            : {}),
        ...(input.applies_when ??
          (existingFm.applies_when
            ? { applies_when: existingFm.applies_when as MemoryFrontmatter['applies_when'] }
            : {})),
        ...((input.supersedes ?? existingFm.supersedes)
          ? { supersedes: input.supersedes ?? (existingFm.supersedes as string[]) }
          : {}),
        ...((input.supersedes_source ?? existingFm.supersedes_source)
          ? {
              supersedes_source:
                input.supersedes_source ?? (existingFm.supersedes_source as string[]),
            }
          : {}),
        ...((input.last_validated_on ?? existingFm.last_validated_on)
          ? {
              last_validated_on:
                input.last_validated_on ?? (existingFm.last_validated_on as string),
            }
          : {}),
      }

      const body = input.body ?? record.body
      const frontmatterBlock = serializeFrontmatter(newFm)
      const fullContent = `${frontmatterBlock}\n\n${body}`

      const updated = await api.updateNote(input.id, {
        title: newFm.name,
        content: fullContent,
        ...(input.venture !== undefined ? { venture: input.venture } : {}),
      })

      const updatedRecord = validateAndBuildRecord(updated)
      return {
        success: true,
        message: `Memory updated. (${updated.id})\n\n${formatMemoryRecord(updatedRecord)}`,
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to update memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  // --- deprecate ---
  if (input.action === 'deprecate') {
    try {
      const note = await api.getNote(input.id)
      const record = validateAndBuildRecord(note)

      const fm = record.parse_error
        ? parseFrontmatter(note.content)
        : (record.frontmatter as unknown as Record<string, unknown>)

      const newFm: MemoryFrontmatter = {
        ...(fm as unknown as MemoryFrontmatter),
        status: 'deprecated',
      }

      const reasonLine = input.reason ? `\n\n_Deprecated: ${input.reason}_` : ''
      const frontmatterBlock = serializeFrontmatter(newFm)
      const fullContent = `${frontmatterBlock}\n\n${record.body}${reasonLine}`

      await api.updateNote(input.id, { content: fullContent })

      return {
        success: true,
        message: `Memory deprecated. (${input.id})${input.reason ? `\nReason: ${input.reason}` : ''}`,
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to deprecate memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  // --- recall ---
  if (input.action === 'recall') {
    try {
      const tag = input.kind ? kindToTag(input.kind as MemoryKind) : 'memory'
      const notes = await fetchAllMemories(api, tag, 100)
      const records = notes.map(validateAndBuildRecord)

      const ventureCode = input.venture || process.env.CRANE_VENTURE_CODE

      // Filter: exclude deprecated and parse_error; filter captain_approved if required
      let candidates = records.filter((r) => {
        if (r.parse_error || r.frontmatter.status === 'parse_error') return false
        if (r.frontmatter.status === 'deprecated') return false
        if (r.frontmatter.status === 'draft') return false
        if (input.captain_approved_only && !r.frontmatter.captain_approved) return false

        // Scope filter
        const scope = r.frontmatter.scope
        if (scope === 'enterprise' || scope === 'global') return true
        if (ventureCode && scope === `venture:${ventureCode}`) return true
        return false
      })

      const ctx: RecallContext = {
        venture: input.venture,
        repo: input.repo,
        files: input.files,
        commands: input.commands,
        skills: input.skills,
      }

      // Score and sort
      candidates = candidates
        .map((r) => ({
          record: r,
          score: scoreMemory(r, ctx) + severityWeight(r.frontmatter.severity),
        }))
        .sort((a, b) => b.score - a.score)
        .map((x) => x.record)
        .slice(0, input.limit ?? 5)

      if (candidates.length === 0) {
        return { success: true, message: 'No matching memories found for the current context.' }
      }

      const lines: string[] = [`${candidates.length} memory(ies) recalled:\n`]
      for (const r of candidates) {
        const fm = r.frontmatter
        lines.push(`### ${fm.name}`)
        lines.push(`_${fm.description}_`)
        lines.push('')
        lines.push(r.body)
        lines.push('')
        lines.push(`Kind: ${fm.kind} | Severity: ${fm.severity ?? 'N/A'} | Scope: ${fm.scope}`)
        lines.push('')
      }

      return { success: true, message: lines.join('\n') }
    } catch (error) {
      return {
        success: false,
        message: `Failed to recall memories: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  return { success: false, message: 'Unknown action' }
}

// ---------------------------------------------------------------------------
// Internal helper for parse error telemetry (fire-and-forget)
// ---------------------------------------------------------------------------

async function fireParseErrorTelemetry(memoryId: string): Promise<void> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) return

  try {
    const api = new CraneApi(apiKey, getApiBase())
    await api.recordMemoryInvocation({
      memory_id: memoryId,
      event: 'parse_error',
      venture: process.env.CRANE_VENTURE_CODE,
      repo: process.env.CRANE_REPO,
    })
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Export for use in SOS and audit tools
// ---------------------------------------------------------------------------

export {
  validateAndBuildRecord,
  fetchAllMemories,
  scoreMemory,
  severityWeight,
  serializeFrontmatter,
  extractBody,
  kindToTag,
  memoryTags,
  checkMemoryability,
}
