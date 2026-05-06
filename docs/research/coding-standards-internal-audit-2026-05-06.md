# Internal Portfolio Audit — 2026-05-06

## Summary

**5-7 most consequential findings:**

1. **File-size debt is portfolio-wide and severe.** 6 of 7 repos have production source files exceeding 500 LOC. The worst offenders are not test files — they are route handlers, worker entry points, and UI page components. dfg-console's `worker.ts` is 3,108 LOC; sc-console's entire API lives in a single 2,608-LOC `index.ts`; crane-console has 20+ production source files above 500 LOC. The ke-console code review explicitly flagged this as a grade-determining defect (Architecture: C).

2. **No schema validation library is used anywhere.** Zero Zod, Valibot, or equivalent imports across all 7 repos. External input is validated inline with manual checks or cast directly with `as T` after `JSON.parse()`. This is consistent and systematic across every repo including those with `strict: true` tsconfig.

3. **`any` usage is concentrated in dfg-console (79 occurrences in production code) and crane-console has the identical structural pattern.** The dfg-analyst `worker.ts` alone has 15 `any` annotations, many annotating function parameters that flow into AI response processing. All other repos achieve near-zero: ke-console, dc-console, ss-console all report 0 in production source; sc-console reports 0.

4. **Error handling is ad hoc and inconsistent across the portfolio.** No repo uses a Result type. Only dc-console has a typed `AppError` class with factory functions. ss-console has partial typed error helpers. The rest catch exceptions and either `console.error` + rethrow, swallow silently, or return raw `500`. sc-console's `index.ts` alone contains 25 catch blocks (4.8 per source file), mostly in-line within route handlers.

5. **`noUncheckedIndexedAccess`, `noImplicitOverride`, and `exactOptionalPropertyTypes` are absent from every tsconfig in the portfolio.** All repos use `strict: true` (or `extends: astro/tsconfigs/strict` which includes it) but none adds the supplementary flags that catch array-out-of-bounds and optional-property assignment bugs. The ke-console code review explicitly called this out as a medium finding.

6. **`console.log` used as the sole observability mechanism in production workers.** dfg-console: 86 instances; ss-console: 38; sc-console: 25. dfg-analyst `worker.ts` has tagged debug logs like `[CLAUDE]`, `[IMAGE]`, `[VISION]`, `[ANALYSIS]` scattered through 3,108 lines — no structured logging, no log levels, no ability to suppress in production.

7. **Test coverage varies by 10x across the portfolio with no consistent unit-vs-integration strategy.** dc-console: 47 test files, 730+ tests; ss-console: 89 test files. dfg-console: 10 test files covering 120 production source files (~8% file coverage). vc-web: 0 test files. sc-console: 3 test files for a 2,608-LOC API. ke-console and ss-console have reviews flagging test gaps (no e2e, zero worker coverage).

**Highest drift areas:**

- Error handling: dc-console uses AppError + factories; ke-console, ss-console, dfg-console, sc-console use ad hoc `console.error` + rethrow; vc-web has 0 catch blocks.
- CLAUDE.md richness: ss-console is 369 lines with full business model, tone rules, domain context; sc-console is 96 lines with minimal directives. This is a 4x gap.
- Test density: dc-console and ss-console treat tests as a first-class artifact; dfg-console and sc-console treat them as optional.
- ESLint configuration: crane-console adds `no-useless-assignment` and `preserve-caught-error` plus a custom `no-restricted-syntax` rule; ke-console's worker ESLint has no custom rules beyond recommended; dfg-console's `dfg-app` explicitly disables `no-explicit-any`.

---

## Per-Repo Findings

### crane-console

**File-size top 15 (production source only, excluding tests and node_modules):**

| LOC  | Path                                               |
| ---- | -------------------------------------------------- |
| 2308 | `packages/crane-mcp/src/cli/launch-lib.ts`         |
| 1812 | `packages/crane-mcp/src/lib/crane-api.ts`          |
| 1782 | `packages/crane-mcp/src/tools/sos.ts`              |
| 1114 | `workers/crane-context/src/notifications.ts`       |
| 1082 | `workers/crane-context/src/endpoints/sessions.ts`  |
| 1079 | `workers/crane-context/src/endpoints/queries.ts`   |
| 1031 | `packages/crane-mcp/src/tools/docs-drift-audit.ts` |
| 1000 | `packages/crane-mcp/src/index.ts`                  |
| 941  | `packages/crane-mcp/src/tools/memory.ts`           |
| 907  | `workers/crane-context/src/mcp.ts`                 |
| 896  | `packages/crane-mcp/src/cli/docs-refresh.ts`       |
| 815  | `packages/crane-mcp/src/cli/skill-review.ts`       |
| 781  | `workers/crane-context/src/index.ts`               |
| 726  | `packages/crane-mcp/src/lib/doc-generator.ts`      |
| 663  | `packages/crane-mcp/src/tools/memory-audit.ts`     |

