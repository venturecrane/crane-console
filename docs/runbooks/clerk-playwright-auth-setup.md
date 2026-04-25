# Clerk + Playwright auth bootstrap — runbook

**Problem this solves.** Agents (and humans running E2E suites) get blocked because every test attempt against a venture's UI bounces them to a Clerk login page. The agent stops and asks the Captain to sign in.

**Root cause.** Playwright launches a fresh Chromium per session — no profile, no cookies, no Clerk session. Every venture (`dc`, `dfg`, `ke`, `sc`) uses Clerk for auth, so every protected route redirects to `/sign-in`.

**The fix.** Use Clerk's first-class Playwright integration: `@clerk/testing/playwright` issues a server-side sign-in token via the Clerk Backend API, bypasses _all_ verification (password, OTP, 2FA, MFA), and persists the authenticated session as a `storageState.json` that Playwright workers — and any fleet agent driving Playwright — load on subsequent runs.

> **CIC note.** Claude-in-Chrome is _not_ relevant here: it can only drive the Captain's Mac's Chrome and cannot reach across machines. For any agent on a fleet machine, **Playwright + Clerk testing tokens is the only viable path.** See `reference_browser_automation_tools.md` in user memory for the full rationale.

---

## Coverage

| Venture                    | Auth lib                  | Status                                                                    | Notes |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------- | ----- |
| `dc` (Draft Crane)         | `@clerk/nextjs` v6        | most-complete Clerk integration; recommended pilot                        |       |
| `dfg` (Durgan Field Guide) | `@clerk/nextjs` v7        | ready                                                                     |       |
| `ke` (Kid Expenses)        | `@clerk/nextjs` v6        | placeholder Clerk pub key in env — verify real keys exist before adoption |       |
| `sc` (Silicon Crane)       | `@clerk/astro` v3         | ready, but Astro env-var prefix is `PUBLIC_` not `NEXT_PUBLIC_`           |       |
| `ss` (SMD Services)        | n/a (workers only, no UI) | skip                                                                      |       |
| `vc` (crane-console)       | n/a (backend)             | skip                                                                      |       |

## How `clerk.signIn()` actually authenticates

```
Playwright test
   ↓ clerk.signIn({ page, emailAddress })
   ↓
[Test process] POST → Clerk Backend API
   Authorization: Bearer $CLERK_SECRET_KEY
   body: { user_id_or_email }
   ↓
[Clerk] returns a one-time sign-in `ticket` token
   ↓
[Test process] navigates `page` to a magic URL containing the ticket
   ↓
[Clerk] validates ticket → sets session cookies on the page's origin
   ↓
Page is now authenticated. context.storageState() captures the cookies + localStorage.
```

No password is ever sent. No email/SMS arrives. No 2FA prompt. The Backend API call is the entire auth.

## One-time setup (per venture)

1. **Clerk Dashboard.** Create a test user.
   - Email: `agent-test+clerk_test@venturecrane.com` (the `+clerk_test` token is what Clerk recognizes as a testing identity)
   - Password: anything strong (Bitwarden) — won't actually be used by `clerk.signIn({emailAddress})`, but useful as a fallback for manual exploration
   - Roles/permissions: same as a normal user, plus whatever the test surface needs
2. **Infisical.** Add the test user email to the venture's secret path.
   ```
   infisical secrets set --path=/<venture> E2E_CLERK_USER_EMAIL=agent-test+clerk_test@venturecrane.com
   ```
   (`CLERK_SECRET_KEY` is already there — verified 2026-04-25 by code reference scan.)
3. **Repo changes (4 files).** Copy from `templates/clerk-playwright-auth/`:
   - `auth.setup.ts` → `<repo>/playwright/auth.setup.ts`
   - Merge `playwright.config.snippet.ts` → existing `playwright.config.ts`
   - Append `package.deps.json` deps to `package.json`, then `npm install`
   - Append `.env.example.snippet` to `.env.example`
4. **`.gitignore`.** Add `playwright/.clerk/` (the captured `user.json` is a session secret).
5. **Run.** `npx playwright test` — first run executes `setup-clerk` project, captures `playwright/.clerk/user.json`, then runs your suite already-authenticated.

## Adoption order

1. **dc** first (pilot — most-complete Clerk integration)
2. **dfg** second
3. **sc** third (verify Astro `PUBLIC_` prefix works with `@clerk/testing`)
4. **ke** last (verify real Clerk keys are configured first — currently shows placeholder `pk_test_cGxhY2Vob2xkZXIuZXhhbXBsZS5jb20k`)

## CI integration

Add the env vars to each venture's CI secret store (GitHub Actions or Vercel build env):

```yaml
# .github/workflows/e2e.yml (excerpt)
env:
  CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}
  E2E_CLERK_USER_EMAIL: ${{ secrets.E2E_CLERK_USER_EMAIL }}
```

CI must use **Clerk dev keys** (`pk_test_*` / `sk_test_*`) — the testing tokens only work in development instances.

## Fleet integration (future)

