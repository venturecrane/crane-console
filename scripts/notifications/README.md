# Notification Auto-Resolver Backfill

One-shot CLI for clearing the historical notification backlog. Built for the
2026-04-07 incident where 270 notifications had accumulated because the
notification watcher silently dropped every green webhook event.

## When to use this

Run this script ONCE after PR A1 + PR A2 are deployed and **before** flipping
`NOTIFICATIONS_AUTO_RESOLVE_ENABLED` to `true` in production. The auto-resolver
in PR A2 only handles real-time greens going forward; it cannot resolve
historical failures because no green webhook ever reached the table for them.

This script asks GitHub directly: "for every open failure notification with a
match_key, did a green run for the same workflow on the same branch eventually
land?" If yes, it records the auto-resolve in the database with reason
`github_api_backfill`.

After this script clears the historical 270, the production flag flip in PR
A4 makes the auto-resolver authoritative for all future notifications.

## Where the code lives

- Library: `packages/crane-mcp/src/scripts/notifications-backfill.ts`
- Runner: `packages/crane-mcp/bin/notifications-backfill.js`
- Tests: `packages/crane-mcp/src/scripts/notifications-backfill.test.ts`
- Admin endpoints (consumed by the script):
  - `GET  /admin/notifications/pending-matches?cursor=&limit=`
  - `POST /admin/notifications/:id/auto-resolve`
  - `POST /admin/notifications/backfill-lock/acquire`
  - `POST /admin/notifications/backfill-lock/release`

## Required environment

```bash
export CRANE_CONTEXT_URL=https://crane-context-staging.automation-ab6.workers.dev  # or prod
export CRANE_CONTEXT_ADMIN_KEY=...   # X-Admin-Key value
export GITHUB_TOKEN=...              # PAT or App token with actions:read scope
```

The script reads its admin key from env so it never appears on the command line.

## Usage

### From the crane-console root, after `cd packages/crane-mcp && npm run build`:

```bash
# Dry-run first - shows what would happen, no mutations
node packages/crane-mcp/bin/notifications-backfill.js --dry-run

# Real run, scoped to a single venture, with sane defaults
node packages/crane-mcp/bin/notifications-backfill.js --venture vc

# Help
node packages/crane-mcp/bin/notifications-backfill.js --help
```

### After `npm install` (when published or via `npm link`):

```bash
notifications-backfill --dry-run
notifications-backfill --venture vc
```

## Flags

| Flag                        | Default | Purpose                                   |
| --------------------------- | ------- | ----------------------------------------- |
| `--dry-run`                 | off     | Don't mutate; report what would happen    |
| `--venture <code>`          | all     | Filter to a single venture (e.g. `vc`)    |
| `--max-rows <n>`            | 1000    | Hard cap on rows resolved per invocation  |
| `--max-runtime-minutes <n>` | 30      | Wall-clock budget; clean exit if exceeded |
| `--sleep-ms <n>`            | 100     | Base delay between GitHub API calls       |
| `--help`                    | -       | Show usage                                |

## Concurrency safety

The script acquires a global lock via `POST /admin/notifications/backfill-lock/acquire`
before doing any work. If another invocation holds the lock, the script exits
cleanly with `bailedOutEarly: true` and `bailReason: 'lock acquisition failed: ...'`.

The lock has a 1-hour TTL by default. If the script crashes without releasing,
the next run can claim the lock after the TTL expires. This handles the crash case
without manual intervention.

The script releases the lock on exit, including on uncaught exceptions (the lock
release is in a `finally` block).

## Idempotency

Re-running the script is safe. The admin endpoint validates the target
notification's status before transitioning; already-resolved rows return 200
with `already_resolved: true` and are counted in `notificationsAlreadyResolved`
rather than `notificationsResolved`.

## Rate limit handling

The script:

1. Reads `X-RateLimit-Remaining` and `X-RateLimit-Reset` from every GitHub API
   response.
2. If `remaining < 100`, sleeps until reset before the next request.
3. On `429` or `403` (rate limit hard stop), sleeps until reset and retries
   the same URL.
4. Honors GitHub Link header pagination for workflow run lists.
5. Sleeps `--sleep-ms` (default 100ms) between every request as a base
   politeness delay.

For the historical 270-row backlog, this is roughly 50 unique GitHub API calls
which is well within the 5000/hour authenticated limit.

## Output

The script writes structured logs to stdout/stderr. On clean exit it prints a
final stats block:

```json
{
  "pendingMatchesScanned": 50,
  "notificationsResolved": 245,
  "notificationsAlreadyResolved": 12,
  "noGreenInGithub": 13,
  "errors": 0,
  "githubApiCalls": 50,
  "githubApiPages": 50,
  "rateLimitWaits": 0,
  "totalSleepMs": 5000,
  "startedAt": "2026-04-08T15:30:00.000Z",
  "endedAt": "2026-04-08T15:30:48.000Z",
  "durationMs": 48000,
  "dryRun": false,
  "bailedOutEarly": false
}
```

Exit code: `0` on clean run with `errors === 0`. `1` if any errors occurred
(but the script always tries to release its lock before exiting). `2` for
argument/env validation failures.

## Operator runbook

### First run on staging

```bash
# 1. Confirm the staging worker is on PR A1+A2 (migration 0023 + processGreenEvent code)
gh run list --repo venturecrane/crane-console --workflow=deploy.yml --branch main --limit 1

# 2. Build crane-mcp locally
cd ~/dev/crane-console/packages/crane-mcp
npm run build

# 3. Set env (read admin key from Infisical, never echo)
export CRANE_CONTEXT_URL=https://crane-context-staging.automation-ab6.workers.dev
export CRANE_CONTEXT_ADMIN_KEY=$(infisical secrets get CONTEXT_ADMIN_KEY --path /vc --env staging --plain)
export GITHUB_TOKEN=$(infisical secrets get GH_TOKEN --path /vc --env prod --plain)

# 4. Dry run
node ~/dev/crane-console/packages/crane-mcp/bin/notifications-backfill.js --dry-run --venture vc

# 5. Inspect output. If it looks reasonable, real run.
node ~/dev/crane-console/packages/crane-mcp/bin/notifications-backfill.js --venture vc

# 6. Verify with crane_notifications
crane_notifications --venture vc --status new --limit 100
```

### Production run

Same sequence but with `CRANE_CONTEXT_URL=https://crane-context.automation-ab6.workers.dev`
and `--env prod` Infisical paths. Recommended: Captain only, never delegated to
remote agents.

### After the backfill clears the historical 270

PR A4 flips `NOTIFICATIONS_AUTO_RESOLVE_ENABLED = "true"` in production. From
that moment forward, every green webhook auto-resolves any matching prior
failures. The backfill script becomes a maintenance tool used only if the flag
is ever flipped off and back on.

## Related

- Plan: `~/.claude/plans/kind-gliding-rossum.md` (Track A section)
- PR A1 (schema): venturecrane/crane-console#438
- PR A2 (auto-resolver core): venturecrane/crane-console#440
- PR A3 (this script): venturecrane/crane-console#TBD
- PR A4 (production rollout): venturecrane/crane-console#TBD
