# MCP Server Architecture

The crane-mcp package is a Model Context Protocol (MCP) server that bridges AI agents to the crane-context REST API. It runs locally as a stdio process and provides agents with tools for session management, documentation access, knowledge store operations, scheduling, fleet orchestration, and notifications.

**Source files:**

- `packages/crane-mcp/src/index.ts` -- server setup and tool registration
- `packages/crane-mcp/src/tools/*.ts` -- tool implementations
- `packages/crane-mcp/src/lib/crane-api.ts` -- REST API client
- `workers/crane-context/src/index.ts` -- API route definitions
- `workers/crane-mcp-remote/src/index.ts` -- remote HTTP MCP server

## Architecture Overview

```
Agent (Claude, Gemini, Codex, Hermes)
    |
    | stdio (JSON-RPC 2.0 / MCP protocol)
    v
crane-mcp (local MCP server)
    |
    | HTTPS + X-Relay-Key header
    v
crane-context (Cloudflare Worker)
    |
    v
   D1 (SQLite database)
```

For remote/browser access (claude.ai, Claude Desktop):

```
claude.ai / Claude Desktop
    |
    | Streamable HTTP + GitHub OAuth
    v
crane-mcp-remote (Cloudflare Worker + Durable Object)
    |
    | HTTPS + X-Relay-Key header
    v
crane-context (Cloudflare Worker)
    |
    v
   D1
```

## How It Connects

### Local (stdio transport)

The primary deployment mode. The `crane` CLI launcher configures the agent to spawn `crane-mcp` as a child process communicating over stdin/stdout using the MCP stdio transport (`StdioServerTransport` from `@modelcontextprotocol/sdk`). The agent sends JSON-RPC 2.0 requests, and crane-mcp responds with tool results.

Configuration varies by agent:

- **Claude** -- `.mcp.json` in the repo root with `{"command": "crane-mcp"}`
- **Gemini** -- `.gemini/settings.json` with `mcpServers.crane` entry
- **Codex** -- `~/.codex/config.toml` with `[mcp_servers.crane]` section

### Remote (HTTP transport via crane-mcp-remote)

The `crane-mcp-remote` Cloudflare Worker serves a read-only subset of crane tools over Streamable HTTP for browser-based and remote MCP clients. It uses:

- **OAuthProvider** from `@cloudflare/workers-oauth-provider` for GitHub OAuth authentication
- **McpAgent** Durable Object from `agents/mcp` for per-session MCP protocol handling
- **CraneContextClient** to proxy API calls to the crane-context worker
- **KV** for OAuth storage and read cache fallback

Production URL: `https://crane-mcp-remote.automation-ab6.workers.dev`
Staging URL: `https://crane-mcp-remote-staging.automation-ab6.workers.dev`

## Authentication

### Local crane-mcp

The local server reads `CRANE_CONTEXT_KEY` from its process environment (injected by the `crane` launcher at startup). All requests to crane-context include this key in the `X-Relay-Key` HTTP header. The crane-context worker validates the key with a timing-safe comparison and derives an actor identity as `SHA-256(key)[0:16]` for audit logging.

### Remote crane-mcp-remote

Uses GitHub OAuth via the venturecrane-github App. Access is restricted to GitHub logins listed in the `ALLOWED_GITHUB_USERS` environment variable. Authenticated requests to crane-context use the worker's own `CRANE_CONTEXT_KEY` secret with an `X-Actor-Identity` header for audit trail.

## Complete Tool Inventory (Local crane-mcp)

The local MCP server registers 16 tools. Each tool validates input with Zod schemas and calls the crane-context REST API via the `CraneApi` client.

### Session Lifecycle

