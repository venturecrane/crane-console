# Coding Standards

**Version:** 0.1
**Last Updated:** 2026-05-06
**Scope:** Enterprise (all 6 ventures)
**Audience:** AI agents writing or modifying TypeScript across the portfolio

---

## TL;DR

The 12 highest-leverage directives, by enforcement tier:

**Mechanically enforced** (`@venturecrane/eslint-config`):

1. **File ≤ 500 lines, function ≤ 75, complexity ≤ 15, depth ≤ 4, params ≤ 5.** Agent-context arithmetic, not Martin's aesthetic.
2. **No `any` in production source.** Use `unknown` and narrow.
3. **Throw `Error` instances, not literals.** `throw new SomeError()`, never `throw 'string'`.
4. **`===` always.** `==` allowed only against `null` to match both null and undefined.
5. **Preserve `cause` on caught errors.** `throw new Error('msg', { cause: err })`.
6. **No floating Promises** (type-aware rule). Every Promise gets `await`, `return`, `ctx.waitUntil()`, or explicit `void` with a comment.
7. **`assertNever` on switch defaults over discriminants.** Compiler flags missing union members.
8. **Named exports only.** Default exports allowed only in framework-required positions (`page.tsx`, `route.ts`, `*.astro`, Worker entry).

**Review-enforced** (no mechanical rule yet):

9. **Parse, don't cast.** Use Zod (or Valibot) at every trust boundary; never `JSON.parse(x) as T`.
10. **No request-scoped state in module scope** (Workers). Module-level `let`/`const` for immutable init-time values only.
11. **No barrel files** in application code. Direct imports.
12. **Catch at boundaries; throw typed Error subclasses internally.** No bare `catch {}` blocks.

Read the full sections below before non-trivial implementation work.

---

## What this is

The portable coding directives that apply to every venture. The mechanical rules are enforced by `@venturecrane/eslint-config` and `tsconfig.json`. The structural and architectural rules are enforced by code review and the `/code-review` cadence. This document is the source of both.

This is not Clean Code. Robert Martin's function-size and comment-avoidance rules are explicitly rejected (see "Not adopted" below). The driver here is **agent context arithmetic** plus **real bugs we have shipped**, not 2008 OOP orthodoxy.

Fetch on demand: `crane_doc('global', 'coding-standards.md')`. Read before any non-trivial implementation work in any venture repo.

## How to read this

Every directive has the same shape:

- **Rule** — imperative one-liner
- **Why** — the bug it prevents or the cost it removes
- **How to apply** — when it fires, what the boundary cases are
- **Enforcement** — `lint` (mechanical), `tsconfig` (compile-time), `review` (PR gate), or a combination

If a rule conflicts with the existing project CLAUDE.md `Doing tasks` directives, CLAUDE.md wins. This document complements those rules; it doesn't replace them.

---

## 1. Mechanically enforced

These are the rules `@venturecrane/eslint-config` and `tsconfig` enforce on every push. You will see the failure in CI; fix it before merging.

### 1.1 File and function ceilings

**Rule:** Source files cap at 500 lines. Functions cap at 75 lines. Cyclomatic complexity caps at 15. Nested-block depth caps at 4. Function parameters cap at 5.

**Why:** A 1,200-line file consumes 1,200+ tokens of context before you write a single line. A 100-line function buries control flow past the working window. The 500/75/15 thresholds were chosen so the file plus surrounding context plus generation buffer fits in a comfortable agent working window — not because Robert Martin said so. This is arithmetic, not aesthetics.

**How to apply:** When approaching the cap, split at a cohesion boundary, not mid-function. Extract a logically distinct concern; do not slice off the last 20 lines just to pass the lint. Test files have these rules off — long describe blocks are fine.

**Enforcement:** `lint` (max-lines, max-lines-per-function, complexity, max-depth, max-params).

### 1.2 No `any` in production source

**Rule:** `@typescript-eslint/no-explicit-any` is `error`. Use `unknown` and narrow with a type guard.

