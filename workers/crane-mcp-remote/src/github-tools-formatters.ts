/**
 * Pure formatting helpers for GitHub MCP tool responses.
 *
 * No side-effects, no imports from MCP SDK. Every function takes raw API
 * data and returns a plain text string for the tool content array.
 */

import type { PaginatedResponse } from './github-api.js'

// ── shared casts ─────────────────────────────────────────────────────────────

type LabelLike = { name?: string }
type AssigneeLike = { login?: string }
type HeadRef = { ref?: string; sha?: string }
type BaseRef = { ref?: string }
type StepLike = { name?: string; status?: string; conclusion?: string; number?: number }

function labelNames(labels: unknown): string {
  if (!Array.isArray(labels)) return ''
  return (labels as LabelLike[]).map((l) => l.name).join(', ')
}

function loginNames(assignees: unknown): string {
  if (!Array.isArray(assignees)) return ''
  return (assignees as AssigneeLike[]).map((a) => a.login).join(', ')
}

function paginationSuffix(result: PaginatedResponse<unknown>): string {
  if (!result.has_next_page) return ''
  return `\n---\nPage ${result.page}. Use page: ${result.page + 1} to see more.`
}

// ── Issues ────────────────────────────────────────────────────────────────────

export function formatIssueList(
  owner: string,
  repo: string,
  result: PaginatedResponse<Record<string, unknown>[]>
): string {
  if (result.data.length === 0) return 'No issues found.'

  let text = `## Issues - ${owner}/${repo}\n`
  for (const issue of result.data) {
    const ls = labelNames(issue.labels)
    const as = loginNames(issue.assignees)
    text += `\n### #${issue.number} ${issue.title}`
    text += `\nState: ${issue.state}`
    if (ls) text += ` | Labels: ${ls}`
    if (as) text += ` | Assignees: ${as}`
    text += `\nCreated: ${issue.created_at} | Updated: ${issue.updated_at}`
    if (issue.pull_request) text += ' (pull request)'
    text += '\n'
  }
  return text + paginationSuffix(result)
}

export function formatIssueDetail(
  issue: Record<string, unknown>,
  comments: PaginatedResponse<Record<string, unknown>[]>
): string {
  let text = `# #${issue.number} ${issue.title}\n`
  text += `State: ${issue.state}`

  const ls = labelNames(issue.labels)
  if (ls) text += ` | Labels: ${ls}`

  const as = loginNames(issue.assignees)
  if (as) text += ` | Assignees: ${as}`

  const user = issue.user as AssigneeLike | undefined
  text += `\nAuthor: ${user?.login ?? 'unknown'} | Created: ${issue.created_at} | Updated: ${issue.updated_at}`

  if (issue.milestone) {
    const ms = issue.milestone as { title?: string }
    text += `\nMilestone: ${ms.title}`
  }

  text += `\n\n---\n\n${issue.body ?? '*No description*'}`

  if (comments.data.length > 0) {
    text += '\n\n---\n\n## Comments\n'
    for (const c of comments.data) {
      const cu = c.user as AssigneeLike | undefined
      text += `\n### ${cu?.login ?? 'unknown'} - ${c.created_at}\n${c.body}\n`
    }
    if (comments.has_next_page) {
      text += `\n(${comments.data.length} comments shown. More comments exist.)`
    }
  }

  return text
}

// ── Pull Requests ─────────────────────────────────────────────────────────────

export function formatPRList(
  owner: string,
  repo: string,
  result: PaginatedResponse<Record<string, unknown>[]>
): string {
  if (result.data.length === 0) return 'No pull requests found.'

  let text = `## Pull Requests - ${owner}/${repo}\n`
  for (const pr of result.data) {
    const user = pr.user as AssigneeLike | undefined
    const head = pr.head as HeadRef | undefined
    const base = pr.base as BaseRef | undefined
    text += `\n### #${pr.number} ${pr.title}`
    text += `\nState: ${pr.state} | Author: ${user?.login ?? 'unknown'}`
    text += ` | ${head?.ref ?? '?'} -> ${base?.ref ?? '?'}`
    text += `\nCreated: ${pr.created_at} | Updated: ${pr.updated_at}`
    if (pr.draft) text += ' | DRAFT'
    if (pr.merged_at) text += ` | Merged: ${pr.merged_at}`
    text += '\n'
  }
  return text + paginationSuffix(result)
}

