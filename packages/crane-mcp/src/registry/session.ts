import { contextInputSchema, executeContext } from '../tools/context.js'
import { handoffInputSchema, executeHandoff } from '../tools/handoff.js'
import { preflightInputSchema, executePreflight } from '../tools/preflight.js'
import { sosInputSchema, executeSos } from '../tools/sos.js'
import { statusInputSchema, executeStatus } from '../tools/status.js'
import { venturesInputSchema, executeVentures } from '../tools/ventures.js'
import { worktreeDoctorInputSchema, executeWorktreeDoctor } from '../tools/worktree-doctor.js'
import { makeEntry, type ToolEntry } from '../tool-runtime.js'

export const SESSION_TOOLS: ToolEntry[] = [
  makeEntry(
    {
      name: 'crane_preflight',
      description: 'Validate environment readiness.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    preflightInputSchema,
    executePreflight,
    false
  ),
  makeEntry(
    {
      name: 'crane_sos',
      description: 'Initialize session context, directives, alerts, and work status.',
      inputSchema: {
        type: 'object',
        properties: {
          venture: {
            type: 'string',
            description:
              'Venture code to work on (vc, ke, dfg, sc). Optional - if not provided, lists available ventures.',
          },
          mode: {
            type: 'string',
            enum: ['full', 'fleet'],
            description: 'SOD mode: full (default) or fleet (minimal context for fleet agents).',
          },
        },
      },
    },
    sosInputSchema,
    executeSos,
    true
  ),
  makeEntry(
    {
      name: 'crane_status',
      description: 'Get GitHub issue breakdown: P0, ready, in-progress, blocked, triage.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    statusInputSchema,
    executeStatus,
    true
  ),
  makeEntry(
    {
      name: 'crane_ventures',
      description: 'List ventures with repos and install status.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    venturesInputSchema,
    executeVentures,
    false
  ),
  makeEntry(
    {
      name: 'crane_context',
      description: 'Get current session context.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    contextInputSchema,
    executeContext,
    false
  ),
  makeEntry(
    {
      name: 'crane_handoff',
      description: 'Create end-of-session handoff summary.',
      inputSchema: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Summary of work completed and any in-progress items',
          },
          status: {
            type: 'string',
            enum: ['in_progress', 'blocked', 'done'],
            description: 'Current status',
          },
          issue_number: {
            type: 'number',
            description: 'GitHub issue number if applicable',
          },
          venture: {
            type: 'string',
            description:
              'Venture code override for cross-venture sessions. When set, writes the handoff for this venture instead of auto-detecting from the current repo.',
          },
        },
        required: ['summary', 'status'],
      },
    },
    handoffInputSchema,
    executeHandoff,
    false
  ),
  makeEntry(
    {
      name: 'crane_worktree_doctor',
      description:
        'Orphan-worktree backstop for /sos. Classifies worktrees under .claude/worktrees/ through four safety gates (lock-triage, lsof, fresh-HEAD, clean+merged) and (when apply=true) removes the safe ones. Returns JSON: { scanned, deferred_by_cap, cleaned[], needs_review[], errors[], apply }.',
      inputSchema: {
        type: 'object',
        properties: {
          apply: {
            type: 'boolean',
            description:
              'When true, perform destructive cleanup (unlock + remove + branch-delete). When false (default), classify only — cleaned[] reflects what would have been cleaned.',
          },
          cap: {
            type: 'number',
            description:
              'Max worktrees evaluated per call, ordered by mtime descending. Default: 20.',
          },
        },
      },
    },
    worktreeDoctorInputSchema,
    executeWorktreeDoctor,
    true
  ),
]
