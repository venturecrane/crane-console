---
title: 'AC-Tick Workflow Rollout'
sidebar:
  order: 5
---

# AC-Tick Workflow Rollout

How to add the canonical acceptance-criteria enforcement workflows to a venture repo. This is the runbook for cascading the workflows ss-console#633 introduced into the rest of the enterprise (#775) and for adopting them in any new venture.

## What it does

Two workflows that work as a pair:

- **`tick-acs-on-merge`** — on PR merge, parses the PR body's `## Acceptance criteria status` table, finds rows marked `met`, and ticks the corresponding `- [ ]` checkboxes in the linked issue's body. Posts an audit comment on the issue with what was ticked, what was refused, and why.
- **`unmet-ac-on-close`** — on manual issue close (not PR-driven), checks the issue body for unchecked `- [ ]` items under an `Acceptance criteria` section. If any remain, reopens the issue and applies the `closed-with-unmet-ac` label. Override available via the `force-close` label applied before close.

The two workflows have non-overlapping responsibilities: `tick-acs-on-merge` owns PR-driven closes, `unmet-ac-on-close` owns manual closes only and skips when GitHub's timeline shows the close was driven by a merge commit.

## Architecture

The canonical implementations live in this repo:

- `.github/workflows/tick-acs-on-merge-reusable.yml`
- `.github/workflows/unmet-ac-on-close-reusable.yml`

Each venture has thin caller workflows that delegate via `workflow_call`. Updates ship once in crane-console; ventures pick them up by bumping a tag reference.

## Caller workflow shape (per venture)

External venture's `.github/workflows/tick-acs-on-merge.yml`:

```yaml
name: Tick ACs on PR merge

on:
  pull_request:
    types: [closed]

jobs:
  tick:
    uses: venturecrane/crane-console/.github/workflows/tick-acs-on-merge-reusable.yml@tick-acs-v1
    secrets: inherit
    permissions:
      issues: write
      pull-requests: write
      contents: read
```

External venture's `.github/workflows/unmet-ac-on-close.yml`:

```yaml
name: Unmet AC on close

on:
  issues:
    types: [closed]

jobs:
  check:
    uses: venturecrane/crane-console/.github/workflows/unmet-ac-on-close-reusable.yml@tick-acs-v1
    secrets: inherit
    permissions:
      issues: write
```

For crane-console itself (and any future repo that hosts the reusables), use the relative path `./.github/workflows/...` instead of the pinned ref.

## PR template AC-status section

Append this section to `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Acceptance criteria status

<!--
For each acceptance criterion in the linked issue, state which commit/file
satisfies it OR mark it deferred with `scope-deferred` label + rationale below.

Do not skip ACs you didn't touch — list them all and mark them as already-met,
N/A, or deferred. Reviewers approve based on this table.
-->

| AC (verbatim from issue) | Status               | Evidence                         |
| ------------------------ | -------------------- | -------------------------------- |
|                          | met / deferred / n/a | commit / file:line / explanation |

## Deferred ACs (required if `scope-deferred` label is set)

<!--
Only fill this section if you are deferring one or more ACs. Each deferred AC
needs a rationale and a follow-on issue.
-->

- **AC:** _(verbatim text)_
  - **Why deferred:** _(scope, dependency, infra gap, etc.)_
  - **Tracked in:** #NNN
```

The companion parses the table from this section. Rows where the AC text matches an unchecked `- [ ]` line in the issue body get ticked. The matcher works in three tiers:

1. **H-code primary** — if both PR row and issue line start with an H-code (`H1`, `AC2`, etc.), match by code.
2. **Normalized text** — strip bold/italic/backticks/links, lowercase, trim trailing punctuation, exact match.
3. **Positional fallback** — only when the issue has no H-codes AND the PR table has the same number of `met` rows as unchecked AC lines.

Whatever can't be matched is logged in the audit comment with a closest-match suggestion. Non-fatal — humans tick by hand.

## Required labels

Create these in the venture repo (the workflow won't fail without them, but the comment-and-reopen flow won't fully work):

```bash
gh label create force-close \
  --color 5319E7 \
  --description "Approved close despite unchecked acceptance criteria" \
  --repo venturecrane/{venture}

gh label create closed-with-unmet-ac \
  --color D93F0B \
  --description "Auto-applied when an issue is reopened due to unchecked ACs" \
  --repo venturecrane/{venture}
```

`force-close` is the override — apply it before closing an issue with unchecked ACs to suppress the auto-reopen. This is a visible scope decision, not a silent omission.

`closed-with-unmet-ac` is auto-applied by the workflow when it reopens. It surfaces the queue of issues that got route-around treatment.

## Smoke test expectations

When a PR with a populated AC-status table merges and closes a linked issue:

- `unmet-ac-on-close` runs first (issue was just closed). It detects the close was PR-driven (timeline `commit_id` is set) and skips with `core.info`.
- `tick-acs-on-merge` runs in parallel. It resolves linked issues via GraphQL, parses the PR body's AC table, attempts to match and tick. Posts an audit comment on the issue.

If the issue body had no `Acceptance criteria` section, both workflows are no-ops.

If the PR body had no AC-status table, `tick-acs-on-merge` is a no-op and the issue keeps any existing checked/unchecked state.

If `tick-acs-on-merge` fails to match every row, the unmatched rows show up in the audit comment with a closest-AC suggestion. The merge does not block on this — humans read and tick by hand.

## Bumping the tag (future updates)

When the canonical workflows in crane-console need a breaking change:

1. Land the change in crane-console on `main`.
2. `git tag tick-acs-v2 origin/main -m "Reusable AC-tick workflows v2 (#NNN)"`
3. `git push origin tick-acs-v2`
4. Open one PR per venture bumping `@tick-acs-v1` → `@tick-acs-v2` in the caller workflows.
5. Update `templates/venture/.github/workflows/*.yml` so future ventures get the new tag.

Non-breaking changes can update `tick-acs-v1` in place by force-pushing the tag, but prefer a new tag for clarity.

## References

- Tracking issue: [crane-console#775](https://github.com/venturecrane/crane-console/issues/775)
- Source PR: [ss-console#633](https://github.com/venturecrane/ss-console/pull/633)
- Originating policy: [ss-console#377](https://github.com/venturecrane/ss-console/issues/377) Move 2 — block issue-close when ACs are unchecked
