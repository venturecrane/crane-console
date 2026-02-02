/**
 * Crane Context Worker - Query Endpoints
 *
 * Handlers for GET /active, /handoffs/latest, /handoffs
 * Implements query patterns from ADR 025.
 */

import type { Env } from '../types';
import { findActiveSessions } from '../sessions';
import { getLatestHandoff, queryHandoffs } from '../handoffs';
import { fetchDocsMetadata, fetchDoc } from '../docs';
import { buildRequestContext, isResponse } from '../auth';
import {
  jsonResponse,
  errorResponse,
  validationErrorResponse,
} from '../utils';
import { HTTP_STATUS, VENTURE_CONFIG } from '../constants';

// ============================================================================
// GET /active - Query Active Sessions
// ============================================================================

/**
 * GET /active - Query active sessions by filters
 *
 * Query parameters:
 * - agent: string (required)
 * - venture: string (required)
 * - repo: string (required)
 * - track?: number (optional)
 *
 * Response:
 * {
 *   sessions: SessionRecord[],
 *   count: number
 * }
 */
export async function handleGetActiveSessions(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context; // Auth failed, return 401
  }

  try {
    // 2. Parse query parameters
    const url = new URL(request.url);
    const agent = url.searchParams.get('agent');
    const venture = url.searchParams.get('venture');
    const repo = url.searchParams.get('repo');
    const trackParam = url.searchParams.get('track');

    // Validate required parameters
    if (!agent) {
      return validationErrorResponse(
        [{ field: 'agent', message: 'Required query parameter' }],
        context.correlationId
      );
    }

    if (!venture) {
      return validationErrorResponse(
        [{ field: 'venture', message: 'Required query parameter' }],
        context.correlationId
      );
    }

    if (!repo) {
      return validationErrorResponse(
        [{ field: 'repo', message: 'Required query parameter' }],
        context.correlationId
      );
    }

    // Parse optional track parameter
    let track: number | null = null;
    if (trackParam !== null) {
      const parsedTrack = parseInt(trackParam, 10);
      if (isNaN(parsedTrack)) {
        return validationErrorResponse(
          [{ field: 'track', message: 'Must be a valid integer' }],
          context.correlationId
        );
      }
      track = parsedTrack;
    }

    // 3. Query active sessions
    const sessions = await findActiveSessions(
      env.DB,
      agent,
      venture,
      repo,
      track
    );

    // 4. Build response
    const responseData = {
      sessions,
      count: sessions.length,
      correlation_id: context.correlationId,
    };

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId);
  } catch (error) {
    console.error('GET /active error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// GET /handoffs/latest - Get Latest Handoff
// ============================================================================

/**
 * GET /handoffs/latest - Get most recent handoff for a context
 *
 * Query parameters (multiple modes supported):
 * Mode 1 - By Issue:
 *   - venture: string (required)
 *   - repo: string (required)
 *   - issue_number: number (required)
 *
 * Mode 2 - By Track:
 *   - venture: string (required)
 *   - repo: string (required)
 *   - track: number (required)
 *
 * Mode 3 - By Session:
 *   - session_id: string (required)
 *
 * Response:
 * {
 *   handoff: HandoffRecord | null
 * }
 */
export async function handleGetLatestHandoff(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context; // Auth failed, return 401
  }

  try {
    // 2. Parse query parameters
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session_id');
    const venture = url.searchParams.get('venture');
    const repo = url.searchParams.get('repo');
    const issueNumberParam = url.searchParams.get('issue_number');
    const trackParam = url.searchParams.get('track');

    // Determine query mode and validate
    let filters: {
      venture?: string;
      repo?: string;
      issue_number?: number;
      track?: number;
      session_id?: string;
    } = {};

    if (sessionId) {
      // Mode 3: By session
      filters.session_id = sessionId;
    } else if (venture && repo && issueNumberParam) {
      // Mode 1: By issue
      const issueNumber = parseInt(issueNumberParam, 10);
      if (isNaN(issueNumber)) {
        return validationErrorResponse(
          [{ field: 'issue_number', message: 'Must be a valid integer' }],
          context.correlationId
        );
      }
      filters = { venture, repo, issue_number: issueNumber };
    } else if (venture && repo && trackParam) {
      // Mode 2: By track
      const track = parseInt(trackParam, 10);
      if (isNaN(track)) {
        return validationErrorResponse(
          [{ field: 'track', message: 'Must be a valid integer' }],
          context.correlationId
        );
      }
      filters = { venture, repo, track };
    } else {
      return validationErrorResponse(
        [
          {
            field: 'query_params',
            message:
              'Provide session_id OR (venture + repo + issue_number) OR (venture + repo + track)',
          },
        ],
        context.correlationId
      );
    }

    // 3. Query latest handoff
    const handoff = await getLatestHandoff(env.DB, filters);

    // 4. Build response
    const responseData = {
      handoff,
      correlation_id: context.correlationId,
    };

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId);
  } catch (error) {
    console.error('GET /handoffs/latest error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// GET /handoffs - Query Handoff History with Pagination
// ============================================================================

/**
 * GET /handoffs - Query handoff history with cursor-based pagination
 *
 * Query parameters (multiple modes supported):
 * Mode 1 - By Issue:
 *   - venture: string (required)
 *   - repo: string (required)
 *   - issue_number: number (required)
 *   - cursor?: string (optional)
 *   - limit?: number (optional, default 20, max 100)
 *
 * Mode 2 - By Track:
 *   - venture: string (required)
 *   - repo: string (required)
 *   - track: number (required)
 *   - cursor?: string (optional)
 *   - limit?: number (optional, default 20, max 100)
 *
 * Mode 3 - By Session:
 *   - session_id: string (required)
 *   - cursor?: string (optional)
 *   - limit?: number (optional, default 20, max 100)
 *
 * Mode 4 - By Agent:
 *   - from_agent: string (required)
 *   - cursor?: string (optional)
 *   - limit?: number (optional, default 20, max 100)
 *
 * Response:
 * {
 *   handoffs: HandoffRecord[],
 *   next_cursor: string | null,
 *   has_more: boolean,
 *   count: number
 * }
 */
export async function handleQueryHandoffs(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context; // Auth failed, return 401
  }

  try {
    // 2. Parse query parameters
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('session_id');
    const fromAgent = url.searchParams.get('from_agent');
    const venture = url.searchParams.get('venture');
    const repo = url.searchParams.get('repo');
    const issueNumberParam = url.searchParams.get('issue_number');
    const trackParam = url.searchParams.get('track');
    const cursor = url.searchParams.get('cursor');
    const limitParam = url.searchParams.get('limit');

    // Parse pagination parameters
    let limit = 20; // Default
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return validationErrorResponse(
          [{ field: 'limit', message: 'Must be an integer between 1 and 100' }],
          context.correlationId
        );
      }
      limit = parsedLimit;
    }

    // Determine query mode and validate
    let filters: {
      venture?: string;
      repo?: string;
      issue_number?: number;
      track?: number;
      session_id?: string;
      from_agent?: string;
    } = {};

    if (sessionId) {
      // Mode 3: By session
      filters.session_id = sessionId;
    } else if (fromAgent) {
      // Mode 4: By agent
      filters.from_agent = fromAgent;
    } else if (venture && repo) {
      // Mode 1 or 2: By issue or track
      filters.venture = venture;
      filters.repo = repo;

      if (issueNumberParam) {
        const issueNumber = parseInt(issueNumberParam, 10);
        if (isNaN(issueNumber)) {
          return validationErrorResponse(
            [{ field: 'issue_number', message: 'Must be a valid integer' }],
            context.correlationId
          );
        }
        filters.issue_number = issueNumber;
      } else if (trackParam) {
        const track = parseInt(trackParam, 10);
        if (isNaN(track)) {
          return validationErrorResponse(
            [{ field: 'track', message: 'Must be a valid integer' }],
            context.correlationId
          );
        }
        filters.track = track;
      }
      // Note: venture + repo without issue/track is valid (queries all handoffs for repo)
    } else {
      return validationErrorResponse(
        [
          {
            field: 'query_params',
            message:
              'Provide session_id OR from_agent OR (venture + repo) with optional issue_number/track',
          },
        ],
        context.correlationId
      );
    }

    // 3. Query handoffs with pagination
    const result = await queryHandoffs(env.DB, filters, {
      cursor: cursor || undefined,
      limit,
    });

    // 4. Build response
    const responseData = {
      handoffs: result.handoffs,
      next_cursor: result.next_cursor,
      has_more: result.has_more,
      count: result.handoffs.length,
      correlation_id: context.correlationId,
    };

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId);
  } catch (error) {
    console.error('GET /handoffs error:', error);

    // Handle invalid cursor errors specifically
    if (error instanceof Error && error.message.includes('Invalid cursor')) {
      return validationErrorResponse(
        [{ field: 'cursor', message: error.message }],
        context.correlationId
      );
    }

    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// GET /docs - List Documents (Public)
// ============================================================================

/**
 * GET /docs - List document metadata for a venture
 *
 * Query parameters:
 * - venture: string (required) - Venture code (vc, dfg, sc, ke)
 *
 * Response:
 * {
 *   docs: Array<{ scope, doc_name, content_hash, title, version }>,
 *   count: number
 * }
 */
export async function handleListDocsPublic(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context; // Auth failed, return 401
  }

  try {
    // 2. Parse query parameters
    const url = new URL(request.url);
    const venture = url.searchParams.get('venture');

    if (!venture) {
      return validationErrorResponse(
        [{ field: 'venture', message: 'Required query parameter' }],
        context.correlationId
      );
    }

    // 3. Fetch docs metadata
    const result = await fetchDocsMetadata(env.DB, venture);

    // 4. Build response
    const responseData = {
      docs: result.docs,
      count: result.count,
      correlation_id: context.correlationId,
    };

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId);
  } catch (error) {
    console.error('GET /docs error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// GET /docs/:scope/:doc_name - Get Single Document (Public)
// ============================================================================

// ============================================================================
// GET /ventures - List Ventures (Public, No Auth)
// ============================================================================

/**
 * GET /ventures - List all ventures with metadata
 *
 * No authentication required - this is public configuration data.
 * Used by ccs script and other tooling to get venture list.
 *
 * Response:
 * {
 *   ventures: Array<{ code, name, org }>
 * }
 */
export async function handleGetVentures(): Promise<Response> {
  const ventures = Object.entries(VENTURE_CONFIG).map(([code, config]) => ({
    code,
    ...config,
  }));

  return jsonResponse({ ventures }, HTTP_STATUS.OK);
}

// ============================================================================
// GET /docs/:scope/:doc_name - Get Single Document (Public)
// ============================================================================

/**
 * GET /docs/:scope/:doc_name - Fetch a single document with content
 *
 * Path parameters:
 * - scope: string - Document scope (global or venture code)
 * - doc_name: string - Document name
 *
 * Response:
 * {
 *   doc: { scope, doc_name, content, content_hash, title, description, version } | null
 * }
 */
export async function handleGetDoc(
  request: Request,
  env: Env,
  scope: string,
  docName: string
): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context; // Auth failed, return 401
  }

  try {
    // 2. Fetch the document
    const doc = await fetchDoc(env.DB, scope, docName);

    if (!doc) {
      return errorResponse(
        `Document not found: ${scope}/${docName}`,
        HTTP_STATUS.NOT_FOUND,
        context.correlationId
      );
    }

    // 3. Build response
    const responseData = {
      doc,
      correlation_id: context.correlationId,
    };

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId);
  } catch (error) {
    console.error('GET /docs/:scope/:doc_name error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}