For fleet agents that need authenticated browser access without running a full Playwright test suite:

```ts
import { chromium } from 'playwright'

const browser = await chromium.launch()
const context = await browser.newContext({
  storageState: '/path/to/playwright/.clerk/user.json',
})
const page = await context.newPage()
await page.goto('https://<venture>.com/protected')
// ...authenticated work...
```

The `user.json` lives where the Playwright suite captured it. For fleet machines that don't run the full suite, the bootstrap must be staged:

- Captain runs `npx playwright test --project=setup-clerk` once locally
- Resulting `user.json` is encoded and uploaded to Infisical: `infisical secrets set --path=/<venture> E2E_CLERK_STORAGE_STATE_B64=$(base64 < playwright/.clerk/user.json)`
- Fleet agent decodes on startup and writes to its working dir

This pipeline is _not_ part of the initial rollout — wait until fleet agents actually need authenticated browser access before building it. The runbook flags this as "Phase 2" deliberately.

## Refresh / expiry

- Clerk sessions on dev instances default to **1 week** (configurable in Dashboard → Sessions → Inactivity timeout).
- When `user.json` is stale, the next test run will fail with a redirect-to-sign-in. Re-run `npx playwright test --project=setup-clerk` to refresh.
- Cadence recommendation: re-bootstrap weekly, or on demand when CI fails with auth errors.

## Related docs

- Memory: `~/.claude/projects/-Users-scottdurgan-dev-crane-console/memory/reference_browser_automation_tools.md`
- Tooling catalog: `docs/instructions/tooling.md`
- Clerk official: https://clerk.com/docs/guides/development/testing/playwright/test-authenticated-flows

## Astro-specific adjustments (sc and other Astro ventures)

Verified during sc-console rollout (2026-04-25 by rollout-sc):

- **Publishable key:** `clerkSetup()` does NOT auto-detect Astro's `PUBLIC_*` prefix. The template's `auth.setup.ts` resolves the key explicitly with a fallback chain (`NEXT_PUBLIC_*` → `PUBLIC_*` → `VITE_*` → `CLERK_PUBLISHABLE_KEY`) and passes it to `clerkSetup({ publishableKey })`. Works for any framework.
- **Dev port:** Astro defaults to **4321**, not 3000. Set `webServer.url: 'http://localhost:4321'` in `playwright.config.ts`.
- **tsconfig exclude:** Add `playwright/`, `playwright.config.ts`, and `e2e/` to the venture's tsconfig `exclude`. Astro's client tsconfig doesn't include Node types (`process`, `__dirname`, `path`), and `astro check` fails on Playwright code otherwise. Playwright runs its own ts-loader, so exclusion is safe.
- **Layout:** for monorepo Astro projects (e.g., sc-console with `apps/sc-web/`), put `playwright/`, `playwright.config.ts`, and the `webServer.command` inside the app subdir, not at repo root.

## Lessons from initial rollout (2026-04-25)

Captured during the dfg/sc/ke rollout pass:

- **`@playwright/test` may NOT already be installed.** Original recon scanned monorepo `package.json` files broadly and found the dep somewhere — but in dfg and ke that location wasn't usable for E2E. Verify before assuming. If missing, `npm i -D @playwright/test` alongside `@clerk/testing`.
- **`.env.example` may not exist.** dfg-console didn't have one. If absent, create fresh from `.env.example.snippet`.
- **Stale build artifacts can cause phantom typecheck failures.** dfg's stale `apps/dfg-app/.next/` referenced files that no longer existed. `rm -rf .next` (or `dist/`, `.astro/` for Astro) before re-running verify if you see this.
- **Pre-existing `*.tsbuildinfo` may show as modified locally** if added to `.gitignore` after being tracked. Leave untouched; separate cleanup story.
- **Case-collisions in `.github/`** (e.g., dc-console has both `PULL_REQUEST_TEMPLATE.md` and `pull_request_template.md` registered) will block branch creation. Fix with `git rm --cached` of the phantom case before attempting rollout.
- **`@clerk/testing` v2** is current and works with `@clerk/nextjs` v6 + v7 and `@clerk/astro` v3. Template pins to `^2.0.0`.

## Verified facts (2026-04-25)

- `dc`/`dfg`/`ke`/`sc` consoles all import `@clerk/{nextjs,astro}` — confirmed by `package.json` grep
- `CLERK_SECRET_KEY` is referenced in `dc-console` source and `.env.example` — confirmed by code grep
- `@playwright/test` was NOT already a usable devDependency in dfg or ke — required fresh install during their rollouts
- Crane launcher does **not** pass `--chrome` to claude (verified at `launch-lib.js:1423`) — fleet agents do not get CIC tools by default
- `mini` (Hermes) has no browser MCP at all; `mac23` has `plugin:playwright:playwright`
- Initial rollout: dfg-console PR #296, sc-console PR #114, ke-console PR #204 all opened as drafts on 2026-04-25; dc-console rollout deferred pending `.github/` case-collision fix
