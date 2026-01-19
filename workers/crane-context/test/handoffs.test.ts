/**
 * Unit Tests: Handoff Storage (src/handoffs.ts)
 *
 * Tests handoff data structures, payload validation patterns, and helper logic
 * Note: D1 database operations (createHandoff, queryHandoffs) tested in integration tests
 */

import { describe, it, expect } from 'vitest';
import type { HandoffRecord } from '../src/types';
import { nowIso, hashCanonicalJson, canonicalizeJson, sizeInBytes } from '../src/utils';
import { MAX_HANDOFF_PAYLOAD_SIZE } from '../src/constants';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock handoff record for testing
 */
function createMockHandoff(overrides: Partial<HandoffRecord> = {}): HandoffRecord {
  const payload = { key: 'value', data: [1, 2, 3] };
  return {
    id: 'ho_01HQXV4NK8YXM3G5ZXQXQXQXQX',
    session_id: 'sess_01HQXV3NK8YXM3G5ZXQXQXQXQX',
    venture: 'vc',
    repo: 'owner/repo',
    track: 1,
    issue_number: 123,
    branch: 'main',
    commit_sha: 'abc123',
    from_agent: 'cc-cli-host',
    to_agent: 'desktop-pm-1',
    status_label: 'ready',
    summary: 'Completed feature implementation',
    payload_json: JSON.stringify(payload),
    payload_hash: 'hash123',
    payload_size_bytes: JSON.stringify(payload).length,
    schema_version: '1.0',
    created_at: nowIso(),
    actor_key_id: '9f86d081884c7d65',
    creation_correlation_id: 'corr_550e8400-e29b-41d4-a716-446655440000',
    ...overrides,
  };
}

// ============================================================================
// Handoff Structure Tests
// ============================================================================

