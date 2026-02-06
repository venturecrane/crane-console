# New Venture Setup Checklist

**Version:** 1.3
**Last Updated:** 2026-02-03
**Purpose:** Complete checklist for onboarding a new venture to Crane infrastructure

---

## Automation Available

Most of this checklist can be automated using `scripts/setup-new-venture.sh`.

### What's Automated

| Step | Automated | Script |
|------|-----------|--------|
| Create GitHub repo | Yes | `gh repo create --template venturecrane/venture-template` |
| Initialize directory structure | Yes | Included in template |
| Create standard labels | Yes | `setup-new-venture.sh` |
| Create project board | Yes | `setup-new-venture.sh` |
| Update crane-context (venture registry) | Yes | `setup-new-venture.sh` |
| Update crane-classifier | Yes | `setup-new-venture.sh` |
| Update crane launcher (INFISICAL_PATHS) | Yes | `setup-new-venture.sh` |
| Deploy workers | Yes | `setup-new-venture.sh` |
| Clone to dev machines | Yes | `deploy-to-fleet.sh` |
| Copy .infisical.json to new repo | Yes | `setup-new-venture.sh` |

### What Requires Manual Steps

| Step | Why Manual |
|------|------------|
| Create GitHub organization | GitHub API limitation |
| Install "Crane Relay" GitHub App | Requires browser/OAuth |
| Get installation ID | From GitHub App settings page |
| Seed venture documentation | Content is venture-specific |

### Quick Start (After Manual Prerequisites)

```bash
# 1. Manual: Create GitHub org (github.com/organizations/new)
# 2. Manual: Install "Crane Relay" on org, note installation ID

# 3. Create repo from Golden Path template
gh repo create {org}/{product}-console --template venturecrane/venture-template --private
gh repo clone {org}/{product}-console ~/dev/{product}-console

# 4. Run infrastructure setup (labels, classifier, context worker)
./scripts/setup-new-venture.sh <venture-code> <github-org> <installation-id>

# Example:
gh repo create kidexpenses/ke-console --template venturecrane/venture-template --private
./scripts/setup-new-venture.sh ke kidexpenses 106532992

# 5. Seed documentation
CRANE_ADMIN_KEY=$KEY ./scripts/upload-doc-to-context-worker.sh docs/my-prd.md {venture-code}
```

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

**Use the Golden Path template** - this gives you CI, commands, and structure out of the box:

```bash
gh repo create {org}/{product}-console --template venturecrane/venture-template --private
gh repo clone {org}/{product}-console ~/dev/{product}-console
cd ~/dev/{product}-console
```

This creates a repo with:
```
{product}-console/
├── .claude/commands/     # /sod, /eod, etc. (ready to use)
├── .github/workflows/    # CI and security scanning (configured)
├── docs/                 # Documentation structure
├── scripts/              # sod-universal.sh included
├── src/                  # Application code
├── CLAUDE.md             # Template - customize for your product
└── package.json          # Basic TypeScript setup
```

- [ ] Create repo from template (command above)
- [ ] Clone to `~/dev/{product}-console`
- [ ] Update `CLAUDE.md` with product-specific context
- [ ] Update `package.json` name field

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

### 3.1 Add Venture to crane-context
- [ ] Update `workers/crane-context/src/constants.ts`:
  ```typescript
  export const VENTURE_CONFIG = {
    // ... existing ventures
    {venture-code}: { name: '{Venture Name}', org: '{github-org}' },
  } as const;

  export const VENTURES = ['vc', 'sc', 'dfg', 'ke', '{venture-code}'] as const;
  ```
- [ ] Deploy crane-context: `cd workers/crane-context && npx wrangler deploy`

> **Note:** sod-universal.sh gets venture mappings from the crane-context API.
> No script changes needed - just update and deploy crane-context.

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

## Phase 3.5: Infisical Secrets Setup

### 3.5.1 Create Venture Folder

All ventures share the `venture-crane` Infisical project. Create a folder for the new venture:

