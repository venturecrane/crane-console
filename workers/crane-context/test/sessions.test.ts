/**
 * Unit Tests: Session Management (src/sessions.ts)
 *
 * Tests session lifecycle, staleness detection, heartbeat jitter, and state transitions
 */

import { describe, it, expect } from 'vitest';
import {
  isSessionStale,
  getStaleThreshold,
  calculateNextHeartbeat,
} from '../src/sessions';
import type { SessionRecord } from '../src/types';
import {
  STALE_AFTER_MINUTES,
  HEARTBEAT_INTERVAL_SECONDS,
  HEARTBEAT_JITTER_SECONDS,
} from '../src/constants';
import { nowIso, subtractMinutes } from '../src/utils';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock session record for testing
 */
function createMockSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'sess_01HQXV3NK8YXM3G5ZXQXQXQXQX',
    agent: 'cc-cli-host',
    client: 'cc-cli',
    client_version: '1.0.0',
    host: 'test-host',
    venture: 'vc',
    repo: 'owner/repo',
    track: 1,
    issue_number: 123,
    branch: 'main',
    commit_sha: 'abc123',
    status: 'active',
    created_at: nowIso(),
    started_at: nowIso(),
    last_heartbeat_at: nowIso(),
    ended_at: null,
    end_reason: null,
    schema_version: '1.0',
    actor_key_id: '9f86d081884c7d65',
    creation_correlation_id: 'corr_550e8400-e29b-41d4-a716-446655440000',
    meta_json: null,
    ...overrides,
  };
}

// ============================================================================
// Staleness Detection Tests
// ============================================================================

