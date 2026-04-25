# Clerk + Playwright auth bootstrap (template)

Drop-in scaffolding so a venture's E2E tests (and fleet agents using Playwright) authenticate against Clerk-protected routes **without manual login**.

Full runbook: [`docs/runbooks/clerk-playwright-auth-setup.md`](../../docs/runbooks/clerk-playwright-auth-setup.md)

## What's in this directory

| File                           | Purpose                                                                    |
| ------------------------------ | -------------------------------------------------------------------------- |
| `auth.setup.ts`                | Playwright setup project — calls `clerk.signIn()` and saves `storageState` |
| `playwright.config.snippet.ts` | Snippet to merge into the venture's `playwright.config.ts`                 |
| `package.deps.json`            | `devDependencies` to add (Clerk testing pkg + pinned versions)             |
| `.env.example.snippet`         | Env vars to add to the venture's `.env.example`                            |

## When this works

- Venture uses `@clerk/nextjs` or `@clerk/astro` for auth (verified for `dc`, `dfg`, `ke`, `sc`)
- Venture has `@playwright/test` configured
- A Clerk test user has been created (one-time, in Clerk Dashboard)
- `CLERK_SECRET_KEY` is in the venture's env (already true for all 4 above)

## Adoption checklist (per venture)

1. [ ] Create test user in Clerk Dashboard with email `agent-test+clerk_test@venturecrane.com` and a strong password (Bitwarden)
2. [ ] Add `E2E_CLERK_USER_EMAIL` to Infisical at `/<venture>/E2E_CLERK_USER_EMAIL`
3. [ ] `npm i -D @clerk/testing` (and ensure `@playwright/test` is current)
4. [ ] Copy `auth.setup.ts` to `<repo>/playwright/auth.setup.ts` (create dir if needed)
5. [ ] Add `playwright/.clerk/` to `.gitignore`
6. [ ] Merge the `projects` block from `playwright.config.snippet.ts` into the venture's `playwright.config.ts`
7. [ ] Add the env entries from `.env.example.snippet` to `.env.example`
8. [ ] Run `npx playwright test` and confirm no manual login is required

## Why this approach

Clerk's `clerk.signIn({ emailAddress })` (with `CLERK_SECRET_KEY` set) creates a server-side sign-in token via the Clerk Backend API. This bypasses every verification step (password, email/phone OTP, 2FA, MFA) — the user is signed in immediately. The captured `storageState.json` is then reusable across all parallel test workers and across runs until the session expires.

For fleet agents that need authenticated browser access (not just E2E tests), the same `storageState.json` can be loaded into a `browser.newContext({ storageState })` call. See the runbook for the fleet integration pattern.
