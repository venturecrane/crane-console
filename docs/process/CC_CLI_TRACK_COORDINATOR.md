# CC CLI Track Coordinator Workflow

**Version:** 1.0
**Last Updated:** 2026-01-16
**Audience:** Claude Code CLI operators acting as PM Track Coordinators

## Overview

The **CC CLI Track Coordinator** workflow enables a single Claude Code CLI instance to operate as both PM and Dev for one or more tracks. This document describes how to review backlog, plan multi-track work, validate feasibility, execute implementation, and escalate when needed.

## Prerequisites

### Required Access
- GitHub CLI (`gh`) authenticated with repo access
- Crane Relay API access with valid `RELAY_TOKEN`
- Repository permissions for target venture (crane-console, crane-operations, sc-operations, or dfg-console)

### Permission Configuration

CC CLI Track Coordinator requires auto-approval for common operations. Configure permissions in one of two ways:

**Option 1: Command-line flag (recommended for one-off sessions)**
```bash
claude-code --dangerously-skip-permissions
```

**Option 2: Settings file (recommended for regular use)**
Create or update `.claude/settings.json` in the repository:
```json
{
  "allowedPrompts": [
    { "tool": "Bash", "prompt": "run git commands" },
    { "tool": "Bash", "prompt": "run gh commands" },
    { "tool": "Bash", "prompt": "query relay API" },
    { "tool": "Bash", "prompt": "run tests" },
    { "tool": "Bash", "prompt": "install dependencies" },
    { "tool": "Bash", "prompt": "build the project" }
  ]
}
```

## Workflow Phases

### Phase 1: Backlog Review

**Objective:** Query project board, analyze dependencies, identify ready work.

**Steps:**
1. **Query Project Items**
   ```bash
   curl -H "Authorization: Bearer $RELAY_TOKEN" \
     "https://crane-relay.automation-ab6.workers.dev/project/items?org=venturecrane&project=1"
   ```

2. **Filter by Track and Status**
   - Focus on `status:ready` + `needs:dev` items for your assigned track(s)
   - Check for `type:epic` items that may contain sub-issues
   - Note any `prio:P0` or `prio:P1` items requiring urgent attention

3. **Analyze Dependencies**
   - Look for `depends-on:` references in issue bodies
   - Check for `blocked` or `needs:pm` labels indicating unresolved questions
   - Identify issues that can be worked in parallel vs. sequentially

4. **QA Grade Assessment**
   - **qa-grade:0** — Automated gates only (lint, types, tests) — CC CLI eligible
   - **qa-grade:1** — API/CLI verification (scriptable) — CC CLI eligible
   - **qa-grade:2+** — Requires visual verification — escalate to Desktop PM

### Phase 2: Planning

**Objective:** Create a multi-track implementation plan with clear sequencing.

**Guidelines:**
- **Maximum 3 tracks** in a single planning session
- Each track should have **2-5 issues** to maintain focus
- Prioritize issues with highest impact and fewest dependencies
- Group related work (e.g., API changes + tests, config + deployment)

**Planning Template:**
```markdown
## Multi-Track Plan

### Track 1: [Track Name]
**Issues:** #123, #124, #125
**Estimated Effort:** [S/M/L]
**Dependencies:** [None | Depends on Track 2 #xxx]
**Sequence:** Sequential | Parallel
**QA Approach:** [Automated | Scriptable verification]

### Track 2: [Track Name]
...

### Track 3: [Track Name]
...

## Execution Order
1. Track 1 #123 (no dependencies)
2. Track 2 #456 (parallel with Track 1)
3. Track 1 #124 (after #123)
...
```

### Phase 3: Dev Brain Review

**Objective:** Switch perspective to validate feasibility and identify risks.

**Review Checklist:**
- [ ] Are the requirements clear and unambiguous?
- [ ] Do I have access to all necessary APIs and services?
- [ ] Are there existing patterns I should follow?
- [ ] What are the testing requirements?
- [ ] Are there any breaking changes?
- [ ] Do I need to coordinate with other ventures?