20+ production source files exceed 500 LOC. `launch-lib.ts` at 2,308 LOC is the largest production file in the portfolio excluding dfg's `worker.ts`.

**tsconfig strict status:** `strict: true` on all worker and package tsconfigs. `site/tsconfig.json` uses `extends: astro/tsconfigs/strict` (inherits strict). No `noUncheckedIndexedAccess`, `noImplicitOverride`, or `exactOptionalPropertyTypes` in any tsconfig.

**`any` usage count (production source, excluding tests):** 1 occurrence.

**ESLint extras:** Beyond recommended: `@typescript-eslint/no-explicit-any: warn`, `no-useless-assignment: warn`, `preserve-caught-error: warn`. Custom `no-restricted-syntax` rule banning `localhost:8787` in harness/canary tests. Most complete ESLint config in the portfolio. Test files relax `no-explicit-any` and `no-unused-vars`.

**Error-handling patterns observed:** Pattern varies by layer. MCP tools surface errors as structured JSON to the MCP caller. Workers use `console.error` + rethrow in most catch blocks. `crane-context/src/notifications.ts` and related endpoints use inline try/catch. No portfolio-wide `AppError` equivalent in crane-console.

**CLAUDE.md status:** Present, 96 lines. 15 `##` sections covering development workflow, enterprise rules, environment variables, instruction modules, and architecture reference. Domain-specific content is thin — directives are largely cross-repo pointers.

**Test framework + counts:** Vitest. 83 test files (packages + workers, excluding `.claude/worktrees`). Heavy integration coverage on crane-mcp tools. Recent test files: `sos.test.ts` (1,610 LOC), `launch-lib.test.ts` (1,632 LOC), `worktree-doctor.test.ts` (781 LOC).

**Recent reviews + grades:** `docs/reviews/code-review-2026-04-09.md` — Overall: **C**. `docs/reviews/code-review-2026-02-15.md` present (grade not read in detail).

**Other observations:** `packages/crane-mcp/src/index.ts` at 1,000 LOC is the MCP tool registry/dispatcher. `workers/crane-context/src/types.ts` at 625 LOC is a large types-only file. The `notifications.ts` worker file at 1,114 LOC handles notification ingestion, fan-out, and resolution in a single module.

---

### vc-web

**File-size top 15:**

| LOC | Path                             |
| --- | -------------------------------- |
| 150 | `src/lib/og-image.ts`            |
| 61  | `src/pages/feed.xml.ts`          |
| 56  | `src/content.config.ts`          |
| 43  | `src/pages/feed/articles.xml.ts` |
| 35  | `src/pages/og/[...slug].png.ts`  |
| 19  | `src/data/ventures.ts`           |

The entire `.ts` surface is 6 files, max 150 LOC. No `.tsx` files — Astro-only frontend with no React components.

**Files >500 LOC:** None.

**tsconfig strict status:** `extends: astro/tsconfigs/strict` — inherits `strict: true` and related flags. No supplementary flags.

**`any` usage count:** 1 (one occurrence in the entire codebase).

**ESLint extras:** `@typescript-eslint/no-explicit-any: warn`, `@typescript-eslint/no-require-imports: warn`, `@typescript-eslint/no-unused-vars: warn` with ignore patterns. eslint-plugin-astro included.

**Error-handling patterns:** 0 catch blocks in the TypeScript source. No API routes, no server-side logic requiring error handling.

**CLAUDE.md status:** Present, 86 lines. Sections: About, Session Start, Enterprise Rules, Instruction Modules, Build Commands, Tech Stack, Design Tokens, Code Patterns, CSS Pitfalls, pre-commit/pre-push hooks. Includes CSS anti-patterns (e.g. no `@apply` inside `<style>` blocks). Lean but appropriate for the repo's scope.

**Test framework + counts:** 0 test files. No vitest, jest, or playwright configured.

**Recent reviews + grades:** None found in `docs/`.

**Other observations:** The `.ts` footprint is genuinely minimal — this is a content site with Astro. The codebase has no meaningful TS debt. The only structural note is that `og-image.ts` at 150 LOC does canvas-based image generation inline; extracting configuration constants would be the only maintainability concern.

---

### sc-console

**File-size top 15 (all source files):**

| LOC  | Path                                             |
| ---- | ------------------------------------------------ |
| 2608 | `workers/sc-api/src/index.ts`                    |
| 1428 | `workers/sc-api/src/index.test.ts`               |
| 292  | `workers/sc-api/src/utils/r2.ts`                 |
| 158  | `workers/sc-maintenance/src/index.ts`            |
| 130  | `workers/sc-api/src/utils/r2.test.ts`            |
| 86   | `workers/sc-api/src/middleware/auth.ts`          |
| 69   | `workers/sc-api/test/harness/migrations.test.ts` |
| 41   | `workers/sc-api/vitest.globalSetup.ts`           |
| 34   | `workers/sc-api/vitest.config.ts`                |

