/**
 * Crane Context Worker - Route Dispatchers
 *
 * Splits the main fetch handler into domain-specific routing segments.
 * Each exported function returns a Response or null (no match). The main
 * fetch calls them in order and returns the first non-null result.
 *
 * Dispatch tables keep cyclomatic complexity ≤ 15 per function despite
 * the large number of routes. Each table maps `"METHOD /path"` to a
 * handler factory that receives (request, env) and returns a Response.
 */

import type { Env } from './types'
import {
  handleStartOfSession,
  handleEndOfSession,
  handleUpdate,
  handleHeartbeat,
  handleCheckpoint,
  handleGetCheckpoints,
  handleGetSiblings,
} from './endpoints/sessions'
import { handlePostSessionActivity, matchActivityRoute } from './endpoints/session-activity'
import {
  handleGetActiveSessions,
  handleGetLatestHandoff,
  handleQueryHandoffs,
  handleUpdateHandoffStatus,
  handleListDocsPublic,
  handleGetDoc,
  handleGetVentures,
  handleDocAudit,
  handleGetSessionHistory,
  handleGetPriorSession,
} from './endpoints/queries'
import { handleUploadDoc, handleListDocs, handleDeleteDoc } from './endpoints/admin-docs'
import {
  handleUploadScript,
  handleListScripts,
  handleDeleteScript,
} from './endpoints/admin-scripts'
import {
  handleCreateDocRequirement,
  handleListDocRequirements,
  handleDeleteDocRequirement,
} from './endpoints/admin-doc-requirements'
import {
  handleRegisterMachine,
  handleListMachines,
  handleMachineHeartbeat,
  handleSshMeshConfig,
} from './endpoints/machines'
import {
  handleCreateNote,
  handleListNotes,
  handleGetNote,
  handleUpdateNote,
  handleArchiveNote,
} from './endpoints/notes'
import {
  handleGetScheduleBriefing,
  handleGetScheduleItems,
  handleLinkScheduleCalendar,
  handleCompleteScheduleItem,
} from './endpoints/schedule'
import { handleUpsertWorkDay } from './endpoints/work-days'
import {
  handleGetPlannedEvents,
  handleCreatePlannedEvent,
  handleUpdatePlannedEvent,
  handleDeletePlannedEvents,
} from './endpoints/planned-events'
import {
  handleIngestNotification,
  handleListNotifications,
  handleUpdateNotificationStatus,
  handleNotificationCounts,
  handleNotificationOldest,
  handleBranchDeleted,
} from './endpoints/notifications'
import {
  handleListPendingMatches,
  handleAdminAutoResolveNotification,
  handleAcquireBackfillLock,
  handleReleaseBackfillLock,
  handleBackfillAutoResolve,
  handleNonMainCleanup,
} from './endpoints/admin-notifications'
import {
  handleListDeployHeartbeats,
  handleObserveCommit,
  handleObserveRun,
  handleSuppressHeartbeat,
  handleUnsuppressHeartbeat,
  handleSetColdThreshold,
  handleSeedHeartbeat,
  handleObserveGithubWorkflowRun,
  handleObserveGithubPush,
} from './endpoints/deploy-heartbeats'
import {
  handleIngestFleetHealth,
  handleListFleetHealthFindings,
  handleGetFleetHealthSummary,
  handleResolveFleetHealthFinding,
} from './endpoints/fleet-health'
import { handleRecordSkillInvocation, handleGetSkillUsage } from './endpoints/skill-invocations'
import {
  handleRecordMemoryInvocation,
  handleGetMemoryInvocations,
  handleGetAllMemoryInvocations,
} from './endpoints/memory-invocations'
import {
  handleRecordVerification,
  handleGetVerificationOrigin,
  handleGetVerificationSessionCount,
  handleGetSessionVerifications,
  handleVerifyLookup,
} from './endpoints/verify-ledger'
import { handleVerifyAudit } from './endpoints/verify-audit'
import { handleGetVersion } from './endpoints/version'
import { handleVerifySchema } from './endpoints/admin-verify'
import { handleSecretHash } from './endpoints/admin-secret-hash'
import {
  handleProvisionEngagement,
  handleEngagementSecrets,
} from './endpoints/admin-provision-engagement'
import {
  handleSmokeTestPurge,
  handleSmokeTestIngest,
  handleSmokeTestList,
} from './endpoints/smoke-test'
import { runReconciliation } from './deploy-heartbeats-reconcile'
import { verifyAdminKey } from './endpoints/admin-shared'
import { handleMcpRequest } from './mcp'
import { errorResponse, jsonResponse } from './utils'
import { buildRequestContext, isResponse } from './auth'
import { HTTP_STATUS } from './constants'

