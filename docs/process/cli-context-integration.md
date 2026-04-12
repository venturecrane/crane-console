# CLI Context Integration Guide

**Last Updated:** 2026-01-18
**Status:** Production Ready

---

## Overview

All CLI tools (Claude Code, Gemini, Codex, and others) can now integrate with Crane Context Worker to:

- Load session context at the start of each session
- Access operational documentation cached locally
- View handoffs from previous sessions
- Track active sessions across the team

---

## Architecture

### Context Worker

**Base URL:** `https://crane-context.automation-ab6.workers.dev`
**Authentication:** `X-Relay-Key` header
**Key:** Set via `CRANE_CONTEXT_KEY` environment variable

**Important:** The Context Worker key is a secret. Contact your team lead or check secure credentials storage.

### Endpoints

#### POST /sos (Start of Session)

Creates or resumes a session and returns:

- Session information
- Last handoff from previous session
- Active sessions from other agents
- Operational documentation (if `include_docs: true`)

**Request:**

```json
{
  "schema_version": "1.0",
  "agent": "cli-name-hostname",
  "client": "cli-name",
  "client_version": "1.0.0",
  "host": "hostname",
  "venture": "vc|sc|dfg",
  "repo": "owner/repo",
  "track": 1,
  "include_docs": true
}
```

**Response:**

```json
{
  "session": {
    "id": "sess_...",
    "status": "active",
    "created_at": "2026-01-18T10:00:00Z",
    "last_heartbeat_at": "2026-01-18T10:00:00Z",
    "venture": "dfg",
    "repo": "durganfieldguide/dfg-console",
    "track": 1
  },
  "last_handoff": {
    "id": "ho_...",
    "summary": "Completed feature X",
    "status_label": "in-progress",
    "created_at": "2026-01-17T18:00:00Z",
    "from_agent": "claude-code-cli"
  },
  "active_sessions": [
    {
      "agent": "desktop-pm-1",
      "track": 2,
      "issue_number": 200,
      "last_heartbeat_at": "2026-01-18T09:55:00Z"
    }
  ],
  "documentation": {
    "docs": [
      {
        "scope": "global",
        "doc_name": "team-workflow.md",
        "content": "# Team Workflow\n...",
        "content_hash": "abc123...",
        "title": "Team Workflow",
        "version": 3
      }
    ],
    "count": 9,
    "content_hash": "combined_hash_..."
  }
}
```

---

## Setup

### Environment Variable Configuration

All CLI integrations require the `CRANE_CONTEXT_KEY` environment variable:

```bash
# Add to your shell profile (~/.zshrc, ~/.bashrc, etc.)
export CRANE_CONTEXT_KEY="your-context-worker-key-here"
```

**Where to get the key:**

1. Contact your team lead
2. Check your team's secure credentials storage
3. Or retrieve it from Cloudflare (if you have access):
   ```bash
   cd workers/crane-context
   npx wrangler secret list  # Shows CONTEXT_RELAY_KEY exists
   # Note: Wrangler doesn't show secret values for security
   ```

---

## CLI Implementations

### Claude Code CLI

**Status:** ✅ Integrated (via built-in /sos command)

Claude Code CLI has native Context Worker integration. The `/sos` command automatically:

1. Calls the Context Worker `/sos` endpoint
2. Caches documentation to `/tmp/crane-context/docs/`
3. Displays session context and handoffs
4. Shows GitHub issues via `gh` CLI

**Usage:**

```bash
cd dfg-console  # or sc-console, crane-console
/sos
```

**Configuration:**

- `.claude/commands/sos.md` contains the command implementation
- Automatically detects venture from repository
- No additional setup required

---

### Gemini CLI

**Status:** ✅ Integrated (via .gemini/commands/sos.toml)

Gemini Code Assist uses TOML-based command format.

**Setup:**

