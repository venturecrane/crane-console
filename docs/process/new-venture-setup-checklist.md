# New Venture Setup Checklist

**Version:** 1.1
**Last Updated:** 2026-01-31
**Purpose:** Complete checklist for onboarding a new venture to Crane infrastructure

---

## Overview

When creating a new venture (like VC, SC, DFG, KE), follow this checklist to ensure all Crane infrastructure is properly configured. Missing steps will cause agent sessions to fail or lack proper context.

**Venture Naming Convention:**
- **Full Name:** Title Case (e.g., "Kid Expenses", "Durgan Field Guide")
- **Venture Code:** 2-3 lowercase letters (e.g., `ke`, `dfg`, `sc`, `vc`)
- **GitHub Org:** lowercase, may differ from venture code (e.g., `kidexpenses`, `durganfieldguide`)

---

## Phase 1: GitHub Setup

### 1.1 Create GitHub Organization
- [ ] Create org at github.com/organizations/new
- [ ] Name: lowercase, product-focused (e.g., `kidexpenses`)
- [ ] Add org owners (founders/leads)

### 1.2 Create Console Repository
- [ ] Create `{product}-console` repo (e.g., `ke-console`)
- [ ] Initialize with README.md
- [ ] Add standard directories:
  ```
  {product}-console/
  ├── .claude/commands/     # Claude Code slash commands
  ├── .github/              # Issue templates, PR template
  ├── docs/                 # Documentation
  │   ├── adr/              # Architecture Decision Records
  │   ├── pm/               # PM documents (PRD, specs)
  │   └── process/          # Process documentation
  ├── scripts/              # Utility scripts
  └── workers/              # Cloudflare Workers (if applicable)
  ```

### 1.3 Configure Issue Templates
- [ ] Copy from existing venture (e.g., crane-console/.github/ISSUE_TEMPLATE/)
- [ ] Customize labels for venture
- [ ] Required labels:
  - `prio:P0`, `prio:P1`, `prio:P2`, `prio:P3`
  - `status:triage`, `status:ready`, `status:in-progress`, `status:blocked`, `status:qa`, `status:done`
  - `type:feature`, `type:bug`, `type:tech-debt`, `type:docs`

### 1.4 Create GitHub Project Board
- [ ] Create project at github.com/orgs/{org}/projects
- [ ] Name: "{Product} Sprint Board"
- [ ] Configure columns: Triage → Ready → In Progress → Blocked → QA → Done
- [ ] Link to repository

### 1.5 GitHub App Installation (for auto-classification)
- [ ] Install "Crane Relay" GitHub App on the org
- [ ] Grant access to the console repository
- [ ] Note the installation ID (needed for crane-classifier config)

---

## Phase 2: Crane Classifier Setup

### 2.1 Add Venture to crane-classifier
- [ ] Update `workers/crane-classifier/wrangler.toml`:
  ```toml
  # Add installation ID to GH_INSTALLATIONS_JSON
  GH_INSTALLATIONS_JSON = '{"durganfieldguide":"103277966","venturecrane":"104223482","siliconcrane":"104223351","kidexpenses":"106532992","{github-org}":"{installation-id}"}'
  ```
- [ ] Deploy crane-classifier: `cd workers/crane-classifier && npx wrangler deploy`

### 2.2 Test Auto-Classification
- [ ] Create a test issue:
  ```bash
  gh issue create --repo {org}/{repo} \
    --title "TEST: Crane Classifier verification" \
    --body "## Acceptance Criteria
  - [ ] AC1: Test auto-classification

  Delete after verifying."
  ```
- [ ] Verify issue receives `qa:X` and `automation:graded` labels automatically
- [ ] Close/delete test issue

---

## Phase 3: Crane Context Setup

### 3.1 Add Venture to sod-universal.sh
- [ ] Update `scripts/sod-universal.sh` in crane-console:
  ```bash
  case "$ORG" in
    durganfieldguide) VENTURE="dfg" ;;
    siliconcrane) VENTURE="sc" ;;
    venturecrane) VENTURE="vc" ;;
    {github-org}) VENTURE="{venture-code}" ;;  # Add this
    *) VENTURE="unknown" ;;
  esac
  ```
- [ ] Copy updated script to new venture's repo

### 3.2 Seed Venture Documentation

Upload project-specific documentation to crane-context:

```bash
# Upload PRD or Project Instructions
curl -X POST "https://crane-context.automation-ab6.workers.dev/admin/docs" \
  -H "X-Admin-Key: $CRANE_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "{venture-code}",
    "doc_name": "{venture-code}-project-instructions.md",
    "title": "{Product Name} Project Instructions",
    "description": "Product requirements and development guidelines",
    "content": "... full markdown content ..."
  }'
```

**Required Documents:**
- [ ] `{venture-code}-project-instructions.md` - PRD or product overview
- [ ] Additional venture-specific docs as needed

**Verification:**
```bash
# Check docs are accessible
curl -s "https://crane-context.automation-ab6.workers.dev/docs?venture={venture-code}" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY"
```

### 3.3 Test SOD Flow
- [ ] Run `/sod` in the new repo
- [ ] Verify:
  - Session created successfully
  - Documentation cached to `/tmp/crane-context/docs/`
  - GitHub issues displayed
  - Correct venture shown in Context Confirmation

---

## Phase 4: Local Development Setup

