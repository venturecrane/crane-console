# Agent Session Lifecycle

This document describes the full lifecycle of an agent session in Crane Context, from creation through heartbeat maintenance to termination. Sessions are the unit of continuity that lets agents resume work, coordinate with siblings, and pass context across time.

## Overview

A session represents a single agent working on a specific venture and repository. Sessions are stored in the `sessions` table in D1, identified by prefixed ULIDs (`sess_<ULID>`). The system is designed so that agents never lose context - sessions either resume cleanly, hand off to the next session, or get marked as abandoned when the agent disappears.

## Session States

Sessions have three possible statuses:

| Status      | Meaning                                           |
| ----------- | ------------------------------------------------- |
| `active`    | Agent is currently working (heartbeat is fresh)   |
| `ended`     | Agent cleanly terminated the session via `/eod`   |
| `abandoned` | Session went stale (no heartbeat for 45+ minutes) |

### State Transitions

```
                    ┌─────────────┐
         /sod       │             │
     ───────────>   │   active    │
                    │             │
                    └──────┬──────┘
                           │
               ┌───────────┼───────────┐
               │           │           │
               ▼           ▼           ▼
         ┌──────────┐ ┌──────────┐ ┌──────────┐
         │  ended   │ │ ended    │ │abandoned │
         │ (manual) │ │(supersede│ │ (stale)  │
         └──────────┘ └──────────┘ └──────────┘
```

End reasons for terminated sessions:

| End Reason   | Trigger                                              |
| ------------ | ---------------------------------------------------- |
| `manual`     | Agent called `/eod` to cleanly end the session       |
| `stale`      | Heartbeat exceeded the 45-minute staleness threshold |
| `superseded` | A newer `/sod` call found multiple active sessions   |
| `error`      | Session ended due to an error condition              |

## Session Creation (POST /sod)

Sessions are created (or resumed) via `POST /sod`, typically triggered by the `crane_sod` MCP tool at the start of a work session. The `/sod` endpoint implements resume-or-create logic.

### Resume-or-Create Flow

1. **Find active sessions** matching the tuple: `(agent, venture, repo, track)`.
2. **Multiple sessions found**: Keep the most recent (by `last_heartbeat_at`), mark all others as `superseded`.
3. **Single session found, not stale**: Resume it by refreshing the heartbeat. Return `status: "resumed"`.
4. **Single session found, stale (>45 min)**: Mark it as `abandoned`, then create a new session. Return `status: "created"`.
5. **No active session found**: Create a new session. Return `status: "created"`.

### What /sod Returns

The `/sod` response is a comprehensive briefing that includes:

- **Session context** - session ID, status (resumed/created), full session record
- **Heartbeat schedule** - `next_heartbeat_at` with jitter, `heartbeat_interval_seconds`
- **Documentation index** - available docs for the venture (metadata by default, full content optional)
- **Scripts index** - available operational scripts
- **Doc audit** - missing or stale documentation report
- **Enterprise context** - executive summaries from VCMS notes tagged `executive-summary`
- **Knowledge base** - venture-relevant VCMS notes (PRDs, design specs, strategy, methodology, market research)
- **Last handoff** - the most recent handoff for this venture/repo/track

### Session Fields Set at Creation

| Field                     | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `id`                      | `sess_<ULID>` - sortable, timestamp-embedded        |
| `agent`                   | Agent identifier (e.g., `claude-cli-hostname`)      |
| `client`                  | CLI client type (claude-cli, gemini-cli, codex-cli) |
| `client_version`          | CLI version string                                  |
| `host`                    | Hostname of the machine                             |
| `venture`                 | Venture code (vc, ke, sc, dfg, dc)                  |
| `repo`                    | Repository in `owner/repo` format                   |
| `track`                   | Track number for parallel dev (nullable)            |
| `branch`                  | Git branch at session start                         |
| `commit_sha`              | Git commit at session start                         |
| `session_group_id`        | Group ID for multi-agent coordination (nullable)    |
| `meta_json`               | Freeform JSON metadata                              |
| `actor_key_id`            | SHA-256 derived key ID for attribution              |
| `creation_correlation_id` | Correlation ID from the creating request            |

## Heartbeat Protocol

Heartbeats keep sessions alive. Without regular heartbeats, a session will be marked as abandoned.

