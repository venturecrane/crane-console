import { defineConfig } from 'vitest/config'

/**
 * Crane-context test layout has four projects so each kind of test runs in
 * the right way and stays isolated:
 *
 *   - unit               — pure-function tests with no DB or HTTP. Default.
 *   - harness            — in-process HTTP tests via @venturecrane/crane-test-harness.
 *                          Default. Replaces the legacy live-wrangler integration tests.
 *   - canary             — Miniflare canary that compares the in-process shim
 *                          against real D1 to detect drift. Runs in 'forks' pool
 *                          because Miniflare keeps long-lived state.
 *   - integration-legacy — opt-in only. The original test/integration/* tests
 *                          that hit a live `wrangler dev` server on localhost:8787.
 *                          Slated for deletion in Phase 2 once all migrations land.
 *
 * Default scripts (`npm test`) run unit + harness only. Run canary via
 * `npm run test:canary` and the legacy suite via `npm run test:legacy`.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/*.test.ts'],
          exclude: ['test/integration/**', 'test/harness/**', 'test/canary/**'],
        },
      },
      {
        test: {
          name: 'harness',
          include: ['test/harness/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'canary',
          include: ['test/canary/**/*.test.ts'],
          pool: 'forks',
        },
      },
      {
        test: {
          name: 'integration-legacy',
          include: ['test/integration/**/*.test.ts'],
        },
      },
    ],
  },
})
