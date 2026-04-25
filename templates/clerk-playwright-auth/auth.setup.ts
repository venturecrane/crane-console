/**
 * Playwright global auth setup for Clerk-protected apps.
 *
 * Source: https://clerk.com/docs/guides/development/testing/playwright/test-authenticated-flows
 * Crane runbook: docs/runbooks/clerk-playwright-auth-setup.md
 *
 * What this does:
 *   1. clerkSetup()  — fetches a Testing Token so Clerk's bot detection
 *      doesn't block automated traffic.
 *   2. clerk.signIn({ emailAddress }) — creates a server-side sign-in token
 *      via the Clerk Backend API. Bypasses email/password/OTP/2FA entirely.
 *   3. context.storageState({ path }) — persists the authenticated session
 *      so subsequent test workers can reuse it without re-authenticating.
 *
 * Required env (in .env.local for dev or CI secrets):
 *   - CLERK_SECRET_KEY                  — server-side Clerk key for the test instance
 *   - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — frontend Clerk key (or PUBLIC_CLERK_PUBLISHABLE_KEY for Astro)
 *   - E2E_CLERK_USER_EMAIL              — test user email, e.g. agent-test+clerk_test@venturecrane.com
 *
 * Test user setup (one-time, in Clerk Dashboard):
 *   1. Create a user with email matching `*+clerk_test@*` — this enables
 *      Clerk's testing mode for that user (OTP `424242` works as fallback).
 *   2. Assign whatever roles/permissions a real user would have.
 *
 * Hooked into playwright.config.ts via:
 *   projects: [
 *     { name: 'setup-clerk', testMatch: /auth\.setup\.ts/ },
 *     { name: 'chromium', use: { ...devices['Desktop Chrome'], storageState: 'playwright/.clerk/user.json' }, dependencies: ['setup-clerk'] },
 *   ]
 */

import { clerk, clerkSetup } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'
import path from 'path'

setup.describe.configure({ mode: 'serial' })

setup('global clerk setup', async () => {
  await clerkSetup()
})

const authFile = path.join(__dirname, '../playwright/.clerk/user.json')

setup('authenticate and save state', async ({ page }) => {
  if (!process.env.E2E_CLERK_USER_EMAIL) {
    throw new Error(
      'E2E_CLERK_USER_EMAIL not set. See docs/runbooks/clerk-playwright-auth-setup.md'
    )
  }
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error('CLERK_SECRET_KEY not set. Required for server-side sign-in token.')
  }

  await page.goto('/')
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_EMAIL,
  })

  await page.context().storageState({ path: authFile })
})