### Timing Parameters

| Parameter                    | Value        | Purpose                                          |
| ---------------------------- | ------------ | ------------------------------------------------ |
| `HEARTBEAT_INTERVAL_SECONDS` | 600 (10 min) | Base interval between heartbeats                 |
| `HEARTBEAT_JITTER_SECONDS`   | 120 (2 min)  | Random offset applied to prevent thundering herd |
| `STALE_AFTER_MINUTES`        | 45           | Session considered stale after this duration     |

### How Jitter Works

Each heartbeat response includes a `next_heartbeat_at` timestamp calculated as:

```
interval = 600 + random(-120, +120)  // 8 to 12 minutes
next_heartbeat_at = now + interval
```

This gives a 4.5x safety margin: even at the maximum interval (12 minutes), the agent has nearly four heartbeat opportunities before the 45-minute staleness threshold.

### Implicit Heartbeats

Not every heartbeat requires a dedicated `/heartbeat` call. The following operations all refresh `last_heartbeat_at`:

- `POST /sod` (session resume)
- `POST /update` (session metadata update)
- `POST /checkpoint` (mid-session progress save)
- `POST /heartbeat` (dedicated heartbeat)

An agent actively using `/update` or `/checkpoint` does not need separate heartbeat calls.

### Staleness Detection

A session is stale when:

```
last_heartbeat_at < (now - STALE_AFTER_MINUTES)
```

Stale sessions are not proactively cleaned up on a timer. Instead, staleness is evaluated on-demand when `/sod` checks for existing sessions to resume. A stale session found during `/sod` is marked `abandoned` (with `ended_at` set to `last_heartbeat_at`) and a fresh session is created.

## Mid-Session Updates (POST /update)

The `/update` endpoint lets an agent refresh its session metadata without ending the session. This is useful when an agent switches branches, makes significant progress, or starts working on a different issue.

### What Can Be Updated

| Field        | Description                                  |
| ------------ | -------------------------------------------- |
| `branch`     | Current git branch                           |
| `commit_sha` | Current git commit                           |
| `meta`       | Freeform JSON (issue number, priority, etc.) |

Fields set at creation (`venture`, `repo`, `track`, `agent`) cannot be changed via `/update`. If those need to change, the agent should end the session and start a new one.

### When to Use /update

- Switched to a new branch
- Started work on a different issue
- Reached a significant milestone
- Want to update visibility for other agents ("Agent X is on branch Y working on issue #123")

## Checkpoints (POST /checkpoint)

Checkpoints are mid-session snapshots of work progress. Unlike handoffs (which end the session), checkpoints record incremental progress while keeping the session active.

### Checkpoint Structure

| Field               | Description                                |
| ------------------- | ------------------------------------------ |
| `id`                | `cp_<ULID>` - sortable, timestamp-embedded |
| `session_id`        | Parent session                             |
| `checkpoint_number` | Auto-incrementing within the session       |
| `summary`           | Required text summary of progress          |
| `work_completed`    | Array of completed items                   |
| `blockers`          | Array of current blockers                  |
| `next_actions`      | Array of planned next steps                |
| `notes`             | Freeform additional notes                  |

Checkpoints are auto-numbered within each session (1, 2, 3, ...) and inherit venture/repo/track/branch/commit from the parent session at the time of creation.

### Querying Checkpoints

`GET /checkpoints` supports filtering by:

- `session_id` - checkpoints for a specific session
- `venture` - all checkpoints for a venture
- `repo` - combined with venture for finer filtering
- `track` - for parallel dev track isolation

## Session Groups

Session groups enable multi-agent coordination. When multiple agents work on the same venture and repository simultaneously, they share a `session_group_id` so they can discover each other.

### How Groups Work

1. The first agent starts a session with a `session_group_id` (typically set by the orchestrator).
2. Subsequent agents on the same venture/repo use the same `session_group_id`.
3. Any agent can query `GET /siblings?session_group_id=<id>` to discover sibling sessions.
4. The response excludes the querying agent's own session (via `exclude_session_id`).

### Sibling Session Summaries

The `/siblings` endpoint returns lightweight summaries (not full session records):

