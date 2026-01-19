# Crane Relay API Reference

**Base URL:** `https://crane-relay.automation-ab6.workers.dev`  
**Legacy URL:** `https://dfg-relay.automation-ab6.workers.dev` (still operational, will be deprecated)  
**Content-Type:** `application/json`

> **Note:** The relay was originally deployed as `dfg-relay` but serves all Venture Crane ventures. It has been migrated to the `crane-relay` subdomain. Legacy `dfg-relay` URLs will continue to work but should be updated to `crane-relay` in new code.

## Authentication

**V1 Endpoints** (`/directive`, `/labels`, `/comment`, `/close`, `/project/items`):
```
Authorization: Bearer 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f
```

**V2 Endpoints** (`/v2/events`, `/v2/evidence`):
```
X-Relay-Key: 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f
```

---

## V1 Endpoints

### GET /health

No auth required. Returns worker status.

```bash
curl -sS "https://crane-relay.automation-ab6.workers.dev/health"
```

Response:
```json
{"status": "ok", "timestamp": "2026-01-08T18:09:24.027Z"}
```

---

### POST /directive

Creates a new GitHub issue.

**Required fields:**
- `title` (string) - Issue title
- `body` (string) - Issue body (markdown)
- `to` (string) - Routing target: `"dev"`, `"qa"`, `"pm"`

**Optional fields:**
- `labels` (array) - Additional labels to apply
- `priority` (string) - `"P0"`, `"P1"`, `"P2"`, `"P3"`

```bash
curl -sS "https://crane-relay.automation-ab6.workers.dev/directive" \
  -H "Authorization: Bearer 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "title": "Feature: New capability",
    "body": "## Summary\n...",
    "to": "dev",
    "labels": ["component:app", "sprint:n+8"],
    "priority": "P0"
  }'
```

Response:
```json
{"success": true, "issue_number": 145, "url": "https://github.com/..."}
```

---

### POST /labels

Updates labels on an existing issue. **Status labels are exclusive** - adding a new status should remove the old one.

**Required fields:**
- `issue` (number) - Issue number

**Must specify at least one:**
- `add` (array) - Labels to add
- `remove` (array) - Labels to remove

```bash
curl -sS "https://crane-relay.automation-ab6.workers.dev/labels" \
  -H "Authorization: Bearer 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "issue": 154,
    "add": ["status:qa", "needs:qa"],
    "remove": ["status:ready"]
  }'
```

Response:
```json
{"success": true, "issue": 154, "labels": ["status:qa", "needs:qa", ...]}
```

**Note:** If removing a label that doesn't exist, GitHub returns 404. Only remove labels you know exist.

---

### POST /comment

Adds a comment to an existing issue.

**Required fields:**
- `issue` (number) - Issue number
- `body` (string) - Comment body (markdown)

```bash
curl -sS "https://crane-relay.automation-ab6.workers.dev/comment" \
  -H "Authorization: Bearer 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "issue": 154,
    "body": "[x] QA PASS - All acceptance criteria verified. Ready to merge."
  }'
```

---

### POST /close

Closes an issue.

**Required fields:**
- `issue` (number) - Issue number

```bash
curl -sS "https://crane-relay.automation-ab6.workers.dev/close" \
  -H "Authorization: Bearer 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"issue": 154}'
```

---

## Project Queries

### GET /project/items

Fetch GitHub Projects v2 items with optional Track field filtering. Used for multi-track PM SOD workflow.

**Auth:** `Authorization: Bearer {token}` (V1 pattern)

**Query Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| org | yes | GitHub org (`venturecrane`, `siliconcrane`, `durganfieldguide`) |
| project | yes | Project number (typically `1`) |
| track | no | Filter by Track field value (number), or `null` for unassigned |

**Examples:**

