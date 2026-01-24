# Dev Directive: QA Grading System

**Version:** 1.0
**Date:** January 24, 2026
**Status:** APPROVED

---

## Purpose

The QA grading system eliminates the Chrome automation bottleneck by routing work to the appropriate verification method. Not all work needs visual verification—API changes don't need Chrome, refactors with tests don't need manual checks.

## The Four Grades

| Grade | Name | Verification Method |
|-------|------|---------------------|
| `qa:0` | Automated only | CI green = pass. No manual verification. |
| `qa:1` | CLI/API verifiable | curl, gh CLI, DB queries. No browser needed. |
| `qa:2` | Light visual | Quick spot-check, single screenshot. |
| `qa:3` | Full visual | Complete walkthrough, full evidence capture. |

---

## When to Use Each Grade

### qa:0 — Automated Only

**Use for:**
- Refactoring with comprehensive test coverage
- Test-only changes
- Documentation updates
- Configuration changes with tests
- Internal utilities with test coverage

**Verification:**
- CI must pass
- No manual testing required
- Captain can direct merge immediately after CI green

**Example PRs:**
- "Refactor auth module with 100% coverage"
- "Add unit tests for API client"
- "Update README with setup instructions"

### qa:1 — CLI/API Verification

**Use for:**
- API endpoint changes
- CLI command changes
- Database migrations
- Backend logic changes
- Worker/cron jobs
- Webhook handlers

**Verification:**
- Run commands specified in PR (curl, gh, DB queries)
- Confirm expected results
- No browser interaction needed

**Example PRs:**
- "Add /api/users/search endpoint"
- "Update database schema for user roles"
- "Fix worker job retry logic"

### qa:2 — Light Visual

**Use for:**
- Minor UI tweaks
- CSS adjustments
- Small feature additions
- Bug fixes with obvious visual impact
- Single-page changes

**Verification:**
- Navigate to preview URL
- Quick spot-check per ACs
- Capture single screenshot as evidence
- 5-10 minute verification

**Example PRs:**
- "Fix button alignment on login page"
- "Update header color scheme"
- "Add error message for invalid input"

### qa:3 — Full Visual (Original Flow)

**Use for:**
- New user flows
- Multi-page features
- Complex UI interactions
- Authentication/authorization changes
- Integrations with external services
- Anything involving state changes across pages

**Verification:**
- Navigate through complete flow on preview URL
- Test each Acceptance Criterion
- Capture screenshot evidence for each
- Record PASS/FAIL per AC
- Submit results via `/v2/events`

**Example PRs:**
- "Implement user registration flow"
- "Add OAuth integration"
- "Build dashboard with multiple widgets"

---

## Assignment Protocol

### Dev Team Responsibility

When creating a PR:

1. **Evaluate work type** against the grade criteria above
2. **Add exactly one QA grade label:** `qa:0`, `qa:1`, `qa:2`, or `qa:3`
3. **Include in PR description:**
   - QA grade assigned
   - Verification instructions for qa:1 (commands to run)
   - Preview URL for qa:2/qa:3
4. **Update status:** `status:in-progress` → `status:qa`
5. **Add routing label:** `needs:qa`
6. **Notify Captain with:** issue #, PR #, **QA grade**, preview URL (if applicable), commit SHA

**When uncertain, grade higher.** Better to over-verify than miss issues.

### PM Team Override

PM can upgrade the grade during verification if they disagree:

- Dev marked `qa:0` but changes are user-facing → upgrade to `qa:2`
- Dev marked `qa:1` but complex UI logic → upgrade to `qa:3`

If grade overrides become a pattern, Captain addresses with Dev Team.

---

## Verification Routing

### qa:0 — No Routing Needed

1. Captain checks CI status on PR
2. If green, Captain directs merge immediately
3. PM updates labels: `status:qa` → `status:verified`

### qa:1 — Route to Dev Self-Verify OR PM CLI Check

**Option A: Dev Self-Verify**
1. Captain routes back to Dev: "Please verify via CLI per your instructions"
2. Dev runs commands from PR description
3. Dev confirms expected results to Captain
4. Captain directs PM to update: `status:qa` → `status:verified`

**Option B: PM CLI Verification**
1. Captain routes to PM: "Issue #X ready for CLI verification"
2. PM runs commands from PR description
3. PM submits results via `/v2/events` or reports to Captain
4. On PASS: auto-transitions to `status:verified`

### qa:2 — Route to PM Quick Visual

1. Captain tells PM: "Issue #X ready for light QA"
2. PM navigates to preview URL
3. PM performs quick spot-check per ACs (5-10 min)
4. PM captures single screenshot as evidence
5. PM submits results via `/v2/events`
6. On PASS: auto-transitions to `status:verified`

### qa:3 — Route to PM Full Visual