The entire API lives in a single 2,608-LOC file. There is no routes/ or services/ directory. There is no src/app/ equivalent — this repo is Workers + Astro static frontend only.

**Files >500 LOC:** `workers/sc-api/src/index.ts` (2,608 LOC) — the entire Hono API. The test file `index.test.ts` (1,428 LOC) mirrors this.

**tsconfig strict status:** `strict: true` in both `workers/sc-api/tsconfig.json` and `workers/sc-maintenance/tsconfig.json`. `apps/sc-web/tsconfig.json` has no strict flag explicitly (uses Astro defaults). No `noUncheckedIndexedAccess` etc.

**`any` usage count:** 0 in production source.

**ESLint extras:** `@typescript-eslint/no-explicit-any: warn`, `@typescript-eslint/no-unused-vars: warn` (same pattern as crane-console). Test files relax both rules.

**Error-handling patterns:** 25 catch blocks in `index.ts` alone (4.8 per source file — highest density in the portfolio). Two patterns of note:

- `sc-api/src/index.ts:385`: bare `catch { }` — swallowed with no logging or response differentiation (cursor decode failure).
- `sc-api/src/index.ts:660`: `catch { // Ignore parse errors }` — explicitly swallowing JSON parse failure on copy pack.
- All other catches: `catch (error) { return c.json({ error: '...' }, 500) }` — generic 500 with no structured error shape.

**CLAUDE.md status:** Present, 96 lines. 10 `##` sections. Covers build commands, tech stack, key files, security requirements, instruction modules. Thin on domain context and coding patterns — no equivalents to ke-console's money-math rule or ss-console's no-fabrication rule.

**Test framework + counts:** Vitest. 3 test files total. The 1,428-LOC `index.test.ts` and 130-LOC `r2.test.ts` are the entire test surface. `migrations.test.ts` (69 LOC) covers schema harness. For a 2,608-LOC API this is extremely thin — the test file has not kept pace with the production file.

**Recent reviews + grades:** None found.

**Other observations:** The monolith pattern is load-bearing. This repo has never been split into route modules. 30+ route handler definitions live in `index.ts` alongside middleware, error handling, and utility functions. It is a direct fork of the venture template pattern that has grown without decomposition.

---

### dfg-console

**File-size top 15 (production source only):**

| LOC  | Path                                                               |
| ---- | ------------------------------------------------------------------ |
| 3108 | `workers/dfg-analyst/src/worker.ts`                                |
| 1839 | `workers/dfg-api/src/routes/opportunities.ts`                      |
| 1054 | `apps/dfg-app/src/app/opportunities/[id]/page.tsx`                 |
| 911  | `workers/dfg-analyst/src/calculation-spine.ts`                     |
| 838  | `workers/dfg-analyst/src/analysis.ts`                              |
| 793  | `apps/dfg-app/src/lib/api.ts`                                      |
| 771  | `apps/dfg-app/src/components/features/condition-assessment.tsx`    |
| 707  | `workers/dfg-analyst/src/risk-taxonomy.ts`                         |
| 707  | `apps/dfg-app/src/components/features/risk-assessment.tsx`         |
| 622  | `workers/dfg-analyst/src/types.ts`                                 |
| 600  | `apps/dfg-app/src/components/features/attention-required-list.tsx` |
| 597  | `workers/dfg-api/src/index.ts`                                     |
| 543  | `apps/dfg-app/src/components/features/title-inputs.tsx`            |

Plus scripts (not production but checked in): `research-quality-gate.ts` (1,475 LOC), `doc-parse-spike.ts` (906 LOC), multiple other spike files >500 LOC in `scripts/`.

**Files >500 LOC (count):** 13 production source files, plus 9+ scripts >500 LOC.

**tsconfig strict status:** `strict: true` across all 8 tsconfigs (packages, workers, apps). No supplementary flags.

**`any` usage count:** 79 occurrences across production source. Breakdown: `dfg-analyst/src/worker.ts` (15), `dfg-scout/src/index.ts` (11), `dfg-scout/src/sources/sierra/adapter.ts` (8), `dfg-scout/src/core/pipeline/runScout.ts` (7). Pattern: `condition: any` function parameters where the type is a large inferred structure from AI responses; `scenarios: any` where JSON shape is variable. Notable: `const report: any = {` at line 2,873 of `worker.ts` — a 100+ field object typed as `any`.

