# New Venture Setup Checklist

**Version:** 1.4
**Last Updated:** 2026-02-17
**Purpose:** Complete checklist for onboarding a new venture to Crane infrastructure

---

## Automation Available

Most of this checklist can be automated using `scripts/setup-new-venture.sh`.

### What's Automated

| Step                                     | Automated | Script                                                    |
| ---------------------------------------- | --------- | --------------------------------------------------------- |
| Create GitHub repo                       | Yes       | `gh repo create --template venturecrane/venture-template` |
| Initialize directory structure           | Yes       | Included in template                                      |
| Create standard labels                   | Yes       | `setup-new-venture.sh`                                    |
| Create project board                     | Yes       | `setup-new-venture.sh`                                    |
| Update crane-context (venture registry)  | Yes       | `setup-new-venture.sh`                                    |
| Update crane-watch                       | Yes       | `setup-new-venture.sh`                                    |
| Update venture registry (ventures.json)  | Yes       | `setup-new-venture.sh` (single source of truth)           |
| Derive crane launcher INFISICAL_PATHS    | Yes       | Derived from `config/ventures.json` at runtime            |
| Deploy workers                           | Yes       | `setup-new-venture.sh`                                    |
| Clone to dev machines                    | Yes       | `deploy-to-fleet.sh`                                      |
| Copy .infisical.json to new repo         | Yes       | `setup-new-venture.sh`                                    |
| Create Infisical folder + shared secrets | Yes       | `setup-new-venture.sh` via `sync-shared-secrets.sh`       |

### What Requires Manual Steps

| Step                            | Why Manual                                                   |
| ------------------------------- | ------------------------------------------------------------ |
| Create GitHub organization      | GitHub API limitation                                        |
| Install venturecrane-github App | Requires browser (personal settings → apps → install on org) |
| Get installation ID             | From post-install URL                                        |
| Seed venture documentation      | Content is venture-specific                                  |
| Define venture design system    | Creative decisions, needs context                            |
| PWA setup                       | Framework-specific, needs branding                           |

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

> **Important:** Do NOT hand off with an unmerged PR. Wait for CI to pass and merge before ending the session. If CI fails, fix it in the same session. See `docs/process/pr-workflow.md` for the full PR Completion Rule.

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
├── .claude/commands/     # /sos, /eos, etc. (ready to use)
├── .github/workflows/    # CI and security scanning (configured)
├── docs/                 # Documentation structure
│   ├── design/           # Design spec (template auto-populated)
│   └── design/           # Design spec and Stitch design system
├── .stitch/              # Stitch design artifacts
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

The GitHub App is named **venturecrane-github** and is registered under the **personal account** (not the venturecrane org). To install on a new org:

1. Go to **https://github.com/settings/apps** (personal Developer Settings)
2. Click **Edit** on **venturecrane-github**
3. Click **Install App** in the left sidebar
4. Select the new organization
5. Grant access to **All repositories**
6. Note the installation ID from the post-install URL: `https://github.com/organizations/{org}/settings/installations/{ID}`

- [ ] Install venturecrane-github app on the new org
- [ ] Grant access to all repositories
- [ ] Note the installation ID (needed for crane-watch config)

---

## Phase 2: Crane Watch Setup

### 2.1 Add Venture to crane-watch

- [ ] Update `workers/crane-watch/wrangler.toml`:
  ```toml
  # Add installation ID to GH_INSTALLATIONS_JSON
  GH_INSTALLATIONS_JSON = '{"durganfieldguide":"103277966","venturecrane":"104223482","siliconcrane":"104223351","kidexpenses":"106532992","{github-org}":"{installation-id}"}'
  ```
- [ ] Deploy crane-watch: `cd workers/crane-watch && npx wrangler deploy`

### 2.2 Test Auto-Classification

- [ ] Create a test issue:

  ```bash
  gh issue create --repo {org}/{repo} \
    --title "TEST: Crane Watch verification" \
    --body "## Acceptance Criteria
  - [ ] AC1: Test auto-classification

  Delete after verifying."
  ```

- [ ] Verify issue receives labels automatically
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

> **Note:** The `crane` launcher gets venture mappings from `config/ventures.json`.
> After adding the venture, deploy crane-context and rebuild crane-mcp.

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

