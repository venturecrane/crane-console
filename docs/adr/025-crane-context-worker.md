# ADR 025: Crane Context Worker - Implementation Specification

**Status:** Approved
**Date:** 2026-01-17
**Decision Makers:** Captain, Senior Engineering Team
**Consulted:** 4 independent design reviews + PM review

---

## Context

Current context sharing between agents is fragmented and slow:
- Handoff files committed to repos require git sync
- Unstructured markdown varies in quality and completeness
- Repo-scoped — no cross-venture visibility
- Different access patterns for CC CLI (filesystem) vs Desktop (tooling)
- No real-time view of "who's working on what"
- No deterministic handling of forgotten/abandoned sessions

**Solution:** Build Crane Context Worker — a Cloudflare Worker + D1 database providing:
1. Structured session tracking with agent identity + heartbeat-based liveness
2. Typed handoffs with JSON schema validation and canonical storage
3. Universal HTTP API for any agent on any platform
4. Operational visibility via queryable active sessions and handoff history

---

## Decision

Build Crane Context as a Cloudflare Worker with the following architecture:

### Core Principles

1. **Separation of Concerns**
   - GitHub owns: Work artifacts (issues, PRs, code, specs)
   - Crane Context owns: Operational state (sessions, handoffs)

2. **Retry Safety First**
   - All mutating endpoints are idempotent
   - 1-hour TTL on idempotency keys
   - Hybrid storage: full response <64KB, hash-only otherwise

3. **Staleness Detection**
   - Based on `last_heartbeat_at` (not updated_at)
   - 45-minute threshold (configurable via env var)
   - 10-minute heartbeat interval with ±2min server-side jitter

4. **Data Lifecycle**
   - Phase 1: Filter stale sessions in queries
   - Phase 2: Scheduled cleanup (mark abandoned, delete old records)

---

## Implementation Specification

### Schema (D1 Database)

#### Sessions Table

```sql
CREATE TABLE sessions (
  -- Identity
  id TEXT PRIMARY KEY,                    -- sess_<ULID>

  -- Session context
  agent TEXT NOT NULL,                    -- cc-cli-host, desktop-pm-1
  client TEXT,                            -- cc-cli, claude-desktop
  client_version TEXT,                    -- 1.2.3
  host TEXT,                              -- crane1, user-laptop
  venture TEXT NOT NULL,                  -- vc, sc, dfg
  repo TEXT NOT NULL,                     -- owner/repo
  track INTEGER,                          -- nullable (non-tracked work)
  issue_number INTEGER,
  branch TEXT,
  commit_sha TEXT,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active', -- active, ended, abandoned
  created_at TEXT NOT NULL,              -- ISO 8601
  started_at TEXT NOT NULL,              -- Same as created_at (semantic)
  last_heartbeat_at TEXT NOT NULL,       -- Drives staleness detection
  ended_at TEXT,
  end_reason TEXT,                       -- manual, stale, superseded, error

  -- Schema versioning
  schema_version TEXT NOT NULL DEFAULT '1.0',

  -- Attribution & tracing
  actor_key_id TEXT NOT NULL,            -- SHA-256(key)[0:16] = 16 hex chars
  creation_correlation_id TEXT NOT NULL, -- corr_<UUID> from POST /sod

  -- Extensibility
  meta_json TEXT
);

-- Indexes
CREATE INDEX idx_sessions_resume ON sessions(
  agent, venture, repo, track, status, last_heartbeat_at DESC
);

CREATE INDEX idx_sessions_active ON sessions(
  venture, repo, track, status, last_heartbeat_at DESC
);

CREATE INDEX idx_sessions_global_active ON sessions(
  status, last_heartbeat_at DESC
);

CREATE INDEX idx_sessions_agent ON sessions(
  agent, status, last_heartbeat_at DESC
);

CREATE INDEX idx_sessions_cleanup ON sessions(
  last_heartbeat_at
) WHERE status = 'active';
```

#### Handoffs Table

