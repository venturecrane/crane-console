# Agent Context Management System

**An operational framework for multi-agent, multi-machine AI-assisted software development**

---

## 1. Problem Statement

When running AI coding agents across multiple machines and sessions, context is the bottleneck. Each session starts cold. The agent doesn't know what happened yesterday, what another agent is working on right now, or what the project's business context is. Existing approaches — committing markdown handoff files to git, setting environment variables, pasting context manually — are fragile and don't scale past a single developer on a single machine.

We built a centralized context management system to solve this. It gives every agent session, on any machine, immediate access to:

- **Session continuity** — what happened last time, where things were left off
- **Parallel awareness** — who else is working, on what, right now
- **Enterprise knowledge** — business context, product requirements, strategy docs
- **Operational documentation** — team workflows, API specs, coding standards
- **Work queue visibility** — GitHub issues by priority and status

The system is designed for a small team (1-5 humans) running multiple AI agent sessions in parallel across a fleet of development machines.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Developer Machine(s)                    │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  Agent CLI    │  │  Agent CLI    │  │  Agent CLI    │   │
│  │  Session 1    │  │  Session 2    │  │  Session 3    │   │
│  │  (Feature A)  │  │  (Feature B)  │  │  (Planning)   │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                  │                  │             │
│  ┌──────▼──────────────────▼──────────────────▼───────┐   │
│  │              Local MCP Server (stdio)                │   │
│  │  • Git repo detection   • GitHub CLI integration    │   │
│  │  • Session rendering    • Doc self-healing          │   │
│  └──────────────────────┬─────────────────────────────┘   │
└─────────────────────────┼─────────────────────────────────┘
                          │ HTTPS
                          ▼
┌──────────────────────────────────────────────────────────┐
│              Cloudflare Workers + D1                       │
│                                                            │
│  ┌────────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │  Context API    │  │  Knowledge    │  │  GitHub      │  │
│  │  • Sessions     │  │  Store (VCMS) │  │  Relay       │  │
│  │  • Handoffs     │  │  • Notes      │  │  • Events    │  │
│  │  • Heartbeats   │  │  • Tags       │  │  • Labels    │  │
│  │  • Doc audit    │  │  • Scope      │  │  • Comments  │  │
│  └────────┬───────┘  └──────┬────────┘  └──────┬──────┘  │
│           └─────────────────┼──────────────────┘          │
│                    ┌────────▼────────┐                     │
│                    │   D1 Database    │                     │
│                    │   (SQLite edge)  │                     │
│                    └─────────────────┘                     │
└──────────────────────────────────────────────────────────┘
```

**Key design decisions:**

- **Separation of concerns**: GitHub owns work artifacts (issues, PRs, code). The context system owns operational state (sessions, handoffs, knowledge). Neither duplicates the other.
- **Edge-first**: Cloudflare Workers + D1 means the API is globally distributed with ~20ms latency. No servers to manage.
- **CLI-agnostic**: The context API is plain HTTP. A local MCP server wraps it for Claude Code, but a universal bash script works with any CLI (Gemini, Codex, etc.).
- **Retry-safe**: All mutating endpoints are idempotent. Calling SOD twice returns the same session. Calling EOD twice is a no-op on an ended session.

---

## 3. Machine Setup

### Bootstrap (5 minutes)

New machines are provisioned with a single script that:

1. Validates the CLI tool is installed
2. Prompts for an API key (64-char hex, generated via `openssl rand -hex 32`)
3. Writes MCP server configuration to the CLI's config file
4. Verifies API connectivity
5. Confirms the MCP connection is live

```
$ ./bootstrap.sh
=== Bootstrap ===
Enter API key: ****
✓ CLI installed
✓ MCP config written to ~/.claude.json
✓ API reachable
✓ MCP connected
```

**What this replaced**: Previously, setup required configuring 3+ environment variables, installing skill scripts, debugging OAuth conflicts, and manual troubleshooting — often taking 2+ hours per machine.

### Fleet Management

Machines register with the context API and maintain heartbeats. A machine registry in D1 tracks:

- Hostname, OS, architecture
- Tailscale IP (for SSH mesh networking)
- SSH public keys (for automated key distribution)
- Last-seen timestamp

A fleet health script checks all registered machines in parallel, verifying SSH connectivity, disk space, and service status.

---

## 4. Session Lifecycle

### Start of Day (SOD)

Every agent session begins with SOD. This is a single command (or natural language request) that:

1. **Detects context** — reads the git remote to identify which project and repo
2. **Creates/resumes session** — if an active session exists for this agent+project+repo tuple, it resumes it; otherwise creates new
3. **Loads last handoff** — retrieves the structured summary from the previous session
4. **Shows P0 issues** — queries GitHub for critical priority issues
5. **Shows active sessions** — lists other agents currently working on the same project
6. **Loads documentation** — injects operational docs (team workflow, API specs, coding standards)
7. **Loads enterprise context** — injects business knowledge (executive summaries, product requirements)
8. **Checks documentation health** — audits for missing or stale docs and self-heals where possible
9. **Checks weekly plan** — shows current priority and alerts if the plan is stale

**Output example:**

```
┌─────────────────────────────────────────────┐
│  PROJECT:   Acme Corp (acme)                │
│  REPO:      acmecorp/acme-console           │
│  BRANCH:    main                            │
│  SESSION:   sess_01HQXV3NK8...              │
└─────────────────────────────────────────────┘

