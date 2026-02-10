# QA Checklists by Grade Level

**Version:** 1.0
**Date:** February 2, 2026
**Purpose:** Standardized checklists for what "QA passed" means at each level

---

## Overview

QA grade determines verification method and effort. Dev assigns grade at PR creation; PM may override.

| Grade | Method         | Who       | Effort                      |
| ----- | -------------- | --------- | --------------------------- |
| qa:0  | Automated only | CI        | None (CI green = pass)      |
| qa:1  | CLI/API        | Dev or PM | Low (curl, gh commands)     |
| qa:2  | Light visual   | PM        | Medium (quick spot-check)   |
| qa:3  | Full visual    | PM        | High (complete walkthrough) |

---

## qa:0 - Automated Only

**When to use:**

- Refactoring with existing test coverage
- Documentation-only changes
- Dependency updates (non-breaking)
- CI/config changes

### Checklist

- [ ] CI pipeline passes (all checks green)
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] All existing tests pass

### Evidence Required

None. CI status is the evidence.

### Approval Flow

1. Dev marks PR as ready
2. Captain verifies CI green
3. Captain directs merge

---

## qa:1 - CLI/API Verification

**When to use:**

- API endpoint changes
- Worker/backend logic
- Database migrations
- CLI tool updates
- Anything testable without browser

### Checklist

- [ ] CI pipeline passes
- [ ] **Endpoint responds correctly** (if API change)
  ```bash
  curl -X POST https://endpoint.workers.dev/path \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"test": "data"}'
  ```
- [ ] **Expected response format** verified
- [ ] **Error cases** return appropriate status codes
- [ ] **Database changes** visible (if migration)
  ```bash
  # Example: Verify table exists
  wrangler d1 execute DB --command "SELECT * FROM new_table LIMIT 1"
  ```
- [ ] **gh CLI verification** (if GitHub integration)
  ```bash
  gh api repos/org/repo/endpoint
  ```

### Evidence Required

- Command output showing success
- Copy/paste of response body (sanitized)

### Approval Flow

1. Dev marks PR as ready with verification commands
2. PM or Dev runs commands
3. PM submits result via `/v2/events` or reports to Captain
4. Captain directs merge on PASS

---

## qa:2 - Light Visual

**When to use:**

- Minor UI tweaks
- Text/copy changes
- Simple styling updates
- New UI element (single component)

### Checklist

- [ ] CI pipeline passes
- [ ] **Navigate to preview URL**
- [ ] **Target element visible** and correct
- [ ] **No obvious regressions** in surrounding area
- [ ] **Responsive check** (if applicable)
  - Desktop view OK
  - Mobile view OK (quick resize)

### Evidence Required

- Single screenshot showing the change
- Note any observations

### Approval Flow

1. Dev marks PR as ready with preview URL
2. PM does quick spot-check (2-5 min)
3. PM captures screenshot
4. PM submits via `/v2/events`
5. Captain directs merge on PASS

---

## qa:3 - Full Visual

**When to use:**

- New features with multiple states
- Complex UI interactions
- User flows (multi-step)
- Anything with significant UX impact

### Checklist

- [ ] CI pipeline passes
- [ ] **Navigate to preview URL**
- [ ] **Each Acceptance Criterion verified:**
  - [ ] AC1: [description] - PASS/FAIL
  - [ ] AC2: [description] - PASS/FAIL
  - [ ] AC3: [description] - PASS/FAIL
- [ ] **Happy path works** end-to-end
- [ ] **Edge cases checked:**
  - [ ] Empty states
  - [ ] Error states
  - [ ] Loading states
- [ ] **Responsive check:**
  - [ ] Desktop (1920px)
  - [ ] Tablet (768px)
  - [ ] Mobile (375px)
- [ ] **Cross-browser** (if critical):
  - [ ] Chrome
  - [ ] Safari (if macOS)
  - [ ] Firefox (if specified)

### Evidence Required

- Screenshot per AC
- Screenshot of key states (empty, error, loading)
- Video if complex interaction
- Notes on any issues found

### Approval Flow

1. Dev marks PR as ready with preview URL and AC list
2. PM enters QA Mode
3. PM tests each AC, captures evidence
4. PM submits via `/v2/events` with `scope_results`
5. Auto-labels based on verdict
6. Captain directs merge on PASS

---

## Grade Selection Guide

| Change Type    | Recommended Grade |
| -------------- | ----------------- |
| Docs only      | qa:0              |
| Tests only     | qa:0              |
| Deps update    | qa:0              |
| Config change  | qa:0              |
| API endpoint   | qa:1              |
| Worker logic   | qa:1              |
| DB migration   | qa:1              |
| CLI command    | qa:1              |
| Minor UI tweak | qa:2              |
| Text change    | qa:2              |
| Style update   | qa:2              |
| New feature    | qa:3              |
| User flow      | qa:3              |
| Complex UI     | qa:3              |

**When uncertain:** Grade higher. It's safer to over-verify than under-verify.

---

## Failure Handling

### qa:0 Failure

- CI failure blocks merge
- Dev fixes and pushes
- CI re-runs automatically

### qa:1 Failure

- PM/Dev reports failure with output
- `needs:dev` auto-applied
- Dev fixes and notifies when ready
- Re-verify from start

### qa:2/qa:3 Failure

- PM submits FAIL verdict via `/v2/events`
- Specific AC failures noted in `scope_results`
- `needs:dev` auto-applied
- Dev addresses issues
- Full re-verification required

---

## Evidence Capture Tips

### Screenshots

- Use full-page capture for context
- Highlight the specific change
- Include browser URL bar
- Dark mode: capture both if supported

### Commands

- Include full command (sanitize secrets)
- Show response body
- Note response time if relevant

### Videos

- Keep under 30 seconds
- Focus on the interaction
- Add voiceover or annotations if complex

---

## Related Documentation

- `team-workflow.md` - Full workflow including QA phases
- `dev-directive-qa-grading.md` - QA grade assignment rules
- `crane-relay-api.md` - `/v2/events` endpoint for result submission
