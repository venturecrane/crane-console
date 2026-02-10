/**
 * Crane Context Worker - Main Entry Point
 *
 * Cloudflare Worker for Crane session and handoff management.
 * Implements ADR 025 specification.
 */

import type { Env } from './types'
import {
  handleStartOfDay,
  handleEndOfDay,
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
  handleListDocsPublic,
  handleGetDoc,
  handleGetVentures,
  handleDocAudit,
} from './endpoints/queries'
import {
  handleUploadDoc,
  handleListDocs,
  handleDeleteDoc,
  handleUploadScript,
  handleListScripts,
  handleDeleteScript,
  handleCreateDocRequirement,
  handleListDocRequirements,
  handleDeleteDocRequirement,
} from './endpoints/admin'
import {
  handleRegisterMachine,
  handleListMachines,
  handleMachineHeartbeat,
  handleSshMeshConfig,
} from './endpoints/machines'
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
      // Session Lifecycle Endpoints
      // ========================================================================

      if (pathname === '/sod' && method === 'POST') {
        return await handleStartOfDay(request, env)
      }

      if (pathname === '/eod' && method === 'POST') {
        return await handleEndOfDay(request, env)
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
}
