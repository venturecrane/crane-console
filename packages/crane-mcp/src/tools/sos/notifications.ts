/**
 * CI/CD notification helpers for the SOS tool.
 */

import { type Notification } from '../../lib/crane-api.js'

/**
 * Lower rank = preferred row when a single GitHub run produces multiple
 * notifications (workflow_run + check_suite + check_run). The workflow row
 * carries the most operator-useful summary — it names the workflow rather
 * than a single check inside it.
 */
const EVENT_TYPE_RANK: Record<string, number> = {
  'workflow_run.failure': 0,
  'workflow_run.completed': 0,
  'check_suite.failure': 1,
  'check_suite.completed': 1,
  'check_run.failure': 2,
  'check_run.completed': 2,
}

/**
 * Collapse fanout from a single GitHub run into one display row.
 *
 * Group key priority:
 *   1. match_key (always populated post-migration 0023, including for
 *      check_suite/check_run rows where run_id may be null)
 *   2. (repo, run_id) fallback for any pre-migration rows
 *   3. notification id (singleton — never collapses with anything else)
 *
 * Within a group, prefer the row with the lowest event_type rank (workflow >
 * check_suite > check_run). Ties fall through to insertion order, which
 * matches the server-side ORDER BY created_at DESC.
 */
export function collapseByRun(rows: Notification[]): Notification[] {
  const groups = new Map<string, Notification[]>()
  for (const n of rows) {
    const key = n.match_key
      ? `mk:${n.match_key}`
      : n.run_id != null && n.repo
        ? `run:${n.repo}#${n.run_id}`
        : `id:${n.id}`
    const arr = groups.get(key) ?? []
    arr.push(n)
    groups.set(key, arr)
  }
  return [...groups.values()].map((g) => {
    if (g.length === 1) return g[0]
    return [...g].sort(
      (a, b) =>
        (EVENT_TYPE_RANK[a.event_type ?? ''] ?? 99) - (EVENT_TYPE_RANK[b.event_type ?? ''] ?? 99)
    )[0]
  })
}
