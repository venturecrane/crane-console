/**
 * GitHub MCP tool registrations for the remote crane worker.
 *
 * 14 tools providing Issues, PRs, Repository, Actions, and diagnostics
 * access via the GitHub REST API. All tools use the `github_` prefix.
 *
 * Formatting logic lives in ./github-tools-formatters.ts.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { GitHubApiClient } from './github-api.js'
import {
  formatIssueList,
  formatIssueDetail,
  formatPRList,
  formatPRDetail,
  formatPRDiff,
  formatFileContents,
  formatDirectory,
  formatCodeSearch,
  formatRunList,
  formatRunDetail,
  formatWhoami,
} from './github-tools-formatters.js'

const RECONNECT_MESSAGE =
  'GitHub tools require reconnecting the crane MCP integration. Go to claude.ai Settings > Integrations, disconnect crane, then reconnect to get a token with repository access.'

const MAX_DIFF_CHARS = 50_000

// ── Shared infrastructure ─────────────────────────────────────────────────────

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

function errorResult(message: string): ToolResult {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

function ok(text: string): ToolResult {
  return { content: [{ type: 'text' as const, text }] }
}

function makeHandler(
  client: GitHubApiClient,
  fn: () => Promise<ToolResult>
): () => Promise<ToolResult> {
  return async () => {
    if (!client.hasToken) return errorResult(RECONNECT_MESSAGE)
    try {
      return await fn()
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err))
    }
  }
}

// ── Issues ────────────────────────────────────────────────────────────────────

function registerIssueReadTools(server: McpServer, client: GitHubApiClient): void {
  server.tool(
    'github_list_issues',
    'List issues in a GitHub repository. Returns title, number, state, labels, and assignees.',
    {
      owner: z.string().describe('Repository owner (org or user)'),
      repo: z.string().describe('Repository name'),
      state: z
        .enum(['open', 'closed', 'all'])
        .optional()
        .describe('Filter by state (default: open)'),
      labels: z.string().optional().describe('Comma-separated label names to filter by'),
      assignee: z.string().optional().describe('Filter by assignee login'),
      per_page: z.number().optional().describe('Results per page (default: 30, max: 100)'),
      page: z.number().optional().describe('Page number (default: 1)'),
    },
    async ({ owner, repo, state, labels, assignee, per_page, page }) =>
      makeHandler(client, async () => {
        const result = await client.listIssues(owner, repo, {
          state,
          labels,
          assignee,
          per_page,
          page,
        })
        return ok(formatIssueList(owner, repo, result as Parameters<typeof formatIssueList>[2]))
      })()
  )

  server.tool(
    'github_get_issue',
    'Get full issue details including body and comments.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      number: z.number().describe('Issue number'),
    },
    async ({ owner, repo, number }) =>
      makeHandler(client, async () => {
        const issue = await client.getIssue(owner, repo, number)
        const comments = await client.getIssueComments(owner, repo, number, { per_page: 50 })
        return ok(
          formatIssueDetail(
            issue as Parameters<typeof formatIssueDetail>[0],
            comments as Parameters<typeof formatIssueDetail>[1]
          )
        )
      })()
  )
}

function registerIssueWriteTools(server: McpServer, client: GitHubApiClient): void {
  server.tool(
    'github_create_issue',
    'Create a new issue in a GitHub repository.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      title: z.string().describe('Issue title'),
      body: z.string().optional().describe('Issue body (markdown)'),
      labels: z.array(z.string()).optional().describe('Labels to apply'),
      assignees: z.array(z.string()).optional().describe('GitHub logins to assign'),
    },
    async ({ owner, repo, title, body, labels, assignees }) =>
      makeHandler(client, async () => {
        const issue = await client.createIssue(owner, repo, { title, body, labels, assignees })
        return ok(`Issue created: #${issue.number} ${issue.title}\nURL: ${issue.html_url}`)
      })()
  )

  server.tool(
    'github_update_issue',
    'Update an existing issue (title, body, state, labels, assignees).',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      number: z.number().describe('Issue number'),
      title: z.string().optional().describe('New title'),
      body: z.string().optional().describe('New body'),
      state: z.enum(['open', 'closed']).optional().describe('New state'),
      labels: z.array(z.string()).optional().describe('Replace labels (full list)'),
      assignees: z.array(z.string()).optional().describe('Replace assignees (full list)'),
    },
    async ({ owner, repo, number, title, body, state, labels, assignees }) =>
      makeHandler(client, async () => {
        const issue = await client.updateIssue(owner, repo, number, {
          title,
          body,
          state,
          labels,
          assignees,
        })
        return ok(
          `Issue updated: #${issue.number} ${issue.title} (${issue.state})\nURL: ${issue.html_url}`
        )
      })()
  )

  server.tool(
    'github_add_comment',
    'Add a comment to an issue or pull request.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      number: z.number().describe('Issue or PR number'),
      body: z.string().describe('Comment body (markdown)'),
    },
    async ({ owner, repo, number, body }) =>
      makeHandler(client, async () => {
        const comment = await client.createComment(owner, repo, number, body)
        return ok(`Comment added to #${number}\nURL: ${comment.html_url}`)
      })()
  )
}

function registerIssueTools(server: McpServer, client: GitHubApiClient): void {
  registerIssueReadTools(server, client)
  registerIssueWriteTools(server, client)
}

// ── Pull Requests ─────────────────────────────────────────────────────────────

function registerPRTools(server: McpServer, client: GitHubApiClient): void {
  server.tool(
    'github_list_pulls',
    'List pull requests in a GitHub repository.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      state: z
        .enum(['open', 'closed', 'all'])
        .optional()
        .describe('Filter by state (default: open)'),
      head: z.string().optional().describe('Filter by head branch (format: "user:branch")'),
      base: z.string().optional().describe('Filter by base branch'),
      per_page: z.number().optional().describe('Results per page (default: 30, max: 100)'),
      page: z.number().optional().describe('Page number (default: 1)'),
    },
    async ({ owner, repo, state, head, base, per_page, page }) =>
      makeHandler(client, async () => {
        const result = await client.listPRs(owner, repo, { state, head, base, per_page, page })
        return ok(formatPRList(owner, repo, result as Parameters<typeof formatPRList>[2]))
      })()
  )

  server.tool(
    'github_get_pull',
    'Get full pull request details including body, merge status, and review state.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      number: z.number().describe('PR number'),
    },
    async ({ owner, repo, number }) =>
      makeHandler(client, async () => {
        const pr = await client.getPR(owner, repo, number)
        return ok(formatPRDetail(pr as Parameters<typeof formatPRDetail>[0]))
      })()
  )

  server.tool(
    'github_get_pull_diff',
    'Get the diff for a pull request. Large diffs (>50K chars) are truncated with a file summary.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      number: z.number().describe('PR number'),
    },
    async ({ owner, repo, number }) =>
      makeHandler(client, async () => {
        const diff = await client.getPRDiff(owner, repo, number)
        const files = await client.getPRFiles(owner, repo, number, { per_page: 100 })
        return ok(
          formatPRDiff(number, diff, MAX_DIFF_CHARS, files as Parameters<typeof formatPRDiff>[3])
        )
      })()
  )
}

// ── Repository ────────────────────────────────────────────────────────────────

function registerRepoTools(server: McpServer, client: GitHubApiClient): void {
  server.tool(
    'github_get_file',
    'Get file contents from a repository. GitHub API has a 1MB limit for this endpoint - use github_get_pull_diff for large files.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      path: z.string().describe('File path within the repository'),
      ref: z
        .string()
        .optional()
        .describe('Git ref (branch, tag, or SHA). Defaults to default branch.'),
    },
    async ({ owner, repo, path, ref }) =>
      makeHandler(client, async () => {
        const file = await client.getFileContents(owner, repo, path, ref)
        if (file.type !== 'file') {
          return errorResult(
            `Path "${path}" is a ${file.type}, not a file. Use github_list_directory instead.`
          )
        }
        return ok(formatFileContents(path, file as Parameters<typeof formatFileContents>[1], ref))
      })()
  )

  server.tool(
    'github_list_directory',
    'List directory contents in a repository.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      path: z.string().optional().describe('Directory path (empty or "/" for root)'),
      ref: z
        .string()
        .optional()
        .describe('Git ref (branch, tag, or SHA). Defaults to default branch.'),
    },
    async ({ owner, repo, path, ref }) =>
      makeHandler(client, async () => {
        const entries = await client.listDirectory(owner, repo, path ?? '', ref)
        if (!Array.isArray(entries)) {
          return errorResult(
            `Path "${path}" is a file, not a directory. Use github_get_file instead.`
          )
        }
        return ok(
          formatDirectory(owner, repo, path, ref, entries as Parameters<typeof formatDirectory>[4])
        )
      })()
  )

  server.tool(
    'github_search_code',
    'Search for code across GitHub repositories. Best results when scoped to an owner or repo. Defaults to org:venturecrane when no scope is provided.',
    {
      query: z.string().describe('Search query (code, filename, etc.)'),
      owner: z.string().optional().describe('Scope to repositories owned by this user/org'),
      repo: z.string().optional().describe('Scope to a specific repo (format: "owner/repo")'),
    },
    async ({ query, owner, repo }) =>
      makeHandler(client, async () => {
        const result = await client.searchCode(query, { owner, repo })
        return ok(formatCodeSearch(result as Parameters<typeof formatCodeSearch>[0]))
      })()
  )
}

// ── Actions ───────────────────────────────────────────────────────────────────

function registerActionsTools(server: McpServer, client: GitHubApiClient): void {
  server.tool(
    'github_list_runs',
    'List recent workflow runs (CI/CD) for a repository.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      branch: z.string().optional().describe('Filter by branch name'),
      status: z
        .enum([
          'completed',
          'action_required',
          'cancelled',
          'failure',
          'neutral',
          'skipped',
          'stale',
          'success',
          'timed_out',
          'in_progress',
          'queued',
          'requested',
          'waiting',
          'pending',
        ])
        .optional()
        .describe('Filter by status'),
      per_page: z.number().optional().describe('Results per page (default: 30, max: 100)'),
      page: z.number().optional().describe('Page number (default: 1)'),
    },
    async ({ owner, repo, branch, status, per_page, page }) =>
      makeHandler(client, async () => {
        const result = await client.listWorkflowRuns(owner, repo, {
          branch,
          status,
          per_page,
          page,
        })
        return ok(formatRunList(owner, repo, result as Parameters<typeof formatRunList>[2]))
      })()
  )

  server.tool(
    'github_get_run',
    'Get workflow run details including individual job statuses and steps.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      run_id: z.number().describe('Workflow run ID'),
    },
    async ({ owner, repo, run_id }) =>
      makeHandler(client, async () => {
        const [run, jobs] = await Promise.all([
          client.getWorkflowRun(owner, repo, run_id),
          client.listRunJobs(owner, repo, run_id),
        ])
        return ok(
          formatRunDetail(
            run as Parameters<typeof formatRunDetail>[0],
            jobs as Parameters<typeof formatRunDetail>[1]
          )
        )
      })()
  )
}

// ── Utility ───────────────────────────────────────────────────────────────────

function registerUtilityTools(server: McpServer, client: GitHubApiClient): void {
  server.tool(
    'github_whoami',
    'Show authenticated GitHub user, token scopes, and rate limit status. Use this to diagnose connectivity issues.',
    {},
    async () =>
      makeHandler(client, async () => {
        const { user, scopes, rateLimit } = await client.getAuthenticatedUser()
        return ok(
          formatWhoami(
            user as Parameters<typeof formatWhoami>[0],
            scopes,
            rateLimit as Parameters<typeof formatWhoami>[2]
          )
        )
      })()
  )
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Register all GitHub MCP tools on the given server instance.
 */
export function registerGitHubTools(server: McpServer, client: GitHubApiClient): void {
  registerIssueTools(server, client)
  registerPRTools(server, client)
  registerRepoTools(server, client)
  registerActionsTools(server, client)
  registerUtilityTools(server, client)
}
