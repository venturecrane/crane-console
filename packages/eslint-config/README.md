# @venturecrane/eslint-config

Shared ESLint flat config for the Venture Crane portfolio. Consumed by `crane-console` and every venture repo (`vc-web`, `ss-console`, `dc-console`, `ke-console`, `sc-console`, `dfg-console`).

## Why a shared package

Per-repo `eslint.config.js` files drifted. Tightening rules used to mean opening 7 PRs that each translated the change slightly differently. With this package, new rules land here once and roll out via version bump. Dependabot proposes the bump; CI gates on the new rules.

## Install

The package lives on the `npm.pkg.github.com` registry. Auth is documented at [`docs/infra/github-packages-auth.md`](../../docs/infra/github-packages-auth.md). New ventures get the right `.npmrc` via `templates/venture/.npmrc`.

```sh
npm install --save-dev @venturecrane/eslint-config eslint typescript-eslint
```

## Use

```js
// eslint.config.js
import { venturecraneEslintConfig } from '@venturecrane/eslint-config'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url))

export default venturecraneEslintConfig({
  tsconfigRootDir,
  additional: [
    // Repo-specific overrides — restricted patterns, ignores, etc.
    {
      ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**'],
    },
  ],
})
```

`tsconfigRootDir` is required. `additional` is appended verbatim after the shared rules — use it for ignores, file-pattern restrictions, and per-repo bans.

## Rules

### Structural (error)

| Rule                     | Threshold | Rationale                                                                |
| ------------------------ | --------- | ------------------------------------------------------------------------ |
| `max-lines`              | 500       | Files past 500 LOC interleave concerns. Matches NFR template smell line. |
| `max-lines-per-function` | 75        | Long functions bury control flow. Tractable for TS w/ JSX/imports.       |
| `complexity`             | 15        | Cyclomatic complexity. Default is 20 (loose); Martin says <10 (tight).   |
| `max-depth`              | 4         | Nested control structures.                                               |
| `max-params`             | 5         | Allows event-handler signatures; objects-as-params for the rest.         |

### Type safety (error)

- `@typescript-eslint/no-explicit-any` — promoted from warn. Use `unknown` and narrow.
- `@typescript-eslint/no-unused-vars` — promoted from warn. `_`-prefix exemption preserved.
- `@typescript-eslint/no-require-imports` — promoted from warn. JS files exempted.

### Hygiene (error)

- `eqeqeq` — `===` always, `==` allowed against `null` only.
- `no-throw-literal` — throw `Error` instances, not strings or objects.
- `no-useless-assignment` — flagged by ESLint 10 recommended.
- `preserve-caught-error` — flagged by ESLint 10 recommended.

### Type-aware (error)

These require `projectService: true` (wired automatically) and a tsconfig that covers every linted file.

- `@typescript-eslint/no-floating-promises` — every Promise is awaited, `void`'d, or passed to `ctx.waitUntil`.
- `@typescript-eslint/no-misused-promises` — async callbacks in places that expect sync return.
- `@typescript-eslint/await-thenable` — `await` only thenables.
- `@typescript-eslint/switch-exhaustiveness-check` — discriminated-union switches must cover every case (or use `assertNever`).

### Type-aware (warn)

Sequenced at `warn` until Zod boundary validation is rolled out portfolio-wide. The correct fix for `no-unsafe-*` is parsing untyped inputs at the boundary, not casts. Promotion to `error` is the exit criterion of the Zod boundary initiative.

- `@typescript-eslint/no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-return`, `no-unsafe-argument`
- `@typescript-eslint/restrict-template-expressions` (`allowNumber`, `allowBoolean`, `allowNullish`)

### Default exports (error)

`import-x/no-default-export` flags `export default` outside framework-required positions (Astro pages/components, Next.js App Router specials, Cloudflare Workers entry, build/test config files). Named exports give better grep + IDE rename + auto-import.

### Test-file overrides (off)

Structural rules, `no-explicit-any`, and the type-aware rule set are off in `*.test.ts` / `*.spec.ts` / `**/test/**` / `**/__tests__/**` / `**/__fixtures__/**`. Long describe blocks, broad any usage, and unused fixture vars are normal in tests.

## Not adopted

- `typescript-eslint/stylistic-type-checked` — bikeshedding code style costs more than it earns at this portfolio size.
- `@typescript-eslint/require-await` — `async` on a Promise-returning wrapper is intentional documentation in our codebase. Flagging it costs more in churn than it earns in bugs caught.
- `no-implicit-coercion` — `!!x` is widely understood; forcing `Boolean(x)` is bikeshedding, not bug-catching.

## Versioning

Semver. Bumps follow the standard contract:

- **Patch** — bug fix in rule config, dependency update.
- **Minor** — new rule added at `error` level (consumers must clean up).
- **Major** — threshold tightened, rule semantics changed in a way that requires consumer code changes.

Every minor or major bump should be paired with a portfolio-wide cleanup PR set, not left to ventures to discover via `npm outdated`.