1. Captain tells PM: "Issue #X ready for QA" with PR # and preview URL
2. PM switches to **QA Mode**
3. PM navigates to **preview URL** (NOT production)
4. PM tests each Acceptance Criterion:
   - Capture screenshot evidence for each
   - Record PASS/FAIL per AC
5. PM submits results via `/v2/events`:
   ```bash
   POST /v2/events
   {
     "event_id": "qa_{issue}_{timestamp}",
     "repo": "{org}/{repo}",
     "issue_number": {issue},
     "role": "QA",
     "agent": "PM-QA-Claude",
     "event_type": "qa.result_submitted",
     "overall_verdict": "PASS|FAIL",
     "build": { "commit_sha": "{sha}" },
     "scope_results": [
       { "id": "AC1", "status": "PASS|FAIL", "notes": "..." }
     ]
   }
   ```
6. V2 relay automatically:
   - Stores event in D1
   - Creates/updates rolling status comment on issue
   - Applies label transitions (PASS → `status:verified`, FAIL → `needs:dev`)

---

## Grade Gates

### Required Before status:qa

- [ ] PR created with link to issue
- [ ] PR passes CI
- [ ] **Exactly one QA grade label applied**
- [ ] For qa:1: Verification commands documented in PR
- [ ] For qa:2/qa:3: Preview URL included in PR

### Cannot Proceed Without Grade

If a PR reaches `status:qa` without a grade label:

1. Captain routes back to Dev: "Please assign QA grade"
2. Dev evaluates and adds label
3. Dev notifies Captain with updated status

---

## Examples by Component

### Infrastructure/Backend (qa:0 or qa:1)

- Database migrations → `qa:1`
- Worker job changes → `qa:1`
- API endpoint refactor with tests → `qa:0`
- Cron job logic → `qa:1`

### API/CLI (qa:1)

- New REST endpoint → `qa:1`
- GraphQL resolver changes → `qa:1`
- CLI command additions → `qa:1`
- Webhook handlers → `qa:1`

### UI Components (qa:2 or qa:3)

- Button style fix → `qa:2`
- New modal dialog → `qa:2`
- Multi-step wizard → `qa:3`
- Dashboard with multiple widgets → `qa:3`

### Auth/Security (usually qa:3)

- Login flow changes → `qa:3`
- OAuth integration → `qa:3`
- Permission system updates → `qa:3`
- Session handling → `qa:3`

---

## Anti-Patterns

### Don't Grade Down for Convenience

❌ "This needs full testing but I don't want to wait, so I'll mark it qa:0"
✅ "This is complex user-facing work, marking qa:3"

### Don't Skip Instructions for qa:1

❌ "Marked qa:1" (no commands provided)
✅ "Marked qa:1. To verify: `curl https://preview.app/api/users | jq '.[]'`"

### Don't Upgrade Without Reason

❌ PM upgrades every qa:1 to qa:2 "just to be safe"
✅ PM upgrades qa:1 to qa:2 only when visual verification is actually needed

### Don't Grade Based on Effort

❌ "I worked on this for 3 days, so it must be qa:3"
✅ "This is an API change with no UI impact, so it's qa:1"

---

## FAQ

**Q: Why do we need QA grades?**
A: Not all work needs visual verification. API changes don't need Chrome. Refactors with tests don't need manual checks. Grading routes work to the right verification method, eliminating the Chrome automation bottleneck for work that doesn't need it.

**Q: Who assigns QA grade?**
A: Dev Team assigns at PR creation based on the work type. PM can override at QA time if they disagree. When uncertain, grade higher.

**Q: What if Dev grades too low?**
A: PM catches it during verification and upgrades the grade. If it becomes a pattern, Captain addresses with Dev Team.

**Q: Can I use multiple grades on one PR?**
A: No. Exactly one grade per PR. If a PR has mixed changes, use the highest grade needed for any part of it.

**Q: What if grade changes during development?**
A: Update the label before moving to `status:qa`. If scope expands significantly, consider splitting into separate PRs.

**Q: Do all repos use this system?**
A: Yes. All Venture Crane projects use the qa:0-3 grading system as of January 2026.

**Q: What if I'm unsure between two grades?**
A: Grade higher. Better to over-verify than miss issues. Example: unsure between qa:1 and qa:2? Use qa:2.

**Q: Can Captain override the grade?**
A: Yes. Captain can direct PM to use a different verification method regardless of label. This is rare but useful for high-risk changes.

---

## Related Documentation

- `TEAM_WORKFLOW.md` - Complete workflow including QA grading integration
- `DEV_DIRECTIVE_PR_WORKFLOW.md` - PR creation and description requirements
- `AGENT_PERSONA_BRIEFS.md` - Dev Team and PM Team responsibilities
- `CRANE_RELAY_API.md` - `/v2/events` endpoint for QA result submission

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 24, 2026 | Initial extraction from TEAM_WORKFLOW v1.8 |
