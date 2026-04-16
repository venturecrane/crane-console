/**
 * Crane Context Worker - Main Entry Point
 *
 * Cloudflare Worker for Crane session and handoff management.
 * Implements ADR 025 specification.
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
} from './endpoints/notifications'
import {
  handleListPendingMatches,
  handleAdminAutoResolveNotification,
  handleAcquireBackfillLock,
  handleReleaseBackfillLock,
  handleBackfillAutoResolve,
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
import { handleGetVersion } from './endpoints/version'
import { handleVerifySchema } from './endpoints/admin-verify'
import { handleSecretHash } from './endpoints/admin-secret-hash'
import {
  handleSmokeTestPurge,
  handleSmokeTestIngest,
  handleSmokeTestList,
} from './endpoints/smoke-test'
import { runReconciliation } from './deploy-heartbeats-reconcile'
import { verifyAdminKey } from './endpoints/admin-shared'
import { handleMcpRequest } from './mcp'
import { errorResponse } from './utils'
import { HTTP_STATUS } from './constants'

// ============================================================================
// Main Worker Export
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const { pathname, searchParams } = url
    const method = request.method

    console.log(`[${method}] ${pathname}`, {
      searchParams: Object.fromEntries(searchParams),
    })

    try {
      // ========================================================================
      // Health Check
      // ========================================================================

      if (pathname === '/health' && method === 'GET') {
        return new Response(
          JSON.stringify({
            status: 'healthy',
            service: 'crane-context',
            timestamp: new Date().toISOString(),
          }),
          {
            status: HTTP_STATUS.OK,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      }

      // ========================================================================
      // Version Endpoint (Plan v3.1 §D.1 — public, no auth)
      // ========================================================================

      if (pathname === '/version' && method === 'GET') {
        return await handleGetVersion(request, env)
      }

      // ========================================================================
      // Admin Verify Schema (Plan v3.1 §D.2 — X-Admin-Key)
      // ========================================================================

      if (pathname === '/admin/verify-schema' && method === 'GET') {
        return await handleVerifySchema(request, env)
      }

      if (pathname === '/admin/secret-hash' && method === 'GET') {
        return await handleSecretHash(request, env)
      }

      // ========================================================================
      // Smoke Test Endpoints (Plan v3.1 §D.5 / D-7 — staging-only)
      // ========================================================================

      if (pathname === '/smoke-test/purge' && method === 'POST') {
        return await handleSmokeTestPurge(request, env)
      }

      if (pathname === '/smoke-test/ingest' && method === 'POST') {
        return await handleSmokeTestIngest(request, env)
      }

      if (pathname === '/smoke-test/notifications' && method === 'GET') {
        return await handleSmokeTestList(request, env)
      }

      // ========================================================================
      // Deploy Heartbeats Reconciliation (Plan v3.1 §B.6 / #454)
      // ========================================================================
      //
      // Manual trigger for the reconciliation walk. Normally runs every
      // 6h via the scheduled trigger in wrangler.toml; this endpoint lets
      // operators force an immediate run.

      if (pathname === '/admin/deploy-heartbeats/reconcile' && method === 'POST') {
        if (!(await verifyAdminKey(request, env))) {
          return errorResponse('Unauthorized', HTTP_STATUS.UNAUTHORIZED)
        }
        const result = await runReconciliation(env)
        return new Response(JSON.stringify(result), {
          status: HTTP_STATUS.OK,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // ========================================================================
      // Session Lifecycle Endpoints
      // ========================================================================

      if ((pathname === '/sos' || pathname === '/sod') && method === 'POST') {
        return await handleStartOfSession(request, env)
      }

      if ((pathname === '/eos' || pathname === '/eod') && method === 'POST') {
        return await handleEndOfSession(request, env)
      }

      if (pathname === '/update' && method === 'POST') {
        return await handleUpdate(request, env)
      }

      if (pathname === '/heartbeat' && method === 'POST') {
        return await handleHeartbeat(request, env)
      }

      if (pathname === '/checkpoint' && method === 'POST') {
        return await handleCheckpoint(request, env)
      }

      if (pathname === '/checkpoints' && method === 'GET') {
        return await handleGetCheckpoints(request, env)
      }

      if (pathname === '/siblings' && method === 'GET') {
        return await handleGetSiblings(request, env)
      }

      // ========================================================================
      // Query Endpoints
      // ========================================================================

      if (pathname === '/active' && method === 'GET') {
        return await handleGetActiveSessions(request, env)
      }

      if (pathname === '/handoffs/latest' && method === 'GET') {
        return await handleGetLatestHandoff(request, env)
      }

      if (pathname === '/handoffs' && method === 'GET') {
        return await handleQueryHandoffs(request, env)
      }

      if (pathname.match(/^\/handoffs\/[^/]+\/status$/) && method === 'POST') {
        const parts = pathname.split('/')
        const handoffId = parts[2]
        return await handleUpdateHandoffStatus(request, env, handoffId)
      }

      // ========================================================================
      // Public Documentation Endpoints
      // ========================================================================

      if (pathname === '/docs' && method === 'GET') {
        return await handleListDocsPublic(request, env)
      }

      // Audit must be matched BEFORE /docs/:scope/:doc_name catch-all
      if (pathname === '/docs/audit' && method === 'GET') {
        return await handleDocAudit(request, env)
      }

      if (pathname.startsWith('/docs/') && method === 'GET') {
        const parts = pathname.split('/')
        if (parts.length === 4) {
          const scope = parts[2]
          const docName = parts[3]
          return await handleGetDoc(request, env, scope, docName)
        }
        return errorResponse('Invalid docs path', HTTP_STATUS.BAD_REQUEST)
      }

      // ========================================================================
      // Admin Endpoints (Documentation Management)
      // ========================================================================

      if (pathname === '/admin/docs' && method === 'POST') {
        return await handleUploadDoc(request, env)
      }

      if (pathname === '/admin/docs' && method === 'GET') {
        return await handleListDocs(request, env)
      }

      if (pathname.startsWith('/admin/docs/') && method === 'DELETE') {
        const parts = pathname.split('/')
        if (parts.length === 5) {
          const scope = parts[3]
          const docName = parts[4]
          return await handleDeleteDoc(request, env, scope, docName)
        }
        return errorResponse('Invalid DELETE path', HTTP_STATUS.BAD_REQUEST)
      }

      // ========================================================================
      // Admin Endpoints (Documentation Requirements)
      // ========================================================================

      if (pathname === '/admin/doc-requirements' && method === 'POST') {
        return await handleCreateDocRequirement(request, env)
      }

      if (pathname === '/admin/doc-requirements' && method === 'GET') {
        return await handleListDocRequirements(request, env)
      }

      if (pathname.startsWith('/admin/doc-requirements/') && method === 'DELETE') {
        const parts = pathname.split('/')
        if (parts.length === 4) {
          const id = parts[3]
          return await handleDeleteDocRequirement(request, env, id)
        }
        return errorResponse('Invalid DELETE path', HTTP_STATUS.BAD_REQUEST)
      }

      // ========================================================================
      // Admin Endpoints (Scripts Management)
      // ========================================================================

      if (pathname === '/admin/scripts' && method === 'POST') {
        return await handleUploadScript(request, env)
      }

      if (pathname === '/admin/scripts' && method === 'GET') {
        return await handleListScripts(request, env)
      }

      if (pathname.startsWith('/admin/scripts/') && method === 'DELETE') {
        const parts = pathname.split('/')
        if (parts.length === 5) {
          const scope = parts[3]
          const scriptName = parts[4]
          return await handleDeleteScript(request, env, scope, scriptName)
        }
        return errorResponse('Invalid DELETE path', HTTP_STATUS.BAD_REQUEST)
      }

      // ========================================================================
      // Admin Endpoints (Notifications - backfill CLI)
      // ========================================================================

      if (pathname === '/admin/notifications/pending-matches' && method === 'GET') {
        return await handleListPendingMatches(request, env)
      }

      if (pathname === '/admin/notifications/backfill-lock/acquire' && method === 'POST') {
        return await handleAcquireBackfillLock(request, env)
      }

      if (pathname === '/admin/notifications/backfill-lock/release' && method === 'POST') {
        return await handleReleaseBackfillLock(request, env)
      }

      if (pathname === '/admin/notifications/backfill-auto-resolve' && method === 'POST') {
        return await handleBackfillAutoResolve(request, env)
      }

      // POST /admin/notifications/:id/auto-resolve
      const adminAutoResolveMatch = pathname.match(
        /^\/admin\/notifications\/([^/]+)\/auto-resolve$/
      )
      if (adminAutoResolveMatch && method === 'POST') {
        const notificationId = adminAutoResolveMatch[1]
        return await handleAdminAutoResolveNotification(request, env, notificationId)
      }

      // ========================================================================
      // Machine Registry Endpoints
      // ========================================================================

      if (pathname === '/machines/register' && method === 'POST') {
        return await handleRegisterMachine(request, env)
      }

      if (pathname === '/machines/ssh-mesh-config' && method === 'GET') {
        return await handleSshMeshConfig(request, env)
      }

      if (pathname === '/machines' && method === 'GET') {
        return await handleListMachines(request, env)
      }

      if (pathname.match(/^\/machines\/[^/]+\/heartbeat$/) && method === 'POST') {
        const parts = pathname.split('/')
        const machineId = parts[2]
        return await handleMachineHeartbeat(request, env, machineId)
      }

      // ========================================================================
      // Notes Endpoints
      // ========================================================================

      if (pathname === '/notes' && method === 'POST') {
        return await handleCreateNote(request, env)
      }

      if (pathname === '/notes' && method === 'GET') {
        return await handleListNotes(request, env)
      }

      if (pathname.match(/^\/notes\/[^/]+\/update$/) && method === 'POST') {
        const parts = pathname.split('/')
        const noteId = parts[2]
        return await handleUpdateNote(request, env, noteId)
      }

      if (pathname.match(/^\/notes\/[^/]+\/archive$/) && method === 'POST') {
        const parts = pathname.split('/')
        const noteId = parts[2]
        return await handleArchiveNote(request, env, noteId)
      }

      if (pathname.match(/^\/notes\/[^/]+$/) && method === 'GET') {
        const parts = pathname.split('/')
        const noteId = parts[2]
        return await handleGetNote(request, env, noteId)
      }

      // ========================================================================
      // Schedule Endpoints
      // ========================================================================

      if (pathname === '/schedule/briefing' && method === 'GET') {
        return await handleGetScheduleBriefing(request, env)
      }

      if (pathname === '/schedule/items' && method === 'GET') {
        return await handleGetScheduleItems(request, env)
      }

      if (pathname.match(/^\/schedule\/[^/]+\/link-calendar$/) && method === 'POST') {
        const parts = pathname.split('/')
        const name = parts[2]
        return await handleLinkScheduleCalendar(request, env, name)
      }

      if (pathname.match(/^\/schedule\/[^/]+\/complete$/) && method === 'POST') {
        const parts = pathname.split('/')
        const name = parts[2]
        return await handleCompleteScheduleItem(request, env, name)
      }

      // ========================================================================
      // Work Day Endpoints
      // ========================================================================

      if (pathname === '/work-day' && method === 'POST') {
        return await handleUpsertWorkDay(request, env)
      }

      // ========================================================================
      // Planned Events Endpoints
      // ========================================================================

      if (pathname === '/planned-events' && method === 'GET') {
        return await handleGetPlannedEvents(request, env)
      }

      if (pathname === '/planned-events' && method === 'POST') {
        return await handleCreatePlannedEvent(request, env)
      }

      if (pathname === '/planned-events' && method === 'DELETE') {
        return await handleDeletePlannedEvents(request, env)
      }

      if (pathname.match(/^\/planned-events\/[^/]+$/) && method === 'PATCH') {
        const parts = pathname.split('/')
        const eventId = parts[2]
        return await handleUpdatePlannedEvent(request, env, eventId)
      }

      // ========================================================================
      // Session History Endpoints
      // ========================================================================

      if (pathname === '/sessions/history' && method === 'GET') {
        return await handleGetSessionHistory(request, env)
      }

      // ========================================================================
      // Notification Endpoints
      // ========================================================================

      if (pathname === '/notifications/ingest' && method === 'POST') {
        return await handleIngestNotification(request, env)
      }

      if (pathname === '/notifications/counts' && method === 'GET') {
        return await handleNotificationCounts(request, env)
      }

      if (pathname === '/notifications/oldest' && method === 'GET') {
        return await handleNotificationOldest(request, env)
      }

      if (pathname === '/notifications' && method === 'GET') {
        return await handleListNotifications(request, env)
      }

      if (pathname.match(/^\/notifications\/[^/]+\/status$/) && method === 'POST') {
        const parts = pathname.split('/')
        const notificationId = parts[2]
        return await handleUpdateNotificationStatus(request, env, notificationId)
      }

      // ========================================================================
      // Deploy Heartbeats Endpoints (Plan §B.6)
      // ========================================================================

      if (pathname === '/deploy-heartbeats' && method === 'GET') {
        return await handleListDeployHeartbeats(request, env)
      }

      if (pathname === '/deploy-heartbeats/observe-commit' && method === 'POST') {
        return await handleObserveCommit(request, env)
      }

      if (pathname === '/deploy-heartbeats/observe-run' && method === 'POST') {
        return await handleObserveRun(request, env)
      }

      if (pathname === '/deploy-heartbeats/suppress' && method === 'POST') {
        return await handleSuppressHeartbeat(request, env)
      }

      if (pathname === '/deploy-heartbeats/unsuppress' && method === 'POST') {
        return await handleUnsuppressHeartbeat(request, env)
      }

      if (pathname === '/deploy-heartbeats/threshold' && method === 'POST') {
        return await handleSetColdThreshold(request, env)
      }

      if (pathname === '/deploy-heartbeats/observe-github-workflow-run' && method === 'POST') {
        return await handleObserveGithubWorkflowRun(request, env)
      }

      if (pathname === '/deploy-heartbeats/observe-github-push' && method === 'POST') {
        return await handleObserveGithubPush(request, env)
      }

      if (pathname === '/deploy-heartbeats/seed' && method === 'POST') {
        return await handleSeedHeartbeat(request, env)
      }

      // ========================================================================
      // Fleet Health Endpoints (Plan §C.4)
      // ========================================================================

      if (pathname === '/admin/fleet-health/ingest' && method === 'POST') {
        return await handleIngestFleetHealth(request, env)
      }

      if (pathname === '/fleet-health/findings' && method === 'GET') {
        return await handleListFleetHealthFindings(request, env)
      }

      if (pathname === '/fleet-health/summary' && method === 'GET') {
        return await handleGetFleetHealthSummary(request, env)
      }

      if (pathname.match(/^\/fleet-health\/findings\/[^/]+\/resolve$/) && method === 'POST') {
        const parts = pathname.split('/')
        const findingId = parts[3]
        return await handleResolveFleetHealthFinding(request, env, findingId)
      }

      // ========================================================================
      // Skill Invocation Telemetry Endpoints
      // ========================================================================

      if (pathname === '/skills/invocations' && method === 'POST') {
        return await handleRecordSkillInvocation(request, env)
      }

      if (pathname === '/skills/usage' && method === 'GET') {
        return await handleGetSkillUsage(request, env)
      }

      // ========================================================================
      // MCP Endpoint
      // ========================================================================

      if (pathname === '/mcp' && method === 'POST') {
        return await handleMcpRequest(request, env)
      }

      // ========================================================================
      // Public Configuration Endpoints
      // ========================================================================

      if (pathname === '/ventures' && method === 'GET') {
        return handleGetVentures()
      }

      // ========================================================================
      // OPTIONS (CORS Preflight) - Future Support
      // ========================================================================

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

      // ========================================================================
      // 404 Not Found
      // ========================================================================

      return errorResponse(`Endpoint not found: ${method} ${pathname}`, HTTP_STATUS.NOT_FOUND)
    } catch (error) {
      // ========================================================================
      // Global Error Handler
      // ========================================================================

      console.error('Worker error:', {
        method,
        pathname,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })

      return errorResponse('Internal server error', HTTP_STATUS.INTERNAL_ERROR)
    }
  },

  // ============================================================================
  // Scheduled trigger — deploy-heartbeats reconciliation (#454)
  // ============================================================================
  //
  // Fires every 6 hours per wrangler.toml [[triggers]] cron. Walks every
  // active heartbeat row and catches up any missed webhook deliveries
  // from GitHub. No-op if GH_TOKEN secret is not configured. Uses
  // waitUntil to keep the reconciliation running past the initial
  // scheduled event.
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`scheduled: ${event.cron} fired at ${new Date().toISOString()}`)
    ctx.waitUntil(runReconciliation(env))
  },
}
