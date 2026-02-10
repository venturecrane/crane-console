# Crane Relay API Documentation

Crane Relay enables PM Team to interact with GitHub issues across multiple repositories via HTTP endpoints.

## Authentication

All endpoints (except `/health`) require authentication via Bearer token:

```bash
Authorization: Bearer <CRANE_ADMIN_KEY>
```

**Note:** `RELAY_TOKEN` has been consolidated with `CRANE_ADMIN_KEY` - use the same key for all crane infrastructure authentication (crane-context, crane-relay V1, crane-relay V2).

## Multi-Repository Support

All V1 endpoints accept an optional `repo` parameter to target different repositories:

```json
{
  "repo": "owner/repository-name",
  ...
}
```

- **If provided:** Issue operations target the specified repository
- **If omitted:** Defaults to `GITHUB_OWNER/GITHUB_REPO` from environment variables
- **Format validation:** Must match `owner/repo` format (e.g., `smdurgan/dfg-console`)
- **Invalid format:** Returns 400 error with actionable message

### Zero-Touch Venture Onboarding

The relay is designed for **zero-touch venture onboarding**. New ventures work immediately by passing their repo parameter - no code changes or redeployment required.

Example for new venture:

```bash
curl -X POST https://relay.example.com/directive \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "smdurgan/new-venture-2026",
    "to": "dev",
    "title": "Setup initial infrastructure",
    "body": "## Directive\n\nInitial setup tasks...",
    "labels": ["needs:dev"]
  }'
```

**Authentication Note:** The `GITHUB_TOKEN` must have access to the target repository. For repos under the same organization, this typically works automatically.

---

## V1 Endpoints

### POST /directive

Creates a GitHub issue from PM directive.

**Request:**

```json
{
  "repo": "smdurgan/sc-operations", // Optional: defaults to env GITHUB_OWNER/GITHUB_REPO
  "to": "dev", // Required: "dev" | "qa" | "pm"
  "title": "PRE-006: CI Gating", // Required
  "labels": [
    // Required
    "needs:dev",
    "prio:P0",
    "sprint:n+1",
    "type:tech-debt"
  ],
  "body": "## Directive\n\nFull markdown content...", // Required
  "assignees": ["username"] // Optional
}
```

**Response (success):**

```json
{
  "success": true,
  "issue": 11,
  "url": "https://github.com/smdurgan/sc-operations/issues/11",
  "repo": "smdurgan/sc-operations"
}
```

**Response (invalid repo format):**

```json
{
  "success": false,
  "error": "Invalid repo format. Must be 'owner/repo'"
}
```

**Example: DFG Console (default):**

```bash
curl -X POST https://relay.example.com/directive \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "dev",
    "title": "Add caching layer",
    "body": "## Directive\n\nImplement Redis caching...",
    "labels": ["needs:dev", "type:feature"]
  }'
```

**Example: Specific Repository:**

```bash
curl -X POST https://relay.example.com/directive \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "venturecrane/crane-console",
    "to": "dev",
    "title": "Update relay worker",
    "body": "## Directive\n\nAdd repo parameter support...",
    "labels": ["needs:dev"]
  }'
```

---

### POST /comment

Adds a comment to an existing GitHub issue.

**Request:**

```json
{
  "repo": "smdurgan/sc-operations", // Optional: defaults to env GITHUB_OWNER/GITHUB_REPO
  "issue": 42, // Required: issue number
  "body": "QA update: verified in staging" // Required: comment text
}
```

**Response (success):**

```json
{
  "success": true,
  "issue": 42,
  "repo": "smdurgan/sc-operations"
}
```

**Response (invalid repo format):**

```json
{
  "success": false,
  "error": "Invalid repo format. Must be 'owner/repo'"
}
```

**Example: Default Repository:**

```bash
curl -X POST https://relay.example.com/comment \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "issue": 123,
    "body": "PM update: changing priority to P0"
  }'
```

**Example: Specific Repository:**

```bash
curl -X POST https://relay.example.com/comment \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "venturecrane/crane-console",
    "issue": 456,
    "body": "This affects multiple ventures - coordinating rollout"
  }'
```

---

### POST /close

Closes a GitHub issue with an optional closing comment.

**Request:**

```json
{
  "repo": "smdurgan/sc-operations", // Optional: defaults to env GITHUB_OWNER/GITHUB_REPO
  "issue": 42, // Required: issue number
  "comment": "Closing as duplicate of #50" // Optional: comment before closing
}
```

**Response (success):**

```json
{
  "success": true,
  "issue": 42,
  "repo": "smdurgan/sc-operations"
}
```

**Response (invalid repo format):**

```json
{
  "success": false,
  "error": "Invalid repo format. Must be 'owner/repo'"
}
```

**Example: Default Repository:**

