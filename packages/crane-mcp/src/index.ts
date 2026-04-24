#!/usr/bin/env node
/**
 * crane-mcp - MCP server for Venture Crane development workflow
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { sosInputSchema, executeSos } from './tools/sos.js'
import { venturesInputSchema, executeVentures } from './tools/ventures.js'
import { contextInputSchema, executeContext } from './tools/context.js'
import { handoffInputSchema, executeHandoff } from './tools/handoff.js'
import { preflightInputSchema, executePreflight } from './tools/preflight.js'
import { statusInputSchema, executeStatus } from './tools/status.js'
import { docAuditInputSchema, executeDocAudit } from './tools/doc-audit.js'
import { noteInputSchema, executeNote } from './tools/notes.js'
import { notesInputSchema, executeNotes } from './tools/notes.js'
import { docInputSchema, executeDoc } from './tools/doc.js'
import { scheduleInputSchema, executeSchedule } from './tools/schedule.js'
import { fleetDispatchInputSchema, executeFleetDispatch } from './tools/fleet-dispatch.js'
import { fleetStatusInputSchema, executeFleetStatus } from './tools/fleet-status.js'
import {
  notificationsInputSchema,
  executeNotifications,
  notificationUpdateInputSchema,
  executeNotificationUpdate,
} from './tools/notifications.js'
import { deployHeartbeatInputSchema, executeDeployHeartbeat } from './tools/deploy-heartbeat.js'
import { skillAuditInputSchema, executeSkillAudit } from './tools/skill-audit.js'
import {
  skillInvokeInputSchema,
  executeSkillInvoke,
  skillUsageInputSchema,
  executeSkillUsage,
} from './tools/skill-invoke.js'
import { memoryInputSchema, executeMemory } from './tools/memory.js'
import {
  memoryInvokeInputSchema,
  executeMemoryInvoke,
  memoryUsageInputSchema,
  executeMemoryUsage,
} from './tools/memory-invoke.js'
import { memoryAuditInputSchema, executeMemoryAudit } from './tools/memory-audit.js'
import { logTokenUsage } from './lib/token-tracker.js'
import { refreshSessionHeartbeatIfNeeded, startHeartbeatTimer } from './lib/heartbeat-refresh.js'

const server = new Server(
  {
    name: 'crane-mcp',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// Register tool list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'crane_preflight',
        description: 'Validate environment readiness.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
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
      {
        name: 'crane_status',
        description: 'Get GitHub issue breakdown: P0, ready, in-progress, blocked, triage.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'crane_ventures',
        description: 'List ventures with repos and install status.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'crane_context',
        description: 'Get current session context.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'crane_doc_audit',
        description: 'Audit venture documentation. Use fix=true to auto-generate.',
        inputSchema: {
          type: 'object',
          properties: {
            venture: {
              type: 'string',
              description: 'Venture code to audit. If omitted, detects from current repo.',
            },
            all: {
              type: 'boolean',
              description: 'Audit all ventures',
            },
            fix: {
              type: 'boolean',
              description: 'Generate and upload missing docs',
            },
          },
        },
      },
      {
        name: 'crane_doc',
        description: 'Fetch a doc by scope and name.',
        inputSchema: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              description: 'Document scope: "global" or venture code',
            },
            doc_name: {
              type: 'string',
              description: 'Document name',
            },
            max_chars: {
              type: 'number',
              description: 'Maximum characters to return. Truncates with a note if exceeded.',
            },
            summary_only: {
              type: 'boolean',
              description:
                'Return only title, scope, version, and character count - not full content.',
            },
          },
          required: ['scope', 'doc_name'],
        },
      },
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
      {
        name: 'crane_note',
        description: 'Create or update a VCMS note.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['create', 'update'],
              description: 'Whether to create a new note or update an existing one',
            },
            id: {
              type: 'string',
              description: 'Note ID (required for update, ignored for create)',
            },
            title: {
              type: 'string',
              description: 'Optional title/subject',
            },
            content: {
              type: 'string',
              description: 'Note body (required for create)',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Tags for categorization (e.g., executive-summary, prd, strategy, methodology, bio, governance)',
            },
            venture: {
              type: 'string',
              description: 'Optional venture code (ke, sc, dfg, etc.)',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'crane_notes',
        description: 'Search and list VCMS notes.',
        inputSchema: {
          type: 'object',
          properties: {
            venture: {
              type: 'string',
              description: 'Filter by venture code',
            },
            tag: {
              type: 'string',
              description:
                'Filter by tag (e.g., executive-summary, prd, strategy, methodology, bio)',
            },
            q: {
              type: 'string',
              description: 'Text search in title and content',
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return (default 10)',
            },
          },
        },
      },
      {
        name: 'crane_schedule',
        description: 'Cadence engine - manage recurring activities and planned events.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'complete',
                'items',
                'link-calendar',
                'planned-events',
                'planned-event-create',
                'planned-event-update',
                'planned-events-clear',
                'session-history',
              ],
              description:
                'Action: "list" to view briefing, "complete" to record completion, "items" to get all items with calendar state, "link-calendar" to store gcal_event_id, ' +
                '"planned-events" to list planned events, "planned-event-create" to create a planned event, "planned-event-update" to update a planned event, ' +
                '"planned-events-clear" to clear planned events, "session-history" to view session history',
            },
            scope: {
              type: 'string',
              description: 'Venture code to filter briefing (list action only)',
            },
            name: {
              type: 'string',
              description: 'Schedule item name (required for complete and link-calendar actions)',
            },
            result: {
              type: 'string',
              enum: ['success', 'warning', 'failure', 'skipped'],
              description: 'Completion result (complete action only)',
            },
            summary: {
              type: 'string',
              description: 'Brief outcome description (complete action only)',
            },
            completed_by: {
              type: 'string',
              description: 'Who completed this (complete action only)',
            },
            gcal_event_id: {
              type: ['string', 'null'],
              description: 'Google Calendar event ID (link-calendar action). Pass null to unlink.',
            },
            from: {
              type: 'string',
              description: 'Start date YYYY-MM-DD (planned-events action)',
            },
            to: {
              type: 'string',
              description: 'End date YYYY-MM-DD (planned-events action)',
            },
            // Keep description in sync with Zod schema in tools/schedule.ts
            type: {
              type: 'string',
              description:
                'Event type: planned, actual, or cancelled. Filters list results (planned-events) and sets value on create/update.',
            },
            event_date: {
              type: 'string',
              description: 'Event date YYYY-MM-DD (planned-event-create action)',
            },
            venture: {
              type: 'string',
              description: 'Venture code (planned-event-create action)',
            },
            title: {
              type: 'string',
              description: 'Event title (planned-event-create action)',
            },
            start_time: {
              type: 'string',
              description: 'Start time HH:MM (planned-event-create/update action)',
            },
            end_time: {
              type: 'string',
              description: 'End time HH:MM (planned-event-create/update action)',
            },
            id: {
              type: 'string',
              description: 'Event ID (planned-event-update action)',
            },
            sync_status: {
              type: 'string',
              enum: ['pending', 'synced', 'error'],
              description: 'Sync status (planned-event-update action)',
            },
            days: {
              type: 'number',
              description: 'Number of days to look back (session-history action, default 7)',
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'crane_fleet_dispatch',
        description: 'Dispatch a task to a fleet machine via SSH. Returns task_id.',
        inputSchema: {
          type: 'object',
          properties: {
            machine: {
              type: 'string',
              description: 'Target machine hostname (Tailscale or SSH name)',
            },
            venture: {
              type: 'string',
              description: 'Venture code (vc, ke, sc, dfg, etc.)',
            },
            repo: {
              type: 'string',
              description: 'Full repo path (org/repo)',
            },
            issue_number: {
              type: 'number',
              description: 'GitHub issue number to implement',
            },
            branch_name: {
              type: 'string',
              description: 'Git branch name for the worktree',
            },
          },
          required: ['machine', 'venture', 'repo', 'issue_number', 'branch_name'],
        },
      },
      {
        name: 'crane_fleet_status',
        description: 'Check task or PR status on fleet machines.',
        inputSchema: {
          type: 'object',
          properties: {
            machine: {
              type: 'string',
              description: 'Target machine hostname (task mode)',
            },
            task_id: {
              type: 'string',
              description: 'Task ID to check (task mode)',
            },
            repo: {
              type: 'string',
              description: 'Full repo path org/repo (PR mode)',
            },
            issue_numbers: {
              type: 'array',
              items: { type: 'number' },
              description: 'Issue numbers to check PRs for (PR mode)',
            },
          },
        },
      },
      {
        name: 'crane_notifications',
        description: 'List CI/CD failure notifications.',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['new', 'acked', 'resolved'],
              description: 'Filter by status',
            },
            severity: {
              type: 'string',
              enum: ['critical', 'warning', 'info'],
              description: 'Filter by severity',
            },
            venture: {
              type: 'string',
              description: 'Filter by venture code',
            },
            repo: {
              type: 'string',
              description: 'Filter by repo (org/repo)',
            },
            source: {
              type: 'string',
              enum: ['github', 'vercel'],
              description: 'Filter by source',
            },
            limit: {
              type: 'number',
              description: 'Max results (default 20, max 100)',
            },
          },
        },
      },
      {
        name: 'crane_notification_update',
        description: 'Acknowledge or resolve a CI/CD notification.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Notification ID to update',
            },
            status: {
              type: 'string',
              enum: ['acked', 'resolved'],
              description: 'New status',
            },
          },
          required: ['id', 'status'],
        },
      },
      {
        name: 'crane_deploy_heartbeat',
        description:
          'List deploy pipeline heartbeats and surface cold pipelines (commits stuck without deploy).',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'suppress', 'unsuppress', 'seed'],
              description: 'Action (default: list)',
            },
            venture: {
              type: 'string',
              description: 'Venture code (vc, ke, sc, dfg, etc.)',
            },
            repo_full_name: {
              type: 'string',
              description: 'Required for seed/suppress/unsuppress: full owner/repo path',
            },
            workflow_id: {
              type: 'number',
              description: 'Required for seed/suppress/unsuppress: GitHub Actions workflow ID',
            },
            branch: {
              type: 'string',
              description: 'Branch (defaults to main)',
            },
            reason: {
              type: 'string',
              description: 'Required for suppress: human-readable reason',
            },
            until: {
              type: 'string',
              description: 'Optional ISO8601 timestamp; suppression auto-expires at that point',
            },
            cold_threshold_days: {
              type: 'number',
              description: 'For seed: per-row cold threshold in days (default 3)',
            },
          },
          required: ['venture'],
        },
      },
      {
        name: 'crane_skill_audit',
        description:
          'Monthly skill staleness report. Walks every SKILL.md, parses frontmatter, computes staleness via git log, detects schema gaps, and emits a structured report.',
        inputSchema: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              enum: ['enterprise', 'global', 'all'],
              description: 'Which skills to audit. Default: all.',
            },
            stale_threshold_days: {
              type: 'number',
              description:
                'Days without a git touch before a skill is considered stale. Default: 180.',
            },
            include_deprecated: {
              type: 'boolean',
              description:
                'Include deprecated skills in staleness and inventory counts. Default: true.',
            },
          },
        },
      },
      {
        name: 'crane_skill_invoked',
        description:
          'Record a skill invocation to telemetry. SKILL.md files call this as their first action. Best-effort: never throws.',
        inputSchema: {
          type: 'object',
          properties: {
            skill_name: {
              type: 'string',
              description: 'Name of the skill being invoked (e.g., "sos", "eos", "commit")',
            },
            session_id: {
              type: 'string',
              description: 'Current session ID if known',
            },
            status: {
              type: 'string',
              enum: ['started', 'completed', 'failed'],
              description: 'Invocation status. Default: started.',
            },
            duration_ms: {
              type: 'number',
              description:
                'Elapsed time in milliseconds (set when reporting completion or failure)',
            },
            error_message: {
              type: 'string',
              description: 'Error detail (set on failure status)',
            },
          },
          required: ['skill_name'],
        },
      },
      {
        name: 'crane_skill_usage',
        description:
          'Query aggregate skill invocation counts. Used by /skill-audit to flag zero-usage skills for deprecation.',
        inputSchema: {
          type: 'object',
          properties: {
            since: {
              type: 'string',
              description:
                'Lookback window: ISO date string or relative like "30d" / "90d". Default: 30d.',
            },
            skill_name: {
              type: 'string',
              description: 'Filter to a single skill name. Omit to see all skills.',
            },
          },
        },
      },
      {
        name: 'crane_memory',
        description:
          'Enterprise memory system. Actions: save, list, get, update, deprecate, recall. Memories are structured VCMS notes with YAML frontmatter (lesson/anti-pattern/runbook/incident).',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['save', 'list', 'get', 'update', 'deprecate', 'recall'],
            },
          },
          required: ['action'],
        },
      },
      {
        name: 'crane_memory_invoked',
        description:
          'Record a memory invocation event (surfaced/cited/parse_error). Best-effort telemetry — never blocks callers. surfaced events sampled at 1/10.',
        inputSchema: {
          type: 'object',
          properties: {
            memory_id: { type: 'string', description: 'ID of the memory note' },
            event: {
              type: 'string',
              enum: ['surfaced', 'cited', 'parse_error'],
            },
            session_id: { type: 'string', description: 'Current session ID if known' },
          },
          required: ['memory_id', 'event'],
        },
      },
      {
        name: 'crane_memory_usage',
        description:
          'Query aggregate memory invocation counts (surfaced/cited). Used by /memory-audit to flag zero-usage deprecation candidates.',
        inputSchema: {
          type: 'object',
          properties: {
            since: {
              type: 'string',
              description: 'Lookback window: ISO date or relative like "30d" / "90d". Default: 90d.',
            },
            memory_id: {
              type: 'string',
              description: 'Filter to a single memory ID. Omit to see all.',
            },
          },
        },
      },
      {
        name: 'crane_memory_audit',
        description:
          'Monthly memory health report. Seven checks: inventory, schema gaps, staleness, deprecated-but-surfaced, zero-usage, supersedes-chain integrity, parse-error count. Runs auto-apply when auto_apply: true.',
        inputSchema: {
          type: 'object',
          properties: {
            auto_apply: {
              type: 'boolean',
              description:
                'Auto-promote eligible drafts and auto-deprecate zero-usage memories. Default: false.',
            },
            stale_threshold_days: {
              type: 'number',
              description: 'Days before a memory is considered stale. Default: 180.',
            },
            include_usage: {
              type: 'boolean',
              description: 'Fetch usage counts from the API. Default: true.',
            },
          },
        },
      },
    ],
  }
})

// Helper: log token usage for a tool call result
function logToolTokens(
  toolName: string,
  inputArgs: unknown,
  result: { content: Array<{ type: string; text: string }> },
  startMs: number
): void {
  try {
    const STRUCTURED_TOOLS = new Set([
      'crane_sos',
      'crane_status',
      'crane_doc_audit',
      'crane_schedule',
      'crane_fleet_status',
      'crane_notes',
      'crane_ventures',
      'crane_context',
    ])
    const outputText = result.content.map((c) => c.text).join('')
    const inputStr = JSON.stringify(inputArgs)
    const ratio = STRUCTURED_TOOLS.has(toolName) ? 3.5 : 4.0
    logTokenUsage({
      timestamp: new Date().toISOString(),
      tool: toolName,
      venture: process.env.CRANE_VENTURE_CODE,
      est_input_tokens: Math.ceil(inputStr.length / ratio),
      est_output_tokens: Math.ceil(outputText.length / ratio),
      output_chars: outputText.length,
      duration_ms: Date.now() - startMs,
    })
  } catch {
    // Token logging is best-effort
  }
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const startMs = Date.now()

  // Keep the current session alive during tool-heavy work. Debounced
  // to ~10 min, fire-and-forget, never blocks or fails the tool call.
  // Safe to call on every tool (including crane_sos/crane_preflight)
  // because it is a no-op when session context is empty.
  refreshSessionHeartbeatIfNeeded()

  try {
    switch (name) {
      case 'crane_preflight': {
        const input = preflightInputSchema.parse(args)
        const result = await executePreflight(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_sos': {
        const input = sosInputSchema.parse(args)
        const result = await executeSos(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      case 'crane_status': {
        const input = statusInputSchema.parse(args)
        const result = await executeStatus(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      case 'crane_ventures': {
        const input = venturesInputSchema.parse(args)
        const result = await executeVentures(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_context': {
        const input = contextInputSchema.parse(args)
        const result = await executeContext(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_doc_audit': {
        const input = docAuditInputSchema.parse(args)
        const result = await executeDocAudit(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      case 'crane_doc': {
        const input = docInputSchema.parse(args)
        const result = await executeDoc(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      case 'crane_handoff': {
        const input = handoffInputSchema.parse(args)
        const result = await executeHandoff(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_note': {
        const input = noteInputSchema.parse(args)
        const result = await executeNote(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_notes': {
        const input = notesInputSchema.parse(args)
        const result = await executeNotes(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      case 'crane_schedule': {
        const input = scheduleInputSchema.parse(args)
        const result = await executeSchedule(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      case 'crane_fleet_dispatch': {
        const input = fleetDispatchInputSchema.parse(args)
        const result = await executeFleetDispatch(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_fleet_status': {
        const input = fleetStatusInputSchema.parse(args)
        const result = await executeFleetStatus(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_notifications': {
        const input = notificationsInputSchema.parse(args)
        const result = await executeNotifications(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      case 'crane_notification_update': {
        const input = notificationUpdateInputSchema.parse(args)
        const result = await executeNotificationUpdate(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_deploy_heartbeat': {
        const input = deployHeartbeatInputSchema.parse(args)
        const result = await executeDeployHeartbeat(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      case 'crane_skill_audit': {
        const input = skillAuditInputSchema.parse(args)
        const result = await executeSkillAudit(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      case 'crane_skill_invoked': {
        const input = skillInvokeInputSchema.parse(args)
        const result = await executeSkillInvoke(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_skill_usage': {
        const input = skillUsageInputSchema.parse(args)
        const result = await executeSkillUsage(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      case 'crane_memory': {
        const input = memoryInputSchema.parse(args)
        const result = await executeMemory(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      case 'crane_memory_invoked': {
        const input = memoryInvokeInputSchema.parse(args)
        const result = await executeMemoryInvoke(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_memory_usage': {
        const input = memoryUsageInputSchema.parse(args)
        const result = await executeMemoryUsage(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      case 'crane_memory_audit': {
        const input = memoryAuditInputSchema.parse(args)
        const result = await executeMemoryAudit(input)
        const response = { content: [{ type: 'text' as const, text: result.message }] }
        logToolTokens(name, args, response, startMs)
        return response
      }

      default: {
        const errorResult = {
          isError: true as const,
          content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        }
        return errorResult
      }
    }
  } catch (error) {
    const errorResult = {
      isError: true as const,
      content: [
        {
          type: 'text' as const,
          text: `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    }
    logToolTokens(name, args, errorResult, startMs)
    return errorResult
  }
})

// Start server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)

  // Install the background heartbeat timer. This covers the edge case
  // where MCP tool calls go sparse for 10+ minutes (long bash runs,
  // test suites, sub-agent delegation). The timer is .unref()'d so it
  // does not prevent process exit when stdin closes.
  startHeartbeatTimer()

  console.error('crane-mcp server started')
}

main().catch((error) => {
  console.error('Failed to start crane-mcp:', error)
  process.exit(1)
})
