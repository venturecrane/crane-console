# Handoff: Crane Context MCP Server Implementation

**From:** PM Team (Claude Desktop)  
**To:** Dev Team (Claude Code CLI)  
**Date:** January 27, 2026  
**Issue:** #57 (P0: SOD/EOD Skills Broken After Auth Migration)

---

## Summary

Architecture decision complete. Converting crane-context from REST-only to MCP server to fix broken SOD/EOD workflows. Spec written and approved for implementation.

---

## Context

### What Happened

- Issue #57 opened: `/sod` and `/eod` commands fail with "Invalid API key" across all machines
- 8+ hours of troubleshooting across multiple sessions
- Root cause identified: Claude Code's skill system doesn't reliably pass environment variables to bash scripts
- Direct `curl` to crane-context API works perfectly — the problem is Claude Code → bash → env var chain

### The Decision

Stop fighting Claude Code's skill system. Use MCP (Model Context Protocol) instead — it's Claude Code's official extension mechanism with explicit auth configuration.

### Why MCP

1. Auth is configured in `~/.claude.json`, not environment variables
2. MCP client is built into Claude Code — no skill system involvement
3. Same config works on any machine
4. Cloudflare Workers has native MCP support via Agents SDK
5. Industry standard, productizable

---

## What's Ready

### Specification

**Location:** `/docs/crane-context-mcp-spec.md`

Contains:

- Functional requirements (5 MCP tools: sod, eod, handoff, get_doc, list_sessions)
- Technical architecture (Streamable HTTP transport)
- Implementation plan (3 phases, 3 days)
- Bootstrap script for machine setup
- Error handling, testing strategy, rollback plan

### Key Decisions Already Made

| Decision        | Choice                                |
| --------------- | ------------------------------------- |
| Transport       | Streamable HTTP (not stdio)           |
| Auth            | Static key in `X-Relay-Key` header    |
| Config location | `~/.claude.json` mcpServers section   |
| Backward compat | Keep REST endpoints operational       |
| GitHub data     | Placeholder in v1, direct query in v2 |

---

## Implementation Tasks

### Phase 1: MCP Server (Day 1)

**Location:** `workers/crane-context/` in crane-console repo

1. Add `@cloudflare/agents` dependency to package.json
2. Create `/mcp` endpoint in index.ts
3. Implement auth middleware (validate X-Relay-Key)
4. Implement `sod` tool (port logic from existing `/sod` endpoint)
5. Implement `eod` tool
6. Implement `handoff` tool
7. Deploy to production

**Acceptance:** MCP Inspector can connect to `https://crane-context.automation-ab6.workers.dev/mcp` and call tools

### Phase 2: Bootstrap Script (Day 2 AM)

**Location:** `scripts/crane-bootstrap.sh`

Script already drafted in spec. Needs:

- Testing on macOS
- Testing on Linux
- Error handling refinement

### Phase 3: Migration (Day 2 PM)

- Configure mac23
- Configure mbp27 (remote macOS)
- Configure mini (remote Linux)
- Update documentation
- Close Issue #57

---

## Technical Notes

### MCP Handler Pattern (from spec)

```typescript
import { createMcpHandler } from '@cloudflare/agents/mcp'
import { z } from 'zod'

// In fetch handler:
if (url.pathname === '/mcp') {
  // Validate key first
  const key = request.headers.get('X-Relay-Key')
  if (key !== env.RELAY_KEY) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }
  // Then delegate to MCP handler
  return mcpHandler(request, env, ctx)
}
```

### Client Config (what machines will have)

```json
{
  "mcpServers": {
    "crane-context": {
      "type": "http",
      "url": "https://crane-context.automation-ab6.workers.dev/mcp",
      "headers": {
        "X-Relay-Key": "<CRANE_CONTEXT_KEY>"
      }
    }
  }
}
```

### Existing Code to Reuse

The `/sod` REST endpoint already has the business logic:

- Session creation/resume
- Handoff retrieval
- Documentation listing

Port this logic into MCP tool handlers. Don't rewrite — wrap.

---

## Files to Reference

| File                                   | Purpose                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| `/docs/crane-context-mcp-spec.md`      | Full specification                                          |
| `/workers/crane-context/src/index.ts`  | Current worker entry                                        |
| `/workers/crane-context/wrangler.toml` | Worker config                                               |
| `/scripts/sod-universal.sh`            | Current (broken) bash script — shows expected output format |

---

## Credentials

| Key               | Value                 | Location                          |
| ----------------- | --------------------- | --------------------------------- |
| CRANE_CONTEXT_KEY | `<CRANE_CONTEXT_KEY>` | Bitwarden "Crane Context API Key" |
| Anthropic API Key | `<ANTHROPIC_API_KEY>` | Bitwarden "venture-crane-shared"  |

---

## Questions for Captain

1. **GitHub PAT:** Should we add GitHub integration to MCP server now (needs PAT in worker secrets) or defer to Phase 2?
   - Spec recommends: Defer, return null for github field

2. **Timeline:** Is 3 days acceptable, or should we compress?

3. **Scope:** Spec includes 5 tools. Should we ship with just sod/eod first?

---

## Success Looks Like

```
$ claude
> sod

Calling crane-context.sod...

Session: sess_xxx (active)
Last handoff: "Completed MCP implementation..."
Documentation: 11 docs cached
P0 Issues: none
Ready: #62, #63

What would you like to work on?
```

No `/sod` command. No environment variables. Just natural language → MCP tool → response.

---

## Rollback

If this fails, the bash scripts still work:

```bash
export CRANE_CONTEXT_KEY="..."
bash scripts/sod-universal.sh
```

REST endpoints stay live regardless of MCP status.

---

_Ready for Dev Team to begin implementation._
