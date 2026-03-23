# Crane Context MCP Server - Functional & Technical Specification

**Version:** 1.0 DRAFT  
**Author:** PM Team  
**Date:** January 27, 2026  
**Status:** PENDING REVIEW

---

## 1. Executive Summary

### Problem Statement

The current SOD/EOD workflow relies on Claude Code's skill system (`/sod`, `/eod`) to execute bash scripts that call the Crane Context Worker API. This architecture has proven unreliable because:

1. **Claude Code skill execution has broken auth** - Skills fail with "Invalid API key" errors even when the main Claude Code session is authenticated
2. **Environment variables don't reliably pass to skill execution** - `CRANE_CONTEXT_KEY` set in shell is not available when skills run
3. **OAuth vs API key conflicts** - Claude Code v2.1.20 doesn't cleanly support both auth methods simultaneously
4. **High setup friction** - Each new machine requires extensive troubleshooting

These issues have consumed 8+ hours of troubleshooting across multiple sessions without resolution, blocking core development workflows.

### Proposed Solution

Convert Crane Context Worker into an MCP (Model Context Protocol) server. MCP is Claude Code's official extension mechanism for connecting to external services. This eliminates dependency on the broken skill system entirely.

### Expected Outcomes

| Metric                 | Current State                       | Target State         |
| ---------------------- | ----------------------------------- | -------------------- |
| Machine setup time     | 2+ hours (with troubleshooting)     | <5 minutes           |
| SOD/EOD reliability    | ~30% (auth failures)                | 100%                 |
| Config files to manage | 3+ (env vars, skills, scripts)      | 1 (`~/.claude.json`) |
| Auth mechanisms        | Conflicting (OAuth + API key + env) | Single (MCP header)  |

---

## 2. Functional Requirements

### 2.1 User Stories

**US-1: Start Work Session**

> As a developer, I say "sod" and receive my session context including last handoff, documentation, and GitHub queue status.

**US-2: End Work Session**

> As a developer, I say "eod" and my session state is captured for the next session to pick up.

**US-3: Record Handoff**

> As a developer, I can record a handoff note at any time without ending my session.

**US-4: New Machine Setup**

> As an operator, I set up a new machine by copying one config file and it works immediately.

### 2.2 MCP Tools

| Tool            | Description                         | Required Parameters | Optional Parameters                      |
| --------------- | ----------------------------------- | ------------------- | ---------------------------------------- |
| `sod`           | Start of Day - load session context | none                | `venture`, `repo`, `track`               |
| `eod`           | End of Day - capture session state  | `summary`           | `accomplished`, `in_progress`, `blocked` |
| `handoff`       | Record handoff note                 | `summary`           | `to_agent`, `status_label`               |
| `get_doc`       | Retrieve cached document            | `doc_name`          | `scope`                                  |
| `list_sessions` | List active sessions                | none                | `venture`, `repo`                        |

### 2.3 Tool Specifications

#### `sod` - Start of Day

**Purpose:** Initialize work session, load context, return priorities.

**Input Schema:**

```json
{
  "venture": "string? - vc|dfg|sc (auto-detected if omitted)",
  "repo": "string? - org/repo format (auto-detected if omitted)",
  "track": "number? - default 1"
}
```

**Output Schema:**

```json
{
  "session": {
    "id": "string",
    "status": "active",
    "created_at": "ISO timestamp"
  },
  "last_handoff": {
    "from_agent": "string",
    "summary": "string",
    "created_at": "ISO timestamp"
  } | null,
  "documentation": {
    "count": "number",
    "docs": ["string"]
  },
  "github": {
    "p0_issues": ["#number"],
    "ready": ["#number"],
    "in_progress": ["#number"],
    "blocked": ["#number"]
  }
}
```

**Behavior:**

1. Create session record in D1 (or resume if recent session exists)
2. Query R2 for cached documentation metadata
3. Query D1 for last handoff matching venture/repo/track
4. Return structured context for Claude to present