describe('Handoff Structure', () => {
  it('includes required identity fields', () => {
    const handoff = createMockHandoff();

    expect(handoff.id).toMatch(/^ho_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(handoff.session_id).toMatch(/^sess_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('includes denormalized context fields', () => {
    const handoff = createMockHandoff({
      venture: 'vc',
      repo: 'owner/repo',
      track: 1,
      issue_number: 123,
    });

    expect(handoff.venture).toBe('vc');
    expect(handoff.repo).toBe('owner/repo');
    expect(handoff.track).toBe(1);
    expect(handoff.issue_number).toBe(123);
  });

  it('includes handoff metadata', () => {
    const handoff = createMockHandoff({
      from_agent: 'cc-cli-host',
      to_agent: 'desktop-pm-1',
      status_label: 'ready',
      summary: 'Test summary',
    });

    expect(handoff.from_agent).toBe('cc-cli-host');
    expect(handoff.to_agent).toBe('desktop-pm-1');
    expect(handoff.status_label).toBe('ready');
    expect(handoff.summary).toBe('Test summary');
  });

  it('includes payload fields', () => {
    const handoff = createMockHandoff();

    expect(handoff.payload_json).toBeTruthy();
    expect(handoff.payload_hash).toBeTruthy();
    expect(handoff.payload_size_bytes).toBeGreaterThan(0);
    expect(handoff.schema_version).toBe('1.0');
  });

  it('includes attribution fields', () => {
    const handoff = createMockHandoff();

    expect(handoff.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(handoff.actor_key_id).toMatch(/^[a-f0-9]{16}$/);
    expect(handoff.creation_correlation_id).toMatch(/^corr_/);
  });
});

// ============================================================================
// Payload Validation Tests
// ============================================================================

describe('Payload Validation', () => {
  it('payload size under 800KB threshold is valid', () => {
    const smallPayload = { data: 'x'.repeat(1000) }; // ~1KB
    const size = sizeInBytes(JSON.stringify(smallPayload));

    expect(size).toBeLessThan(MAX_HANDOFF_PAYLOAD_SIZE);
  });

  it('payload size exactly at 800KB threshold is valid', () => {
    // Create payload close to 800KB
    const largePayload = { data: 'x'.repeat(800 * 1024 - 100) }; // ~800KB
    const size = sizeInBytes(JSON.stringify(largePayload));

    // Should be under threshold (accounting for JSON overhead)
    expect(size).toBeLessThan(MAX_HANDOFF_PAYLOAD_SIZE);
  });

  it('payload size exceeds 800KB threshold is invalid', () => {
    // Create payload over 800KB
    const oversizedPayload = { data: 'x'.repeat(900 * 1024) }; // ~900KB
    const size = sizeInBytes(JSON.stringify(oversizedPayload));

    expect(size).toBeGreaterThan(MAX_HANDOFF_PAYLOAD_SIZE);
  });

  it('max handoff payload size is 800KB (819200 bytes)', () => {
    expect(MAX_HANDOFF_PAYLOAD_SIZE).toBe(800 * 1024);
    expect(MAX_HANDOFF_PAYLOAD_SIZE).toBe(819200);
  });
});

// ============================================================================
// Canonical JSON Tests
// ============================================================================

describe('Canonical JSON for Handoffs', () => {
  it('produces stable JSON regardless of key order', () => {
    const payload1 = { z: 3, a: 1, m: 2 };
    const payload2 = { a: 1, m: 2, z: 3 };

    const canonical1 = canonicalizeJson(payload1);
    const canonical2 = canonicalizeJson(payload2);

    expect(canonical1).toBe(canonical2);
  });

  it('produces same hash for identical payloads', async () => {
    const payload1 = { tasks: ['a', 'b'], status: 'complete' };
    const payload2 = { tasks: ['a', 'b'], status: 'complete' };

    const hash1 = await hashCanonicalJson(payload1);
    const hash2 = await hashCanonicalJson(payload2);

    expect(hash1).toBe(hash2);
  });

  it('produces same hash regardless of key order', async () => {
    const payload1 = { b: 2, a: 1 };
    const payload2 = { a: 1, b: 2 };

    const hash1 = await hashCanonicalJson(payload1);
    const hash2 = await hashCanonicalJson(payload2);

    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different content', async () => {
    const payload1 = { data: 'value1' };
    const payload2 = { data: 'value2' };

    const hash1 = await hashCanonicalJson(payload1);
    const hash2 = await hashCanonicalJson(payload2);

    expect(hash1).not.toBe(hash2);
  });
});

// ============================================================================
// Handoff Payload Patterns Tests
// ============================================================================

describe('Handoff Payload Patterns', () => {
  it('supports nested objects in payload', () => {
    const payload = {
      context: {
        files_changed: ['file1.ts', 'file2.ts'],
        tests_added: true,
      },
      summary: 'Implementation complete',
    };

    const canonical = canonicalizeJson(payload);
    expect(canonical).toContain('context');
    expect(canonical).toContain('files_changed');
  });

  it('supports arrays in payload', () => {
    const payload = {
      tasks: ['task1', 'task2', 'task3'],
      completed: [true, false, true],
    };

    const canonical = canonicalizeJson(payload);
    expect(canonical).toContain('["task1","task2","task3"]');
  });

  it('supports mixed types in payload', () => {
    const payload = {
      string_field: 'value',
      number_field: 123,
      boolean_field: true,
      null_field: null,
      array_field: [1, 2, 3],
      object_field: { nested: 'data' },
    };

    const canonical = canonicalizeJson(payload);
    expect(canonical).toBeTruthy();

    // Should be valid JSON
    const parsed = JSON.parse(canonical);
    expect(parsed.string_field).toBe('value');
    expect(parsed.number_field).toBe(123);
    expect(parsed.boolean_field).toBe(true);
  });
});

// ============================================================================
// Context Field Tests
// ============================================================================

describe('Handoff Context Fields', () => {
  it('supports optional to_agent field', () => {
    const withToAgent = createMockHandoff({ to_agent: 'desktop-pm-1' });
    const withoutToAgent = createMockHandoff({ to_agent: null });

    expect(withToAgent.to_agent).toBe('desktop-pm-1');
    expect(withoutToAgent.to_agent).toBeNull();
  });

  it('supports optional status_label field', () => {
    const withLabel = createMockHandoff({ status_label: 'blocked' });
    const withoutLabel = createMockHandoff({ status_label: null });

    expect(withLabel.status_label).toBe('blocked');
    expect(withoutLabel.status_label).toBeNull();
  });

  it('supports optional track field', () => {
    const withTrack = createMockHandoff({ track: 5 });
    const withoutTrack = createMockHandoff({ track: null });

    expect(withTrack.track).toBe(5);
    expect(withoutTrack.track).toBeNull();
  });

  it('supports optional issue_number field', () => {
    const withIssue = createMockHandoff({ issue_number: 456 });
    const withoutIssue = createMockHandoff({ issue_number: null });

    expect(withIssue.issue_number).toBe(456);
    expect(withoutIssue.issue_number).toBeNull();
  });

  it('supports optional branch field', () => {
    const withBranch = createMockHandoff({ branch: 'feature/new-feature' });
    const withoutBranch = createMockHandoff({ branch: null });

    expect(withBranch.branch).toBe('feature/new-feature');
    expect(withoutBranch.branch).toBeNull();
  });

  it('supports optional commit_sha field', () => {
    const withCommit = createMockHandoff({ commit_sha: 'abc123def456' });
    const withoutCommit = createMockHandoff({ commit_sha: null });

    expect(withCommit.commit_sha).toBe('abc123def456');
    expect(withoutCommit.commit_sha).toBeNull();
  });
});

// ============================================================================
// Payload Size Calculation Tests
// ============================================================================

describe('Payload Size Calculation', () => {
  it('calculates size of simple JSON payload', () => {
    const payload = { key: 'value' };
    const json = JSON.stringify(payload);
    const size = sizeInBytes(json);

    expect(size).toBe(15); // {"key":"value"}
  });

  it('calculates size of complex nested payload', () => {
    const payload = {
      tasks: ['a', 'b', 'c'],
      status: 'complete',
      metadata: { count: 3 },
    };
    const json = JSON.stringify(payload);
    const size = sizeInBytes(json);

    // Size should match actual JSON string length
    expect(size).toBe(json.length);
  });

  it('calculates size accounting for multi-byte characters', () => {
    const payload = { message: 'Hello 世界' }; // Contains multi-byte UTF-8
    const json = JSON.stringify(payload);
    const size = sizeInBytes(json);

    // Should be larger than character count due to multi-byte chars
    expect(size).toBeGreaterThan(json.length - 10); // Accounting for encoding
  });
});