```bash
# Track 1 issues
curl -sS "https://crane-relay.automation-ab6.workers.dev/project/items?org=siliconcrane&project=1&track=1" \
  -H "Authorization: Bearer 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f"

# All issues (no track filter)
curl -sS "https://crane-relay.automation-ab6.workers.dev/project/items?org=siliconcrane&project=1" \
  -H "Authorization: Bearer 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f"

# Unassigned issues (track is null)
curl -sS "https://crane-relay.automation-ab6.workers.dev/project/items?org=siliconcrane&project=1&track=null" \
  -H "Authorization: Bearer 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f"
```

**Response:**

```json
{
  "ok": true,
  "org": "siliconcrane",
  "project": 1,
  "track": 1,
  "items": [
    {
      "id": "PVTI_xxx",
      "number": 1,
      "title": "SC-001: D1 Schema Setup + Migrations",
      "track": 1,
      "status": "status:triage",
      "priority": "prio:P0",
      "url": "https://github.com/siliconcrane/sc-console/issues/1"
    }
  ],
  "count": 16
}
```

**Error Responses:**
- `400` - Missing required params (org, project) or invalid track value
- `401` - Unauthorized (missing or invalid token)
- `500` - GitHub API error

---

## V2 Endpoints

V2 endpoints provide structured event submission with automatic provenance checking, rolling status comments, and label transitions.

### POST /v2/events

Submit a structured event (dev update, QA result, etc.) to an issue. Automatically:
- Stores event in D1 (idempotent by `event_id`)
- Verifies PR head SHA matches submitted commit (provenance check)
- Creates/updates a rolling status comment on the issue
- Applies label transitions per configured rules

**Auth:** `X-Relay-Key` header

**Required fields:**
- `event_id` (string) - Unique identifier (min 8 chars), used for idempotency
- `repo` (string) - Repository in `owner/repo` format
- `issue_number` (number) - Target issue number
- `role` (string) - `"QA"`, `"DEV"`, `"PM"`, or `"MENTOR"`
- `agent` (string) - Identifier for submitting agent (e.g., `"ChromeQA"`, `"claude-code-cli"`)
- `event_type` (string) - Event type (e.g., `"qa.result_submitted"`, `"dev.update"`)

**Optional fields:**
- `summary` (string) - Human-readable summary
- `environment` (string) - `"preview"`, `"production"`, or `"dev"`
- `build` (object) - `{ pr?: number, commit_sha: string }` for provenance verification
- `overall_verdict` (string) - `"PASS"`, `"FAIL"`, `"BLOCKED"`, `"PASS_UNVERIFIED"`, `"FAIL_UNCONFIRMED"`
- `scope_results` (array) - `[{ id: string, status: "PASS"|"FAIL"|"SKIPPED", notes?: string }]`
- `severity` (string) - Required for FAIL/BLOCKED: `"P0"`, `"P1"`, `"P2"`, `"P3"`
- `repro_steps` (string) - Required for FAIL/BLOCKED
- `expected` (string) - Required for FAIL/BLOCKED
- `actual` (string) - Required for FAIL/BLOCKED
- `evidence_urls` (array) - URLs to screenshots/evidence
- `details` (any) - Additional payload data

**Example: Dev Update**
```bash
curl -sS "https://crane-relay.automation-ab6.workers.dev/v2/events" \
  -H "X-Relay-Key: 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "event_id": "dev_update_'$(date +%s)'",
    "repo": "{org}/{repo}",
    "issue_number": 182,
    "role": "DEV",
    "agent": "claude-code-cli",
    "event_type": "dev.update",
    "environment": "preview",
    "summary": "PR ready for QA review",
    "build": {
      "pr": 45,
      "commit_sha": "abc123def456"
    }
  }'
```

