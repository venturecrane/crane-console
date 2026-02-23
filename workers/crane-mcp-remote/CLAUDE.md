# CLAUDE.md - Crane MCP Remote Worker

Remote MCP server for claude.ai and Claude Desktop. Exposes a read-only
subset of crane-context tools over Streamable HTTP with GitHub OAuth.

## About

This worker serves MCP tools over HTTP so that claude.ai (browser) and
Claude Desktop can access VCMS, portfolio state, handoffs, docs, and
cadence data without a local crane-mcp installation.

**Staging URL:** https://crane-mcp-remote-staging.automation-ab6.workers.dev
**Production URL:** https://crane-mcp-remote.automation-ab6.workers.dev

## Build Commands

```bash
cd workers/crane-mcp-remote
npm install
npm run dev             # Local dev (wrangler dev)
npm run deploy          # Deploy to staging
npm run deploy:prod     # Deploy to production
npm run typecheck       # TypeScript validation
```

## Architecture

```
claude.ai / Claude Desktop
      |
      | Streamable HTTP + OAuth
      v
  crane-mcp-remote (this worker)
      |
      | fetch() + X-Relay-Key
      v
  crane-context (existing worker)
      |
      v
     D1
```

- OAuthProvider handles DCR, token exchange, and auth routing
- McpAgent (Durable Object) handles MCP protocol per session
- CraneContextClient proxies reads to crane-context REST API
- KV provides OAuth storage (OAUTH_KV) and read cache (CACHE_KV)

## Tools Exposed

| Tool                  | Description                                                           | Type       |
| --------------------- | --------------------------------------------------------------------- | ---------- |
| crane_briefing        | Portfolio dashboard (schedule + sessions + handoffs + exec summaries) | Read       |
| crane_ventures        | List ventures                                                         | Read       |
| crane_doc             | Fetch a documentation document                                        | Read       |
| crane_doc_audit       | Run documentation audit                                               | Read       |
| crane_notes           | Search/list VCMS notes                                                | Read       |
| crane_note_read       | Read full note by ID                                                  | Read       |
| crane_schedule        | View/complete cadence items                                           | Read+Write |
| crane_handoffs        | Query handoff history                                                 | Read       |
| crane_active_sessions | List active agent sessions                                            | Read       |

## Auth Model

GitHub OAuth via existing venturecrane-github App (ID: 2619905).
ALLOWED_GITHUB_USERS env var controls access (comma-separated logins).
X-Actor-Identity header passed to crane-context for audit trail.

## Secrets

Set via `wrangler secret put <NAME>`:

- GITHUB_CLIENT_ID
- GITHUB_CLIENT_SECRET
- CRANE_CONTEXT_KEY
- COOKIE_ENCRYPTION_KEY