1. Create `.gemini/commands/` directory in your repo (if it doesn't exist)
2. Copy `sos.toml` to `.gemini/commands/sos.toml`:

   ```bash
   mkdir -p .gemini/commands
   cat > .gemini/commands/sos.toml << 'EOF'
   description = "Start of Session - Load session context and operational documentation"

   prompt = """
   You are starting a new development session.

   Execute the Start of Session script to load session context from Crane Context Worker:

   !{bash scripts/sos-universal.sh}

   The script will:
   - Detect the current repository and venture
   - Load session context from Crane Context Worker
   - Cache operational documentation to /tmp/crane-context/docs/
   - Display handoffs from previous sessions
   - Show GitHub issues and work queues

   After the script completes, you will have:
   - Complete operational documentation cached locally
   - Session context from previous work
   - Visibility into current work priorities
   - GitHub issue status across all queues

   Use the cached documentation at /tmp/crane-context/docs/ as reference for team workflows, API specs, and project standards throughout this session.
   """
   EOF
   ```

**Note:** `.gemini` is gitignored (user-specific config). Each developer sets this up locally.

**Usage:**

```bash
cd dfg-console  # or sc-console, crane-console
# In Gemini CLI, run:
/sos
```

**What It Does:**

1. Detects repository and venture
2. Calls Context Worker `/sos` API
3. Caches documentation to `/tmp/crane-context/docs/`
4. Displays:
   - Session information
   - Last handoff
   - P0 issues
   - Ready work
   - In-progress work
   - Available documentation

**Configuration File:** `.gemini/commands/sos.toml`

---

### Codex CLI

**Status:** ✅ Integrated (via .codex/prompts/sos.md)

OpenAI Codex uses markdown-based prompt files.

**Setup:**

1. Create `.codex/prompts/` directory in your repo (if it doesn't exist)
2. Copy `sos.md` to `.codex/prompts/sos.md`:

   ````bash
   mkdir -p .codex/prompts
   cat > .codex/prompts/sos.md << 'EOF'
   # Start of Session (SOD)

   Load session context and operational documentation from Crane Context Worker.

   ## Execution

   Run the Start of Session script:

   ```bash
   ./scripts/sos-universal.sh
   ````

   ## Requirements
   - `CRANE_CONTEXT_KEY` environment variable must be set
   - Network access to crane-context.automation-ab6.workers.dev
   - `gh` CLI (optional, for GitHub issue display)

   ## Usage

   In Codex, run:

   ```
   /prompts:sod
   ```

   Or directly:

   ```bash
   ./scripts/sos-universal.sh
   ```

   EOF

   ```

   ```

**Note:** `.codex` is gitignored (user-specific config). Each developer sets this up locally.

**Usage:**

```bash
cd dfg-console  # or sc-console, crane-console
# In Codex CLI, run:
/prompts:sod
```

**When prompted for network access:** Approve to allow API calls to Context Worker.

---

### Universal Script (Any CLI)

**Status:** ✅ Available (via bash script)

For any CLI tool that can execute bash scripts.

**Setup:**
No setup required - script is already in all repos.

**Usage:**

```bash
cd dfg-console  # or sc-console, crane-console
./scripts/sos-universal.sh
```

**What It Does:**

1. Auto-detects repository and venture
2. Calls Context Worker `/sos` API
3. Caches documentation to `/tmp/crane-context/docs/`
4. Displays full session context with color-coded output
5. Shows GitHub issues (if `gh` CLI is installed)

**Features:**

- Color-coded output for better readability
- Graceful degradation if GitHub CLI is not installed
- Auto-detects CLI client from environment variables
- Error handling and validation

**Script Location:** `scripts/sos-universal.sh`

---

## Documentation Caching

### Local Cache Structure

```
/tmp/crane-context/docs/
├── cc-cli-starting-prompts.md      (global)
├── team-workflow.md                (global)
├── crane-relay-api.md              (global)
├── slash-commands-guide.md         (global)
├── parallel-dev-track-runbook.md   (global)
├── eos-sos-process.md              (global)
├── agent-persona-briefs.md         (global)
└── {venture}-project-instructions.md  (venture-specific)
```

### Documentation Scope

**Global docs** (returned for all ventures):

- Team workflows and processes
- API documentation
- Slash command guides
- Development standards

**Venture-specific docs** (returned only for that venture):

- `vc-project-instructions.md` - Venture Crane specific context
- `sc-project-instructions.md` - Silicon Crane specific context
- `dfg-project-description.md` - DFG specific context

### Cache Lifetime

- Documentation is cached per-session
- Cache is cleared on system restart (lives in `/tmp`)
- Re-running `/sos` refreshes the cache with latest versions

---

## Venture Detection

All CLI implementations auto-detect the venture from the GitHub repository:

| GitHub Org         | Venture Code | Repo Example                 |
| ------------------ | ------------ | ---------------------------- |
| `durganfieldguide` | `dfg`        | durganfieldguide/dfg-console |
| `siliconcrane`     | `sc`         | siliconcrane/sc-console      |
| `venturecrane`     | `vc`         | venturecrane/crane-console   |

Detection logic:

```bash
REPO=$(git remote get-url origin | sed -E 's/.*github\.com[:\/]([^\/]+\/[^\/]+)(\.git)?$/\1/')
ORG=$(echo "$REPO" | cut -d'/' -f1)

case "$ORG" in
  durganfieldguide) VENTURE="dfg" ;;
  siliconcrane) VENTURE="sc" ;;
  venturecrane) VENTURE="vc" ;;
