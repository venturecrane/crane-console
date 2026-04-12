# Notifications Pipeline

How CI/CD events flow from GitHub and Vercel webhooks through crane-watch and crane-context to reach agents.

## Architecture

```
GitHub App webhooks ──┐
                      ├──> crane-watch ──> crane-context ──> D1 (notifications table)
Vercel webhooks ──────┘                                              │
                                                                     ▼
                                                       crane_notifications MCP tool
                                                       (agents query on demand)
```

Three Cloudflare Workers participate:

| Worker        | Role                                                  | URL                                                 |
| ------------- | ----------------------------------------------------- | --------------------------------------------------- |
| crane-watch   | Webhook gateway, signature verification, event router | `https://crane-watch.automation-ab6.workers.dev`    |
| crane-context | Notification storage, query API, deduplication        | `https://crane-context.automation-ab6.workers.dev`  |
| crane-mcp     | MCP tool layer agents call (`crane_notifications`)    | Runs locally inside the agent's Claude Code session |

## GitHub Events Handled

crane-watch receives webhooks from the Crane Relay GitHub App (installed across all venture orgs).

### CI Event Forwarding (`workflow_run`, `check_suite`, `check_run`)

These three GitHub event types are short-circuited before the classification path. On receipt:

1. Signature is verified (same HMAC-SHA256 flow).
2. The raw payload is forwarded to crane-context via `POST /notifications/ingest` using `ctx.waitUntil()` (non-blocking).
3. crane-watch returns `200 OK` immediately.

The forwarding prefers a Cloudflare Service Binding (`CRANE_CONTEXT` fetcher) for Worker-to-Worker calls. If no binding is configured, it falls back to the public `CRANE_CONTEXT_URL`.

## Vercel Events Handled

crane-watch receives Vercel deployment webhooks.

### Signature Verification

Vercel uses HMAC-SHA1 (not SHA-256). The `x-vercel-signature` header is validated against `VERCEL_WEBHOOK_SECRET` with timing-safe comparison.

### Forwarded Events

Only two event types are forwarded to crane-context:

| Event                 | Action                                    |
| --------------------- | ----------------------------------------- |
| `deployment.error`    | Forwarded as notification                 |
| `deployment.canceled` | Forwarded as notification                 |
| All other events      | Acknowledged with `200 OK`, not forwarded |

The payload is forwarded via the same `forwardToNotifications` function used for GitHub CI events.

## Normalization in crane-context

When crane-context receives a `POST /notifications/ingest` request, it routes the payload to a source-specific normalizer.

### GitHub Normalizers

Each GitHub event type has a dedicated normalizer that extracts structured fields:

- **`workflow_run`** -- Extracts workflow name, run number, conclusion, branch, commit SHA, and HTML URL.
- **`check_suite`** -- Extracts app name, conclusion, branch, commit SHA, and run count.
- **`check_run`** -- Only processes completed runs. Extracts check name, conclusion, branch, commit SHA, and HTML URL.

All three normalizers share the same severity logic.

### Vercel Normalizer

Extracts project name, deployment ID, target environment, branch, commit info, and error message. Derives venture code from the project name using a static mapping in `constants.ts`:

```
crane-console -> vc
ke-console    -> ke
sc-console    -> sc
dfg-console   -> dfg
dc-console    -> dc
vc-web        -> vc
```

## Notification Severity Levels

### GitHub Severity Rules

| Conclusion  | Protected branch (`main`/`master`/`production`) | Other branch |
| ----------- | ----------------------------------------------- | ------------ |
| `failure`   | `critical`                                      | `info`       |
| `timed_out` | `warning`                                       | `warning`    |
| `cancelled` | `info`                                          | `info`       |
| `success`   | Ignored (no notification)                       | Ignored      |
| `neutral`   | Ignored                                         | Ignored      |
| `skipped`   | Ignored                                         | Ignored      |

### Vercel Severity Rules

| Event                 | Production target | Preview target |
| --------------------- | ----------------- | -------------- |
| `deployment.error`    | `critical`        | `warning`      |
| `deployment.canceled` | `info`            | `info`         |

## Deduplication

Each notification gets a dedupe hash computed from `source | event_type | repo | branch | content_key`. The content key is source-specific:

- GitHub: `{event_type}:{entity_id}:{conclusion}` (e.g., `workflow_run:123456:failure`)
- Vercel: `vercel:{deployment_id}:{webhook_type}`

The `notifications` table has a `UNIQUE` constraint on `dedupe_hash`. Duplicate inserts are silently ignored via `INSERT OR IGNORE`.

## Notification Lifecycle

Notifications follow a state machine:

```
new -> acked -> resolved
new ----------> resolved
```

Valid transitions are enforced server-side. The `resolved` state is terminal.

### Status Values

| Status     | Meaning                               |
| ---------- | ------------------------------------- |
| `new`      | Unacknowledged, just ingested         |
| `acked`    | Agent has seen it                     |
| `resolved` | Issue addressed, notification cleared |

## Retention

Notifications are retained for 30 days. The retention is enforced as a filter-on-read: all list queries include a `created_at > (now - 30 days)` condition.

## How Agents Access Notifications

Agents use the `crane_notifications` MCP tool (registered in crane-mcp). The tool calls `GET /notifications` on crane-context with optional filters:

| Filter     | Values                        |
| ---------- | ----------------------------- |
| `status`   | `new`, `acked`, `resolved`    |
| `severity` | `critical`, `warning`, `info` |
| `venture`  | Any venture code              |
| `repo`     | `org/repo` format             |
| `source`   | `github`, `vercel`            |
| `limit`    | 1-100 (default 20)            |

Results are formatted as a markdown table for display. Agents can update notification status using `crane_notification_update`.

## Webhook Authentication Summary

| Source | Header                | Algorithm   | Secret env var          |
| ------ | --------------------- | ----------- | ----------------------- |
| GitHub | `X-Hub-Signature-256` | HMAC-SHA256 | `GH_WEBHOOK_SECRET`     |
| Vercel | `x-vercel-signature`  | HMAC-SHA1   | `VERCEL_WEBHOOK_SECRET` |

Both validations use timing-safe comparison to prevent side-channel attacks.

## Key Files

| File                                                   | Purpose                                             |
| ------------------------------------------------------ | --------------------------------------------------- |
| `workers/crane-watch/src/index.ts`                     | Webhook receiver, signature verification, forwarder |
| `workers/crane-context/src/endpoints/notifications.ts` | Ingest, list, and status-update endpoints           |
| `workers/crane-context/src/notifications.ts`           | CRUD, deduplication, venture derivation             |
| `workers/crane-context/src/notifications-github.ts`    | GitHub event normalizers                            |
| `workers/crane-context/src/notifications-vercel.ts`    | Vercel event normalizer                             |
| `workers/crane-context/src/constants.ts`               | Severity levels, sources, retention config          |
| `packages/crane-mcp/src/tools/notifications.ts`        | MCP tool for agent access                           |
