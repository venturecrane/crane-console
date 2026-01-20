# Integration Tests

Integration tests for Crane Context Worker endpoints, testing full request/response cycles with local D1 database.

## Prerequisites

Integration tests require the worker to be running locally with access to the D1 database.

### Setup

1. **Start the worker in development mode:**
   ```bash
   npm run dev
   ```

   This starts the worker on `http://localhost:8787` with local D1 database.

2. **In a separate terminal, run integration tests:**
   ```bash
   npm run test:integration
   ```

## Test Structure

```
test/integration/
├── README.md           # This file
├── setup.ts            # Test fixtures and helpers
├── sod.test.ts         # POST /sod - Session resume logic
├── eod.test.ts         # POST /eod - End session with handoff
├── update.test.ts      # POST /update - Session updates
├── heartbeat.test.ts   # POST /heartbeat - Keep-alive
├── queries.test.ts     # GET /active, /handoffs/*
└── idempotency.test.ts # Cross-endpoint idempotency scenarios
```

## Running Tests

### All Integration Tests
```bash
npm run test:integration
```

### Specific Test File
```bash
npx vitest run test/integration/sod.test.ts
```

### Watch Mode (for development)
```bash
npx vitest watch test/integration/
```

## Test Coverage

### POST /sod (5 scenarios)
- ✓ No existing session → create new
- ✓ Active non-stale session → resume with heartbeat refresh
- ⏸ Active stale session → close as abandoned, create new (requires 45min wait)
- ⏸ Multiple active sessions → supersede extras (requires DB manipulation)
- ✓ Idempotency → return cached response

### POST /eod
- ✓ Create handoff with canonical JSON storage
- ✓ Idempotency replay (same key returns cached)
- ✓ Payload validation (reject >800KB)
- ✓ Session ends with correct end_reason

### POST /update
- ✓ Idempotency key required (reject 400 if missing)
- ✓ Update branch/commit/meta fields
- ✓ Heartbeat refresh on update

### POST /heartbeat
- ✓ Update last_heartbeat_at timestamp
- ✓ Return jittered next_heartbeat_at
- ✓ Session remains active

### GET /active
- ✓ Filter enforcement (require at least one filter)
- ✓ Staleness exclusion (don't return stale sessions)
- ✓ Cursor-based pagination
- ✓ Multiple filters (venture + repo + track)

### GET /handoffs/latest
- ✓ Query by issue_number
- ✓ Query by track
- ✓ Query by session_id
- ✓ Returns most recent only

### GET /handoffs
- ✓ Cursor-based pagination
- ✓ Filter by venture/repo
- ✓ Sorted by created_at DESC

### Idempotency Scenarios
- ✓ Same key, same endpoint → return cached
- ✓ Same key, different endpoint → allowed (endpoint scoping)
- ✓ Large response >64KB → truncated flag set
- ✓ Expired key (>1 hour) → treat as new request

## Test Isolation

Tests use unique identifiers (timestamp + random) to avoid collisions:
- Each test creates sessions with unique repo names
- Idempotency keys use unique prefixes
- No cleanup needed between tests (isolated by design)

## Limitations

### Time-Based Tests (Skipped)
Some scenarios require time manipulation:
- **Stale session testing**: Requires 45+ minute wait or time manipulation
- **Idempotency expiry**: Requires 1+ hour wait or time manipulation

These tests are marked as `.skip()` and documented for manual verification or future enhancement with time mocking.

### Race Condition Tests (Skipped)
Some edge cases require concurrent operations:
- **Multiple active sessions**: Requires DB manipulation or complex race condition setup

These tests are marked as `.skip()` and documented for manual verification or DB-level testing.

## Troubleshooting

### "Worker is not running" Error
**Symptom**: Tests fail with "Worker is not running. Start with: npm run dev"

**Solution**:
1. Open a separate terminal
2. Run `npm run dev`
3. Wait for "Ready on http://localhost:8787"
4. Run tests in another terminal

### "Connection refused" Error
**Symptom**: Tests fail with `ECONNREFUSED`

**Solution**: Verify worker is running on port 8787:
```bash
curl http://localhost:8787/health
```

### "Invalid X-Relay-Key" Error
**Symptom**: All tests return 401 Unauthorized

**Solution**: Set `CONTEXT_RELAY_KEY` secret for local development:
```bash
wrangler secret put CONTEXT_RELAY_KEY
# Enter: test-relay-key-for-integration-testing
```

### Database Errors
**Symptom**: Tests fail with D1 database errors

**Solution**: Verify D1 schema is deployed locally:
```bash
wrangler d1 execute crane-context-db --local --file=./migrations/schema.sql
```

## Future Enhancements

### Automated Worker Startup
Add test script that automatically starts/stops worker:
```json
{
  "scripts": {
    "test:integration": "concurrently -k -s first 'npm run dev' 'wait-on http://localhost:8787 && vitest run test/integration/'"
  }
}
```

### Time Manipulation
Use libraries like `timekeeper` or `sinon` to manipulate time for staleness testing.

### Test Database
Create separate test database for isolation:
```bash
wrangler d1 create crane-context-test-db
```

### CI/CD Integration
Configure CI pipeline to:
1. Start worker with test database
2. Run integration tests
3. Collect coverage
4. Stop worker

## Related Documentation

- [ADR 025: Crane Context Worker](../../docs/adr/025-crane-context-worker.md)
- [Issue #26: Implementation](https://github.com/your-org/crane-console/issues/26)
- [Handoff Document](../../docs/handoffs/dev-2026-01-17-crane-context-implementation.md)