```sql
CREATE TABLE handoffs (
  -- Identity
  id TEXT PRIMARY KEY,                   -- ho_<ULID>

  -- Linkage
  session_id TEXT NOT NULL,              -- FK to sessions (app-enforced)

  -- Context (denormalized for query performance)
  venture TEXT NOT NULL,
  repo TEXT NOT NULL,
  track INTEGER,
  issue_number INTEGER,
  branch TEXT,
  commit_sha TEXT,

  -- Handoff metadata
  from_agent TEXT NOT NULL,
  to_agent TEXT,
  status_label TEXT,                     -- blocked, in-progress, ready
  summary TEXT NOT NULL,                 -- Plain text (fast queries)

  -- Payload (max 800KB enforced at application layer)
  payload_json TEXT NOT NULL,            -- Canonical JSON
  payload_hash TEXT NOT NULL,            -- SHA-256(payload_json)
  payload_size_bytes INTEGER NOT NULL,   -- Actual size for monitoring
  schema_version TEXT NOT NULL,          -- 1.0, 1.1, etc.

  -- Attribution & tracing
  created_at TEXT NOT NULL,
  actor_key_id TEXT NOT NULL,            -- SHA-256(key)[0:16] = 16 hex chars
  creation_correlation_id TEXT NOT NULL  -- corr_<UUID> from POST /eod
);

-- Indexes
CREATE INDEX idx_handoffs_issue ON handoffs(
  venture, repo, issue_number, created_at DESC
);

CREATE INDEX idx_handoffs_track ON handoffs(
  venture, repo, track, created_at DESC
);

CREATE INDEX idx_handoffs_session ON handoffs(
  session_id, created_at DESC
);

CREATE INDEX idx_handoffs_agent ON handoffs(
  from_agent, created_at DESC
);
```

#### Idempotency Table

```sql
CREATE TABLE idempotency_keys (
  -- Composite primary key for endpoint scoping
  endpoint TEXT NOT NULL,                -- /sod, /eod, /update
  key TEXT NOT NULL,                     -- Client-provided UUID
  PRIMARY KEY (endpoint, key),

  -- Response storage (hybrid: full body if <64KB)
  response_status INTEGER NOT NULL,
  response_hash TEXT NOT NULL,           -- SHA-256(response_body)
  response_body TEXT,                    -- Stored if <64KB, NULL otherwise
  response_size_bytes INTEGER NOT NULL,  -- Actual size
  response_truncated BOOLEAN DEFAULT 0,  -- 1 if >64KB

  -- TTL (1 hour)
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,

  -- Attribution
  actor_key_id TEXT NOT NULL,            -- SHA-256(key)[0:16] = 16 hex chars
  correlation_id TEXT NOT NULL           -- Request that stored this key
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
CREATE INDEX idx_idempotency_created ON idempotency_keys(created_at);
```

#### Request Log Table

```sql
CREATE TABLE request_log (
  id TEXT PRIMARY KEY,                   -- ULID

  -- Request metadata
  timestamp TEXT NOT NULL,
  correlation_id TEXT NOT NULL,          -- corr_<UUID> for this request
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,

  -- Context
  actor_key_id TEXT NOT NULL,            -- SHA-256(key)[0:16] = 16 hex chars
  agent TEXT,
  venture TEXT,
  repo TEXT,
  track INTEGER,
  issue_number INTEGER,

  -- Response
  status_code INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_message TEXT,

  -- Idempotency (if applicable)
  idempotency_key TEXT,
  idempotency_hit BOOLEAN DEFAULT 0      -- 1 if served from cache
);

CREATE INDEX idx_request_log_ts ON request_log(timestamp DESC);
CREATE INDEX idx_request_log_correlation ON request_log(correlation_id);
CREATE INDEX idx_request_log_errors ON request_log(status_code, timestamp DESC)
  WHERE status_code >= 400;
CREATE INDEX idx_request_log_endpoint ON request_log(endpoint, timestamp DESC);
```

---

### API Endpoints

#### POST /sod (Start of Day)

**Purpose:** Start or resume a session, return context bundle

**Request:**
```json
{
  "schema_version": "1.0",
  "agent": "cc-cli-host",
  "client": "cc-cli",
  "client_version": "1.2.3",
  "host": "crane1",
  "venture": "dfg",
  "repo": "durganfieldguide/dfg-console",
  "track": 1,
  "issue_number": 185,
  "branch": "feature/185-implement-auth",
  "commit_sha": "abc123def456"
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
  "last_handoff": {
    "id": "ho_01HQXV2NK8...",
    "summary": "Implemented user authentication",
    "status_label": "in-progress",
    "created_at": "2026-01-16T18:00:00Z"
  },
  "active_sessions": [
    {
      "agent": "desktop-pm-1",
      "track": 2,
      "issue_number": 200,
      "last_heartbeat_at": "2026-01-17T09:55:00Z"
    }
  ]
}
```

