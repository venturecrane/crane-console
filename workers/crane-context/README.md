# Crane Context Worker

Structured session and handoff management for multi-agent workflows.

**Version:** 1.0 (Phase 1)
**Specification:** ADR 025
**Deployed at:** `crane-context.automation-ab6.workers.dev`

---

## Overview

Crane Context replaces markdown-based EOD/SOD handoffs with a structured, queryable HTTP API. It provides:

- **Structured sessions** - Start/end tracking with heartbeat-based liveness
- **Typed handoffs** - JSON schema validation with canonical storage
- **Universal access** - Same HTTP API for CLI, Desktop, Web
- **Operational visibility** - Real-time view of active sessions across ventures

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Create D1 Database

```bash
wrangler d1 create crane-context-db
```

Copy the `database_id` from the output and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "crane-context-db"
database_id = "<your-database-id-here>"
```

### 3. Deploy Schema

```bash
# Local (for development)
npm run db:migrate:local

# Remote (for production)
npm run db:migrate
```

### 4. Set Secrets

```bash
wrangler secret put CONTEXT_RELAY_KEY
# Enter the same value as RELAY_SHARED_SECRET from crane-relay
```

### 5. Deploy Worker

```bash
npm run deploy
```

---

## API Endpoints

### POST /sod (Start of Day)

Start or resume a session, return context bundle.

**Headers:**
- `X-Relay-Key: <secret>` (required)
- `Content-Type: application/json`

**Request:**
```json
{
  "schema_version": "1.0",
  "agent": "cc-cli-host",
  "client": "cc-cli",
  "venture": "dfg",
  "repo": "durganfieldguide/dfg-console",
  "track": 1,
  "issue_number": 185
}
```

**Response:**
```json
{
  "session": {
    "id": "sess_01HQXV3NK8...",
    "status": "active",
    "created_at": "2026-01-17T10:00:00Z",
    "last_heartbeat_at": "2026-01-17T10:00:00Z",
    "schema_version": "1.0"
  },
  "last_handoff": { ... },
  "active_sessions": [ ... ]
}
```

### POST /eod (End of Day)

End session and store handoff.

**Headers:**
- `X-Relay-Key: <secret>` (required)
- `Idempotency-Key: <uuid>` (optional, uses session_id if not provided)

**Request:**
```json
{
  "schema_version": "1.0",
  "session_id": "sess_01HQXV3NK8...",
  "handoff": {
    "summary": "Completed authentication implementation",
    "status_label": "ready-for-review",
    "work_completed": ["Implemented JWT middleware"],
    "blockers": [],
    "next_actions": ["Review PR #123"]
  }
}
```

### POST /update

Mid-session checkpoint.

**Headers:**
- `X-Relay-Key: <secret>` (required)
- `Idempotency-Key: <uuid>` (required)

### POST /heartbeat

Keep session alive.

**Response:**
```json
{
  "session_id": "sess_01HQXV3NK8...",
  "last_heartbeat_at": "2026-01-17T14:30:00Z",
  "next_heartbeat_at": "2026-01-17T14:41:23Z",
  "heartbeat_interval_seconds": 683
}
```

### GET /active

List non-stale active sessions.

**Query Params:**
- `venture` (required) OR `repo` OR `agent` (at least one)
- `track` (optional)
- `limit` (default: 100)
- `cursor` (for pagination)

### GET /handoffs/latest

Get latest handoff by filters.

**Query Params:**
- `venture` (required)
- `repo`, `track`, `issue_number` (optional)

### GET /handoffs

Get handoff history (paginated).

---

## Configuration

### Environment Variables (wrangler.toml)

```toml
CONTEXT_SESSION_STALE_MINUTES = "45"    # Session staleness threshold
IDEMPOTENCY_TTL_SECONDS = "3600"        # 1 hour
HEARTBEAT_INTERVAL_SECONDS = "600"      # 10 minutes (base)
HEARTBEAT_JITTER_SECONDS = "120"        # ±2 minutes
```

### Secrets

```bash
CONTEXT_RELAY_KEY  # Shared key for authentication (same as relay)
```

---

## Development

### Local Development

```bash
npm run dev
```

Worker runs at `http://localhost:8787`

