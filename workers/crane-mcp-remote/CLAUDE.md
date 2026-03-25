# CLAUDE.md - Crane MCP Remote Worker

Remote MCP server for claude.ai and Claude Desktop. Exposes crane-context
tools and GitHub API access over Streamable HTTP with GitHub OAuth.

## About

This worker serves MCP tools over HTTP so that claude.ai (browser) and
Claude Desktop can access VCMS, portfolio state, handoffs, docs, cadence
data, and GitHub repositories without a local crane-mcp installation.

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
      |                     |
      | fetch() + Key       | fetch() + Bearer token
      v                     v
  crane-context         GitHub API
      |
      v
     D1
```

- OAuthProvider handles DCR, token exchange, and auth routing
- McpAgent (Durable Object) handles MCP protocol per session
- CraneContextClient proxies reads to crane-context REST API
- GitHubApiClient makes authenticated GitHub REST API calls
- KV provides OAuth storage (OAUTH_KV) and read cache (CACHE_KV)

## Tools Exposed

### Crane Context Tools

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

### GitHub Tools

| Tool                  | Description                                | Type  |
| --------------------- | ------------------------------------------ | ----- |
| github_list_issues    | List issues in a repository                | Read  |
| github_get_issue      | Get issue details with body and comments   | Read  |
| github_create_issue   | Create a new issue                         | Write |
| github_update_issue   | Update issue (title, body, state, labels)  | Write |
| github_add_comment    | Comment on an issue or PR                  | Write |
| github_list_pulls     | List pull requests                         | Read  |
| github_get_pull       | Get PR details with merge status           | Read  |
| github_get_pull_diff  | Get PR diff (truncated for large diffs)    | Read  |
| github_get_file       | Get file contents (1MB GitHub API limit)   | Read  |
| github_list_directory | List directory contents                    | Read  |
| github_search_code    | Search code (defaults to org:venturecrane) | Read  |
| github_list_runs      | List CI/CD workflow runs                   | Read  |
| github_get_run        | Get run details with jobs and steps        | Read  |
| github_whoami         | Show auth status, scopes, and rate limit   | Read  |

## Auth Model

GitHub OAuth via venturecrane-github App (ID: 2619905).
OAuth scopes: `read:user user:email repo`.
ALLOWED_GITHUB_USERS env var controls access (comma-separated logins).
X-Actor-Identity header passed to crane-context for audit trail.

The GitHub access token is persisted in the encrypted OAuth session props
and used by GitHubApiClient for repository operations. Pre-existing sessions
(connected before the repo scope was added) will see a helpful reconnect
message when using GitHub tools.

## Secrets

Set via `wrangler secret put <NAME>`:

- GITHUB_CLIENT_ID
- GITHUB_CLIENT_SECRET
- CRANE_CONTEXT_KEY
- COOKIE_ENCRYPTION_KEY