// ============================================================================
// Types
// ============================================================================

type Handler = (request: Request, env: Env) => Promise<Response> | Response

/** Dispatch table for exact-match routes keyed by "METHOD /path". */
type ExactTable = Record<string, Handler>

/** Pattern route: [regex, handler factory receiving captured groups]. */
type PatternRoute = [
  RegExp,
  (groups: string[], request: Request, env: Env) => Promise<Response> | Response,
]

/** Dispatch an exact-match table. Returns null on miss. */
async function dispatchExact(
  key: string,
  table: ExactTable,
  request: Request,
  env: Env
): Promise<Response | null> {
  const handler = table[key]
  return handler ? handler(request, env) : null
}

/** Dispatch a list of regex-based pattern routes. Returns null on miss. */
async function dispatchPattern(
  method: string,
  pathname: string,
  routes: PatternRoute[],
  request: Request,
  env: Env
): Promise<Response | null> {
  for (const [re, handler] of routes) {
    const m = pathname.match(re)
    if (m) return handler(m.slice(1), request, env)
  }
  // Check method suffix so the for loop above doesn't mix methods
  void method
  return null
}

// ============================================================================
// Public / utility routes (no auth)
// ============================================================================

const PUBLIC_TABLE: ExactTable = {
  'GET /version': (req, env) => handleGetVersion(req, env),
  'GET /ventures': () => handleGetVentures(),
  'POST /mcp': (req, env) => handleMcpRequest(req, env),
}

export async function routePublic(
  pathname: string,
  method: string,
  request: Request,
  env: Env
): Promise<Response | null> {
  if (pathname === '/health' && method === 'GET') {
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'crane-context',
        timestamp: new Date().toISOString(),
      }),
      { status: HTTP_STATUS.OK, headers: { 'Content-Type': 'application/json' } }
    )
  }
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: HTTP_STATUS.NO_CONTENT,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Relay-Key, Idempotency-Key',
        'Access-Control-Max-Age': '86400',
      },
    })
  }
  return dispatchExact(`${method} ${pathname}`, PUBLIC_TABLE, request, env)
}

// ============================================================================
// Session lifecycle routes
// ============================================================================

const SESSION_EXACT: ExactTable = {
  'POST /update': (req, env) => handleUpdate(req, env),
  'POST /heartbeat': (req, env) => handleHeartbeat(req, env),
  'POST /checkpoint': (req, env) => handleCheckpoint(req, env),
  'GET /checkpoints': (req, env) => handleGetCheckpoints(req, env),
  'GET /siblings': (req, env) => handleGetSiblings(req, env),
  'GET /sessions/prior': (req, env) => handleGetPriorSession(req, env),
  'GET /sessions/history': (req, env) => handleGetSessionHistory(req, env),
}

export async function routeSessions(
  pathname: string,
  method: string,
  request: Request,
  env: Env
): Promise<Response | null> {
  if ((pathname === '/sos' || pathname === '/sod') && method === 'POST')
    return handleStartOfSession(request, env)
  if ((pathname === '/eos' || pathname === '/eod') && method === 'POST')
    return handleEndOfSession(request, env)

  const exact = await dispatchExact(`${method} ${pathname}`, SESSION_EXACT, request, env)
  if (exact) return exact

  if (method === 'POST') {
    const activitySessionId = matchActivityRoute(pathname)
    if (activitySessionId) return handlePostSessionActivity(request, env, activitySessionId)
  }
  return null
}

// ============================================================================
// Query / public data routes
// ============================================================================

const QUERY_EXACT: ExactTable = {
  'GET /active': (req, env) => handleGetActiveSessions(req, env),
  'GET /handoffs/latest': (req, env) => handleGetLatestHandoff(req, env),
  'GET /handoffs': (req, env) => handleQueryHandoffs(req, env),
  'GET /docs': (req, env) => handleListDocsPublic(req, env),
  'GET /docs/audit': (req, env) => handleDocAudit(req, env),
}

