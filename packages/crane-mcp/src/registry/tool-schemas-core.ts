/**
 * Core workflow tool schema declarations (session, docs, notes, scheduling, fleet).
 * No logic, no imports. Part of the ListTools response; see tool-schemas.ts.
 */

export const CORE_TOOL_SCHEMAS = [
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
          description: 'Return only title, scope, version, and character count - not full content.',
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
          description: 'Filter by tag (e.g., executive-summary, prd, strategy, methodology, bio)',
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
    name: 'crane_secret_check',
    description:
      'Verify Infisical secret presence WITHOUT returning values. Use this for "is this set?" queries instead of `infisical secrets` (which leaks values into the transcript). Returns key names only.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Infisical path, e.g. /vc/api',
        },
        env: {
          type: 'string',
          description: 'Infisical environment slug, e.g. prod',
        },
        names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific keys to check; omit to list all keys at the path',
        },
        includeImports: {
          type: 'boolean',
          description:
            'Include imported secrets from linked paths. Default false; imports can surface secrets from paths the caller did not intend.',
        },
      },
      required: ['path', 'env'],
    },
  },
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
] as const
