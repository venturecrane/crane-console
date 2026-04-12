/**
 * Crane Watch Worker
 *
 * Webhook gateway for Venture Crane.
 * Receives GitHub App webhooks for CI/CD event forwarding and deploy
 * heartbeat observation, and Vercel webhooks for deployment failure
 * notifications.
 */

import { BUILD_INFO } from './generated/build-info'

// ============================================================================
// TYPES
// ============================================================================

interface Env {
  GH_WEBHOOK_SECRET: string
  CONTEXT_RELAY_KEY?: string
  CRANE_CONTEXT_URL?: string
  CRANE_CONTEXT?: Fetcher
  VERCEL_WEBHOOK_SECRET?: string
  ENVIRONMENT?: string
}

// ============================================================================
// VERSION ENDPOINT (Plan v3.1 §D.1)
// ============================================================================

// Cloudflare Workers forbid wall-clock access at module load (returns
// 1970-01-01). Capture lazily on the first request instead.
let COLD_START_AT: string | null = null

function handleVersion(env: Env): Response {
  if (COLD_START_AT === null) {
    COLD_START_AT = new Date().toISOString()
  }
  const body = {
    service: BUILD_INFO.service,
    commit: BUILD_INFO.commit,
    commit_short: BUILD_INFO.commit_short,
    build_timestamp: BUILD_INFO.build_timestamp,
    deployed_at: COLD_START_AT,
    schema_hash: null,
    schema_version: null,
    migrations_applied: [] as string[],
    features_enabled: {} as Record<string, boolean>,
    environment: env.ENVIRONMENT || 'unknown',
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

// ============================================================================
// TIMING-SAFE COMPARISON
// ============================================================================

function timingSafeStringEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  if (aBytes.byteLength !== bBytes.byteLength) return false
  return crypto.subtle.timingSafeEqual(aBytes, bBytes)
}

// ============================================================================
// GITHUB SIGNATURE VALIDATION
// ============================================================================

export async function validateGitHubSignature(
  body: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    return false
  }

  // GitHub sends signature as "sha256=<hash>"
  const expectedSig = signature.replace('sha256=', '')

  // Compute HMAC-SHA256
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const computedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return timingSafeStringEqual(computedSig, expectedSig)
}

// ============================================================================
// CI/CD NOTIFICATION FORWARDING
// ============================================================================

const CI_EVENT_TYPES = ['workflow_run', 'check_suite', 'check_run']

async function forwardToNotifications(
  env: Env,
  source: string,
  eventType: string,
  deliveryId: string,
  payload: unknown
): Promise<void> {
  const relayKey = env.CONTEXT_RELAY_KEY

  if (!relayKey) {
    console.error('CONTEXT_RELAY_KEY not configured, skipping notification forwarding')
    return
  }

  // Prefer Service Binding (direct Worker-to-Worker), fall back to public URL
  const fetcher = env.CRANE_CONTEXT || null
  const contextUrl = env.CRANE_CONTEXT_URL

  if (!fetcher && !contextUrl) {
    console.error(
      'Neither CRANE_CONTEXT service binding nor CRANE_CONTEXT_URL configured, skipping notification forwarding'
    )
    return
  }

  try {
    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': relayKey,
      },
      body: JSON.stringify({
        source,
        event_type: eventType,
        delivery_id: deliveryId,
        payload,
      }),
    }

    const response = fetcher
      ? await fetcher.fetch('https://crane-context/notifications/ingest', requestInit)
      : await fetch(`${contextUrl}/notifications/ingest`, requestInit)

    if (!response.ok) {
      const text = await response.text()
      console.error(`Notification forwarding failed: ${response.status} ${text}`)
    }
  } catch (err) {
    console.error('Notification forwarding error:', err)
  }
}

// ============================================================================
// DEPLOY HEARTBEAT FORWARDING
// ============================================================================
//
// Forwards `push` and `workflow_run.completed` events to the deploy-heartbeats
// observer endpoints in crane-context. The two pipelines are independent of
// notification forwarding: a push event has no notification side-effect, and
// a workflow_run produces both a notification (failure path) AND a heartbeat
// observation (success or failure).
//
// The endpoint is tolerant of unknown ventures and non-default branches -
// it returns 200 with `ignored: true` rather than erroring.

