/**
 * crane-context API helpers for the notification backfill script.
 *
 * Covers: lock acquire/release, pending-matches query, open-notifications
 * query, and auto-resolve POST.
 */

import type {
  BackfillOptions,
  PendingMatch,
  PendingMatchesResponse,
  OpenNotificationForKey,
  GithubWorkflowRun,
} from './types.js'

// ============================================================================
// Lock helpers
// ============================================================================

export async function acquireLock(
  opts: BackfillOptions,
  ttlSeconds: number
): Promise<{ acquired: boolean; existingHolder?: string; reason?: string }> {
  const url = `${opts.craneContextUrl}/admin/notifications/backfill-lock/acquire`
  const res = await opts.fetch(url, {
    method: 'POST',
    headers: {
      'X-Admin-Key': opts.craneContextAdminKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      holder: opts.holderId,
      ttl_seconds: ttlSeconds,
      metadata: { dry_run: opts.dryRun ?? false, venture: opts.venture ?? null },
    }),
  })

  if (res.status === 200) {
    const body = (await res.json()) as { acquired: boolean }
    return { acquired: body.acquired }
  }

  if (res.status === 409) {
    const body = (await res.json()) as {
      acquired: boolean
      existing_holder?: string
      reason?: string
    }
    return { acquired: false, existingHolder: body.existing_holder, reason: body.reason }
  }

  const text = await res.text()
  return { acquired: false, reason: `HTTP ${res.status}: ${text}` }
}

export async function releaseLock(opts: BackfillOptions): Promise<void> {
  const url = `${opts.craneContextUrl}/admin/notifications/backfill-lock/release`
  await opts.fetch(url, {
    method: 'POST',
    headers: {
      'X-Admin-Key': opts.craneContextAdminKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ holder: opts.holderId }),
  })
}

// ============================================================================
// Pending matches query
// ============================================================================

export async function fetchPendingMatches(
  opts: BackfillOptions,
  cursor: string | undefined,
  pageSize: number
): Promise<PendingMatchesResponse> {
  const url = new URL(`${opts.craneContextUrl}/admin/notifications/pending-matches`)
  url.searchParams.set('limit', String(pageSize))
  if (cursor) url.searchParams.set('cursor', cursor)
  if (opts.venture) url.searchParams.set('venture', opts.venture)

  const res = await opts.fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-Admin-Key': opts.craneContextAdminKey },
  })

  if (!res.ok) {
    throw new Error(`pending-matches HTTP ${res.status}: ${await res.text()}`)
  }

  return (await res.json()) as PendingMatchesResponse
}

// ============================================================================
// Open-notifications-for-match query
// ============================================================================

export async function fetchOpenNotificationsForMatch(
  opts: BackfillOptions,
  match: PendingMatch
): Promise<OpenNotificationForKey[]> {
  if (!match.repo) return []

  const url = new URL(`${opts.craneContextUrl}/notifications`)
  url.searchParams.set('status', 'new')
  url.searchParams.set('repo', match.repo)
  url.searchParams.set('limit', '100')

  const res = await opts.fetch(url.toString(), {
    method: 'GET',
    headers: { 'X-Admin-Key': opts.craneContextAdminKey },
  })

  if (!res.ok) {
    throw new Error(`/notifications HTTP ${res.status}: ${await res.text()}`)
  }

  const body = (await res.json()) as {
    notifications: Array<{
      id: string
      created_at: string
      match_key: string | null
      run_started_at: string | null
    }>
  }

  return body.notifications
    .filter((n) => n.match_key === match.match_key)
    .map((n) => ({
      id: n.id,
      created_at: n.created_at,
      match_key: n.match_key!,
      run_started_at: n.run_started_at,
    }))
}

// ============================================================================
// Auto-resolve POST
// ============================================================================

export async function postAutoResolve(
  opts: BackfillOptions,
  notificationId: string,
  matchedRun: GithubWorkflowRun
): Promise<{ ok: boolean; already_resolved: boolean }> {
  const url = `${opts.craneContextUrl}/admin/notifications/${notificationId}/auto-resolve`
  const res = await opts.fetch(url, {
    method: 'POST',
    headers: {
      'X-Admin-Key': opts.craneContextAdminKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      matched_run_id: matchedRun.id,
      matched_run_url: matchedRun.html_url,
      matched_run_started_at: matchedRun.run_started_at,
      reason: 'github_api_backfill',
    }),
  })

  if (!res.ok) {
    throw new Error(`auto-resolve HTTP ${res.status}: ${await res.text()}`)
  }

  return (await res.json()) as { ok: boolean; already_resolved: boolean }
}
