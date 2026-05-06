import { deployHeartbeatInputSchema, executeDeployHeartbeat } from '../tools/deploy-heartbeat.js'
import { fleetDispatchInputSchema, executeFleetDispatch } from '../tools/fleet-dispatch.js'
import { fleetStatusInputSchema, executeFleetStatus } from '../tools/fleet-status.js'
import { makeEntry, type ToolEntry } from '../tool-runtime.js'

export const FLEET_TOOLS: ToolEntry[] = [
  makeEntry(
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
    fleetDispatchInputSchema,
    executeFleetDispatch,
    false
  ),
  makeEntry(
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
    fleetStatusInputSchema,
    executeFleetStatus,
    false
  ),
  makeEntry(
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
    deployHeartbeatInputSchema,
    executeDeployHeartbeat,
    true
  ),
]
