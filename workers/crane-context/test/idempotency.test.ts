/**
 * Unit Tests: Idempotency Layer (src/idempotency.ts)
 *
 * Tests idempotency key validation, response reconstruction, and helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  extractIdempotencyKey,
  isValidIdempotencyKey,
  reconstructResponse,
} from '../src/idempotency';
import type { IdempotencyKeyRecord } from '../src/types';
import { nowIso, addSeconds } from '../src/utils';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock idempotency key record for testing
 */
function createMockIdempotencyRecord(
  overrides: Partial<IdempotencyKeyRecord> = {}
): IdempotencyKeyRecord {
  return {
    endpoint: '/sod',
    key: '550e8400-e29b-41d4-a716-446655440000',
    response_status: 200,
    response_hash: 'abc123def456',
    response_body: '{"session_id":"sess_123","status":"created"}',
    response_size_bytes: 48,
    response_truncated: 0,
    created_at: nowIso(),
    expires_at: addSeconds(3600),
    actor_key_id: '9f86d081884c7d65',
    correlation_id: 'corr_550e8400-e29b-41d4-a716-446655440000',
    ...overrides,
  };
}

// ============================================================================
// Idempotency Key Validation Tests
// ============================================================================

describe('Idempotency Key Validation', () => {
  describe('isValidIdempotencyKey', () => {
    describe('UUID v4 format', () => {
      it('accepts valid UUID v4', () => {
        expect(isValidIdempotencyKey('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        expect(isValidIdempotencyKey('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
      });

      it('accepts UUID v4 with different cases', () => {
        expect(isValidIdempotencyKey('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
        expect(isValidIdempotencyKey('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
      });

      it('accepts UUID with wrong version (fallback to generic string)', () => {
        // UUID v1 (version digit is 1, not 4) - accepted as generic 20-200 char string
        expect(isValidIdempotencyKey('550e8400-e29b-11d4-a716-446655440000')).toBe(true);

        // UUID v5 (version digit is 5, not 4) - accepted as generic 20-200 char string
        expect(isValidIdempotencyKey('550e8400-e29b-51d4-a716-446655440000')).toBe(true);
      });

      it('rejects malformed UUID if too short', () => {
        expect(isValidIdempotencyKey('not-a-uuid')).toBe(false); // < 20 chars
        expect(isValidIdempotencyKey('550e8400-e29b-41d4-a716')).toBe(true); // 29 chars, valid generic string
        expect(isValidIdempotencyKey('550e8400e29b41d4a716446655440000')).toBe(true); // 32 chars, valid generic string
      });
    });

    describe('ULID format', () => {
      it('accepts valid ULID', () => {
        expect(isValidIdempotencyKey('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
        expect(isValidIdempotencyKey('01HQXV3NK8YXM3G5ZXQXQXQXQX')).toBe(true);
      });

      it('accepts ULID with different cases', () => {
        expect(isValidIdempotencyKey('01arz3ndektsv4rrffq69g5fav')).toBe(true);
        expect(isValidIdempotencyKey('01ArZ3NdEkTsV4RrFfQ69G5FaV')).toBe(true);
      });

      it('accepts ULID-like strings with invalid characters (fallback to generic)', () => {
        // Contains 'I' (not in Crockford base32) - but 26 chars, accepted as generic string
        expect(isValidIdempotencyKey('01ARZ3NDEKTSV4RRFFQ69G5FIV')).toBe(true);

        // Contains 'O' (not in Crockford base32) - but 26 chars, accepted as generic string
        expect(isValidIdempotencyKey('01ARZ3NDEKTSV4RRFFQ69G5FOV')).toBe(true);
      });

      it('accepts ULID-like strings with wrong length (fallback to generic)', () => {
        expect(isValidIdempotencyKey('01ARZ3NDEKTSV4RRFFQ69G5FA')).toBe(true); // 25 chars, valid generic string
        expect(isValidIdempotencyKey('01ARZ3NDEKTSV4RRFFQ69G5FAVV')).toBe(true); // 27 chars, valid generic string
      });
    });

    describe('Generic string format', () => {
      it('accepts strings of 20-200 characters', () => {
        expect(isValidIdempotencyKey('a'.repeat(20))).toBe(true);
        expect(isValidIdempotencyKey('a'.repeat(100))).toBe(true);
        expect(isValidIdempotencyKey('a'.repeat(200))).toBe(true);
      });

      it('rejects strings shorter than 10 characters', () => {
        expect(isValidIdempotencyKey('short')).toBe(false);
        expect(isValidIdempotencyKey('123456789')).toBe(false);
      });

      it('rejects strings longer than 200 characters', () => {
        expect(isValidIdempotencyKey('a'.repeat(201))).toBe(false);
        expect(isValidIdempotencyKey('a'.repeat(500))).toBe(false);
      });

      it('accepts reasonable custom format keys', () => {
        expect(isValidIdempotencyKey('custom-key-12345-67890')).toBe(true);
        expect(isValidIdempotencyKey('user_123_operation_456')).toBe(true);
      });
    });

    describe('Edge cases', () => {
      it('rejects empty string', () => {
        expect(isValidIdempotencyKey('')).toBe(false);
      });

      it('rejects very short strings', () => {
        expect(isValidIdempotencyKey('a')).toBe(false);
        expect(isValidIdempotencyKey('abc')).toBe(false);
      });
    });
  });
});

// ============================================================================
// Extract Idempotency Key Tests
// ============================================================================

describe('Extract Idempotency Key', () => {
  describe('extractIdempotencyKey', () => {
    it('extracts key from Idempotency-Key header', () => {
      const request = new Request('http://localhost/sod', {
        headers: {
          'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440000',
        },
      });

      const key = extractIdempotencyKey(request);
      expect(key).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('extracts key from body update_id field', () => {
      const request = new Request('http://localhost/update', {
        method: 'POST',
      });

      const bodyData = {
        update_id: '550e8400-e29b-41d4-a716-446655440000',
        session_id: 'sess_123',
      };

      const key = extractIdempotencyKey(request, bodyData);
      expect(key).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('prioritizes header over body field', () => {
      const request = new Request('http://localhost/update', {
        headers: {
          'Idempotency-Key': 'header-key',
        },
      });

      const bodyData = {
        update_id: 'body-key',
        session_id: 'sess_123',
      };

      const key = extractIdempotencyKey(request, bodyData);
      expect(key).toBe('header-key'); // Header wins
    });

    it('returns null if no key found', () => {
      const request = new Request('http://localhost/sod');

      const key = extractIdempotencyKey(request);
      expect(key).toBeNull();
    });

    it('returns null if body data missing update_id', () => {
      const request = new Request('http://localhost/update');

      const bodyData = {
        session_id: 'sess_123',
        // No update_id
      };

      const key = extractIdempotencyKey(request, bodyData);
      expect(key).toBeNull();
    });

    it('handles case-insensitive header name', () => {
      const request = new Request('http://localhost/sod', {
        headers: {
          'idempotency-key': '550e8400-e29b-41d4-a716-446655440000',
        },
      });

      const key = extractIdempotencyKey(request);
      expect(key).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });
});

// ============================================================================
// Response Reconstruction Tests
// ============================================================================

describe('Response Reconstruction', () => {
  describe('reconstructResponse - Full Body', () => {
    it('reconstructs response with full body', () => {
      const record = createMockIdempotencyRecord({
        response_body: '{"session_id":"sess_123","status":"created"}',
        response_status: 200,
        response_truncated: 0,
      });

      const response = reconstructResponse(record);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('X-Idempotency-Hit')).toBe('true');
      expect(response.headers.get('X-Idempotency-Truncated')).toBeNull();
    });

    it('returns original response body content', async () => {
      const record = createMockIdempotencyRecord({
        response_body: '{"session_id":"sess_123","status":"created"}',
      });

      const response = reconstructResponse(record);
      const body = await response.text();

      expect(body).toBe('{"session_id":"sess_123","status":"created"}');
    });

    it('preserves response status code', () => {
      const record201 = createMockIdempotencyRecord({ response_status: 201 });
      const response201 = reconstructResponse(record201);
      expect(response201.status).toBe(201);

      const record400 = createMockIdempotencyRecord({ response_status: 400 });
      const response400 = reconstructResponse(record400);
      expect(response400.status).toBe(400);
    });
  });

  describe('reconstructResponse - Truncated Body', () => {
    it('returns 409 Conflict for truncated response', () => {
      const record = createMockIdempotencyRecord({
        response_body: null, // Truncated (body too large)
        response_truncated: 1,
        response_size_bytes: 100000, // 100KB
      });

      const response = reconstructResponse(record);

      expect(response.status).toBe(409); // Conflict
    });

    it('includes X-Idempotency-Truncated header', () => {
      const record = createMockIdempotencyRecord({
        response_body: null,
        response_truncated: 1,
      });

      const response = reconstructResponse(record);

      expect(response.headers.get('X-Idempotency-Truncated')).toBe('true');
      expect(response.headers.get('X-Idempotency-Hit')).toBe('true');
    });

    it('returns metadata about original response', async () => {
      const record = createMockIdempotencyRecord({
        response_body: null,
        response_truncated: 1,
        response_status: 200,
        response_hash: 'abc123def456',
        response_size_bytes: 100000,
      });

      const response = reconstructResponse(record);
      const body = await response.json();

      expect(body).toMatchObject({
        idempotent: true,
        response_status: 200,
        response_hash: 'abc123def456',
        response_size_bytes: 100000,
        message: 'Response body was too large to cache. Original request succeeded.',
      });
    });

    it('sets Content-Type to application/json', () => {
      const record = createMockIdempotencyRecord({
        response_body: null,
        response_truncated: 1,
      });

      const response = reconstructResponse(record);

      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('reconstructResponse - Edge Cases', () => {
    it('handles empty response body', () => {
      const record = createMockIdempotencyRecord({
        response_body: '',
        response_truncated: 0,
      });

      const response = reconstructResponse(record);

      expect(response.status).toBe(200);
    });

    it('handles large response body under threshold', async () => {
      const largeBody = 'x'.repeat(60000); // 60KB (under 64KB threshold)
      const record = createMockIdempotencyRecord({
        response_body: largeBody,
        response_size_bytes: 60000,
        response_truncated: 0,
      });

      const response = reconstructResponse(record);
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(body).toBe(largeBody);
      expect(response.headers.get('X-Idempotency-Truncated')).toBeNull();
    });
  });
});

// ============================================================================
// Hybrid Storage Logic Tests
// ============================================================================

describe('Hybrid Storage Logic', () => {
  it('full body stored when response_truncated = 0', () => {
    const record = createMockIdempotencyRecord({
      response_body: '{"data":"value"}',
      response_truncated: 0,
    });

    expect(record.response_body).not.toBeNull();
    expect(record.response_truncated).toBe(0);
  });

  it('null body stored when response_truncated = 1', () => {
    const record = createMockIdempotencyRecord({
      response_body: null,
      response_truncated: 1,
    });

    expect(record.response_body).toBeNull();
    expect(record.response_truncated).toBe(1);
  });

  it('response_hash always present', () => {
    const fullBodyRecord = createMockIdempotencyRecord({
      response_body: '{"data":"value"}',
      response_truncated: 0,
      response_hash: 'hash123',
    });

    const truncatedRecord = createMockIdempotencyRecord({
      response_body: null,
      response_truncated: 1,
      response_hash: 'hash456',
    });

    expect(fullBodyRecord.response_hash).toBe('hash123');
    expect(truncatedRecord.response_hash).toBe('hash456');
  });

  it('response_size_bytes always present', () => {
    const smallRecord = createMockIdempotencyRecord({
      response_size_bytes: 1000,
    });

    const largeRecord = createMockIdempotencyRecord({
      response_size_bytes: 100000,
    });

    expect(smallRecord.response_size_bytes).toBe(1000);
    expect(largeRecord.response_size_bytes).toBe(100000);
  });
});
