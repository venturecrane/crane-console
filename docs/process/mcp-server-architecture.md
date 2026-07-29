# MCP Server Architecture

The crane-mcp package is a Model Context Protocol (MCP) server that bridges AI agents to the crane-context REST API. It runs locally as a stdio process and provides agents with tools for session management, documentation access, knowledge store operations, scheduling, fleet orchestration, and notifications.

**Source files:**

- `packages/crane-mcp/src/index.ts` -- server setup and tool registration
- `packages/crane-mcp/src/tools/*.ts` -- tool implementations
- `packages/crane-mcp/src/lib/crane-api.ts` -- REST API client
- `workers/crane-context/src/index.ts` -- API route definitions

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

## How It Connects

### Local (stdio transport)

The primary deployment mode. The `crane` CLI launcher configures the agent to spawn `crane-mcp` as a child process communicating over stdin/stdout using the MCP stdio transport (`StdioServerTransport` from `@modelcontextprotocol/sdk`). The agent sends JSON-RPC 2.0 requests, and crane-mcp responds with tool results.

Configuration varies by agent:

- **Claude** -- `.mcp.json` in the repo root with `{"command": "crane-mcp"}`
- **Gemini** -- `.gemini/settings.json` with `mcpServers.crane` entry
- **Codex** -- `~/.codex/config.toml` with `[mcp_servers.crane]` section

## Authentication

### Local crane-mcp

The local server reads `CRANE_CONTEXT_KEY` from its process environment (injected by the `crane` launcher at startup). All requests to crane-context include this key in the `X-Relay-Key` HTTP header. The crane-context worker validates the key with a timing-safe comparison and derives an actor identity as `SHA-256(key)[0:16]` for audit logging.

## Complete Tool Inventory (Local crane-mcp)

The local MCP server registers 30 tools. Each tool validates input with Zod schemas and calls the crane-context REST API via the `CraneApi` client.

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

Token usage is tracked in-memory by the local crane-mcp server via `logToolTokens()` after each tool call. This data is session-scoped and resets on restart.

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

The local crane-mcp server includes lightweight token estimation. After each tool call, `logToolTokens()` estimates input and output token counts based on character length (using a ratio of 3.5 chars/token for structured tools, 4.0 for text-heavy tools). Usage data is stored in memory for the duration of the session.

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

All endpoints except `/health`, `/ventures`, and `OPTIONS` require authentication via `X-Relay-Key` (standard) or `X-Admin-Key` (admin).