**Auto-Detection:** When venture/repo not provided, Claude should detect from `git remote get-url origin` and pass to tool. This happens client-side.

---

#### `eod` - End of Day

**Purpose:** Capture session state, create handoff for next session.

**Input Schema:**

```json
{
  "summary": "string - required, brief session summary",
  "accomplished": "string? - what got done",
  "in_progress": "string? - what's still open",
  "blocked": "string? - blockers if any"
}
```

**Output Schema:**

```json
{
  "handoff_id": "string",
  "session_id": "string",
  "status": "recorded",
  "message": "string"
}
```

**Behavior:**

1. Create handoff record in D1
2. Update session status to "completed"
3. Return confirmation

---

#### `handoff` - Record Handoff Note

**Purpose:** Record context transfer without ending session.

**Input Schema:**

```json
{
  "summary": "string - required",
  "to_agent": "string? - target agent (for routing)",
  "status_label": "string? - current issue status"
}
```

**Output Schema:**

```json
{
  "handoff_id": "string",
  "status": "recorded"
}
```

---

#### `get_doc` - Retrieve Document

**Purpose:** Fetch a specific document from cache.

**Input Schema:**

```json
{
  "doc_name": "string - document identifier",
  "scope": "string? - global|venture, default global"
}
```

**Output Schema:**

```json
{
  "name": "string",
  "content": "string",
  "version": "string",
  "cached_at": "ISO timestamp"
}
```

---

#### `list_sessions` - List Active Sessions

**Purpose:** View active sessions for coordination.

**Input Schema:**

```json
{
  "venture": "string?",
  "repo": "string?"
}
```

**Output Schema:**

```json
{
  "sessions": [
    {
      "id": "string",
      "agent": "string",
      "venture": "string",
      "repo": "string",
      "track": "number",
      "status": "string",
      "started_at": "ISO timestamp"
    }
  ]
}
```

---

## 3. Technical Architecture

### 3.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Developer Machine                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                      Claude Code CLI                         ││
│  │  ┌─────────────────────────────────────────────────────────┐││
│  │  │                  MCP Client (built-in)                  │││
│  │  │                                                         │││
│  │  │  ~/.claude.json                                         │││
│  │  │  ┌─────────────────────────────────────────────────┐   │││
│  │  │  │ "mcpServers": {                                 │   │││
│  │  │  │   "crane-context": {                            │   │││
│  │  │  │     "type": "http",                             │   │││
│  │  │  │     "url": "https://crane-context.../mcp",      │   │││
│  │  │  │     "headers": { "X-Relay-Key": "..." }         │   │││
│  │  │  │   }                                             │   │││
│  │  │  │ }                                               │   │││
│  │  │  └─────────────────────────────────────────────────┘   │││
│  │  └─────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTPS POST /mcp
                                │ Header: X-Relay-Key: {key}
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │            crane-context.automation-ab6.workers.dev          ││
│  │                                                              ││
│  │  ┌──────────────────┐  ┌──────────────────────────────────┐ ││
│  │  │   /mcp endpoint  │  │     /sod, /eod (legacy REST)     │ ││
│  │  │   MCP Protocol   │  │     Backward compatible          │ ││
│  │  └────────┬─────────┘  └──────────────────────────────────┘ ││
│  │           │                                                  ││
│  │  ┌────────▼─────────────────────────────────────────────┐   ││
│  │  │              Shared Business Logic                    │   ││
│  │  │  • Session management                                 │   ││
│  │  │  • Handoff storage                                    │   ││
│  │  │  • Documentation retrieval                            │   ││
│  │  └────────┬─────────────────────────────────────────────┘   ││
│  │           │                                                  ││
│  │  ┌────────▼────────┐ ┌─────────────┐ ┌─────────────────┐   ││
│  │  │ D1: crane-ctx   │ │ R2: docs    │ │ KV: cache       │   ││
│  │  │ sessions        │ │             │ │                 │   ││
│  │  │ handoffs        │ │             │ │                 │   ││
│  │  │ events          │ │             │ │                 │   ││
│  │  └─────────────────┘ └─────────────┘ └─────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 MCP Transport

