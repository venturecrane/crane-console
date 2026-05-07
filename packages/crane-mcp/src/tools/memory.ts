/**
 * crane_memory tool - Enterprise memory system (save/list/get/update/deprecate/recall)
 *
 * Memories are VCMS notes carrying one of four tags (lesson, anti-pattern, runbook, incident)
 * with mandatory YAML frontmatter enforcing the governance schema.
 *
 * This file is the public entry point. Implementation is split across:
 *   memory-frontmatter.ts — types, parsing, validation, serialization
 *   memory-recall.ts      — scoring, glob matching, memoryability checks
 *   memory-actions.ts     — per-action handlers (save/list/get/update/deprecate/recall)
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import {
  handleSave,
  handleList,
  handleGet,
  handleUpdate,
  handleDeprecate,
  handleRecall,
  fetchAllMemories,
  formatMemoryRecord,
  kindToTag,
  memoryTags,
} from './memory-actions.js'
import type { MemoryResult } from './memory-actions.js'
import {
  parseFrontmatter,
  validateAndBuildRecord,
  serializeFrontmatter,
  extractBody,
} from './memory-frontmatter.js'
import { checkMemoryability, scoreMemory, severityWeight } from './memory-recall.js'

// ---------------------------------------------------------------------------
// Re-export types consumed by other modules (memory-audit, sos, etc.)
// ---------------------------------------------------------------------------

export type {
  MemoryKind,
  MemoryScope,
  MemoryStatus,
  MemorySeverity,
  MemoryFrontmatter,
  MemoryRecord,
} from './memory-frontmatter.js'

export type { MemoryResult }

// Mirror of workers/crane-context/src/constants.ts VERIFY_ID_REGEX. Duplicated
// because crane-mcp doesn't depend on the worker package; keep in sync if the
// canonical constant changes.
export const VERIFY_ID_REGEX = /^vfy_[0-9A-HJKMNP-TV-Z]{26}$/

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
    evidence_verify_ids: z
      .array(z.string().regex(VERIFY_ID_REGEX, 'Each ID must match vfy_<26 Crockford>'))
      .optional()
      .describe(
        'Verify-ledger row IDs that are evidence for this memory (populated by crane_verify_audit --apply). Each must match /^vfy_[26 Crockford]$/'
      ),
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
    evidence_verify_ids: z
      .array(z.string().regex(VERIFY_ID_REGEX, 'Each ID must match vfy_<26 Crockford>'))
      .optional(),
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
    query: z
      .string()
      .optional()
      .describe(
        'Free-form text query. When set, uses FTS5 against memory bodies and titles, ranked by hybrid score (bm25 + applies_when + severity). Drops captain_approved_only default to false.'
      ),
    captain_approved_only: z
      .boolean()
      .default(false)
      .describe(
        'Defaults false. SOS injection path applies its own gate via MEMORY_INJECTION_GATE; pull recall returns drafts and stable so agents can ask broadly.'
      ),
    limit: z.number().optional().default(5),
  }),
])

export type MemoryInput = z.infer<typeof memoryInputSchema>

// ---------------------------------------------------------------------------
// Main executor — thin router dispatching to action handlers
// ---------------------------------------------------------------------------

export async function executeMemory(input: MemoryInput): Promise<MemoryResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return { success: false, message: 'CRANE_CONTEXT_KEY not set. Cannot access memories.' }
  }

  const api = new CraneApi(apiKey, getApiBase())

  try {
    if (input.action === 'save') return await handleSave(api, input)
    if (input.action === 'list') return await handleList(api, input)
    if (input.action === 'get') return await handleGet(api, input)
    if (input.action === 'update') return await handleUpdate(api, input)
    if (input.action === 'deprecate') return await handleDeprecate(api, input)
    if (input.action === 'recall') return await handleRecall(api, input)
  } catch (error) {
    return {
      success: false,
      message: `Failed to ${input.action} memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }

  return { success: false, message: 'Unknown action' }
}

// ---------------------------------------------------------------------------
// Named exports for use in SOS and audit tools (backward compat)
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
  parseFrontmatter,
  formatMemoryRecord,
}