- [ ] Run `/sos` in the new repo
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

### 3.5.2 Sync Shared Secrets (Automated)

Shared infrastructure secrets (`CRANE_CONTEXT_KEY`, `CRANE_ADMIN_KEY`) are required in every venture path. These are declared in `config/ventures.json` and propagated automatically by `setup-new-venture.sh`.

```bash
# Automated by setup-new-venture.sh (Step 10.5), or run manually:
bash scripts/sync-shared-secrets.sh --fix --venture {venture-code}

# Verify:
bash scripts/sync-shared-secrets.sh --venture {venture-code}
```

- [ ] Shared secrets synced (CRANE_CONTEXT_KEY, CRANE_ADMIN_KEY)

### 3.5.3 Add Venture-Specific Secrets

Add the secrets unique to this venture:

```bash
# Example: Add venture-specific secrets
infisical secrets set \
  CLERK_SECRET_KEY="sk_test_..." \
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..." \
  --path /{venture-code} --env dev
```

**Common venture-specific secrets:**

- Auth keys (Clerk, NextAuth, etc.)
- API keys for third-party services
- Database connection strings (if applicable)

### 3.5.4 Copy .infisical.json to New Repo

All venture repos share the same Infisical project. The new repo needs `.infisical.json` so `crane {venture-code}` can inject secrets:

```bash
# Copy from crane-console (all ventures use the same workspace ID)
cp ~/dev/crane-console/.infisical.json ~/dev/{product}-console/
```

- [ ] Copy `.infisical.json` to the new repo on each dev machine

> **Why:** Without this, `crane {venture-code}` will fail with "Missing .infisical.json". This file is gitignored, so it must be created on every machine that clones the repo.

### 3.5.5 Verify Access

```bash
# List secrets in the new folder
infisical secrets --path /{venture-code} --env dev
```

### 3.5.6 Document in Secrets Management

Update `docs/infra/secrets-management.md` in crane-console:

- [ ] Add venture folder to "Project Structure" section
- [ ] Add venture secrets to "Common Secrets by Venture" section

### 3.5.7 Crane Launcher (INFISICAL_PATHS) - Automated

`INFISICAL_PATHS` is derived from `config/ventures.json` at runtime. No manual edit needed - adding the venture to `config/ventures.json` (Step 6 of `setup-new-venture.sh`) is sufficient.

- [x] ~~Update INFISICAL_PATHS~~ - Automated via `config/ventures.json`
- [ ] Rebuild crane-mcp: `cd packages/crane-mcp && npm run build` (automated by `setup-new-venture.sh`)

> **Why this works:** `INFISICAL_PATHS` reads `config/ventures.json` at startup and derives `/{code}` for each venture. Single source of truth - no drift.

---

## Phase 3.7: Design System Setup

### 3.7.1 Design Spec Template

The `setup-new-venture.sh` script creates `docs/design/design-spec.md` from the venture template with the `--{code}-` prefix substituted. It also creates the venture directory in crane-console at `docs/ventures/{code}/`.

- [ ] Design spec template populated (`docs/design/design-spec.md`)
- [ ] Venture design directory exists in crane-console

### 3.7.2 Define Design Tokens

At minimum, define core tokens before UI implementation begins:

- [ ] Chrome, surface, and raised surface colors
- [ ] Primary text and muted text colors
- [ ] Accent color and hover state
- [ ] Border color

For a full design definition, run `/design-brief`.

### 3.7.3 Upload Design Spec

```bash
# Upload all venture design specs (including this one)
# Design specs sync to D1 automatically via GitHub Action on merge to main

# Preview what would be uploaded
# No manual upload needed - GitHub Action handles D1 sync
```

- [ ] Design spec uploaded to crane-context (`crane_doc('{code}', 'design-spec.md')` returns content)

---

## Phase 4: Local Development Setup

### 4.1 Claude Code Commands

Copy standard commands from crane-console:

- [ ] `.claude/commands/sos.md`
- [ ] `.claude/commands/eos.md`
- [ ] `.claude/commands/heartbeat.md`
- [ ] `.claude/commands/update.md`

### 4.2 CLAUDE.md Configuration

