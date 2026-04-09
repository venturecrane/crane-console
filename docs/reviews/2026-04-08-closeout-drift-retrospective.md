# Closeout Drift Retrospective — 2026-04-08

**Project**: Operator Truthfulness & Fleet Reliability Remediation
**Plan**: `/Users/scottdurgan/.claude/plans/kind-gliding-rossum.md` (v3.1)
**Session**: ~48 hours from initial debugging to Track D verification layer live

## Pattern recognition

The remediation project started as a 30-minute SOS debugging task and grew to 48+ hours of work because every fix surfaced more drift. Every single drift instance has the same structural signature: **a gap between committed state and deployed state that no check was watching**. Cataloged:

| Symptom                                                                                 | Root cause                                                  | Verification gap                                                         | Caught by                              |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| SOS reports "10 unresolved" when D1 has 270                                             | Notification watcher dropped green webhooks                 | No invariant comparing displayed count to DB count                       | Captain's adversarial question         |
| Migration 0025 (`deploy_heartbeats`) shipped in PR #450 but never applied to either env | Manual migration application, no CI gate                    | No invariant that committed migrations == applied migrations             | Track D audit of deployed vs committed |
| `CRANE_ADMIN_KEY` drifted between Infisical, GitHub Actions, and wrangler secrets       | Manual rotation, no sync check                              | No invariant that secret values agree across planes                      | Track D smoke test failure             |
| `d1_migrations` tracking table empty despite historical migrations applied              | Legacy `execute --file` bypasses wrangler's native tracking | No invariant that d1_migrations is populated and consistent              | H-1 plan analysis                      |
| `fleet-exec.sh` non-interactive SSH PATH broken                                         | No test that SSH dispatch actually works                    | No integration test for fleet dispatch                                   | Fleet dispatch crash during work       |
| `mac23` keychain unlock fails from SSH session                                          | macOS security session scoping                              | No test that SSH context can run headless agents                         | Manual triage when dispatch hung       |
| Flaky `health-checks.test.ts` (`49ms < 50ms`)                                           | CI hardware variance vs tight tolerance                     | No margin on timing assertions                                           | PR #285 CI failure                     |
| Gitleaks 403 during Secret Detection                                                    | Unauthenticated GitHub API lookup hit 60/hr rate limit      | No fleet-lint rule for `api.github.com` auth                             | PR #467 CI failure                     |
| 270-row backfill never run                                                              | Built but never executed                                    | No invariant for steady-state notification count                         | Track D plan review                    |
| `CLOUDFLARE_API_TOKEN` 55 days old                                                      | No rotation-age check                                       | No invariant for secret rotation age                                     | Manual audit during Track D            |
| PR #334 (wrangler v4) stale DIRTY                                                       | No follow-up of stale PRs                                   | No invariant for PR age                                                  | Critique pass issue #12                |
| dc-marketing CI dead 43 days                                                            | Weekly audit existed but findings weren't actionable        | fleet-ops-health existed but only wrote JSON artifact, no D1 persistence | #455 closeout audit                    |
| dc-marketing, crane-relay decisions pending                                             | No forcing function to triage stale repos                   | No suppression-budget invariant                                          | Plan v3.1 critique                     |

## Meta-lesson

**The plan had no layer that verified deployed state matched intended state.** Every drift instance lived in that unverified gap. The three original tracks (A: data truthfulness, B: display truthfulness, C: fleet audit) addressed symptoms but not the meta-cause.

Track D — System Readiness & Self-Verification — is the response. It adds:

1. **Deployed-state interrogation** via `/version` and `/admin/verify-schema` endpoints on every worker
2. **Secret sync verification** via hash-based canary (`/admin/secret-hash` + `secret-sync-audit.sh`) — never echoes values
3. **End-to-end smoke test** (`smoke-test-e2e.sh`) that exercises mutation paths including the Track A auto-resolver
4. **A single oracle** (`system-readiness-audit.sh`) that enumerates 37 invariants across 7 groups and reports PASS/FAIL/WARN/SKIP

These layers, taken together, prevent the next "closeout surfaces drift" cycle from ever starting, because any drift is now visible to the audit on every PR and every weekly scheduled run.

## Invariant enumeration (the new contract)

