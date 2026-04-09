# Remediation Playbook

**Status**: Active standard as of 2026-04-08 (Track D landing)
**Authority**: Plan v3.1 `/Users/scottdurgan/.claude/plans/kind-gliding-rossum.md`
**Retrospective that established this**: `docs/reviews/2026-04-08-closeout-drift-retrospective.md`

## Core principle

**A remediation is not DONE until the system proves it is, under real conditions.**

The 2026-04-07/08 "operator truthfulness" remediation grew from a 30-minute debugging task to 48+ hours of work because every fix surfaced more drift. Every drift instance lived in the gap between committed state and deployed state — a gap no automated check was watching. Track D added that check (the readiness audit). This playbook codifies the lesson.

## Definition of DONE

A remediation is DONE when ALL of the following are true:

1. **All code merged** to main through PRs (no direct pushes). No allowlists, no TODO comments.
2. **`scripts/system-readiness-audit.sh --ci --env=production` returns PASS** on every implemented invariant. WARN is acceptable with a documented reason; FAIL is never acceptable.
3. **Event-based soak complete**: the system has been exercised by
   - **3 real deploys** (any scope — landing any PR counts) with clean audit recovery each time. This proves deploy-lag tolerance works in practice.
   - **1 intentional drift injection**: captain rotates a canary secret (or similar) in ONE plane only, runs the audit, confirms it surfaces the drift with the specific key/resource named in the finding, then reverts. This proves the detection actually works.
   - **2 clean scheduled cron runs** of `system-readiness-audit.yml` (Mondays 13:15 UTC). Both ingest findings into `fleet_health_findings`; both produce zero new open findings by the next run. This proves the weekly cadence works.
4. **Retrospective merged** and recorded as a `crane_note` with the `retrospective` tag so SOS surfaces "retrospective available" for 14 days.
5. **Closeout Event Log** in the retrospective appendix shows 3+1+2 events with timestamps, commits, audit run IDs, and results.

**Time is a proxy, not the signal.** If the captain lands 3 deploys + runs the drift injection + sees 2 clean cron cycles in 5 days, the project closes in 5 days. If the captain doesn't deploy for a month, the project correctly does not close in 7 days.

## Process delta from pre-Track-D

### Before Track D ("done" definition)

"All PRs merged, CI is green, nobody is complaining."

Problem: CI only verifies the diff in a PR. It does not verify the cumulative deployed state against the cumulative committed state. Drift between them is invisible until something breaks visibly.

### After Track D ("done" definition)

"Readiness audit passes on all 37 invariants AND the system has been observed working under real events."

Addition: the readiness audit enumerates invariants across 7 groups (deployed state, secrets, end-to-end, fleet static, closeout, expanded coverage, suppression hygiene). Any drift in any group is surfaced. The audit runs on every PR, weekly on a schedule, and is a pre-deploy gate.

## Writing a new remediation

When writing a plan for a new remediation, include these sections from day 1:

1. **Invariants before PRs.** List the invariants the remediation will add to the readiness audit. These are the contract for "done." If a remediation touches a new system, it must add at least one invariant that catches the class of drift the remediation is fixing.
2. **Pre-work for foot-guns.** Before any Track D-style verification PRs ship, land any destructive-on-rerun migration work as captain-serial hotfixes with explicit runbooks. See plan v3.1 §H-0/H-1 for the pattern.
3. **Critique pass.** Run `/critique` on the plan before execution. The Devil's Advocate critique alone surfaces ~10-12 load-bearing issues per plan in our experience. Land those fixes in the plan, not during execution.
4. **Deploy-and-verify after every PR.** Do not batch deploys. Catching the "schema.hash from local is unworkable" issue in minutes (during the first D-3 deploy) is much cheaper than catching it during closeout.
5. **Retrospective template.** Include a retrospective with Pattern Recognition + Meta-lesson + Invariant enumeration + Process delta + Specific fixes + Toil audit + Closeout Event Log sections. Template in `docs/reviews/2026-04-08-closeout-drift-retrospective.md`.

## Anti-patterns to avoid

### "We'll catch it in closeout"

Every gap between "committed" and "deployed" discovered during closeout represents hours of captain toil that should have been automated. If a check would have caught the drift, add the check. If you discover you need a check, add it to the invariant list even if you can't implement it in this remediation.

### "The CI is green, ship it"

Green CI means the diff doesn't break unit tests. It does NOT mean:

- The migrations are applied to both envs
- The secrets are in sync across Infisical/GitHub/wrangler
- The deployed worker matches the committed code
- The schema hasn't drifted
- The mutation paths actually work end-to-end

Track D's readiness audit checks all of these. If you are about to declare done, run it first.

### "Time-based soaks"

"Wait 7 days and hope nothing breaks" rewards idleness. Event-based soaks prove the verification layer works under real load. Use the 3+1+2 rule or better.

### "Suppress the finding"

Suppressions are sometimes appropriate (e.g., dc-marketing intentionally unarchived). They must:

- Have an `expires_at` ≤ 30 days
- Have a linked GitHub issue documenting the rationale
- Emit their own WARN finding so they stay visible in the weekly report
- Count against a portfolio-wide cap of 3 active suppressions

If the suppression count is consistently near the cap, the remediation is not done — you are hiding drift, not fixing it.

## References

- Plan v3.1: `/Users/scottdurgan/.claude/plans/kind-gliding-rossum.md`
- Retrospective: `docs/reviews/2026-04-08-closeout-drift-retrospective.md`
- Readiness audit script: `scripts/system-readiness-audit.sh`
- Secret sync audit: `scripts/secret-sync-audit.sh`
- Smoke test: `scripts/smoke-test-e2e.sh`
- Migrations README: `workers/crane-context/migrations/README.md`