- [ ] Create `CLAUDE.md` in repo root with:
  - Project overview
  - Build commands
  - Code patterns
  - Slash commands reference

### 4.3 Scripts

- [ ] Verify `crane {code}` launches correctly from the venture repo
- [ ] Copy utility scripts as needed

---

## Phase 4.5: Code Quality Infrastructure

> **Reference:** See `docs/standards/` for templates and detailed guidance.

### 4.5.1 Testing Scaffold

- [ ] Install vitest: `npm i -D vitest`
- [ ] Create `vitest.config.ts`:
  ```typescript
  import { defineConfig } from 'vitest/config'
  export default defineConfig({
    test: {
      globals: true,
    },
  })
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
  import { describe, it, expect } from 'vitest'

  describe('Health', () => {
    it('placeholder test passes', () => {
      expect(true).toBe(true)
    })
  })
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

## Phase 4.7: PWA Setup (All Web Frontends)

> **Reference:** See `docs/standards/golden-path.md` - PWA section for full spec.

Every web frontend ships as an installable PWA per golden-path v2.1. The implementation depends on the framework.

### 4.7.1 Next.js Apps (Serwist)

- [ ] Install dependencies:
  ```bash
  npm install @serwist/next
  npm install --save-dev serwist
  ```
- [ ] Create service worker at `src/app/sw.ts`:

  ```typescript
  import { defaultCache } from '@serwist/next/worker'
  import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
  import { Serwist } from 'serwist'

  declare global {
    interface WorkerGlobalScope extends SerwistGlobalConfig {
      __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
    }
  }
  declare const self: ServiceWorkerGlobalScope

  const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: defaultCache,
  })
  serwist.addEventListeners()
  ```

- [ ] Wrap `next.config.ts` with `withSerwist`:
  ```typescript
  import withSerwistInit from '@serwist/next'
  const withSerwist = withSerwistInit({
    swSrc: 'src/app/sw.ts',
    swDest: 'public/sw.js',
  })
  export default withSerwist(nextConfig)
  ```
- [ ] Create `public/manifest.webmanifest` with venture name, icons, theme_color, `display: "standalone"`
- [ ] Create `public/icon.svg` (venture-branded)
- [ ] Add to layout metadata: `manifest`, `icons`, `appleWebApp: { capable: true, statusBarStyle: "default" }`
- [ ] Add to layout viewport: `themeColor`
- [ ] Verify build passes

### 4.7.2 Astro Sites (@vite-pwa/astro)

- [ ] Install dependency:
  ```bash
  npm install --save-dev @vite-pwa/astro
  ```
- [ ] Add `AstroPWA()` integration to `astro.config.mjs` with manifest config and workbox patterns
- [ ] Create `public/icon.svg` (venture-branded)
- [ ] Add iOS meta tags to layout: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `theme-color`
- [ ] Verify build passes and `dist/` contains `manifest.webmanifest` and `sw.js`

### 4.7.3 Verification

- [ ] DevTools > Application: manifest detected, service worker registered
- [ ] iOS Safari: Add to Home Screen shows correct name and icon
- [ ] Standalone mode: app launches fullscreen (no browser chrome)
- [ ] Offline: app shell loads when network is off

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

> **Prerequisite:** Run the automated verification checks in **Phase 5.5** before completing this manual checklist. Only check these items AFTER all automated verification commands pass. Manual spot-checks supplement automated verification — they do not replace it.

### Agent Session Test

- [ ] Phase 5.5 automated verification passes (all 7 checks)
- [ ] `/sos` creates session and shows correct context
- [ ] Documentation is cached and accessible
- [ ] GitHub issues are displayed
- [ ] `/eos` creates handoff successfully
- [ ] Next `/sos` shows previous handoff

### Issue Workflow Test

- [ ] Create issue via GitHub UI
- [ ] Issue appears in `/sos` queues
- [ ] Labels work correctly
- [ ] Comments can be added via crane-relay (if applicable)

### Team Access

- [ ] All team members have GitHub org access
- [ ] All team members have `CRANE_CONTEXT_KEY` configured
- [ ] All team members can run `/sos` successfully

---

## Phase 5.5: Automated Verification

> **Agents MUST run these verification checks before reporting venture setup status. Do NOT infer completion from branch names, checklist items, or handoff summaries — verify actual state.**

Run each command below, replacing `{code}`, `{org}`, and `{product}` with the venture's values. Every check must print `PASS` before reporting the venture as set up.

```bash
# 1. Venture registry (crane-context deployed?)
curl -s https://crane-context.automation-ab6.workers.dev/ventures | python3 -c "import sys,json; vs=[v['code'] for v in json.load(sys.stdin)['ventures']]; print('PASS' if '{code}' in vs else 'FAIL: {code} not in venture registry')"

