/**
 * Admin Endpoints - SS Engagement Provisioning
 *
 * Two endpoints supporting the SS client/engagement wiring (see
 * docs/process/new-engagement-setup-checklist.md):
 *
 *   POST /admin/provision-engagement
 *     Creates an Infisical folder for a client (engagement_slug omitted)
 *     or an engagement (engagement_slug provided). Idempotent: existing
 *     folders treated as success.
 *
 *   POST /admin/engagement-secrets
 *     Returns the secret env at /ss/clients/<client>/<engagement>/ to an
 *     authenticated launcher. Used by the crane CLI when it launches into
 *     an engagement context (avoids persisting per-engagement Infisical
 *     tokens anywhere — the worker proxies the read with its management
 *     token).
 *
 * Both require X-Admin-Key auth and INFISICAL_MANAGEMENT_TOKEN scoped to
 * /ss/clients/* (rotated quarterly).
 */

import venturesJson from '../../../../config/ventures.json'
import type { Env } from '../types'
import { HTTP_STATUS } from '../constants'
import { errorResponse, successResponse, generateCorrelationId } from '../utils'
import { verifyAdminKey } from './admin-shared'

// ============================================================================
// Constants
// ============================================================================

const INFISICAL_API_BASE = 'https://app.infisical.com/api'
const INFISICAL_WORKSPACE_ID = '2da2895e-aba2-4faf-a65a-b86e1a7aa2cb'
const INFISICAL_ENVIRONMENT = 'prod'
const SLUG_REGEX = /^[a-z][a-z0-9-]{1,31}$/

// ============================================================================
// Types
// ============================================================================

interface ProvisionEngagementRequest {
  client_slug: string
  engagement_slug?: string
}

interface EngagementSecretsRequest {
  client_slug: string
  engagement_slug: string
}

interface VenturesClient {
  slug: string
  engagements?: Array<{ slug: string }>
}

interface VenturesVenture {
  code: string
  clients?: VenturesClient[]
}

// ============================================================================
// Helpers
// ============================================================================

function buildInfisicalPath(client: string, engagement?: string): string {
  return engagement ? `/ss/clients/${client}/${engagement}` : `/ss/clients/${client}`
}

function findClient(clientSlug: string): VenturesClient | null {
  const ss = (venturesJson.ventures as VenturesVenture[]).find((v) => v.code === 'ss')
  if (!ss?.clients) return null
  return ss.clients.find((c) => c.slug === clientSlug) ?? null
}

function clientHasEngagement(client: VenturesClient, engagementSlug: string): boolean {
  return (client.engagements ?? []).some((e) => e.slug === engagementSlug)
}

/**
 * Create an Infisical folder. Idempotent: existing folders return success.
 *
 * Infisical's folder API treats path as the parent and name as the leaf.
 * We split the requested path accordingly: /ss/clients/acme/website ->
 * parent=/ss/clients/acme, name=website.
 */