**Headers:**
- `X-Correlation-ID: corr_550e8400-e29b-...`

**Idempotency:** Natural (returns existing session if tuple matches)

**Behavior:**
1. Find existing active session for `(agent, venture, repo, track)`
2. If multiple found, keep most recent, mark others superseded
3. If found and stale (>45min), mark abandoned and create new
4. If found and active, refresh heartbeat and return
5. Otherwise create new session

---

#### POST /eod (End of Day)

**Purpose:** End session and store handoff

**Request:**
```json
{
  "schema_version": "1.0",
  "session_id": "sess_01HQXV3NK8...",
  "handoff": {
    "summary": "Completed user authentication implementation",
    "status_label": "ready-for-review",
    "work_completed": [
      "Implemented JWT authentication middleware",
      "Added login/logout endpoints",
      "Created user session management"
    ],
    "blockers": [],
    "next_actions": [
      "Review PR #123",
      "Test authentication flow",
      "Update documentation"
    ]
  }
}
```

**Headers:**
- `Idempotency-Key: <optional-uuid>` (uses session_id if not provided)

**Response:**
```json
{
  "session_id": "sess_01HQXV3NK8...",
  "handoff_id": "ho_01HQXV4NK8...",
  "ended_at": "2026-01-17T18:00:00Z"
}
```

**Idempotency:** Yes (ending ended session is no-op)

---

#### POST /update

**Purpose:** Mid-session checkpoint (update session state)

**Request:**
```json
{
  "schema_version": "1.0",
  "session_id": "sess_01HQXV3NK8...",
  "branch": "feature/185-implement-auth",
  "commit_sha": "def456abc789",
  "meta": {
    "last_file_edited": "src/auth/middleware.ts"
  }
}
```

**Headers:**
- `Idempotency-Key: <required-uuid>`

**Response:**
```json
{
  "session_id": "sess_01HQXV3NK8...",
  "updated_at": "2026-01-17T14:30:00Z"
}
```

**Idempotency:** Required (reject 400 if missing)

---

#### POST /heartbeat

**Purpose:** Keep session alive, prevent staleness

**Request:**
```json
{
  "schema_version": "1.0",
  "session_id": "sess_01HQXV3NK8..."
}
```

**Response:**
```json
{
  "session_id": "sess_01HQXV3NK8...",
  "last_heartbeat_at": "2026-01-17T14:30:00Z",
  "next_heartbeat_at": "2026-01-17T14:41:23Z",
  "heartbeat_interval_seconds": 683
}
```

**Idempotency:** Optional (naturally idempotent, last-write-wins)

**Server-Side Jitter:**
- Base interval: 10 minutes (600 seconds)
- Jitter: ±2 minutes (±120 seconds)
- Prevents thundering herd
- Client uses `next_heartbeat_at` for scheduling

---

#### GET /active

**Purpose:** List non-stale active sessions

**Query Params:**
- `venture` (optional, but at least one filter required)
- `repo` (optional)
- `track` (optional)
- `agent` (optional)
- `limit` (default: 100)
- `cursor` (for pagination)

**Response:**
```json
{
  "sessions": [
    {
      "id": "sess_01HQXV3NK8...",
      "agent": "cc-cli-host",
      "venture": "dfg",
      "repo": "durganfieldguide/dfg-console",
      "track": 1,
      "issue_number": 185,
      "status": "active",
      "last_heartbeat_at": "2026-01-17T14:30:00Z",
      "created_at": "2026-01-17T10:00:00Z"
    }
  ],
  "pagination": {
    "next_cursor": "eyJ0aW1lc3RhbXAiOiIyMDI2LTAxLTE3VDE0OjMwOjAwWiIsImlkIjoic2Vzc18wMUhRWFYzTks4In0="
  }
}
```

**Security:** Requires at least one filter (venture OR repo OR agent)

---

#### GET /handoffs/latest

**Purpose:** Get latest handoff by filters

**Query Params:**
- `venture` (required)
- `repo` (optional)
- `track` (optional)
- `issue_number` (optional)