**Protocol:** Streamable HTTP (MCP spec 2024-11-05)

**Why Streamable HTTP:**

- Recommended for remote MCP servers
- Single endpoint for all communication
- Native Cloudflare Workers support via Agents SDK
- No local server required (unlike stdio)

**Endpoint:** `POST https://crane-context.automation-ab6.workers.dev/mcp`

### 3.3 Authentication

**Method:** Static API key in HTTP header

```
X-Relay-Key: {CRANE_CONTEXT_KEY}
```

**Configuration:** Key stored in `~/.claude.json` MCP config, passed automatically on every request.

**Validation:** Server middleware validates key before processing any tool call.

**Key Value:** `0216e886dbe2c31cd5ff0b8f6f46d954177e77b168a690e111bf67cfcc7062e8`

### 3.4 Server Implementation

**Framework:** Cloudflare Agents SDK

**Code Structure:**

```
crane-context/
├── src/
│   ├── index.ts                 # Worker entry point
│   ├── mcp/
│   │   ├── handler.ts           # createMcpHandler setup
│   │   ├── auth.ts              # Key validation middleware
│   │   └── tools/
│   │       ├── sod.ts           # SOD tool handler
│   │       ├── eod.ts           # EOD tool handler
│   │       ├── handoff.ts       # Handoff tool handler
│   │       ├── docs.ts          # get_doc, list_docs handlers
│   │       └── sessions.ts      # list_sessions handler
│   ├── api/                     # Existing REST endpoints (unchanged)
│   │   ├── sod.ts
│   │   ├── eod.ts
│   │   └── ...
│   └── lib/                     # Shared utilities
│       ├── db.ts
│       ├── storage.ts
│       └── types.ts
├── wrangler.toml
└── package.json
```

**Entry Point Pattern:**

```typescript
// src/index.ts
import { createMcpHandler } from '@cloudflare/agents/mcp'
import { mcpTools } from './mcp/handler'
import { validateKey } from './mcp/auth'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)

    // MCP endpoint
    if (url.pathname === '/mcp') {
      const authResult = validateKey(request, env)
      if (!authResult.valid) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return createMcpHandler(mcpTools)(request, env, ctx)
    }

    // Legacy REST endpoints (unchanged)
    if (url.pathname === '/sod') {
      return handleSodRest(request, env, ctx)
    }
    // ... other endpoints
  },
}
```

---

## 4. Client Configuration

### 4.1 Config File Location

**Claude Code CLI:** `~/.claude.json`

**Claude Desktop (if needed):**

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

### 4.2 MCP Server Configuration

```json
{
  "mcpServers": {
    "crane-context": {
      "type": "http",
      "url": "https://crane-context.automation-ab6.workers.dev/mcp",
      "headers": {
        "X-Relay-Key": "0216e886dbe2c31cd5ff0b8f6f46d954177e77b168a690e111bf67cfcc7062e8"
      }
    }
  }
}
```

### 4.3 Verification

After configuration:

```bash
claude
> /mcp
# Should show: crane-context: connected
```

---

## 5. Implementation Plan

### Phase 1: MCP Server (1 day)

| Task | Description               | Acceptance Criteria                   |
| ---- | ------------------------- | ------------------------------------- |
| 1.1  | Add Agents SDK dependency | `@cloudflare/agents` in package.json  |
| 1.2  | Create `/mcp` endpoint    | Endpoint responds to MCP protocol     |
| 1.3  | Implement auth middleware | Invalid key returns 401               |
| 1.4  | Implement `sod` tool      | Returns session + handoff + docs      |
| 1.5  | Implement `eod` tool      | Creates handoff, returns confirmation |
| 1.6  | Implement `handoff` tool  | Creates handoff record                |
| 1.7  | Deploy to production      | MCP Inspector can connect             |