**ESLint extras:** Root `eslint.config.js` matches the standard portfolio pattern. `apps/dfg-app/eslint.config.mjs` explicitly disables `@typescript-eslint/no-explicit-any: 'off'` with a comment acknowledging "the dfg-app codebase intentionally uses `any` in a handful of generic-prop wrapper helpers." `apps/dfg-core` uses minimal Next.js config. The `react-hooks/set-state-in-effect` rule is downgraded to warn in dfg-app with a follow-up issue referenced.

**Error-handling patterns:** 57 catch blocks in production source. Dominant pattern in `dfg-scout/src/index.ts`: `catch (err: any) { return json({ error: '...', details: err.message }, 500) }` — error message surfaced directly to API caller. `dfg-analyst/src/worker.ts` at line 2,174: `catch (e) { console.error('Failed to parse JSON:', ...) ; throw new Error(...) }` — catch-log-rethrow. `dfg-api/src/routes/opportunities.ts` uses a custom `AnalystWorkerError` class (the only typed error class in dfg-console). No portfolio-consistent error shape.

**CLAUDE.md status:** Present, 187 lines. 12 `##` sections. Notably includes: `## Canonical Money Math (Non-negotiable)` mirroring ke-console's pattern, `## iOS Safari / Mobile Patterns`, `## Security Checklist`. Richer than sc-console but thinner than ss-console on domain context.

**Test framework + counts:** Vitest. 10 test files covering 120 production source files (~8% file coverage). Test files: mostly unit tests for calculation/analysis modules (`boilerplate-detection.test.ts`, `acquisition.test.ts`, `calculations.test.ts`, `staleness.test.ts`, `normalize.test.ts`) plus two migration harness files. No integration tests for the 3,108-LOC `worker.ts` or the 1,839-LOC `opportunities.ts`.

**Recent reviews + grades:** None found in `docs/`.

**Other observations:** `dfg-analyst/src/worker.ts` at 3,108 LOC is the largest production file in the portfolio. It contains ~30 standalone functions (not a class), the Claude API retry loop, image fetching, JSON parsing, gate evaluation, report assembly, and the main `analyzeAsset` export — all in one file. 86 `console.log` statements with manual `[TAG]` prefixes serve as the observability layer. The `dfg-scout/src/index.ts` pattern of `const params: any[] = []` to build dynamic D1 queries (lines 62, 90) represents a pattern where type safety is traded for dynamic query construction.

---

### ke-console

**File-size top 15:**

| LOC  | Path                                           |
| ---- | ---------------------------------------------- |
| 1040 | `app/src/app/expenses/page.tsx`                |
| 1000 | `app/src/app/expenses/[id]/page.tsx`           |
| 990  | `app/src/lib/api.ts`                           |
| 901  | `app/src/app/settings/fixed-expenses/page.tsx` |
| 822  | `app/src/app/activity/page.tsx`                |
| 692  | `workers/ke-api/src/routes/families.ts`        |
| 668  | `workers/ke-api/src/routes/expenses.ts`        |
| 628  | `workers/ke-api/src/routes/expense-actions.ts` |
| 576  | `app/src/app/dashboard/page.tsx`               |
| 456  | `app/src/app/settings/children/page.tsx`       |
| 408  | `app/src/app/expenses/add/page.tsx`            |
| 396  | `workers/ke-api/src/services/activity.ts`      |
| 340  | `workers/ke-api/src/routes/webhooks.ts`        |
| 280  | `workers/ke-api/src/routes/activity.ts`        |
| 256  | `workers/ke-api/src/routes/billing.ts`         |

(Test files excluded — see findings below.)

**Files >500 LOC (production source):** 6 files: `expenses/page.tsx` (1040), `expenses/[id]/page.tsx` (1000), `api.ts` (990, partially dead code), `fixed-expenses/page.tsx` (901), `activity/page.tsx` (822), `families.ts` (692), `expenses.ts` (668), `expense-actions.ts` (628), `dashboard/page.tsx` (576).

**tsconfig strict status:** `strict: true` in both `app/tsconfig.json` and `workers/ke-api/tsconfig.json`. No supplementary flags.

**`any` usage count:** 0 in production source.

**ESLint extras:** Three-tiered config: root config ignores everything (lint-staged compatibility shim). `app/eslint.config.mjs` uses `nextVitals + nextTs` with `no-unused-vars: error` (promoted from warn — stricter than other repos). `workers/ke-api/eslint.config.mjs` uses bare `eslint.configs.recommended + tseslint.configs.recommended` — no custom rules, no `no-explicit-any` override.

**Error-handling patterns:** 109 catch blocks across production source. Dominant pattern: `catch (err) { console.error('...', err) }` in React components. Worker routes catch generically and return 500. `expenses/page.tsx:269`: bare `catch { }` (swallowed error during user data fetch with no UI feedback). No `AppError` class, no structured error types in the worker.

