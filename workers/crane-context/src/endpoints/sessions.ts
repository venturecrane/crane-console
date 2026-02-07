/**
 * Crane Context Worker - Session Lifecycle Endpoints
 *
 * Handlers for POST /sod, /eod, /update, /heartbeat
 * Implements session lifecycle patterns from ADR 025.
 */

import type { Env } from '../types';
import {
  resumeOrCreateSession,
  getSession,
  updateSession,
  updateHeartbeat,
  endSession,
  calculateNextHeartbeat,
  getSiblingSessionSummaries,
} from '../sessions';
import { createHandoff, getLatestHandoff } from '../handoffs';
import { createCheckpoint, getCheckpoints } from '../checkpoints';
import {
  extractIdempotencyKey,
  handleIdempotentRequest,
  storeIdempotencyKey,
} from '../idempotency';
import { buildRequestContext, isResponse } from '../auth';
import {
  jsonResponse,
  errorResponse,
  validationErrorResponse,
  payloadTooLargeResponse,
} from '../utils';
import { HTTP_STATUS, MAX_REQUEST_BODY_SIZE } from '../constants';
import { fetchDocsForVenture, fetchDocsMetadata } from '../docs';
import { fetchScriptsForVenture, fetchScriptsMetadata } from '../scripts';
import { runDocAudit } from '../audit';
import type { DocAuditResult } from '../audit';

// ============================================================================
// POST /sod - Start of Day (Resume or Create Session)
// ============================================================================

/**
 * POST /sod - Resume existing session or create new one
 *
 * Request body:
 * {
 *   agent: string,
 *   client?: string,
 *   client_version?: string,
 *   host?: string,
 *   venture: string,
 *   repo: string,
 *   track?: number,
 *   issue_number?: number,
 *   branch?: string,
 *   commit_sha?: string,
 *   meta?: object
 * }
 *
 * Response:
 * {
 *   session_id: string,
 *   status: 'resumed' | 'created',
 *   session: SessionRecord,
 *   next_heartbeat_at: string,
 *   heartbeat_interval_seconds: number
 * }
 */