**Why:** `any` disables type checking for every downstream use. Once you write `as any` somewhere, every property access on that value is unchecked, and the unsafety propagates silently. `unknown` forces a guard at the narrowing site, which keeps the unsafety contained. The portfolio audit found 79 `any` occurrences in dfg-console alone — every one a type-system lie that compiles fine.

**How to apply:** Genuine third-party `any` types you're consuming: annotate at the boundary callsite and narrow there. Inside business logic: never. Test files: relaxed.

**Enforcement:** `lint`. Test files exempt.

### 1.3 No throwing literals

**Rule:** `throw new SomeError(...)` only. Never `throw 'string'` or `throw { message: '...' }`.

**Why:** Strings and plain objects lose stack traces, fail `instanceof Error` checks, and corrupt error logs. Every catch handler in the portfolio assumes `Error` shape; throwing a literal silently breaks that assumption.

**Enforcement:** `lint` (`no-throw-literal`).

### 1.4 Strict equality

**Rule:** `===` and `!==` always, with one exception: `== null` is allowed when you genuinely want to match both `null` and `undefined`.

**Why:** `==` does coercion. `0 == ''` is true. `[] == false` is true. Real bugs.

**Enforcement:** `lint` (`eqeqeq`, `null` exception configured).

### 1.5 Preserve `cause` on caught errors

**Rule:** When rethrowing in a catch block, attach the original error as `cause`: `throw new Error('higher-level message', { cause: err })`.

**Why:** Without `cause`, the original stack trace is gone. Debugging a wrapped error becomes archaeology. ESLint 10 surfaces this as `preserve-caught-error`.

**Enforcement:** `lint`.

### 1.6 No unused vars (or imports)

**Rule:** `@typescript-eslint/no-unused-vars` is `error`. Prefix-with-underscore exemption preserved (`_unused: never used by intent`).

**Why:** Unused vars and imports drift the codebase. Once they accumulate, agents read them as load-bearing and don't dare delete them. Fix at write time.

**Enforcement:** `lint`. `_`-prefix and rest-sibling exemptions.

---

## 2. Type-aware lint and TypeScript configuration

`@venturecrane/eslint-config` v0.1.0 enables type-aware lint via `projectService: true`. Each linted file must be in some tsconfig's `include`. The package is wired in this monorepo and ships with a tsconfig.build.json split for packages that emit dist/ (so test files lint without polluting published artifacts).

### 2.1 Type-aware rules at `error`

These catch real runtime bugs and have mechanical fixes available without requiring portfolio-wide Zod adoption:

- `@typescript-eslint/no-floating-promises` — dropped async results
- `@typescript-eslint/no-misused-promises` — async function passed where void return expected
- `@typescript-eslint/await-thenable` — `await` on a non-Promise value
- `@typescript-eslint/switch-exhaustiveness-check` — missing union member in switch (with `considerDefaultExhaustiveForUnions: true`)

### 2.2 Type-aware rules at `warn` (Zod-availability sequencing)

The correct fix for these is Zod schema validation at trust boundaries (directive 3.1). Until the Zod boundary rollout ships portfolio-wide, promoting these to `error` would force `as unknown as T` casts — a lie to the linter that satisfies the rule without addressing the underlying type unsafety. The Zod boundary rollout PR's exit criteria flips them to `error`.

- `@typescript-eslint/no-unsafe-assignment`
- `@typescript-eslint/no-unsafe-member-access`
- `@typescript-eslint/no-unsafe-call`
- `@typescript-eslint/no-unsafe-return`
- `@typescript-eslint/no-unsafe-argument`
- `@typescript-eslint/restrict-template-expressions` (with `allowNumber/Boolean/Nullish: true`)

This is sequencing severity to fix availability, not deferral.

### 2.3 Tracked-but-not-yet-shipped tsconfig flags

`noUncheckedIndexedAccess: true` and `exactOptionalPropertyTypes: true` are real bug-catchers:

- **`noUncheckedIndexedAccess`** — makes `rows[0]` return `T | undefined`. Catches the most common production crash pattern ("Cannot read property 'id' of undefined" after a query returns no rows).
- **`exactOptionalPropertyTypes`** — distinguishes `{ field?: string }` (absent) from `{ field: string | undefined }` (present-as-undefined). Critical for PATCH endpoints where "missing field = don't touch" and "field: undefined = clear it" are different.