```bash
curl -X POST https://relay.example.com/close \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "issue": 789,
    "comment": "Completed and deployed to production"
  }'
```

**Example: Specific Repository:**

```bash
curl -X POST https://relay.example.com/close \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "smdurgan/new-venture",
    "issue": 101,
    "comment": "No longer needed - requirements changed"
  }'
```

---

### POST /labels

Updates labels on a GitHub issue (add and/or remove).

**Request:**

```json
{
  "repo": "smdurgan/sc-operations", // Optional: defaults to env GITHUB_OWNER/GITHUB_REPO
  "issue": 42, // Required: issue number
  "add": ["status:qa", "needs:qa"], // Optional: labels to add
  "remove": ["status:dev", "needs:dev"] // Optional: labels to remove
}
```

At least one of `add` or `remove` must be specified.

**Response (success):**

```json
{
  "success": true,
  "issue": 42,
  "repo": "smdurgan/sc-operations",
  "labels": ["status:qa", "needs:qa", "prio:P1", "type:feature"]
}
```

**Response (invalid repo format):**

```json
{
  "success": false,
  "error": "Invalid repo format. Must be 'owner/repo'"
}
```

**Example: Default Repository:**

```bash
curl -X POST https://relay.example.com/labels \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "issue": 234,
    "add": ["status:done"],
    "remove": ["status:qa", "needs:qa"]
  }'
```

**Example: Specific Repository:**

```bash
curl -X POST https://relay.example.com/labels \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "venturecrane/crane-console",
    "issue": 567,
    "add": ["prio:P0", "blocked"],
    "remove": ["prio:P1"]
  }'
```

---

### POST /merge

Merges a GitHub pull request.

**Request:**

```json
{
  "repo": "venturecrane/crane-console", // Required: target repository
  "pr": 4, // Required: PR number
  "merge_method": "squash", // Optional: "squash" (default), "merge", or "rebase"
  "commit_title": "Custom merge title", // Optional: custom merge commit title
  "commit_message": "Additional details" // Optional: additional commit message
}
```

**Response (success):**

```json
{
  "success": true,
  "pr": 4,
  "repo": "venturecrane/crane-console",
  "sha": "a173b012dda2e2c3ae18b5438890f24ce4b0b089",
  "merged": true,
  "message": "Pull Request successfully merged"
}
```

**Response (invalid repo format):**

```json
{
  "success": false,
  "error": "Invalid repo format. Must be 'owner/repo'"
}
```

**Response (invalid PR number):**

```json
{
  "success": false,
  "error": "Invalid PR number. Must be a positive integer"
}
```

**Response (invalid merge method):**

```json
{
  "success": false,
  "error": "Invalid merge_method. Must be one of: squash, merge, rebase"
}
```

**Response (PR not mergeable - conflicts):**

```json
{
  "success": false,
  "error": "GitHub API 405: Pull Request is not mergeable"
}
```

**Response (PR not mergeable - CI failing):**

```json
{
  "success": false,
  "error": "GitHub API 405: Required status checks have not succeeded"
}
```

**Response (PR already merged):**

```json
{
  "success": false,
  "error": "GitHub API 404: Not Found"
}
```

**Example: Default squash merge:**

```bash
curl -X POST https://relay.example.com/merge \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "venturecrane/crane-console",
    "pr": 4
  }'
```

**Example: Explicit merge method:**

```bash
curl -X POST https://relay.example.com/merge \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "smdurgan/dfg-console",
    "pr": 123,
    "merge_method": "merge",
    "commit_title": "Release v2.0: New features",
    "commit_message": "Includes authentication, caching, and performance improvements"
  }'
```

**Example: Multi-venture coordinated merge:**

```bash
# Merge PR in DFG console
curl -X POST https://relay.example.com/merge \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -d '{"repo":"smdurgan/dfg-console","pr":100}'

# Merge PR in SC operations
curl -X POST https://relay.example.com/merge \
  -H "Authorization: Bearer $RELAY_TOKEN" \
  -d '{"repo":"smdurgan/sc-operations","pr":50}'
```

**Pre-merge Validation:**

The `/merge` endpoint respects branch protection rules:

- ✅ Checks PR is in open state
- ✅ Checks CI status is passing (if required)
- ✅ Checks required reviews are approved (if configured)
- ✅ Does NOT override branch protection rules

**Merge Methods:**

| Method   | Behavior                                | Use Case                                  |
| -------- | --------------------------------------- | ----------------------------------------- |
| `squash` | Combines all commits into one (default) | Feature branches, keeps history clean     |
| `merge`  | Preserves all commits with merge commit | Release branches, preserve commit history |
| `rebase` | Rebases and fast-forwards               | Linear history preference                 |

---

### GET /health

