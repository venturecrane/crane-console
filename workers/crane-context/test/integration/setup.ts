/**
 * Integration Test Setup
 *
 * Provides fixtures, helpers, and utilities for integration testing with local D1 database
 *
 * IMPORTANT: These tests require the worker to be running locally:
 *   npm run dev
 *
 * This ensures tests interact with actual D1 database and worker runtime
 */

import { describe, beforeAll, afterAll, beforeEach } from 'vitest';

// ============================================================================
// Test Configuration
// ============================================================================

export const TEST_CONFIG = {
  workerUrl: 'http://localhost:8787',
  relayKey: 'test-relay-key-for-integration-testing',
  testVenture: 'vc',
  testRepo: 'test-owner/test-repo',
  testAgent: 'test-agent-cli',
};

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Make authenticated request to worker
 */
export async function makeRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${TEST_CONFIG.workerUrl}${endpoint}`;

  const headers = new Headers(options.headers || {});
  headers.set('X-Relay-Key', TEST_CONFIG.relayKey);
  headers.set('Content-Type', 'application/json');

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Make POST request with JSON body
 */
export async function post(endpoint: string, body: unknown): Promise<Response> {
  return makeRequest(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Make GET request with query parameters
 */
export async function get(endpoint: string, params?: Record<string, string>): Promise<Response> {
  let url = endpoint;
  if (params) {
    const queryString = new URLSearchParams(params).toString();
    url = `${endpoint}?${queryString}`;
  }

  return makeRequest(url, {
    method: 'GET',
  });
}

/**
 * Parse JSON response body
 */
export async function parseJson<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  return JSON.parse(text) as T;
}

/**
 * Assert response status
 */
export function assertStatus(response: Response, expectedStatus: number): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}: ${response.statusText}`
    );
  }
}

/**
 * Wait for specified milliseconds (for testing timeouts, staleness, etc.)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Generate unique test identifier to avoid collisions across test runs
 */
export function uniqueTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Generate test session data
 */
export function createTestSessionData(overrides: Record<string, any> = {}) {
  return {
    agent: TEST_CONFIG.testAgent,
    venture: TEST_CONFIG.testVenture,
    repo: TEST_CONFIG.testRepo,
    track: 1,
    branch: 'main',
    commit_sha: 'a'.repeat(40),
    ...overrides,
  };
}

/**
 * Generate test handoff data
 */
export function createTestHandoffData(sessionId: string, overrides: Record<string, any> = {}) {
  return {
    session_id: sessionId,
    summary: 'Test handoff summary',
    payload: {
      test_data: 'value',
      items: [1, 2, 3],
    },
    to_agent: 'test-agent-desktop',
    status_label: 'ready',
    ...overrides,
  };
}

/**
 * Generate test update data
 */
export function createTestUpdateData(sessionId: string, overrides: Record<string, any> = {}) {
  return {
    session_id: sessionId,
    update_id: `update-${uniqueTestId()}`,
    branch: 'feature/new-feature',
    commit_sha: 'b'.repeat(40),
    ...overrides,
  };
}

// ============================================================================
// Database Cleanup Helpers
// ============================================================================

/**
 * Clean up test data after test run
 * Note: This requires worker to be running with local D1
 *
 * For now, we rely on test isolation via unique IDs
 * Production cleanup can be added via custom endpoint if needed
 */
export async function cleanupTestData(): Promise<void> {
  // Test isolation via unique IDs means cleanup is optional
  // If needed, can add custom cleanup endpoint to worker for testing
  console.log('Test cleanup: Using unique IDs for isolation');
}

// ============================================================================
// Integration Test Suite Helpers
// ============================================================================

/**
 * Setup integration test suite
 * Verifies worker is running before tests start
 */
export function setupIntegrationTests(suiteName: string) {
  describe(suiteName, () => {
    beforeAll(async () => {
      // Verify worker is accessible
      try {
        const response = await fetch(`${TEST_CONFIG.workerUrl}/health`);
        if (!response.ok) {
          throw new Error(`Worker health check failed: ${response.status}`);
        }
        console.log(`✓ Worker is running for ${suiteName}`);
      } catch (error) {
        console.error('❌ Worker is not running. Start with: npm run dev');
        throw new Error(
          'Integration tests require worker to be running. Start with: npm run dev'
        );
      }
    });

    beforeEach(async () => {
      // Optional: Add per-test setup here
    });

    afterAll(async () => {
      await cleanupTestData();
    });
  });
}

/**
 * Wait for worker to be ready (useful for CI environments)
 */
export async function waitForWorker(
  maxAttempts: number = 30,
  delayMs: number = 1000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${TEST_CONFIG.workerUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        console.log('✓ Worker is ready');
        return;
      }
    } catch (error) {
      // Worker not ready yet
    }

    if (i < maxAttempts - 1) {
      await sleep(delayMs);
    }
  }

  throw new Error('Worker did not become ready in time');
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert response contains expected fields
 */
export function assertHasFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): void {
  for (const field of fields) {
    if (!(field in obj)) {
      throw new Error(`Expected field '${String(field)}' not found in response`);
    }
  }
}

/**
 * Assert session ID format
 */
export function assertSessionIdFormat(sessionId: string): void {
  if (!/^sess_[0-9A-HJKMNP-TV-Z]{26}$/.test(sessionId)) {
    throw new Error(`Invalid session ID format: ${sessionId}`);
  }
}

/**
 * Assert handoff ID format
 */
export function assertHandoffIdFormat(handoffId: string): void {
  if (!/^ho_[0-9A-HJKMNP-TV-Z]{26}$/.test(handoffId)) {
    throw new Error(`Invalid handoff ID format: ${handoffId}`);
  }
}

/**
 * Assert correlation ID format
 */
export function assertCorrelationIdFormat(correlationId: string): void {
  if (!/^corr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(correlationId)) {
    throw new Error(`Invalid correlation ID format: ${correlationId}`);
  }
}