**Switch Prompt:**
> "Switch to Dev perspective. Review the plan above and identify:
> 1. Any unclear requirements
> 2. Technical risks or blockers
> 3. Missing test coverage
> 4. Suggestions for simplification"

**Outcomes:**
- **Green light:** Proceed to execution
- **Questions:** Document and escalate (see Phase 5)
- **Risks identified:** Adjust plan or escalate

### Phase 4: Execute Mode

**Objective:** Implement issues, run tests, perform self-QA.

**Execution Loop:**

For each issue in the plan:

1. **Start Work**
   ```bash
   gh issue view {number} --repo {org}/{repo}
   git checkout -b feat/issue-{number}-{slug}
   ```

2. **Implement**
   - Follow agent brief if provided in issue body
   - Use existing patterns from codebase
   - Write tests for qa-grade:0 and qa-grade:1 issues

3. **Self-QA**
   - **qa-grade:0:** Run CI checks (lint, type-check, build, tests)
   - **qa-grade:1:** Run scriptable verification (API calls, CLI commands)
   - **qa-grade:2+:** Cannot self-verify — escalate after implementation

4. **Commit and Push**
   ```bash
   git add -A
   git commit -m "feat: [description]

   Closes #{number}

   Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
   git push -u origin feat/issue-{number}-{slug}
   ```

5. **Create PR**
   ```bash
   gh pr create --title "Issue #{number}: [title]" \
     --body "Closes #{number}

   ## Summary
   - [What changed]

   ## Test Plan
   - [How to verify]

   🤖 Generated with Claude Code" \
     --repo {org}/{repo}
   ```

6. **Update Labels**
   - **qa-grade:0/1:** Add `status:verified` if self-QA passed
   - **qa-grade:2+:** Add `status:qa` and escalate for visual verification

### Phase 5: Escalation

**When to Escalate:**
- Requirements are unclear or ambiguous
- Technical blocker requires architecture decision
- qa-grade:2+ issues need visual verification
- Breaking changes require coordination
- Security concerns (qa-grade:4)

**Escalation Format:**
```bash
gh issue edit {number} --add-label "needs:captain" --repo {org}/{repo}

gh issue comment {number} --body "**Escalated from CC CLI PM Track {N}**

**Reason:** [Unclear requirements | Technical blocker | Visual verification needed | Security concern]

**Context:** [What you tried, what you learned, what's unclear]

**Question/Decision needed:** [Specific ask with options if applicable]

**Impact:** [What's blocked, urgency level]" --repo {org}/{repo}
```

**Escalation Categories:**

| Category | Label | Example |
|----------|-------|---------|
| Unclear requirements | `needs:pm` | "Should this API be public or private?" |
| Technical blocker | `needs:captain` | "Relay endpoint doesn't support X — need architecture decision" |
| Visual verification | `needs:qa` | "qa-grade:2 — need human to verify UI" |
| Security concern | `needs:captain` | "Credential handling needs security review" |

### Phase 6: Session Management

**Context Limits:**
- CC CLI sessions have finite context (~200K tokens)
- Monitor context usage via session info
- Plan for session boundaries during multi-track work

**Session Boundaries:**

**End-of-Session (EOD equivalent):**
1. Document progress in a session summary
2. Update issue labels to reflect current state
3. Commit any in-progress work to a draft PR
4. Post a handoff comment on active issues

**Start-of-Session (SOD equivalent):**
1. Review previous session summary
2. Query relay for updated project state
3. Check for new escalation responses
4. Resume work from draft PRs

**Handoff Template:**
```markdown
## CC CLI Track Coordinator Session Summary

**Track(s):** T1, T2
**Date:** 2026-01-16
**Duration:** [Context used / 200K tokens]

### Completed
- #123 — Merged and verified
- #124 — PR created, awaiting QA

### In Progress
- #125 — Draft PR, 60% complete, branch: `feat/issue-125-slug`

### Blocked/Escalated
- #126 — Escalated with `needs:pm` (unclear API requirements)

### Next Session
- Resume #125 (complete implementation + tests)
- Check for response on #126 escalation
- Start #127 if unblocked
```