export async function handleStartOfDay(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context; // Auth failed, return 401
  }

  try {
    // 2. Parse and validate request body
    const contentLength = request.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) > MAX_REQUEST_BODY_SIZE) {
      return payloadTooLargeResponse(
        'Request body too large',
        context.correlationId,
        { max_size_bytes: MAX_REQUEST_BODY_SIZE }
      );
    }

    const body = await request.json() as any;

    // Basic validation
    if (!body.agent || typeof body.agent !== 'string') {
      return validationErrorResponse(
        [{ field: 'agent', message: 'Required string field' }],
        context.correlationId
      );
    }

    if (!body.venture || typeof body.venture !== 'string') {
      return validationErrorResponse(
        [{ field: 'venture', message: 'Required string field' }],
        context.correlationId
      );
    }

    if (!body.repo || typeof body.repo !== 'string') {
      return validationErrorResponse(
        [{ field: 'repo', message: 'Required string field' }],
        context.correlationId
      );
    }

    // 3. Check idempotency
    const idempotencyKey = extractIdempotencyKey(request, body);
    const cachedResponse = await handleIdempotentRequest(
      env.DB,
      '/sod',
      idempotencyKey
    );

    if (cachedResponse) {
      return cachedResponse; // Return cached response
    }

    // 4. Resume or create session
    const session = await resumeOrCreateSession(env.DB, {
      agent: body.agent,
      client: body.client,
      client_version: body.client_version,
      host: body.host,
      venture: body.venture,
      repo: body.repo,
      track: body.track,
      issue_number: body.issue_number,
      branch: body.branch,
      commit_sha: body.commit_sha,
      session_group_id: body.session_group_id,
      actor_key_id: context.actorKeyId,
      creation_correlation_id: context.correlationId,
      meta: body.meta,
    });

    // 5. Fetch documentation (unless explicitly disabled)
    // docs_format: 'full' (content) or 'index' (metadata only, default)
    const includeDocs = body.include_docs !== false; // Default: true
    const docsFormat = body.docs_format || 'index'; // Default: metadata only
    let docsResponse = null;
    let docsIndexResponse = null;
    if (includeDocs) {
      try {
        if (docsFormat === 'full') {
          docsResponse = await fetchDocsForVenture(env.DB, body.venture);
        } else {
          docsIndexResponse = await fetchDocsMetadata(env.DB, body.venture);
        }
      } catch (error) {
        console.error('Failed to fetch documentation', {
          correlationId: context.correlationId,
          venture: body.venture,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // 5b. Fetch scripts (unless explicitly disabled)
    // scripts_format: 'full' (content) or 'index' (metadata only, default)
    const includeScripts = body.include_scripts !== false; // Default: true
    const scriptsFormat = body.scripts_format || 'index'; // Default: metadata only
    let scriptsResponse = null;
    let scriptsIndexResponse = null;
    if (includeScripts) {
      try {
        if (scriptsFormat === 'full') {
          scriptsResponse = await fetchScriptsForVenture(env.DB, body.venture);
        } else {
          scriptsIndexResponse = await fetchScriptsMetadata(env.DB, body.venture);
        }
      } catch (error) {
        console.error('Failed to fetch scripts', {
          correlationId: context.correlationId,
          venture: body.venture,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // 5c. Run documentation audit
    let docAudit: DocAuditResult | null = null;
    try {
      docAudit = await runDocAudit(env.DB, body.venture);
    } catch (error) {
      console.error('Failed to run doc audit', {
        correlationId: context.correlationId,
        venture: body.venture,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // 6. Fetch last handoff for this venture/repo/track
    let lastHandoff = null;
    try {
      lastHandoff = await getLatestHandoff(env.DB, {
        venture: body.venture,
        repo: body.repo,
        track: body.track,
      });
    } catch (error) {
      console.error('Failed to fetch last handoff', {
        correlationId: context.correlationId,
        venture: body.venture,
        repo: body.repo,
        track: body.track,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // 7. Determine if resumed or created
    const status = session.created_at === session.last_heartbeat_at ? 'created' : 'resumed';

    // 8. Calculate next heartbeat with jitter
    const heartbeat = calculateNextHeartbeat();

    // 9. Build response
    const responseData = {
      session_id: session.id,
      status,
      session,
      next_heartbeat_at: heartbeat.next_heartbeat_at,
      heartbeat_interval_seconds: heartbeat.heartbeat_interval_seconds,
      correlation_id: context.correlationId,
      // Full documentation (when docs_format='full')
      ...(docsResponse && {
        documentation: {
          docs: docsResponse.docs,
          count: docsResponse.count,
          content_hash: docsResponse.content_hash_combined,
        },
      }),
      // Documentation index (default, when docs_format='index')
      ...(docsIndexResponse && {
        doc_index: {
          docs: docsIndexResponse.docs,
          count: docsIndexResponse.count,
        },
      }),
      // Full scripts (when scripts_format='full')
      ...(scriptsResponse && {
        scripts: {
          scripts: scriptsResponse.scripts,
          count: scriptsResponse.count,
          content_hash: scriptsResponse.content_hash_combined,
        },
      }),
      // Scripts index (default, when scripts_format='index')
      ...(scriptsIndexResponse && {
        script_index: {
          scripts: scriptsIndexResponse.scripts,
          count: scriptsIndexResponse.count,
        },
      }),
      ...(lastHandoff && { last_handoff: lastHandoff }),
      ...(docAudit && { doc_audit: docAudit }),
    };

    const response = jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId);

    // 9. Store idempotency key (if provided)
    if (idempotencyKey) {
      await storeIdempotencyKey(
        env.DB,
        '/sod',
        idempotencyKey,
        response,
        context.actorKeyId,
        context.correlationId
      );
    }

    return response;
  } catch (error) {
    console.log(error);
    console.error('POST /sod error:', error, (error as Error).stack);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// POST /eod - End of Day (End Session with Handoff)
// ============================================================================

/**
 * POST /eod - End session and create handoff
 *
 * Request body:
 * {
 *   session_id: string,
 *   to_agent?: string,
 *   status_label?: string,
 *   summary: string,
 *   payload: object,
 *   end_reason?: string
 * }
 *
 * Response:
 * {
 *   session_id: string,
 *   handoff_id: string,
 *   handoff: HandoffRecord,
 *   ended_at: string
 * }
 */
export async function handleEndOfDay(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context; // Auth failed, return 401
  }

  try {
    // 2. Parse and validate request body
    const contentLength = request.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) > MAX_REQUEST_BODY_SIZE) {
      return payloadTooLargeResponse(
        'Request body too large',
        context.correlationId,
        { max_size_bytes: MAX_REQUEST_BODY_SIZE }
      );
    }

    const body = await request.json() as any;

    // Basic validation
    if (!body.session_id || typeof body.session_id !== 'string') {
      return validationErrorResponse(
        [{ field: 'session_id', message: 'Required string field' }],
        context.correlationId
      );
    }

    if (!body.summary || typeof body.summary !== 'string') {
      return validationErrorResponse(
        [{ field: 'summary', message: 'Required string field' }],
        context.correlationId
      );
    }

    if (!body.payload || typeof body.payload !== 'object') {
      return validationErrorResponse(
        [{ field: 'payload', message: 'Required object field' }],
        context.correlationId
      );
    }

    // 3. Check idempotency
    const idempotencyKey = extractIdempotencyKey(request, body);
    const cachedResponse = await handleIdempotentRequest(
      env.DB,
      '/eod',
      idempotencyKey
    );

    if (cachedResponse) {
      return cachedResponse; // Return cached response
    }

    // 4. Verify session exists and is active
    const session = await getSession(env.DB, body.session_id);

    if (!session) {
      return errorResponse(
        'Session not found',
        HTTP_STATUS.NOT_FOUND,
        context.correlationId,
        { session_id: body.session_id }
      );
    }

    if (session.status !== 'active') {
      return errorResponse(
        'Session is not active',
        HTTP_STATUS.CONFLICT,
        context.correlationId,
        { session_id: body.session_id, status: session.status }
      );
    }

    // 5. Create handoff (this validates payload size)
    try {
      const handoff = await createHandoff(env.DB, {
        session_id: body.session_id,
        venture: session.venture,
        repo: session.repo,
        track: session.track || undefined,
        issue_number: session.issue_number || undefined,
        branch: session.branch || undefined,
        commit_sha: session.commit_sha || undefined,
        from_agent: session.agent,
        to_agent: body.to_agent,
        status_label: body.status_label,
        summary: body.summary,
        payload: body.payload,
        actor_key_id: context.actorKeyId,
        creation_correlation_id: context.correlationId,
      });

      // 6. End session
      const endedAt = await endSession(
        env.DB,
        body.session_id,
        body.end_reason || 'manual'
      );

      // 7. Build response
      const responseData = {
        session_id: body.session_id,
        handoff_id: handoff.id,
        handoff,
        ended_at: endedAt,
        correlation_id: context.correlationId,
      };

      const response = jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId);

      // 8. Store idempotency key (if provided)
      if (idempotencyKey) {
        await storeIdempotencyKey(
          env.DB,
          '/eod',
          idempotencyKey,
          response,
          context.actorKeyId,
          context.correlationId
        );
      }

      return response;
    } catch (handoffError) {
      // Handle payload size errors specifically
      if (handoffError instanceof Error && handoffError.message.includes('too large')) {
        return payloadTooLargeResponse(
          handoffError.message,
          context.correlationId
        );
      }
      throw handoffError;
    }
  } catch (error) {
    console.error('POST /eod error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// POST /update - Update Session Fields
// ============================================================================

/**
 * POST /update - Update session fields and refresh heartbeat
 *
 * Request body:
 * {
 *   session_id: string,
 *   update_id?: string,  // Optional idempotency key
 *   branch?: string,
 *   commit_sha?: string,
 *   meta?: object
 * }
 *
 * Response:
 * {
 *   session_id: string,
 *   updated_at: string,
 *   next_heartbeat_at: string,
 *   heartbeat_interval_seconds: number
 * }
 */
export async function handleUpdate(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context; // Auth failed, return 401
  }

  try {
    // 2. Parse and validate request body
    const body = await request.json() as any;

    // Basic validation
    if (!body.session_id || typeof body.session_id !== 'string') {
      return validationErrorResponse(
        [{ field: 'session_id', message: 'Required string field' }],
        context.correlationId
      );
    }

    // 3. Check idempotency (update_id from body or Idempotency-Key header)
    const idempotencyKey = extractIdempotencyKey(request, body);
    const cachedResponse = await handleIdempotentRequest(
      env.DB,
      '/update',
      idempotencyKey
    );

    if (cachedResponse) {
      return cachedResponse; // Return cached response
    }

    // 4. Verify session exists and is active
    const session = await getSession(env.DB, body.session_id);

    if (!session) {
      return errorResponse(
        'Session not found',
        HTTP_STATUS.NOT_FOUND,
        context.correlationId,
        { session_id: body.session_id }
      );
    }

    if (session.status !== 'active') {
      return errorResponse(
        'Session is not active',
        HTTP_STATUS.CONFLICT,
        context.correlationId,
        { session_id: body.session_id, status: session.status }
      );
    }

    // 5. Update session (also refreshes heartbeat)
    const updatedAt = await updateSession(env.DB, body.session_id, {
      branch: body.branch,
      commit_sha: body.commit_sha,
      meta: body.meta,
    });

    // 6. Calculate next heartbeat with jitter
    const heartbeat = calculateNextHeartbeat();

    // 7. Build response
    const responseData = {
      session_id: body.session_id,
      updated_at: updatedAt,
      next_heartbeat_at: heartbeat.next_heartbeat_at,
      heartbeat_interval_seconds: heartbeat.heartbeat_interval_seconds,
      correlation_id: context.correlationId,
    };

    const response = jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId);

    // 8. Store idempotency key (if provided)
    if (idempotencyKey) {
      await storeIdempotencyKey(
        env.DB,
        '/update',
        idempotencyKey,
        response,
        context.actorKeyId,
        context.correlationId
      );
    }

    return response;
  } catch (error) {
    console.error('POST /update error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// POST /heartbeat - Keep Session Alive
// ============================================================================

/**
 * POST /heartbeat - Refresh session heartbeat timestamp
 *
 * Request body:
 * {
 *   session_id: string
 * }
 *
 * Response:
 * {
 *   session_id: string,
 *   last_heartbeat_at: string,
 *   next_heartbeat_at: string,
 *   heartbeat_interval_seconds: number
 * }
 */
export async function handleHeartbeat(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context; // Auth failed, return 401
  }

  try {
    // 2. Parse and validate request body
    const body = await request.json() as any;

    // Basic validation
    if (!body.session_id || typeof body.session_id !== 'string') {
      return validationErrorResponse(
        [{ field: 'session_id', message: 'Required string field' }],
        context.correlationId
      );
    }

    // 3. Verify session exists and is active
    const session = await getSession(env.DB, body.session_id);

    if (!session) {
      return errorResponse(
        'Session not found',
        HTTP_STATUS.NOT_FOUND,
        context.correlationId,
        { session_id: body.session_id }
      );
    }

    if (session.status !== 'active') {
      return errorResponse(
        'Session is not active',
        HTTP_STATUS.CONFLICT,
        context.correlationId,
        { session_id: body.session_id, status: session.status }
      );
    }

    // 4. Update heartbeat timestamp
    const lastHeartbeatAt = await updateHeartbeat(env.DB, body.session_id);

    // 5. Calculate next heartbeat with jitter
    const heartbeat = calculateNextHeartbeat();

    // 6. Build response
    const responseData = {
      session_id: body.session_id,
      last_heartbeat_at: lastHeartbeatAt,
      next_heartbeat_at: heartbeat.next_heartbeat_at,
      heartbeat_interval_seconds: heartbeat.heartbeat_interval_seconds,
      correlation_id: context.correlationId,
    };

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId);
  } catch (error) {
    console.error('POST /heartbeat error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// POST /checkpoint - Save Work Progress Mid-Session
// ============================================================================

/**
 * POST /checkpoint - Save incremental work summary without ending session
 *
 * Request body:
 * {
 *   session_id: string,
 *   summary: string,
 *   work_completed?: string[],
 *   blockers?: string[],
 *   next_actions?: string[],
 *   notes?: string
 * }
 *
 * Response:
 * {
 *   checkpoint_id: string,
 *   checkpoint_number: number,
 *   session_id: string,
 *   created_at: string
 * }
 */
export async function handleCheckpoint(
  request: Request,
  env: Env
): Promise<Response> {
  // 1. Build request context (includes auth validation)
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context; // Auth failed, return 401
  }

  try {
    // 2. Parse and validate request body
    const body = (await request.json()) as any;

    // Basic validation
    if (!body.session_id || typeof body.session_id !== 'string') {
      return validationErrorResponse(
        [{ field: 'session_id', message: 'Required string field' }],
        context.correlationId
      );
    }

    if (!body.summary || typeof body.summary !== 'string') {
      return validationErrorResponse(
        [{ field: 'summary', message: 'Required string field' }],
        context.correlationId
      );
    }

    // 3. Verify session exists and is active
    const session = await getSession(env.DB, body.session_id);

    if (!session) {
      return errorResponse(
        'Session not found',
        HTTP_STATUS.NOT_FOUND,
        context.correlationId,
        { session_id: body.session_id }
      );
    }

    if (session.status !== 'active') {
      return errorResponse(
        'Session is not active',
        HTTP_STATUS.CONFLICT,
        context.correlationId,
        { session_id: body.session_id, status: session.status }
      );
    }

    // 4. Create checkpoint
    const checkpoint = await createCheckpoint(env.DB, {
      session_id: body.session_id,
      venture: session.venture,
      repo: session.repo,
      track: session.track || undefined,
      issue_number: session.issue_number || undefined,
      branch: session.branch || undefined,
      commit_sha: session.commit_sha || undefined,
      summary: body.summary,
      work_completed: body.work_completed,
      blockers: body.blockers,
      next_actions: body.next_actions,
      notes: body.notes,
      actor_key_id: context.actorKeyId,
      correlation_id: context.correlationId,
    });

    // 5. Also refresh heartbeat since agent is active
    await updateHeartbeat(env.DB, body.session_id);

    // 6. Build response
    const responseData = {
      checkpoint_id: checkpoint.id,
      checkpoint_number: checkpoint.checkpoint_number,
      session_id: checkpoint.session_id,
      created_at: checkpoint.created_at,
      correlation_id: context.correlationId,
    };

    return jsonResponse(responseData, HTTP_STATUS.CREATED, context.correlationId);
  } catch (error) {
    console.error('POST /checkpoint error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// GET /checkpoints - Query Checkpoints
// ============================================================================

/**
 * GET /checkpoints - Query checkpoints by filters
 *
 * Query parameters:
 * - session_id: string (optional) - Get checkpoints for a specific session
 * - venture: string (optional) - Filter by venture
 * - repo: string (optional) - Filter by repo
 * - track: number (optional) - Filter by track
 * - limit: number (optional, default 20, max 100)
 *
 * At least one filter (session_id or venture) is required.
 *
 * Response:
 * {
 *   checkpoints: CheckpointRecord[],
 *   count: number
 * }
 */
export async function handleGetCheckpoints(
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
    const trackParam = url.searchParams.get('track');
    const limitParam = url.searchParams.get('limit');

    // Validate at least one filter
    if (!sessionId && !venture) {
      return validationErrorResponse(
        [
          {
            field: 'query_params',
            message: 'At least session_id or venture is required',
          },
        ],
        context.correlationId
      );
    }

    // Parse limit
    let limit = 20;
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

    // Parse track
    let track: number | undefined;
    if (trackParam) {
      const parsedTrack = parseInt(trackParam, 10);
      if (isNaN(parsedTrack)) {
        return validationErrorResponse(
          [{ field: 'track', message: 'Must be a valid integer' }],
          context.correlationId
        );
      }
      track = parsedTrack;
    }

    // 3. Query checkpoints
    const checkpoints = await getCheckpoints(
      env.DB,
      {
        session_id: sessionId || undefined,
        venture: venture || undefined,
        repo: repo || undefined,
        track,
      },
      limit
    );

    // 4. Build response
    const responseData = {
      checkpoints,
      count: checkpoints.length,
      correlation_id: context.correlationId,
    };

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId);
  } catch (error) {
    console.error('GET /checkpoints error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// GET /siblings - Query Sibling Sessions in Same Group
// ============================================================================

/**
 * GET /siblings - Get sibling sessions in the same session group
 *
 * Query parameters:
 * - session_group_id: string (required) - Group ID to search for
 * - exclude_session_id: string (optional) - Session ID to exclude from results
 *
 * Response:
 * {
 *   siblings: Array<{id, agent, venture, repo, track, issue_number, branch, last_heartbeat_at, created_at}>,
 *   count: number
 * }
 */
export async function handleGetSiblings(
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
    const sessionGroupId = url.searchParams.get('session_group_id');
    const excludeSessionId = url.searchParams.get('exclude_session_id');

    // Validate required parameter
    if (!sessionGroupId) {
      return validationErrorResponse(
        [{ field: 'session_group_id', message: 'Required query parameter' }],
        context.correlationId
      );
    }

    // 3. Query sibling sessions
    const siblings = await getSiblingSessionSummaries(
      env.DB,
      sessionGroupId,
      excludeSessionId || undefined
    );

    // 4. Build response
    const responseData = {
      siblings,
      count: siblings.length,
      session_group_id: sessionGroupId,
      correlation_id: context.correlationId,
    };

    return jsonResponse(responseData, HTTP_STATUS.OK, context.correlationId);
  } catch (error) {
    console.error('GET /siblings error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}