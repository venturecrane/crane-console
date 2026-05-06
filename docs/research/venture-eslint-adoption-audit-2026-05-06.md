# Venture ESLint Adoption Audit — 2026-05-06

## Summary

| Venture     | Files >500 LOC (source)                   | Default exports (non-framework)                     | Adoption complexity                 |
| ----------- | ----------------------------------------- | --------------------------------------------------- | ----------------------------------- |
| vc-web      | 0                                         | 1 (markdown file, ignorable)                        | low                                 |
| sc-console  | 1 (workers/sc-api/src/index.ts: 2608 LOC) | 2 (worker entry points, covered by allow pattern)   | high (structural)                   |
| dfg-console | 13                                        | 4 (2 app components + 2 worker entries)             | high (structural + any)             |
| ke-console  | 9 (app pages + worker routes)             | 14 (Hono sub-app pattern — needs new allow pattern) | high (structural + pattern gap)     |
| ss-console  | 24                                        | 1 (env.d.ts, ignorable)                             | high (structural, biggest backlog)  |
| dc-console  | 10 (web components + worker services)     | 12 (React components, real violations)              | high (structural + default exports) |

## Universal findings (all 6 repos)

- No repo has `eslint-plugin-import-x` installed. This is a new dependency for every adoption PR.
- No repo has `projectService: true` wired in their eslint config. Type-aware rules (`no-floating-promises`, `no-misused-promises`, `await-thenable`, `switch-exhaustiveness-check`) are currently completely absent.
- All repos run type-safety rules (`no-explicit-any`, `no-unused-vars`, `no-require-imports`) at `warn` severity. Adoption upgrades these to `error`.
- `eqeqeq`, `no-throw-literal`, `no-useless-assignment`, `preserve-caught-error` are not configured in any venture repo — these are net-new.
- `globals` package is already installed in all repos.
- `typescript-eslint` is installed in all repos (versions ^8.20.0–^8.56.0).

---

## vc-web

**Current eslint setup**: Flat config, single `eslint.config.js` at root. Stack: `js.configs.recommended` + `tseslint.configs.recommended` + `eslint-plugin-astro`. Type-safety rules at `warn`. No test overrides. No `projectService`. No `import-x`.

**Eslint deps**:

- `eslint` ^9.18.0
- `@eslint/js` ^9.18.0
- `typescript-eslint` ^8.55.0
- `eslint-plugin-astro` ^1.3.0

**tsconfig shape**: Extends `astro/tsconfigs/strict`. Single config, no `references`. `projectService` compatible with `tsconfigRootDir` set to repo root.

**Per-repo overrides to preserve**:

- `globals.browser` in `languageOptions` (needed for Astro client-side scripts).
- `eslint-plugin-astro` integration — must remain in the `additional` array.
- Ignores: `dist`, `node_modules`, `.wrangler`, `.astro`.

**Migration plan**:

1. `npm install --save-dev eslint-plugin-import-x` in root.
2. Replace `eslint.config.js` body with `venturecraneEslintConfig({ tsconfigRootDir, additional: [...astro.configs.recommended, { languageOptions: { globals: { ...globals.browser } } }] })`.
3. Remove standalone `eslint-plugin-astro` and `@eslint/js` deps (absorbed by shared config).
4. Verify `.astro` files remain in `DEFAULT_EXPORT_ALLOW_PATTERNS` (they are).

**Estimated violations on adoption**: 0 structural (no files >500 LOC), 0 real default-export violations (the one hit is a `.md` file outside lint scope), ~0 `any` files. Primary exposure is the `warn`→`error` promotion on the 3 type-safety rules and net-new rules (`eqeqeq`, etc.) — likely low count given clean codebase.

**Risks**: Low. Smallest and cleanest repo. Good first adoption target.

---

## sc-console

**Current eslint setup**: Single root `eslint.config.js` covering both `apps/sc-web/` (Astro) and `workers/` (no separate per-worker config). Stack: `js.configs.recommended` + `tseslint.configs.recommended`. Test file overrides present. No `projectService`. No `import-x`. No `eslint-plugin-astro`.

**Eslint deps** (root):

- `eslint` ^9.18.0
- `@eslint/js` ^9.18.0
- `typescript-eslint` ^8.20.0

**tsconfig shape**: No root tsconfig. Per-package tsconfigs: `apps/sc-web/tsconfig.json` (extends `astro/tsconfigs/strict`), `workers/sc-api/tsconfig.json` (separate). `projectService` with multiple tsconfigs requires a root tsconfig that references both, or per-package eslint configs each with their own `tsconfigRootDir`.

**Per-repo overrides to preserve**:

- `eslint-plugin-astro` must be added (currently missing — sc-web Astro files are linted without the Astro parser).
- Ignores: `dist`, `node_modules`, `.wrangler`, `.astro`.
- Test overrides (`**/*.test.ts`, `**/*.spec.ts`).

