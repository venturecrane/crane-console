# CLAUDE.md - Crane Context Worker (Cloudflare Worker)

This file provides guidance for the Crane Context Worker.

## About Crane Context

Crane Context is the central infrastructure service for Venture Crane's agent session management, knowledge store, and operational coordination. It provides:

- Session lifecycle management (start-of-day, end-of-day, heartbeats, checkpoints)
- Handoff documents for agent-to-agent context passing
- Enterprise knowledge store (VCMS notes with tags and search)
- Operational documentation and script storage
- Machine registry with SSH mesh config generation
- Documentation audit system (missing/stale doc detection)
- MCP (Model Context Protocol) support for Claude Code integration

**Production URL:** https://crane-context.automation-ab6.workers.dev
**Staging URL:** https://crane-context-staging.automation-ab6.workers.dev

## Build Commands

```bash
# From workers/crane-context/
npm install             # Install dependencies
npm run dev             # Local dev server (wrangler dev)
npm run deploy          # Deploy to staging
npm run deploy:prod     # Deploy to production
npm run typecheck       # TypeScript validation (tsc --noEmit)
npm test                # Run tests (vitest)
```

## Tech Stack

- Cloudflare Workers (JavaScript runtime)
- Cloudflare D1 (SQLite database) - crane-context-db
- TypeScript with Zod validation (MCP layer)
- ULID-based identifiers (ulidx)
- Canonical JSON hashing (canonicalize)
- AJV for JSON Schema validation
- MCP Streamable HTTP transport (JSON-RPC 2.0)

## Infrastructure

### D1 Databases

| Environment | Database Name            | Binding |
| ----------- | ------------------------ | ------- |
| Staging     | crane-context-db-staging | `DB`    |
| Production  | crane-context-db-prod    | `DB`    |

### D1 Tables

| Table              | Purpose                               | Primary Key          |
| ------------------ | ------------------------------------- | -------------------- |
| `sessions`         | Agent session lifecycle tracking      | `id` (sess_ULID)     |
| `handoffs`         | Session handoff documents             | `id` (ho_ULID)       |
| `checkpoints`      | Mid-session work progress snapshots   | `id` (cp_ULID)       |
| `idempotency_keys` | Retry safety for mutating endpoints   | (endpoint, key)      |
| `request_log`      | Request audit trail (7-day retention) | `id` (ULID)          |
| `context_docs`     | Operational documentation storage     | (scope, doc_name)    |
| `context_scripts`  | Operational script storage            | (scope, script_name) |
| `doc_requirements` | Documentation audit manifest          | `id` (autoincrement) |
| `rate_limits`      | MCP endpoint rate limit counters      | `key`                |
| `machines`         | Machine registry for fleet management | `id` (mach_ULID)     |
| `notes`            | Enterprise knowledge store (VCMS)     | `id` (note_ULID)     |

### Configuration Variables (wrangler.toml)

```
CONTEXT_SESSION_STALE_MINUTES = "45"    # Session staleness threshold
IDEMPOTENCY_TTL_SECONDS = "3600"        # 1 hour idempotency window
HEARTBEAT_INTERVAL_SECONDS = "600"      # 10 min base heartbeat
HEARTBEAT_JITTER_SECONDS = "120"        # +/- 2 min jitter
```

## API Endpoints

All endpoints except `/health`, `/ventures`, and `OPTIONS` require authentication.

### Health & Configuration

| Method  | Path        | Auth | Description                 |
| ------- | ----------- | ---- | --------------------------- |
| GET     | `/health`   | None | Health check                |
| GET     | `/ventures` | None | List ventures with metadata |
| OPTIONS | `*`         | None | CORS preflight              |

### Session Lifecycle (X-Relay-Key auth)

| Method | Path           | Description                                  |
| ------ | -------------- | -------------------------------------------- |
| POST   | `/sod`         | Start of Day - resume or create session      |
| POST   | `/eod`         | End of Day - end session with handoff        |
| POST   | `/update`      | Update session fields (branch, commit, meta) |
| POST   | `/heartbeat`   | Refresh session heartbeat timestamp          |
| POST   | `/checkpoint`  | Save mid-session work progress               |
| GET    | `/checkpoints` | Query checkpoints by session/venture/track   |
| GET    | `/siblings`    | Query sibling sessions in same group         |