### Last Handoff
From: agent-mac1
Status: in_progress
Summary: Implemented user auth middleware, PR #42 open.
         Tests passing. Need to add rate limiting.

### P0 Issues (Drop Everything)
- #99: Production API returning 500s on /checkout

### Weekly Plan
✓ Valid (2 days old) - Priority: acme

### Other Active Sessions
- agent-mac2 on acmecorp/acme-console (Issue #87)

### Enterprise Context
#### Acme Corp Executive Summary (acme)
Acme Corp is a Series A SaaS company building...

What would you like to focus on?
```

### Mid-Session Update

During work, the session can be updated with:

- Current branch and commit SHA
- Arbitrary metadata (last file edited, current issue, etc.)
- Heartbeat pings to prevent staleness

Heartbeats use server-side jitter (10min base ± 2min) to prevent thundering herd across many agents.

### End of Day (EOD)

EOD captures session state for the next session:

1. **Agent synthesizes** — the agent reviews conversation history, git log, PRs created, and issues touched to auto-generate a handoff summary
2. **Structured handoff** — captures: accomplished, in progress, blocked, next steps
3. **User confirms** — single yes/no before committing
4. **Persisted to D1** — handoff stored as canonical JSON with SHA-256 hash, retrievable by the next SOD call

**Critical principle**: The agent summarizes. The human confirms. The human never writes the handoff — the agent has full session context and synthesizes it.

### Session Staleness

Sessions have a 45-minute idle timeout. If no heartbeat is received:

- Session is filtered out of "active" queries (Phase 1: soft filter)
- Session is marked `abandoned` (Phase 2: scheduled cleanup)
- Next SOD for the same agent creates a fresh session

---

## 5. Parallel Agent Coordination

### The Problem

Multiple agents working on the same codebase need to know about each other. Without coordination:

- Two agents pick the same issue
- Branch conflicts from simultaneous work on the same files
- Handoffs overwrite each other

### How It Works

**Session awareness**: SOD shows all active sessions for the same project. Each session records agent identity, repo, branch, and optionally the issue being worked on.

**Branch isolation**: Each agent instance uses a dedicated branch prefix:

```
dev/host/fix-auth-timeout
dev/instance1/add-lot-filter
dev/instance2/update-schema
```

**Rules**:

- One branch per agent at a time
- Always branch from main
- Coordinate via PRs, not shared files
- Push frequently for visibility

**Track system**: For structured parallelism, issues can be assigned to numbered tracks. Agents claim a track at SOD time and only see issues for their track.

```
Agent 1: SOD project track-1  → works on track 1 issues
Agent 2: SOD project track-2  → works on track 2 issues
Agent 3: SOD project track-0  → planning/backlog organization
```

### Handoff Between Agents

When work transfers between agents (or between machines):

```
Source agent:
  git commit -m "WIP: checkpoint for handoff"
  git push origin dev/instance1/feature-name
  → Records structured handoff via EOD

Target agent:
  → SOD retrieves the handoff automatically
  git fetch origin
  git checkout -b dev/instance2/feature-name origin/dev/instance1/feature-name
  → Continues work
```

---

## 6. Enterprise Knowledge Store

### Purpose

Agents need business context to make good decisions. "What does this company do?" "What's the product strategy?" "Who's the target customer?" This knowledge is durable — it doesn't change session to session — but agents need it injected at session start.

### Implementation

A notes table in D1 stores typed knowledge entries:

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT NOT NULL,
  tags TEXT,           -- JSON array: ["executive-summary", "prd"]
  venture TEXT,        -- project scope (null = global)
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  actor_key_id TEXT,
  meta_json TEXT
);
```

### Tag Vocabulary

Notes are organized by controlled tags (recommended, not enforced):

| Tag                 | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `executive-summary` | Company/project overviews, mission, tech stack |
| `prd`               | Product requirements documents                 |
| `design`            | Design briefs                                  |
| `strategy`          | Strategic assessments, founder reflections     |
| `methodology`       | Frameworks, processes                          |
| `market-research`   | Competitors, market analysis                   |
| `bio`               | Founder/team bios                              |
| `marketing`         | Service descriptions, positioning              |
| `governance`        | Legal, tax, compliance                         |

New tags can be added without code changes.

### Scope

Notes are scoped to a project (e.g., `venture: "acme"`) or global (`venture: null`). At SOD, the system fetches:

- Notes tagged `executive-summary` scoped to the current project
- Notes tagged `executive-summary` with global scope

These are injected into the agent's context automatically.

### What Does NOT Belong

The knowledge store is specifically for content that makes agents smarter. It is NOT:

- A general note-taking app (personal notes go elsewhere)
- A code repository (code goes in git)
- A secrets manager (secrets go in a dedicated vault)
- A session log (that's what handoffs are for)

**Storage is explicit**: Notes are only created when a human explicitly asks. The agent never auto-saves to the knowledge store.

---

## 7. Documentation Management

### Operational Docs

Team workflows, API specs, coding standards, and process documentation are stored in D1 and versioned. On SOD, relevant docs are returned to the agent:

- **Global docs**: Same for all projects (team workflow, dev standards)
- **Project-specific docs**: Scoped to the current project

### Self-Healing

The system audits documentation on every SOD:

1. Checks for missing required docs (per project)
2. Checks for stale docs (exceeding a staleness threshold)
3. Auto-generates missing docs from available sources (README, package.json, etc.)
4. Uploads regenerated docs to the API

This means documentation gaps are detected and fixed automatically, without human intervention.

### Sync Pipeline

When docs are updated in git (e.g., process docs merged to main):

1. GitHub Actions detects the change
2. An upload script POSTs the doc to the context API
3. Version is incremented, content hash updated
4. Next SOD call returns the latest version

---

## 8. The CLI Launcher

A wrapper script launches agent sessions with secrets injected:

```bash
# Usage
launcher <project-code>

# What it does:
# 1. Injects project-specific secrets from vault (Infisical)
# 2. Changes to the correct repository directory
# 3. Launches the AI CLI (claude, gemini, etc.)
# 4. Agent runs SOD automatically
```

This eliminates the need to manually set environment variables or navigate to repos. One command, fully configured session.

---

## 9. MCP Integration

### Why MCP

The system was originally implemented as bash scripts called via CLI skill/command systems. This proved unreliable:

- Environment variables didn't pass through to skill execution
- Auth token conflicts between OAuth and API keys
- High setup friction per machine

MCP (Model Context Protocol) is the standard extension mechanism for AI coding tools. It provides:

- **Reliable auth**: API key in config file, passed automatically on every request
- **Type-safe tools**: Zod-validated input/output schemas
- **Single config**: One JSON file per machine, no environment variables needed
- **Discoverable**: `claude mcp list` shows connected servers

### Local MCP Server

Rather than connecting the AI CLI directly to the cloud API, we run a local MCP server (Node.js, stdio transport) that:

1. Handles git repo detection client-side
2. Calls the cloud context API
3. Queries GitHub via `gh` CLI for issue status
4. Renders structured output for the agent
5. Self-heals missing documentation

This keeps the cloud API simple (stateless HTTP) while allowing rich client-side behavior.

### Tool Surface

| Tool        | Purpose                                | Transport        |
| ----------- | -------------------------------------- | ---------------- |
| `sod`       | Start session, load context            | Local MCP → API  |
| `eod`       | Not an MCP tool — uses slash command   | CLI skill → git  |
| `handoff`   | Record mid-session handoff             | Local MCP → API  |
| `status`    | Show full GitHub work queue            | Local MCP → API  |
| `note`      | Store/update enterprise knowledge      | Local MCP → API  |
| `notes`     | Search/retrieve knowledge by tag/scope | Local MCP → API  |
| `preflight` | Validate environment setup             | Local MCP        |
| `context`   | Show current session context           | Local MCP → API  |
| `doc_audit` | Check documentation completeness       | Local MCP → API  |
| `plan`      | Read weekly priority plan              | Local MCP → file |

---

## 10. Workflow Integration

### GitHub as Source of Truth

All work items live in GitHub Issues. The context system does not duplicate this — it provides a lens into GitHub state at session start time.

### Label-Driven Routing

Issues use namespaced labels for status tracking:

```
status:triage → status:ready → status:in-progress → status:qa → status:verified → status:done
```

Routing labels (`needs:pm`, `needs:dev`, `needs:qa`) indicate who needs to act next.

### QA Grading

Not all work needs the same verification. A grading system routes verification to the right method:

| Grade | Verification Method | Example                       |
| ----- | ------------------- | ----------------------------- |
| 0     | CI only             | Refactoring with tests        |
| 1     | CLI/API check       | API endpoint changes          |
| 2     | Light visual        | Minor UI tweaks               |
| 3     | Full walkthrough    | New feature with user journey |

The developer assigns the grade at PR time. The PM can override.

### Escalation Protocol

Hard-won from post-mortems where agents churned for 10+ hours without escalating:

| Condition                       | Action                               |
| ------------------------------- | ------------------------------------ |
| Credential not found in 2 min   | Stop. File issue. Ask human.         |
| Same error 3 times              | Stop. Escalate with what was tried.  |
| Blocked > 30 min on one problem | Time-box expired. Escalate or pivot. |

**Key insight**: Activity is not progress. An agent making 50 tool calls without advancing is worse than one that stops and asks for help after 3 failed attempts.

---

## 11. Data Model

### Core Tables

**Sessions** — tracks active agent sessions with heartbeat-based liveness:

```
id, agent, venture, repo, track, branch, commit_sha,
status (active|ended|abandoned), created_at, last_heartbeat_at,
schema_version, actor_key_id, correlation_id
```

**Handoffs** — structured session summaries persisted for cross-session continuity:

```
id, session_id, venture, repo, from_agent, to_agent,
summary, status_label, payload_json (canonical, SHA-256 hashed),
schema_version, actor_key_id, correlation_id
```

**Notes** — enterprise knowledge entries with tag-based taxonomy:

```
id, title, content, tags (JSON array), venture (scope),
archived, created_at, updated_at
```

**Idempotency Keys** — ensures retry safety on all mutations:

```
(endpoint, key) → response_status, response_hash, response_body,
expires_at (1 hour TTL)
```

**Request Log** — full audit trail with correlation IDs:

```
id, timestamp, correlation_id, endpoint, method,
actor_key_id, agent, venture, status_code, duration_ms
```

### Design Choices

- **ULID** for all IDs (sortable, timestamp-embedded)
- **Canonical JSON** (RFC 8785) for handoff payloads — stable hashing
- **Actor key ID** derived from SHA-256 of API key (first 16 hex chars) — attribution without storing keys
- **Two-tier correlation**: per-request header ID for debugging, stored creation ID for audit trail
- **800KB payload limit** on handoffs (D1 has 1MB row limit, leaving headroom)
- **Hybrid idempotency storage**: full response body if <64KB, hash-only otherwise

---

## 12. What We Learned

### Things That Work Well

1. **SOD/EOD discipline** — Agents that start with full context produce dramatically better work. The 30-second overhead of SOD pays for itself within minutes.

2. **Structured handoffs > free-text notes** — Forcing handoffs into `accomplished / in_progress / blocked / next_steps` makes them actually useful to the receiving agent.

3. **Self-healing docs** — Documentation that auto-regenerates means it never silently goes stale. New projects get baseline docs without anyone remembering to create them.

4. **Enterprise context injection** — Giving agents business context (executive summaries, product strategy) at session start produces more aligned technical decisions.

5. **Parallel session awareness** — Simply showing "Agent X is working on Issue #87" prevents duplicate work.

### Things That Were Hard

1. **MCP process lifecycle** — MCP servers run as subprocesses of the CLI. A "session restart" (context compaction) does NOT restart the MCP process. Only a full CLI exit/relaunch loads new code. This caused a multi-hour debugging session.

2. **Auth evolution** — We went through three auth approaches (environment variables → skill-injected scripts → MCP config). Each migration touched every machine in the fleet.

3. **Knowledge store scope creep** — Early versions auto-saved all kinds of content. The system became noisy. Restricting to "content that makes agents smarter" and requiring explicit human approval dramatically improved signal-to-noise.

4. **Stale process state** — Node.js caches modules at process start. If you rebuild the MCP server but don't restart the CLI, the old code runs. This is not obvious and has bitten us multiple times.

---

## 13. Infrastructure

| Component        | Technology                  | Purpose                       |
| ---------------- | --------------------------- | ----------------------------- |
| Context API      | Cloudflare Worker + D1      | Sessions, handoffs, knowledge |
| GitHub Relay     | Cloudflare Worker + D1      | Label management, QA events   |
| MCP Server       | Node.js (TypeScript, stdio) | Client-side context rendering |
| Secrets Manager  | Infisical                   | API keys, tokens per project  |
| Fleet Networking | Tailscale                   | SSH mesh between machines     |
| CI/CD            | GitHub Actions              | Test, deploy, doc sync        |

**Deployment**: Workers deploy via `wrangler`. MCP server builds locally and links via `npm link`. Fleet updates propagate via git pull + rebuild on each machine.

---

## 14. SSH Mesh Networking

### The Problem

With 5+ development machines (mix of macOS and Linux), manually maintaining SSH config, authorized keys, and connectivity is error-prone. Add a machine, and you need to update every other machine's config. Lose a key, and half the fleet can't reach the new box.

### Full-Mesh SSH

A single script (`setup-ssh-mesh.sh`) establishes bidirectional SSH between all machines in the fleet. It runs in five phases:

```
Phase 1: Preflight
  - Verify this machine is in the registry
  - Check local SSH key exists (Ed25519)
  - Verify macOS Remote Login is enabled
  - Test SSH connectivity to each remote machine

Phase 2: Collect Public Keys
  - Read local pubkey
  - SSH to each remote machine, collect its pubkey
  - If a remote machine has no key, generate one automatically

Phase 3: Distribute authorized_keys
  - For each reachable machine, ensure every other machine's
    pubkey is in its authorized_keys
  - Idempotent — checks before adding, never duplicates

Phase 4: Deploy SSH Config Fragments
  - Writes ~/.ssh/config.d/crane-mesh on each machine
  - Never overwrites ~/.ssh/config (uses Include directive)
  - Each machine gets a config with entries for every other machine
  - Uses Tailscale IPs (stable across networks)

Phase 5: Verify Mesh
  - Tests every source→target pair (including hop tests from remotes)
  - Prints a verification matrix
```

**Verification matrix output:**

```
SSH Mesh Verification
==========================================
From\To     | mac1      | server1   | server2   | laptop1
------------|-----------|-----------|-----------|----------
mac1        | --        | OK        | OK        | OK
server1     | OK        | --        | OK        | OK
server2     | OK        | OK        | --        | OK
laptop1     | OK        | OK        | OK        | --
```

### Key Design Decisions

- **Config fragments, not config files**: The mesh script writes `~/.ssh/config.d/crane-mesh`, included via `Include config.d/*` in the main SSH config. This means the mesh config is fully managed without touching any user-maintained SSH settings.
- **API-driven machine registry**: When the context API key is available, the script fetches the machine list from the API instead of using a hardcoded list. New machines registered via the API automatically appear in the mesh on next run.
- **Tailscale IPs**: All SSH config uses Tailscale IPs (100.x.x.x), which are stable regardless of physical network. A machine on home WiFi, a coffee shop, or a cellular hotspot has the same IP.
- **Idempotent and safe**: The script is safe to re-run. It checks before adding keys, never removes existing entries, and supports `DRY_RUN=true` for previewing changes.
- **Bash 3.2 compatible**: Runs on macOS default bash (which is ancient) without requiring bash 4+.

### Tailscale as Network Layer

All machines run Tailscale, a WireGuard-based mesh VPN:

- **Peer-to-peer**: Traffic goes directly between machines when possible (not through a relay)
- **NAT traversal**: Works behind firewalls, hotel WiFi, cellular networks
- **Stable IPs**: Each machine gets a fixed 100.x.x.x address
- **Zero config**: Machines find each other automatically via coordination server
- **MagicDNS**: Machines are addressable by hostname (e.g., `ssh server1` resolves via Tailscale)

Tailscale replaces the need for port forwarding, dynamic DNS, or VPN servers. SSH, Mosh, and all other traffic flows over the encrypted Tailscale tunnel.

---

## 15. tmux Fleet Configuration

### Why tmux

AI coding sessions can run for hours. If the SSH connection drops (network change, laptop sleep, timeout), the session is lost. tmux solves this:

- **Session persistence**: The tmux session lives on the server. Disconnect and reconnect — the session is exactly where you left it.
- **Transport agnostic**: Works identically over SSH and Mosh. The agent session inside tmux doesn't know or care how you're connected.
- **Multi-window**: Run the agent in one pane, a build watcher in another, logs in a third.

### Fleet-Wide Consistent Config

A deployment script (`setup-tmux.sh`) pushes identical tmux configuration to every machine:

```bash
# Deploy to all machines
bash scripts/setup-tmux.sh

# Deploy to specific machines
bash scripts/setup-tmux.sh server1 server2
```

The script:

1. Installs terminal emulator terminfo (for correct color/key handling over SSH)
2. Deploys a consistent `~/.tmux.conf`
3. Deploys a session wrapper script to `~/.local/bin/`

### tmux Configuration Highlights

```
# True color pass-through (correct rendering over SSH from modern terminals)
set -ga terminal-overrides ",xterm-ghostty:Tc"

# Mouse support (scroll, click, resize panes)
set -g mouse on

# 50k line scrollback (generous for long agent sessions)
set -g history-limit 50000

# Hostname in status bar (critical when SSH'd into multiple machines)
set -g status-left "[#h] "

# Faster escape (no lag when pressing Esc — important for vim users)
set -s escape-time 10

# OSC 52 clipboard — lets tmux copy reach the local clipboard
# through SSH/Mosh. This is the magic that makes copy/paste work
# from a remote tmux session back to your local machine.
set -g set-clipboard on
```

The hostname in the status bar is especially important when working across multiple machines. At a glance, you know which machine you're on.

### Session Wrapper

A small script wraps tmux for agent session management:

```bash
# Usage: crane-session <project>
# If a tmux session for this project exists, reattach to it.
# Otherwise, create one and launch the agent CLI inside it.

crane-session acme
```

This means:

- `ssh server1` + `crane-session acme` = resume exactly where you left off
- Disconnect (intentionally or not) and reconnect later — session is intact
- Works identically whether you connected via SSH or Mosh

---

## 16. Mobile Access: Blink Shell + Mosh

### The Strategy

Development doesn't always happen at a desk. The mobile access strategy uses Blink Shell (iOS SSH/Mosh client) to turn an iPad or iPhone into a thin terminal for remote agent sessions.

```
┌───────────────────┐         ┌──────────────────────┐
│   iPad / iPhone    │  Mosh   │   Always-On Server    │
│                    │ ──────> │                        │
│   Blink Shell      │  (UDP)  │   tmux session         │
│   - SSH keys       │         │   └── agent CLI        │
│   - Host configs   │         │       └── MCP server   │
│   - iCloud sync    │         │           └── context  │
└───────────────────┘         └──────────────────────┘
         │
         │  Tailscale VPN (always connected)
         │
         ▼
    Works from anywhere:
    home WiFi, cellular, hotel, coffee shop
```

### Why Mosh over SSH

Mosh (Mobile Shell) is purpose-built for unreliable networks:

| Feature           | SSH                   | Mosh                            |
| ----------------- | --------------------- | ------------------------------- |
| Transport         | TCP                   | UDP                             |
| Network switch    | Connection dies       | Seamless roaming                |
| Laptop sleep/wake | Connection dies       | Reconnects automatically        |
| Latency           | Waits for server echo | Local echo (instant keystrokes) |
| Cellular gaps     | Timeout → reconnect   | Resumes transparently           |

Mosh is especially valuable on mobile: switch from WiFi to cellular, walk between rooms, lock the phone for 30 minutes — the session is still there when you come back.

**Setup is one command per server:**

```bash
# One-time: install mosh on each Linux server
sudo apt install mosh

# Connect from any Mosh-capable client
mosh server1
```

### Blink Shell Configuration

Blink Shell is an iOS terminal app that supports both SSH and Mosh natively:

- **SSH key import**: Import Ed25519 keys via iCloud Files or paste
- **Host configuration**: Import SSH config file or add hosts manually
- **iCloud sync**: Keys and host configs sync across all iOS devices automatically
- **Multiple sessions**: Swipe to switch between connections
- **Split screen**: Two terminal sessions side-by-side on iPad
- **External keyboard**: Full support for Magic Keyboard, Smart Keyboard, Bluetooth keyboards

### Terminal Scrolling Fix

AI CLI tools that use alternate screen buffers break native touch scrolling on mobile. All machines are pre-configured to disable this:

```json
// Gemini CLI: ~/.gemini/settings.json
{ "ui": { "useAlternateBuffer": false } }

// Codex CLI: ~/.codex/config.toml
[tui]
alternate_screen = false

// Claude Code: works with default settings
```

With alternate screen disabled, normal finger/trackpad scrolling works in Blink Shell, and scrollback history is preserved.

### The OSC 52 Clipboard Bridge

One non-obvious problem: how do you copy text from a remote tmux session to your local device's clipboard?

**OSC 52** is an escape sequence that lets terminal programs write to the local clipboard through any number of SSH/Mosh hops. The chain works like this:

```
Agent output (remote) → tmux (OSC 52 enabled) → Mosh/SSH → Blink Shell → iOS clipboard
```

This is configured in tmux (`set -g set-clipboard on`) and supported by Blink Shell natively. Select text in the remote tmux session, and it's available in your local clipboard.

For manual text selection in tmux (bypassing tmux's mouse capture): **hold Shift + click/drag**.

---

## 17. Field Mode

### The Scenario

A portable laptop serves as the primary development machine when traveling. An iPhone provides hotspot internet. The fleet's always-on servers remain accessible via Tailscale.

### Access Patterns

| Scenario                                  | Target           | Method                                     |
| ----------------------------------------- | ---------------- | ------------------------------------------ |
| Quick thought from bed/couch              | Office server    | Mosh from Blink Shell via Tailscale        |
| Sitting down for real work                | Laptop directly  | Open lid, local terminal + agent CLI       |
| Mid-session, stepping away                | Laptop via phone | Blink Shell to `laptop.local` over hotspot |
| First thing in the morning, laptop closed | Office server    | Mosh from Blink Shell (zero setup)         |

### How Hotspot LAN Access Works

When the phone creates a hotspot, the laptop and phone are on the same local network (172.20.10.x). The phone can SSH/Mosh to the laptop using **mDNS/Bonjour** (`laptop.local`) — no Tailscale needed, sub-millisecond latency.

But: hotspot IPs change between connections. Using `.local` hostname resolution (Bonjour) means it always resolves correctly regardless of the current IP assignment.

### Power Management

The phone's hotspot auto-disables after ~90 seconds of no connected devices. This means the laptop will lose its network path if left idle. For intentional mid-session breaks:

```bash
# Keep laptop awake for Blink SSH access (prevents all sleep)
caffeinate -dis &

# When done, let it sleep normally
killall caffeinate

# Tip: use -di (without -s) to keep machine awake but allow display sleep
# The display is the biggest battery draw
caffeinate -di &
```

### The Full Stack in Field Mode

```
Phone (iPhone)
├── Hotspot → provides internet to laptop
├── Tailscale → provides VPN to office fleet
├── Blink Shell → SSH/Mosh to any machine
│   ├── mosh server1 (via Tailscale, for quick sessions)
│   └── ssh laptop.local (via hotspot LAN, for mid-session access)
│
Laptop (MacBook)
├── Tailscale → same VPN mesh
├── Terminal (local) → primary dev experience
├── Agent CLI → full coding sessions
└── caffeinate → prevents sleep during Blink access

Office (always-on servers)
├── server1 (Linux, x86_64)
├── server2 (Linux, x86_64)
└── server3 (Linux, x86_64)
    └── All running: tmux, agent CLI, node, git, gh
```

This setup means you're never more than a Blink Shell session away from a full development environment, whether you're at a desk, on a couch, or in transit.

---

## 18. Open Questions / Future Work

- **Per-agent tokens**: Currently using a shared API key. Moving to per-agent tokens would improve attribution and enable revocation.
- **Scheduled cleanup**: Stale sessions are currently soft-filtered. A cron trigger to mark them `abandoned` and purge old records is designed but not yet implemented.
- **Cross-project visibility**: Currently scoped per-project. A global dashboard showing all active sessions across all projects would help the human operator.
- **Real-time notifications**: Currently pull-based (SOD queries active sessions). Push notifications when a parallel agent creates a PR or hits a blocker would improve coordination.

---

_This document describes a production system managing AI agent development sessions across a fleet of macOS and Linux machines, accessible from desktops, laptops, and mobile devices. The system has been in daily use since January 2026._
