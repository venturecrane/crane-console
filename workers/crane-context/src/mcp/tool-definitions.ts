/**
 * MCP Tool Definitions and Zod Schemas
 *
 * Source of truth for hosted MCP tool declarations.
 * Referenced by parity checks and the tools/list handler.
 */

import { z } from 'zod'
import { AGENT_PATTERN, AGENT_MAX_LENGTH } from '@venturecrane/crane-contracts'
import type { ToolDefinition } from './types'

// ============================================================================
// Hosted Tool Registry
// ============================================================================

/**
 * Canonical hosted-MCP tool set.
 *
 * The hosted /mcp endpoint exposes a deliberately narrow surface: session
 * lifecycle and read-only context fetches that work without local filesystem
 * access. Operational tools (memory, skill, schedule, fleet, notifications)
 * live in the local stdio MCP server (packages/crane-mcp) because they
 * manipulate the agent's local files (~/.claude/projects/.../memory/, JSONL
 * ingest, fleet SSH).
 *
 * This array is the source of truth referenced by:
 *   - TOOL_DEFINITIONS below (declarations)
 *   - .github/workflows/parity-mcp-tools-list.yml (assertion target)
 *   - packages/crane-mcp/src/scripts/check-tool-list-parity.ts (drift lint)
 *   - docs/infra/mcp-surfaces.md (architectural reference)
 *
 * Adding a tool here requires the same name to appear in TOOL_DEFINITIONS,
 * mcp-surfaces.md, and a real implementation route in handleToolsCall.
 */
export const HOSTED_MCP_TOOLS = [
  'crane_sos',
  'crane_eos',
  'crane_handoff',
  'crane_get_doc',
  'crane_list_sessions',
] as const

export type HostedMcpTool = (typeof HOSTED_MCP_TOOLS)[number]

// ============================================================================
// Tool Definitions
// ============================================================================

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'crane_sos',
    description:
      'Start of Session - Resume or create a new Crane session. Returns session context, last handoff, and documentation.',
    inputSchema: {
      type: 'object',
      properties: {
        venture: {
          type: 'string',
          enum: ['vc', 'sc', 'dfg'],
          description: 'Venture code (vc=crane-console, sc=smdurgan.com, dfg=dfg-consulting)',
        },
        repo: {
          type: 'string',
          description: 'Repository in owner/repo format',
        },
        track: {
          type: 'integer',
          description: 'Track number for parallel work streams',
        },
        agent: {
          type: 'string',
          description: 'Agent identifier (e.g., claude-opus-1)',
        },
        host: {
          type: 'string',
          description: 'Host machine identifier',
        },
      },
      required: ['agent'],
    },
  },
  {
    name: 'crane_eos',
    description:
      'End of Session - End the current session with a handoff summary. Creates a handoff document for the next agent.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Session ID to end',
        },
        summary: {
          type: 'string',
          description: 'Summary of work completed',
        },
        status: {
          type: 'string',
          description: 'Current status label (e.g., "in-progress", "blocked", "ready-for-review")',
        },
        next_actions: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of next actions for the incoming agent',
        },
        blockers: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of current blockers',
        },
        idempotency_key: {
          type: 'string',
          description: 'Idempotency key for retry safety',
        },
      },
      required: ['session_id', 'summary', 'status', 'next_actions'],
    },
  },
  {
    name: 'crane_handoff',
    description:
      'Create a handoff document without ending the session. Use for mid-session context sharing.',
    inputSchema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Summary of current state',
        },
        to_agent: {
          type: 'string',
          description: 'Target agent for handoff',
        },
        status_label: {
          type: 'string',
          description: 'Current status label',
        },
      },
      required: ['summary'],
    },
  },
  {
    name: 'crane_get_doc',
    description: 'Retrieve a specific documentation document by name.',
    inputSchema: {
      type: 'object',
      properties: {
        doc_name: {
          type: 'string',
          description: 'Name of the document to retrieve',
        },
        scope: {
          type: 'string',
          description: 'Scope of the document (global, vc, sc, dfg)',
        },
      },
      required: ['doc_name'],
    },
  },
  {
    name: 'crane_list_sessions',
    description: 'List active sessions, optionally filtered by venture and repo.',
    inputSchema: {
      type: 'object',
      properties: {
        venture: {
          type: 'string',
          enum: ['vc', 'sc', 'dfg'],
          description: 'Filter by venture',
        },
        repo: {
          type: 'string',
          description: 'Filter by repository',
        },
      },
    },
  },
]

// ============================================================================
// Zod Schemas for Parameter Validation
// ============================================================================

// §Rollout step 4: /mcp `agent` stays permissive in this PR — tightening is
// deferred until a week of canary telemetry confirms no real client sends
// a value that would fail AGENT_PATTERN. The `z.string().min(1)` check here
// is unchanged; the `logAgentPatternMismatch` helper below emits a structured
// warning so we have data to act on before step 5 tightens the schema.
export const SosParamsSchema = z.object({
  venture: z.enum(['vc', 'sc', 'dfg']).optional().default('vc'),
  repo: z.string().optional().default('smdurgan/crane-console'),
  track: z.number().int().positive().optional(),
  agent: z.string().min(1),
  host: z.string().optional(),
})

export const EosParamsSchema = z.object({
  session_id: z.string().min(1),
  summary: z.string().min(1),
  status: z.string().min(1),
  next_actions: z.array(z.string()),
  blockers: z.array(z.string()).optional().default([]),
  idempotency_key: z.string().optional(),
})

export const HandoffParamsSchema = z.object({
  summary: z.string().min(1),
  to_agent: z.string().regex(AGENT_PATTERN).max(AGENT_MAX_LENGTH).optional(),
  status_label: z.string().optional(),
})

export const GetDocParamsSchema = z.object({
  doc_name: z.string().min(1),
  scope: z.string().optional(),
})

export const ListSessionsParamsSchema = z.object({
  venture: z.enum(['vc', 'sc', 'dfg']).optional(),
  repo: z.string().optional(),
})