### Phase 2: Bootstrap Script (0.5 day)

| Task | Description             | Acceptance Criteria        |
| ---- | ----------------------- | -------------------------- |
| 2.1  | Create bootstrap script | Single command setup       |
| 2.2  | Handle existing config  | Merges without overwriting |
| 2.3  | Verify connectivity     | Tests MCP connection       |
| 2.4  | Document manual setup   | Step-by-step guide         |

### Phase 3: Migration (0.5 day)

| Task | Description          | Acceptance Criteria       |
| ---- | -------------------- | ------------------------- |
| 3.1  | Configure mac23      | SOD works via MCP         |
| 3.2  | Configure mbp27      | SOD works via MCP         |
| 3.3  | Configure mini       | SOD works via MCP         |
| 3.4  | Update documentation | Runbooks reflect new flow |
| 3.5  | Close Issue #57      | All machines working      |

### Timeline

```
Day 1: Phase 1 (MCP Server implementation)
Day 2: Phase 2 (Bootstrap) + Phase 3 (Migration)
Day 3: Buffer / Documentation / Edge cases
```

---

## 6. Bootstrap Script

```bash
#!/bin/bash
# crane-bootstrap.sh - Set up Claude Code with Crane Context MCP

set -e

CRANE_CONTEXT_URL="https://crane-context.automation-ab6.workers.dev"
CRANE_CONTEXT_KEY="${CRANE_CONTEXT_KEY:-}"

echo "=== Venture Crane Bootstrap ==="

# Prompt for key if not set
if [ -z "$CRANE_CONTEXT_KEY" ]; then
  echo "Enter CRANE_CONTEXT_KEY (from Bitwarden 'Crane Context API Key'):"
  read -s CRANE_CONTEXT_KEY
  echo ""
fi

# Verify key format
if [ ${#CRANE_CONTEXT_KEY} -ne 64 ]; then
  echo "Error: Key should be 64 characters"
  exit 1
fi

# Check Claude Code installed
if ! command -v claude &> /dev/null; then
  echo "Claude Code not found. Install from: https://claude.ai/code"
  exit 1
fi
echo "✓ Claude Code installed"

# Create/update ~/.claude.json
CLAUDE_CONFIG="$HOME/.claude.json"
MCP_CONFIG=$(cat <<EOF
{
  "mcpServers": {
    "crane-context": {
      "type": "http",
      "url": "${CRANE_CONTEXT_URL}/mcp",
      "headers": {
        "X-Relay-Key": "${CRANE_CONTEXT_KEY}"
      }
    }
  }
}
EOF
)

if [ -f "$CLAUDE_CONFIG" ]; then
  # Merge with existing config using jq
  if command -v jq &> /dev/null; then
    jq -s '.[0] * .[1]' "$CLAUDE_CONFIG" <(echo "$MCP_CONFIG") > "${CLAUDE_CONFIG}.tmp"
    mv "${CLAUDE_CONFIG}.tmp" "$CLAUDE_CONFIG"
    echo "✓ MCP config merged into existing ~/.claude.json"
  else
    echo "Warning: jq not installed, cannot merge configs"
    echo "Please manually add MCP config to ~/.claude.json"
    echo "$MCP_CONFIG"
    exit 1
  fi
else
  echo "$MCP_CONFIG" > "$CLAUDE_CONFIG"
  echo "✓ Created ~/.claude.json with MCP config"
fi

# Verify connectivity
echo "Verifying crane-context connectivity..."
HEALTH=$(curl -sS "${CRANE_CONTEXT_URL}/health" 2>/dev/null || echo "failed")
if echo "$HEALTH" | grep -q '"status"'; then
  echo "✓ crane-context reachable"
else
  echo "✗ crane-context not reachable"
  echo "  Check network and try again"
  exit 1
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Start Claude Code: claude"
echo "  2. Verify MCP: /mcp (should show crane-context connected)"
echo "  3. Start session: type 'sod'"
echo ""
```