**Migration plan**:

1. Add root `tsconfig.json` that `references` both `apps/sc-web` and `workers/sc-api` — required for `projectService`.
2. `npm install --save-dev eslint-plugin-import-x eslint-plugin-astro`.
3. Split into per-package eslint configs (sc-web and sc-api) each calling `venturecraneEslintConfig`, or use a root config with `tsconfigRootDir` pointing at a references-based root tsconfig.
4. `sc-api/src/index.ts` (2608 LOC) — must be split before adoption or the `max-lines: 500` rule fires immediately. This is the blocking structural item.

**Estimated violations on adoption**: 1 critical structural (sc-api/src/index.ts at 2608 LOC — factor of 5× over limit), 0 default-export violations (worker entry points covered by `**/workers/*/src/index.ts` allow pattern), 1 file with `any` usage. Primary work is the index.ts decomposition.

**Risks**: High. The `sc-api/src/index.ts` monolith is a significant refactor. The missing root tsconfig for `projectService` is a required setup step with multi-tsconfig complexity. `eslint-plugin-astro` is also currently absent from the config — sc-web Astro files are getting no Astro-specific lint.

---

## dfg-console

**Current eslint setup**: Multi-package monorepo. Root `eslint.config.js` (same minimal shape as sc-console) for workers. Per-package configs in `apps/dfg-app/eslint.config.mjs` and `apps/dfg-core/eslint.config.mjs` (both use `eslint-config-next` flat config). `dfg-app` explicitly turns off `@typescript-eslint/no-explicit-any`.

**Eslint deps** (root):

- `eslint` ^9.18.0
- `@eslint/js` ^9.18.0
- `typescript-eslint` ^8.20.0

**tsconfig shape**: Per-package tsconfigs throughout (`apps/dfg-app`, `apps/dfg-core`, `workers/dfg-analyst`, `workers/dfg-api`, `workers/dfg-scout`, `packages/dfg-types`, `packages/dfg-money-math`). No root references tsconfig.

**Per-repo overrides to preserve**:

- `dfg-app`'s `react-hooks/set-state-in-effect: warn` override (documented as temporary, but in-flight).
- `eslint-config-next` chains (`nextVitals` + `nextTs`) for app packages.
- Workers use basic `tseslint.configs.recommended` — no Next.js plugins needed there.

**Migration plan**:

1. For `apps/dfg-app` and `apps/dfg-core`: replace `eslint-config-next` chain with `venturecraneEslintConfig` + `additional` block adding `react-hooks/set-state-in-effect: warn` override. Note: `eslint-config-next` currently provides React/React-Hooks plugin rules — evaluate whether the shared config needs a `globals.browser` addition or react plugin in `additional`.
2. For `workers/`: replace root `eslint.config.js` with per-worker configs calling `venturecraneEslintConfig`.
3. `npm install --save-dev eslint-plugin-import-x` in root.
4. Large file decompositions required: `dfg-analyst/src/worker.ts` (3108 LOC), `dfg-api/src/routes/opportunities.ts` (1839 LOC), `dfg-app/opportunities/[id]/page.tsx` (1054 LOC), `dfg-analyst/src/calculation-spine.ts` (911 LOC), `dfg-analyst/src/analysis.ts` (838 LOC).
5. Address 26 files with `any` usage — `dfg-app` explicitly opts out; this needs a sweep and either type fixes or targeted inline disables.

**Estimated violations on adoption**: 13 structural (files >500 LOC source), 4 default-export violations (2 app components: `attention-required-list.tsx`, `ending-soon-list.tsx`; worker entries are covered), 26 files with `any` (many in dfg-app where it was explicitly permitted).

**Risks**: High. Largest structural debt in the portfolio. Worker decomposition (dfg-analyst/src/worker.ts at 3108 LOC) is a significant investment. The `any` sweep in dfg-app requires the `dfg-types` package to be properly typed first. Best adopted last.

---

## ke-console

**Current eslint setup**: Multi-package monorepo. Root `eslint.config.mjs` ignores everything (`'**/*'`) — a passthrough so lint-staged can resolve a config. Per-package configs:

- `app/eslint.config.mjs`: `eslint-config-next` (core-web-vitals + typescript), `no-unused-vars` at `error`.
- `workers/ke-api/eslint.config.mjs`: minimal `tseslint.configs.recommended`, no rules beyond defaults.

**Eslint deps**:

- `app/`: `eslint` ^9, `eslint-config-next` 16.1.6
- `workers/ke-api/`: `eslint` ^10.0.0, `@eslint/js` ^10.0.1, `typescript-eslint` ^8.56.0

Note: ke-api is already on eslint ^10 — ahead of other repos.

