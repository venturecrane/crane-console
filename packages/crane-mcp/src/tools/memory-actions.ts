/**
 * memory-actions.ts — Action handlers for crane_memory tool.
 * Handles save, list, get, update, deprecate, and recall.
 * Split from memory.ts to satisfy line/complexity ESLint ceilings.
 */

import { CraneApi } from '../lib/crane-api.js'
import type { Note } from '../lib/crane-api.js'
import {
  parseFrontmatter,
  validateAndBuildRecord,
  serializeFrontmatter,
} from './memory-frontmatter.js'
import type {
  MemoryFrontmatter,
  MemoryKind,
  MemoryScope,
  MemoryStatus,
  MemorySeverity,
  RawFrontmatter,
} from './memory-frontmatter.js'
import type { MemoryInput } from './memory.js'
import {
  checkMemoryability,
  recallByQuery,
  recallByContext,
  fireSurfacedTelemetry,
} from './memory-recall.js'
import type { RecallContext } from './memory-recall.js'

// ---------------------------------------------------------------------------
// Shared result type
// ---------------------------------------------------------------------------

export interface MemoryResult {
  success: boolean
  message: string
}

// ---------------------------------------------------------------------------
// Tag helpers
// ---------------------------------------------------------------------------

export function kindToTag(kind: MemoryKind): string {
  return kind
}

export function memoryTags(kind: MemoryKind): string[] {
  return ['memory', kind]
}

// ---------------------------------------------------------------------------
// Fetch all memories matching a tag filter
// ---------------------------------------------------------------------------

export async function fetchAllMemories(
  api: CraneApi,
  tag: string,
  limit: number = 100
): Promise<Note[]> {
  const result = await api.listNotes({ tag, limit })
  return result.notes
}

// ---------------------------------------------------------------------------
// Format a memory record for display
// ---------------------------------------------------------------------------

function formatAppliesWhen(fm: MemoryFrontmatter): string | null {
  if (!fm.applies_when) return null
  const parts: string[] = []
  if (fm.applies_when.commands?.length)
    parts.push(`commands: ${fm.applies_when.commands.join(', ')}`)
  if (fm.applies_when.files?.length) parts.push(`files: ${fm.applies_when.files.join(', ')}`)
  if (fm.applies_when.skills?.length) parts.push(`skills: ${fm.applies_when.skills.join(', ')}`)
  return parts.length ? parts.join(' | ') : null
}

