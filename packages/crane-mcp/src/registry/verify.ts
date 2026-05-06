import {
  verifyInputSchema,
  executeVerify,
  claimOriginInputSchema,
  executeClaimOrigin,
} from '../tools/verify.js'
import { makeEntry, type ToolEntry } from '../tool-runtime.js'

export const VERIFY_TOOLS: ToolEntry[] = [
  makeEntry(
    {
      name: 'crane_verify',
      description:
        'Record a verification artifact in the cross-session ledger. Use when checking root cause, hitting live state, running fresh process, or fetching vendor docs — capture output with whatever tool fits (Bash/Context7/gh_api/wrangler), then submit here. Methods: live_state, fresh_process, vendor_docs. fresh_process and live_state require `command`. Best-effort telemetry; never blocks. See docs/global/verify.md for the playbook.',
      inputSchema: {
        type: 'object',
        properties: {
          method: {
            type: 'string',
            enum: ['live_state', 'fresh_process', 'vendor_docs'],
            description:
              'live_state: hit a real source (gh api, wrangler tail, env var). fresh_process: run a command in a clean shell. vendor_docs: fetched current docs (Context7).',
          },
          claim: {
            type: 'string',
            description: 'What is supposedly true after this verification. Max 300 chars.',
          },
          output: {
            type: 'string',
            description:
              'Literal output captured by the agent. Max 8KB; oversize must use head_tail convention (first 4KB + sentinel + last 4KB).',
          },
          tool_used: {
            type: 'string',
            enum: ['Bash', 'Context7', 'WebFetch', 'gh_api', 'wrangler', 'vendor_mcp', 'other'],
            description:
              'Which tool produced the output. Pick the closest match; "other" only if none fit.',
          },
          command: {
            type: 'string',
            description:
              'The command/query that produced output. REQUIRED for fresh_process and live_state.',
          },
          files_touched: {
            type: 'array',
            items: { type: 'string' },
            description:
              'File paths this verification relates to. Used by claim_origin lookups when regressions surface.',
          },
          fresh_runtime: {
            type: 'boolean',
            description:
              'Did output come from a fresh process? PR 2 EOS gate reads this for runtime-config claims.',
          },
          fresh_runtime_justification: {
            type: 'string',
            description:
              'Required by PR 2 gate when fresh_runtime is false on a runtime-config claim.',
          },
          output_truncation: {
            type: 'string',
            enum: ['none', 'head', 'tail', 'head_tail'],
            description:
              'Set to head_tail when applying truncation convention for oversize output.',
          },
          source: {
            type: 'string',
            enum: ['manual', 'tool', 'hook'],
            description: 'Defaults to "tool". Use "manual" for Captain-initiated records.',
          },
          session_id: {
            type: 'string',
            description: 'Current session ID if known',
          },
        },
        required: ['method', 'claim', 'output', 'tool_used'],
      },
    },
    verifyInputSchema,
    executeVerify,
    false
  ),
  makeEntry(
    {
      name: 'crane_claim_origin',
      description:
        'Look up prior verifications that touched a given file path. Used when investigating a regression to find the originating session/claim. Returns claim text, verify_id, method, session_id, and timestamp for the most recent N records (capped at 50).',
      inputSchema: {
        type: 'object',
        properties: {
          file: {
            type: 'string',
            description: 'File path to look up prior claims for',
          },
          since: {
            type: 'string',
            description:
              'Lookback window: ISO date OR relative format like "30d"/"90d". Default: 90d.',
          },
          limit: {
            type: 'number',
            description: 'Max results (1-50). Default: 50.',
          },
        },
        required: ['file'],
      },
    },
    claimOriginInputSchema,
    executeClaimOrigin,
    true
  ),
]