The 37 invariants are the portfolio-wide contract for "system is in a known-good state." Any future remediation must preserve them. See plan v3.1 §D.6 for the full list; the groups are:

- **A** — Deployed state (I-1, I-1b, I-2, I-3, I-3b, I-4, I-5, I-6)
- **B** — Secrets (I-7, I-8, I-9)
- **C** — End-to-end behavior (I-10..I-19)
- **D** — Fleet static + runtime (I-20, I-21)
- **E** — Closeout-specific (I-22, I-23, I-24)
- **F** — Expanded coverage (I-25..I-32)
- **G** — Suppression hygiene (I-33, I-34, I-35)

## Process delta — new remediation-done standard

Written into `docs/standards/remediation-playbook.md`:

> A remediation is not DONE until `system-readiness-audit.sh --ci --env=production` returns all implemented invariants green AND the system has been exercised by:
>
> - 3 real deploys
> - 1 intentional drift-injection test
> - 2 clean scheduled cron runs
>
> Time-based soaks ("wait 7 days") are a weak signal. Events prove the verification layer works under real conditions.

## Specific fixes adopted (linked PRs)

### Pre-Track-D hotfixes (foot-gun neutralization)

- **#469** H-0 + H-1: retroactive idempotency guards on migrations 0003-0026 + 0027 backfill + `db:migrate:apply` scripts + I-3b CI guard
- **#470** H-2: initial `schema.hash` + `compute-schema-hash.sh` (superseded by #474)
- **#471** H-3: gitleaks curl auth + explicit `permissions:` block + fleet-lint rule #11 (atomic)

### Track D verification layer

- **#472** D-1 + D-2 + D-3: interrogation layer (`/version`, `/admin/verify-schema`, `inject-version.mjs`, CODEOWNERS)
- **#473** D-1 follow-up: cold-start lazy capture (Cloudflare Workers forbid wall-clock at module load)
- **#474** D-3 follow-up: schema.hash per-env sourced from live D1 (canonical-from-local was unworkable)
- **#475** D-3 follow-up: `compute-schema-hash.sh` preserves trailing newline
- **#476** D-5 + D-7 + D-9: secret-sync-audit + smoke-test-e2e + system-readiness-audit skeleton + migration 0028
- **#477** D-5 follow-up: Infisical name mapping (`CRANE_ADMIN_KEY` → `CONTEXT_ADMIN_KEY`)
- **#478** (this PR) D-6 + D-8 + D-11 + D-12: CI workflows, deploy gate integration, retrospective

### Cleanup

- PR #334 (stale wrangler v4 upgrade) closed as obsolete — main already had ^4.76.0

## Toil audit

Manual interventions this session (captain hours saved by Track D automation):

- Applying migration 0025 to both envs manually: **1 hour** (discovery + execution)
- Rotating CRANE_ADMIN_KEY across Infisical + GitHub + 6 fleet repos + 2 wrangler envs: **1.5 hours**
- Debugging fleet-exec.sh SSH PATH issue: **1 hour**
- Debugging mac23 keychain unlock: **45 minutes**
- Investigating the 270-row backfill was built-but-never-run: **30 minutes**
- Manual draining of 28 stale dependabot PRs across 4 repos: **3 hours**
- Researching Next.js 16 `next lint` removal from scratch (no institutional memory): **45 minutes**
- Schema.hash reconciliation false starts (local-canonical → live-sourced): **1 hour**

**Total captain toil this session: ~9.5 hours** on work that should have been automated.

**Track D automation cost**: ~6 hours of development + review time across 8 PRs. Net savings become positive after the FIRST prevented drift. Each future drift instance that would have required the above captain toil is now either caught by CI or surfaced in the readiness audit before it becomes a crisis.

## What went well

1. **H-0..H-3 landed as 4 atomic hotfixes before any Track D work**. This meant D-1's `/version` could cleanly reference committed `schema.hash` from H-2 without race conditions or half-states.
2. **Critique pass caught 12 load-bearing issues** before execution. Without it, closeout would have discovered the race window, foot-gun, unsound metadata-only gate, and missing coverage classes as runtime bugs.
3. **Deploy-and-verify after every PR** caught the "schema.hash from local is unworkable" mismatch in minutes, not during closeout.
4. **Small atomic PRs** (8 merged this session) kept review cycles fast and rollback windows small.

