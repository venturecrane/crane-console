import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CraneContextClient } from '../crane-api.js'
import { staleBanner, textResult, type ToolResult } from './shared.js'

async function fetchScheduleSection(
  api: CraneContextClient,
  sections: string[],
  staleRef: { value: boolean }
): Promise<void> {
  try {
    const schedule = await api.getScheduleBriefing()
    staleRef.value = staleRef.value || schedule.stale
    const items = schedule.data.items
    if (items.length === 0) return

    const overdueItems = items.filter((i) => i.status === 'overdue')
    const dueItems = items.filter((i) => i.status === 'due')

    let text = '## Schedule'
    if (overdueItems.length > 0) {
      text += `\n\nOVERDUE (${overdueItems.length}):`
      for (const item of overdueItems) {
        text += `\n- ${item.title} [${item.scope}] - ${item.days_since ?? '?'} days since last completion`
      }
    }
    if (dueItems.length > 0) {
      text += `\n\nDue soon (${dueItems.length}):`
      for (const item of dueItems) {
        text += `\n- ${item.title} [${item.scope}]`
      }
    }
    if (overdueItems.length === 0 && dueItems.length === 0) {
      text += '\n\nAll cadence items on track.'
    }
    sections.push(text)
  } catch (err) {
    sections.push(
      `## Schedule\n\nFailed to fetch: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

async function fetchActiveSessionsSection(
  api: CraneContextClient,
  sections: string[],
  staleRef: { value: boolean }
): Promise<void> {
  try {
    const active = await api.getActiveSessions()
    staleRef.value = staleRef.value || active.stale
    const sessions = active.data.sessions
    let text = '## Active Sessions'
    if (sessions.length > 0) {
      for (const s of sessions) {
        text += `\n- ${s.agent} on ${s.repo}${s.issue_number ? ` (#${s.issue_number})` : ''} - started ${s.created_at}`
      }
    } else {
      text += '\n\nNo active agent sessions.'
    }
    sections.push(text)
  } catch (err) {
    sections.push(
      `## Active Sessions\n\nFailed to fetch: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

async function fetchHandoffsSection(
  api: CraneContextClient,
  sections: string[],
  staleRef: { value: boolean }
): Promise<void> {
  try {
    const handoffs = await api.getHandoffs({ limit: 5 })
    staleRef.value = staleRef.value || handoffs.stale
    const records = handoffs.data.handoffs
    if (records.length === 0) return

    let text = '## Recent Handoffs'
    for (const h of records) {
      text += `\n- [${h.venture}/${h.repo}] ${h.status_label} by ${h.from_agent} (${h.created_at})`
      text += `\n  ${h.summary.substring(0, 200)}`
    }
    sections.push(text)
  } catch {
    // Handoffs may require venture filter - skip silently
  }
}

async function fetchExecutiveSummariesSection(
  api: CraneContextClient,
  sections: string[],
  staleRef: { value: boolean }
): Promise<void> {
  try {
    const notes = await api.listNotes({ tag: 'executive-summary', limit: 3 })
    staleRef.value = staleRef.value || notes.stale
    if (notes.data.notes.length === 0) return

    let text = '## Executive Summaries'
    for (const n of notes.data.notes) {
      text += `\n\n### ${n.title || 'Untitled'}`
      if (n.venture) text += ` [${n.venture}]`
      text += `\n${n.content.substring(0, 500)}`
      if (n.content.length > 500) text += '...'
    }
    sections.push(text)
  } catch {
    // Notes are supplementary - skip silently
  }
}

async function fetchKnowledgeBaseSection(
  api: CraneContextClient,
  sections: string[],
  staleRef: { value: boolean }
): Promise<void> {
  try {
    const kbTags = ['prd', 'design', 'strategy', 'methodology', 'market-research']
    const kb = await api.listNotes({ tags: kbTags, limit: 30, include_global: true })
    staleRef.value = staleRef.value || kb.stale

    const seenIds = new Set<string>()
    const kbNotes = kb.data.notes.filter((n) => {
      if (seenIds.has(n.id)) return false
      seenIds.add(n.id)
      return true
    })

    if (kbNotes.length === 0) return

    let text = '## Knowledge Base'
    text += '\nFetch full content: `crane_note_read(id: "<note_id>")`.\n'
    for (const n of kbNotes) {
      const scope = n.venture || 'global'
      const tags = n.tags || ''
      text += `\n- **${n.title || 'Untitled'}** [${scope}] ${tags} - ID: ${n.id}`
    }
    sections.push(text)
  } catch {
    // Knowledge base is supplementary - skip silently
  }
}

async function handleBriefing(api: CraneContextClient): Promise<ToolResult> {
  const sections: string[] = []
  const staleRef = { value: false }

  await fetchScheduleSection(api, sections, staleRef)
  await fetchActiveSessionsSection(api, sections, staleRef)
  await fetchHandoffsSection(api, sections, staleRef)
  await fetchExecutiveSummariesSection(api, sections, staleRef)
  await fetchKnowledgeBaseSection(api, sections, staleRef)

  const joined = sections.join('\n\n---\n\n')
  const output =
    staleBanner(staleRef.value) + (joined || 'No data available. Crane-context may be unreachable.')
  return textResult(output)
}

export function registerBriefingTools(server: McpServer, api: CraneContextClient): void {
  server.tool(
    'crane_briefing',
    'Portfolio dashboard: schedule status, active sessions, recent handoffs, and executive summaries. Call this at the start of every conversation.',
    {},
    () => handleBriefing(api)
  )
}
