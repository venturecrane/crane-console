#!/usr/bin/env node
/**
 * crane-mcp - MCP server for Venture Crane development workflow
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { sodInputSchema, executeSod } from './tools/sod.js'
import { venturesInputSchema, executeVentures } from './tools/ventures.js'
import { contextInputSchema, executeContext } from './tools/context.js'
import { handoffInputSchema, executeHandoff } from './tools/handoff.js'
import { preflightInputSchema, executePreflight } from './tools/preflight.js'
import { statusInputSchema, executeStatus } from './tools/status.js'
import { planInputSchema, executePlan } from './tools/plan.js'
import { docAuditInputSchema, executeDocAudit } from './tools/doc-audit.js'
import { noteInputSchema, executeNote } from './tools/notes.js'
import { notesInputSchema, executeNotes } from './tools/notes.js'

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
        description:
          'Run environment preflight checks. Validates CRANE_CONTEXT_KEY, gh CLI auth, git repo, and API connectivity. ' +
          'Call this before crane_sod to ensure environment is ready.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'crane_sod',
        description:
          'Start of Day - Initialize session, validate context, show P0 issues, weekly plan status, and active sessions. ' +
          "Call this at the start of every session to ensure you're in the right place.",
        inputSchema: {
          type: 'object',
          properties: {
            venture: {
              type: 'string',
              description:
                'Venture code to work on (vc, ke, dfg, sc). Optional - if not provided, lists available ventures.',
            },
          },
        },
      },
      {
        name: 'crane_status',
        description:
          'Get full GitHub issue breakdown: P0, ready, in-progress, blocked, and triage queues. ' +
          'Use this when you need to see the complete work queue.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'crane_plan',
        description:
          'Read the weekly plan from docs/planning/WEEKLY_PLAN.md. ' +
          'Shows priority venture, target issues, and plan age/staleness.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'crane_ventures',
        description: 'List all available ventures with their repos and installation status.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'crane_context',
        description: 'Get current session context - venture, repo, branch, and validation status.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'crane_doc_audit',
        description:
          'Run documentation audit for a venture. Shows missing, stale, and present docs. ' +
          'Use fix=true to auto-generate and upload missing documentation.',
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
        name: 'crane_handoff',
        description:
          'Create a handoff for end of session or when passing work to another agent/person.',
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
          },
          required: ['summary', 'status'],
        },
      },
      {
        name: 'crane_note',
        description:
          'Create or update a note in the enterprise knowledge store. ' +
          'Use when the Captain says: "log:", "remember:", "save contact:", "note:", "idea:", "governance:", or "update note".',
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
            category: {
              type: 'string',
              enum: ['log', 'reference', 'contact', 'idea', 'governance'],
              description: 'Note category (required for create)',
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
              description: 'Optional tags for categorization',
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
        description:
          'Search and list notes from the enterprise knowledge store. ' +
          'Use when the Captain asks: "what\'s our...", "show recent...", "find the note about...".',
        inputSchema: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['log', 'reference', 'contact', 'idea', 'governance'],
              description: 'Filter by category',
            },
            venture: {
              type: 'string',
              description: 'Filter by venture code',
            },
            tag: {
              type: 'string',
              description: 'Filter by tag',
            },
            q: {
              type: 'string',
              description: 'Text search in title and content',
            },
            limit: {
              type: 'number',
              description: 'Maximum results to return (default 20)',
            },
          },
        },
      },
    ],
  }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'crane_preflight': {
        const input = preflightInputSchema.parse(args)
        const result = await executePreflight(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_sod': {
        const input = sodInputSchema.parse(args)
        const result = await executeSod(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_status': {
        const input = statusInputSchema.parse(args)
        const result = await executeStatus(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      case 'crane_plan': {
        const input = planInputSchema.parse(args)
        const result = await executePlan(input)
        return {
          content: [{ type: 'text', text: result.message }],
        }
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
        return {
          content: [{ type: 'text', text: result.message }],
        }
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
        return {
          content: [{ type: 'text', text: result.message }],
        }
      }

      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        }
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
    }
  }
})

// Start server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('crane-mcp server started')
}

main().catch((error) => {
  console.error('Failed to start crane-mcp:', error)
  process.exit(1)
})
