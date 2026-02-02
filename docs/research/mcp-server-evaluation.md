# MCP Server Evaluation

**Date:** 2026-02-02
**Issue:** #121
**Status:** Complete

---

## Executive Summary

After evaluating four MCP servers for enterprise use in Venture Crane, the recommendations are:

| Server | Recommendation | Rationale |
|--------|----------------|-----------|
| **filesystem** | Skip | Claude Code's built-in Read/Write/Edit tools are superior; MCP version adds complexity without benefit |
| **postgres/sqlite** | Defer | Doesn't support Cloudflare D1; evaluate only if we add traditional Postgres |
| **memory** | Skip | Crane-Context already provides this functionality with better enterprise features |
| **brave-search** | Consider | Free tier (2K queries/month) may be useful; low effort to enable |

**Bottom line:** No MCP servers are recommended for immediate adoption. Brave-search is the only one worth considering, and only if WebSearch proves insufficient for documentation lookups.

---

## Evaluation Criteria

For each server:
1. **Functionality** - What does it enable?
2. **Security** - What are the risks?
3. **Integration** - How hard to set up?
4. **Overlap** - Does it duplicate existing tools?
5. **Value** - Is it worth the complexity?

---

## Server Evaluations

### 1. filesystem

**What It Does:**
Provides file system access with configurable directory allowlists. Enables reading, writing, and managing files across specified paths.

**Functionality:**
- Read/write/delete files
- Directory listing
- Path-based allowlisting for security
- Cross-repo access if configured

**Security:**
- **Risk Level:** High
- Requires careful path allowlisting
- Can enable privilege escalation if misconfigured
- Writes to `~/.bashrc`, `~/.zshrc`, or `$PATH` directories are dangerous
- Best practice: Use narrow project paths, never home directory

**Integration:**
- Easy setup: `claude mcp add filesystem`
- Requires explicit path configuration
- Works with Claude Code's sandbox model

**Overlap:**
- **High overlap with Claude Code built-in tools**
- Claude Code already has: `Read`, `Write`, `Edit`, `Glob`, `Grep`
- Built-in tools have better UX (line numbers, diff-based edits)
- Built-in tools are already sandboxed per Claude Code security model

**Value:**
- **Low** - The only potential benefit is cross-repo access
- For cross-repo work, we use git worktrees (already documented)
- Adding MCP filesystem introduces security complexity without clear benefit

**Recommendation: Skip**

The filesystem MCP server provides no functionality that Claude Code's built-in tools don't already handle better. The security configuration overhead isn't justified.

---

### 2. postgres/sqlite

**What It Does:**
Provides database query access. The official server supports PostgreSQL; community servers support SQLite.

**Functionality:**
- Execute SQL queries (typically read-only)
- Schema inspection
- Query results returned as structured data

**Security:**
- **Risk Level:** Medium-High
- Critical: Use read-only database credentials
- Never connect to production databases
- Parameterized queries help prevent injection
- Docker isolation recommended

**Integration:**
- PostgreSQL: `npx @modelcontextprotocol/server-postgres` with connection string
- Requires database credentials in environment
- Docker recommended for credential isolation

**Overlap:**
- **Partial overlap with Wrangler CLI**
- We can already query D1 via `wrangler d1 execute`
- Direct query access from Claude could speed up debugging

**D1 Compatibility:**
- **Not compatible** - No MCP server exists for Cloudflare D1
- D1 uses HTTP API, not standard PostgreSQL/SQLite protocol
- Would require custom MCP server development to support D1
- Workaround: Use `wrangler d1 execute` via Bash tool

**Value:**
- **Low for current stack** - We don't run traditional Postgres
- Our databases are Cloudflare D1 (accessed via Workers or Wrangler)
- No benefit until/unless we add traditional database services

**Recommendation: Defer**

Not compatible with our Cloudflare D1 databases. Revisit only if we add traditional PostgreSQL services. For D1 debugging, continue using `wrangler d1 execute`.

---

### 3. memory

**What It Does:**
Provides persistent memory across sessions using a knowledge graph. Stores entities, relations, and observations that survive between conversations.

**Functionality:**
- Create/update/delete entities
- Define relationships between entities
- Store observations (facts about entities)
- Query knowledge graph
- Local storage (JSONL) or database backends (SQLite, PostgreSQL, Neo4j)

**Security:**
- **Risk Level:** Low-Medium
- Local storage is contained to specific files
- No network exposure by default
- Data persists on local machine (consider for sensitive info)

**Integration:**
- Easy: `claude mcp add memory`
- Default storage: `~/.mcp/memory.jsonl`
- More advanced setups require database configuration

**Overlap:**
- **High overlap with Crane-Context**
- Crane-Context already provides:
  - Session tracking
  - Handoff summaries between sessions
  - Persistent context via `/sod` and `/eod`
  - Multi-agent coordination
  - Enterprise-wide shared context
  - Cloud-based (accessible from any machine)

**Comparison: memory MCP vs Crane-Context**

| Feature | memory MCP | Crane-Context |
|---------|------------|---------------|
| Storage | Local file | Cloudflare D1 (cloud) |
| Multi-machine | No (per-machine) | Yes (API-based) |
| Session tracking | No | Yes |
| Handoff summaries | No | Yes |
| Multi-agent awareness | No | Yes (session groups) |
| Custom to our workflow | No | Yes |
| Already integrated | No | Yes (/sod, /eod) |