Empirical probe at v0.1.0 ship time: enabling `exactOptionalPropertyTypes` surfaced 65+ violations across just 3 of 8 workspaces in this repo. Enabling `noUncheckedIndexedAccess` surfaced 185+ across 2 workspaces. Cleanup volume is comparable to the structural fleet refactors. **Each flag is its own tracked initiative**, with concrete scope and exit criteria — not deferred-vibes. They land in subsequent versions of the package as their cleanup completes.

**Enforcement:** `tsconfig` (when shipped).

---

## 3. Boundary validation (the most important rule in this document)

### 3.1 Parse, don't cast

**Rule:** At every trust boundary, use a schema library to parse the input. Never `as SomeType` or `JSON.parse() as SomeType`.

**Trust boundaries are:**

- HTTP request bodies
- Webhook payloads
- D1 / KV query results that contain JSON columns
- External API responses
- Cursor tokens, query string params
- Environment variable values that aren't strings (e.g., JSON in an env var)

**Why:** TypeScript's type system is compile-time only. External data that doesn't match its declared type doesn't fail loudly — it propagates wrong values into business logic until something else crashes downstream, far from the source. The portfolio audit found ZERO repos using a schema validator. Every one of them has `JSON.parse(x) as T` or `cursorData = JSON.parse(atob(cursor))` patterns. Every one is a latent crash.

**How to apply:** Use Zod or Valibot. Define the schema once per boundary. Call `.parse()` for trusted-source-failure (let the parse error propagate) or `.safeParse()` when you want to handle the failure explicitly. Internal function calls between your own typed modules don't need parse overhead — only at boundaries.

**Pattern:**

```ts
// BAD — JSON.parse + cast is a type-system lie
const body = JSON.parse(await req.text()) as ExpenseInput
return createExpense(body) // body.familyId might be undefined; crashes deep in createExpense

// GOOD — parse at the boundary, propagate validated type
import { z } from 'zod'
const ExpenseInputSchema = z.object({
  familyId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  category: z.enum(['groceries', 'medical', 'school']),
})
type ExpenseInput = z.infer<typeof ExpenseInputSchema>

const body = ExpenseInputSchema.parse(await req.json()) // throws ZodError on bad input
return createExpense(body) // body is fully validated
```

**Enforcement:** `review`. There is no mechanical lint rule that bans `as SomeType` cleanly; the no-unsafe-\* family catches the propagation but not the cast itself. Code review must catch this until the type-aware rules ship.

### 3.2 `unknown` for untyped inputs

**Rule:** Declare untyped data as `unknown`, narrow with a type guard or `schema.parse()`.

**Why:** Same as 3.1 — `unknown` is the type-system handshake that says "I have to prove what this is before I use it." `any` skips the proof.

**How to apply:** API handlers receive `unknown` from `await req.json()`. Narrow with Zod immediately. Don't `as Type` your way past the unknown.

**Enforcement:** `lint` (`no-explicit-any`) + `review`.

### 3.3 Workers `Env` from `wrangler types`

**Rule:** Cloudflare Workers `Env` interface is generated by `wrangler types` and committed. Hand-written `Env` is prohibited.

**Why:** Hand-written `Env` drifts from `wrangler.jsonc` immediately. A binding that exists in code but not in Wrangler config compiles fine and throws at runtime. The generated file is the only source of truth that catches the mismatch at compile time.

**How to apply:** Add `wrangler types` to the prebuild step. CI runs `wrangler types` and diffs against the committed file — a deterministic check that catches drift.

**Enforcement:** `review` + CI parity check (per-repo, not yet portfolio-wide).

### 3.4 `nodejs_compat` test parity

**Rule:** Vitest / miniflare test config must NOT inject `nodejs_compat` unless production `wrangler.jsonc` enables it. Test compat flags must match production.

**Why:** Vitest's Workers pool can auto-inject `nodejs_compat`. Code that imports `node:crypto`, `node:buffer`, etc. passes all tests and silently throws `Module not found` in production. This is the single most common "passes CI, breaks prod" failure pattern in our stack.

