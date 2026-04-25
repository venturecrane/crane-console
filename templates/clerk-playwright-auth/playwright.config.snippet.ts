/**
 * Snippet — merge into your existing playwright.config.ts.
 *
 * What changes:
 *   - Adds a `setup-clerk` project that runs `auth.setup.ts` once per suite
 *   - Authenticated browser projects depend on it and load `storageState`
 *   - Public/unauthenticated projects can omit the dependency and the storageState
 *
 * Crane runbook: docs/runbooks/clerk-playwright-auth-setup.md
 */

import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // ... existing config

  projects: [
    // 1. Auth setup — runs once before authenticated projects
    {
      name: 'setup-clerk',
      testMatch: /auth\.setup\.ts/,
    },

    // 2. Authenticated projects — reuse the captured storageState
    {
      name: 'chromium-authed',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.clerk/user.json',
      },
      dependencies: ['setup-clerk'],
    },

    // 3. (Optional) Unauthenticated projects — no storageState, no dependency
    {
      name: 'chromium-public',
      testMatch: /.*\.public\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Keep your existing dev-server config
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
