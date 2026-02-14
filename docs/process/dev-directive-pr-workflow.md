# Dev Team Directive: PR-Based Workflow

**From:** Captain  
**Date:** January 12, 2026  
**Priority:** P1 - Process Change  
**Applies to:** All Venture Crane ventures

---

## Summary

All code changes must go through Pull Requests. No direct pushes to main.

---

## Why

- QA needs to verify on preview deployments BEFORE code hits production
- Direct-to-main means QA tests after users see it - that's backwards
- Vercel/preview systems automatically create URLs for every PR

---

## New Workflow

### Before (don't do this anymore)

```
branch → commit → push to main → deploy to production → QA tests on prod
```

### After (do this)

```
branch → commit → open PR → preview deploys → QA tests on preview → merge → production
```

---

## What Dev Must Do

### 1. Always Create a PR

```bash
git checkout -b feat/issue-XXX-description
# ... make changes ...
git add .
git commit -m "feat(component): description [#XXX]"
git push -u origin feat/issue-XXX-description
# Open PR on GitHub
```

### 2. Link PR to Issue

In PR description, include:

```
Closes #XXX
```

This auto-links the PR to the issue in GitHub's Development section.

### 3. Wait for Preview Deployment

After opening PR, the deployment system will:

- Build a preview deployment (1-2 minutes)
- Post a comment on the PR with the preview URL

### 4. Include Preview URL in Handoff

When reporting "PR ready for QA", include:

```
Issue #148 ready for QA
- PR: #52
- Preview: https://{preview-url}
- Commit: abc123
```

### 5. Update Labels

```
status:in-progress → status:qa
Add: needs:qa
```

---

## QA Flow Changes

- QA will test on the **preview URL**, not production
- Only after QA passes and merge completes does code reach production
- This means production stays stable while QA verifies

---

## Merge Flow

After `status:verified`:

1. Captain directs merge (to PM or Dev)
2. Merge PR to main
3. Production deployment triggers
4. Update to `status:done`, close issue

---

## Exceptions

**Hotfixes (P0 only):** If production is broken and needs immediate fix:

1. Still create PR
2. QA can verify on preview in parallel with urgency
3. Captain can authorize merge before full QA if severity warrants

No direct-to-main even for hotfixes unless Captain explicitly authorizes.

---

## Branch Naming Convention

```
{type}/issue-{number}-{short-description}
```

Types:

- `feat/` - New feature
- `fix/` - Bug fix
- `refactor/` - Code restructuring
- `docs/` - Documentation only
- `chore/` - Maintenance, dependencies

Examples:

- `feat/issue-148-inline-ctas`
- `fix/issue-152-fee-calculation`
- `refactor/issue-160-analyst-cleanup`

---

## Commit Message Format

```
{type}({scope}): {description} [#{issue}]
```

Examples:

- `feat(dashboard): add attention required section [#145]`
- `fix(analyst): correct fee double-counting [#152]`
- `refactor(scout): extract adapter interface [#160]`

---

## Questions?

Route to Captain via `needs:pm` label on any issue.
