/**
 * Crane Context Worker - JSON Schemas
 *
 * JSON Schema definitions for all API request bodies.
 * Implements validation patterns from ADR 025.
 */

import type { JSONSchemaType } from 'ajv'
import { VENTURES } from './constants'

// ============================================================================
// Request Body Types
// ============================================================================

export interface StartOfSessionRequest {
  agent: string
  client?: string
  client_version?: string
  host?: string
  venture: string
  repo: string
  track?: number
  issue_number?: number
  branch?: string
  commit_sha?: string
  session_group_id?: string
  include_docs?: boolean
  docs_format?: 'full' | 'index'
  include_scripts?: boolean
  scripts_format?: 'full' | 'index'
  update_id?: string
  meta?: Record<string, unknown>
}

export interface EndOfSessionRequest {
  session_id: string
  to_agent?: string
  status_label?: string
  summary: string
  payload: Record<string, unknown>
  end_reason?: string
}

export interface UpdateRequest {
  session_id: string
  update_id?: string
  branch?: string
  commit_sha?: string
  meta?: Record<string, unknown>
}

export interface HeartbeatRequest {
  session_id: string
}

// ============================================================================
// JSON Schemas
// ============================================================================

/**
 * Schema for POST /sod (Start of Session)
 */
export const startOfSessionSchema: JSONSchemaType<StartOfSessionRequest> = {
  type: 'object',
  properties: {
    agent: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^[a-z0-9]+-[a-z0-9-]+$',
    },
    client: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      nullable: true,
    },
    client_version: {
      type: 'string',
      minLength: 1,
      maxLength: 50,
      nullable: true,
    },
    host: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      nullable: true,
    },
    venture: {
      type: 'string',
      enum: VENTURES as unknown as string[],
    },
    repo: {
      type: 'string',
      minLength: 3,
      maxLength: 200,
      pattern: '^[a-zA-Z0-9_-]+/[a-zA-Z0-9_-]+$',
    },
    track: {
      type: 'integer',
      minimum: 1,
      nullable: true,
    },
    issue_number: {
      type: 'integer',
      minimum: 1,
      nullable: true,
    },
    branch: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      nullable: true,
    },
    commit_sha: {
      type: 'string',
      minLength: 7,
      maxLength: 40,
      pattern: '^[a-f0-9]+$',
      nullable: true,
    },
    session_group_id: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
      nullable: true,
    },
    include_docs: {
      type: 'boolean',
      nullable: true,
    },
    docs_format: {
      type: 'string',
      enum: ['full', 'index'],
      nullable: true,
    },
    include_scripts: {
      type: 'boolean',
      nullable: true,
    },
    scripts_format: {
      type: 'string',
      enum: ['full', 'index'],
      nullable: true,
    },
    update_id: {
      type: 'string',
      minLength: 10,
      maxLength: 200,
      nullable: true,
    },
    meta: {
      type: 'object',
      nullable: true,
      required: [],
    },
  },
  required: ['agent', 'venture', 'repo'],
  additionalProperties: false,
}

/**
 * Schema for POST /eos (End of Session)
 */
export const endOfSessionSchema: JSONSchemaType<EndOfSessionRequest> = {
  type: 'object',
  properties: {
    session_id: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^sess_[0-9A-HJKMNP-TV-Z]{26}$',
    },
    to_agent: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^[a-z0-9]+-[a-z0-9-]+$',
      nullable: true,
    },
    status_label: {
      type: 'string',
      minLength: 1,
      maxLength: 50,
      nullable: true,
    },
    summary: {
      type: 'string',
      minLength: 1,
      maxLength: 5000,
    },
    payload: {
      type: 'object',
      required: [],
    },
    end_reason: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      nullable: true,
    },
  },
  required: ['session_id', 'summary', 'payload'],
  additionalProperties: false,
}

/**
 * Schema for POST /update
 */
export const updateSchema: JSONSchemaType<UpdateRequest> = {
  type: 'object',
  properties: {
    session_id: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^sess_[0-9A-HJKMNP-TV-Z]{26}$',
    },
    update_id: {
      type: 'string',
      minLength: 10,
      maxLength: 200,
      nullable: true,
    },
    branch: {
      type: 'string',
      minLength: 1,
      maxLength: 255,
      nullable: true,
    },
    commit_sha: {
      type: 'string',
      minLength: 7,
      maxLength: 40,
      pattern: '^[a-f0-9]+$',
      nullable: true,
    },
    meta: {
      type: 'object',
      nullable: true,
      required: [],
    },
  },
  required: ['session_id'],
  additionalProperties: false,
}

/**
 * Schema for POST /heartbeat
 */
export const heartbeatSchema: JSONSchemaType<HeartbeatRequest> = {
  type: 'object',
  properties: {
    session_id: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
      pattern: '^sess_[0-9A-HJKMNP-TV-Z]{26}$',
    },
  },
  required: ['session_id'],
  additionalProperties: false,
}

// ============================================================================
// Schema Registry (for easy lookup)
// ============================================================================

export const schemas = {
  '/sos': startOfSessionSchema,
  '/eos': endOfSessionSchema,
  '/update': updateSchema,
  '/heartbeat': heartbeatSchema,
} as const

export type EndpointPath = keyof typeof schemas