async function forwardToDeployHeartbeats(
  env: Env,
  kind: 'push' | 'workflow-run',
  payload: unknown
): Promise<void> {
  const relayKey = env.CONTEXT_RELAY_KEY
  if (!relayKey) {
    console.error('CONTEXT_RELAY_KEY not configured, skipping heartbeat forwarding')
    return
  }

  const fetcher = env.CRANE_CONTEXT || null
  const contextUrl = env.CRANE_CONTEXT_URL
  if (!fetcher && !contextUrl) {
    console.error(
      'Neither CRANE_CONTEXT service binding nor CRANE_CONTEXT_URL configured, skipping heartbeat forwarding'
    )
    return
  }

  const path =
    kind === 'push'
      ? '/deploy-heartbeats/observe-github-push'
      : '/deploy-heartbeats/observe-github-workflow-run'

  try {
    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': relayKey,
      },
      body: JSON.stringify(payload),
    }

    const response = fetcher
      ? await fetcher.fetch(`https://crane-context${path}`, requestInit)
      : await fetch(`${contextUrl}${path}`, requestInit)

    if (!response.ok) {
      const text = await response.text()
      console.error(`Heartbeat forwarding (${kind}) failed: ${response.status} ${text}`)
    }
  } catch (err) {
    console.error(`Heartbeat forwarding (${kind}) error:`, err)
  }
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

async function handleGitHubWebhook(
  req: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Validate signature
  const bodyText = await req.text()
  const signature = req.headers.get('X-Hub-Signature-256')

  const isValid = await validateGitHubSignature(bodyText, signature, env.GH_WEBHOOK_SECRET)
  if (!isValid) {
    console.error('Invalid webhook signature')
    return new Response('Invalid signature', { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(bodyText)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  // Short-circuit CI events
  const eventType = req.headers.get('X-GitHub-Event')
  if (eventType && CI_EVENT_TYPES.includes(eventType)) {
    const deliveryId = req.headers.get('X-GitHub-Delivery') || crypto.randomUUID()
    ctx.waitUntil(forwardToNotifications(env, 'github', eventType, deliveryId, payload))
    // Also feed the deploy-heartbeats observer for workflow_run events.
    if (eventType === 'workflow_run') {
      ctx.waitUntil(forwardToDeployHeartbeats(env, 'workflow-run', payload))
    }
    return new Response('OK - CI event forwarded', { status: 200 })
  }

  // Push events feed the deploy-heartbeats commit-without-deploy detector.
  if (eventType === 'push') {
    ctx.waitUntil(forwardToDeployHeartbeats(env, 'push', payload))
    return new Response('OK - push event forwarded', { status: 200 })
  }

  // All other events (including issues) are acknowledged but not processed.
  // QA grading was removed - issues events are no longer classified.
  return new Response('OK - event acknowledged', { status: 200 })
}

// ============================================================================
// VERCEL WEBHOOK HANDLER
// ============================================================================

async function validateVercelSignature(
  bodyText: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(bodyText))
  const computedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return timingSafeStringEqual(computedSig, signature)
}

async function handleVercelWebhook(
  req: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (!env.VERCEL_WEBHOOK_SECRET) {
    console.error('VERCEL_WEBHOOK_SECRET not configured')
    return new Response('Webhook secret not configured', { status: 500 })
  }

  const bodyText = await req.text()
  const signature = req.headers.get('x-vercel-signature')

  const isValid = await validateVercelSignature(bodyText, signature, env.VERCEL_WEBHOOK_SECRET)
  if (!isValid) {
    console.error('Invalid Vercel webhook signature')
    return new Response('Invalid signature', { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(bodyText)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const webhookType = payload.type as string
  if (!webhookType) {
    return new Response('OK - no event type', { status: 200 })
  }

  // Only forward deployment error/canceled events
  if (webhookType === 'deployment.error' || webhookType === 'deployment.canceled') {
    const deliveryId = req.headers.get('x-vercel-delivery') || crypto.randomUUID()
    ctx.waitUntil(
      forwardToNotifications(env, 'vercel', webhookType, deliveryId, payload.payload || payload)
    )
  }

  return jsonResponse({ ok: true, event: webhookType })
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

function handleHealth(): Response {
  return jsonResponse({
    status: 'healthy',
    service: 'crane-watch',
    timestamp: new Date().toISOString(),
    version: '3.0.0',
  })
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Health check
    if (url.pathname === '/health' && request.method === 'GET') {
      return handleHealth()
    }

    // Version endpoint (Plan v3.1 §D.1 - public, no auth)
    if (url.pathname === '/version' && request.method === 'GET') {
      return handleVersion(env)
    }

    // GitHub webhook
    if (url.pathname === '/webhooks/github' && request.method === 'POST') {
      return handleGitHubWebhook(request, env, ctx)
    }

    // Vercel webhook
    if (url.pathname === '/webhooks/vercel' && request.method === 'POST') {
      return handleVercelWebhook(request, env, ctx)
    }

    // 404 for everything else
    return new Response('Not found', { status: 404 })
  },
}
