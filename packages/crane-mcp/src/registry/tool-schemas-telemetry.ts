/**
 * Telemetry, audit, and verification tool schema declarations.
 * No logic, no imports. Part of the ListTools response; see tool-schemas.ts.
 */

export const TELEMETRY_TOOL_SCHEMAS = [
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
          description: 'Days without a git touch before a skill is considered stale. Default: 180.',
        },
        include_usage: {
          type: 'boolean',
          description:
            'Fetch skill invocation counts from the last 90 days and surface zero-usage candidates. Default: true.',
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
          description: 'Elapsed time in milliseconds (set when reporting completion or failure)',
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
        name: {
          type: 'string',
          description: 'kebab-case unique name for this memory (actions: save, update)',
        },
        description: {
          type: 'string',
          description: '1-2 sentence purpose statement (actions: save, update)',
        },
        kind: {
          type: 'string',
          enum: ['lesson', 'anti-pattern', 'runbook', 'incident'],
          description: '(actions: save, list, update, recall)',
        },
        scope: {
          default: 'enterprise',
          description: 'enterprise | global | venture:<code> (actions: save, list, update)',
          type: 'string',
        },
        owner: {
          default: 'captain',
          description: 'captain or agent-team (actions: save, update)',
          type: 'string',
        },
        status: {
          default: 'draft',
          type: 'string',
          enum: ['draft', 'stable'],
          description: '(actions: save, list, update)',
        },
        captain_approved: {
          default: false,
          type: 'boolean',
          description: '(actions: save, list, update)',
        },
        version: { default: '1.0.0', type: 'string', description: '(actions: save, update)' },
        severity: {
          description: 'Anti-patterns only (actions: save, update)',
          type: 'string',
          enum: ['P0', 'P1', 'P2'],
        },
        applies_when: {
          type: 'object',
          properties: {
            commands: { type: 'array', items: { type: 'string' } },
            files: { type: 'array', items: { type: 'string' } },
            skills: { type: 'array', items: { type: 'string' } },
          },
          description: '(actions: save, update)',
        },
        supersedes: {
          type: 'array',
          items: { type: 'string' },
          description: '(actions: save, update)',
        },
        supersedes_source: {
          type: 'array',
          items: { type: 'string' },
          description: '(actions: save, update)',
        },
        evidence_verify_ids: {
          description:
            'Verify-ledger row IDs that are evidence for this memory (populated by crane_verify_audit --apply). Each must match /^vfy_[26 Crockford]$/ (actions: save, update)',
          type: 'array',
          items: { type: 'string', pattern: '^vfy_[0-9A-HJKMNP-TV-Z]{26}$' },
        },
        last_validated_on: { type: 'string', description: '(actions: save, update)' },
        body: {
          type: 'string',
          description: 'Memory body content (the lesson/rule/procedure) (actions: save, update)',
        },
        venture: {
          description:
            'Venture code for venture-scoped memories (actions: save, list, update, recall)',
          type: 'string',
        },
        limit: { default: 20, type: 'number', description: '(actions: list, recall)' },
        id: {
          type: 'string',
          description: 'Note ID of the memory (actions: get, update, deprecate)',
        },
        reason: { description: 'Optional deprecation reason (actions: deprecate)', type: 'string' },
        repo: { type: 'string', description: '(actions: recall)' },
        files: {
          description: 'Currently active file paths (actions: recall)',
          type: 'array',
          items: { type: 'string' },
        },
        commands: {
          description: 'Recently used commands (actions: recall)',
          type: 'array',
          items: { type: 'string' },
        },
        skills: {
          description: 'Recently invoked skill names (actions: recall)',
          type: 'array',
          items: { type: 'string' },
        },
        query: {
          description:
            'Free-form text query. When set, uses FTS5 against memory bodies and titles, ranked by hybrid score (bm25 + applies_when + severity). Drops captain_approved_only default to false. (actions: recall)',
          type: 'string',
        },
        captain_approved_only: {
          default: false,
          description:
            'Defaults false. SOS injection path applies its own gate via MEMORY_INJECTION_GATE; pull recall returns drafts and stable so agents can ask broadly. (actions: recall)',
          type: 'boolean',
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
  {
    name: 'crane_docs_drift_audit',
    description:
      'Drift detection across the docs/ tree. Six checks: dead internal links, broken crane_doc references, deprecated-skill mentions, stale-by-git, sidebar drift, captain-review candidates. Report-only; no auto-fix.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          description:
            'Limit walk to one site-published subdir under docs/ (e.g., "runbooks"). Default: all.',
        },
        stale_threshold_days: {
          type: 'number',
          description: 'Days without a git touch before a doc is flagged as stale. Default: 180.',
        },
        severity_filter: {
          type: 'string',
          enum: ['error', 'warn', 'info', 'all'],
          description: 'Restrict findings to this severity level or higher. Default: all.',
        },
      },
    },
  },
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
          description: 'Set to head_tail when applying truncation convention for oversize output.',
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
  {
    name: 'crane_verify_audit',
    description:
      'Weekly verify-ledger audit (Prong 3). Composes a structured report: coverage gaps, unverified surface files, override audit, integrity samples, truncation drift, source distribution, and memory candidates. Auto-apply path (--apply) drafts memory notes from recurring patterns for Captain approval.',
    inputSchema: {
      type: 'object',
      properties: {
        window_days: {
          type: 'number',
          description: 'Audit window in days (1..90). Default: 7.',
        },
        auto_apply: {
          type: 'boolean',
          description:
            'When true, draft memory notes from memory_candidates via crane_memory.save (status=draft, captain_approved=false). Default: false (report-only).',
        },
        max_memory_candidates: {
          type: 'number',
          description:
            'Cap on memory candidates per audit run. Server enforces a hard ceiling of 20. Default: 5.',
        },
        fresh: {
          type: 'boolean',
          description:
            'Bypass the cached audit snapshot (recompute on the worker). Default: false.',
        },
      },
    },
  },
] as const
