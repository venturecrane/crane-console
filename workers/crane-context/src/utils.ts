/**
 * Crane Context Worker - Utility Functions
 *
 * Core utilities for ID generation, hashing, date formatting, and error handling.
 * Implements patterns from ADR 025.
 */

import { ulid } from 'ulidx';
import canonicalize from 'canonicalize';
import { ID_PREFIXES, HTTP_STATUS } from './constants';
import type { PaginationCursor, ErrorResponse, ValidationErrorResponse } from './types';

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a new session ID with ULID format
 * Format: sess_<ULID> (sortable, timestamp-embedded)
 * Example: sess_01HQXV3NK8YXM3G5ZXQXQXQXQX
 */
export function generateSessionId(): string {
  return `${ID_PREFIXES.SESSION}${ulid()}`;
}

/**
 * Generate a new handoff ID with ULID format
 * Format: ho_<ULID> (sortable, timestamp-embedded)
 * Example: ho_01HQXV4NK8YXM3G5ZXQXQXQXQX
 */
export function generateHandoffId(): string {
  return `${ID_PREFIXES.HANDOFF}${ulid()}`;
}

/**
 * Generate a new correlation ID with UUID v4 format
 * Format: corr_<UUID> (random, per-request scope)
 * Example: corr_550e8400-e29b-41d4-a716-446655440000
 */
export function generateCorrelationId(): string {
  return `${ID_PREFIXES.CORRELATION}${crypto.randomUUID()}`;
}

/**
 * Generate a new machine ID with ULID format
 * Format: mach_<ULID> (sortable, timestamp-embedded)
 */
export function generateMachineId(): string {
  return `${ID_PREFIXES.MACHINE}${ulid()}`;
}

/**
 * Generate a generic ID (ULID without prefix)
 * Used for request_log, etc.
 */
export function generateId(): string {
  return ulid();
}

// ============================================================================
// Hashing & Canonicalization
// ============================================================================

/**
 * Compute SHA-256 hash of input string
 * Returns hex-encoded hash
 *
 * @param input - String to hash
 * @returns Hex-encoded SHA-256 hash (64 characters)
 */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive actor key ID from relay key
 * Returns first 16 hex characters of SHA-256 hash
 *
 * @param key - Relay key (secret)
 * @returns Actor key ID (16 hex chars = 8 bytes)
 * Example: "secret123" → "9f86d081884c7d65"
 */
export async function deriveActorKeyId(key: string): Promise<string> {
  const hash = await sha256(key);
  return hash.substring(0, 16);
}

/**
 * Canonicalize JSON object using RFC 8785
 * Ensures stable key ordering for hashing and deduplication
 *
 * @param obj - Object to canonicalize
 * @returns Canonical JSON string
 */
export function canonicalizeJson(obj: unknown): string {
  const result = canonicalize(obj);
  if (!result) {
    throw new Error('Failed to canonicalize JSON');
  }
  return result;
}

/**
 * Compute hash of canonical JSON
 * Used for payload_hash in handoffs and idempotency
 *
 * @param obj - Object to hash
 * @returns SHA-256 hash of canonical JSON
 */
export async function hashCanonicalJson(obj: unknown): Promise<string> {
  const canonical = canonicalizeJson(obj);
  return await sha256(canonical);
}

// ============================================================================
// Date & Time Utilities
// ============================================================================

/**
 * Get current timestamp in ISO 8601 format
 * Example: "2026-01-17T10:00:00.000Z"
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Get ISO 8601 timestamp for a specific date/time
 * @param date - Date object or milliseconds since epoch
 */
export function toIso(date: Date | number): string {
  return new Date(date).toISOString();
}

/**
 * Add seconds to current time and return ISO 8601 timestamp
 * Used for calculating expires_at, next_heartbeat_at, etc.
 *
 * @param seconds - Number of seconds to add
 * @returns ISO 8601 timestamp
 */
export function addSeconds(seconds: number): string {
  return toIso(Date.now() + seconds * 1000);
}

/**
 * Subtract minutes from current time and return ISO 8601 timestamp
 * Used for staleness detection queries
 *
 * @param minutes - Number of minutes to subtract
 * @returns ISO 8601 timestamp
 */
export function subtractMinutes(minutes: number): string {
  return toIso(Date.now() - minutes * 60 * 1000);
}

// ============================================================================
// Pagination Utilities
// ============================================================================

/**
 * Encode pagination cursor to base64url
 * Cursor format: { timestamp: ISO8601, id: ULID }
 *
 * @param cursor - Pagination cursor object
 * @returns Base64url-encoded cursor string
 */
