---
title: 'Adoption Runbook'
sidebar:
  order: 50
---

# Design System Adoption Runbook

The canonical per-venture playbook for migrating from inline design tokens to the shared `@venturecrane/tokens` package. Every Stream C migration PR follows this runbook end-to-end. Deviations from the steps below should be discussed in the migration PR description.

This document is a runbook, not a tutorial. It assumes the reader is an operator (or AI teammate) executing a migration; it does not motivate the design system — see [`overview.md`](overview.md) and [`enterprise-scoping.md`](enterprise-scoping.md) for that.

## Overview

**What "migrating" means.** A venture has migrated when:

1. Its `globals.css` (or equivalent root stylesheet) imports `@venturecrane/tokens/{code}.css` instead of declaring inline `--{code}-*` custom properties.
2. Its CI runs `ui-drift-audit` and fails on token-compliance violations above the venture's calibrated threshold.
3. Its CLAUDE.md tells venture agents when and how to load the enterprise patterns + components catalog.
4. A pre-/post-migration Playwright screenshot sweep is attached to the migration PR for Captain eyeball review.

**Outcome.** The venture's CSS uses semantic tokens sourced from the enterprise package; CI gates compliance; agents working in the venture have machine-readable links to the canonical pattern library. Visual identity is preserved (or, for greenfield ventures, the brief-driven identity is codified in the package).

**Per-venture wall-clock.** 4–14 hours depending on tier. Tier 1 brownfield ventures (KE, DC) are mechanical — replace inline tokens, run build, capture diffs. Tier 3 greenfield (SC, DFG) need a `/design-brief` first plus a Tailwind v3→v4 upgrade PR. SS is conditional on the P4 `@layer` spike outcome.

## Prerequisites

Before opening the migration PR for a venture, verify:

### 1. Local `.npmrc` setup

