#!/usr/bin/env node
/**
 * crane-mcp - MCP server for Venture Crane development workflow
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { sodInputSchema, executeSod } from "./tools/sod.js";
import { venturesInputSchema, executeVentures } from "./tools/ventures.js";
import { contextInputSchema, executeContext } from "./tools/context.js";
import { handoffInputSchema, executeHandoff } from "./tools/handoff.js";
import { preflightInputSchema, executePreflight } from "./tools/preflight.js";
import { statusInputSchema, executeStatus } from "./tools/status.js";
import { planInputSchema, executePlan } from "./tools/plan.js";
import { docAuditInputSchema, executeDocAudit } from "./tools/doc-audit.js";

const server = new Server(
  {
    name: "crane-mcp",
    version: "0.2.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "crane_preflight",
        description:
          "Run environment preflight checks. Validates CRANE_CONTEXT_KEY, gh CLI auth, git repo, and API connectivity. " +
          "Call this before crane_sod to ensure environment is ready.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "crane_sod",
        description:
          "Start of Day - Initialize session, validate context, show P0 issues, weekly plan status, and active sessions. " +
          "Call this at the start of every session to ensure you're in the right place.",
        inputSchema: {
          type: "object",
          properties: {
            venture: {
              type: "string",
              description: "Venture code to work on (vc, ke, dfg, sc). Optional - if not provided, lists available ventures.",
            },
          },
        },
      },
      {
        name: "crane_status",
        description:
          "Get full GitHub issue breakdown: P0, ready, in-progress, blocked, and triage queues. " +
          "Use this when you need to see the complete work queue.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "crane_plan",
        description:
          "Read the weekly plan from docs/planning/WEEKLY_PLAN.md. " +
          "Shows priority venture, target issues, and plan age/staleness.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "crane_ventures",
        description:
          "List all available ventures with their repos and installation status.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "crane_context",
        description:
          "Get current session context - venture, repo, branch, and validation status.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "crane_doc_audit",
        description:
          "Run documentation audit for a venture. Shows missing, stale, and present docs. " +
          "Use fix=true to auto-generate and upload missing documentation.",
        inputSchema: {
          type: "object",
          properties: {
            venture: {
              type: "string",
              description:
                "Venture code to audit. If omitted, detects from current repo.",
            },
            all: {
              type: "boolean",
              description: "Audit all ventures",
            },
            fix: {
              type: "boolean",
              description: "Generate and upload missing docs",
            },
          },
        },
      },
      {
        name: "crane_handoff",
        description:
          "Create a handoff for end of session or when passing work to another agent/person.",
        inputSchema: {
          type: "object",
          properties: {
            summary: {
              type: "string",
              description: "Summary of work completed and any in-progress items",
            },
            status: {
              type: "string",
              enum: ["in_progress", "blocked", "done"],
              description: "Current status",
            },
            issue_number: {
              type: "number",
              description: "GitHub issue number if applicable",
            },
          },
          required: ["summary", "status"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "crane_preflight": {
        const input = preflightInputSchema.parse(args);
        const result = await executePreflight(input);
        return {
          content: [{ type: "text", text: result.message }],
        };
      }

      case "crane_sod": {
        const input = sodInputSchema.parse(args);
        const result = await executeSod(input);
        return {
          content: [{ type: "text", text: result.message }],
        };
      }

      case "crane_status": {
        const input = statusInputSchema.parse(args);
        const result = await executeStatus(input);
        return {
          content: [{ type: "text", text: result.message }],
        };
      }

      case "crane_plan": {
        const input = planInputSchema.parse(args);
        const result = await executePlan(input);
        return {
          content: [{ type: "text", text: result.message }],
        };
      }

      case "crane_ventures": {
        const input = venturesInputSchema.parse(args);
        const result = await executeVentures(input);
        return {
          content: [{ type: "text", text: result.message }],
        };
      }

      case "crane_context": {
        const input = contextInputSchema.parse(args);
        const result = await executeContext(input);
        return {
          content: [{ type: "text", text: result.message }],
        };
      }

      case "crane_doc_audit": {
        const input = docAuditInputSchema.parse(args);
        const result = await executeDocAudit(input);
        return {
          content: [{ type: "text", text: result.message }],
        };
      }

      case "crane_handoff": {
        const input = handoffInputSchema.parse(args);
        const result = await executeHandoff(input);
        return {
          content: [{ type: "text", text: result.message }],
        };
      }

      default:
        return {
          isError: true,
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
        };
    }
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("crane-mcp server started");
}

main().catch((error) => {
  console.error("Failed to start crane-mcp:", error);
  process.exit(1);
});