export function encodeCursor(cursor: PaginationCursor): string {
  const json = JSON.stringify(cursor);
  const encoder = new TextEncoder();
  const data = encoder.encode(json);
  // Convert to base64 and make it URL-safe
  let base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Decode base64url pagination cursor
 *
 * @param encoded - Base64url-encoded cursor string
 * @returns Pagination cursor object
 * @throws Error if cursor is invalid
 */
export function decodeCursor(encoded: string): PaginationCursor {
  try {
    // Convert from URL-safe base64 back to standard base64
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if needed
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const decoded = atob(base64);
    const decoder = new TextDecoder();
    const data = Uint8Array.from(decoded, c => c.charCodeAt(0));
    const json = decoder.decode(data);
    const cursor = JSON.parse(json) as PaginationCursor;

    // Validate cursor structure
    if (!cursor.timestamp || !cursor.id) {
      throw new Error('Invalid cursor structure');
    }

    return cursor;
  } catch (error) {
    throw new Error(`Invalid pagination cursor: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

// ============================================================================
// Response Builders
// ============================================================================

/**
 * Build JSON response with headers
 *
 * @param data - Response body (will be JSON-stringified)
 * @param status - HTTP status code
 * @param correlationId - Optional correlation ID to include in header
 * @returns Response object
 */
export function jsonResponse(
  data: unknown,
  status: number = HTTP_STATUS.OK,
  correlationId?: string
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (correlationId) {
    headers['X-Correlation-ID'] = correlationId;
  }

  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers,
  });
}

/**
 * Build success response (alias for jsonResponse with 200 status)
 *
 * @param data - Response body
 * @param status - HTTP status code (default: 200)
 * @param correlationId - Optional correlation ID
 * @returns Response object
 */
export function successResponse(
  data: unknown,
  status: number = HTTP_STATUS.OK,
  correlationId?: string
): Response {
  return jsonResponse(data, status, correlationId);
}

/**
 * Build error response
 *
 * @param error - Error message
 * @param status - HTTP status code
 * @param correlationId - Correlation ID for tracing
 * @param details - Optional additional error details
 * @returns Response object
 */
export function errorResponse(
  error: string,
  status: number = HTTP_STATUS.INTERNAL_ERROR,
  correlationId?: string,
  details?: unknown
): Response {
  const body: ErrorResponse = {
    error,
    ...(details !== undefined && { details }),
    ...(correlationId && { correlation_id: correlationId }),
  };

  return jsonResponse(body, status, correlationId);
}

/**
 * Build validation error response
 * Used for JSON schema validation failures
 *
 * @param details - Array of validation error details
 * @param correlationId - Correlation ID for tracing
 * @returns Response object
 */
export function validationErrorResponse(
  details: ValidationErrorResponse['details'],
  correlationId: string
): Response {
  const body: ValidationErrorResponse = {
    error: 'validation_failed',
    details,
    correlation_id: correlationId,
  };

  return jsonResponse(body, HTTP_STATUS.BAD_REQUEST, correlationId);
}

/**
 * Build unauthorized response
 *
 * @param correlationId - Optional correlation ID
 * @returns Response object
 */
export function unauthorizedResponse(correlationId?: string): Response {
  return errorResponse(
    'Unauthorized: Invalid or missing X-Relay-Key',
    HTTP_STATUS.UNAUTHORIZED,
    correlationId
  );
}

/**
 * Build conflict response (for idempotency violations)
 *
 * @param message - Error message
 * @param correlationId - Correlation ID
 * @param details - Optional conflict details
 * @returns Response object
 */
export function conflictResponse(
  message: string,
  correlationId: string,
  details?: unknown
): Response {
  return errorResponse(message, HTTP_STATUS.CONFLICT, correlationId, details);
}

/**
 * Build payload too large response
 *
 * @param message - Error message
 * @param correlationId - Correlation ID
 * @param details - Optional size details
 * @returns Response object
 */
export function payloadTooLargeResponse(
  message: string,
  correlationId: string,
  details?: unknown
): Response {
  return errorResponse(message, HTTP_STATUS.PAYLOAD_TOO_LARGE, correlationId, details);
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate repo format (owner/repo)
 *
 * @param repo - Repo string to validate
 * @returns True if valid format
 */
export function isValidRepo(repo: string): boolean {
  return /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(repo);
}

/**
 * Validate venture enum
 *
 * @param venture - Venture string to validate
 * @returns True if valid venture
 */
export function isValidVenture(venture: string): boolean {
  return ['vc', 'sc', 'dfg'].includes(venture);
}

/**
 * Validate agent pattern
 *
 * @param agent - Agent string to validate
 * @returns True if valid agent format
 */
export function isValidAgent(agent: string): boolean {
  return /^[a-z0-9]+-[a-z0-9-]+$/.test(agent);
}

/**
 * Calculate size of string in bytes
 *
 * @param str - String to measure
 * @returns Size in bytes
 */
export function sizeInBytes(str: string): number {
  return new TextEncoder().encode(str).length;
}
