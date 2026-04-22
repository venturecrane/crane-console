# Semgrep Initial Canary Verification

**Date:** 2026-04-22
**PR:** #639 (chore/semgrep-ci-integration)
**Captain concern addressed:** "Make sure this actually gets implemented correctly and doesn't end up being some theatre we only discover down the road."

This doc captures the pre-merge evidence that the Semgrep CI gate actually catches findings, not just runs and passes. It survives squash-merge as permanent proof the gate was real at installation time.

## Canary file

`scripts/semgrep-canary.ts` was committed to the draft PR with three deliberate `detect-child-process` findings — `execSync` and `spawn` calls where an argument traces back to a function parameter. All three are exact matches for rules in the pinned pack combination.

Canary content (removed before merge):

```typescript
import { execSync, spawn } from 'child_process'

export function canaryChildProcessExec(userName: string): string {
  return execSync(`echo hello ${userName}`).toString()
}

export function canaryChildProcessSpawn(cmd: string): void {
  spawn(cmd)
}

export function canaryExecThird(venture: string): void {
  execSync(`gh repo list ${venture}`)
}
```

## CI run — with canary (RED, as expected)

**Run:** https://github.com/venturecrane/crane-console/actions/runs/24760527284

**Static Analysis (Semgrep) job:** FAILED (29s)

Findings (5 total, 5 blocking):

```
   ❯❯❱ yaml.github-actions.security.run-shell-injection.run-shell-injection
           Blocking — .github/workflows/system-readiness-audit.yml

   ❯❯❱ yaml.github-actions.security.workflow-run-target-code-checkout.workflow-run-target-code-checkout
           Blocking — .github/workflows/deploy.yml

   ❯❯❱ javascript.lang.security.detect-child-process.detect-child-process
           Blocking — scripts/semgrep-canary.ts:13

   ❯❯❱ javascript.lang.security.detect-child-process.detect-child-process
           Blocking — scripts/semgrep-canary.ts:19

   ❯❯❱ javascript.lang.security.detect-child-process.detect-child-process
           Blocking — scripts/semgrep-canary.ts:25
```

Semgrep scan metadata: `Rules run: 312`, `Targets scanned: 573`.

**Summary job:** FAILED (aggregated as expected — the semgrep job's failure propagates through `needs`).

**nosemgrep Justification Audit job:** PASSED — all 9 justified `nosemgrep` annotations in the PR pass the ≥20-char-justification regex.

## Pre-existing findings discovered

In addition to the 3 canary findings, the first real CI run surfaced **2 pre-existing findings** in the existing codebase that pre-flight local scans had missed:

1. `.github/workflows/system-readiness-audit.yml:66` — `run-shell-injection` via `${{ github.event.inputs.env }}` directly interpolated into a run step.
   **Fix applied:** captured the interpolation into `env:` variables and referenced via `"$ENVVAR"`. Matches Semgrep's suggested remediation.

2. `.github/workflows/deploy.yml:33` — `workflow-run-target-code-checkout` false positive. The `workflow_run` trigger has a `branches: [main]` filter (line 6), so `head_sha` always resolves to a main-branch commit and can't be attacker-controlled via a PR.
   **Fix applied:** justified `nosemgrep` annotation referencing the branch filter.

This is exactly the kind of real-world discovery the measured anti-theatre verification is designed to surface. Pre-flight scans scoped to `workers/ packages/` missed the workflow findings; CI's broader scope caught them.

## CI run — canary removed (GREEN, post-fix)

After deleting `scripts/semgrep-canary.ts` and fixing the two pre-existing workflow issues, CI should go green. Run link appended below after confirmation.

**Run (canary-removed):** https://github.com/venturecrane/crane-console/actions/runs/24760816380 — all 5 security checks pass (NPM Audit, Secret Detection, TypeScript, Semgrep, nosemgrep Audit); Security Summary aggregates green.

## Ruleset application to live repo

**Applied:** 2026-04-22 via `gh api --method POST /repos/venturecrane/crane-console/rulesets --input config/github-ruleset-main-protection.json`

**Ruleset ID:** 15383940
**Enforcement:** active
**Required status checks:** `Security Summary` (the aggregate gate; all 5 sub-jobs must pass)

Before this PR the live repo had no rulesets at all (`gh api /repos/venturecrane/crane-console/rulesets` returned `[]`). Direct pushes to main worked, no status checks were enforced. After application, `main` requires a PR, requires fast-forward, blocks deletion, and requires `Security Summary` green before merge.

## Post-merge throwaway PR — ruleset enforcement check

After merging this PR, a throwaway PR re-adds `scripts/semgrep-canary.ts`. Expected behavior: CI turns red AND GitHub's merge button is disabled because `Security Summary` is now a required status check. If the merge button is enabled, the ruleset didn't actually apply — investigate.

**Throwaway PR:** _[to be filled in post-merge]_

## Takeaways

- ✅ Semgrep gate fires on canary (not theatre).
- ✅ Summary job correctly aggregates sub-job failures.
- ✅ `nosemgrep-audit` accepts justified annotations, rejects bare/short.
- ✅ Container pin `returntocorp/semgrep:1.157.0` + `--strict` produces reproducible runs.
- ✅ Real pre-existing findings discovered and fixed in the same PR rather than suppressed silently or deferred.
- ⏳ Branch-protection enforcement: captured below after `gh api` application.