**tsconfig shape**: `app/tsconfig.json` (Next.js, incremental, no `references`). `workers/ke-api/tsconfig.json` (separate). No root tsconfig.

**Per-repo overrides to preserve**:

- `app/`: React/React-Hooks rules from `eslint-config-next` chain.
- `app/`: `no-unused-vars` is already at `error` (stricter than new config's identical setting).

**Migration plan**:

1. `app/`: Replace `eslint-config-next` chain with `venturecraneEslintConfig({ tsconfigRootDir: appDir, additional: [/* react-hooks plugin if needed */] })`.
2. `workers/ke-api/`: Replace minimal config with `venturecraneEslintConfig({ tsconfigRootDir: keApiDir })`.
3. `npm install --save-dev eslint-plugin-import-x` in both packages (or root).
4. **Critical pattern gap**: Hono sub-app route files use `export default app` (14 files in `workers/ke-api/src/routes/`). The `DEFAULT_EXPORT_ALLOW_PATTERNS` only covers `**/workers/*/src/index.ts`. Add `**/workers/*/src/routes/*.ts` to the shared allow list, or add a per-repo `additional` override. This is a **cross-portfolio issue** — sc-console and dfg-console have the same pattern.
5. Decompose large files: 6 Next.js page files >500 LOC (top offender: `expenses/page.tsx` at 1040 LOC), 3 ke-api route files >500 LOC.

**Estimated violations on adoption**: 9 structural (source files >500 LOC), 14 default-export violations on Hono routes (real, require pattern fix), 0 `any` files. Hono route pattern is the blocking discovery.

**Risks**: High due to volume (9 structural + 14 default-export). The Hono sub-app `export default app` pattern needs a shared config fix — it is not repo-specific. Recommend resolving in `DEFAULT_EXPORT_ALLOW_PATTERNS` before any adoption PR.

---

## ss-console

**Current eslint setup**: Single root `eslint.config.js` covering `src/` (Astro app). Workers are in `workers/` dir but the root tsconfig explicitly excludes them (`"exclude": ["workers", ...]`). Workers have no eslint config. Stack: `js.configs.recommended` + `tseslint.configs.recommended` + `eslint-plugin-astro`. Uses `eslint/config`'s `defineConfig` wrapper. Test overrides present.

**Eslint deps**:

- `eslint` ^9.18.0
- `@eslint/js` ^9.18.0
- `typescript-eslint` ^8.20.0
- `eslint-plugin-astro` ^1.6.0

**tsconfig shape**: Root `tsconfig.json` extends `astro/tsconfigs/strict`, excludes `workers/`. Per-worker tsconfigs in `workers/*/tsconfig.json`. `projectService` with `tsconfigRootDir` at repo root would cover `src/` but not workers — workers need separate eslint configs.

**Per-repo overrides to preserve**:

- `eslint-plugin-astro` in `additional`.
- `globals.browser` for Astro client scripts.
- Ignores: `dist`, `node_modules`, `.wrangler`, `.astro`, `coverage`, `.claude/worktrees`, `.worktrees`.
- Workers currently have no eslint coverage — adding coverage is a scope expansion, not a preservation.

**Migration plan**:

1. `npm install --save-dev eslint-plugin-import-x` in root.
2. Replace root config with `venturecraneEslintConfig({ tsconfigRootDir, additional: [astro.configs.recommended, { languageOptions: { globals: globals.browser } }] })`.
3. Add per-worker eslint configs in `workers/*/` each calling `venturecraneEslintConfig` with their respective `tsconfigRootDir`.
4. Large file decompositions: 24 source files >500 LOC. Top offenders in lib layer: `lib/sow/service.ts` (859 LOC), `lib/enrichment/index.ts` (811 LOC), `lib/db/entities.ts` (807 LOC), `lib/db/quotes.ts` (748 LOC). Many Astro page files are also large but Astro pages have no LOC cap in the shared config (`**/*.astro` is in the allow list for default exports, but the `max-lines` rule still applies to `.astro` files).

**Estimated violations on adoption**: 24 structural (source files >500 LOC — largest backlog in portfolio), 1 default-export violation (`env.d.ts` — an Astro triple-slash reference file, can be excluded via `additional` ignores), 2 files with `any` usage.

**Risks**: High due to volume of structural violations. The Astro page files (`.astro` extension) will each trigger `max-lines` — whether to apply the rule to Astro pages needs a policy decision (they're layout-heavy and often legitimately long). Recommend adding `**/*.astro` to a `max-lines: off` override in the shared config's framework file block, or accepting as-is and treating Astro pages as the refactor target.

---

## dc-console

**Current eslint setup**: Multi-package workspace (`web/` + `workers/*`). Root `eslint.config.mjs` does not exist at root level. `web/eslint.config.mjs` uses `eslint-config-next` (core-web-vitals + typescript). `workers/dc-api` has no eslint config — currently completely uncovered.

**Eslint deps**:

- `web/`: `eslint` ^9, `eslint-config-next` 16.1.6, `typescript` ^5
- `workers/dc-api/`: no eslint installed (confirmed via package.json scan)

**tsconfig shape**: `web/tsconfig.json` (Next.js, incremental). `workers/dc-api/tsconfig.json` (separate). No root tsconfig. `web/tsconfig.sw.json` (service worker variant).

**Per-repo overrides to preserve**:

- `web/`: React/React-Hooks rules from `eslint-config-next`.
- Ignores: `.next`, `out`, `build`, `next-env.d.ts`.

**Migration plan**:

1. `web/`: Replace `eslint-config-next` chain with `venturecraneEslintConfig({ tsconfigRootDir: webDir, additional: [/* react/hooks rules */] })`.
2. `workers/dc-api/`: Add new `eslint.config.mjs` calling `venturecraneEslintConfig`. Install `eslint`, `typescript-eslint`, and `eslint-plugin-import-x` in the worker package.
3. Decompose large web components: `export-menu.tsx` (874 LOC), `sidebar.tsx` (680 LOC), `instruction-list.tsx` (651 LOC). These are also real default-export violations (12 React component files use `export default`).
4. Decompose worker services: `drive-files.ts` (698 LOC), `drive.ts` (616 LOC), `research-query.ts` (568 LOC), `source-material.ts` (565 LOC).
5. Convert 12 default-exporting React components to named exports.

**Estimated violations on adoption**: 10 structural (source files >500 LOC), 12 default-export violations (React components — all real, require refactor), 1 worker default-export (`dc-api/src/index.ts` — covered by allow pattern), 3 files with `any`. Also: dc-api currently has zero eslint coverage; first adoption pass adds net-new coverage.

**Risks**: High. Dual problem: React component default-exports are a codebase convention that needs systematic conversion (12 files), and dc-api has never been linted. The 874-LOC `export-menu.tsx` requires both structural decomposition and default-export conversion.

---

## Cross-venture observations

### Shared patterns requiring shared config fix

**Hono sub-app `export default app` on route files**: ke-console has 14 route files; sc-console and dfg-console workers also use this pattern. The current `DEFAULT_EXPORT_ALLOW_PATTERNS` only covers `**/workers/*/src/index.ts`. Add `**/workers/*/src/routes/*.ts` (or a broader `**/workers/**/*.ts`) before any Worker adoption PR, otherwise the first adoption will immediately surface 14+ violations.

**Next.js `eslint-config-next` replacement**: ke-console, dfg-console, and dc-console all use `eslint-config-next`. The React/React-Hooks plugin rules it provides are not in the shared config. Each adoption PR needs a documented `additional` block that re-adds `eslint-config-react-hooks` or equivalent, or the shared config needs a `framework: 'next'` option.

**`eslint-plugin-astro` not in shared config**: vc-web, sc-console, and ss-console all need Astro plugin rules. These must go in each repo's `additional` block (correct per design), but should be documented as a standard migration step.

### projectService complexity varies

- **Single tsconfig** (vc-web, ss-console src-only): simplest — `tsconfigRootDir` at repo root works immediately.
- **Workers excluded from root tsconfig** (ss-console, ke-console, dc-console): workers need their own `venturecraneEslintConfig` call with their own `tsconfigRootDir`.
- **No root tsconfig at all** (sc-console, dfg-console): requires creating a references-based root tsconfig before `projectService` can be wired.

### Recommended adoption order (fastest first)

1. **vc-web** — 0 structural violations, clean default-export record. Single tsconfig. One `npm install` + config swap. Ideal first adoption to prove the pattern end-to-end.
2. **sc-console** — After the sc-api monolith is decomposed (prerequisite). Once split, the remaining migration is straightforward.
3. **ke-console** — After the Hono route allow-pattern is added to the shared config. 9 structural violations are significant but well-defined.
4. **dc-console** — 12 default-export conversions are mechanical but numerous. dc-api coverage gap is a bonus.
5. **ss-console** — 24 structural violations is the largest absolute number but most are Astro pages (policy decision needed). lib/ refactors are the real work.
6. **dfg-console** — Last. Largest structural debt, 26 `any`-using files, no root tsconfig, and the `dfg-analyst/src/worker.ts` at 3108 LOC is the hardest single decomposition in the portfolio.

### Pre-adoption shared config fix needed

Before any venture adoption PR: add `**/workers/*/src/routes/**/*.ts` (Hono sub-app sub-router files) to `DEFAULT_EXPORT_ALLOW_PATTERNS` in `packages/eslint-config/index.js`.