| Tool              | Description                                                                               | API Endpoint                   |
| ----------------- | ----------------------------------------------------------------------------------------- | ------------------------------ |
| `crane_preflight` | Validates environment: CRANE_CONTEXT_KEY, gh CLI auth, git repo, API connectivity         | `/health` (connectivity check) |
| `crane_sos`       | Start of Session -- initializes session, returns context, directives, alerts, work status | `POST /sos`                    |
| `crane_handoff`   | Creates end-of-session handoff summary for agent-to-agent context passing                 | `POST /eos`                    |
| `crane_context`   | Returns current session context: venture, repo, branch, validation status                 | (local state)                  |

### Work Management

| Tool           | Description                                                          | API Endpoint        |
| -------------- | -------------------------------------------------------------------- | ------------------- |
| `crane_status` | Full GitHub issue breakdown: P0, ready, in-progress, blocked, triage | (GitHub API via gh) |
| `crane_plan`   | Reads weekly plan from the cadence engine (`crane_schedule`)         | (local state)       |

### Venture & Documentation

| Tool              | Description                                                  | API Endpoint                 |
| ----------------- | ------------------------------------------------------------ | ---------------------------- |
| `crane_ventures`  | Lists all ventures with repos and installation status        | `GET /ventures`              |
| `crane_doc`       | Fetches a specific document by scope and name                | `GET /docs/:scope/:doc_name` |
| `crane_doc_audit` | Runs documentation audit; shows missing, stale, present docs | `GET /docs/audit`            |

### Knowledge Store (VCMS)

| Tool          | Description                                                  | API Endpoint                              |
| ------------- | ------------------------------------------------------------ | ----------------------------------------- |
| `crane_note`  | Creates or updates a note in the enterprise knowledge store  | `POST /notes` or `POST /notes/:id/update` |
| `crane_notes` | Searches and lists notes with venture, tag, and text filters | `GET /notes`                              |

### Scheduling (Cadence Engine)

| Tool             | Description                                                                           | API Endpoint                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `crane_schedule` | Multi-action tool: list briefing, complete items, manage planned events, view history | `GET /schedule/briefing`, `POST /schedule/:name/complete`, `GET/POST /planned-events`, `GET /sessions/history` |

### Fleet Operations

| Tool                   | Description                                                           | API Endpoint          |
| ---------------------- | --------------------------------------------------------------------- | --------------------- |
| `crane_fleet_dispatch` | Dispatches coding task to fleet machine via SSH; returns task_id      | (SSH + local scripts) |
| `crane_fleet_status`   | Checks task status on fleet machines or PR/CI status for given issues | (SSH or GitHub API)   |

### Notifications

| Tool                        | Description                                                          | API Endpoint                     |
| --------------------------- | -------------------------------------------------------------------- | -------------------------------- |
| `crane_notifications`       | Lists CI/CD notifications from GitHub Actions and Vercel deployments | `GET /notifications`             |
| `crane_notification_update` | Updates notification status (acknowledge or resolve)                 | `POST /notifications/:id/status` |

### Observability

| Tool                 | Description                                                   | API Endpoint |
| -------------------- | ------------------------------------------------------------- | ------------ |
| `crane_token_report` | Shows estimated token usage by tool, venture, and time period | (local data) |

## Complete Tool Inventory (Remote crane-mcp-remote)

The remote server exposes a read-only subset (plus schedule completion) of 9 tools:

| Tool                    | Description                                                                   |
| ----------------------- | ----------------------------------------------------------------------------- |
| `crane_briefing`        | Portfolio dashboard: schedule, active sessions, handoffs, executive summaries |
| `crane_ventures`        | List all ventures with metadata                                               |
| `crane_doc`             | Fetch a documentation document by scope and name                              |
| `crane_doc_audit`       | Run documentation audit for one or all ventures                               |
| `crane_notes`           | Search and list VCMS notes                                                    |
| `crane_note_read`       | Read full content of a specific note by ID                                    |
| `crane_schedule`        | View or complete cadence items (list and complete actions only)               |
| `crane_handoffs`        | Query handoff history                                                         |
| `crane_active_sessions` | List currently active agent sessions                                          |

Tools requiring local resources (filesystem, gh CLI, SSH) are excluded from the remote server.

