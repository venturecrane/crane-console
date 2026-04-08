# Fleet Audit Retrospective — 2026-04-08

## What happened

What started as a 30-minute "check why /sos shows 10 unresolved alerts" task surfaced a structural failure in the operator-facing trust layer of the venture portfolio. The session uncovered:

1. **The notification watcher silently lied for 29 days.** The SOS displayed "10 unresolved CI/CD alerts" while the database held **270+ stale alerts** going back almost a month. Root cause: the failure normalizer dropped success/neutral/skipped webhook events on the floor, so failure notifications could never auto-resolve. The watcher was a write-only pipeline.

2. **The lie was systematic, not isolated.** A truthfulness audit found ~12 distinct defects across SOS, crane_notes, crane_doc_audit, crane_notifications, schedule briefing, ventures cache, EC preview, and SOS budget truncation. Every one followed the same "lie by omission" pattern: hardcoded display limit, then `${array.length}` rendered as if it were the total. Operators had no way to distinguish "the system is reporting 10 because there are 10" from "the system is reporting 10 because that's where the slice ended."

3. **smd-web had been broken for 7 weeks and nobody noticed.** A pre-existing prettier formatting failure on `src/pages/index.astro` since 2026-02-19 blocked every smd-web build. The alerts that should have surfaced this were buried in the 270 stale notifications. We only found it today because the captain asked the right adversarial question.

4. **The fleet had multiple landmines.** Cross-venture audit of all 11 venturecrane repos surfaced:
   - crane-console deploy.yml was failing on main with Cloudflare API auth error 10001 — blocking every other PR in this remediation
   - dc-marketing CI dead 43 days
   - venture-template security pipeline dead 56 days (the template every new venture inherits)
   - crane-relay dormant 84 days (state unknown)
   - 37 stale dependabot PRs across 5 repos (vite v7→v8 incompatibility hypothesis)

## Root cause

**Trust erosion in operator-facing signals.** The SOS is the operator's first interaction with the system every morning. If the SOS lies about the alert count, every other thing the SOS reports could also be lying. Once operators learn to ignore the alert count, real signal gets ignored, silent decay goes undetected, and ventures rot in plain sight.

The proximate cause of the 270-alert pile-up was the missing auto-resolver. The proximate cause of nobody noticing was the truthfulness contract violation — the SOS reported only `array.length`, not the true count, so the operator literally could not see the divergence.

## Why existing systems missed it

- **No truth invariant.** The display code interpolated `array.length` directly. There was no compile-time or runtime check that the displayed count matched the source-of-truth count. The two could diverge silently for arbitrarily long.
- **No auto-resolver feedback loop.** Failures could only be resolved manually. A full pipeline that drops a success event on the floor and accumulates failures forever has no observable failure mode until someone manually queries the count.
- **No fleet-level operational signal.** smd-web was broken for 7 weeks because no central system was watching for "commits stacking up without successful deploys." The notification path was the only signal, and it was already broken.
- **No retention check.** The notification table had no SLA on how old open notifications could get. Stale rows simply accumulated.
- **Toil-based detection.** The 270 alerts were "found" only because the captain manually inspected the database. There was no automated path that would have surfaced them.

## What caught it

The captain asked: **"How can there still be 10 CI alerts? This last session was dedicated to fixing CI alerts. What is going on?"** That single adversarial question is what tipped the investigation. Without it, the lie would have continued indefinitely.

**This is the most important takeaway:** the system needs to surface this kind of divergence WITHOUT requiring an operator to ask the right question. That's the entire premise of the System Health section that ships in this remediation.

## Fixes landing in this remediation

### Track A — notification watcher data layer (PRs #438, #440, #442, #443)

- New `notifications-green.ts` `classifyGreenEvent()` function (additive, never refactors failure path)
- Race-safe idempotent `processGreenEvent()` with `INSERT-then-UPDATE` and the `auto_resolved_by_id IS NULL` predicate
- Match keys with `owner/repo` always (cross-org collision safe)
- Schedule-like events require same `head_sha` for auto-resolve (no nightly cron false positives)
- Forward-in-time predicate for out-of-order webhook delivery
- Paginated, locked, adaptive-rate-limit backfill CLI
- Backfill cleared 270 stale rows; auto-resolver flag flipped to `true` in production

### Track B — operator-facing truthfulness (PRs #444, #445, #446, #450, #452)