**How to apply:** `pool: 'workers'` with `miniflare: { compatibilityFlags: [] }` (or explicit match to wrangler.jsonc).

**Enforcement:** `review` + per-repo CI parity check.

---

## 4. Async / Promise hygiene

### 4.1 No floating Promises

**Rule:** Every Promise-returning expression must be `await`ed, `return`ed, or passed to `ctx.waitUntil()` (Workers) / `after()` (Next.js 15+). The escape hatch is `void promise // reason: ...` for genuinely fire-and-forget paths — and it must have a comment explaining why.

**Why:** Floating Promises silently swallow errors. In Workers, the runtime can terminate the isolate before an unawaited Promise resolves — your async write never lands. In Next.js Server Actions, a floating write becomes a race condition visible only under concurrent load.

**How to apply:** If you need fire-and-forget telemetry: `ctx.waitUntil(emitTelemetry(...))`. If you don't need it to complete: `void emitTelemetry(...) // best-effort: telemetry never blocks request flow`. The comment is mandatory.

**Pattern:**

```ts
// BAD — Promise dropped on the floor; errors swallowed, write may not complete
async function handler(req: Request, env: Env) {
  emitTelemetry({ event: 'request', url: req.url }) // returns Promise<void>; ignored
  return new Response('ok')
}

// GOOD (Workers) — explicit fire-and-forget via ctx.waitUntil
async function handler(req: Request, env: Env, ctx: ExecutionContext) {
  ctx.waitUntil(emitTelemetry({ event: 'request', url: req.url }))
  return new Response('ok')
}

// GOOD (intentional best-effort, no waitUntil available) — `void` plus comment
function startBackgroundWorker() {
  void scheduleNextRun() // best-effort: scheduler retries on next tick if this fails
}
```

**Enforcement:** `lint` (`@typescript-eslint/no-floating-promises` at error in v0.1.0).

### 4.2 No request-scoped state in module scope (Workers)

**Rule:** In Cloudflare Workers code, module-level `let` and `const` may only hold immutable, initialization-time values: parsed config, compiled regexes, reusable client instances. Never store per-request data.

**Why:** Workers reuse isolates across requests. A module-level variable set in request A is visible in request B. This produces cross-request data leaks and "Cannot perform I/O on behalf of a different request" errors that don't appear in local dev and are catastrophic in production.

**How to apply:** All per-request state flows through function parameters. `env` bindings are safe (per-deployment, not per-request). `ctx.waitUntil()` callbacks must close over values, not read them from module scope.

**Pattern:**

```ts
// BAD — currentUserId is module-scoped; request A's user leaks into request B
let currentUserId: string | null = null

export default {
  async fetch(req: Request, env: Env) {
    currentUserId = await authenticate(req) // mutates shared module state
    return handle(req, env)
  },
}

// GOOD — user flows through function parameters; isolate reuse is safe
export default {
  async fetch(req: Request, env: Env) {
    const userId = await authenticate(req)
    return handle(req, env, userId)
  },
}

// ALSO GOOD — module-scope is fine for immutable init-time values
const VENTURE_CODES = new Set(['vc', 'sc', 'ke', 'dfg', 'dc', 'ss']) // frozen at module load
const SAFE_BRANCH_REGEX = /^[a-z][a-z0-9-/]*$/ // compiled once, reused per request
```

**Enforcement:** `review`. No lint rule catches this in isolation.

### 4.3 `async` is a documentation signal — don't strip it for the sake of lint

**Rule:** `async` on a function whose body returns a Promise without `await` is allowed and often correct. Don't change `async () => fetch(url)` to `() => fetch(url)` to silence a lint rule.

**Why:** `async` declares intent at the function signature. Strip it and the function looks synchronous at the call site even though it returns a Promise. This is why we deliberately do NOT enable `require-await` in the shared lint config.

**Enforcement:** Not enforced; this is an explicit non-rule.

---

## 5. Type system

### 5.1 Exhaustive discriminated unions

