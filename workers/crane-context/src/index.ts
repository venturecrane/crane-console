/**
 * Crane Context Worker - Main Entry Point
 *
 * Cloudflare Worker for Crane session and handoff management.
 * Implements ADR 025 specification.
 */

import type { Env } from './types';
import {
  handleStartOfDay,
  handleEndOfDay,
  handleUpdate,
  handleHeartbeat,
} from './endpoints/sessions';
import {
  handleGetActiveSessions,
  handleGetLatestHandoff,
  handleQueryHandoffs,
  handleListDocsPublic,
  handleGetDoc,
} from './endpoints/queries';
import {
  handleUploadDoc,
  handleListDocs,
  handleDeleteDoc,
  handleUploadScript,
  handleListScripts,
  handleDeleteScript,
} from './endpoints/admin';
import { handleMcpRequest } from './mcp';
import { errorResponse } from './utils';
import { HTTP_STATUS } from './constants';

// ============================================================================
// Main Worker Export
// ============================================================================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;
    const method = request.method;

    console.log(`[${method}] ${pathname}`, {
      searchParams: Object.fromEntries(searchParams),
    });

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
        );
      }

      // ========================================================================
      // Session Lifecycle Endpoints
      // ========================================================================

      if (pathname === '/sod' && method === 'POST') {
        return await handleStartOfDay(request, env);
      }

      if (pathname === '/eod' && method === 'POST') {
        return await handleEndOfDay(request, env);
      }

      if (pathname === '/update' && method === 'POST') {
        return await handleUpdate(request, env);
      }

      if (pathname === '/heartbeat' && method === 'POST') {
        return await handleHeartbeat(request, env);
      }

      // ========================================================================
      // Query Endpoints
      // ========================================================================

      if (pathname === '/active' && method === 'GET') {
        return await handleGetActiveSessions(request, env);
      }

      if (pathname === '/handoffs/latest' && method === 'GET') {
        return await handleGetLatestHandoff(request, env);
      }

      if (pathname === '/handoffs' && method === 'GET') {
        return await handleQueryHandoffs(request, env);
      }

      // ========================================================================
      // Public Documentation Endpoints
      // ========================================================================

      if (pathname === '/docs' && method === 'GET') {
        return await handleListDocsPublic(request, env);
      }

      if (pathname.startsWith('/docs/') && method === 'GET') {
        const parts = pathname.split('/');
        if (parts.length === 4) {
          const scope = parts[2];
          const docName = parts[3];
          return await handleGetDoc(request, env, scope, docName);
        }
        return errorResponse('Invalid docs path', HTTP_STATUS.BAD_REQUEST);
      }

      // ========================================================================
      // Admin Endpoints (Documentation Management)
      // ========================================================================

      if (pathname === '/admin/docs' && method === 'POST') {
        return await handleUploadDoc(request, env);
      }

      if (pathname === '/admin/docs' && method === 'GET') {
        return await handleListDocs(request, env);
      }

      if (pathname.startsWith('/admin/docs/') && method === 'DELETE') {
        const parts = pathname.split('/');
        if (parts.length === 5) {
          const scope = parts[3];
          const docName = parts[4];
          return await handleDeleteDoc(request, env, scope, docName);
        }
        return errorResponse('Invalid DELETE path', HTTP_STATUS.BAD_REQUEST);
      }

      // ========================================================================
      // Admin Endpoints (Scripts Management)
      // ========================================================================

      if (pathname === '/admin/scripts' && method === 'POST') {
        return await handleUploadScript(request, env);
      }

      if (pathname === '/admin/scripts' && method === 'GET') {
        return await handleListScripts(request, env);
      }

      if (pathname.startsWith('/admin/scripts/') && method === 'DELETE') {
        const parts = pathname.split('/');
        if (parts.length === 5) {
          const scope = parts[3];
          const scriptName = parts[4];
          return await handleDeleteScript(request, env, scope, scriptName);
        }
        return errorResponse('Invalid DELETE path', HTTP_STATUS.BAD_REQUEST);
      }

      // ========================================================================
      // MCP Endpoint
      // ========================================================================

      if (pathname === '/mcp' && method === 'POST') {
        return await handleMcpRequest(request, env);
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
        });
      }

      // ========================================================================
      // 404 Not Found
      // ========================================================================

      return errorResponse(
        `Endpoint not found: ${method} ${pathname}`,
        HTTP_STATUS.NOT_FOUND
      );
    } catch (error) {
      // ========================================================================
      // Global Error Handler
      // ========================================================================

      console.error('Worker error:', {
        method,
        pathname,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      return errorResponse(
        'Internal server error',
        HTTP_STATUS.INTERNAL_ERROR
      );
    }
  },
};