const QUERY_PATTERNS: PatternRoute[] = [
  [/^\/handoffs\/([^/]+)\/status$/, ([id], req, env) => handleUpdateHandoffStatus(req, env, id)],
]

export async function routeQueries(
  pathname: string,
  method: string,
  request: Request,
  env: Env
): Promise<Response | null> {
  const exact = await dispatchExact(`${method} ${pathname}`, QUERY_EXACT, request, env)
  if (exact) return exact

  if (method === 'POST') {
    const r = await dispatchPattern(method, pathname, QUERY_PATTERNS, request, env)
    if (r) return r
  }

  if (pathname.startsWith('/docs/') && method === 'GET') {
    const parts = pathname.split('/')
    if (parts.length === 4) return handleGetDoc(request, env, parts[2], parts[3])
    return errorResponse('Invalid docs path', HTTP_STATUS.BAD_REQUEST)
  }

  if (pathname === '/config/memory-gate' && method === 'GET') {
    const ctx = await buildRequestContext(request, env)
    if (isResponse(ctx)) return ctx
    const gate = env.MEMORY_INJECTION_GATE || 'both'
    return jsonResponse(
      { gate, correlation_id: ctx.correlationId },
      HTTP_STATUS.OK,
      ctx.correlationId
    )
  }

  return null
}

// ============================================================================
// Notifications routes
// ============================================================================

const NOTIF_EXACT: ExactTable = {
  'POST /notifications/ingest': (req, env) => handleIngestNotification(req, env),
  'GET /notifications/counts': (req, env) => handleNotificationCounts(req, env),
  'GET /notifications/oldest': (req, env) => handleNotificationOldest(req, env),
  'POST /notifications/branch-deleted': (req, env) => handleBranchDeleted(req, env),
  'GET /notifications': (req, env) => handleListNotifications(req, env),
}

const NOTIF_PATTERNS: PatternRoute[] = [
  [
    /^\/notifications\/([^/]+)\/status$/,
    ([id], req, env) => handleUpdateNotificationStatus(req, env, id),
  ],
]

export async function routeNotifications(
  pathname: string,
  method: string,
  request: Request,
  env: Env
): Promise<Response | null> {
  const exact = await dispatchExact(`${method} ${pathname}`, NOTIF_EXACT, request, env)
  if (exact) return exact
  if (method === 'POST') return dispatchPattern(method, pathname, NOTIF_PATTERNS, request, env)
  return null
}

// ============================================================================
// Notes, schedule, work-day, planned-events routes
// ============================================================================

const CONTENT_EXACT: ExactTable = {
  'POST /notes': (req, env) => handleCreateNote(req, env),
  'GET /notes': (req, env) => handleListNotes(req, env),
  'GET /schedule/briefing': (req, env) => handleGetScheduleBriefing(req, env),
  'GET /schedule/items': (req, env) => handleGetScheduleItems(req, env),
  'POST /work-day': (req, env) => handleUpsertWorkDay(req, env),
  'GET /planned-events': (req, env) => handleGetPlannedEvents(req, env),
  'POST /planned-events': (req, env) => handleCreatePlannedEvent(req, env),
  'DELETE /planned-events': (req, env) => handleDeletePlannedEvents(req, env),
}

const CONTENT_PATTERNS: PatternRoute[] = [
  [/^\/notes\/([^/]+)\/update$/, ([id], req, env) => handleUpdateNote(req, env, id)],
  [/^\/notes\/([^/]+)\/archive$/, ([id], req, env) => handleArchiveNote(req, env, id)],
  [/^\/notes\/([^/]+)$/, ([id], req, env) => handleGetNote(req, env, id)],
  [
    /^\/schedule\/([^/]+)\/link-calendar$/,
    ([name], req, env) => handleLinkScheduleCalendar(req, env, name),
  ],
  [
    /^\/schedule\/([^/]+)\/complete$/,
    ([name], req, env) => handleCompleteScheduleItem(req, env, name),
  ],
  [/^\/planned-events\/([^/]+)$/, ([id], req, env) => handleUpdatePlannedEvent(req, env, id)],
]

export async function routeContent(
  pathname: string,
  method: string,
  request: Request,
  env: Env
): Promise<Response | null> {
  const exact = await dispatchExact(`${method} ${pathname}`, CONTENT_EXACT, request, env)
  if (exact) return exact
  return dispatchPattern(method, pathname, CONTENT_PATTERNS, request, env)
}