**Response:**
```json
{
  "handoff": {
    "id": "ho_01HQXV4NK8...",
    "session_id": "sess_01HQXV3NK8...",
    "from_agent": "cc-cli-host",
    "summary": "Completed user authentication",
    "status_label": "ready-for-review",
    "payload": {
      "work_completed": [...],
      "blockers": [],
      "next_actions": [...]
    },
    "created_at": "2026-01-17T18:00:00Z"
  }
}
```

---

#### GET /handoffs

**Purpose:** Get handoff history (paginated)

**Query Params:**
- `venture` (required)
- `repo` (optional)
- `track` (optional)
- `issue_number` (optional)
- `limit` (default: 50)
- `cursor` (for pagination)

**Response:**
```json
{
  "handoffs": [...],
  "pagination": {
    "next_cursor": "..."
  }
}
```

---

### Configuration

**Environment Variables (wrangler.toml):**

```toml
name = "crane-context"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "crane-context-db"
database_id = "<to-be-created>"

[vars]
CONTEXT_SESSION_STALE_MINUTES = "45"
IDEMPOTENCY_TTL_SECONDS = "3600"
HEARTBEAT_INTERVAL_SECONDS = "600"
HEARTBEAT_JITTER_SECONDS = "120"

[secrets]
CONTEXT_RELAY_KEY = "<same-as-relay-key>"
```

---

### Constants

```typescript
// src/constants.ts
export const MAX_HANDOFF_PAYLOAD_SIZE = 800 * 1024; // 800KB (D1 1MB row - 200KB metadata)
export const MAX_IDEMPOTENCY_BODY_SIZE = 64 * 1024;  // 64KB (hybrid storage threshold)
export const IDEMPOTENCY_TTL_SECONDS = 3600;         // 1 hour
export const STALE_AFTER_MINUTES = 45;               // Session staleness threshold
export const HEARTBEAT_INTERVAL_SECONDS = 600;       // 10 minutes (base)
export const HEARTBEAT_JITTER_SECONDS = 120;         // ±2 minutes
export const ACTOR_KEY_ID_LENGTH = 16;               // 16 hex chars from SHA-256
```

---

### Implementation Details

#### Idempotency Key Scoping

Composite primary key `(endpoint, key)` ensures same client key can be used across different endpoints without collision.

```typescript
async function checkIdempotency(
  endpoint: string,
  key: string
): Promise<IdempotencyRecord | null> {
  const record = await db.query(
    `SELECT * FROM idempotency_keys
     WHERE endpoint = ? AND key = ? AND expires_at > datetime('now')`,
    [endpoint, key]
  );

  if (!record) {
    // Opportunistic cleanup
    await db.execute(
      'DELETE FROM idempotency_keys WHERE expires_at < datetime("now")'
    );
    return null;
  }

  return record;
}
```

---

#### Multiple Active Sessions Handling

```typescript
// Find ALL active sessions matching tuple
const activeSessions = await db.query(
  `SELECT * FROM sessions
   WHERE agent = ? AND venture = ? AND repo = ? AND track = ? AND status = 'active'
   ORDER BY last_heartbeat_at DESC`,
  [agent, venture, repo, track]
);

if (activeSessions.length > 1) {
  // Keep most recent, mark others as superseded
  const [mostRecent, ...toSupersede] = activeSessions;

  await db.execute(
    `UPDATE sessions
     SET status = 'ended', ended_at = ?, end_reason = 'superseded'
     WHERE id IN (${toSupersede.map(() => '?').join(',')})`,
    [new Date().toISOString(), ...toSupersede.map(s => s.id)]
  );
}
```

---

#### Heartbeat Jitter

```typescript
// Calculate next heartbeat with server-side jitter
const baseInterval = HEARTBEAT_INTERVAL_SECONDS; // 600s = 10min
const jitter = Math.floor(Math.random() * (HEARTBEAT_JITTER_SECONDS * 2)) - HEARTBEAT_JITTER_SECONDS;
const actualInterval = baseInterval + jitter; // 600 ± 120 seconds
const nextHeartbeat = new Date(Date.now() + actualInterval * 1000);

return {
  session_id: session.id,
  last_heartbeat_at: now,
  next_heartbeat_at: nextHeartbeat.toISOString(),
  heartbeat_interval_seconds: actualInterval
};
```

---

#### Correlation IDs (Two-Tier System)