**Rule:** Every `switch` (and every `if/else-if` chain) over a union discriminant must have a default branch that calls `assertNever(x)` (a function typed `(x: never) => never` that throws). Never bare `default: break` on a typed discriminant.

**Why:** When a future agent adds a new `EventType` member, the compiler should fail at every switch that doesn't handle it — not silently fall through. This is the single highest-leverage pattern for multi-session agent code: it converts a silent runtime regression into a compile-time build failure.

**How to apply:** Add `assertNever` to a shared utility module per repo. Apply to every switch over a closed-set type (event types, statuses, route discriminants). Does NOT apply to `string | undefined` or open-ended string unions.

**Pattern:**

```ts
// Shared utility (one per repo)
export function assertNever(x: never): never {
  throw new Error(`Unhandled discriminant: ${JSON.stringify(x)}`)
}

type EventType = 'created' | 'updated' | 'deleted'

// BAD — silent fallthrough when 'restored' is added to EventType
function describe(e: EventType): string {
  switch (e) {
    case 'created':
      return 'New'
    case 'updated':
      return 'Modified'
    case 'deleted':
      return 'Removed'
  }
  return '' // 'restored' silently returns ''
}

// GOOD — adding a new EventType member fails the build at this switch
function describe(e: EventType): string {
  switch (e) {
    case 'created':
      return 'New'
    case 'updated':
      return 'Modified'
    case 'deleted':
      return 'Removed'
    default:
      return assertNever(e) // compiler error if any case is missing
  }
}
```

**Enforcement:** `lint` (`@typescript-eslint/switch-exhaustiveness-check` at error in v0.1.0).

### 5.2 No type assertions in business logic

**Rule:** `as SomeType` is prohibited inside business logic. Sanctioned uses: test fixtures, genuine third-party-interop where the library's types are wrong (annotate the callsite with a comment), and at-the-boundary validation handoffs (`const validated = schema.parse(input) as ValidatedType` where the assertion is documentation).

**Why:** `as` is a lie to the compiler. Agents reach for it when they don't know the type — and the resulting silent runtime failures are the worst class of bug to debug.

**Enforcement:** `review`.

### 5.3 Type function boundaries; let inference work inside

**Rule:** Exported functions have explicit parameter types AND explicit return types. Internal `const` declarations and intermediate values use inference.

**Why:** Boundary annotations make the function's contract clear to a cold-reading agent without forcing them to trace inference. Over-annotating internals adds noise without signal — TypeScript's inference is excellent in 2026 and it's faster to read `const x = computeX()` than `const x: ComputedX = computeX()`.

**Enforcement:** `lint` (`@typescript-eslint/explicit-module-boundary-types`) — pending future package version (currently `review`-enforced).

### 5.4 `unknown` over `any`, named exports over default

**Rule:** Use named exports. Default exports are prohibited except in framework-required positions (`page.tsx`, `layout.tsx`, `route.ts`, `*.astro` pages, Cloudflare Worker `export default { fetch }`).

**Why:** Default exports break global search — `grep -r 'AuthService'` finds nothing if the export is unnamed at point of use. They produce inconsistent naming when imported across files. Agents auto-complete named imports; default exports require knowing the file path.

**How to apply:** `import/no-default-export` ESLint rule with per-file overrides for framework entry points.

**Enforcement:** `lint` (`import-x/no-default-export` at error in v0.1.0, with framework-position overrides built in).

### 5.5 `const` object maps over TS `enum`

**Rule:** Use `const` objects with `as const` for enumerated values. Do NOT use the TypeScript `enum` keyword (numeric or string).

**Why:** TypeScript `enum` produces non-erasable runtime JavaScript. Numeric enums have unsafe reverse-mapping (`EventType[0]` is a valid string lookup). `const enum` cannot be used across module boundaries with `isolatedModules`. `const` object maps are plain JavaScript, fully transparent, and work identically across Next.js, Astro, and Workers.

**Pattern:**

```ts
export const EVENT_TYPES = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]
```

**Enforcement:** `review`. (`@typescript-eslint/no-enum` adoption pending future package version.)

---

## 6. Error handling

### 6.1 Catch at boundaries; throw typed errors internally