### 4.1 Claude Code Commands
Copy standard commands from crane-console:
- [ ] `.claude/commands/sod.md`
- [ ] `.claude/commands/eod.md`
- [ ] `.claude/commands/heartbeat.md`
- [ ] `.claude/commands/update.md`

### 4.2 CLAUDE.md Configuration
- [ ] Create `CLAUDE.md` in repo root with:
  - Project overview
  - Build commands
  - Code patterns
  - Slash commands reference

### 4.3 Scripts
- [ ] Copy `scripts/sod-universal.sh` (updated with venture mapping)
- [ ] Copy other utility scripts as needed

---

## Phase 4.5: Code Quality Infrastructure

> **Reference:** See `docs/standards/` for templates and detailed guidance.

### 4.5.1 Testing Scaffold

- [ ] Install vitest: `npm i -D vitest`
- [ ] Create `vitest.config.ts`:
  ```typescript
  import { defineConfig } from 'vitest/config';
  export default defineConfig({
    test: {
      globals: true,
    },
  });
  ```
- [ ] Add test script to `package.json`:
  ```json
  {
    "scripts": {
      "test": "vitest",
      "test:run": "vitest run"
    }
  }
  ```
- [ ] Create first smoke test:
  ```typescript
  // test/health.test.ts
  import { describe, it, expect } from 'vitest';

  describe('Health', () => {
    it('placeholder test passes', () => {
      expect(true).toBe(true);
    });
  });
  ```
- [ ] Verify `npm test` runs successfully

### 4.5.2 CI/CD Pipeline

- [ ] Copy CI workflow template:
  ```bash
  mkdir -p .github/workflows
  cp /path/to/crane-console/docs/standards/ci-workflow-template.yml .github/workflows/ci.yml
  ```
- [ ] Customize workflow for venture:
  - [ ] Update worker directory paths
  - [ ] Add required secrets to GitHub repo settings
- [ ] Verify PR checks run on first PR

### 4.5.3 Pre-commit Enforcement (Optional but Recommended)

- [ ] Install husky and lint-staged:
  ```bash
  npm i -D husky lint-staged
  npx husky init
  ```
- [ ] Configure lint-staged in `package.json`:
  ```json
  {
    "lint-staged": {
      "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
      "*.{json,md}": ["prettier --write"]
    }
  }
  ```
- [ ] Create pre-commit hook:
  ```bash
  echo "npx lint-staged" > .husky/pre-commit
  ```

### 4.5.4 API Structure (If Hono Worker Exists)

> **Reference:** See `docs/standards/api-structure-template.md`

For new APIs:
- [ ] Follow modular structure from template
- [ ] Separate routes, services, middleware, types

For existing monolithic APIs (>500 LOC):
- [ ] Create issue to refactor (not blocking for launch)
- [ ] Document current structure in CLAUDE.md

---

## Phase 5: Verification Checklist

### Agent Session Test
- [ ] `/sod` creates session and shows correct context
- [ ] Documentation is cached and accessible
- [ ] GitHub issues are displayed
- [ ] `/eod` creates handoff successfully
- [ ] Next `/sod` shows previous handoff

### Issue Workflow Test
- [ ] Create issue via GitHub UI
- [ ] Issue appears in `/sod` queues
- [ ] Labels work correctly
- [ ] Comments can be added via crane-relay (if applicable)

### Team Access
- [ ] All team members have GitHub org access
- [ ] All team members have `CRANE_CONTEXT_KEY` configured
- [ ] All team members can run `/sod` successfully

---

## Quick Reference: Venture Registry

| Venture | Code | GitHub Org | Console Repo |
|---------|------|------------|--------------|
| Venture Crane | `vc` | venturecrane | crane-console |
| Silicon Crane | `sc` | siliconcrane | sc-console |
| Durgan Field Guide | `dfg` | durganfieldguide | dfg-console |
| Kid Expenses | `ke` | kidexpenses | ke-console |

---

## Troubleshooting

### "Could not determine venture from org"
- Ensure org is added to `sod-universal.sh` case statement
- Check git remote: `git remote get-url origin`

### "No documentation available"
- Verify docs were uploaded to crane-context
- Check scope matches venture code exactly
- Test with: `curl /docs?venture={code}`

### "Session creation failed"
- Verify `CRANE_CONTEXT_KEY` is set
- Test Context Worker health: `curl https://crane-context.automation-ab6.workers.dev/health`

### "GitHub issues not showing"
- Verify `gh auth status`
- Check repo has correct labels configured
- Verify GitHub App is installed on org

---

## Maintenance

### When Adding Team Members
1. Add to GitHub org
2. Share `CRANE_CONTEXT_KEY` via Bitwarden
3. Have them run bootstrap: `bash scripts/refresh-secrets.sh`
4. Verify `/sod` works

### When Updating Documentation
1. Update source in venture repo
2. Re-upload to crane-context via admin endpoint
3. Team members will get updated docs on next `/sod`

---

## Related Standards

These documents in `docs/standards/` provide detailed templates:

| Document | Purpose |
|----------|---------|
| `api-structure-template.md` | Reference architecture for Hono APIs |
| `ci-workflow-template.yml` | GitHub Actions CI/CD template |
| `nfr-assessment-template.md` | Code quality review checklist |

---

*Last updated: 2026-01-31 by Crane Infrastructure Team*