**Per-Request ID (Header):**
```typescript
// Generate for every request
const correlationId = `corr_${crypto.randomUUID()}`;
response.headers.set('X-Correlation-ID', correlationId);
```

**Stored Creation ID:**
```typescript
// Store when creating sessions/handoffs
await db.insert('sessions', {
  id: `sess_${ulid()}`,
  creation_correlation_id: request.correlationId, // From creation request
  // ...
});
```

**Purpose:**
- `X-Correlation-ID` header: Trace current request (debugging live issues)
- `creation_correlation_id` field: Audit trail (who created this session?)

---

#### Payload Size Validation

```typescript
async function validateHandoffPayload(payload: object): Promise<string> {
  const canonical = canonicalize(payload);
  const size = new TextEncoder().encode(canonical).length;

  if (size > MAX_HANDOFF_PAYLOAD_SIZE) {
    throw new PayloadTooLargeError(
      `Handoff payload exceeds 800KB limit (actual: ${Math.round(size / 1024)}KB)`
    );
  }

  return canonical;
}
```

---

#### Canonical JSON

```typescript
import canonicalize from 'canonicalize';

// RFC 8785 compliant canonical JSON
const canonical = canonicalize(payload);
const payloadHash = sha256(canonical);

await db.insert('handoffs', {
  payload_json: canonical,
  payload_hash: payloadHash,
  // ...
});
```

---

### Tech Stack

**Dependencies:**
```json
{
  "dependencies": {
    "ajv": "^8.12.0",
    "ajv-formats": "^2.1.1",
    "canonicalize": "^2.0.0",
    "ulidx": "^2.3.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240925.0",
    "vitest": "^1.0.0",
    "json-schema-to-typescript": "^13.1.1"
  }
}
```

**Libraries Rationale:**
- **Ajv:** JSON Schema validation (industry standard, fast)
- **canonicalize:** RFC 8785 canonical JSON (stable hashing)
- **ulidx:** ULID generation (sortable, timestamp-embedded)

---

### Auth & Attribution

**Phase 1: Shared Key**

```typescript
export function validateAuth(request: Request, env: Env): string {
  const key = request.headers.get('X-Relay-Key');
  if (!key || key !== env.CONTEXT_RELAY_KEY) {
    throw new UnauthorizedError('Invalid or missing X-Relay-Key');
  }
  return deriveActorKeyId(key);
}

export function deriveActorKeyId(key: string): string {
  const hash = sha256(key);
  return hash.substring(0, 16); // First 16 hex chars = 8 bytes
}
```

**Future (Phase 2):** Per-agent tokens, `actor_key_id` becomes token fingerprint

---

### Data Lifecycle

**Phase 1: Filter-First Cleanup**

```typescript
// Query only active, non-stale sessions
const activeSessions = await db.query(`
  SELECT * FROM sessions
  WHERE status = 'active'
    AND last_heartbeat_at > datetime('now', '-${STALE_AFTER_MINUTES} minutes')
    AND venture = ?
  ORDER BY last_heartbeat_at DESC
`, [venture]);

// Query request logs (7-day retention)
const logs = await db.query(`
  SELECT * FROM request_log
  WHERE timestamp > datetime('now', '-7 days')
    AND endpoint = ?
  ORDER BY timestamp DESC
`, [endpoint]);
```

**Phase 2: Scheduled Cleanup (Future)**

```typescript
// Cron Trigger: Daily at 2 AM UTC
export async function scheduledCleanup(env: Env): Promise<void> {
  // Mark stale sessions as abandoned
  await env.DB.execute(`
    UPDATE sessions
    SET status = 'abandoned',
        ended_at = last_heartbeat_at,
        end_reason = 'stale'
    WHERE status = 'active'
      AND last_heartbeat_at < datetime('now', '-24 hours')
  `);

  // Delete old request logs
  await env.DB.execute(`
    DELETE FROM request_log
    WHERE timestamp < datetime('now', '-7 days')
  `);

  // Delete expired idempotency keys
  await env.DB.execute(`
    DELETE FROM idempotency_keys
    WHERE expires_at < datetime('now')
  `);
}
```

---

## Testing Strategy

### Unit Tests (High Coverage)

- Session state transitions (active → abandoned → ended)
- Staleness detection logic
- Canonical JSON serialization
- Idempotency key collision handling
- Validation error formatting
- Actor key ID derivation
- Heartbeat jitter randomization