### Query Endpoints (X-Relay-Key auth)

| Method | Path               | Description                           |
| ------ | ------------------ | ------------------------------------- |
| GET    | `/active`          | Query active sessions by filters      |
| GET    | `/handoffs/latest` | Get most recent handoff for a context |
| GET    | `/handoffs`        | Query handoff history with pagination |

### Documentation (X-Relay-Key auth)

| Method | Path                     | Description                          |
| ------ | ------------------------ | ------------------------------------ |
| GET    | `/docs`                  | List document metadata for a venture |
| GET    | `/docs/audit`            | Run documentation audit              |
| GET    | `/docs/:scope/:doc_name` | Get single document with content     |

### Notes / VCMS (X-Relay-Key auth)

| Method | Path                 | Description                |
| ------ | -------------------- | -------------------------- |
| POST   | `/notes`             | Create a note              |
| GET    | `/notes`             | List/search notes          |
| GET    | `/notes/:id`         | Get single note            |
| POST   | `/notes/:id/update`  | Update a note              |
| POST   | `/notes/:id/archive` | Soft-delete (archive) note |

### Machine Registry (X-Relay-Key auth)

| Method | Path                        | Description                        |
| ------ | --------------------------- | ---------------------------------- |
| POST   | `/machines/register`        | Register or update machine         |
| GET    | `/machines`                 | List active machines               |
| POST   | `/machines/:id/heartbeat`   | Update machine last-seen timestamp |
| GET    | `/machines/ssh-mesh-config` | Generate SSH config fragment       |

### Admin Endpoints (X-Admin-Key auth)

| Method | Path                           | Description                    |
| ------ | ------------------------------ | ------------------------------ |
| POST   | `/admin/docs`                  | Upload or update documentation |
| GET    | `/admin/docs`                  | List all documentation (admin) |
| DELETE | `/admin/docs/:scope/:doc_name` | Delete documentation           |
| POST   | `/admin/scripts`               | Upload or update script        |
| GET    | `/admin/scripts`               | List all scripts (admin)       |
| DELETE | `/admin/scripts/:scope/:name`  | Delete script                  |
| POST   | `/admin/doc-requirements`      | Create/update doc requirement  |
| GET    | `/admin/doc-requirements`      | List doc requirements          |
| DELETE | `/admin/doc-requirements/:id`  | Delete doc requirement         |

### MCP Protocol (X-Relay-Key auth)

| Method | Path   | Description                                  |
| ------ | ------ | -------------------------------------------- |
| POST   | `/mcp` | MCP Streamable HTTP transport (JSON-RPC 2.0) |

MCP methods supported:

- `initialize` - Returns server capabilities and protocol version
- `tools/list` - Returns available tool definitions
- `tools/call` - Execute a tool (crane_sod, crane_eod, crane_handoff, crane_get_doc, crane_list_sessions)

Rate limited to 100 requests/minute per actor key.

## Auth Model

The worker uses two authentication mechanisms:

### X-Relay-Key (standard endpoints)

- Header: `X-Relay-Key`
- Secret: `CONTEXT_RELAY_KEY` (set via `wrangler secret put`)
- Validated with timing-safe comparison
- Actor identity derived as `SHA-256(key)[0:16]` (16 hex chars)
- Used for all session, query, notes, machine, and MCP endpoints

### X-Admin-Key (admin endpoints)

- Header: `X-Admin-Key`
- Secret: `CONTEXT_ADMIN_KEY` (set via `wrangler secret put`)
- Validated with timing-safe comparison
- Used for documentation/script/requirement management endpoints (`/admin/*`)

### Additional Security

- All mutating endpoints support idempotency keys (via `Idempotency-Key` header or request body)
- Correlation IDs generated per-request (`corr_<UUID>`) for tracing
- MCP endpoint has per-minute rate limiting (100 req/min per actor)
- Prepared statements used for all SQL queries

## Secrets Configuration

```bash
cd workers/crane-context

# Staging secrets (default, no --env flag)
wrangler secret put CONTEXT_RELAY_KEY
wrangler secret put CONTEXT_ADMIN_KEY

# Production secrets
wrangler secret put CONTEXT_RELAY_KEY --env production
wrangler secret put CONTEXT_ADMIN_KEY --env production
```

## Database Setup