**Rule:** `try/catch` is permitted at system boundaries: HTTP request handlers, queue consumers, cron triggers, external API call wrappers. Inside business logic, functions either return a typed value or throw a typed `Error` subclass. Never return `null | undefined | -1` to signal failure.

**Why:** Mixed error styles are worse than either pure strategy. Result types (`neverthrow`) provide compile-time enforced error handling but require consistent adoption — a single `throw` in a chain of `.andThen()` breaks the contract silently. The pragmatic 2026 position: typed `Error` subclasses (`class NotFoundError extends Error { readonly code = 'NOT_FOUND' }`) plus exhaustive boundary catches. Adopt `neverthrow` only if the entire module is greenfield AND the Captain explicitly authorizes it.

**Pattern:**

```ts
// boundary
app.post('/expenses', async (c) => {
  try {
    const result = await createExpense(input)
    return c.json({ data: result })
  } catch (err) {
    if (err instanceof ValidationError) return c.json({ error: err.message }, 400)
    if (err instanceof NotFoundError) return c.json({ error: err.message }, 404)
    throw err // unhandled — let the global handler log and 500
  }
})

// internal
async function createExpense(input: ExpenseInput): Promise<Expense> {
  const family = await getFamily(input.familyId)
  if (!family) throw new NotFoundError(`family ${input.familyId} not found`)
  // ...
}
```

**Enforcement:** `review`. The portfolio audit found only dc-console with this pattern; everyone else uses `console.error` + generic 500.

### 6.2 No bare catch blocks

**Rule:** `catch { }` and `catch { /* ignore */ }` are prohibited. Either propagate the error, log structured context, or document explicitly with a `// best-effort:` comment that explains why this failure is non-fatal.

**Why:** The portfolio audit found bare catches in sc-console (`index.ts:385`, `index.ts:660`) and ss-console (`enrichment/index.ts:545`, `:626`). Two were intentional best-effort; the others were genuine bugs hiding in plain sight. The cost of the comment is one line; the cost of a swallowed bug is whenever you next need to debug that code path.

**Pattern:**

```ts
// best-effort: telemetry write must never block the request; we accept silent loss
try {
  await emitTelemetry(event)
} catch {
  /* best-effort: see comment above */
}
```

**Enforcement:** `review`. (`no-empty` lint rule does not catch all variants.)

---

## 7. Module structure

### 7.1 No barrel files in application code

**Rule:** `index.ts` files that re-export from sibling modules (barrel files) are prohibited inside application source directories. Direct imports only. Package boundaries — the public surface of an `@venturecrane/*` workspace package — are the only sanctioned exception.

**Why:** Barrel files create circular dependency traps that agents fall into by default — you import from `index.ts`, `index.ts` imports the file you're editing. They cause bundlers to load every module in the barrel when only one is needed, producing 3-5x build-time regressions. They defeat `import/no-cycle` because the cycle runs through the barrel, not directly between leaf files.

**How to apply:** `import { validateToken } from '../auth/validate-token'` not `import { validateToken } from '../auth'`.

**Enforcement:** `review`. (`eslint-plugin-barrel-files` available; not yet adopted portfolio-wide.)

### 7.2 Route handlers delegate to service modules

**Rule:** HTTP route handlers may not contain D1 queries or domain logic. Extract to service modules (`src/services/<domain>.ts`).

**Why:** The portfolio audit found 600-1800-LOC route handler files in ke-console, sc-console, dfg-console — each one a tangled mix of HTTP plumbing, auth, business logic, and data access. Only dc-console has clean routes-services-types separation, and dc-console got the highest grade in the portfolio (B). The pattern from `docs/standards/api-structure-template.md` is the supported shape: routes are ~50-LOC entry points that call services that return typed values.

**Enforcement:** `review` + `lint` (file-size and function-size caps make monolithic route files impossible).

### 7.3 Naming is the navigation signal

**Rule:** File paths and exported symbol names should describe what the code does. Vague names (`utils.ts`, `helpers.ts`, `manager.ts`, `handler`) are prohibited at file level. Internal variable names can be brief; exported names cannot.