**CLAUDE.md status:** Present, 170 lines. 18 `##` sections. Notably includes: `## Critical Pattern: Money Math` (non-negotiable fixed-decimal rules), `## Security Requirements` (JWKS URL, auth middleware requirements), `## Testing Requirements` (unit vs integration guidance). Most structured per-domain directive content of any repo except ss-console.

**Test framework + counts:** Vitest (workers), no frontend test runner configured. 13 test files, all in `workers/ke-api/src/__tests__/`. Largest: `integration.test.ts` (1,341 LOC), `auth.test.ts` (1,155 LOC). Heavy worker coverage; zero frontend test coverage. Playwright config references `./e2e` which does not exist.

**Recent reviews + grades:** `docs/reviews/code-review-2026-04-27.md` — Overall: **C**. Scorecard: Architecture C, Security D (critical middleware bypass), Code Quality C, Testing C, Dependencies C, Documentation B, Golden Path B.

**Other observations:** The code review surfaced `app/src/proxy.ts` (incorrectly named — Next.js requires `middleware.ts`) as a CRITICAL finding meaning Clerk edge protection silently does not run. `app/src/lib/api.ts` (990 LOC) is almost entirely dead code — legacy `X-User-Id` function layer replaced by `useApi()` hook, kept as a types module. JWT helper functions (~70 LOC) are copy-pasted verbatim into 5 separate test files.

---

### ss-console

**File-size top 15 (production source):**

| LOC | Path                               |
| --- | ---------------------------------- |
| 859 | `src/lib/sow/service.ts`           |
| 811 | `src/lib/enrichment/index.ts`      |
| 807 | `src/lib/db/entities.ts`           |
| 748 | `src/lib/db/quotes.ts`             |
| 729 | `src/lib/pdf/sow-template.tsx`     |
| 647 | `src/lib/email/templates.ts`       |
| 613 | `src/pages/api/booking/reserve.ts` |
| 507 | `src/lib/db/milestones.ts`         |
| 507 | `src/lib/db/meetings.ts`           |
| 482 | `src/lib/sow/store.ts`             |
| 480 | `src/lib/enrichment/workflow.ts`   |
| 445 | `src/scripts/scorecard.ts`         |
| 445 | `src/lib/db/invoices.ts`           |
| 432 | `src/lib/db/engagements.ts`        |
| 432 | `src/lib/db/milestones.ts`         |

Per the 2026-04-24 code review: 23 files exceed 500 LOC across all file types (including `.astro`). The largest admin Astro page is `src/pages/admin/entities/[id].astro` at 1,347 LOC.

**Files >500 LOC (count):** 14 `.ts`/`.tsx` production source files, plus ~9 additional `.astro` admin pages.

**tsconfig strict status:** Root `tsconfig.json` uses `extends: astro/tsconfigs/strict`. Worker tsconfigs all have `strict: true` explicitly. No supplementary flags.

**`any` usage count:** 0 in production source. The 6 `Result<>` usages are the only functional-error-handling indicator in the portfolio — used in `src/lib/enrichment/instrument.ts` and related files.

**ESLint extras:** `@typescript-eslint/no-explicit-any: warn`, `@typescript-eslint/no-unused-vars: warn`, test file relaxation. Includes explicit ignores for `coverage/**` and `.claude/worktrees/**` — the most complete ignore list in the portfolio.

**Error-handling patterns:** 217 catch blocks — highest raw count in the portfolio, consistent with the largest production codebase. `src/lib/enrichment/index.ts` has two `catch { }` silences for email send failures and parse errors (deliberate best-effort). `src/lib/sow/service.ts` uses structured `console.error('[sow/finalize] ...')` tagged logging. Partial typed error helpers exist in `src/lib/` (4 files use `class.*Error` or `type.*Error` patterns). Not standardized.

**CLAUDE.md status:** Present, 369 lines — the largest and most comprehensive CLAUDE.md in the portfolio. 30+ `##` sections including: full business model, pain cluster definitions by vertical, pricing model, tone and positioning rules with 7 enumerated no-fabrication sub-rules, pre-launch priority list, three-subdomain architecture diagram, domain context. Represents the gold standard for per-repo AI agent directives.

