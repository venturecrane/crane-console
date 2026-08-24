---
name: code-review
description: Codebase Audit
version: 2.0.0
scope: enterprise
owner: captain
status: stable
depends_on:
  mcp_tools:
    - crane_skill_invoked
    - crane_memory
    - crane_note
    - crane_notes
  commands:
    - gh
    - npm
---

# /code-review - Codebase Audit

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "code-review")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.

Produces a **probe script and a short report**. Not a graded essay.

## Why v2 exists

v1 produced output the Captain could not trust. Findings changed between runs, opinions and facts sat in one severity-tagged list, and grades alarmed without informing. Two causes, both mechanical:

1. **Sampling.** v1 audited the whole corpus — 308K lines in ss-console. Nobody is exhaustive over that, so each run _samples differently_, and different samples look like changed findings.
2. **v1 was not followed.** Its own text said "a single Claude Task agent works through all 7 dimensions sequentially." A run on 2026-08-23 improvised eight parallel agents; three never delivered; two dimensions were graded on a sweep the orchestrator did not know was incomplete, and the report claimed "zero exploitable findings" while two HIGH findings sat in an undelivered transcript.

So v2 is deliberately **smaller and more mechanical**. Where a rule can be a check, it is a check.

## Arguments

```
/code-review [focus] [--full]
```

- `focus` — optional path to narrow the diff pass.
- `--full` — re-derive the invariant set from scratch rather than reusing the previous probe. Slow; use when the invariant list itself looks stale.

## The two things you produce

1. `docs/reviews/claims-<YYYY-MM-DD>.probe.sh` — every fact, as a re-runnable command.
2. `docs/reviews/claims-<YYYY-MM-DD>.md` — **≤60 non-blank lines.** The probe proves; the report explains.

Template to copy: `ss-console/docs/reviews/claims-2026-08-24.{md,probe.sh}`.

**You may produce nothing.** If the previous probe holds and the diff pass turns up nothing above the floor, say that in three lines and stop. A review that always finds something is a review that invents things.

---

## Step 1 — Run the previous probe FIRST

Find the most recent `docs/reviews/claims-*.probe.sh` and run it. This is the carry-forward, and it is what stops the same finding being rediscovered every run.

Each claim carries two fields that govern how its result is read:

| Field       | Values                             | Meaning                                   |
| ----------- | ---------------------------------- | ----------------------------------------- |
| `state`     | `OPEN` \| `FIXED`                  | Was the defect fixed, or merely recorded? |
| `direction` | `exact` \| `at-most` \| `at-least` | Which way is improvement?                 |

Read the results like this — **this table is the point of the whole skill**:

| Result | `state: FIXED`                         | `state: OPEN`                                                  |
| ------ | -------------------------------------- | -------------------------------------------------------------- |
| Holds  | **Closed.** Skip it. Do not re-report. | **`STILL-OPEN`.** Carry into the report every run. Never skip. |
| Drifts | **Regression.** Report loudly.         | Improvement or change — re-measure and restate.                |

Two failure modes this exists to prevent, both found in the v1 prototype:

- `direction` exists because string equality reports _improvement_ as drift. A `sys.path.insert` count going 28 → 27 is a fix, not a regression. Use `at-most`. Never assert a raw line number — assert `grep -c ≥ 1` instead, or an edit anywhere above it drifts a claim that has not changed.
- `state` exists because `HOLDS` on "0 security headers found" means **still broken**. Treating that as closed would silently retire the finding forever.

## Step 2 — Two passes, with different epistemics

**Do not read a large fraction of the corpus and form impressions.** That is the sampling that made v1 vary.

**Diff pass** — bug-class findings on code changed since the last review (`git log <last-review-sha>..HEAD`). Bounded, and exhaustive over that diff.

**Invariant pass** — `grep -c`-shaped checks across the whole tree. Complete by construction, cheap, and identical between runs. This is where absences and structural claims live.

Absence findings are **always full-scope** and are never diff-scoped — an absence appears in no diff by definition. On 2026-08-23, five of the six files carrying that review's real findings had **zero commits** in the window; diff-only scoping would have surfaced none of it.

## Step 3 — The bar for a finding

**A finding carries a command, or it is not a finding.** No command → it goes under `## Judgment` with **no severity tag**. Severity on an unverifiable claim is what made v1 output indistinguishable from opinion.

The FACTS table in the report is **generated from the probe file**, not hand-written, so a finding without a command cannot appear there.

### Confidence, and the floor

Score every finding 0-100. Give the agent this rubric verbatim:

- **0** — false positive under light scrutiny.
- **25** — might be real; could not verify.
- **50** — verified real, but a nitpick or rare in practice.
- **75** — verified, will be hit in practice, the existing approach is insufficient.
- **100** — confirmed, will happen frequently, evidence directly supports it.