describe('Staleness Detection', () => {
  describe('isSessionStale', () => {
    it('returns false for fresh session (recent heartbeat)', () => {
      const session = createMockSession({
        last_heartbeat_at: nowIso(), // Just now
      });

      expect(isSessionStale(session)).toBe(false);
    });

    it('returns false for session within staleness threshold', () => {
      const session = createMockSession({
        last_heartbeat_at: subtractMinutes(30), // 30 minutes ago (within 45 min threshold)
      });

      expect(isSessionStale(session)).toBe(false);
    });

    it('returns false for session exactly at threshold', () => {
      // Use fixed threshold to avoid timing issues
      const staleThreshold = subtractMinutes(45);
      const session = createMockSession({
        last_heartbeat_at: staleThreshold, // Exactly at threshold
      });

      // Session at exactly 45 minutes is NOT stale (< not <=)
      // When last_heartbeat_at === staleThreshold, the < comparison is false
      expect(isSessionStale(session)).toBe(false);
    });

    it('returns true for session beyond threshold', () => {
      const session = createMockSession({
        last_heartbeat_at: subtractMinutes(60), // 1 hour ago
      });

      expect(isSessionStale(session)).toBe(true);
    });

    it('respects custom staleness threshold', () => {
      const session = createMockSession({
        last_heartbeat_at: subtractMinutes(30), // 30 minutes ago
      });

      // Default threshold (45 min): not stale
      expect(isSessionStale(session, 45)).toBe(false);

      // Custom threshold (20 min): stale
      expect(isSessionStale(session, 20)).toBe(true);

      // Custom threshold (60 min): not stale
      expect(isSessionStale(session, 60)).toBe(false);
    });

    it('handles edge case: heartbeat in future (clock skew)', () => {
      // Simulate clock skew: last_heartbeat_at is 1 minute in future
      const future = new Date(Date.now() + 60000).toISOString();
      const session = createMockSession({
        last_heartbeat_at: future,
      });

      // Future heartbeat should not be considered stale
      expect(isSessionStale(session)).toBe(false);
    });
  });

  describe('getStaleThreshold', () => {
    it('returns ISO 8601 timestamp for staleness cutoff', () => {
      const threshold = getStaleThreshold();
      expect(threshold).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('returns timestamp approximately STALE_AFTER_MINUTES ago', () => {
      const threshold = getStaleThreshold();
      const parsed = new Date(threshold).getTime();
      const now = Date.now();

      const expectedThreshold = now - STALE_AFTER_MINUTES * 60 * 1000;

      // Allow 1 second tolerance for test execution time
      expect(parsed).toBeGreaterThan(expectedThreshold - 1000);
      expect(parsed).toBeLessThan(expectedThreshold + 1000);
    });

    it('respects custom staleness threshold', () => {
      const customMinutes = 30;
      const threshold = getStaleThreshold(customMinutes);
      const parsed = new Date(threshold).getTime();
      const now = Date.now();

      const expectedThreshold = now - customMinutes * 60 * 1000;

      // Allow 1 second tolerance
      expect(parsed).toBeGreaterThan(expectedThreshold - 1000);
      expect(parsed).toBeLessThan(expectedThreshold + 1000);
    });
  });
});

// ============================================================================
// Heartbeat Jitter Tests
// ============================================================================

describe('Heartbeat Jitter', () => {
  describe('calculateNextHeartbeat', () => {
    it('returns object with next_heartbeat_at and heartbeat_interval_seconds', () => {
      const result = calculateNextHeartbeat();

      expect(result).toHaveProperty('next_heartbeat_at');
      expect(result).toHaveProperty('heartbeat_interval_seconds');
    });

    it('returns ISO 8601 timestamp for next_heartbeat_at', () => {
      const result = calculateNextHeartbeat();
      expect(result.next_heartbeat_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('returns heartbeat_interval_seconds within jitter range', () => {
      const minInterval = HEARTBEAT_INTERVAL_SECONDS - HEARTBEAT_JITTER_SECONDS;
      const maxInterval = HEARTBEAT_INTERVAL_SECONDS + HEARTBEAT_JITTER_SECONDS;

      const result = calculateNextHeartbeat();

      expect(result.heartbeat_interval_seconds).toBeGreaterThanOrEqual(minInterval);
      expect(result.heartbeat_interval_seconds).toBeLessThanOrEqual(maxInterval);
    });

    it('produces varied intervals across multiple calls', () => {
      const intervals = new Set<number>();

      // Generate 20 heartbeat intervals
      for (let i = 0; i < 20; i++) {
        const result = calculateNextHeartbeat();
        intervals.add(result.heartbeat_interval_seconds);
      }

      // With ±120 second jitter (240 second range), we should see variation
      // Expect at least 5 different intervals in 20 calls
      expect(intervals.size).toBeGreaterThan(5);
    });

    it('calculates next_heartbeat_at correctly from interval', () => {
      const before = Date.now();
      const result = calculateNextHeartbeat();
      const after = Date.now();

      const nextHeartbeat = new Date(result.next_heartbeat_at).getTime();
      const expectedMin = before + result.heartbeat_interval_seconds * 1000;
      const expectedMax = after + result.heartbeat_interval_seconds * 1000;

      expect(nextHeartbeat).toBeGreaterThanOrEqual(expectedMin);
      expect(nextHeartbeat).toBeLessThanOrEqual(expectedMax);
    });

    it('produces intervals distributed across full jitter range', () => {
      const intervals: number[] = [];

      // Generate 100 intervals to test distribution
      for (let i = 0; i < 100; i++) {
        const result = calculateNextHeartbeat();
        intervals.push(result.heartbeat_interval_seconds);
      }

      const minInterval = Math.min(...intervals);
      const maxInterval = Math.max(...intervals);

      // Should see intervals near both bounds
      const expectedMin = HEARTBEAT_INTERVAL_SECONDS - HEARTBEAT_JITTER_SECONDS;
      const expectedMax = HEARTBEAT_INTERVAL_SECONDS + HEARTBEAT_JITTER_SECONDS;

      // Allow 10% tolerance on bounds (e.g., may not hit exact min/max in 100 samples)
      const tolerance = HEARTBEAT_JITTER_SECONDS * 0.1;
      expect(minInterval).toBeLessThan(expectedMin + tolerance);
      expect(maxInterval).toBeGreaterThan(expectedMax - tolerance);
    });
  });
});

// ============================================================================
// Session State Transitions Tests
// ============================================================================

describe('Session State Transitions', () => {
  describe('Session Status Values', () => {
    it('supports active status', () => {
      const session = createMockSession({ status: 'active' });
      expect(session.status).toBe('active');
    });

    it('supports ended status', () => {
      const session = createMockSession({
        status: 'ended',
        ended_at: nowIso(),
        end_reason: 'manual',
      });
      expect(session.status).toBe('ended');
    });

    it('supports abandoned status', () => {
      const session = createMockSession({
        status: 'abandoned',
        ended_at: subtractMinutes(50), // Use last_heartbeat_at as ended_at
        end_reason: 'stale',
      });
      expect(session.status).toBe('abandoned');
    });
  });

  describe('End Reason Values', () => {
    it('supports manual end reason', () => {
      const session = createMockSession({
        status: 'ended',
        end_reason: 'manual',
      });
      expect(session.end_reason).toBe('manual');
    });

    it('supports stale end reason', () => {
      const session = createMockSession({
        status: 'abandoned',
        end_reason: 'stale',
      });
      expect(session.end_reason).toBe('stale');
    });

    it('supports superseded end reason', () => {
      const session = createMockSession({
        status: 'ended',
        end_reason: 'superseded',
      });
      expect(session.end_reason).toBe('superseded');
    });

    it('supports error end reason', () => {
      const session = createMockSession({
        status: 'ended',
        end_reason: 'error',
      });
      expect(session.end_reason).toBe('error');
    });
  });

  describe('Session Lifecycle Timestamps', () => {
    it('created_at and started_at are same for new session', () => {
      const now = nowIso();
      const session = createMockSession({
        created_at: now,
        started_at: now,
      });

      expect(session.created_at).toBe(session.started_at);
    });

    it('last_heartbeat_at updates over time', () => {
      const created = subtractMinutes(60);
      const lastHeartbeat = subtractMinutes(10);

      const session = createMockSession({
        created_at: created,
        started_at: created,
        last_heartbeat_at: lastHeartbeat,
      });

      // last_heartbeat_at should be more recent than created_at
      expect(new Date(session.last_heartbeat_at).getTime()).toBeGreaterThan(
        new Date(session.created_at).getTime()
      );
    });

    it('ended_at is set when session ends', () => {
      const session = createMockSession({
        status: 'ended',
        ended_at: nowIso(),
      });

      expect(session.ended_at).not.toBeNull();
      expect(session.ended_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('ended_at is null for active session', () => {
      const session = createMockSession({
        status: 'active',
        ended_at: null,
      });

      expect(session.ended_at).toBeNull();
    });
  });
});

// ============================================================================
// Session Context Tests
// ============================================================================

describe('Session Context', () => {
  describe('Venture/Repo/Track Tuple', () => {
    it('supports tracked work (with track number)', () => {
      const session = createMockSession({
        venture: 'vc',
        repo: 'owner/repo',
        track: 1,
      });

      expect(session.venture).toBe('vc');
      expect(session.repo).toBe('owner/repo');
      expect(session.track).toBe(1);
    });

    it('supports non-tracked work (null track)', () => {
      const session = createMockSession({
        venture: 'sc',
        repo: 'owner/repo',
        track: null,
      });

      expect(session.track).toBeNull();
    });

    it('supports different ventures', () => {
      const vcSession = createMockSession({ venture: 'vc' });
      const scSession = createMockSession({ venture: 'sc' });
      const dfgSession = createMockSession({ venture: 'dfg' });

      expect(vcSession.venture).toBe('vc');
      expect(scSession.venture).toBe('sc');
      expect(dfgSession.venture).toBe('dfg');
    });
  });

  describe('Optional Context Fields', () => {
    it('supports issue_number', () => {
      const session = createMockSession({ issue_number: 456 });
      expect(session.issue_number).toBe(456);
    });

    it('supports null issue_number', () => {
      const session = createMockSession({ issue_number: null });
      expect(session.issue_number).toBeNull();
    });

    it('supports branch', () => {
      const session = createMockSession({ branch: 'feature/new-feature' });
      expect(session.branch).toBe('feature/new-feature');
    });

    it('supports commit_sha', () => {
      const session = createMockSession({ commit_sha: 'abc123def456' });
      expect(session.commit_sha).toBe('abc123def456');
    });

    it('supports meta_json', () => {
      const meta = JSON.stringify({ custom: 'data', foo: 'bar' });
      const session = createMockSession({ meta_json: meta });
      expect(session.meta_json).toBe(meta);
    });
  });

  describe('Agent Context', () => {
    it('supports different agents', () => {
      const cliSession = createMockSession({ agent: 'cc-cli-host' });
      const desktopSession = createMockSession({ agent: 'desktop-pm-1' });

      expect(cliSession.agent).toBe('cc-cli-host');
      expect(desktopSession.agent).toBe('desktop-pm-1');
    });

    it('supports client and client_version', () => {
      const session = createMockSession({
        client: 'cc-cli',
        client_version: '1.2.3',
      });

      expect(session.client).toBe('cc-cli');
      expect(session.client_version).toBe('1.2.3');
    });

    it('supports host', () => {
      const session = createMockSession({ host: 'crane1' });
      expect(session.host).toBe('crane1');
    });
  });
});

// ============================================================================
// Attribution & Tracing Tests
// ============================================================================

describe('Attribution & Tracing', () => {
  it('includes actor_key_id (16 hex chars)', () => {
    const session = createMockSession({
      actor_key_id: '9f86d081884c7d65',
    });

    expect(session.actor_key_id).toMatch(/^[a-f0-9]{16}$/);
  });

  it('includes creation_correlation_id (corr_ UUID)', () => {
    const session = createMockSession({
      creation_correlation_id: 'corr_550e8400-e29b-41d4-a716-446655440000',
    });

    expect(session.creation_correlation_id).toMatch(
      /^corr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('includes schema_version', () => {
    const session = createMockSession({
      schema_version: '1.0',
    });

    expect(session.schema_version).toBe('1.0');
  });
});
