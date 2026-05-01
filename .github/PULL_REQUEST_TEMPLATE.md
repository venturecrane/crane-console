## Summary

<!-- Brief description of what this PR does -->

## Related Issues

<!-- Link to related issues: Closes #123, Relates to #456 -->

## Changes

<!-- Bullet list of key changes -->

-

## Acceptance criteria status

<!--
For each acceptance criterion in the linked issue, state which commit/file
satisfies it OR mark it deferred with `scope-deferred` label + rationale below.

Do not skip ACs you didn't touch — list them all and mark them as already-met,
N/A, or deferred. Reviewers approve based on this table. Auto-ticked on merge
by .github/workflows/tick-acs-on-merge.yml — see
docs/runbooks/ac-tick-workflow-rollout.md.
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

## Test Plan

<!-- How was this tested? Include commands, screenshots, etc. -->

- [ ]

## Security Checklist

<!-- Review each item - check if addressed or N/A -->

- [ ] No secrets in code or comments
- [ ] No PII exposed in frontend responses
- [ ] Input validation on new endpoints
- [ ] Parameterized queries for any SQL (use `.bind()`)
- [ ] Auth required on new endpoints
- [ ] No internal IDs that enable enumeration

## Feature Impact

<!-- Does this PR remove, disable, or change any existing user-facing functionality? -->

**Feature impact:** None

<!-- Write "None" if no existing features are affected -->
<!-- Write "Authorized - #{directive}" if Captain approved the removal/change -->
<!-- If neither applies, STOP - fetch crane_doc('global', 'guardrails.md') -->

## Deployment Notes

<!-- Any special deployment considerations? Leave blank if standard deploy -->