---

## 7. Error Handling

| Error Condition    | HTTP Status | Response                                                             | User Experience                                     |
| ------------------ | ----------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| Missing key        | 401         | `{"error": "unauthorized", "message": "Missing X-Relay-Key header"}` | Claude reports auth error, suggests checking config |
| Invalid key        | 401         | `{"error": "unauthorized", "message": "Invalid API key"}`            | Same as above                                       |
| Invalid parameters | 400         | `{"error": "validation", "message": "...details..."}`                | Claude reports what's wrong with input              |
| Server error       | 500         | `{"error": "internal", "message": "..."}`                            | Claude suggests retrying                            |
| Network timeout    | N/A         | Connection error                                                     | Claude reports server unreachable                   |

---

## 8. Testing Strategy

### Unit Tests

- Auth middleware rejects invalid/missing keys
- Tool parameter validation via Zod
- Tool handlers return expected shapes
- Error cases return proper error responses

### Integration Tests

- MCP Inspector can connect and list tools
- Each tool callable and returns valid response
- Round-trip: SOD → EOD → SOD (handoff persists)

### Acceptance Tests

| Test                    | Pass Criteria                              |
| ----------------------- | ------------------------------------------ |
| Fresh machine bootstrap | Script completes, `/mcp` shows connected   |
| SOD in Claude Code      | "sod" triggers tool, context displayed     |
| EOD in Claude Code      | "eod" prompts for summary, records handoff |
| Invalid key             | Clear error message, no crash              |
| Network down            | Graceful error message                     |

---

## 9. Success Criteria

### Must Have (P0)

- [ ] `sod` tool works via natural language in Claude Code
- [ ] `eod` tool works via natural language in Claude Code
- [ ] Bootstrap script works on macOS and Linux
- [ ] All 3 machines (mac23, mbp27, mini) configured and working
- [ ] No dependency on environment variables for auth

### Should Have (P1)

- [ ] `handoff` tool for mid-session notes
- [ ] `get_doc` tool for on-demand retrieval
- [ ] Clear error messages for all failure modes
- [ ] Documentation updated

### Nice to Have (P2)

- [ ] `list_sessions` for visibility
- [ ] Works with Claude Desktop
- [ ] Keychain integration for key storage

---

## 10. Open Questions

1. **GitHub integration:** Should MCP server query GitHub directly (needs PAT) or return placeholder for client to fill?
   - _Recommendation:_ Start with null, add direct query in Phase 2

2. **Session timeout:** Should sessions auto-close after inactivity?
   - _Recommendation:_ Yes, 24h timeout, implemented in Phase 2

3. **Track auto-detection:** How to determine track when not specified?
   - _Recommendation:_ Default to 1, require explicit for multi-track

---

## 11. Rollback Plan

If MCP implementation fails:

1. **Immediate:** `bash scripts/sod-universal.sh` still works (requires env var set manually)
2. **Short-term:** Revert crane-context worker deployment
3. **Medium-term:** Wait for Claude Code skill auth fixes

The REST endpoints (`/sod`, `/eod`) remain operational regardless of MCP status.

---

## 12. Appendix

### A. Current (Broken) Flow

```
/sod → skill system → bash → reads $CRANE_CONTEXT_KEY (FAILS) → curl → API
```

### B. Proposed (Working) Flow

```
"sod" → MCP client → HTTP with auth header → /mcp → tool handler → response
```

### C. Related Issues

- #57: P0: SOD/EOD Skills Broken After Auth Migration
- #58: P1: Harden SOD/EOD Against Auth and Config Failures
- #60: P2: SOD/EOD Local Cache and Graceful Degradation

---

## 13. Approvals

| Role    | Name | Date | Decision |
| ------- | ---- | ---- | -------- |
| Captain |      |      | PENDING  |

---

_End of Specification_
