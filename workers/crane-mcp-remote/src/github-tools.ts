/**
 * GitHub MCP tool registrations for the remote crane worker.
 *
 * 14 tools providing Issues, PRs, Repository, Actions, and diagnostics
 * access via the GitHub REST API. All tools use the `github_` prefix.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { GitHubApiClient } from './github-api.js'

const RECONNECT_MESSAGE =
  'GitHub tools require reconnecting the crane MCP integration. Go to claude.ai Settings > Integrations, disconnect crane, then reconnect to get a token with repository access.'

const MAX_DIFF_CHARS = 50_000

/**
 * Register all GitHub MCP tools on the given server instance.
 */
export function registerGitHubTools(server: McpServer, client: GitHubApiClient): void {
  // Helper: guard for missing token (pre-existing sessions)
  function requireToken(): string | null {
    if (!client.hasToken) return RECONNECT_MESSAGE
    return null
  }

  // Helper: format error response
  function errorResult(message: string) {
    return {
      content: [{ type: 'text' as const, text: message }],
      isError: true,
    }
  }

  // Helper: wrap tool handler with token guard and error handling
  function safeHandler(
    fn: () => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>
  ) {
    return async () => {
      const tokenError = requireToken()
      if (tokenError) return errorResult(tokenError)
      try {
        return await fn()
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err))
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Issues
  // ──────────────────────────────────────────────────────────────────────────

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
    async ({ owner, repo, state, labels, assignee, per_page, page }) => {
      return safeHandler(async () => {
        const result = await client.listIssues(owner, repo, {
          state,
          labels,
          assignee,
          per_page,
          page,
        })

        if (result.data.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No issues found.' }] }
        }

        let text = `## Issues - ${owner}/${repo}\n`
        for (const issue of result.data) {
          const labels_str = Array.isArray(issue.labels)
            ? (issue.labels as Array<{ name?: string }>).map((l) => l.name).join(', ')
            : ''
          const assignees_str = Array.isArray(issue.assignees)
            ? (issue.assignees as Array<{ login?: string }>).map((a) => a.login).join(', ')
            : ''
          text += `\n### #${issue.number} ${issue.title}`
          text += `\nState: ${issue.state}`
          if (labels_str) text += ` | Labels: ${labels_str}`
          if (assignees_str) text += ` | Assignees: ${assignees_str}`
          text += `\nCreated: ${issue.created_at} | Updated: ${issue.updated_at}`
          if (issue.pull_request) text += ' (pull request)'
          text += '\n'
        }

        if (result.has_next_page) {
          text += `\n---\nPage ${result.page}. Use page: ${result.page + 1} to see more.`
        }

        return { content: [{ type: 'text' as const, text }] }
      })()
    }
  )

  server.tool(
    'github_get_issue',
    'Get full issue details including body and comments.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      number: z.number().describe('Issue number'),
    },
    async ({ owner, repo, number }) => {
      return safeHandler(async () => {
        const issue = await client.getIssue(owner, repo, number)
        const comments = await client.getIssueComments(owner, repo, number, { per_page: 50 })

        let text = `# #${issue.number} ${issue.title}\n`
        text += `State: ${issue.state}`

        const labels = issue.labels as Array<{ name?: string }> | undefined
        if (labels?.length) text += ` | Labels: ${labels.map((l) => l.name).join(', ')}`

        const assignees = issue.assignees as Array<{ login?: string }> | undefined
        if (assignees?.length) text += ` | Assignees: ${assignees.map((a) => a.login).join(', ')}`

        const user = issue.user as { login?: string } | undefined
        text += `\nAuthor: ${user?.login || 'unknown'} | Created: ${issue.created_at} | Updated: ${issue.updated_at}`

        if (issue.milestone) {
          const ms = issue.milestone as { title?: string }
          text += `\nMilestone: ${ms.title}`
        }

        text += `\n\n---\n\n${issue.body || '*No description*'}`

        if (comments.data.length > 0) {
          text += '\n\n---\n\n## Comments\n'
          for (const c of comments.data) {
            const cUser = c.user as { login?: string } | undefined
            text += `\n### ${cUser?.login || 'unknown'} - ${c.created_at}\n${c.body}\n`
          }
          if (comments.has_next_page) {
            text += `\n(${comments.data.length} comments shown. More comments exist.)`
          }
        }

        return { content: [{ type: 'text' as const, text }] }
      })()
    }
  )

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
    async ({ owner, repo, title, body, labels, assignees }) => {
      return safeHandler(async () => {
        const issue = await client.createIssue(owner, repo, { title, body, labels, assignees })
        return {
          content: [
            {
              type: 'text' as const,
              text: `Issue created: #${issue.number} ${issue.title}\nURL: ${issue.html_url}`,
            },
          ],
        }
      })()
    }
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
    async ({ owner, repo, number, title, body, state, labels, assignees }) => {
      return safeHandler(async () => {
        const issue = await client.updateIssue(owner, repo, number, {
          title,
          body,
          state,
          labels,
          assignees,
        })
        return {
          content: [
            {
              type: 'text' as const,
              text: `Issue updated: #${issue.number} ${issue.title} (${issue.state})\nURL: ${issue.html_url}`,
            },
          ],
        }
      })()
    }
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
    async ({ owner, repo, number, body }) => {
      return safeHandler(async () => {
        const comment = await client.createComment(owner, repo, number, body)
        return {
          content: [
            {
              type: 'text' as const,
              text: `Comment added to #${number}\nURL: ${comment.html_url}`,
            },
          ],
        }
      })()
    }
  )

  // ──────────────────────────────────────────────────────────────────────────
  // Pull Requests
  // ──────────────────────────────────────────────────────────────────────────

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
    async ({ owner, repo, state, head, base, per_page, page }) => {
      return safeHandler(async () => {
        const result = await client.listPRs(owner, repo, { state, head, base, per_page, page })

        if (result.data.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No pull requests found.' }] }
        }

        let text = `## Pull Requests - ${owner}/${repo}\n`
        for (const pr of result.data) {
          const user = pr.user as { login?: string } | undefined
          const headRef = pr.head as { ref?: string } | undefined
          const baseRef = pr.base as { ref?: string } | undefined
          text += `\n### #${pr.number} ${pr.title}`
          text += `\nState: ${pr.state} | Author: ${user?.login || 'unknown'}`
          text += ` | ${headRef?.ref || '?'} -> ${baseRef?.ref || '?'}`
          text += `\nCreated: ${pr.created_at} | Updated: ${pr.updated_at}`
          if (pr.draft) text += ' | DRAFT'
          if (pr.merged_at) text += ` | Merged: ${pr.merged_at}`
          text += '\n'
        }

        if (result.has_next_page) {
          text += `\n---\nPage ${result.page}. Use page: ${result.page + 1} to see more.`
        }

        return { content: [{ type: 'text' as const, text }] }
      })()
    }
  )

  server.tool(
    'github_get_pull',
    'Get full pull request details including body, merge status, and review state.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      number: z.number().describe('PR number'),
    },
    async ({ owner, repo, number }) => {
      return safeHandler(async () => {
        const pr = await client.getPR(owner, repo, number)

        let text = `# PR #${pr.number} ${pr.title}\n`
        text += `State: ${pr.state}`
        if (pr.draft) text += ' (DRAFT)'
        if (pr.merged) text += ' (MERGED)'

        const user = pr.user as { login?: string } | undefined
        text += `\nAuthor: ${user?.login || 'unknown'}`

        const head = pr.head as { ref?: string; sha?: string } | undefined
        const base = pr.base as { ref?: string } | undefined
        text += ` | ${head?.ref || '?'} -> ${base?.ref || '?'}`

        text += `\nCreated: ${pr.created_at} | Updated: ${pr.updated_at}`
        if (pr.merged_at) text += ` | Merged: ${pr.merged_at}`

        const labels = pr.labels as Array<{ name?: string }> | undefined
        if (labels?.length) text += `\nLabels: ${labels.map((l) => l.name).join(', ')}`

        text += `\nChanges: +${pr.additions || 0} -${pr.deletions || 0} across ${pr.changed_files || 0} files`
        text += `\nMergeable: ${pr.mergeable ?? 'unknown'} | Mergeable state: ${pr.mergeable_state || 'unknown'}`

        text += `\n\n---\n\n${pr.body || '*No description*'}`
        text += `\n\nURL: ${pr.html_url}`

        return { content: [{ type: 'text' as const, text }] }
      })()
    }
  )

  server.tool(
    'github_get_pull_diff',
    'Get the diff for a pull request. Large diffs (>50K chars) are truncated with a file summary.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      number: z.number().describe('PR number'),
    },
    async ({ owner, repo, number }) => {
      return safeHandler(async () => {
        let diff = await client.getPRDiff(owner, repo, number)

        if (diff.length <= MAX_DIFF_CHARS) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `## Diff for PR #${number}\n\n\`\`\`diff\n${diff}\n\`\`\``,
              },
            ],
          }
        }

        // Diff is too large - get file summary and truncate
        const files = await client.getPRFiles(owner, repo, number, { per_page: 100 })

        let text = `## Diff for PR #${number} (truncated - ${diff.length} chars total)\n\n`
        text += '### File Summary\n'
        for (const f of files.data) {
          text += `- ${f.filename} (+${f.additions || 0} -${f.deletions || 0}) [${f.status}]\n`
        }
        text += `\n### Truncated Diff (first ${MAX_DIFF_CHARS} chars)\n\n`

        diff = diff.substring(0, MAX_DIFF_CHARS)
        // Truncate at the last complete line
        const lastNewline = diff.lastIndexOf('\n')
        if (lastNewline > 0) diff = diff.substring(0, lastNewline)

        text += `\`\`\`diff\n${diff}\n\`\`\``
        text += `\n\n*Diff truncated. Use github_get_file to view specific files.*`

        return { content: [{ type: 'text' as const, text }] }
      })()
    }
  )

  // ──────────────────────────────────────────────────────────────────────────
  // Repository
  // ──────────────────────────────────────────────────────────────────────────

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
    async ({ owner, repo, path, ref }) => {
      return safeHandler(async () => {
        const file = await client.getFileContents(owner, repo, path, ref)

        if (file.type !== 'file') {
          return errorResult(
            `Path "${path}" is a ${file.type}, not a file. Use github_list_directory instead.`
          )
        }

        let content: string
        if (typeof file.content === 'string' && file.encoding === 'base64') {
          content = atob(file.content.replace(/\n/g, ''))
        } else {
          content = String(file.content || '')
        }

        let text = `## ${path}\n`
        text += `SHA: ${file.sha} | Size: ${file.size} bytes`
        if (ref) text += ` | Ref: ${ref}`
        text += `\n\n${content}`

        return { content: [{ type: 'text' as const, text }] }
      })()
    }
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
    async ({ owner, repo, path, ref }) => {
      return safeHandler(async () => {
        const entries = await client.listDirectory(owner, repo, path || '', ref)

        if (!Array.isArray(entries)) {
          return errorResult(
            `Path "${path}" is a file, not a directory. Use github_get_file instead.`
          )
        }

        let text = `## ${owner}/${repo}/${path || ''}\n`
        if (ref) text += `Ref: ${ref}\n`

        // Sort: directories first, then files
        const sorted = [...entries].sort((a, b) => {
          if (a.type === 'dir' && b.type !== 'dir') return -1
          if (a.type !== 'dir' && b.type === 'dir') return 1
          return String(a.name).localeCompare(String(b.name))
        })

        for (const entry of sorted) {
          const icon = entry.type === 'dir' ? '/' : ''
          const size = entry.type === 'file' ? ` (${entry.size} bytes)` : ''
          text += `\n- ${entry.name}${icon}${size}`
        }

        return { content: [{ type: 'text' as const, text }] }
      })()
    }
  )

  server.tool(
    'github_search_code',
    'Search for code across GitHub repositories. Best results when scoped to an owner or repo. Defaults to org:venturecrane when no scope is provided.',
    {
      query: z.string().describe('Search query (code, filename, etc.)'),
      owner: z.string().optional().describe('Scope to repositories owned by this user/org'),
      repo: z.string().optional().describe('Scope to a specific repo (format: "owner/repo")'),
    },
    async ({ query, owner, repo }) => {
      return safeHandler(async () => {
        const result = await client.searchCode(query, { owner, repo })

        if (result.items.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No code matches found.' }] }
        }

        let text = `## Code Search Results (${result.total_count} total)\n`
        for (const item of result.items) {
          const itemRepo = item.repository as { full_name?: string } | undefined
          text += `\n### ${item.name}`
          text += `\nRepo: ${itemRepo?.full_name || 'unknown'} | Path: ${item.path}`
          text += `\nURL: ${item.html_url}\n`
        }

        return { content: [{ type: 'text' as const, text }] }
      })()
    }
  )

  // ──────────────────────────────────────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────────────────────────────────────

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
    async ({ owner, repo, branch, status, per_page, page }) => {
      return safeHandler(async () => {
        const result = await client.listWorkflowRuns(owner, repo, {
          branch,
          status,
          per_page,
          page,
        })

        if (result.data.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No workflow runs found.' }] }
        }

        let text = `## Workflow Runs - ${owner}/${repo}`
        if (result.total_count !== undefined) text += ` (${result.total_count} total)`
        text += '\n'

        for (const run of result.data) {
          const conclusion = run.conclusion ? ` - ${run.conclusion}` : ''
          text += `\n### ${run.name || 'Unnamed'} #${run.run_number}`
          text += `\nStatus: ${run.status}${conclusion}`
          text += ` | Branch: ${(run.head_branch as string) || '?'}`
          text += ` | Run ID: ${run.id}`
          text += `\nTriggered: ${run.created_at} | Event: ${run.event}`

          const actor = run.actor as { login?: string } | undefined
          if (actor?.login) text += ` | Actor: ${actor.login}`

          text += `\nURL: ${run.html_url}\n`
        }

        if (result.has_next_page) {
          text += `\n---\nPage ${result.page}. Use page: ${result.page + 1} to see more.`
        }

        return { content: [{ type: 'text' as const, text }] }
      })()
    }
  )

  server.tool(
    'github_get_run',
    'Get workflow run details including individual job statuses and steps.',
    {
      owner: z.string().describe('Repository owner'),
      repo: z.string().describe('Repository name'),
      run_id: z.number().describe('Workflow run ID'),
    },
    async ({ owner, repo, run_id }) => {
      return safeHandler(async () => {
        const [run, jobs] = await Promise.all([
          client.getWorkflowRun(owner, repo, run_id),
          client.listRunJobs(owner, repo, run_id),
        ])

        let text = `# ${run.name || 'Unnamed'} #${run.run_number}\n`
        text += `Status: ${run.status}`
        if (run.conclusion) text += ` - ${run.conclusion}`
        text += `\nBranch: ${(run.head_branch as string) || '?'} | Event: ${run.event}`
        text += `\nStarted: ${run.run_started_at || run.created_at}`
        if (run.updated_at) text += ` | Updated: ${run.updated_at}`

        const actor = run.actor as { login?: string } | undefined
        if (actor?.login) text += `\nActor: ${actor.login}`

        text += `\nURL: ${run.html_url}`

        if (jobs.length > 0) {
          text += '\n\n---\n\n## Jobs\n'
          for (const job of jobs) {
            const conclusion = job.conclusion ? ` - ${job.conclusion}` : ''
            text += `\n### ${job.name}${conclusion}`
            text += `\nStatus: ${job.status}${conclusion}`
            if (job.started_at) text += ` | Started: ${job.started_at}`
            if (job.completed_at) text += ` | Completed: ${job.completed_at}`

            const steps = job.steps as
              | Array<{
                  name?: string
                  status?: string
                  conclusion?: string
                  number?: number
                }>
              | undefined
            if (steps?.length) {
              text += '\nSteps:'
              for (const step of steps) {
                const stepConclusion = step.conclusion ? ` - ${step.conclusion}` : ''
                text += `\n  ${step.number}. ${step.name}: ${step.status}${stepConclusion}`
              }
            }
            text += '\n'
          }
        }

        return { content: [{ type: 'text' as const, text }] }
      })()
    }
  )

  // ──────────────────────────────────────────────────────────────────────────
  // Utility
  // ──────────────────────────────────────────────────────────────────────────

  server.tool(
    'github_whoami',
    'Show authenticated GitHub user, token scopes, and rate limit status. Use this to diagnose connectivity issues.',
    {},
    async () => {
      return safeHandler(async () => {
        const { user, scopes, rateLimit } = await client.getAuthenticatedUser()

        const resetDate =
          rateLimit.reset !== 'unknown'
            ? new Date(parseInt(rateLimit.reset, 10) * 1000).toISOString()
            : 'unknown'

        let text = `## GitHub Authentication Status\n`
        text += `\nLogin: ${user.login}`
        text += `\nName: ${user.name || 'not set'}`
        text += `\nEmail: ${user.email || 'not set'}`
        text += `\n\n### Token Scopes\n${scopes}`
        text += `\n\n### Rate Limit`
        text += `\nRemaining: ${rateLimit.remaining} / ${rateLimit.limit}`
        text += `\nResets: ${resetDate}`

        return { content: [{ type: 'text' as const, text }] }
      })()
    }
  )
}