// ============================================================================
// Deploy heartbeats routes
// ============================================================================

const HEARTBEAT_EXACT: ExactTable = {
  'GET /deploy-heartbeats': (req, env) => handleListDeployHeartbeats(req, env),
  'POST /deploy-heartbeats/observe-commit': (req, env) => handleObserveCommit(req, env),
  'POST /deploy-heartbeats/observe-run': (req, env) => handleObserveRun(req, env),
  'POST /deploy-heartbeats/suppress': (req, env) => handleSuppressHeartbeat(req, env),
  'POST /deploy-heartbeats/unsuppress': (req, env) => handleUnsuppressHeartbeat(req, env),
  'POST /deploy-heartbeats/threshold': (req, env) => handleSetColdThreshold(req, env),
  'POST /deploy-heartbeats/observe-github-workflow-run': (req, env) =>
    handleObserveGithubWorkflowRun(req, env),
  'POST /deploy-heartbeats/observe-github-push': (req, env) => handleObserveGithubPush(req, env),
  'POST /deploy-heartbeats/seed': (req, env) => handleSeedHeartbeat(req, env),
}

export async function routeDeployHeartbeats(
  pathname: string,
  method: string,
  request: Request,
  env: Env
): Promise<Response | null> {
  return dispatchExact(`${method} ${pathname}`, HEARTBEAT_EXACT, request, env)
}

// ============================================================================
// Fleet health, machines, telemetry, verify ledger routes
// ============================================================================

const INFRA_EXACT: ExactTable = {
  'POST /machines/register': (req, env) => handleRegisterMachine(req, env),
  'GET /machines/ssh-mesh-config': (req, env) => handleSshMeshConfig(req, env),
  'GET /machines': (req, env) => handleListMachines(req, env),
  'POST /admin/fleet-health/ingest': (req, env) => handleIngestFleetHealth(req, env),
  'GET /fleet-health/findings': (req, env) => handleListFleetHealthFindings(req, env),
  'GET /fleet-health/summary': (req, env) => handleGetFleetHealthSummary(req, env),
  'POST /skills/invocations': (req, env) => handleRecordSkillInvocation(req, env),
  'GET /skills/usage': (req, env) => handleGetSkillUsage(req, env),
  'POST /memory/invocations': (req, env) => handleRecordMemoryInvocation(req, env),
  'GET /memory/invocations/all': (req, env) => handleGetAllMemoryInvocations(req, env),
  'GET /memory/invocations': (req, env) => handleGetMemoryInvocations(req, env),
  'POST /verify': (req, env) => handleRecordVerification(req, env),
  'GET /verify/origin': (req, env) => handleGetVerificationOrigin(req, env),
  'GET /verify/session-count': (req, env) => handleGetVerificationSessionCount(req, env),
  'GET /verify/session-verifications': (req, env) => handleGetSessionVerifications(req, env),
  'GET /verify/lookup': (req, env) => handleVerifyLookup(req, env),
  'GET /verify/audit': (req, env) => handleVerifyAudit(req, env),
}

const INFRA_PATTERNS: PatternRoute[] = [
  [/^\/machines\/([^/]+)\/heartbeat$/, ([id], req, env) => handleMachineHeartbeat(req, env, id)],
  [
    /^\/fleet-health\/findings\/([^/]+)\/resolve$/,
    ([id], req, env) => handleResolveFleetHealthFinding(req, env, id),
  ],
]

export async function routeInfra(
  pathname: string,
  method: string,
  request: Request,
  env: Env
): Promise<Response | null> {
  const exact = await dispatchExact(`${method} ${pathname}`, INFRA_EXACT, request, env)
  if (exact) return exact
  return dispatchPattern(method, pathname, INFRA_PATTERNS, request, env)
}

// ============================================================================
// Admin routes (split into two segments to stay under complexity limit)
// ============================================================================

