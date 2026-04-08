import { defineConfig } from 'vitest/config'

/**
 * Venture test layout has two projects so each kind of test runs in the
 * right way and stays isolated:
 *
 *   - unit    — pure-function tests with no DB or HTTP. Default.
 *   - harness — in-process HTTP + D1 tests via @venturecrane/crane-test-harness.
 *               See test/harness/README.md for how to write one.
 *
 * `npm test` runs unit + harness.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/*.test.ts'],
          exclude: ['test/harness/**'],
        },
      },
      {
        test: {
          name: 'harness',
          include: ['test/harness/**/*.test.ts'],
        },
      },
    ],
  },
})