```bash
# Create folder for the new venture
infisical secrets folders create --name {venture-code} --env dev
```

### 3.5.2 Add Venture Secrets

Add the secrets the venture needs:

```bash
# Example: Add common secrets for a new venture
infisical secrets set \
  CLERK_SECRET_KEY="sk_test_..." \
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..." \
  --path /{venture-code} --env dev
```

**Common secrets to consider:**
- Auth keys (Clerk, NextAuth, etc.)
- API keys for third-party services
- Database connection strings (if applicable)

### 3.5.3 Copy .infisical.json to New Repo

All venture repos share the same Infisical project. The new repo needs `.infisical.json` so `crane {venture-code}` can inject secrets:

```bash
# Copy from crane-console (all ventures use the same workspace ID)
cp ~/dev/crane-console/.infisical.json ~/dev/{product}-console/
```

- [ ] Copy `.infisical.json` to the new repo on each dev machine

> **Why:** Without this, `crane {venture-code}` will fail with "Missing .infisical.json". This file is gitignored, so it must be created on every machine that clones the repo.

### 3.5.4 Verify Access

```bash
# List secrets in the new folder
infisical secrets --path /{venture-code} --env dev
```

### 3.5.5 Document in Secrets Management

Update `docs/infra/secrets-management.md` in crane-console:
- [ ] Add venture folder to "Project Structure" section
- [ ] Add venture secrets to "Common Secrets by Venture" section

### 3.5.6 Update Crane Launcher

The `crane` CLI needs to know the Infisical path for the new venture.

- [ ] Update `packages/crane-mcp/src/cli/launch.ts`:
  ```typescript
  const INFISICAL_PATHS: Record<string, string> = {
    // ... existing ventures
    {venture-code}: "/{venture-code}",
  };
  ```
- [ ] Update the corresponding test in `packages/crane-mcp/src/cli/launch.test.ts`
- [ ] Rebuild: `cd packages/crane-mcp && npm run build`

> **Why:** Without this, `crane {venture-code}` will fail with "No Infisical path configured for venture: {venture-code}".

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

## Phase 4.6: Monitoring & Observability

> **Reference:** See `docs/standards/golden-path.md` for tiered requirements.

### 4.6.1 Sentry Setup (Required for User-Facing Products)

- [ ] Create project in Sentry under SMDurgan LLC org
- [ ] Naming: `{venture}-app` (frontend), `{venture}-api` (backend)
- [ ] Install SDK:
  ```bash
  # Next.js frontend
  npm i @sentry/nextjs
  npx @sentry/wizard@latest -i nextjs

  # Or React SPA
  npm i @sentry/react
  ```
- [ ] Configure DSN via environment variable (not hardcoded)
- [ ] Set up source maps in build pipeline
- [ ] Configure alert rules for new errors
- [ ] Add team members to project notifications
- [ ] Verify test error appears in Sentry dashboard

### 4.6.2 Uptime Monitoring (Recommended)

- [ ] Add health endpoint: `GET /health` returns `{ "status": "ok" }`
- [ ] Configure uptime monitoring (Checkly, UptimeRobot, or similar)
- [ ] Set up downtime alerts

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
| SMD Ventures | `smd` | smd-ventures | smd-console |
| Draft Crane | `dc` | draftcrane | dc-console |

---

## Troubleshooting

### "Could not determine venture from org" or "Unknown GitHub org"
- Ensure venture is added to `workers/crane-context/src/constants.ts`
- Ensure crane-context is deployed: `cd workers/crane-context && npx wrangler deploy`
- Check git remote: `git remote get-url origin`
- Verify API: `curl https://crane-context.automation-ab6.workers.dev/ventures`

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
| `golden-path.md` | **Tiered infrastructure requirements by product stage** |
| `api-structure-template.md` | Reference architecture for Hono APIs |
| `ci-workflow-template.yml` | GitHub Actions CI/CD template |
| `nfr-assessment-template.md` | Code quality review checklist |

---

*Last updated: 2026-01-31 by Crane Infrastructure Team*