**Why:** Agents navigate by signal, not by reading every line. `src/lib/auth/validate-jwt.ts` gets read when an agent is debugging auth; `src/utils/helpers.ts` gets read when an agent is grasping at straws. The Anthropic context-engineering work calls this "lightweight identifiers" — and for a multi-session agent codebase it's the difference between a 30-second context-load and a 5-minute one.

**Enforcement:** `review`. No mechanical rule can catch generic naming.

---

## 8. Observability

### 8.1 Structured logging in deployed code

**Rule:** `console.log(JSON.stringify({ level, message, ...context }))` not `console.log('[TAG] string ' + value)`.

**Why:** Cloudflare Workers logs are filterable when they're JSON. Tagged-string output (`[CLAUDE]`, `[IMAGE]`, `[VISION]` per dfg-analyst's pattern) is unfilterable past the surface tag and impossible to query at scale.

**How to apply:** A repo-local `logger.ts` that wraps `console.log` with a level + context shape. Reuse across all worker code. Debug-level logs gate behind an env flag so prod output stays signal-rich.

**Enforcement:** `review`.

### 8.2 No new `console.log` without level + tag

**Rule:** When adding logging to deployed code, the log line includes a `level` field and a stable `tag`. New calls to bare `console.log('something happened')` are reviewer-rejected.

**Why:** The portfolio currently has 86 `console.log`s in dfg-console alone. They're impossible to disable in production and impossible to filter. New entries should not extend the problem.

---

## 9. Tests

### 9.1 Vitest as the portfolio test runner

**Rule:** Every venture uses Vitest. Where Workers code is involved, use the `@venturecrane/crane-test-harness` in-process invoker — not a live `wrangler dev` on `localhost:8787`.

**Why:** The harness is faster (no separate process), more reliable (no port conflicts), and tests the worker code directly with miniflare. Live wrangler tests are flaky and slow. The lint rule banning `localhost:8787` in `workers/*/test/harness/**` exists because we hit this trap repeatedly.

**Enforcement:** `lint` (custom `no-restricted-syntax` rule in crane-console; portable rule pending).

### 9.2 Test density target: ratio over count

**Rule:** Every `src/**/*.ts` module that contains a non-trivial function (validation, parsing, business logic, error handling) should have a corresponding `*.test.ts` file. Pure-glue modules (route registration, type-only files) are exempt.

**Why:** Test density varies 10x across the portfolio (dc-console: 47 test files / 730+ tests; dfg-console: 10 files for 120 source files). The pattern in dc-console is the target, not the count. The directive is "every module that does work has a test," not "every venture has 50 tests."

**Enforcement:** `review` via `/code-review`. No mechanical rule.

---

## 10. CLAUDE.md per-venture content

Every venture's CLAUDE.md must contain at minimum:

1. **About the venture** — what the product is, what users care about
2. **Tech stack** — explicit list (framework + runtime + DB)
3. **Build commands** — npm scripts that matter
4. **Domain non-negotiables** — money math (if financial), no-fabrication (if content-generating), validation rules (if regulated)
5. **Code patterns** — specific to the venture's domain (e.g., dfg's image-fetch retry, ke's expense splitting)
6. **Stack-specific gotchas** — Next.js `middleware.ts` naming, Astro client/server split, Workers `ctx.waitUntil`, etc.
7. **Pointer to this document** — `crane_doc('global', 'coding-standards.md')` for cross-cutting standards

The current state ranges from ss-console (369 lines, gold standard) to sc-console (96 lines, thin). The 4x gap in agent context is a real cost in cold-start session quality.

---

## Not adopted (with reasons)

### Martin's "functions should be 5-20 lines"

A 60-line function with a clear flow — guard clauses, main work, return — is easier to understand than six 10-line functions spread across a file. Agents reading a fragmented version load six function bodies into context to understand one operation. The empirical critiques (qntm.org, Gerlach) document how literal application produces verbose function names, hidden side effects, and CQS violations. Our 75-line cap is generous and intentional.

### JSDoc on every public function