## QA Eligibility Reference

| Grade | Meaning | CC CLI Eligible? | Verification Method |
|-------|---------|------------------|---------------------|
| 0 | CI-only | ✅ Yes | Automated gates (lint, types, tests) |
| 1 | API/data | ✅ Yes | Scriptable checks (curl, gh, relay) |
| 2 | Functional | ❌ No | Requires UI interaction |
| 3 | Visual/UX | ❌ No | Requires human judgment |
| 4 | Security | ❌ No | Requires specialist review |

**Self-QA Workflow for qa-grade:0 and qa-grade:1:**
1. Run automated tests: `npm test`
2. Run type checking: `npm run type-check`
3. Run build: `npm run build`
4. For qa-grade:1, run scriptable verification (API calls, CLI output checks)
5. If all pass, add `status:verified` label and merge PR

## Related Documentation

- **Team Workflow:** See `workers/crane-command/CLAUDE.md` for slash command reference
- **EOD/SOD Process:** See handoff template in Phase 6 above
- **CC CLI Starting Prompts:** See `docs/process/CC_CLI_STARTING_PROMPTS.md` for copy-paste templates

## Example Session

**Scenario:** CC CLI PM assigned to Track 1, 3 ready issues

```bash
# Phase 1: Backlog Review
curl -H "Authorization: Bearer $RELAY_TOKEN" \
  "https://crane-relay.automation-ab6.workers.dev/project/items?org=venturecrane&project=1" \
  | jq '.items[] | select(.track == 1 and .status == "ready")'

# Output shows: #123 (qa-grade:0), #124 (qa-grade:1), #125 (qa-grade:2)

# Phase 2: Planning
# Create plan: #123 + #124 (CC CLI eligible), escalate #125 for visual QA

# Phase 3: Dev Brain Review
# [Switch perspective, validate requirements are clear]

# Phase 4: Execute
git checkout -b feat/issue-123-add-relay-endpoint
# [Implement, test, commit]
gh pr create --title "Add relay endpoint for project sync" --body "..."
# Self-QA passes → add status:verified
gh pr merge 123 --squash --repo venturecrane/crane-console

# Phase 5: Escalate #125
gh issue edit 125 --add-label "needs:qa" --repo venturecrane/crane-console
gh issue comment 125 --body "**Escalated from CC CLI PM Track 1**

**Reason:** Visual verification needed (qa-grade:2)

**Context:** Implementation complete, tests pass, but UI changes require human review.

**Question/Decision needed:** Please verify the button placement and styling match design specs." \
  --repo venturecrane/crane-console

# Phase 6: Session Summary
# [Document progress, update labels, prepare handoff]
```

## Tips for Effective Track Coordination

1. **Start small:** Begin with 1-2 issues to calibrate effort estimation
2. **Batch similar work:** Group API changes together, tests together, etc.
3. **Use draft PRs:** For work that spans multiple sessions
4. **Escalate early:** Don't waste context on blocked work
5. **Document context:** Future sessions (or human PMs) need clear handoffs
6. **Monitor token usage:** Plan session boundaries before hitting limits
7. **Verify before merging:** Even qa-grade:0 needs CI checks to pass

## Troubleshooting

**Problem:** Relay API returns 401 Unauthorized
**Solution:** Check that `RELAY_TOKEN` is set and valid. Test with:
```bash
curl -H "Authorization: Bearer $RELAY_TOKEN" \
  "https://crane-relay.automation-ab6.workers.dev/project/items?org=venturecrane&project=1"
```

**Problem:** Can't create PR due to branch protection
**Solution:** Ensure you're pushing to a feature branch, not `main`. Format: `feat/issue-{number}-{slug}`

**Problem:** Self-QA unclear for qa-grade:1
**Solution:** Check issue body for "Test Plan" section. If missing, escalate with `needs:pm` for clarification.

**Problem:** Context limit approaching during multi-issue work
**Solution:** Wrap up current issue, create handoff summary, start fresh session.

## Version History

- **1.0** (2026-01-16): Initial documentation for CC CLI Track Coordinator workflow
