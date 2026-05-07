/**
 * Shared formatting helpers for the SOS tool.
 * Pure functions — no side effects, no API calls.
 */

import { type RepoSyncStatus, type NodeModulesDrift } from '../../lib/repo-scanner.js'

/**
 * Calendar-day diff in the operator's canonical timezone (America/Phoenix).
 * Plan §B.2 T6 / §B.5 — defect #11. Replaces the previous elapsed-ms diff
 * which would say "0 days old" for a file modified 6 hours ago. Returns
 * the integer number of full calendar days between two instants in MST,
 * never below 0.
 *
 * Two timestamps separated by < 24h elapsed but spanning midnight in MST
 * count as 1 day. Two timestamps in the same MST day count as 0.
 */
const SOS_DISPLAY_TIMEZONE = 'America/Phoenix'

export function calendarDaysSince(from: Date, to: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SOS_DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const fromKey = fmt.format(from) // "2026-04-07"
  const toKey = fmt.format(to)
  // Reinterpret the date strings as UTC midnights so the integer math
  // is consistent regardless of DST or local timezone of the runner.
  const fromUtc = Date.parse(`${fromKey}T00:00:00Z`)
  const toUtc = Date.parse(`${toKey}T00:00:00Z`)
  const diff = Math.floor((toUtc - fromUtc) / 86_400_000)
  return Math.max(0, diff)
}

/**
 * Render an age in human-friendly form. For sub-1-day ages we say
 * "today" instead of "0 days" — the previous behavior trained operators
 * to ignore counts that read "0 days old" because it looked like a bug.
 */
export function formatAgeDays(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return '1 day old'
  return `${days} days old`
}

export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

/**
 * Render the Session-block Sync line.
 *
 * Format examples:
 *   "current · fetched 3m ago"           clean, up to date, recent fetch
 *   "+5 behind · fetched 2h ago"         clean but stale
 *   "⚠ 27 dirty, 235 behind · fetched 9d ago"   stale checkout + WIP
 *   "unknown"                            not a git repo / no upstream
 */
export function formatRepoSync(status: RepoSyncStatus | null | undefined): string {
  if (!status) return 'unknown'

  const parts: string[] = []
  if (status.dirty > 0 && status.behind > 0) {
    parts.push(`⚠ ${status.dirty} dirty, ${status.behind} behind`)
  } else if (status.behind > 0) {
    parts.push(`+${status.behind} behind`)
  } else if (status.ahead > 0) {
    parts.push(`${status.ahead} ahead`)
  } else if (status.dirty > 0) {
    parts.push(`${status.dirty} dirty`)
  } else {
    parts.push('current')
  }

  if (status.lastFetchSecondsAgo !== null) {
    parts.push(`fetched ${formatElapsed(status.lastFetchSecondsAgo)}`)
  } else {
    parts.push('never fetched')
  }

  return parts.join(' · ')
}

/**
 * Render the Session-block Deps line.
 *
 * Format examples:
 *   "current"                   node_modules matches lockfile
 *   "⚠ missing (run npm ci)"    lockfile present but node_modules empty
 *   "⚠ stale by 2h (lockfile newer than install)"  install drift
 *   "—"                         not a node project or no lockfile
 */
export function formatDepsDrift(drift: NodeModulesDrift | null | undefined): string {
  if (!drift) return '—'
  switch (drift.state) {
    case 'current':
      return 'current'
    case 'missing':
      return '⚠ missing (run `npm ci`)'
    case 'stale':
      return drift.staleBySeconds !== null
        ? `⚠ stale by ${formatElapsed(drift.staleBySeconds).replace(/ ago$/, '')} (lockfile newer than install)`
        : '⚠ stale (lockfile newer than install)'
    case 'absent':
    case 'unknown':
    default:
      return '—'
  }
}

/** Truncate a string to the first line or maxLen chars, whichever is shorter */
export function truncateOneLine(text: string, maxLen: number): string {
  const firstLine = text.split('\n')[0]
  if (firstLine.length <= maxLen) return firstLine
  return firstLine.slice(0, maxLen - 3) + '...'
}

/** Extract a meaningful one-liner from a markdown handoff summary, skipping headings and blanks */
export function extractHandoffOneLiner(text: string, maxLen: number): string {
  const contentLines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))

  if (contentLines.length === 0) return truncateOneLine(text, maxLen)

  // Join bullet items with semicolons for a compact one-liner
  let summary = ''
  for (const line of contentLines) {
    const clean = line.replace(/^[-*]\s+/, '')
    if (summary.length === 0) {
      summary = clean
    } else if (summary.length + clean.length + 2 <= maxLen) {
      summary += '; ' + clean
    } else {
      break
    }
  }

  if (summary.length > maxLen) {
    return summary.slice(0, maxLen - 3) + '...'
  }
  return summary
}