The venture repo must have an `.npmrc` configuring the `@venturecrane` scope to resolve from GitHub Packages. Use the canonical template at [`templates/venture/.npmrc`](https://github.com/venturecrane/crane-console/blob/main/templates/venture/.npmrc):

```
@venturecrane:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

If the venture already has an `.npmrc`, append these two lines. Do **not** check in tokens or auth values — the `${NODE_AUTH_TOKEN}` reference resolves at install time.

### 2. `NODE_AUTH_TOKEN` env var

Both local-dev and CI need a token with the `read:packages` scope on the `venturecrane` org.

- **Locally:** export a PAT (classic or fine-grained) into the operator shell, e.g. `export NODE_AUTH_TOKEN=ghp_…` (managed via Bitwarden, never echoed in transcripts).
- **CI:** the venture's GitHub Actions workflows can use the auto-provisioned `secrets.GITHUB_TOKEN`, which already carries the right scope inside `venturecrane/*` repos. Pass it as the `NODE_AUTH_TOKEN` env var to the install step.

> **Local PAT scope gap.** The `crane`-launcher-injected `GH_TOKEN` is scoped for `repo` / `workflow` operations and does **not** include `read:packages`. Local installs of `@venturecrane/*` packages will return HTTP 403 with that token. See [issue #718](https://github.com/venturecrane/crane-console/issues/718) for the canonical fix; until it lands, configure a separate `NODE_AUTH_TOKEN` PAT for local installs.

### 3. Node version

The tokens package and crane-console workspaces require Node >= 22.0.0 (see the `engines` block in [`packages/tokens/package.json`](https://github.com/venturecrane/crane-console/blob/main/packages/tokens/package.json) and the repo-root `package.json`). Verify with `node --version` before installing. Use the `.nvmrc` in the venture repo (or copy the one from crane-console) to pin.

### 4. Pre-migration sanity

- The venture builds clean on `main` (`npm run build` exits 0).
- The venture's existing inline tokens are committed (no uncommitted token edits — they would obscure the migration diff).
- For SC and DFG only: the Tailwind v3→v4 upgrade PR has merged separately (see Stream C6/C7) before token adoption begins.

## Step 1 — Pre-stage venture token JSON

The token package emits one `{code}.css` per venture, generated from a W3C-DTCG JSON source under [`packages/tokens/src/ventures/`](https://github.com/venturecrane/crane-console/tree/main/packages/tokens/src/ventures). For brownfield ventures, this file already exists (e.g., `vc.json`, `ke.json`). For greenfield ventures, it is authored in this step from the `/design-brief` output.

**Open a separate PR on `crane-console`** that adds (or updates) `packages/tokens/src/ventures/{code}.json`. Keep the migration PR (which lands on the venture repo) decoupled — the venture cannot consume the token file until the package republishes.

### File shape

W3C-DTCG: each token is an object with `$value`, `$type`, and `$description`. Reference the existing [`vc.json`](https://github.com/venturecrane/crane-console/blob/main/packages/tokens/src/ventures/vc.json) for the canonical structure. The minimum brownfield shape covers four color groups:

- **chrome** — `chrome`, `chrome-light` (header / nav / footer surfaces)
- **surface** — `surface`, `surface-raised`, `code-bg` (content card and elevated surfaces)
- **accent + functional color** — `accent`, `accent-hover`, plus venture-specific accents (e.g., VC's `gold-*` family)
- **text** — `text`, `text-muted`, `text-inverse`
- **border** — `border` (and any per-venture variants)

Base typography, spacing, and motion tokens are shared across ventures (they live in `packages/tokens/src/base/`); per-venture JSON only declares what diverges. If a venture genuinely needs its own type scale or spacing rhythm, declare it in the venture file with a clear `$description` explaining the divergence.

### Authoring rules

1. Every color token includes a `$description` with its WCAG contrast ratio against the adjacent surface (AA minimum).
2. Token names map 1:1 with the legacy inline names so the codemod is mechanical (`--vc-color-accent` stays `--vc-color-accent`).
3. No raw hex literals duplicated across tokens — if two tokens share a value, one references the other (or you have an unintentional collision).
4. Style Dictionary's build is the validator. Run `npm run build -w @venturecrane/tokens` after editing the JSON; a missing field or malformed `$type` fails the build loudly.

### Tag and republish

After the venture JSON PR merges:

1. Tag a new `tokens-v*` release (use `tokens-v0.0.1-alpha.<n>` for in-flight pilots; `tokens-v0.1.0+` once KE has burned in).
2. The [`publish-tokens.yml`](https://github.com/venturecrane/crane-console/blob/main/.github/workflows/publish-tokens.yml) workflow republishes to GitHub Packages.
3. Smoke-install in `/tmp` to verify the new version resolves.

The venture migration PR can now reference the new version.

## Step 2 — Pre-migration Playwright baseline

Capture screenshots of 3–5 representative routes before changing any CSS. These attach to the migration PR description so the Captain can eyeball the diff.

### Route selection

Pick routes that exercise the most semantic surface area:

1. **Home / dashboard** — chrome, primary surface, accent CTA.
2. **List view** — repeated rows, table or card grid, status indicators.
3. **Detail view** — content-heavy surface, secondary surfaces, inline actions.
4. **Settings / form** — form inputs, focus states, validation surfaces.
5. **Primary action page** — the venture's headline workflow (e.g., KE expense entry, DC document edit).

Pick fewer than 5 only if the venture genuinely lacks one of the categories — a marketing site has no settings page, for instance.

### Playwright command

A minimal capture script using `@playwright/test` (assumes the venture's dev server is running on port 3000):

```sh
npx playwright screenshot \
  --viewport-size=1280,800 \
  --device="Desktop Chrome" \
  http://localhost:3000/ \
  .design/baselines/pre-migration-home.png

# Repeat per route. Mobile viewport for responsive ventures:
npx playwright screenshot \
  --viewport-size=390,844 \
  --device="iPhone 13" \
  http://localhost:3000/list \
  .design/baselines/pre-migration-list-mobile.png
```

For ventures with auth-gated routes, write a small Playwright script that signs in once and captures all routes in one run. Commit the script to `.design/baselines/capture.spec.ts` so the post-migration sweep is identical.

### Where the baselines live

Commit the screenshots under `.design/baselines/` in the venture repo. Reference them in the migration PR description (`![pre-migration home](./.design/baselines/pre-migration-home.png)`). Delete after the migration PR merges — they are PR-scoped artifacts, not durable design references.

## Step 3 — Migrate `globals.css`

The mechanical replacement. With the venture JSON already published, swap inline tokens for an `@import`.

### Before / after diff template

```diff
 /* src/styles/globals.css */
-:root {
-  --vc-color-chrome: #1a1a2e;
-  --vc-color-chrome-light: #1e1e36;
-  --vc-color-surface: #242438;
-  /* … 30+ inline declarations … */
-  --vc-color-accent: #818cf8;
-  --vc-color-text: #e8e8f0;
-  --vc-color-border: #2e2e4a;
-}
+@import '@venturecrane/tokens/vc.css';

 /* Venture-specific overrides (rare) stay below the import.
    If you find yourself overriding more than a handful of tokens,
    file an issue against crane-console — the divergence belongs
    in the venture JSON, not in inline overrides. */
```

If the venture uses Tailwind v4's `@theme` block, place the import **before** `@theme` so Tailwind utilities can reference the imported custom properties. Tailwind v3 ventures (none post-Stream-C) would map tokens via `tailwind.config.{js,ts}` instead — that path is documented in the SC/DFG migration PRs.

### Verify

```sh
npm install @venturecrane/tokens@<version>
npm run build
```

`npm run build` must exit 0. If TypeScript or the bundler rejects the import, see the FAQ below.

### Stage the diff

Keep this commit small and focused — `globals.css` + `package.json` + `package-lock.json`. No other files. The reviewer should be able to verify the change in under 30 seconds.

## Step 4 — Post-migration Playwright sweep

Re-run the exact capture script from Step 2 against the migrated venture. Compare the new screenshots against the baselines.

### Visual diff

If you have access to a visual-diff tool (Playwright's `expect(page).toHaveScreenshot()`, Percy, Chromatic), prefer that. Otherwise, attach both screenshots side-by-side in the PR description:

```markdown
### Home — pre-migration

![pre-migration home](./.design/baselines/pre-migration-home.png)

### Home — post-migration

![post-migration home](./.design/baselines/post-migration-home.png)
```

### What an acceptable diff looks like

- **Identical pixels.** The migration is mechanical; the rendered output should be byte-for-byte identical (or sub-pixel-different due to font hinting). Any larger diff means a token value drifted between the inline declaration and the JSON source. Stop and reconcile before continuing.
- **One known exception:** if Step 1 explicitly noted a token-value correction (e.g., the venture's old chrome was `#1a1a2e` but the corrected JSON uses `#1a1a30`), the diff will show that correction. Note the intentional change in the PR description.

## Step 5 — Wire CLAUDE.md snippet

Every venture's `CLAUDE.md` needs a short block telling agents when and how to load the enterprise patterns + components catalog. The canonical snippet lives at [`docs/design-system/adoption/claude-md-snippet.md`](adoption/claude-md-snippet.md).

Copy the snippet into the venture's `CLAUDE.md` under the existing "Instruction Modules" section (or equivalent). The snippet is ~10–15 lines and uses `crane_doc('global', 'design-system/patterns/index.md')` plus `crane_doc('global', 'design-system/components/index.md')` to fetch the catalog on demand.

Replace any older venture-specific design instructions that referenced inline globals — those are now obsolete. Keep the venture's design-spec reference (`crane_doc('{code}', 'design-spec.md')`) intact; the per-venture spec is still the source for venture-specific palette and tone.

## Step 6 — Wire audit workflow

Copy the canonical CI workflow snippet from [`docs/design-system/adoption/audit-workflow.yml.template`](adoption/audit-workflow.yml.template) (Stream B4 deliverable) into the venture's `.github/workflows/ui-drift-audit.yml`.

The snippet:

1. Runs `ui-drift-audit` on every PR that touches `src/**` or `*.css`.
2. Reads `.ui-drift.json` from the venture root for `STATUS_WORDS_RX` and threshold tuning.
3. Posts findings as a PR comment.
4. Gates merge on the threshold being met (token-compliance failures fail the check above the calibrated number).

Per-venture threshold calibration is documented in the snippet header. Tier 1 brownfield ventures start at 0 (zero token violations allowed); Tier 3 greenfield ventures may start at the migration baseline and ratchet down. Captain reviews the chosen threshold in the migration PR.

## Step 7 — Captain eyeball checklist

Before requesting Captain review on the migration PR, verify against the [mission-complete smoke tests](enterprise-scoping.md):

1. **Tokens published.** `npm view @venturecrane/tokens versions --registry=https://npm.pkg.github.com` includes the version this PR pins.
2. **Venture imports the package.** `grep -l '@venturecrane/tokens' package.json` matches; `grep -rl '@import.*@venturecrane/tokens' src` matches in the venture's CSS root.
3. **CLAUDE.md references patterns.** `grep -l 'design-system/patterns' CLAUDE.md` matches.
4. **CI runs ui-drift-audit.** `gh workflow list -R venturecrane/{venture} | grep ui-drift-audit` matches; latest main run on the workflow is green.
5. **Build green.** `npm run build` exits 0 in the venture and (if applicable) in the matching crane-console workspace.
6. **Pre/post screenshots match expectations.** No unintended visual drift; intentional changes documented in the PR description.

If all six pass, request Captain review. The Captain's review is an eyeball-and-merge step (5–10 minutes per venture) — not a deep code review.

## Rollback playbook

If something goes wrong post-migration, prefer reverting over patching forward.

- **Token publish gone bad.** Alpha-first publish (`tokens-v0.0.1-alpha.*`) protects production: ventures pinning `^0.1.0` won't pick up an alpha. Bump a patch (`0.1.1`) with the fix; ventures get the fix on next install. Do not unpublish from GitHub Packages — version history matters.
- **Venture migration breaks build.** `git revert` the migration commit on the venture repo. The prior inline tokens come back from git history; rebuild the lockfile with `npm install`. Ship a corrective PR with the actual fix; do not leave the revert sitting.
- **SS codemod misses sites (rename path).** `git revert` is the only safe option. The additive-then-removal structure was designed for this; reverting the removal commit restores the dual-token state. Add a follow-up PR with broader codemod coverage.
- **`@layer` isolation fails post-merge (SS).** Drop the `@import '@venturecrane/tokens/ss.css'` line in the venture's `globals.css`. The layered tokens were additive — removing the import returns SS to its pre-migration state without other side effects.
- **Skill update breaks invocations.** `git revert` the skill PR. The skill version stays bumped (semver one-way); agents pinning the prior version do so via a `crane_memory` notice that names the broken version.
- **Sync-docs uploads wrong scope.** The context worker has version history; admin API revert restores the prior content. The wrong-scope upload itself is non-destructive — it lives alongside the right-scope upload until cleaned up.

## FAQ / Common gotchas

### `npm run build` fails after the migration

Check, in order:

1. **Tailwind v3 venture trying to consume the package.** SC and DFG must merge their Tailwind v4 upgrade PR (Stream C6/C7 step (i)) **before** running this runbook. v3 cannot resolve the `@import '@venturecrane/tokens/{code}.css'` directive in the same way; the fix is the upgrade PR, not a workaround.
2. **Stale `node_modules` or lockfile.** `rm -rf node_modules package-lock.json && npm install` to rebuild against the published version.
3. **Token-name mismatch.** A token referenced in venture code (e.g., `var(--vc-color-foo)`) doesn't exist in the published CSS. Either the JSON is missing the token (fix the JSON, republish) or the venture code references a legacy inline-only token (rename the reference).
4. **Wrong package version pinned.** Verify `package.json` pins a version that exists on GitHub Packages (`npm view @venturecrane/tokens versions`).

### The Tailwind v3 → v4 path for SC and DFG

Both ventures land their v3→v4 upgrade as a **separate PR before token adoption**. The upgrade PR:

1. Removes hardcoded hex literals from `tailwind.config.js` and migrates to the v4 `@theme` block in CSS (DFG step C7(i)).
2. Replaces `tailwind.config.js` with a v4 `@import "tailwindcss"` directive plus `@theme` declarations.
3. Verifies build green and ships its own pre/post screenshot sweep.

Only after that PR merges does the token-adoption PR (this runbook) open against the same venture.

### SS unprefixed-token rename gate

SS has historical CSS using `var(--color-*)` style references (no `--ss-*` prefix). The decision tree:

- **If the P4 `@layer` spike succeeded:** wrap the imported tokens in `@layer ss-tokens { … }` in `globals.css`. Tailwind utilities continue to resolve; enterprise-prefixed tokens (when imported elsewhere) don't collide. No rename. This is a 3-hour migration.
- **If the spike failed:** ship the rename in **two PRs**.
  1. **Additive PR** — adds `--ss-*` aliases alongside the unprefixed names. No call sites change yet. Build green; visual diff identical.
  2. **Removal PR** — codemods all call sites to use the prefixed names; deletes the unprefixed declarations. Full Playwright sweep between PRs to confirm no drift.

The Captain confirms the spike outcome (call #3 in the plan) before the migration PR opens.

### What if a venture genuinely needs a token the package doesn't provide?

Open a small-tier contribution per [`governance.md`](governance.md): add the token to the venture's JSON, republish, pin the new version. Inline overrides in the venture's CSS are an anti-pattern — they reintroduce the drift the package exists to prevent.

### What if the post-migration screenshots show a small diff but the migration is correct?

Investigate before merging. Common sources:

- A token's hex value was rounded (e.g., `#fff` vs `#ffffff` — rendered identically by browsers, byte-different in screenshots only when font-rendering shifts).
- A previously-typo'd token in inline CSS (`--vc-color-text-muted` declared but never used; the package doesn't carry the typo). The diff is the typo correcting itself — note in PR.
- A token reference resolves differently because of CSS-cascade ordering. Move the import to the top of `globals.css`.

If the diff is genuinely a regression, revert and investigate before reopening.

### Where do I file a question this runbook doesn't answer?

Open an issue against `venturecrane/crane-console` with the `area:design-system` label. Don't block the migration PR on a docs question — note the open question in the PR description and merge if Steps 1–7 pass.