**Example: QA Pass**
```bash
curl -sS "https://crane-relay.automation-ab6.workers.dev/v2/events" \
  -H "X-Relay-Key: 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "event_id": "qa_result_'$(date +%s)'",
    "repo": "{org}/{repo}",
    "issue_number": 182,
    "role": "QA",
    "agent": "ChromeQA",
    "event_type": "qa.result_submitted",
    "environment": "preview",
    "overall_verdict": "PASS",
    "build": {
      "pr": 45,
      "commit_sha": "abc123def456"
    },
    "scope_results": [
      { "id": "AC1", "status": "PASS" },
      { "id": "AC2", "status": "PASS" }
    ],
    "evidence_urls": [
      "https://crane-relay.automation-ab6.workers.dev/v2/evidence/uuid-here"
    ]
  }'
```

**Example: QA Fail**
```bash
curl -sS "https://crane-relay.automation-ab6.workers.dev/v2/events" \
  -H "X-Relay-Key: 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "event_id": "qa_fail_'$(date +%s)'",
    "repo": "{org}/{repo}",
    "issue_number": 182,
    "role": "QA",
    "agent": "ChromeQA",
    "event_type": "qa.result_submitted",
    "overall_verdict": "FAIL",
    "severity": "P1",
    "repro_steps": "1. Navigate to dashboard\n2. Click refresh\n3. Observe error",
    "expected": "Dashboard refreshes with updated data",
    "actual": "Console error: undefined is not a function",
    "scope_results": [
      { "id": "AC1", "status": "PASS" },
      { "id": "AC2", "status": "FAIL", "notes": "Console error on refresh" }
    ]
  }'
```

**Response (success):**
```json
{
  "ok": true,
  "event_id": "qa_result_1736350000",
  "stored": true,
  "rolling_comment_id": "2456789012",
  "verdict": "PASS",
  "provenance_verified": true
}
```

**Response (idempotent replay):**
```json
{
  "ok": true,
  "idempotent": true,
  "event_id": "qa_result_1736350000"
}
```

**Provenance Verification:**
If `build.pr` and `build.commit_sha` are provided, the system fetches the PR's current head SHA from GitHub. If they don't match, a PASS verdict is automatically downgraded to PASS_UNVERIFIED.

**Label Transitions:**
Configured via `LABEL_RULES_JSON`. Current rules:
- `qa.result_submitted` + `PASS` -> Add `status:verified`, remove `status:qa`, `needs:qa`
- `qa.result_submitted` + `FAIL` -> Add `needs:dev`, remove `needs:qa`
- `qa.result_submitted` + `BLOCKED` -> Add `status:blocked`, remove `status:qa`, `needs:qa`
- `dev.update` -> Add `status:qa`, `needs:qa`, remove `status:in-progress`, `needs:dev`

---

### POST /v2/evidence

Upload a file (screenshot, log, etc.) to R2 storage. Returns a URL that can be included in events.

**Auth:** `X-Relay-Key` header  
**Content-Type:** `multipart/form-data`

**Required fields:**
- `repo` (string) - Repository in `owner/repo` format
- `issue_number` (number) - Associated issue number
- `file` (file) - The file to upload

**Optional fields:**
- `event_id` (string) - Link to a specific event

```bash
curl -sS "https://crane-relay.automation-ab6.workers.dev/v2/evidence" \
  -H "X-Relay-Key: 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -F "repo={org}/{repo}" \
  -F "issue_number=182" \
  -F "event_id=qa_result_123" \
  -F "file=@./screenshot.png"
```

**Response:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "repo": "{org}/{repo}",
  "issue_number": 182,
  "event_id": "qa_result_123",
  "filename": "screenshot.png",
  "content_type": "image/png",
  "size_bytes": 145678,
  "url": "https://crane-relay.automation-ab6.workers.dev/v2/evidence/a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

---

### GET /v2/evidence/:id

Retrieve an uploaded evidence file.

**Auth:** `X-Relay-Key` header

```bash
curl -sS "https://crane-relay.automation-ab6.workers.dev/v2/evidence/a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "X-Relay-Key: 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -o screenshot.png
```