# 2. GitHub org + repo exist?
gh repo view {org}/{product}-console --json name,createdAt

# 3. GitHub App webhooks working? (crane-watch)
# Check that crane-watch is configured for the org
gh api repos/{org}/{product}-console/hooks --jq '.[].config.url' | grep -q 'crane-watch' && echo "PASS: webhook configured"

# 4. Infisical secrets synced?
infisical secrets --path /{code} --env prod 2>&1 | grep -q CRANE_CONTEXT_KEY && echo "PASS: shared secrets present"

# 5. Session creation works?
curl -s -X POST "https://crane-context.automation-ab6.workers.dev/sos" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"venture":"{code}","repo":"{org}/{product}-console","agent":"setup-verify","machine":"verify"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('PASS' if d.get('session_id') else 'FAIL: ' + str(d))"

# 6. Docs accessible?
curl -s "https://crane-context.automation-ab6.workers.dev/docs?venture={code}" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY" | python3 -c "import sys,json; d=json.load(sys.stdin); ss=[doc for doc in d['docs'] if doc['scope']=='{code}']; print(f'PASS: {len(ss)} venture-scoped docs' if ss else 'FAIL: no venture-scoped docs')"

# 7. Local clone exists?
ls ~/dev/{product}-console/.infisical.json && echo "PASS: local clone with .infisical.json"
```

### Interpreting Results

| Check                | FAIL meaning                               | Fix                                                         |
| -------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| 1. Venture registry  | crane-context not updated/deployed         | Update `constants.ts`, redeploy crane-context               |
| 2. GitHub repo       | Repo not created or org incorrect          | Run `gh repo create` from Phase 1.2                         |
| 3. Webhook config    | crane-watch not configured for org         | Update `wrangler.toml` installations, redeploy crane-watch  |
| 4. Infisical secrets | Shared secrets not synced                  | Run `scripts/sync-shared-secrets.sh --fix --venture {code}` |
| 5. Session creation  | crane-context rejects SOD request          | Check CRANE_CONTEXT_KEY, verify venture in registry         |
| 6. Docs accessible   | No venture-scoped docs uploaded            | Upload docs per Phase 3.2                                   |
| 7. Local clone       | Repo not cloned or missing .infisical.json | Clone repo, copy `.infisical.json` per Phase 3.5.4          |

---

## Quick Reference: Venture Registry

| Venture            | Code  | GitHub Org       | Console Repo  |
| ------------------ | ----- | ---------------- | ------------- |
| Venture Crane      | `vc`  | venturecrane     | crane-console |
| Silicon Crane      | `sc`  | siliconcrane     | sc-console    |
| Durgan Field Guide | `dfg` | durganfieldguide | dfg-console   |
| Kid Expenses       | `ke`  | kidexpenses      | ke-console    |
| SMD Ventures       | `smd` | smd-ventures     | smd-console   |
| SMD Services       | `ss`  | venturecrane     | ss-console    |
| Draft Crane        | `dc`  | draftcrane       | dc-console    |

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
4. Verify `/sos` works

### When Updating Documentation

1. Update source in venture repo
2. Re-upload to crane-context via admin endpoint
3. Team members will get updated docs on next `/sos`

---

## Related Standards

These documents in `docs/standards/` provide detailed templates:

| Document                     | Purpose                                                 |
| ---------------------------- | ------------------------------------------------------- |
| `golden-path.md`             | **Tiered infrastructure requirements by product stage** |
| `api-structure-template.md`  | Reference architecture for Hono APIs                    |
| `ci-workflow-template.yml`   | GitHub Actions CI/CD template                           |
| `nfr-assessment-template.md` | Code quality review checklist                           |

---

_Last updated: 2026-02-17 by Crane Infrastructure Team_