**Test framework + counts:** Vitest. 89 test files. Mix of unit tests (`src/lib/**/*.test.ts`) and integration tests (`tests/`). Workers all have `index.test.ts` files (contradicting the ss-console code review's finding — those tests do exist). 59 core tests per the review; additional worker test files add coverage. Strong: `tests/forbidden-strings.test.ts` is a regex-based regression guard for no-fabrication violations.

**Recent reviews + grades:** Four reviews present. Most recent: `docs/reviews/code-review-2026-04-24.md` — Overall: **C+** (stable). Scorecard: Architecture B, Security D (rate limiting gaps), Code Quality B, Testing B, Dependencies B, Documentation C, Golden Path B. Trend: improving from D (2026-04-07) through C (2026-04-16) to C+ (2026-04-24).

**Other observations:** `src/lib/enrichment/index.ts` uses `as unknown as Record<string, unknown>` 9 times to push typed enrichment results into metadata fields — a type-system workaround that the review flagged as a pattern to fix by widening the type signature. `src/lib/db/context.ts` DAL helpers lack `orgId` parameter unlike all other DAL modules — a latent multi-tenant footgun. Staging `wrangler.toml` reuses production D1/R2/KV bindings (any staging deploy writes production data).

---

### dc-console

**File-size top 15 (production source, workers + web):**

| LOC | Path                                                  |
| --- | ----------------------------------------------------- |
| 698 | `workers/dc-api/src/services/drive-files.ts`          |
| 680 | `web/src/components/layout/sidebar.tsx`               |
| 651 | `web/src/components/instruction-list.tsx`             |
| 616 | `workers/dc-api/src/routes/drive.ts`                  |
| 568 | `workers/dc-api/src/services/research-query.ts`       |
| 565 | `workers/dc-api/src/services/source-material.ts`      |
| 558 | `web/src/components/sources/desk-tab.tsx`             |
| 533 | `web/src/app/(protected)/dashboard/page.tsx`          |
| 519 | `web/src/app/(protected)/editor/[projectId]/page.tsx` |
| 480 | `workers/dc-api/src/services/deep-analysis.ts`        |
| 476 | `workers/dc-api/src/services/project.ts`              |
| 438 | `workers/dc-api/src/services/export-delivery.ts`      |
| 432 | `workers/dc-api/src/services/chunking.ts`             |
| 406 | `workers/dc-api/src/services/drive-token.ts`          |
| 393 | `workers/dc-api/src/services/source-drive.ts`         |

Note: `scripts/` contains 9 files >500 LOC (spike/eval scripts), with the largest being `scripts/research-query-quality-gate.ts` at 1,475 LOC. The scripts directory is checked in but not deployed.

Also: `web/src/components/project/export-menu.tsx` at 874 LOC is the largest single frontend component.

**Files >500 LOC (production workers + web):** 15 files. None exceeds 700 LOC in core service code — healthier distribution than dfg-console or ke-console.

**tsconfig strict status:** `strict: true` in `web/tsconfig.json`, `web/tsconfig.sw.json`, and `workers/dc-api/tsconfig.json`. No supplementary flags.

**`any` usage count:** 0 in production source. The 2026-03-23 code review noted 9 `any` occurrences in backend files and 42 in frontend files — "mostly in unavoidable third-party type integrations." Current grep shows 0, suggesting these were cleaned up.

**ESLint extras:** `web/eslint.config.mjs` uses `nextVitals + nextTs`. No root ESLint config (no lint-staged pattern). No custom rules beyond Next.js recommended. Simpler than ke-console, no custom `no-restricted-syntax` rules.

**Error-handling patterns:** 37 catch blocks. Notable: structured `AppError` class with factory functions (`notFound`, `forbidden`, `validationError`, `rateLimited`, `authRequired`) in `workers/dc-api/src/middleware/error-handler.ts`. Global error handler in `workers/dc-api/src/index.ts` writes errors to KV with ULID request IDs and 7-day TTL — the most sophisticated error handling in the portfolio. Frontend catches are `console.error` + state updates, consistent with React patterns.

**CLAUDE.md status:** Present, 204 lines. 18 `##` sections. Notably includes: `## API Routes` (explicit route inventory), `## Design Principles`, `## Security` section, `## Cloudflare Resources`. Includes 12 ADRs in `docs/adr/` (editor library, AI provider, PDF/EPUB, content storage, chunking, snippet engineering) — the only repo with a meaningful ADR inventory.

**Test framework + counts:** Vitest (workers + web). 47 test files. Breakdown: 28 backend test files (`workers/dc-api/test/`), 18 frontend test files (`web/test/`), 1 other. Backend tests are substantial: `integration.test.ts` (731 LOC), `research-query.test.ts` (594 LOC), `snippet-parser.test.ts` (561 LOC). Frontend tests cover hooks and components.

**Recent reviews + grades:** `docs/reviews/code-review-2026-03-23.md` — Overall: **B** (stable vs B on 2026-02-23). Scorecard: Architecture B, Security A, Code Quality A, Testing A, Dependencies D (6 HIGH CVEs in Hono + vitest chain), Documentation B, Golden Path A. Highest overall grade in the portfolio.

**Other observations:** dc-console is the most architecturally mature repo. Separate `services/`, `routes/`, `middleware/` directories with clean layering. Zero `eslint-disable` comments in production source. `dangerouslySetInnerHTML` is used in two places but both have documented server-side `sanitize-html` pipeline. 12 ADRs document architectural decisions — unique in the portfolio. Spike scripts (`doc-parse-spike.ts`, `snippet-prompt-spike.ts`, etc.) are a significant volume of checked-in non-production code.

---

## Cross-Cutting Patterns

### Recurring problems (3+ repos)

1. **File-size violations without decomposition guardrails.** Present in crane-console, sc-console, dfg-console, ke-console, ss-console. Absent only in vc-web (trivially small) and dc-console (managed). The code review on ke-console explicitly graded Architecture C for this reason. No repo has an automated check; the 500-LOC threshold is referenced in NFR documentation but not enforced.

2. **`JSON.parse() as T` without runtime validation.** Every repo with server-side code uses `JSON.parse(x) as SomeType` to deserialize from D1 JSON columns, webhook bodies, and AI responses. The cast is a type-system lie — runtime failures surface as unexpected `undefined` access rather than a validation error. ss-console has `as unknown as Record<string, unknown>` casts; dfg-console has `JSON.parse(jsonStr) as T` generic helpers; sc-console at line 1438 does `cursorData = JSON.parse(atob(cursor))` with no type annotation at all. Zero Zod/Valibot anywhere.

3. **`console.log`/`console.error` as the sole observability mechanism in deployed workers.** dfg-console (86 `console.log` in production source), ss-console (38), sc-console (25), ke-console (5), dc-console (6). dfg-analyst uses manual `[TAG]` prefixes — a hand-rolled log level system. No structured logging (JSON lines, pino, etc.) in any repo. No log-level gating.

4. **No supplementary TypeScript strict flags.** `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` are absent from all 7 repos. All repos use `strict: true` (or Astro's strict preset), so this is a known gap rather than a missed baseline. ke-console's code review explicitly recommended adding these.

5. **Missing schema validation on external input.** No Zod, Valibot, or equivalent in any repo. Webhook payloads (`StripeEvent`, `SignWellEvent`), AI response JSON, URL-encoded form data, and cursor tokens all flow through `as T` casts or manual `typeof` guards. The validation pattern that exists is route-level guard clauses (`if (!body.field) return c.json({ error: '...' }, 400)`) without a reusable schema definition.

6. **Route handler files mixing HTTP plumbing, auth, business logic, and data access.** Identified in ke-console (code review Architecture C: `families.ts` 692 LOC with inline membership checks), sc-console (`index.ts` 2,608 LOC — the most extreme case), dfg-console (`opportunities.ts` 1,839 LOC), and ss-console admin Astro pages. Only dc-console has a clean routes → services → types separation.

7. **ESLint `no-explicit-any` is universally set to `warn` not `error`.** Every repo (except dfg-app which disables it entirely) treats `any` as a warning. This means it accumulates silently. dfg-console has 79 occurrences despite the warning being present. The warning-vs-error distinction means CI does not block on `any` introduction.

### Conventions present in some repos but not others

- **Typed `AppError` class with factory functions:** dc-console only. ke-console, dfg-console, sc-console use string + status codes inline. ss-console has partial typed error helpers but no central factory.
- **ADR documentation:** dc-console (12 ADRs). No other repo has architectural decision records.
- **Money-math non-negotiable rule in CLAUDE.md:** ke-console, dfg-console. Not present in dc-console, sc-console, ss-console despite all doing financial calculations.
- **ESLint `no-unused-vars: error` (vs warn):** ke-console `app/` only. All others use `warn`.
- **Custom ESLint `no-restricted-syntax` rules:** crane-console only (banning localhost:8787 in harness tests).
- **Staged-environment parity:** ke-console uses separate staging wrangler config. ss-console's staging reuses production bindings. sc-console and dfg-console: not audited.
- **Test file co-location vs. separate `tests/` directory:** ke-console and dfg-console use `src/__tests__/`; ss-console uses a top-level `tests/`; dc-console uses `test/` alongside source; sc-console keeps tests in `src/`.
- **ADR/decision documentation:** dc-console (12 ADRs), ss-console (Decision #N references in CLAUDE.md). No ADR directory in any other repo.

### Stack-specific gotchas

**Next.js (ke-console, dfg-console, dc-console):**

- ke-console: `proxy.ts` file naming silently disables Clerk edge middleware (requires `middleware.ts`). This is a Next.js-specific gotcha with no TS/lint warning.
- dfg-console: `react-hooks/set-state-in-effect` downgraded to warn in `dfg-app` — introduced in eslint-plugin-react-hooks v6+ with Next.js 16 migration.
- Next.js 16 ESLint migration: both dfg-console and ke-console migrated from `.eslintrc.json` to flat config — dfg-app comment explicitly documents the migration reason.

**Astro (sc-console, ss-console, vc-web):**

- All use `extends: astro/tsconfigs/strict` (inherits strict mode) but the tsconfig path is `apps/sc-web/tsconfig.json` with no explicit override — meaning individual workers must set `strict: true` independently.
- Admin `.astro` pages in ss-console mix server fetch, client scripts, and DOM manipulation via `innerHTML` template strings — the Astro component model does not enforce separation the way React does.
- `eslint-plugin-astro` included in vc-web and ss-console but not in all ventures (sc-console root eslint has no astro plugin despite having an Astro frontend).

**Cloudflare Workers:**

- dfg-console, sc-console use `catch (err: any)` pattern because `error.message` access requires the `any` cast in Workers' TypeScript environment. This is a runtime-environment-specific pressure driving `any` usage.
- `D1Database.prepare().bind().all()` returns `unknown[]` in typed results — all repos cast the result rows to a specific type without runtime validation. This is a Workers D1 typing limitation.
- dfg-scout `const params: any[] = []` for dynamic D1 query building (lines 62, 90 of `index.ts`) — Workers lacks ORM-level query builders, creating pressure toward untyped dynamic SQL.

---

## Recommended Focus Areas

Ranked by impact (severity × breadth across the portfolio):

1. **File size: enforce a 500-LOC ceiling on production source files with an automated check.** Affects crane-console, sc-console, dfg-console, ke-console, ss-console. The 500-LOC threshold already exists as an NFR smell; it needs a CI-enforced ESLint or shell rule. The sc-console `index.ts` (2,608 LOC), dfg `worker.ts` (3,108 LOC), and crane-console `launch-lib.ts` (2,308 LOC) are the most consequential decomposition targets.

2. **Schema validation: mandate a runtime validation layer for all external input.** No repo validates webhook payloads, AI response JSON, URL cursors, or D1 JSON column deserialization. The `JSON.parse() as T` pattern is universal. This is the highest-coverage quality gap — it affects every repo with a deployed API. A directive to use Zod schemas at API boundaries (webhook handlers, AI response parsers, D1 JSON columns) would close a gap that strict TypeScript cannot close.

3. **ESLint `no-explicit-any: error` (not warn) for production source.** Currently warn universally, disabled in dfg-app. The difference between warn and error determines whether `any` accumulates silently. Combined with a test-file relaxation (already the pattern), this would have caught the 79 dfg-console production `any` occurrences in CI.

4. **Supplementary TypeScript flags: `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.** Absent across the entire portfolio. These catch a class of bugs that `strict: true` misses: array index access returning `T | undefined`, optional property assignments. The ke-console code review recommended these specifically. Low migration cost on newer repos (dc, sc) where `any` usage is already 0.

5. **Structured error handling: typed `AppError` class as the portfolio standard.** dc-console has this pattern; nobody else does. Directive: every repo with a Worker API should have an `AppError` class with status code + error code + factory functions. The current state is that `console.error` + generic `500` is the de facto standard in 4 of 5 API repos.

6. **Structured logging directive for Workers.** dfg-console (86 `console.log`), ss-console (38), sc-console (25) use ad hoc tagged console output. A directive to use a consistent log shape (JSON with level, message, context fields) and to gate debug logs behind an env flag would improve observability without requiring a logging library.

7. **Dead code elimination: mandate removal of dead exports and dead API layers.** ke-console `api.ts` (990 LOC, mostly dead exports), dc-console scripts directory (10 files), crane-console has the same structural pressure. A directive to not preserve unused exports "for future use" — kill them at decision time.

8. **CLAUDE.md standardization: minimum section requirements across all repos.** The 4x gap between ss-console (369 lines) and sc-console (96 lines) in CLAUDE.md richness means agent sessions in sc-console have substantially less context. Minimum required sections: coding standards with any-specific guidance, error-handling pattern for the stack, test requirements (unit vs. integration split), domain-specific non-negotiables (money math if financial, validation rule if content-generating).

9. **Catch clause discipline: no bare `catch {}` or `catch { // ignore }`.** sc-console `index.ts:385` and `index.ts:660`, ss-console `enrichment/index.ts:545` and `enrichment/index.ts:626` explicitly swallow errors. A directive (and ESLint rule for `no-empty` on catch blocks) would surface these. The two ss-console instances are deliberately best-effort; the directive should require an explicit comment form with a justification reference.

10. **Route handler decomposition: routes must delegate to service modules.** The pattern of 600-1800 LOC route handler files is the primary architecture debt in ke-console, sc-console, dfg-console. The dc-console routes→services→types separation and ke-console code review Architecture C grade both support this as a codifiable standard. A directive like "route handlers may not contain D1 queries or business logic — extract to a service module" would be the portable form.
