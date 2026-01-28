# New Venture Setup Checklist

**Version:** 1.0
**Last Updated:** 2026-01-28
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

### 1.5 GitHub App Installation (for crane-relay)
- [ ] Install "Crane Relay" GitHub App on the org
- [ ] Grant access to the console repository
- [ ] Note the installation ID (needed for crane-relay config)

---

## Phase 2: Crane Relay Setup

### 2.1 Add Venture to crane-relay
- [ ] Update `workers/crane-relay/src/index.ts`:
  ```typescript
  // In ORG_TO_VENTURE mapping
  '{github-org}': '{venture-code}',
  // e.g., 'kidexpenses': 'ke',
  ```
- [ ] Add GitHub App installation ID to config
- [ ] Deploy crane-relay: `cd workers/crane-relay && wrangler deploy`

### 2.2 Test Issue Creation
- [ ] Test via curl:
  ```bash
  curl -X POST https://crane-relay.automation-ab6.workers.dev/directive \
    -H "Authorization: Bearer $CRANE_ADMIN_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "repo": "{org}/{repo}",
      "title": "TEST: Crane Relay connectivity",
      "body": "Test issue - delete after verifying",
      "to": "dev"
    }'
  ```
- [ ] Verify issue created in GitHub
- [ ] Delete test issue

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

*Last updated: 2026-01-28 by Crane Infrastructure Team*