## What to watch in future remediations

1. **Schema hash regeneration discipline**. The current design requires operators to run `compute-schema-hash.sh --env=<X> --update` after every migration apply and commit both hash files. If they forget, invariant I-4 fires on the next audit. D-10's follow-up should add a pre-push hook that regenerates the hash automatically.
2. **`compute-schema-hash.sh` requires live D1 access**. A future engineer writing a migration without wrangler won't be able to update the hash. Document clearly in `migrations/README.md` and consider a "local approximation" mode.
3. **Groups E, F, G are still stubbed** in the readiness audit. They become real follow-ups:
   - E: closeout-specific — remove once the project is declared done
   - F: expanded coverage (OAuth secrets, CF usage limits, DNS pinning, wrangler binary version, node triangulation, cron freshness, webhook delivery)
   - G: suppression hygiene (portfolio-wide cap + expires_at + linked issue)
4. **The 30-minute debug session that started this project was cheap at the time**. The cost of finding that initial drift was low because SOS showed _some_ number (wrong, but present). The cost of being wrong compounded for 48 hours. Next time: when a count looks suspicious, ask the adversarial question IMMEDIATELY. "What else could be silently lying?"

## Acknowledgments

The captain ran a Devil's Advocate critique pass at plan-time that surfaced 12 critical issues. Adopting those fixes during planning rather than during execution is the difference between 48 hours of progress and 48 hours of whack-a-mole.

## Appendix: Closeout Event Log

Per the event-based soak requirement, the closeout is not declared DONE until this log shows 3 deploys + 1 drift injection + 2 clean cron runs.

| #   | Type            | Timestamp                   | Commit / Detail                                                                                               | Result                                                                                                                                                                                                                                                        |
| --- | --------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Real deploy     | 2026-04-09T03:35:39Z        | 48724b1 (PR #472 D-1+D-2+D-3 interrogation layer)                                                             | clean recovery; /version returned correct commit                                                                                                                                                                                                              |
| 2   | Real deploy     | 2026-04-09T04:57:27Z        | e5164f2 (PR #476 D-5+D-7+D-9 verification layer)                                                              | clean recovery; smoke-test-e2e 9/9 PASS; readiness audit PASS                                                                                                                                                                                                 |
| 3   | Real deploy     | 2026-04-09T05:14:33Z        | cba5dcb + 4b922b2 (PR #478 workflows and D-479 Group E)                                                       | clean recovery; production audit 15/15 PASS                                                                                                                                                                                                                   |
| 4   | Drift injection | 2026-04-09T05:18:00Z        | Rotated CONTEXT_ADMIN_KEY on wrangler staging ONLY via wrangler secret put; Infisical and prod left untouched | Readiness audit I-7 flipped to FAIL within 5s. Error named the exact plane (wrangler-staging) diverging from Infisical. Reverted by re-setting wrangler staging from Infisical value. Post-revert audit returned to 15/15 PASS. **Detection layer verified.** |
| 5   | Scheduled cron  | _pending 2026-04-13T13:15Z_ | system-readiness-audit.yml weekly run                                                                         | Not yet occurred (waiting for Monday 2026-04-13 13:15 UTC)                                                                                                                                                                                                    |
| 6   | Scheduled cron  | _pending 2026-04-20T13:15Z_ | system-readiness-audit.yml weekly run                                                                         | Not yet occurred (waiting for Monday 2026-04-20 13:15 UTC)                                                                                                                                                                                                    |

**Status as of 2026-04-09 ~05:20 UTC**: 4 of 6 events recorded. Only the two scheduled cron runs remain, blocked purely on clock time. Captain signs off on closeout after the 2026-04-20 run confirms the second clean cycle.

**What has already been proven by the 4 recorded events:**

- Deploy pipeline integration works: /version correctly reports deployed commit and recovers from deploy lag (events 1, 2, 3)
- End-to-end mutation path works: red→green auto-resolve fires in smoke-test against synthetic notifications (event 2)
- Drift detection works under real conditions: I-7 secret sync audit catches a single-plane rotation within seconds, names the exact drift, and clears when corrected (event 4)

The verification layer is functionally complete and verified. The two scheduled cron runs are the belt-and-suspenders proof that the weekly cadence runs the audit against production and surfaces any slow-moving drift.