---

## Common Workflows

### Repository Targeting

All Crane Relay API calls target the venture's console repository:

```bash
# Correct
"repo": "durganfieldguide/dfg-console"
"repo": "siliconcrane/sc-console"

# Incorrect (operations repos don't exist)
"repo": "durganfieldguide/dfg-operations"  [X]
"repo": "siliconcrane/sc-operations"       [X]
```

Each venture has exactly one repository for all product work. The `repo` parameter in relay calls should always reference `{org}/{venture}-console`.

---

### Dev Complete -> QA Handoff (V2)

```bash
curl -sS "https://crane-relay.automation-ab6.workers.dev/v2/events" \
  -H "X-Relay-Key: 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "event_id": "dev_'$(date +%s)'",
    "repo": "{org}/{repo}",
    "issue_number": 154,
    "role": "DEV",
    "agent": "claude-code-cli",
    "event_type": "dev.update",
    "summary": "PR ready for QA",
    "build": { "pr": 42, "commit_sha": "abc123" }
  }'
```

### QA Pass -> Ready to Merge (V2)

```bash
# Upload evidence first
EVIDENCE_URL=$(curl -sS "https://crane-relay.automation-ab6.workers.dev/v2/evidence" \
  -H "X-Relay-Key: 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -F "repo={org}/{repo}" \
  -F "issue_number=154" \
  -F "file=@./screenshot.png" | jq -r '.url')

# Submit QA result - labels updated automatically
curl -sS "https://crane-relay.automation-ab6.workers.dev/v2/events" \
  -H "X-Relay-Key: 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "event_id": "qa_'$(date +%s)'",
    "repo": "{org}/{repo}",
    "issue_number": 154,
    "role": "QA",
    "agent": "ChromeQA",
    "event_type": "qa.result_submitted",
    "overall_verdict": "PASS",
    "build": { "pr": 42, "commit_sha": "abc123" },
    "scope_results": [
      { "id": "AC1", "status": "PASS" },
      { "id": "AC2", "status": "PASS" }
    ],
    "evidence_urls": ["'"$EVIDENCE_URL"'"]
  }'
```

### Merged -> Done (V1)

```bash
curl -sS "https://crane-relay.automation-ab6.workers.dev/labels" \
  -H "Authorization: Bearer 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"issue": 154, "add": ["status:done"], "remove": ["status:verified"]}'

curl -sS "https://crane-relay.automation-ab6.workers.dev/close" \
  -H "Authorization: Bearer 056b6f9859f5f315c704e9cebfd1bc88f3e1c0a74b904460a2de96ec9bceac2f" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"issue": 154}'
```

---

## Label Reference

### Status (exclusive - only one at a time)
- `status:triage` - New, needs prioritization
- `status:ready` - Approved, ready for dev
- `status:in-progress` - Dev actively working
- `status:review` - PR open, code review
- `status:qa` - Under QA verification
- `status:verified` - QA passed, ready to merge
- `status:done` - Merged and deployed
- `status:blocked` - Blocked by dependency

### Routing (additive)
- `needs:pm` - Waiting for PM decision
- `needs:dev` - Waiting for dev fix/answer
- `needs:qa` - Ready for QA verification

### Priority
- `prio:P0` - Blocker, drop everything
- `prio:P1` - High priority
- `prio:P2` - Medium priority
- `prio:P3` - Low priority

---

## Troubleshooting

**TLS/Certificate errors on /close:** Intermittent Cloudflare issue. Retry with delay.

**404 on label remove:** Label not present on issue. Only remove labels you know exist.

**Token format (V1):** Must be `Bearer <token>`, not just the token.

**Header format (V2):** Use `X-Relay-Key` header, not `Authorization`.

**PASS_UNVERIFIED verdict:** Submitted `commit_sha` doesn't match PR head. Either the PR was updated after testing, or wrong SHA was provided.