Health check endpoint (no authentication required).

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-01-15T18:30:00Z"
}
```

**Example:**

```bash
curl https://relay.example.com/health
```

---

## Error Handling

All endpoints return consistent error responses:

**400 Bad Request:**

```json
{
  "success": false,
  "error": "Invalid repo format. Must be 'owner/repo'"
}
```

**401 Unauthorized:**

```json
{
  "success": false,
  "error": "Unauthorized"
}
```

**405 Method Not Allowed:**

```json
{
  "success": false,
  "error": "Method not allowed"
}
```

**500 Internal Server Error:**

```json
{
  "success": false,
  "error": "GitHub API failed"
}
```

---

## GitHub API Error Pass-Through

When GitHub returns an error (e.g., 404 for non-existent repo, 403 for permission issues), the relay passes through the status code and error message.

**Example: Non-existent repository:**

```json
{
  "success": false,
  "error": "GitHub API 404: Not Found"
}
```

**Example: Permission denied:**

```json
{
  "success": false,
  "error": "GitHub API 403: Resource not accessible by personal access token"
}
```

---

## V2 Endpoints

V2 endpoints provide advanced features for QA automation, build provenance tracking, and approval workflows. See separate V2 documentation for details.

**V2 Endpoints:**

- `POST /v2/events` - Submit test results and dev updates
- `POST /v2/evidence` - Upload test evidence (screenshots, logs)
- `GET /v2/evidence/{id}` - Retrieve evidence by ID
- `GET /v2/approval-queue` - View pending approvals
- `POST /v2/approve` - Approve or reject test results

V2 endpoints use `x-relay-key` authentication instead of Bearer tokens and include GitHub App authentication for enhanced security.

---

## Rate Limiting

The worker itself has no rate limits, but GitHub's REST API has standard rate limits:

- **Authenticated requests:** 5,000 requests per hour
- **Per-repository limits:** Vary by endpoint

If you hit rate limits, GitHub returns a 403 status with rate limit headers.

---

## CORS Configuration

The relay supports specific allowed origins for browser-based requests (V2 endpoints only):

- `https://app.durganfieldguide.com`
- `https://durganfieldguide.com`
- `https://core.durganfieldguide.com`
- `https://crane-command.vercel.app`
- `http://localhost:3000` (development)

V1 endpoints are designed for server-to-server communication and don't require CORS.

---

## Deployment

```bash
# Type check
npm run typecheck

# Deploy to production
npm run deploy

# View logs
npx wrangler tail
```

---

## Security Best Practices

1. **Never hardcode RELAY_TOKEN** - Store as Cloudflare Worker secret
2. **Rotate tokens periodically** - Update via `wrangler secret put RELAY_TOKEN`
3. **Use HTTPS only** - Cloudflare Workers enforce HTTPS automatically
4. **Least-privilege GitHub tokens** - Only grant necessary repo permissions
5. **No repo whitelists** - Rely on GitHub token permissions for access control

---

## Multi-Venture Usage Patterns

### Pattern 1: PM Team manages multiple ventures

```bash
# Create issue in DFG
curl POST /directive -d '{"to":"dev", "title":"Feature X", ...}'

# Create issue in SC Operations
curl POST /directive -d '{"repo":"smdurgan/sc-operations", "to":"dev", "title":"Feature Y", ...}'

# Create issue in new venture (zero configuration needed)
curl POST /directive -d '{"repo":"smdurgan/new-venture", "to":"dev", "title":"Setup", ...}'
```

### Pattern 2: Shared infrastructure changes

```bash
# Update issue affecting crane-relay itself
curl POST /comment -d '{"repo":"venturecrane/crane-console", "issue":3, "body":"Deployed to production"}'
```

### Pattern 3: Cross-venture coordination

```bash
# Close issues in multiple repos for coordinated release
curl POST /close -d '{"repo":"smdurgan/dfg-console", "issue":100, "comment":"v2.0 released"}'
curl POST /close -d '{"repo":"smdurgan/sc-operations", "issue":50, "comment":"v2.0 released"}'
```

---

## Test Cases

**Valid multi-repo requests:**

- `"repo": "smdurgan/dfg-console"` - Creates issue in DFG repo
- `"repo": "smdurgan/sc-operations"` - Creates issue in SC repo
- `"repo": "venturecrane/crane-console"` - Creates issue in Crane repo
- `"repo": "smdurgan/new-venture-2026"` - Creates issue in new venture (zero config)
- No `repo` field - Creates issue in default repo (backward compatible)

**Invalid repo formats (return 400):**

- `"repo": "bad-format"` - Missing slash
- `"repo": "too/many/slashes"` - Multiple slashes
- `"repo": ""` - Empty string
- `"repo": "/repo"` - Missing owner
- `"repo": "owner/"` - Missing repo name

**GitHub API errors (pass-through):**

- Non-existent repo - GitHub returns 404
- No access to repo - GitHub returns 403
- Invalid issue number - GitHub returns 404
