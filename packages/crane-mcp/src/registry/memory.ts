import { memoryAuditInputSchema, executeMemoryAudit } from '../tools/memory-audit.js'
import {
  memoryInvokeInputSchema,
  executeMemoryInvoke,
  memoryUsageInputSchema,
  executeMemoryUsage,
} from '../tools/memory-invoke.js'
import { memoryInputSchema, executeMemory } from '../tools/memory.js'
import { makeEntry, type ToolEntry } from '../tool-runtime.js'

export const MEMORY_TOOLS: ToolEntry[] = [
  makeEntry(
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
    memoryInputSchema,
    executeMemory,
    true
  ),
  makeEntry(
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
    memoryInvokeInputSchema,
    executeMemoryInvoke,
    false
  ),
  makeEntry(
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
    memoryUsageInputSchema,
    executeMemoryUsage,
    true
  ),
  makeEntry(
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
    memoryAuditInputSchema,
    executeMemoryAudit,
    true
  ),
]
