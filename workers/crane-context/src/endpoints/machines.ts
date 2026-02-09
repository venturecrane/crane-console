/**
 * Crane Context Worker - Machine Registry Endpoints
 *
 * Handlers for machine registration, listing, heartbeat, and SSH mesh config.
 */

import type { Env } from '../types';
import {
  registerMachine,
  listMachines,
  updateMachineHeartbeat,
  generateSshMeshConfig,
} from '../machines';
import { buildRequestContext, isResponse } from '../auth';
import {
  jsonResponse,
  errorResponse,
  validationErrorResponse,
} from '../utils';
import { HTTP_STATUS } from '../constants';

// ============================================================================
// POST /machines/register - Register or Update Machine
// ============================================================================

export async function handleRegisterMachine(
  request: Request,
  env: Env
): Promise<Response> {
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context;
  }

  try {
    const body = (await request.json()) as any;

    // Validate required fields
    const required = ['hostname', 'tailscale_ip', 'user', 'os', 'arch'] as const;
    for (const field of required) {
      if (!body[field] || typeof body[field] !== 'string') {
        return validationErrorResponse(
          [{ field, message: 'Required string field' }],
          context.correlationId
        );
      }
    }

    const result = await registerMachine(env.DB, {
      hostname: body.hostname,
      tailscale_ip: body.tailscale_ip,
      user: body.user,
      os: body.os,
      arch: body.arch,
      pubkey: body.pubkey,
      role: body.role,
      meta: body.meta,
      actor_key_id: context.actorKeyId,
    });

    return jsonResponse(
      {
        machine: result.machine,
        created: result.created,
        correlation_id: context.correlationId,
      },
      result.created ? HTTP_STATUS.CREATED : HTTP_STATUS.OK,
      context.correlationId
    );
  } catch (error) {
    console.error('POST /machines/register error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// GET /machines - List Active Machines
// ============================================================================

export async function handleListMachines(
  request: Request,
  env: Env
): Promise<Response> {
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context;
  }

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'active';

    const machines = await listMachines(env.DB, status);

    return jsonResponse(
      {
        machines,
        count: machines.length,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    );
  } catch (error) {
    console.error('GET /machines error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// POST /machines/:id/heartbeat - Update Machine Last Seen
// ============================================================================

export async function handleMachineHeartbeat(
  request: Request,
  env: Env,
  machineId: string
): Promise<Response> {
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context;
  }

  try {
    const machine = await updateMachineHeartbeat(env.DB, machineId);

    if (!machine) {
      return errorResponse(
        'Machine not found',
        HTTP_STATUS.NOT_FOUND,
        context.correlationId,
        { id: machineId }
      );
    }

    return jsonResponse(
      {
        id: machine.id,
        hostname: machine.hostname,
        last_seen_at: machine.last_seen_at,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    );
  } catch (error) {
    console.error('POST /machines/:id/heartbeat error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}

// ============================================================================
// GET /machines/ssh-mesh-config - Generate SSH Config Fragment
// ============================================================================

export async function handleSshMeshConfig(
  request: Request,
  env: Env
): Promise<Response> {
  const context = await buildRequestContext(request, env);
  if (isResponse(context)) {
    return context;
  }

  try {
    const url = new URL(request.url);
    const forHostname = url.searchParams.get('for');

    if (!forHostname) {
      return validationErrorResponse(
        [{ field: 'for', message: 'Required query parameter: hostname to generate config for' }],
        context.correlationId
      );
    }

    const result = await generateSshMeshConfig(env.DB, forHostname);

    return jsonResponse(
      {
        config: result.config,
        machine_count: result.machine_count,
        generated_for: forHostname,
        correlation_id: context.correlationId,
      },
      HTTP_STATUS.OK,
      context.correlationId
    );
  } catch (error) {
    console.error('GET /machines/ssh-mesh-config error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      HTTP_STATUS.INTERNAL_ERROR,
      context.correlationId
    );
  }
}