- Session ID, agent name, venture, repo, track
- Issue number and branch (what each agent is working on)
- Last heartbeat timestamp (how recently each agent was active)
- Creation timestamp

This enables coordination patterns like "Agent A is on branch feat/auth, Agent B is on branch feat/api" without requiring direct agent-to-agent communication.

## Handoff Creation (POST /eod)

Handoffs are the formal mechanism for passing context from one session to the next. The `/eod` endpoint ends the session and creates a handoff document in a single atomic operation.

### Handoff Structure

| Field          | Description                                |
| -------------- | ------------------------------------------ |
| `id`           | `ho_<ULID>` - sortable, timestamp-embedded |
| `session_id`   | The session that created this handoff      |
| `from_agent`   | Agent that created the handoff             |
| `to_agent`     | Optional target agent                      |
| `status_label` | One of: `in_progress`, `blocked`, `done`   |
| `summary`      | Required text summary of the session       |
| `payload`      | Structured JSON (max 800KB) with details   |

### EOD Flow

1. Agent synthesizes session context (conversation history, git log, PRs, issues).
2. Agent generates a handoff summary with sections: Accomplished, In Progress, Blocked, Next Session.
3. Agent shows the summary to the user for confirmation (single yes/no).
4. On confirmation, agent calls `crane_handoff` MCP tool (which calls `POST /eod`).
5. The endpoint creates the handoff record and sets the session status to `ended`.
6. The next session's `/sod` call retrieves this handoff as `last_handoff`.

### Handoff Payload Limits

Handoff payloads are capped at 800KB (D1 rows are limited to 1MB, leaving 200KB for metadata columns). Payloads are canonicalized and hashed for content addressing.

## Session Resume Logic

When an agent starts a new session with `/sod`, the system attempts to maintain continuity:

1. **Match criteria**: `agent` + `venture` + `repo` + `track` must all match an existing active session.
2. **Freshness check**: The matched session's `last_heartbeat_at` must be within the 45-minute threshold.
3. **Resume behavior**: If both conditions pass, the existing session is resumed (heartbeat refreshed), not replaced.
4. **Stale handling**: If the session is stale, it is marked `abandoned` and a new session is created.

This means an agent that crashes and restarts within 45 minutes seamlessly picks up its previous session. After 45 minutes, a clean break occurs and continuity passes through the handoff system.

## Status Queries (GET /active, /status)

### Active Sessions Query

`GET /active` returns currently active sessions filtered by:

- `agent` - specific agent
- `venture` - specific venture
- `repo` - specific repository

All filters are optional. When called with no filters, it returns all active sessions across the fleet.

### Status Display

The `/status` skill presents a consolidated view:

```
== Session Status ==
Session: sess_01HXY...
Age: 2h 15m
Venture: Venture Crane (vc)

== Tasks ==
In Progress: 2
  - Implement auth module
Pending: 1
  - Write tests

== Git ==
Branch: feat/auth
Changes: 3 staged, 1 unstaged
Remote: 2 ahead

== Context ==
Repo: venturecrane/crane-console
Dir: ~/dev/crane-console
Machine: dev-mac-01
```

## Timing Reference

```
 0 min    10 min     20 min     30 min     40 min     45 min
 │         │          │          │          │          │
 ├─────────┼──────────┼──────────┼──────────┼──────────┤
 │  HB 1   │  HB 2    │  HB 3    │  HB 4    │  STALE   │
 │         │          │          │          │          │
 ▼         ▼          ▼          ▼          ▼          ▼
/sod    ~10min     ~20min     ~30min     ~40min    Session
        ±2min      ±2min      ±2min      ±2min     marked
                                                  abandoned
```

At the base 10-minute interval, an agent gets approximately 4 heartbeat opportunities before the 45-minute threshold. The 2-minute jitter spreads heartbeat traffic across the fleet while maintaining a comfortable safety margin.

## Idempotency

All mutating session endpoints (`/sod`, `/eod`, `/update`) support idempotency keys via:

- `Idempotency-Key` HTTP header, or
- `update_id` field in the request body

Cached responses are stored for 1 hour (`IDEMPOTENCY_TTL_SECONDS = 3600`). Responses under 64KB are stored in full; larger ones store only a hash. Idempotency keys are scoped per endpoint, so the same key used on `/sod` and `/eod` will not conflict.