### Type Checking

```bash
npm run typecheck
```

### Testing

```bash
npm run test
```

### Database Operations

```bash
# View local database
wrangler d1 execute crane-context-db --local --command "SELECT * FROM sessions"

# View production database
wrangler d1 execute crane-context-db --remote --command "SELECT * FROM sessions"
```

---

## Key Concepts

### Idempotency

All mutating endpoints support idempotency:

- **Required:** POST /update (via `Idempotency-Key` header)
- **Optional:** POST /sod, POST /eod
- **Not needed:** POST /heartbeat (naturally idempotent)

Idempotency keys are scoped per endpoint. Same key can be used across different endpoints.

### Correlation IDs

Two types:

1. **X-Correlation-ID** (header) - Current request tracing ID
2. **creation_correlation_id** (stored) - Audit trail for entity creation

### Staleness Detection

Sessions become stale if `last_heartbeat_at > 45 minutes ago`.

Stale sessions are:
- Filtered out of `/active` queries
- Auto-closed when `/sod` tries to resume them

### Payload Limits

- Handoff payloads: **800KB max** (413 error if exceeded)
- Idempotency responses: **64KB full body**, hash-only beyond

---

## Architecture

### Data Flow

```
┌─────────────┐
│   Client    │ (CC CLI, Desktop, Web)
│  (Agent)    │
└──────┬──────┘
       │
       │ HTTP + X-Relay-Key
       ▼
┌─────────────────┐
│ Crane Context   │
│    Worker       │
│                 │
│ ┌─────────────┐ │
│ │ Auth        │ │
│ │ Middleware  │ │
│ └─────────────┘ │
│        │        │
│ ┌─────────────┐ │
│ │ Validation  │ │ (Ajv)
│ │  + Router   │ │
│ └─────────────┘ │
│        │        │
│ ┌─────────────┐ │
│ │ Idempotency │ │
│ │   Layer     │ │
│ └─────────────┘ │
│        │        │
│ ┌─────────────┐ │
│ │   Business  │ │
│ │    Logic    │ │
│ └─────────────┘ │
└────────┬────────┘
         │
         ▼
    ┌────────┐
    │   D1   │ (SQLite)
    └────────┘
```

### Database Schema

- **sessions** - Active and historical session records
- **handoffs** - Typed handoff payloads with canonical JSON
- **idempotency_keys** - Retry safety (1-hour TTL)
- **request_log** - Debugging and audit trail (7-day retention)

---

## Monitoring

### Key Metrics

- Session creation/end rate
- Stale session count (should be < 10)
- Idempotency hit rate
- Error rate by endpoint (should be < 5%)
- Database query latency (P95 < 100ms)

### Logs

```bash
# Tail production logs
wrangler tail --format pretty

# Filter errors only
wrangler tail --format pretty | grep ERROR
```

---

## Troubleshooting

### "Unauthorized" error
- Check `X-Relay-Key` header is set correctly
- Verify secret: `wrangler secret list`

### "Validation failed" error
- Check request body matches schema version 1.0
- Ensure all required fields are present
- Check payload size (800KB max for handoffs)

### Stale sessions not cleaning up
- Phase 1: Stale sessions remain as `status='active'` but filtered in queries
- Phase 2: Scheduled cleanup will mark as `status='abandoned'`

### Idempotency keys not working
- Verify `Idempotency-Key` header format (UUID recommended)
- Check TTL hasn't expired (1 hour default)
- Ensure endpoint + key combination is correct

---

## Phase 2 Features (Future)

- Scheduled cleanup jobs (Cron Trigger)
- Doc cache (KV/R2 integration)
- Per-agent tokens (replace shared key)
- Advanced observability (Axiom/Sentry)

---

## References

- **ADR:** `/docs/adr/025-crane-context-worker.md`
- **Issue:** #26
- **Related Workers:** `crane-relay`, `crane-command`