**Value:**
- **Low** - Crane-Context already solves this problem better
- memory MCP is per-machine; Crane-Context is enterprise-wide
- Adding memory MCP would create competing persistence systems
- Could cause confusion about "source of truth"

**Recommendation: Skip**

Crane-Context already provides superior persistent context management that's:
- Cloud-based (works across all dev machines)
- Integrated into our workflow (/sod, /eod, /update, /heartbeat)
- Designed for our specific needs (ventures, repos, sessions)

Adding memory MCP would create redundant, competing systems.

---

### 4. brave-search

**What It Does:**
Provides web search via Brave's Search API. Returns search results that can be used for research, documentation lookups, and current information retrieval.

**Functionality:**
- Web search with query
- Local search (location-based results)
- Returns structured search results
- Good for RAG (Retrieval-Augmented Generation) pipelines

**Security:**
- **Risk Level:** Low
- Read-only (just returns search results)
- API key stored in environment
- No filesystem or network exposure beyond search API

**Integration:**
- Easy: `claude mcp add brave-search`
- Requires Brave Search API key (free tier available)
- Sign up at brave.com/search/api

**Pricing:**
| Tier | Queries/Month | Cost | Rate Limit |
|------|---------------|------|------------|
| Free AI | 2,000 | $0 | 1/second |
| Base AI | Up to 20M | $5/1000 | 20/second |
| Pro AI | Unlimited | Contact | 50/second |

**Overlap:**
- **Moderate overlap with WebSearch tool**
- Claude Code already has built-in `WebSearch` tool
- Both provide web search functionality
- Brave may have different result quality/freshness

**Comparison: brave-search vs WebSearch**

| Feature | brave-search MCP | Claude Code WebSearch |
|---------|------------------|----------------------|
| Built-in | No (requires setup) | Yes |
| Cost | Free tier: 2K/month | Included |
| Rate limit | 1/second (free) | Unknown |
| Local search | Yes | No |
| API key required | Yes | No |

**Value:**
- **Medium-Low** - Marginal benefit over built-in WebSearch
- Free tier is generous (2K queries/month)
- May be worth trying if WebSearch results are insufficient
- Local search feature could be useful for location-based queries

**Recommendation: Consider (Low Priority)**

If WebSearch proves insufficient for documentation lookups or research, brave-search is worth evaluating:
- Free tier is adequate for dev use
- Easy to set up and remove
- Low security risk

**Setup (if needed):**
```bash
# 1. Get API key from https://brave.com/search/api
# 2. Add server
claude mcp add brave-search
# 3. Configure API key when prompted
```

---

## Additional Servers Noted

During research, several other MCP servers were identified that weren't in the original evaluation list but may warrant future consideration:

### git MCP server
- Provides git operations (read, search, manipulate repositories)
- **Overlap:** High with Claude Code's Bash tool + git commands
- **Recommendation:** Skip - no benefit over direct git commands

### fetch MCP server
- Web content fetching and conversion
- **Overlap:** High with Claude Code's WebFetch tool
- **Recommendation:** Skip - built-in tool is sufficient

### Sequential Thinking MCP server
- Dynamic problem-solving through thought sequences
- **Potential use:** Complex reasoning tasks
- **Recommendation:** Research further if reasoning quality becomes a concern

---

## Implementation Notes

### If Adding MCP Servers Later

Claude Code supports three scopes for MCP configuration:

1. **User scope** (`~/.claude.json`) - Personal tooling, available everywhere
2. **Project scope** (`.mcp.json`) - Shared with team via git
3. **CLI** - Temporary, session-only

**Recommended approach for enterprise:**
- Use project scope (`.mcp.json`) for servers the whole team should use
- Use user scope for personal experimentation
- Document any MCP servers in CLAUDE.md

### Verification Commands

```bash
# List configured servers
claude mcp list

# Check server status (inside Claude Code)
/mcp

# Add a server
claude mcp add <name> --scope user

# Remove a server
claude mcp remove <name>
```

---

## Conclusion

**No MCP servers are recommended for immediate adoption.**

Our existing tooling (Claude Code built-ins + Crane-Context) already covers the use cases these servers address:

| Use Case | Current Solution | MCP Alternative | Winner |
|----------|-----------------|-----------------|--------|
| File operations | Read/Write/Edit tools | filesystem | Built-in |
| Database queries | wrangler d1 execute | postgres/sqlite | Built-in (D1 not supported) |
| Persistent memory | Crane-Context | memory | Crane-Context |
| Web search | WebSearch tool | brave-search | Built-in (tie) |

The MCP ecosystem is maturing rapidly. Revisit this evaluation in 6 months (August 2026) to assess:
- New servers that may fill gaps
- D1-compatible database servers
- Improved Claude Code integration

---

## References

- [MCP Official Registry](https://registry.modelcontextprotocol.io/)
- [MCP GitHub Repository](https://github.com/modelcontextprotocol/servers)
- [Claude Code MCP Documentation](https://code.claude.com/docs/en/mcp)
- [Claude Code Sandboxing](https://code.claude.com/docs/en/sandboxing)
- [Brave Search API](https://brave.com/search/api/)
- [MCP Server Security Best Practices](https://www.mintmcp.com/blog/claude-code-security)