function prStateFlags(pr: Record<string, unknown>): string {
  let s = String(pr.state)
  if (pr.draft) s += ' (DRAFT)'
  if (pr.merged) s += ' (MERGED)'
  return s
}

function prMeta(pr: Record<string, unknown>): string {
  const user = pr.user as AssigneeLike | undefined
  const head = pr.head as HeadRef | undefined
  const base = pr.base as BaseRef | undefined
  let text = `\nAuthor: ${user?.login ?? 'unknown'}`
  text += ` | ${head?.ref ?? '?'} -> ${base?.ref ?? '?'}`
  text += `\nCreated: ${pr.created_at} | Updated: ${pr.updated_at}`
  if (pr.merged_at) text += ` | Merged: ${pr.merged_at}`
  const ls = labelNames(pr.labels)
  if (ls) text += `\nLabels: ${ls}`
  return text
}

export function formatPRDetail(pr: Record<string, unknown>): string {
  let text = `# PR #${pr.number} ${pr.title}\n`
  text += `State: ${prStateFlags(pr)}`
  text += prMeta(pr)
  text += `\nChanges: +${pr.additions ?? 0} -${pr.deletions ?? 0} across ${pr.changed_files ?? 0} files`
  text += `\nMergeable: ${pr.mergeable ?? 'unknown'} | Mergeable state: ${pr.mergeable_state ?? 'unknown'}`
  text += `\n\n---\n\n${pr.body ?? '*No description*'}`
  text += `\n\nURL: ${pr.html_url}`
  return text
}

export function formatPRDiff(
  number: number,
  diff: string,
  maxChars: number,
  files: PaginatedResponse<Record<string, unknown>[]>
): string {
  if (diff.length <= maxChars) {
    return `## Diff for PR #${number}\n\n\`\`\`diff\n${diff}\n\`\`\``
  }

  let text = `## Diff for PR #${number} (truncated - ${diff.length} chars total)\n\n`
  text += '### File Summary\n'
  for (const f of files.data) {
    text += `- ${f.filename} (+${f.additions ?? 0} -${f.deletions ?? 0}) [${f.status}]\n`
  }
  text += `\n### Truncated Diff (first ${maxChars} chars)\n\n`

  let truncated = diff.substring(0, maxChars)
  const lastNewline = truncated.lastIndexOf('\n')
  if (lastNewline > 0) truncated = truncated.substring(0, lastNewline)

  text += `\`\`\`diff\n${truncated}\n\`\`\``
  text += `\n\n*Diff truncated. Use github_get_file to view specific files.*`
  return text
}

// ── Repository ────────────────────────────────────────────────────────────────

export function formatFileContents(
  path: string,
  file: Record<string, unknown>,
  ref: string | undefined
): string {
  let content: string
  if (typeof file.content === 'string' && file.encoding === 'base64') {
    content = atob(file.content.replace(/\n/g, ''))
  } else {
    content = String(file.content ?? '')
  }

  let text = `## ${path}\n`
  text += `SHA: ${file.sha} | Size: ${file.size} bytes`
  if (ref) text += ` | Ref: ${ref}`
  text += `\n\n${content}`
  return text
}

export function formatDirectory(
  owner: string,
  repo: string,
  path: string | undefined,
  ref: string | undefined,
  entries: Record<string, unknown>[]
): string {
  let text = `## ${owner}/${repo}/${path ?? ''}\n`
  if (ref) text += `Ref: ${ref}\n`

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
  return text
}