**Discard below 80.**

### False positives — discard these

- Something that looks like a bug but is not.
- Pedantic nitpicks a senior engineer would not raise.
- Issues a linter, typechecker or compiler would catch. Assume CI runs.
- Changes that are likely intentional, or part of the broader change.

**Deliberately NOT on this list**, and this is the difference between an audit and a PR gate: _pre-existing issues_, _general code-quality issues (test coverage, documentation, security posture)_, and _issues on lines nobody modified_. The official per-PR plugin discards all three, correctly — its job is to review a change. **This skill's job is the standing state**, and those three categories are most of what it exists to find. They route to the absence lane below, not to the bin.

## Step 4 — The absence lane

A bug rubric asks "did you verify it reproduces." An absence has nothing to reproduce, so real findings score like guesses — and score 0 outright if judged "pre-existing". An absence is not low-confidence; it is **differently evidenced**.

An absence-class finding is admissible only with **all four**:

1. **Claim** — "X is absent from SCOPE", scope named.
2. **Search** — the exact command. Count with `wc -l`. **Never `head`** — a truncated completeness search measures nothing.
3. **Exhaustive over that scope, not sampled.** A sampled absence is inadmissible. Sampling can establish a positive; it can never establish a negative.
4. **Positive control** — proof the instrument can return non-zero. Three admissible forms:
   - **Sibling positive.** Same command, adjacent term, non-zero. (`grep -riE` for `x-frame-options` over `src/` finds 0; the same regex over the same paths for `Content-Type` finds N — the regex, paths and flags are live.)
   - **Planted fixture, committed.** A file the probe greps for and expects to find, so liveness is re-derived on every future run rather than once.
   - **Instrument self-test in the probe.** A `check` against a term guaranteed present in the same scope. Always available; use this when no sibling exists.

**There is no fourth case.** No positive control → inadmissible → `## Judgment`. If you cannot show the instrument can return non-zero, you have not measured anything.

Score absences on exhaustiveness and instrument liveness. Not the bug rubric.

## Step 5 — Fan-out, and asserting delivery

State your fan-out before you start, and keep it small. Default: **one agent per pass** (diff, invariant). Do not improvise a wider fan-out — that is what broke the 2026-08-23 run.

**Instruct every agent to deliver its findings by calling `SendMessage`.** In that run, agents that finished and returned their work as final text were silently not received: five of nine. Only those that called `SendMessage` arrived.

After the fan-out, **name every dispatched pass and whether it returned.** If one did not, say so in the report. Covering the gap yourself and not mentioning it is the specific failure that produced a false "zero exploitable findings."

## Step 6 — Write the two artifacts

Report sections, in order: **Still open** (from Step 1), **New findings** (≥80, with commands), **Closed this run**, **Judgment** (no severity tags), **Coverage** (passes run, passes that returned).

**No letter grades. No dimension scorecard.** They are judgment presented as measurement, and they crowd out the part that is evidence.

## Step 7 — Verify your own output, arithmetically

Run these and **paste the output into the report verbatim**. Self-assessment does not count — "I checked and it looks right" is the exact shape of the v1 failure.

```bash
wc -l docs/reviews/claims-<date>.md                         # must be <= 60
grep -cE '^\| [A-F][+-]? ' docs/reviews/claims-<date>.md    # must be 0
bash docs/reviews/claims-<date>.probe.sh; echo "exit=$?"    # must run
```

The probe's own self-check enforces the first two on every future run.

**Prove any new probe can fail** before trusting it: tamper its target, confirm it reports drift, restore. A check that cannot fail has measured nothing.

## Step 8 — Record

`crane_note` with tag `code-review`, venture-scoped: still-open count, new findings, closed count, and the probe path. No grades.

Then `crane_schedule(action: "complete", name: "code-review-{VENTURE}", ...)`. If it errors, say so in the summary rather than moving on.

## Step 9 — Issues, only on request

If there are findings ≥80 the Captain should track, **ask** before creating GitHub issues. Do not file speculatively — a filed issue nobody chose is backlog debt, and the standing guidance is "worth fixing, or kill it — don't file it."

---

## Notes

- **This skill is the standing-state audit.** The per-PR gate is the official `code-review` plugin, which reviews a single diff and correctly discards everything this skill exists to find. They are complementary; do not merge them.
- **Report ≤60 lines is a hard limit**, enforced by the probe's self-check. If the findings do not fit, the probe file carries them — that is what it is for.
- Distributed to venture repos by the launcher (`syncVentureSkills`) on every `crane <venture>` start, reading the **local** crane-console working tree. A stale local clone serves a stale skill: `git pull` crane-console after merging a change here.