### Integration Tests (Critical Paths)

- `/sod` returns context bundle (last handoff + active sessions)
- `/eod` retry safety (call twice with same session_id)
- `/active` excludes stale sessions
- `/update` with idempotency key (call twice, same response)
- Multiple active sessions (supersede logic)
- Large payload rejection (801KB handoff → 413)
- Large response truncation (65KB idempotency → truncated flag)
- Idempotency key scoping (same key, different endpoints)
- Pagination cursor continuity

### Manual Tests (End-to-End)

- CC CLI SOD/EOD workflow with real context
- Desktop PM SOD/EOD workflow
- Cross-venture `/active` view
- Abandoned session cleanup (wait 45 min + check status)
- Heartbeat scheduling with jitter

---

## Risks & Mitigations

### Medium Risk

**1. D1 Performance Under Load**
- **Risk:** D1 is relatively new, query performance at scale unproven
- **Mitigation:** Comprehensive indexes, query time monitoring
- **Fallback:** Schema is standard SQL, can migrate to PostgreSQL

**2. Idempotency Storage Growth**
- **Risk:** Even with 64KB cap and 1-hour TTL, could grow in high traffic
- **Mitigation:** Monitor table size, add scheduled cleanup in Phase 2
- **Alert:** If table exceeds 100K rows or 10GB

**3. Schema Migration Complexity**
- **Risk:** D1 doesn't support `ALTER TABLE ... ADD COLUMN ... NOT NULL` atomically
- **Mitigation:** Design new columns as nullable with app-level defaults

### Low Risk

**4. Foreign Key Integrity**
- D1 doesn't enforce FKs, orphaned handoffs possible
- Mitigated by application-level validation before insert

**5. Clock Skew**
- Staleness detection assumes accurate timestamps
- Cloudflare Workers have synchronized clocks (low risk)

**6. Concurrent Session Updates**
- Multiple `/heartbeat` calls could race
- Last-write-wins acceptable for timestamps

---

## Timeline

**Estimated:** 10-12 days to production-ready Phase 1

**Breakdown:**
```
Schema + migrations:              0.5 day
Auth middleware:                  0.5 day
Session lifecycle:                2 days   (supersede + jitter logic)
Handoff storage + validation:     1 day
Idempotency layer:                1 day    (composite PK, hybrid storage)
Query endpoints:                  1.5 days
JSON Schema validation:           1 day
Request logging:                  0.5 day
Testing (unit + integration):     2 days
Deployment + validation:          1 day
                                 ──────
                                 11 days
```

**Critical Path:** Schema → Auth → Session lifecycle → Queries

---

## Consequences

### Positive

- Structured, typed context sharing (no more markdown parsing)
- Real-time operational visibility (who's working on what)
- Universal HTTP API (same interface for CLI, Desktop, web)
- Retry-safe by design (idempotency built-in)
- Query performance optimized (comprehensive indexes)
- Forward-compatible schema (versioning + meta_json)

### Negative

- Adds operational complexity (new Worker + D1 database to maintain)
- Requires migration from markdown-based handoffs
- D1 is relatively new (less proven than PostgreSQL)
- Shared key in Phase 1 (single point of compromise)

### Neutral

- Does not replace GitHub as system of record for work artifacts
- Requires client updates (CC CLI, Desktop) to adopt new API
- Phase 2 features (doc cache, scheduled cleanup) deferred

---

## Open Items

None. All design questions resolved:
- ✅ Q1: Hybrid idempotency storage (64KB threshold)
- ✅ Q2: Filter-required `/active` endpoint
- ✅ Q3: Composite PK for idempotency scoping
- ✅ Q4: Two-tier correlation IDs
- ✅ Q5: Server-side heartbeat jitter
- ✅ Q6: Schema versioning on sessions table

---

## References

- Original Issue: [#25 - Implement Crane Context Worker](https://github.com/venturecrane/crane-console/issues/25)
- Design Reviews: 4 independent reviews + PM synthesis
- Related: Crane Relay (`crane-relay` worker, D1 schema patterns)
- RFC 8785: JSON Canonicalization Scheme
- ULID Spec: https://github.com/ulid/spec

---

## Approval

**Approved by:** Captain
**Date:** 2026-01-17
**Implementation Issue:** TBD (create after ADR commit)

This document is the authoritative specification for Crane Context Worker Phase 1 implementation.