const ADMIN_EXACT_A: ExactTable = {
  'GET /admin/verify-schema': (req, env) => handleVerifySchema(req, env),
  'GET /admin/secret-hash': (req, env) => handleSecretHash(req, env),
  'POST /smoke-test/purge': (req, env) => handleSmokeTestPurge(req, env),
  'POST /smoke-test/ingest': (req, env) => handleSmokeTestIngest(req, env),
  'GET /smoke-test/notifications': (req, env) => handleSmokeTestList(req, env),
  'POST /admin/docs': (req, env) => handleUploadDoc(req, env),
  'GET /admin/docs': (req, env) => handleListDocs(req, env),
  'POST /admin/doc-requirements': (req, env) => handleCreateDocRequirement(req, env),
  'GET /admin/doc-requirements': (req, env) => handleListDocRequirements(req, env),
  'POST /admin/scripts': (req, env) => handleUploadScript(req, env),
  'GET /admin/scripts': (req, env) => handleListScripts(req, env),
  'POST /admin/provision-engagement': (req, env) => handleProvisionEngagement(req, env),
  'POST /admin/engagement-secrets': (req, env) => handleEngagementSecrets(req, env),
}

const ADMIN_EXACT_B: ExactTable = {
  'GET /admin/notifications/pending-matches': (req, env) => handleListPendingMatches(req, env),
  'POST /admin/notifications/backfill-lock/acquire': (req, env) =>
    handleAcquireBackfillLock(req, env),
  'POST /admin/notifications/backfill-lock/release': (req, env) =>
    handleReleaseBackfillLock(req, env),
  'POST /admin/notifications/backfill-auto-resolve': (req, env) =>
    handleBackfillAutoResolve(req, env),
  'POST /admin/notifications/non-main-cleanup': (req, env) => handleNonMainCleanup(req, env),
}

/** Handle DELETE /admin/docs/:scope/:name and similar parameterised admin paths. */
async function routeAdminParametric(
  pathname: string,
  method: string,
  request: Request,
  env: Env
): Promise<Response | null> {
  if (pathname.startsWith('/admin/docs/') && method === 'DELETE') {
    const parts = pathname.split('/')
    if (parts.length === 5) return handleDeleteDoc(request, env, parts[3], parts[4])
    return errorResponse('Invalid DELETE path', HTTP_STATUS.BAD_REQUEST)
  }
  if (pathname.startsWith('/admin/doc-requirements/') && method === 'DELETE') {
    const parts = pathname.split('/')
    if (parts.length === 4) return handleDeleteDocRequirement(request, env, parts[3])
    return errorResponse('Invalid DELETE path', HTTP_STATUS.BAD_REQUEST)
  }
  if (pathname.startsWith('/admin/scripts/') && method === 'DELETE') {
    const parts = pathname.split('/')
    if (parts.length === 5) return handleDeleteScript(request, env, parts[3], parts[4])
    return errorResponse('Invalid DELETE path', HTTP_STATUS.BAD_REQUEST)
  }
  const autoResolveMatch = pathname.match(/^\/admin\/notifications\/([^/]+)\/auto-resolve$/)
  if (autoResolveMatch && method === 'POST')
    return handleAdminAutoResolveNotification(request, env, autoResolveMatch[1])
  return null
}

/** Handle admin deploy-heartbeat reconcile and dynamic imports. */
async function routeAdminDynamic(
  pathname: string,
  method: string,
  request: Request,
  env: Env
): Promise<Response | null> {
  if (pathname === '/admin/deploy-heartbeats/reconcile' && method === 'POST') {
    if (!(await verifyAdminKey(request, env)))
      return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
    const result = await runReconciliation(env)
    return new Response(JSON.stringify(result), {
      status: HTTP_STATUS.OK,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  if (pathname === '/admin/memory/curate' && method === 'POST') {
    const { handleAdminMemoryCurate } = await import('./endpoints/admin-memory-curate')
    return handleAdminMemoryCurate(request, env)
  }
  if (pathname === '/admin/sessions/ingest' && method === 'POST') {
    const { handleAdminSessionsIngest } = await import('./endpoints/admin-sessions-ingest')
    return handleAdminSessionsIngest(request, env)
  }
  return null
}

export async function routeAdmin(
  pathname: string,
  method: string,
  request: Request,
  env: Env
): Promise<Response | null> {
  const key = `${method} ${pathname}`
  const fromA = await dispatchExact(key, ADMIN_EXACT_A, request, env)
  if (fromA) return fromA
  const fromB = await dispatchExact(key, ADMIN_EXACT_B, request, env)
  if (fromB) return fromB
  const parametric = await routeAdminParametric(pathname, method, request, env)
  if (parametric) return parametric
  return routeAdminDynamic(pathname, method, request, env)
}