- `Truncated<T>` branded type — compile-time enforcement of the truthfulness contract
- `formatTruthfulCount` helper renders "270 (showing 10, +260 more)" patterns
- New `/notifications/counts`, `/notifications/oldest` endpoints
- `queryHandoffs` and `listNotes` now return true `total` / `total_matching`
- 12 SOS / tools defects fixed: CI/CD alerts, recent handoffs, cadence items, active sessions, EC preview, SOS budget banner, crane_notes count, doc audit boundary, schedule briefing aggregates, ventures cache TTL, calendar-day timezone, crane_notifications tool
- New `crane_deploy_heartbeat` MCP tool + `deploy_heartbeats` table with the COMMITS-WITHOUT-DEPLOY cold detector
- crane-watch wired to forward `push` and `workflow_run.completed` to deploy-heartbeats
- System Health section added to SOS with 3 v1 checks (notifications-truth-window P0, notification-retention-window P1, deploy-pipeline-heartbeat P0)

### Track C — fleet remediation prevention layer (this PR + follow-ups)

- Venture template upgraded: `gitleaks/gitleaks-action@v2` (no hardcoded URL), `.gitleaks.toml`, grouped dependabot config
- crane-console security workflow upgraded to use the same gitleaks-action@v2
- New `scripts/fleet-lint.sh` — 10 static workflow file pattern checks
- New `scripts/fleet-ops-health.sh` — runtime GitHub state audit (dependabot backlog, push activity, CI conclusion, archive state)
- New `.github/workflows/fleet-ops-health.yml` — weekly cron Mondays 13:00 UTC
- Template `CLAUDE.md` includes a Fleet Health section with stale-signal thresholds

## Prevention measures (what stops this happening again)

| Risk                                   | Prevention                                                                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display layer lies via `array.length`  | `Truncated<T>` branded type — TypeScript catches it at compile time. ESLint rule as belt-and-suspenders. Runtime validation in `formatTruthfulCount`.                                             |
| Notification queue accumulates forever | Auto-resolver via match_key + green webhook. Backfill CLI for one-shot cleanup. notification-retention-window health check.                                                                       |
| Cold deploy pipelines go undetected    | deploy_heartbeats table tracks `last_main_commit_at` vs `last_success_at`. deploy-pipeline-heartbeat health check raises P0.                                                                      |
| Fleet-wide silent rot                  | fleet-ops-health.sh runs weekly, writes to its own findings table, surfaces in SOS.                                                                                                               |
| Brittle workflow patterns recur        | fleet-lint.sh static checker runs weekly + can be invoked locally per repo.                                                                                                                       |
| Operators ignore the alerts section    | System Health section forces visibility — failures surface as P0 in the SOS, not as a buried log line. Failure budget escalation prevents replica-lag noise from training operators to ignore it. |

## Stale signal thresholds (formalized)

These thresholds are now baked into `fleet-ops-health.sh` and the deploy-heartbeats DAL:

- Repo no main activity 14 days → warn (daily SOS)
- Repo no main activity 60 days → hard flag (must archive or justify)
- Dependabot PR open > 7 days → warn
- Dependabot PR open > 30 days → hard flag
- Deploy pipeline commits-without-deploy > venture threshold → hard flag (P0)
- Notification older than retention window → P1
- Secret `updatedAt` > 180 days → warn (to be added in secret-rotation cadence)

## What this remediation does NOT do

- Does not migrate ventures to a different CI provider
- Does not unify the ventures across crane-console as a single deploy target
- Does not introduce a new metrics/observability platform
- Does not rewrite the entire SOS — only the parts that lied
- Does not fix the underlying root cause of every failing dependabot PR if the cause is deeper than peer-dep resolution

## Daily SOS now includes "what changed in the fleet"

Effective with this remediation, the SOS section between Alerts and Weekly Plan surfaces the System Health roll-up. After Track C wave 5 lands (fleet-lint + fleet-ops-health + retrospective), the operator will see:

```
## Alerts
**CI/CD Alerts** — 0 unresolved total (auto-resolver: enabled)

## System Health
All clear (3/3 checks passed at 06:15 MST)
```

Or, when something is broken:

```
## System Health
- **[P0] deploy-pipeline-heartbeat** — 1 cold pipeline(s): smdservices/smd-web
- **[P1] notification-retention-window** — Oldest open is 35 days (>30-day retention)
```

That single change converts the SOS from a misleading status report into a load-bearing operational dashboard.

## Captain's directive

> "Mission critical enterprise. No tolerance for misleading information. No room for sloppy work. Do whatever we must do to resolve this, the right way, completely, before we move on to anything else. World class. That is the only acceptable solution."

This retrospective documents the remediation that closed out that directive. The next time something like the 270-alert incident happens, the System Health section will surface it in the next SOS the operator runs — not 29 days later when someone manually inspects the database.