export function formatMemoryRecord(record: import('./memory-frontmatter.js').MemoryRecord): string {
  const lines: string[] = []
  const fm = record.frontmatter

  lines.push(`**${fm.name}** (${record.id})`)
  lines.push(
    `Kind: ${fm.kind} | Scope: ${fm.scope} | Status: ${fm.status} | Captain approved: ${fm.captain_approved}`
  )
  if (fm.severity) lines.push(`Severity: ${fm.severity}`)
  lines.push(`Owner: ${fm.owner} | Version: ${fm.version}`)
  lines.push(`Description: ${fm.description}`)

  const awStr = formatAppliesWhen(fm)
  if (awStr) lines.push(`Applies when: ${awStr}`)

  const supersedes = Array.isArray(fm.supersedes) ? fm.supersedes : []
  if (supersedes.length) lines.push(`Supersedes: ${supersedes.join(', ')}`)
  const evidenceVerifyIds = Array.isArray(fm.evidence_verify_ids) ? fm.evidence_verify_ids : []
  if (evidenceVerifyIds.length) {
    lines.push(`Evidence (verify-ledger): ${evidenceVerifyIds.join(', ')}`)
  }
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
// Internal helper for parse error telemetry (fire-and-forget)
// ---------------------------------------------------------------------------

async function fireParseErrorTelemetry(api: CraneApi, memoryId: string): Promise<void> {
  try {
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
// save action
// ---------------------------------------------------------------------------

type SaveInput = Extract<MemoryInput, { action: 'save' }>

export async function handleSave(api: CraneApi, input: SaveInput): Promise<MemoryResult> {
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
    ...(input.evidence_verify_ids?.length
      ? { evidence_verify_ids: input.evidence_verify_ids }
      : {}),
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
}

// ---------------------------------------------------------------------------
// list action
// ---------------------------------------------------------------------------

type ListInput = Extract<MemoryInput, { action: 'list' }>

export async function handleList(api: CraneApi, input: ListInput): Promise<MemoryResult> {
  const tag = input.kind ? kindToTag(input.kind as MemoryKind) : 'memory'
  const notes = await fetchAllMemories(api, tag, input.limit ?? 20)
  const records = notes.map(validateAndBuildRecord)

  let filtered = records
  if (input.status) filtered = filtered.filter((r) => r.frontmatter.status === input.status)
  if (input.scope) filtered = filtered.filter((r) => r.frontmatter.scope === input.scope)
  if (input.venture) filtered = filtered.filter((r) => r.venture === input.venture)
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
}

// ---------------------------------------------------------------------------
// get action
// ---------------------------------------------------------------------------

type GetInput = Extract<MemoryInput, { action: 'get' }>

export async function handleGet(api: CraneApi, input: GetInput): Promise<MemoryResult> {
  const note = await api.getNote(input.id)
  const record = validateAndBuildRecord(note)

  if (record.parse_error) {
    void fireParseErrorTelemetry(api, record.id)
  }

  return { success: true, message: formatMemoryRecord(record) }
}

// ---------------------------------------------------------------------------
// update action
// ---------------------------------------------------------------------------

type UpdateInput = Extract<MemoryInput, { action: 'update' }>

function mergeSeverity(
  input: UpdateInput,
  existingFm: RawFrontmatter
): Pick<MemoryFrontmatter, 'severity'> | Record<string, never> {
  if (input.severity) return { severity: input.severity }
  if (existingFm.severity) return { severity: existingFm.severity as MemorySeverity }
  return {}
}

function mergeAppliesWhen(
  input: UpdateInput,
  existingFm: RawFrontmatter
): Partial<Pick<MemoryFrontmatter, 'applies_when'>> {
  if (input.applies_when) return { applies_when: input.applies_when }
  if (existingFm.applies_when) {
    return { applies_when: existingFm.applies_when as MemoryFrontmatter['applies_when'] }
  }
  return {}
}

function mergeArrayFields(
  input: UpdateInput,
  existingFm: RawFrontmatter
): Partial<
  Pick<
    MemoryFrontmatter,
    'supersedes' | 'supersedes_source' | 'evidence_verify_ids' | 'last_validated_on'
  >
> {
  const result: Partial<
    Pick<
      MemoryFrontmatter,
      'supersedes' | 'supersedes_source' | 'evidence_verify_ids' | 'last_validated_on'
    >
  > = {}
  const supersedes = input.supersedes ?? (existingFm.supersedes as string[] | undefined)
  if (supersedes) result.supersedes = supersedes
  const supersedes_source =
    input.supersedes_source ?? (existingFm.supersedes_source as string[] | undefined)
  if (supersedes_source) result.supersedes_source = supersedes_source
  const evidence_verify_ids =
    input.evidence_verify_ids ?? (existingFm.evidence_verify_ids as string[] | undefined)
  if (evidence_verify_ids) result.evidence_verify_ids = evidence_verify_ids
  const last_validated_on =
    input.last_validated_on ?? (existingFm.last_validated_on as string | undefined)
  if (last_validated_on) result.last_validated_on = last_validated_on
  return result
}

// Pick the first truthy string from a list of candidates
function pick(...candidates: (string | undefined | null)[]): string {
  for (const v of candidates) {
    if (v) return v
  }
  return ''
}

function mergeBaseFields(
  input: UpdateInput,
  existingFm: RawFrontmatter
): Pick<
  MemoryFrontmatter,
  'name' | 'description' | 'kind' | 'scope' | 'owner' | 'status' | 'captain_approved' | 'version'
> {
  const captainApproved =
    input.captain_approved !== undefined
      ? input.captain_approved
      : Boolean(existingFm.captain_approved)
  return {
    name: pick(input.name, existingFm.name as string),
    description: pick(input.description, existingFm.description as string),
    kind: pick(input.kind, existingFm.kind as string, 'lesson') as MemoryKind,
    scope: pick(input.scope, existingFm.scope as string, 'enterprise') as MemoryScope,
    owner: pick(input.owner, existingFm.owner as string, 'captain'),
    status: pick(input.status, existingFm.status as string, 'draft') as MemoryStatus,
    captain_approved: captainApproved,
    version: pick(input.version, existingFm.version as string, '1.0.0'),
  }
}

function buildUpdatedFm(input: UpdateInput, existingFm: RawFrontmatter): MemoryFrontmatter {
  return {
    ...mergeBaseFields(input, existingFm),
    ...mergeSeverity(input, existingFm),
    ...mergeAppliesWhen(input, existingFm),
    ...mergeArrayFields(input, existingFm),
  }
}

export async function handleUpdate(api: CraneApi, input: UpdateInput): Promise<MemoryResult> {
  const note = await api.getNote(input.id)
  const record = validateAndBuildRecord(note)

  const existingFm: RawFrontmatter = record.parse_error
    ? parseFrontmatter(note.content)
    : (record.frontmatter as unknown as RawFrontmatter)

  const newFm = buildUpdatedFm(input, existingFm)
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
}

// ---------------------------------------------------------------------------
// deprecate action
// ---------------------------------------------------------------------------

type DeprecateInput = Extract<MemoryInput, { action: 'deprecate' }>

export async function handleDeprecate(api: CraneApi, input: DeprecateInput): Promise<MemoryResult> {
  const note = await api.getNote(input.id)
  const record = validateAndBuildRecord(note)

  const fm: RawFrontmatter = record.parse_error
    ? parseFrontmatter(note.content)
    : (record.frontmatter as unknown as RawFrontmatter)

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
}

// ---------------------------------------------------------------------------
// recall action
// ---------------------------------------------------------------------------

type RecallInput = Extract<MemoryInput, { action: 'recall' }>

export async function handleRecall(api: CraneApi, input: RecallInput): Promise<MemoryResult> {
  const tag = input.kind ? kindToTag(input.kind as MemoryKind) : 'memory'
  const ventureCode = input.venture || process.env.CRANE_VENTURE_CODE
  const limit = input.limit ?? 5
  const captainApprovedOnly = input.captain_approved_only ?? false

  const ctx: RecallContext = {
    venture: input.venture,
    repo: input.repo,
    files: input.files,
    commands: input.commands,
    skills: input.skills,
  }

  let candidates: import('./memory-frontmatter.js').MemoryRecord[]

  if (input.query) {
    candidates = await recallByQuery(api, {
      tag,
      query: input.query,
      limit,
      captainApprovedOnly,
      ventureCode,
      ctx,
    })
    // Best-effort surfaced telemetry (query mode only)
    fireSurfacedTelemetry(api, candidates, ventureCode, input.repo)
  } else {
    candidates = await recallByContext(api, {
      tag,
      limit,
      captainApprovedOnly,
      ventureCode,
      ctx,
    })
  }

  if (candidates.length === 0) {
    return {
      success: true,
      message: input.query
        ? `No memories matched query: ${input.query}`
        : 'No matching memories found for the current context.',
    }
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
}
