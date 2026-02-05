# crane-mcp

MCP server for Venture Crane development workflow. Provides a launcher CLI and 7 MCP tools for session management, context validation, and handoffs.

## Installation

```bash
# Install globally
npm install -g @venturecrane/crane-mcp

# Register MCP server with Claude Code
claude mcp add crane -- crane-mcp
```

## Prerequisites

- Node.js 20+
- Infisical CLI (for secrets injection)
- Repos cloned to `~/dev/` (any naming convention works - matched by git remote)

## Quick Start: The `crane` Launcher

The `crane` command is the primary way to start a Claude session:

```bash
crane              # Interactive menu - pick a venture, launch Claude
crane vc           # Direct launch into Venture Crane
crane ke           # Direct launch into Kid Expenses
crane --list       # Show ventures without launching
```

### What it does

1. Fetches available ventures from the crane-context API
2. Scans `~/dev/` for matching git repos
3. Lets you select a venture (or specify directly)
4. Launches: `cd $repo && infisical run --path /$code -- claude`

### Example

```
$ crane

Crane Console Launcher
======================

  1) Venture Crane      [vc]   ~/dev/crane-console
  2) Kid Expenses       [ke]   ~/dev/ke-console
  3) Silicon Crane      [sc]   ~/dev/sc-console
  4) Durgan Field Guide [dfg]  ~/dev/dfg-console

Select (1-4): 1

-> Switching to Venture Crane...
-> Launching Claude with /vc secrets...
```

## MCP Tools

Once inside Claude, these tools are available:

| Tool | Purpose |
|------|---------|
| `crane_preflight` | Run environment checks before starting |
| `crane_sod` | Start of day - validates context, shows P0s, weekly plan |
| `crane_status` | Full GitHub issue breakdown by queue |
| `crane_plan` | Read weekly plan from docs/planning/WEEKLY_PLAN.md |
| `crane_ventures` | List available ventures and their local paths |
| `crane_context` | Get current venture, repo, branch info |
| `crane_handoff` | Create session handoff (EOD or passing work) |

## How It Works

1. **No hardcoded paths** - Scans `~/dev/` for git repos and matches by remote URL
2. **Org-based matching** - Matches git remote org (e.g., `venturecrane`) to venture
3. **API-driven** - Venture list comes from crane-context API, not local config
4. **Session caching** - Ventures cached in-memory for the session duration

## Tools

### crane_preflight

Run environment validation before starting a session.

```
Parameters: none

Checks:
  - CRANE_CONTEXT_KEY is set
  - gh CLI is authenticated
  - Current directory is a git repo
  - API connectivity is working

Returns: Pass/fail status for each check
```

### crane_sod

Initialize session and validate you're in the right repo.

```
Parameters:
  venture?: string  - Optional venture code (vc, ke, dfg, sc, smd)

Returns:
  - If in valid repo: confirms context, starts API session
  - If not: lists ventures with local paths, guides navigation
```

### crane_status

Get full GitHub issue breakdown by queue.

```
Parameters: none

Returns: Issues organized by queue:
  - P0 (critical)
  - Ready (can start now)
  - In Progress (being worked)
  - Blocked (waiting on something)
  - Triage (needs categorization)
```

### crane_plan

Read the weekly plan from docs/planning/WEEKLY_PLAN.md.

```
Parameters: none

Returns:
  - Priority venture for the week
  - Target issues
  - Plan age (days since last update)
```

### crane_ventures

List all ventures with installation status.

```
Parameters: none

Returns: List of ventures with org, local path, and installed status
```

### crane_context

Get current context without starting a session.

```
Parameters: none

Returns: Venture, repo, branch, directory info
```

### crane_handoff

Create a handoff when ending session.

```
Parameters:
  summary: string     - What was done, what's pending
  status: string      - "in_progress" | "blocked" | "done"
  issue_number?: number

Returns: Confirmation with handoff details
```

## Development

```bash
cd packages/crane-mcp
npm install
npm run build
npm run dev  # watch mode
```

### Local Testing

```bash
# Link locally
npm link

# Add to Claude
claude mcp add crane -- crane-mcp

# Test (start Claude in a venture repo)
cd ~/dev/crane-console
infisical run --path /vc -- claude
# Then: "call crane_context"
```

### Deploying to Fleet (SOP)

After making changes to crane-mcp, you MUST deploy to all dev machines:

```bash
# 1. Test locally on mac23
cd ~/dev/crane-console/packages/crane-mcp
npm run build
npm test
crane --list  # verify CLI works

# 2. Commit and push (from monorepo root)
cd ~/dev/crane-console
git add -A && git commit -m "fix: your change"
git push origin main

# 3. Deploy to fleet
./scripts/deploy-crane-mcp.sh
```

The deploy script will:
- SSH to each machine (mbp27, think, mini)
- Stash any local changes
- Pull latest from origin/main
- Run `npm run build`

**Dry run first:**
```bash
DRY_RUN=true ./scripts/deploy-crane-mcp.sh
```

**Deploy to specific machines:**
```bash
MACHINES="mbp27 mini" ./scripts/deploy-crane-mcp.sh
```

## Architecture

```
┌─────────────────────────────────────────┐
│           Claude Code                   │
│                                         │
│   ┌─────────────────────────────────┐  │
│   │       crane-mcp (stdio)          │  │
│   │                                  │  │
│   │  ~/dev/ scanner → org matching   │  │
│   │            ↓                     │  │
│   │    crane-context API             │  │
│   └─────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Troubleshooting

**"CRANE_CONTEXT_KEY not found"**
- Start Claude with Infisical: `infisical run --path /vc -- claude`

**"Failed to connect to Crane API"**
- Check network connectivity
- Verify API is reachable: `curl https://crane-context.automation-ab6.workers.dev/ventures`

**Venture not detected**
- Ensure git remote points to a known org (venturecrane, kidexpenses, etc.)
- Check `crane_ventures` to see configured orgs
