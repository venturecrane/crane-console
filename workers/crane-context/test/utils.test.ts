/**
 * Unit Tests: Core Utilities (src/utils.ts)
 *
 * Tests ID generation, hashing, canonical JSON, pagination, and date/time utilities
 */

import { describe, it, expect } from 'vitest';
import {
  generateSessionId,
  generateHandoffId,
  generateCorrelationId,
  generateId,
  sha256,
  deriveActorKeyId,
  canonicalizeJson,
  hashCanonicalJson,
  nowIso,
  toIso,
  addSeconds,
  subtractMinutes,
  encodeCursor,
  decodeCursor,
  isValidRepo,
  isValidVenture,
  isValidAgent,
  sizeInBytes,
} from '../src/utils';
import { ID_PREFIXES } from '../src/constants';

// ============================================================================
// ID Generation Tests
// ============================================================================

describe('ID Generation', () => {
  describe('generateSessionId', () => {
    it('generates ID with sess_ prefix', () => {
      const id = generateSessionId();
      expect(id).toMatch(/^sess_[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it('generates unique IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      expect(id1).not.toBe(id2);
    });

    it('uses correct prefix from constants', () => {
      const id = generateSessionId();
      expect(id.startsWith(ID_PREFIXES.SESSION)).toBe(true);
    });
  });

  describe('generateHandoffId', () => {
    it('generates ID with ho_ prefix', () => {
      const id = generateHandoffId();
      expect(id).toMatch(/^ho_[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it('generates unique IDs', () => {
      const id1 = generateHandoffId();
      const id2 = generateHandoffId();
      expect(id1).not.toBe(id2);
    });

    it('uses correct prefix from constants', () => {
      const id = generateHandoffId();
      expect(id.startsWith(ID_PREFIXES.HANDOFF)).toBe(true);
    });
  });

  describe('generateCorrelationId', () => {
    it('generates ID with corr_ prefix and UUID format', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^corr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('generates unique IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });

    it('uses correct prefix from constants', () => {
      const id = generateCorrelationId();
      expect(id.startsWith(ID_PREFIXES.CORRELATION)).toBe(true);
    });
  });

  describe('generateId', () => {
    it('generates ULID without prefix', () => {
      const id = generateId();
      expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it('generates unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });
  });
});

// ============================================================================
// Hashing Tests
// ============================================================================

describe('Hashing & Canonicalization', () => {
  describe('sha256', () => {
    it('computes SHA-256 hash as 64 hex characters', async () => {
      const hash = await sha256('test input');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces consistent hash for same input', async () => {
      const hash1 = await sha256('test input');
      const hash2 = await sha256('test input');
      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different input', async () => {
      const hash1 = await sha256('input 1');
      const hash2 = await sha256('input 2');
      expect(hash1).not.toBe(hash2);
    });

    it('handles empty string', async () => {
      const hash = await sha256('');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      // SHA-256 of empty string is known value
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('deriveActorKeyId', () => {
    it('derives 16 hex character ID from key', async () => {
      const keyId = await deriveActorKeyId('test-relay-key');
      expect(keyId).toMatch(/^[a-f0-9]{16}$/);
    });

    it('produces consistent ID for same key', async () => {
      const keyId1 = await deriveActorKeyId('test-relay-key');
      const keyId2 = await deriveActorKeyId('test-relay-key');
      expect(keyId1).toBe(keyId2);
    });

    it('produces different ID for different key', async () => {
      const keyId1 = await deriveActorKeyId('key-1');
      const keyId2 = await deriveActorKeyId('key-2');
      expect(keyId1).not.toBe(keyId2);
    });

    it('derives ID from first 16 hex chars of SHA-256', async () => {
      const key = 'test-key';
      const fullHash = await sha256(key);
      const keyId = await deriveActorKeyId(key);
      expect(keyId).toBe(fullHash.substring(0, 16));
    });
  });

  describe('canonicalizeJson', () => {
    it('produces RFC 8785 canonical JSON', () => {
      const obj = { b: 2, a: 1 };
      const canonical = canonicalizeJson(obj);
      expect(canonical).toBe('{"a":1,"b":2}'); // Keys sorted
    });

    it('produces same output regardless of input key order', () => {
      const obj1 = { z: 3, a: 1, m: 2 };
      const obj2 = { a: 1, m: 2, z: 3 };
      const canonical1 = canonicalizeJson(obj1);
      const canonical2 = canonicalizeJson(obj2);
      expect(canonical1).toBe(canonical2);
    });

    it('handles nested objects', () => {
      const obj = { outer: { b: 2, a: 1 }, top: 'value' };
      const canonical = canonicalizeJson(obj);
      expect(canonical).toBe('{"outer":{"a":1,"b":2},"top":"value"}');
    });

    it('handles arrays', () => {
      const obj = { arr: [3, 1, 2], key: 'value' };
      const canonical = canonicalizeJson(obj);
      expect(canonical).toBe('{"arr":[3,1,2],"key":"value"}');
    });

    it('throws error for undefined values', () => {
      expect(() => canonicalizeJson(undefined)).toThrow();
    });
  });

  describe('hashCanonicalJson', () => {
    it('computes hash of canonical JSON', async () => {
      const obj = { b: 2, a: 1 };
      const hash = await hashCanonicalJson(obj);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces same hash for objects with different key order', async () => {
      const obj1 = { z: 3, a: 1, m: 2 };
      const obj2 = { a: 1, m: 2, z: 3 };
      const hash1 = await hashCanonicalJson(obj1);
      const hash2 = await hashCanonicalJson(obj2);
      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different content', async () => {
      const obj1 = { a: 1 };
      const obj2 = { a: 2 };
      const hash1 = await hashCanonicalJson(obj1);
      const hash2 = await hashCanonicalJson(obj2);
      expect(hash1).not.toBe(hash2);
    });
  });
});

// ============================================================================
// Date & Time Tests
// ============================================================================

describe('Date & Time Utilities', () => {
  describe('nowIso', () => {
    it('returns ISO 8601 timestamp', () => {
      const timestamp = nowIso();
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('returns current time', () => {
      const before = Date.now();
      const timestamp = nowIso();
      const after = Date.now();

      const parsed = new Date(timestamp).getTime();
      expect(parsed).toBeGreaterThanOrEqual(before);
      expect(parsed).toBeLessThanOrEqual(after);
    });
  });

  describe('toIso', () => {
    it('converts Date to ISO 8601', () => {
      const date = new Date('2026-01-17T10:00:00.000Z');
      const iso = toIso(date);
      expect(iso).toBe('2026-01-17T10:00:00.000Z');
    });

    it('converts milliseconds to ISO 8601', () => {
      const ms = new Date('2026-01-17T10:00:00.000Z').getTime();
      const iso = toIso(ms);
      expect(iso).toBe('2026-01-17T10:00:00.000Z');
    });
  });

  describe('addSeconds', () => {
    it('adds seconds to current time', () => {
      const before = Date.now();
      const future = addSeconds(60); // 1 minute
      const after = Date.now();

      const parsed = new Date(future).getTime();
      expect(parsed).toBeGreaterThanOrEqual(before + 60000);
      expect(parsed).toBeLessThanOrEqual(after + 60000);
    });

    it('returns ISO 8601 format', () => {
      const future = addSeconds(3600); // 1 hour
      expect(future).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('handles negative seconds (subtract)', () => {
      const past = addSeconds(-60); // 1 minute ago
      const now = Date.now();
      const parsed = new Date(past).getTime();
      expect(parsed).toBeLessThanOrEqual(now);
    });
  });

  describe('subtractMinutes', () => {
    it('subtracts minutes from current time', () => {
      const now = Date.now();
      const past = subtractMinutes(45);
      const parsed = new Date(past).getTime();

      // Should be ~45 minutes ago
      expect(parsed).toBeLessThanOrEqual(now);
      expect(parsed).toBeGreaterThan(now - 46 * 60 * 1000); // Within 46 minutes
      expect(parsed).toBeLessThan(now - 44 * 60 * 1000); // More than 44 minutes ago
    });

    it('returns ISO 8601 format', () => {
      const past = subtractMinutes(30);
      expect(past).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});

// ============================================================================
// Pagination Tests
// ============================================================================

describe('Pagination Utilities', () => {
  describe('encodeCursor and decodeCursor', () => {
    it('encodes and decodes cursor correctly', () => {
      const cursor = {
        timestamp: '2026-01-17T10:00:00.000Z',
        id: 'sess_01HQXV3NK8YXM3G5ZXQXQXQXQX',
      };

      const encoded = encodeCursor(cursor);
      const decoded = decodeCursor(encoded);

      expect(decoded).toEqual(cursor);
    });

    it('produces base64url-safe encoding', () => {
      const cursor = {
        timestamp: '2026-01-17T10:00:00.000Z',
        id: 'sess_01HQXV3NK8YXM3G5ZXQXQXQXQX',
      };

      const encoded = encodeCursor(cursor);

      // Should not contain +, /, or =
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');

      // Should only contain URL-safe characters
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('throws error for invalid cursor', () => {
      expect(() => decodeCursor('invalid-cursor')).toThrow();
    });

    it('throws error for cursor missing timestamp', () => {
      const invalidCursor = { id: 'test' };
      const encoded = btoa(JSON.stringify(invalidCursor));
      expect(() => decodeCursor(encoded)).toThrow(/Invalid cursor structure/);
    });

    it('throws error for cursor missing id', () => {
      const invalidCursor = { timestamp: '2026-01-17T10:00:00.000Z' };
      const encoded = btoa(JSON.stringify(invalidCursor));
      expect(() => decodeCursor(encoded)).toThrow(/Invalid cursor structure/);
    });
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('Validation Utilities', () => {
  describe('isValidRepo', () => {
    it('accepts valid owner/repo format', () => {
      expect(isValidRepo('owner/repo')).toBe(true);
      expect(isValidRepo('my-org/my-repo')).toBe(true);
      expect(isValidRepo('org_name/repo_name')).toBe(true);
      expect(isValidRepo('Org123/Repo456')).toBe(true);
    });

    it('rejects invalid formats', () => {
      expect(isValidRepo('no-slash')).toBe(false);
      expect(isValidRepo('/no-owner')).toBe(false);
      expect(isValidRepo('no-repo/')).toBe(false);
      expect(isValidRepo('owner/repo/extra')).toBe(false);
      expect(isValidRepo('owner with spaces/repo')).toBe(false);
    });
  });

  describe('isValidVenture', () => {
    it('accepts valid ventures', () => {
      expect(isValidVenture('vc')).toBe(true);
      expect(isValidVenture('sc')).toBe(true);
      expect(isValidVenture('dfg')).toBe(true);
      expect(isValidVenture('ke')).toBe(true);
      expect(isValidVenture('smd')).toBe(true);
      expect(isValidVenture('dc')).toBe(true);
    });

    it('rejects invalid ventures', () => {
      expect(isValidVenture('invalid')).toBe(false);
      expect(isValidVenture('VC')).toBe(false); // Case sensitive
      expect(isValidVenture('venture-crane')).toBe(false);
      expect(isValidVenture('')).toBe(false);
    });
  });

  describe('isValidAgent', () => {
    it('accepts valid agent patterns', () => {
      expect(isValidAgent('cc-cli-host')).toBe(true);
      expect(isValidAgent('desktop-pm-1')).toBe(true);
      expect(isValidAgent('agent-name')).toBe(true);
    });

    it('rejects invalid patterns', () => {
      expect(isValidAgent('no_underscores')).toBe(false);
      expect(isValidAgent('NoUpperCase')).toBe(false);
      expect(isValidAgent('no spaces')).toBe(false);
      expect(isValidAgent('nohyphen')).toBe(false);
      expect(isValidAgent('-starts-with-hyphen')).toBe(false);
    });
  });

  describe('sizeInBytes', () => {
    it('calculates byte size of ASCII string', () => {
      expect(sizeInBytes('hello')).toBe(5);
      expect(sizeInBytes('test')).toBe(4);
    });

    it('calculates byte size of multi-byte characters', () => {
      // UTF-8: emoji takes 4 bytes
      expect(sizeInBytes('😀')).toBe(4);

      // UTF-8: accented characters take 2 bytes
      expect(sizeInBytes('café')).toBe(5); // c(1) + a(1) + f(1) + é(2)
    });

    it('handles empty string', () => {
      expect(sizeInBytes('')).toBe(0);
    });

    it('calculates size for JSON strings', () => {
      const json = JSON.stringify({ key: 'value' });
      expect(sizeInBytes(json)).toBe(15); // {"key":"value"}
    });
  });
});