esac
```

---

## Adding New CLI Support

To add support for a new CLI tool:

### Option 1: Use Universal Script

If the CLI can execute bash scripts:

```bash
./scripts/sos-universal.sh
```

### Option 2: Create Custom Command

If the CLI has its own command format:

1. **Understand the command format** (e.g., TOML for Gemini, markdown for Claude Code)
2. **Create command file** in appropriate directory (e.g., `.cli-name/commands/sos.extension`)
3. **Implement workflow:**
   ```bash
   # 1. Detect repo/venture
   # 2. Call POST /sos with proper payload
   # 3. Cache documentation locally
   # 4. Display context to user
   ```
4. **Test integration:**

   ```bash
   # Verify docs are cached
   ls /tmp/crane-context/docs/

   # Verify correct venture detected
   # Verify session created in Context Worker
   ```

### Required API Call

All implementations must call:

```bash
curl -sS "https://crane-context.automation-ab6.workers.dev/sos" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "schema_version": "1.0",
    "agent": "cli-name-hostname",
    "client": "cli-name",
    "venture": "dfg",
    "repo": "durganfieldguide/dfg-console",
    "track": 1,
    "include_docs": true
  }'
```

---

## Troubleshooting

### Documentation Not Cached

**Problem:** `/tmp/crane-context/docs/` is empty

**Solutions:**

1. Check internet connection
2. Verify Context Worker is running:
   ```bash
   curl -sS "https://crane-context.automation-ab6.workers.dev/health"
   ```
3. Check API response for errors:
   ```bash
   # Add debug output to see response
   echo "$CONTEXT_RESPONSE" | jq '.'
   ```

### Wrong Venture Detected

**Problem:** CLI detects wrong venture or "unknown"

**Solution:**
Check git remote URL:

```bash
git remote get-url origin
# Should be: git@github.com:{org}/{repo}.git
# or: https://github.com/{org}/{repo}.git
```

### Session Not Created

**Problem:** Context Worker returns error

**Common Issues:**

1. Invalid X-Relay-Key header
2. Malformed JSON payload
3. Missing required fields (venture, repo, agent)

**Debug:**

```bash
# Test API directly
curl -v "https://crane-context.automation-ab6.workers.dev/sos" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "schema_version": "1.0",
    "agent": "test",
    "venture": "dfg",
    "repo": "durganfieldguide/dfg-console"
  }'
```

### jq Command Not Found

**Problem:** `jq: command not found`

**Solution:**
Install jq:

```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq  # Ubuntu/Debian
sudo yum install jq      # CentOS/RHEL
```

### gh CLI Not Available

**Problem:** `gh: command not found`

**Solution:**
Install GitHub CLI (optional - script works without it):

```bash
# macOS
brew install gh

# Linux
# See https://github.com/cli/cli/blob/trunk/docs/install_linux.md

# Authenticate
gh auth login
```

---

## Technical Reference

### Session Lifecycle

1. **SOD Called** → Session created/resumed
2. **Work Performed** → Session remains active (heartbeat every 10min)
3. **EOD Called** → Session ended, handoff created
4. **Next SOD** → Previous handoff retrieved

### Documentation Sync

1. **Docs Updated in Repo** → GitHub Actions triggers
2. **Upload Script Runs** → POST /admin/docs
3. **Version Incremented** → Content hash updated
4. **Next SOD Call** → Latest docs returned

### Context Worker Features

- **Idempotent:** Calling /sos multiple times is safe
- **Session Resume:** Automatically resumes if active session exists
- **Stale Detection:** Sessions older than 45min marked abandoned
- **Multi-Agent:** Track multiple agents working simultaneously

---

## Related Documentation

- **Context Worker ADR:** `docs/adr/025-crane-context-worker.md`
- **Documentation Sync:** `DOC-SYNC-SUCCESS.md`
- **Crane Relay API:** `docs/process/crane-relay-api.md`
- **Team Workflow:** `docs/process/team-workflow.md`

---

## Questions?

- **Context Worker Issues:** Check GitHub issues in `crane-console` repo
- **CLI-Specific Issues:** Check command implementation files
- **Documentation Issues:** Verify GitHub Actions ran successfully

---

**Status:** ✅ All CLIs supported via Gemini commands and universal script