## How Tools Map to crane-context API Endpoints

The `CraneApi` class in `packages/crane-mcp/src/lib/crane-api.ts` provides typed methods for every crane-context endpoint. Key mappings:

| CraneApi Method              | HTTP Method | Endpoint                        |
| ---------------------------- | ----------- | ------------------------------- |
| `getVentures()`              | GET         | `/ventures`                     |
| `startSession()`             | POST        | `/sos`                          |
| `createHandoff()`            | POST        | `/eos`                          |
| `getDocAudit()`              | GET         | `/docs/audit`                   |
| `getDoc()`                   | GET         | `/docs/:scope/:doc_name`        |
| `uploadDoc()`                | POST        | `/admin/docs`                   |
| `createNote()`               | POST        | `/notes`                        |
| `listNotes()`                | GET         | `/notes`                        |
| `getNote()`                  | GET         | `/notes/:id`                    |
| `updateNote()`               | POST        | `/notes/:id/update`             |
| `archiveNote()`              | POST        | `/notes/:id/archive`            |
| `getScheduleBriefing()`      | GET         | `/schedule/briefing`            |
| `completeScheduleItem()`     | POST        | `/schedule/:name/complete`      |
| `getScheduleItems()`         | GET         | `/schedule/items`               |
| `linkScheduleCalendar()`     | POST        | `/schedule/:name/link-calendar` |
| `getPlannedEvents()`         | GET         | `/planned-events`               |
| `createPlannedEvent()`       | POST        | `/planned-events`               |
| `updatePlannedEvent()`       | PATCH       | `/planned-events/:id`           |
| `clearPlannedEvents()`       | DELETE      | `/planned-events`               |
| `getSessionHistory()`        | GET         | `/sessions/history`             |
| `listMachines()`             | GET         | `/machines`                     |
| `registerMachine()`          | POST        | `/machines/register`            |
| `getSshMeshConfig()`         | GET         | `/machines/ssh-mesh-config`     |
| `listNotifications()`        | GET         | `/notifications`                |
| `updateNotificationStatus()` | POST        | `/notifications/:id/status`     |
| `queryHandoffs()`            | GET         | `/handoffs`                     |
| `upsertWorkDay()`            | POST        | `/work-day`                     |

## Token Usage Tracking

The local crane-mcp server includes lightweight token estimation. After each tool call, `logToolTokens()` estimates input and output token counts based on character length (using a ratio of 3.5 chars/token for structured tools, 4.0 for text-heavy tools). Usage data is stored in memory and surfaced via the `crane_token_report` tool.

## crane-context API Overview

The crane-context Cloudflare Worker (`workers/crane-context/`) is the backend that crane-mcp calls. Key endpoint groups:

- **Session lifecycle** -- `/sos`, `/eos`, `/update`, `/heartbeat`, `/checkpoint`
- **Queries** -- `/active`, `/handoffs`, `/handoffs/latest`, `/sessions/history`
- **Documentation** -- `/docs`, `/docs/audit`, `/docs/:scope/:doc_name`
- **Notes (VCMS)** -- `/notes` CRUD with search, tagging, and archival
- **Schedule** -- `/schedule/briefing`, `/schedule/items`, `/schedule/:name/complete`
- **Planned events** -- `/planned-events` CRUD
- **Machine registry** -- `/machines`, `/machines/register`, `/machines/ssh-mesh-config`
- **Notifications** -- `/notifications`, `/notifications/ingest`, `/notifications/:id/status`
- **Admin** -- `/admin/docs`, `/admin/scripts`, `/admin/doc-requirements`
- **Health** -- `/health` (no auth required)
- **Config** -- `/ventures` (no auth required)
- **MCP** -- `/mcp` (JSON-RPC 2.0 over HTTP, rate-limited to 100 req/min per actor)

All endpoints except `/health`, `/ventures`, and `OPTIONS` require authentication via `X-Relay-Key` (standard) or `X-Admin-Key` (admin).
