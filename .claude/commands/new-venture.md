# /new-venture - Set Up a New Venture

This command walks through setting up a new venture with Crane infrastructure.

## Prerequisites (Manual)

Before running this command, the user must have completed:

1. Created a GitHub organization (github.com/organizations/new)
2. Installed "Crane Relay" GitHub App on the org
3. Noted the installation ID from GitHub App settings

## Execution

### Step 1: Gather Information

Ask the user for:

- **Venture code** (2-3 lowercase letters, e.g., `dc`)
- **Venture display name** (e.g., "Draft Crane")
- **GitHub org** (e.g., `draftcrane`)
- **GitHub App installation ID** (numeric)

Confirm all values before proceeding.

### Step 2: Read the Checklist

Read the full setup checklist for reference:

```bash
cat docs/process/new-venture-setup-checklist.md
```

This is the canonical checklist. Follow it step by step.

### Step 3: Run the Setup Script

The script automates most of the process:

```bash
./scripts/setup-new-venture.sh {venture-code} {github-org} {installation-id}
```

**Dry run first** to preview what will happen:

```bash
DRY_RUN=true ./scripts/setup-new-venture.sh {venture-code} {github-org} {installation-id}
```

The script handles:

- GitHub repo creation and structure
- Standard labels and project board
- crane-context venture registry
- crane-classifier installation ID
- upload-doc-to-context-worker.sh scope mapping
- Crane launcher INFISICAL_PATHS update + rebuild
- Cloudflare worker deployments
- Fleet cloning
- .infisical.json copy to new repo

### Step 4: Manual Follow-ups

After the script completes, walk through remaining manual steps from the checklist:

1. **Venture-specific secrets** (Phase 3.5) - add venture-specific secrets (shared secrets like CRANE_CONTEXT_KEY and CRANE_ADMIN_KEY are synced automatically by the setup script)
2. **Seed documentation** - upload PRD/project instructions to crane-context
3. **Verify** - run `crane {venture-code}` and `/sod` in the new repo
4. **Code quality** (Phase 4.5) - testing scaffold, CI/CD, pre-commit hooks
5. **Monitoring** (Phase 4.6) - Sentry, uptime checks

### Step 5: Update CLAUDE.md

Update `CLAUDE.md` in crane-console to reference the new venture in the Secrets Management section if not already there.

### Step 6: Verification

Run through Phase 5 of the checklist:

- [ ] `crane {venture-code}` launches without errors
- [ ] `/sod` creates session and shows correct context
- [ ] Documentation is cached and accessible
- [ ] GitHub issues are displayed
- [ ] `/eod` creates handoff successfully

## Reference Files

- **Checklist:** `docs/process/new-venture-setup-checklist.md`
- **Script:** `scripts/setup-new-venture.sh`
- **Launcher config:** `packages/crane-mcp/src/cli/launch.ts` (INFISICAL_PATHS)
- **Venture registry:** `workers/crane-context/src/constants.ts`
- **Secrets docs:** `docs/infra/secrets-management.md`