export function formatCodeSearch(result: {
  total_count: number
  items: Record<string, unknown>[]
}): string {
  if (result.items.length === 0) return 'No code matches found.'

  let text = `## Code Search Results (${result.total_count} total)\n`
  for (const item of result.items) {
    const itemRepo = item.repository as { full_name?: string } | undefined
    text += `\n### ${item.name}`
    text += `\nRepo: ${itemRepo?.full_name ?? 'unknown'} | Path: ${item.path}`
    text += `\nURL: ${item.html_url}\n`
  }
  return text
}

// ── Actions ───────────────────────────────────────────────────────────────────

export function formatRunList(
  owner: string,
  repo: string,
  result: PaginatedResponse<Record<string, unknown>[]> & { total_count?: number }
): string {
  if (result.data.length === 0) return 'No workflow runs found.'

  let text = `## Workflow Runs - ${owner}/${repo}`
  if (result.total_count !== undefined) text += ` (${result.total_count} total)`
  text += '\n'

  for (const run of result.data) {
    const conclusion = run.conclusion ? ` - ${run.conclusion}` : ''
    const actor = run.actor as AssigneeLike | undefined
    text += `\n### ${run.name ?? 'Unnamed'} #${run.run_number}`
    text += `\nStatus: ${run.status}${conclusion}`
    text += ` | Branch: ${(run.head_branch as string) ?? '?'}`
    text += ` | Run ID: ${run.id}`
    text += `\nTriggered: ${run.created_at} | Event: ${run.event}`
    if (actor?.login) text += ` | Actor: ${actor.login}`
    text += `\nURL: ${run.html_url}\n`
  }

  return text + paginationSuffix(result)
}

export function formatRunDetail(
  run: Record<string, unknown>,
  jobs: Record<string, unknown>[]
): string {
  let text = `# ${run.name ?? 'Unnamed'} #${run.run_number}\n`
  text += `Status: ${run.status}`
  if (run.conclusion) text += ` - ${run.conclusion}`
  text += `\nBranch: ${(run.head_branch as string) ?? '?'} | Event: ${run.event}`
  text += `\nStarted: ${run.run_started_at ?? run.created_at}`
  if (run.updated_at) text += ` | Updated: ${run.updated_at}`

  const actor = run.actor as AssigneeLike | undefined
  if (actor?.login) text += `\nActor: ${actor.login}`
  text += `\nURL: ${run.html_url}`

  if (jobs.length > 0) {
    text += '\n\n---\n\n## Jobs\n'
    for (const job of jobs) {
      text += formatJobEntry(job)
    }
  }
  return text
}

function formatJobEntry(job: Record<string, unknown>): string {
  const conclusion = job.conclusion ? ` - ${job.conclusion}` : ''
  let text = `\n### ${job.name}${conclusion}`
  text += `\nStatus: ${job.status}${conclusion}`
  if (job.started_at) text += ` | Started: ${job.started_at}`
  if (job.completed_at) text += ` | Completed: ${job.completed_at}`

  const steps = job.steps as StepLike[] | undefined
  if (steps?.length) {
    text += '\nSteps:'
    for (const step of steps) {
      const sc = step.conclusion ? ` - ${step.conclusion}` : ''
      text += `\n  ${step.number}. ${step.name}: ${step.status}${sc}`
    }
  }
  return text + '\n'
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function formatWhoami(
  user: { login: string; name?: string | null; email?: string | null },
  scopes: string,
  rateLimit: { remaining: string; limit: string; reset: string }
): string {
  const resetDate =
    rateLimit.reset !== 'unknown'
      ? new Date(parseInt(rateLimit.reset, 10) * 1000).toISOString()
      : 'unknown'

  let text = `## GitHub Authentication Status\n`
  text += `\nLogin: ${user.login}`
  text += `\nName: ${user.name ?? 'not set'}`
  text += `\nEmail: ${user.email ?? 'not set'}`
  text += `\n\n### Token Scopes\n${scopes}`
  text += `\n\n### Rate Limit`
  text += `\nRemaining: ${rateLimit.remaining} / ${rateLimit.limit}`
  text += `\nResets: ${resetDate}`
  return text
}