```bash
# Apply migrations to staging
npm run db:migrate

# Apply migrations to production
npm run db:migrate:prod

# Local development
npm run db:migrate:local
```

Migration files live in `migrations/`. The consolidated schema is `migrations/schema.sql`.

## Deployment

```bash
# Deploy to staging (default)
npm run deploy

# Deploy to production
npm run deploy:prod

# Check logs (staging)
npx wrangler tail --format pretty

# Check logs (production)
npx wrangler tail --format pretty --env production
```

## Source Layout

```
workers/crane-context/
  src/
    index.ts              # Main router - all endpoint definitions
    types.ts              # TypeScript interfaces (Env, records, requests, responses)
    constants.ts          # Configuration constants, enums, venture config
    auth.ts               # X-Relay-Key validation, actor key derivation
    utils.ts              # Response builders, SHA-256, timing-safe compare
    sessions.ts           # Session CRUD, resume-or-create, heartbeat logic
    handoffs.ts           # Handoff CRUD, payload hashing, size validation
    checkpoints.ts        # Checkpoint CRUD, auto-numbering
    idempotency.ts        # Idempotency key storage, lookup, TTL
    docs.ts               # Documentation fetch, metadata queries
    scripts.ts            # Script fetch, metadata queries
    notes.ts              # Notes CRUD, search, enterprise context fetch
    machines.ts           # Machine registry, SSH mesh config generation
    audit.ts              # Documentation audit (missing/stale detection)
    schemas.ts            # JSON Schema definitions
    validation.ts         # Request validation helpers
    mcp.ts                # MCP protocol handler (JSON-RPC 2.0)
    endpoints/
      sessions.ts         # POST /sod, /eod, /update, /heartbeat, /checkpoint
      queries.ts          # GET /active, /handoffs, /docs, /ventures, /docs/audit
      admin.ts            # POST/GET/DELETE /admin/docs, /admin/scripts, /admin/doc-requirements
      machines.ts         # POST/GET /machines/*
      notes.ts            # POST/GET /notes/*
  migrations/
    schema.sql            # Consolidated schema (sessions, handoffs, idempotency, request_log)
    0003-0011             # Incremental migrations (docs, scripts, rate_limits, checkpoints, etc.)
  wrangler.toml           # Worker configuration, D1 bindings, env vars
  package.json            # Dependencies and scripts
  tsconfig.json           # TypeScript configuration
```

## Key Design Patterns

- **Resume-or-create sessions**: `/sod` checks for an existing active session matching agent/venture/repo/track before creating a new one. Sessions go stale after 45 minutes without a heartbeat.
- **Idempotency**: All mutating endpoints accept an `Idempotency-Key` header. Cached responses are stored for 1 hour. Responses under 64KB are stored in full; larger ones store only the hash.
- **Canonical hashing**: Handoff payloads are canonicalized (deterministic JSON) before hashing to ensure consistent content addressing.
- **Scope-based docs/scripts**: Documents and scripts are scoped as `global` (all ventures) or venture-specific (vc, sc, dfg). Queries return global + venture-specific results.
- **ULID identifiers**: All entity IDs use prefixed ULIDs (e.g., `sess_`, `ho_`, `note_`) for sortability and type safety.
- **Session groups**: Parallel agents share a `session_group_id` so they can discover siblings via `/siblings`.

## Common Issues

1. **Session not resuming** - Check that agent, venture, repo, and track all match an existing active session. Sessions older than 45 minutes are marked stale.
2. **401 Unauthorized** - Verify the correct key header is being sent: `X-Relay-Key` for standard endpoints, `X-Admin-Key` for `/admin/*`.
3. **Idempotency key conflicts** - Keys are scoped per-endpoint. The same key on different endpoints (e.g., `/sod` vs `/eod`) will not conflict.
4. **MCP rate limited** - The MCP endpoint limits to 100 requests per minute per actor key. Wait for the reset window.
5. **Migration errors** - Run migrations against the correct database. Use `npm run db:migrate` for staging and `npm run db:migrate:prod` for production.
6. **Payload too large** - Handoff payloads are capped at 800KB (D1 row limit is 1MB). Notes content is capped at 500KB. Documentation/scripts at 1MB/500KB respectively.
7. **Venture not recognized** - Ventures are loaded from `config/ventures.json`. Add new ventures there and redeploy.