Type signatures already document parameters and returns. JSDoc maintenance burden is real — agents write it at creation time and never update it. Stale JSDoc is worse than no JSDoc. Keep the existing project CLAUDE.md "only WHY when non-obvious" rule.

### Decorator-based DI (tsyringe, InversifyJS)

These rely on `emitDecoratorMetadata` and `experimentalDecorators` — the legacy decorator spec, marked obsolete in TypeScript 5.0. They cannot run on workerd (no Reflect polyfill, no class field guarantees). The "DI for testability" argument is better served by passing dependencies as function parameters and using `vi.fn()` at the test boundary.

### `interface` for everything

Google's style guide recommends interfaces over type aliases. At Google's scale, the open-extension semantics matter. At 6-10 ventures the distinction is cognitive overhead without payoff. Use `type` for unions and computed types, `interface` for shapes you expect to be extended. Don't mandate one over the other for plain data.

### Strict no-comments

Martin's book reads as "fewer comments are always better." For a stack with surprising runtime semantics — `ctx.waitUntil()`, isolate reuse, `this`-binding on destructured methods, `nodejs_compat` test injection — a single comment at the site of a non-obvious workaround is worth more than no comment. The existing CLAUDE.md "WHY when non-obvious" rule is correct. Platform-specific workarounds and deliberate rule violations require a comment.

---

## Why these rules differ from Clean Code

Three differences are worth knowing:

1. **The unit is the file, not the function.** Clean Code optimizes for human cognitive load on a single screen. Modern TypeScript with imports, types, and JSX adds visual mass that screen-based heuristics didn't anticipate. Plus, agents read by file. The 500-line cap is calibrated to fit-in-context-window, not fit-on-screen.

2. **Context is read, not remembered.** Clean Code assumes a developer who's been on the team for months and knows the conventions. Agents start cold every session. Implicit conventions are invisible to them. Hence: explicit naming, explicit boundary parsing, explicit error types, explicit assertNever defaults.

3. **The cost of abstraction is asymmetric for agents.** Human teams over-abstract proactively (introduces complexity, harder to refactor later). Agent teams under-abstract by default (existing CLAUDE.md "three lines is better than premature abstraction") — but then miss the point where duplication has become a liability. The signal to abstract is a third near-identical block, not a second.

---

## Per-stack notes

### Cloudflare Workers

- `wrangler types` is the only way to have a correct `Env` interface
- `ctx.waitUntil()` for fire-and-forget; never bare `void`
- Never destructure `ctx` (`const { waitUntil } = ctx` loses `this` binding)
- `Math.random()` works; prefer `crypto.randomUUID()` / `crypto.getRandomValues()` for any security-relevant context
- `nodejs_compat` test/prod parity is the most-stubbed-toe pattern

### Next.js (App Router)

- `middleware.ts` (NOT `proxy.ts` — this naming subtlety silently disabled Clerk in ke-console)
- Server Actions: typed errors propagate to `useActionState`
- `unstable_after()` (Next.js 15+) is the equivalent of `ctx.waitUntil()`
- File-routing requires default exports — that exception is documented in 5.4

### Astro

- `extends: astro/tsconfigs/strict` inherits `strict: true`. Confirm the worker tsconfigs in the same repo also set `strict: true` explicitly
- Mixing server fetch + client scripts + DOM `innerHTML` in `.astro` pages is a known footgun; lean on framework hooks
- `eslint-plugin-astro` should be present in any repo with `.astro` files

---

## Versioning and review

This document moves through PRs like any other instruction module. New rules require Captain approval. The `/code-review` cadence (monthly per venture) should grade each repo against this document and surface violations.

Materially changed standards bump the document version (semver-style on this file's frontmatter). The `@venturecrane/eslint-config` package version tracks the mechanically-enforced subset.

---

## Reading list

- `docs/research/coding-standards-internal-audit-2026-05-06.md` — what the portfolio actually looks like
- `docs/research/coding-standards-external-practices-2026-05-06.md` — sources and citations
- `docs/standards/golden-path.md` — tier-based compliance model
- `docs/standards/nfr-assessment-template.md` — code review criteria
- `packages/eslint-config/README.md` — current rule set in machine-readable form