async function createInfisicalFolder(
  fullPath: string,
  token: string,
  correlationId: string
): Promise<{ ok: true } | { ok: false; status: number; body: string }> {
  const segments = fullPath.split('/').filter((s) => s.length > 0)
  const name = segments[segments.length - 1]
  const parent = '/' + segments.slice(0, -1).join('/')

  const response = await fetch(`${INFISICAL_API_BASE}/v1/folders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      workspaceId: INFISICAL_WORKSPACE_ID,
      environment: INFISICAL_ENVIRONMENT,
      path: parent,
      name,
    }),
  })

  if (response.ok) return { ok: true }

  const body = await response.text()

  // Infisical returns 400/409 with a "folder already exists" message for
  // duplicate folder creation. Treat both as idempotent success.
  if (
    response.status === HTTP_STATUS.CONFLICT ||
    (response.status === HTTP_STATUS.BAD_REQUEST && /already exists/i.test(body))
  ) {
    console.log('[infisical-folders] Folder already exists, treating as success', {
      correlationId,
      path: fullPath,
    })
    return { ok: true }
  }

  return { ok: false, status: response.status, body }
}

/**
 * Fetch raw secrets at an Infisical path using the management token.
 */
async function fetchInfisicalSecrets(
  path: string,
  token: string
): Promise<
  | { ok: true; secrets: Array<{ key: string; value: string }> }
  | {
      ok: false
      status: number
      body: string
    }
> {
  const url = new URL(`${INFISICAL_API_BASE}/v3/secrets/raw`)
  url.searchParams.set('workspaceId', INFISICAL_WORKSPACE_ID)
  url.searchParams.set('environment', INFISICAL_ENVIRONMENT)
  url.searchParams.set('secretPath', path)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    return { ok: false, status: response.status, body: await response.text() }
  }

  const data = (await response.json()) as {
    secrets: Array<{ secretKey: string; secretValue: string }>
  }
  return {
    ok: true,
    secrets: data.secrets.map((s) => ({ key: s.secretKey, value: s.secretValue })),
  }
}

// ============================================================================
// POST /admin/provision-engagement
// ============================================================================

export async function handleProvisionEngagement(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()

  if (!(await verifyAdminKey(request, env))) {
    return errorResponse(
      'Unauthorized - Invalid admin key',
      HTTP_STATUS.UNAUTHORIZED,
      correlationId
    )
  }

  if (!env.INFISICAL_MANAGEMENT_TOKEN) {
    return errorResponse('INFISICAL_MANAGEMENT_TOKEN not configured', 503, correlationId)
  }

  let body: ProvisionEngagementRequest
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid JSON body', HTTP_STATUS.BAD_REQUEST, correlationId)
  }

  if (!body.client_slug || !SLUG_REGEX.test(body.client_slug)) {
    return errorResponse(
      'Invalid client_slug (must match ^[a-z][a-z0-9-]{1,31}$)',
      HTTP_STATUS.BAD_REQUEST,
      correlationId
    )
  }

  if (body.engagement_slug !== undefined && !SLUG_REGEX.test(body.engagement_slug)) {
    return errorResponse(
      'Invalid engagement_slug (must match ^[a-z][a-z0-9-]{1,31}$)',
      HTTP_STATUS.BAD_REQUEST,
      correlationId
    )
  }

  const path = buildInfisicalPath(body.client_slug, body.engagement_slug)

  // If creating an engagement folder, the parent client folder must exist
  // first. Create it idempotently before the engagement.
  if (body.engagement_slug) {
    const parentResult = await createInfisicalFolder(
      buildInfisicalPath(body.client_slug),
      env.INFISICAL_MANAGEMENT_TOKEN,
      correlationId
    )
    if (!parentResult.ok) {
      console.error('[POST /admin/provision-engagement] parent folder failed', {
        correlationId,
        status: parentResult.status,
        body: parentResult.body,
      })
      return errorResponse(
        `Failed to create parent folder: ${parentResult.status}`,
        HTTP_STATUS.INTERNAL_ERROR,
        correlationId,
        { upstream_body: parentResult.body }
      )
    }
  }

  const result = await createInfisicalFolder(path, env.INFISICAL_MANAGEMENT_TOKEN, correlationId)

  if (!result.ok) {
    console.error('[POST /admin/provision-engagement] folder create failed', {
      correlationId,
      status: result.status,
      body: result.body,
    })
    return errorResponse(
      `Failed to create folder: ${result.status}`,
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId,
      { upstream_body: result.body }
    )
  }

  return successResponse({ success: true, infisical_path: path }, HTTP_STATUS.OK, correlationId)
}

// ============================================================================
// POST /admin/engagement-secrets
// ============================================================================

export async function handleEngagementSecrets(request: Request, env: Env): Promise<Response> {
  const correlationId = generateCorrelationId()

  if (!(await verifyAdminKey(request, env))) {
    return errorResponse(
      'Unauthorized - Invalid admin key',
      HTTP_STATUS.UNAUTHORIZED,
      correlationId
    )
  }

  if (!env.INFISICAL_MANAGEMENT_TOKEN) {
    return errorResponse('INFISICAL_MANAGEMENT_TOKEN not configured', 503, correlationId)
  }

  let body: EngagementSecretsRequest
  try {
    body = await request.json()
  } catch {
    return errorResponse('Invalid JSON body', HTTP_STATUS.BAD_REQUEST, correlationId)
  }

  if (!body.client_slug || !SLUG_REGEX.test(body.client_slug)) {
    return errorResponse('Invalid client_slug', HTTP_STATUS.BAD_REQUEST, correlationId)
  }

  if (!body.engagement_slug || !SLUG_REGEX.test(body.engagement_slug)) {
    return errorResponse('Invalid engagement_slug', HTTP_STATUS.BAD_REQUEST, correlationId)
  }

  // Validate against ventures.json — unknown client/engagement → 404.
  // This prevents the secrets-proxy from being used as a free path-probe
  // against arbitrary Infisical paths.
  const client = findClient(body.client_slug)
  if (!client) {
    return errorResponse(
      `Unknown client: ${body.client_slug}`,
      HTTP_STATUS.NOT_FOUND,
      correlationId
    )
  }
  if (!clientHasEngagement(client, body.engagement_slug)) {
    return errorResponse(
      `Unknown engagement: ${body.client_slug}/${body.engagement_slug}`,
      HTTP_STATUS.NOT_FOUND,
      correlationId
    )
  }

  const path = buildInfisicalPath(body.client_slug, body.engagement_slug)
  const result = await fetchInfisicalSecrets(path, env.INFISICAL_MANAGEMENT_TOKEN)

  if (!result.ok) {
    console.error('[POST /admin/engagement-secrets] fetch failed', {
      correlationId,
      status: result.status,
      body: result.body,
    })
    return errorResponse(
      `Failed to fetch secrets: ${result.status}`,
      HTTP_STATUS.INTERNAL_ERROR,
      correlationId
    )
  }

  return successResponse(
    { success: true, infisical_path: path, secrets: result.secrets },
    HTTP_STATUS.OK,
    correlationId
  )
}
