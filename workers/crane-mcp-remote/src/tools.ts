/**
 * MCP tool definitions for the remote crane worker.
 *
 * Remote-safe subset: read-only tools plus schedule completion.
 * Tools that require local resources (filesystem, gh CLI, SSH) are excluded.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { CraneContextClient } from './crane-api.js'

function staleWarning(stale: boolean): string {
  return stale ? '\n\n[stale data - crane-context may be unreachable]' : ''
}

/**
 * Register all remote-safe MCP tools on the given server instance.
 */
export function registerTools(server: McpServer, api: CraneContextClient): void {
  // ──────────────────────────────────────────────────────────────────────────
  // crane_briefing - Portfolio dashboard
  // ──────────────────────────────────────────────────────────────────────────
  server.tool(
    'crane_briefing',
    'Portfolio dashboard: schedule status, active sessions, recent handoffs, and executive summaries. Call this at the start of every conversation.',
    {},
    async () => {
      const sections: string[] = []
      let anyStale = false

      // Schedule briefing
      try {
        const schedule = await api.getScheduleBriefing()
        anyStale = anyStale || schedule.stale
        const items = schedule.data.items
        if (items.length > 0) {
          const overdueItems = items.filter((i) => i.status === 'overdue')
          const dueItems = items.filter((i) => i.status === 'due')

          let scheduleText = '## Schedule'
          if (overdueItems.length > 0) {
            scheduleText += `\n\nOVERDUE (${overdueItems.length}):`
            for (const item of overdueItems) {
              scheduleText += `\n- ${item.title} [${item.scope}] - ${item.days_since ?? '?'} days since last completion`
            }
          }
          if (dueItems.length > 0) {
            scheduleText += `\n\nDue soon (${dueItems.length}):`
            for (const item of dueItems) {
              scheduleText += `\n- ${item.title} [${item.scope}]`
            }
          }
          if (overdueItems.length === 0 && dueItems.length === 0) {
            scheduleText += '\n\nAll cadence items on track.'
          }
          sections.push(scheduleText)
        }
      } catch (err) {
        sections.push(
          `## Schedule\n\nFailed to fetch: ${err instanceof Error ? err.message : String(err)}`
        )
      }

      // Active sessions
      try {
        const active = await api.getActiveSessions()
        anyStale = anyStale || active.stale
        const sessions = active.data.sessions
        let activeText = '## Active Sessions'
        if (sessions.length > 0) {
          for (const s of sessions) {
            activeText += `\n- ${s.agent} on ${s.repo}${s.issue_number ? ` (#${s.issue_number})` : ''} - started ${s.created_at}`
          }
        } else {
          activeText += '\n\nNo active agent sessions.'
        }
        sections.push(activeText)
      } catch (err) {
        sections.push(
          `## Active Sessions\n\nFailed to fetch: ${err instanceof Error ? err.message : String(err)}`
        )
      }

      // Recent handoffs (best-effort, may require venture filter)
      try {
        const handoffs = await api.getHandoffs({ limit: 5 })
        anyStale = anyStale || handoffs.stale
        const records = handoffs.data.handoffs
        if (records.length > 0) {
          let handoffText = '## Recent Handoffs'
          for (const h of records) {
            handoffText += `\n- [${h.venture}/${h.repo}] ${h.status_label} by ${h.from_agent} (${h.created_at})`
            handoffText += `\n  ${h.summary.substring(0, 200)}`
          }
          sections.push(handoffText)
        }
      } catch {
        // Handoffs may require venture filter - skip silently
      }

      // Executive summaries
      try {
        const notes = await api.listNotes({ tag: 'executive-summary', limit: 3 })
        anyStale = anyStale || notes.stale
        if (notes.data.notes.length > 0) {
          let notesText = '## Executive Summaries'
          for (const n of notes.data.notes) {
            notesText += `\n\n### ${n.title || 'Untitled'}`
            if (n.venture) notesText += ` [${n.venture}]`
            notesText += `\n${n.content.substring(0, 500)}`
            if (n.content.length > 500) notesText += '...'
          }
          sections.push(notesText)
        }
      } catch {
        // Notes are supplementary - skip silently
      }

      // Knowledge Base (venture-critical notes: PRDs, design, strategy, etc.)
      try {
        const kbTags = ['prd', 'design', 'strategy', 'methodology', 'market-research']
        const kb = await api.listNotes({ tags: kbTags, limit: 30, include_global: true })
        anyStale = anyStale || kb.stale

        // Deduplicate by note ID (in case of overlap with executive summaries)
        const seenIds = new Set<string>()
        const kbNotes = kb.data.notes.filter((n) => {
          if (seenIds.has(n.id)) return false
          seenIds.add(n.id)
          return true
        })

        if (kbNotes.length > 0) {
          let kbText = '## Knowledge Base'
          kbText += '\nFetch full content: `crane_note_read(id: "<note_id>")`.\n'
          for (const n of kbNotes) {
            const scope = n.venture || 'global'
            const tags = n.tags || ''
            kbText += `\n- **${n.title || 'Untitled'}** [${scope}] ${tags} - ID: ${n.id}`
          }
          sections.push(kbText)
        }
      } catch {
        // Knowledge base is supplementary - skip silently
      }

      const output = sections.join('\n\n---\n\n') + staleWarning(anyStale)

      return {
        content: [
          {
            type: 'text' as const,
            text: output || 'No data available. Crane-context may be unreachable.',
          },
        ],
      }
    }
  )

  // ──────────────────────────────────────────────────────────────────────────
  // crane_ventures - List ventures
  // ──────────────────────────────────────────────────────────────────────────
  server.tool(
    'crane_ventures',
    'List all ventures with repos, tech stack, status, and description. Use this to understand what each venture is and its current state.',
    {},
    async () => {
      const { ventures, stale } = await api.getVentures()

      let text = '## Ventures\n'
      for (const v of ventures) {
        text += `\n### ${v.name} [${v.code}]`
        text += `\n- Org: ${v.org}`
        text += `\n- Repos: ${v.repos.join(', ') || 'none'}`
        if (v.portfolio) {
          text += `\n- Status: ${v.portfolio.status}`
          if (v.portfolio.bvmStage) text += ` (${v.portfolio.bvmStage})`
          if (v.portfolio.techStack.length > 0) {
            text += `\n- Tech: ${v.portfolio.techStack.join(', ')}`
          }
          if (v.portfolio.tagline) text += `\n- Tagline: ${v.portfolio.tagline}`
          if (v.portfolio.description) text += `\n- ${v.portfolio.description}`
        }
        text += '\n'
      }
      text += staleWarning(stale)

      return { content: [{ type: 'text' as const, text }] }
    }
  )

  // ──────────────────────────────────────────────────────────────────────────
  // crane_doc - Fetch a document
  // ──────────────────────────────────────────────────────────────────────────
  server.tool(
    'crane_doc',
    'Fetch a documentation document by scope and name. Common docs: project-instructions.md, team-workflow.md, api-structure-template.md.',
    {
      scope: z.string().describe('Document scope: "global" or venture code (e.g., "vc", "ke")'),
      doc_name: z.string().describe('Document name (e.g., "project-instructions.md")'),
    },
    async ({ scope, doc_name }) => {
      const { data, stale } = await api.getDoc(scope, doc_name)

      if (!data) {
        return {
          content: [{ type: 'text' as const, text: `Document not found: ${scope}/${doc_name}` }],
          isError: true,
        }
      }

      let text = ''
      if (data.title) text += `# ${data.title}\n\n`
      if (data.description) text += `*${data.description}*\n\n`
      text += data.content
      text += `\n\n---\nScope: ${data.scope} | Version: ${data.version}`
      text += staleWarning(stale)

      return { content: [{ type: 'text' as const, text }] }
    }
  )

  // ──────────────────────────────────────────────────────────────────────────
  // crane_doc_audit - Documentation audit
  // ──────────────────────────────────────────────────────────────────────────
  server.tool(
    'crane_doc_audit',
    'Run documentation audit for a venture. Shows missing, stale, and present docs.',
    {
      venture: z
        .string()
        .optional()
        .describe('Venture code to audit. If omitted, audits all ventures.'),
    },
    async ({ venture }) => {
      const { data, stale } = await api.getDocAudit(venture)

      const audits = data.audits || (data.audit ? [data.audit] : [])
      if (audits.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No audit results.' }] }
      }

      let text = '## Documentation Audit\n'
      for (const audit of audits) {
        text += `\n### ${audit.venture_name} [${audit.venture}] - ${audit.status}\n`
        text += audit.summary + '\n'

        if (audit.missing.length > 0) {
          text += '\nMissing:'
          for (const m of audit.missing) {
            text += `\n- ${m.doc_name}${m.required ? ' (required)' : ''}`
          }
        }
        if (audit.stale.length > 0) {
          text += '\n\nStale:'
          for (const s of audit.stale) {
            text += `\n- ${s.doc_name} (${s.days_since_update} days old)`
          }
        }
        if (audit.present.length > 0) {
          text += `\n\nPresent: ${audit.present.length} docs up to date`
        }
      }
      text += staleWarning(stale)

      return { content: [{ type: 'text' as const, text }] }
    }
  )

  // ──────────────────────────────────────────────────────────────────────────
  // crane_notes - Search/list notes
  // ──────────────────────────────────────────────────────────────────────────
  server.tool(
    'crane_notes',
    'Search and list notes from the enterprise knowledge store (VCMS).',
    {
      venture: z.string().optional().describe('Filter by venture code'),
      tag: z
        .string()
        .optional()
        .describe('Filter by tag (e.g., executive-summary, prd, strategy, methodology, bio)'),
      q: z.string().optional().describe('Text search in title and content'),
      limit: z.number().optional().describe('Maximum results to return (default 20)'),
    },
    async ({ venture, tag, q, limit }) => {
      const { data, stale } = await api.listNotes({ venture, tag, q, limit })

      if (data.notes.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No notes found matching your criteria.' }],
        }
      }

      let text = `## Notes (${data.count} total)\n`
      for (const n of data.notes) {
        const tags = n.tags ? ` [${n.tags}]` : ''
        const ventureLabel = n.venture ? ` (${n.venture})` : ''
        text += `\n### ${n.title || 'Untitled'}${ventureLabel}${tags}`
        text += `\nID: ${n.id} | Updated: ${n.updated_at}`
        text += `\n${n.content.substring(0, 300)}`
        if (n.content.length > 300) text += '...'
        text += '\n'
      }
      text += staleWarning(stale)

      return { content: [{ type: 'text' as const, text }] }
    }
  )

  // ──────────────────────────────────────────────────────────────────────────
  // crane_note_read - Read a single note
  // ──────────────────────────────────────────────────────────────────────────
  server.tool(
    'crane_note_read',
    'Read the full content of a specific note by ID.',
    {
      id: z.string().describe('Note ID (e.g., note_01ABC...)'),
    },
    async ({ id }) => {
      const { data, stale } = await api.getNote(id)
      const n = data.note

      let text = `# ${n.title || 'Untitled'}\n`
      if (n.venture) text += `Venture: ${n.venture}\n`
      if (n.tags) text += `Tags: ${n.tags}\n`
      text += `Created: ${n.created_at} | Updated: ${n.updated_at}\n`
      text += `\n---\n\n${n.content}`
      text += staleWarning(stale)

      return { content: [{ type: 'text' as const, text }] }
    }
  )

  // ──────────────────────────────────────────────────────────────────────────
  // crane_schedule - View or complete cadence items
  // ──────────────────────────────────────────────────────────────────────────
  server.tool(
    'crane_schedule',
    'View overdue/due recurring activities or record completion. Use action "list" to see the briefing, "complete" after finishing a recurring task.',
    {
      action: z
        .enum(['list', 'complete'])
        .describe('Action: "list" to view briefing, "complete" to record completion'),
      scope: z.string().optional().describe('Venture code to filter briefing (list action only)'),
      name: z
        .string()
        .optional()
        .describe('Schedule item name to complete (e.g., "portfolio-review")'),
      result: z
        .enum(['success', 'warning', 'failure', 'skipped'])
        .optional()
        .describe('Completion result (complete action only)'),
      summary: z.string().optional().describe('Brief outcome description (complete action only)'),
      completed_by: z.string().optional().describe('Who completed this (complete action only)'),
    },
    async ({ action, scope, name, result, summary, completed_by }) => {
      if (action === 'list') {
        const { data, stale } = await api.getScheduleBriefing(scope)

        if (data.items.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No schedule items found.' }] }
        }

        let text = `## Schedule Briefing\n`
        text += `Overdue: ${data.overdue_count} | Due: ${data.due_count} | Untracked: ${data.untracked_count}\n`

        for (const item of data.items) {
          const statusIcon =
            item.status === 'overdue' ? 'OVERDUE' : item.status === 'due' ? 'DUE' : 'untracked'
          text += `\n### ${item.title} [${statusIcon}]`
          text += `\nName: ${item.name} | Scope: ${item.scope} | Every ${item.cadence_days} days`
          if (item.days_since !== null) text += ` | Last: ${item.days_since} days ago`
          if (item.description) text += `\n${item.description}`
          if (item.last_result_summary)
            text += `\nLast result: ${item.last_result} - ${item.last_result_summary}`
        }
        text += staleWarning(stale)

        return { content: [{ type: 'text' as const, text }] }
      }

      // action === 'complete'
      if (!name) {
        return {
          content: [{ type: 'text' as const, text: 'Missing required parameter: name' }],
          isError: true,
        }
      }
      if (!result) {
        return {
          content: [{ type: 'text' as const, text: 'Missing required parameter: result' }],
          isError: true,
        }
      }

      const response = await api.completeScheduleItem(name, {
        result,
        summary,
        completed_by,
      })

      return {
        content: [
          {
            type: 'text' as const,
            text: `Schedule item "${response.name}" completed at ${response.completed_at} with result: ${response.result}`,
          },
        ],
      }
    }
  )

  // ──────────────────────────────────────────────────────────────────────────
  // crane_handoffs - Query handoff history
  // ──────────────────────────────────────────────────────────────────────────
  server.tool(
    'crane_handoffs',
    'Query handoff history. Handoffs are session summaries created when agents end their work.',
    {
      venture: z.string().optional().describe('Filter by venture code (e.g., "vc", "ke")'),
      repo: z.string().optional().describe('Filter by repo name'),
      limit: z.number().optional().describe('Maximum results (default 10)'),
    },
    async ({ venture, repo, limit }) => {
      const { data, stale } = await api.getHandoffs({
        venture,
        repo,
        limit: limit || 10,
      })

      if (data.handoffs.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No handoffs found.' }] }
      }

      let text = `## Handoffs\n`
      for (const h of data.handoffs) {
        text += `\n### [${h.venture}/${h.repo}] ${h.status_label}`
        text += `\nAgent: ${h.from_agent} | ${h.created_at}`
        if (h.issue_number) text += ` | Issue #${h.issue_number}`
        text += `\n${h.summary}\n`
      }
      text += staleWarning(stale)

      return { content: [{ type: 'text' as const, text }] }
    }
  )

  // ──────────────────────────────────────────────────────────────────────────
  // crane_active_sessions - View active agent sessions
  // ──────────────────────────────────────────────────────────────────────────
  server.tool(
    'crane_active_sessions',
    'List currently active agent sessions across all ventures.',
    {},
    async () => {
      const { data, stale } = await api.getActiveSessions()
      const sessions = data.sessions

      if (sessions.length === 0) {
        return {
          content: [
            { type: 'text' as const, text: 'No active agent sessions.' + staleWarning(stale) },
          ],
        }
      }

      let text = `## Active Sessions (${sessions.length})\n`
      for (const s of sessions) {
        text += `\n- **${s.agent}** on ${s.repo}`
        if (s.issue_number) text += ` (#${s.issue_number})`
        text += ` - started ${s.created_at}`
      }
      text += staleWarning(stale)

      return { content: [{ type: 'text' as const, text }] }
    }
  )
}
