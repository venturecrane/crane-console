# External Practice Research — 2026-05-06

## TL;DR

### Highest-leverage directives to consider adding

1. **Validate external inputs with a schema library (Zod/Valibot) at every trust boundary; never cast or assert.** This is the single highest-value rule for agent-authored backends — TypeScript's type system only covers compile time, and agents routinely cast `as SomeType` where they should parse.

2. **Enable `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` in tsconfig beyond the base `strict` flag.** These two flags catch the "undefined is not an object" and "missing vs. explicitly-undefined" bugs that `strict` alone misses, and they are green-light for greenfield projects.

3. **Treat floating Promises as build failures; enforce `@typescript-eslint/no-floating-promises`.** Silently dropped Promises are the most common source of data-loss bugs in Workers, Next.js Server Actions, and async queues. This rule pays for itself on the first production incident it prevents.

4. **Never store request-scoped state in module-level variables in Workers/edge code.** Isolate reuse is silent in dev, catastrophic in prod: cross-request data leaks and "Cannot perform I/O on behalf of a different request" errors only manifest under real traffic.

5. **Enforce exhaustive discriminated union checks with `never` at every switch/conditional.** With AI agents adding new union members in future sessions, a missing `default: assertNever(x)` will silently execute the wrong branch forever.

6. **Use `wrangler types` to generate the `Env` interface; never hand-write it.** Hand-written Env drifts from `wrangler.jsonc` immediately. The generated file is the only source of truth that compiles.

7. **Avoid barrel files (`index.ts` re-export aggregators) in application code.** They create circular dependency traps that agents fall into by default, degrade build times by 3-5x on large projects, and cause `import/no-cycle` to silently miss inter-barrel cycles.

### Rules to explicitly NOT adopt

1. **Martin's "functions should be as small as possible" (5-20 lines).** Produces excessive abstraction, forces constant context-jumping, and is not supported by empirical evidence. A 60-line function with clear flow is often better than six 10-line functions spread across a file.

2. **JSDoc on every function.** Google's own style guide says `@param` and `@return` are only required "when they add information." For agent-authored code where names carry semantics, most function-level JSDoc is noise that agents write and never update.

3. **Decorator-based dependency injection (tsyringe, reflect-metadata).** Relies on experimental decorators that are obsolete as of TypeScript 5.0 and cannot run on workerd. The pattern is incompatible with the edge runtime stack.

---

## Source Survey

### Clean Code (Robert C. Martin, 2008; 2nd ed. 2025)

**Load-bearing principles** that still hold up:

- Intention-revealing names. This is foundational and more important, not less, when an agent is reading code cold in a future session. Good names are grep-able and self-documenting.
- DRY as a default stance (with the CLAUDE.md caveat already in place: three similar lines first).
- Command-Query Separation: a function either returns a value or has a side effect, not both. This principle prevents subtle state bugs.
- Code smells taxonomy. The list of smells (feature envy, divergent change, data clumps) remains the most practical part of the book.

**Outdated or harmful when taken literally:**

- **Function size limits.** Martin says "the first rule is that functions should be small; the second rule is that they should be smaller than that." No empirical study supports 5-20 lines as a universal threshold. The well-documented critique from qntm.org ("It's probably time to stop recommending Clean Code") and Daniel Gerlach's analysis both show that overzealous fragmentation produces: functions with names longer than their bodies, hidden side effects in private static methods (Martin's own Prime Generator example violates CQS), and navigation overhead that overwhelms any readability gain. For context-window-reading agents, six 10-line functions are harder to reason about than one 60-line function with inline comments.

- **File size limits.** The book implies small files. The 2025 consensus for TypeScript applications is 300-500 lines per file as a pragmatic ceiling, not a hard rule. The more important signal is cohesion: files should contain one conceptual thing, not meet a line count target.

- **Comment avoidance taken too far.** Martin says "the best comment is no comment." His intended meaning was "don't explain what; explain why." But cargo-cult application produces uncommented code where the "why" of a non-obvious algorithm, a platform quirk (e.g., `ctx.waitUntil()` semantics), or a deliberate violation of a rule is invisible. CLAUDE.md's existing "only WHY when non-obvious" stance is correct.

- **Single Responsibility at class level.** SRP is valuable but famously ambiguous — you can justify any design by redefining "responsibility." For TypeScript modules (not classes), SRP translates well: a module file should export one conceptual thing. Applied to classes in a small-team agent codebase, SRP often produces 40-class hierarchies where 4 would suffice.

- **Dependency Inversion Principle for Workers.** Classic DIP involves abstract interfaces injected via constructor. In a Cloudflare Workers / Next.js codebase with no DI container, DIP translates to: use function parameters and module imports, not singletons or global registries. Decorator-based DI (tsyringe) cannot run on workerd at all.

**Sources:** [qntm.org critique](https://qntm.org/clean), [Daniel Gerlach's analysis](https://gerlacdt.github.io/blog/posts/clean_code/), [NDepend SOLID article](https://blog.ndepend.com/are-solid-principles-cargo-cult/)

---

### Effective TypeScript (Dan Vanderkam, 2nd ed. 2023 — updated for TS 5)

**Top 10 items most relevant to this profile:**

1. **Item 4 — Structural typing traps.** TypeScript's duck-typing means an unrelated type can satisfy an interface. At API boundaries, this silently accepts objects with extra fields. Use branded types or `z.parse()` to enforce correctness.

2. **Item 12 — Type entire function expressions, not just parameters.** Typing the whole function signature `const handler: RequestHandler = (req) => ...` catches return-type mismatches that per-parameter typing misses.

3. **Item 29 — Types that always represent valid states.** A type that can represent an invalid combination of fields (e.g., `{ loading: true; data: SomeType }`) forces runtime guards everywhere. Design types that make invalid states unrepresentable.

4. **Item 33 — Push null to the perimeter.** Null/undefined should only appear at system entry points (DB results, external API responses). Once inside your business logic, values should be non-nullable. This pairs naturally with Zod boundary parsing.

5. **Item 59 — Exhaustiveness with `never`.** Use `assertNever(x: never): never` in switch default cases. When a new union member is added, the TypeScript compiler flags every switch that doesn't handle it. This is the highest-leverage pattern for agent-authored code — future sessions that add a new `EventType` member get a compile error at every switch, not a silent wrong-branch execution.

6. **Item 64 — Branded types for nominal typing.** `type UserId = string & { __brand: 'UserId' }` prevents accidentally passing a raw string where a validated ID is expected. High value for domain entities (IDs, money amounts, validated emails) that flow through many functions.

7. **Item 67 — Export all types appearing in public API signatures.** If a function is exported, its parameter and return types must also be exported. Otherwise consumers can't reference them by name and must use `ReturnType<typeof fn>` hacks.

8. **Item 72 — Prefer ECMAScript features to TypeScript features.** Avoid `enum`, `namespace`, `decorators` (experimental flavor), and `const enum`. These are non-erasable and create runtime artifacts. Prefer `const` object maps over enums.

9. **Structural safety at parse time (from blog posts).** Use `z.parse()` or `z.safeParse()` immediately when receiving external data — webhook payloads, D1 query results, KV values, third-party API responses. The types you get from Drizzle/D1 ORM are only as accurate as the schema definition.

10. **Avoid `as` type assertions inside business logic.** `as SomeType` is a lie to the compiler. Agents write `as` assertions when they don't know the type; this produces silent runtime failures. The only sanctioned uses are test fixtures and genuine interop with untyped third-party code (narrow those callsites with a comment).

**Sources:** [effectivetypescript.com](https://effectivetypescript.com/), [Effective TypeScript 2nd edition summary](https://github.com/trungvose/effective-typescript-summary)

---

### Google TypeScript Style Guide

**Pragmatic for our scale:**

- **Named exports only; never default exports.** This prevents the "what did I import?" problem when agents read code cold. Default exports also break `re-export from 'module'` patterns and make global search less reliable. This aligns with most modern TS shops.
- **`unknown` over `any` for untyped values.** `unknown` forces a type guard before use. Google explicitly requires this.
- **`const` over `let` by default.** Mechanical but effective.
- **Prefer interfaces over type aliases for object shapes.** Interfaces are open (can be augmented) and produce better error messages. Type aliases are better for union types and computed types.
- **No `#private` fields; use TypeScript's `private` modifier.** Private fields are a runtime feature with non-trivial overhead in hot paths.
- **No `const enum`.** Cannot be used across module boundaries, causes issues with Babel/esbuild.

**Overkill for our scale:**

- Google's JSDoc requirements (every public API must have JSDoc with `@param`). At 6-10 ventures with 1-5 exports per module, this produces noise. Keep the "WHY only" stance.
- Google prohibits `for...in` loops in all cases. Reasonable but not a bug-catcher at our scale.

**Sources:** [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)

---

### AI-Pair-Programming / Agent-Readable Code Literature

This is the most directly relevant dimension for the portfolio.

**What makes code agent-readable vs human-readable:**

The key insight from Anthropic's own context engineering work and JetBrains' 2025 research is that **agents navigate by signal, not by reading every line.** Anthropic describes agents maintaining "lightweight identifiers (file paths, stored queries, web links) and using these references to dynamically load data into context at runtime." This means:

- **File names and directory structure are navigation signals.** `src/lib/auth/validate-jwt.ts` is more agent-navigable than `src/utils/helpers.ts`. Agents pick files to read based on path — a file named for what it does will get the right agent attention.

- **Top-level exports are the first thing an agent scans.** Function names, type names, and exported constants should be precise and complete. Internal variable names can be shorter. The Google guide says names should not carry type information, but for agents, `userId: string` is better than `id: string` because it reduces the cold-read disambiguation needed.

- **File size directly affects context budget.** A 1,200-line file consumes ~1,200 tokens of context window before the agent has written a single line of code. The practical ceiling for agent-friendly files is 300-500 lines. This is not Clean Code orthodoxy — it is arithmetic.

- **Explicit over implicit conventions.** Implicit project conventions (e.g., "D1 queries always go in `src/db/`") are invisible to a cold-start agent. Explicit conventions (enforced by directory structure, enforced by lint rules, documented in CLAUDE.md) survive session turnover.

- **Flat is better than nested for discovery.** A deeply nested utility call chain requires tracing five files to understand one behavior. A flatter call graph is more context-efficient.

- **Barrel files are an agent trap.** Agents auto-import from the nearest `index.ts`. This creates circular dependency cycles that are invisible until build time and are particularly hard to detect in multi-session workflows where different agents touch different parts of the barrel.

- **The "compression-for-LLM" fringe argument is wrong for our use case.** The `AI-Coding-Style-Guides` repository argues for shorter variable names and consolidated files to fit more into a context window. This logic applies to code-generation tasks (write once), not to a maintained, multi-session codebase. Agent-agents need to read and modify code written by prior agents; compressed code reduces the chance a future agent misunderstands intent.

**Sources:** [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [JetBrains AI coding guidelines](https://blog.jetbrains.com/idea/2025/05/coding-guidelines-for-your-ai-agents/), [AI Coding Style Guides repo](https://github.com/lidangzzz/AI-Coding-Style-Guides), [Propel Code codebase structure guide](https://www.propelcode.ai/blog/structuring-codebases-for-ai-tools-2025-guide)

---

### TypeScript-ESLint Strict-Type-Checked

**Rules that pay for themselves (catch real runtime bugs, not style):**

| Rule                         | Config tier              | What it catches                                                                                                          |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `no-floating-promises`       | recommended-type-checked | Dropped async results; especially lethal in Workers where the runtime can terminate before an unawaited Promise resolves |
| `no-misused-promises`        | recommended-type-checked | Passing async functions as `onClick` handlers or `Array.prototype.filter` callbacks where void is expected               |
| `no-unsafe-assignment`       | recommended-type-checked | Spreading `any` through the type system — catches the most common agent mistake (asserting instead of parsing)           |
| `no-unsafe-member-access`    | recommended-type-checked | Accessing properties on `any` values — stops type unsafety from propagating                                              |
| `no-unsafe-return`           | recommended-type-checked | Returning `any` from a typed function — keeps boundary enforcement from leaking                                          |
| `strict-boolean-expressions` | strict                   | Catches `if (value)` where `value` could be `0` or `""` — common source of silent "valid falsy" bugs                     |
| `no-unnecessary-condition`   | strict                   | Catches checks that are always true/false given the type — reveals dead code agents leave behind                         |

**Rules with high friction / questionable payoff:**

- `restrict-template-expressions`: fires on `\`Value: ${someNumber}\`` which is almost always intentional.
- `prefer-nullish-coalescing`: style preference, not a bug catcher. The auto-fix is correct but the noise is not worth it on a codebase with a lot of legacy `||` expressions.
- `no-explicit-any`: `any` is sometimes the right tool at a genuine interop boundary. Prefer `@typescript-eslint/no-unsafe-*` rules which catch the danger (propagation), not the spelling.

**The two tsconfig flags `strict` misses:**

- `noUncheckedIndexedAccess`: makes `array[0]` return `T | undefined` instead of `T`. Without this, `rows[0].id` throws at runtime if the query returns no rows. This is a real production bug pattern. Not in `strict` as of 2026 due to migration friction, but should be enabled on all new projects.
- `exactOptionalPropertyTypes`: distinguishes `{ field?: string }` (field absent) from `{ field: string | undefined }` (field present as undefined). Critical for PATCH API handlers where "missing" means "don't touch" and "undefined" means "clear."

**Sources:** [typescript-eslint rules](https://typescript-eslint.io/rules/), [typescript-eslint configs](https://typescript-eslint.io/users/configs/), [TypeScript strict config article](https://whatislove.dev/articles/the-strictest-typescript-config/)

---

### Public Engineering Practices (Vercel, Cloudflare, others)

**Vercel style guide** (`@vercel/style-guide`) is public and reflects production Next.js practices:

- Named exports only.
- Type-checked ESLint rules enabled (they require tsconfig path in the config).
- TypeScript recommended-type-checked as the baseline.
- Composable: separate configs per environment (node, browser, next, react).

**Cloudflare Workers best practices** (official docs, updated Feb 2026) — highest-signal points:

- `ctx.waitUntil()` for background work; never fire-and-forget unattached Promises.
- Never destructure `ctx` — `const { waitUntil } = ctx` causes "Illegal invocation" because it loses `this` binding.
- Run `wrangler types` to generate `Env` interface; re-run on every binding change.
- `nodejs_compat` flag in `wrangler.jsonc` must match what tests inject — a common source of "passes tests, fails prod."
- Use `Math.random()` → `crypto.randomUUID()` / `crypto.getRandomValues()`. Workers have access to Web Crypto API.
- Structured JSON logging (`console.log({ level: 'error', message: '...' })`) not string concatenation.
- `passThroughOnException` is not error handling; it is a migration shim that hides bugs.

**Stripe / Linear / Anthropic** — no single public style guide, but patterns observable from public repos and engineering blogs:

- Strict TypeScript with custom ESLint configs derived from recommended-type-checked.
- Zod at external boundaries is de facto standard across all three organizations.
- Branded types for domain identifiers (Stripe's `id` fields are opaque strings; Linear uses branded UUID types).
- No decorator-based DI anywhere in edge-compatible code.

**Sources:** [Vercel style guide](https://github.com/vercel/style-guide), [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Cloudflare TypeScript docs](https://developers.cloudflare.com/workers/languages/typescript/), [wrangler types multi-env](https://developers.cloudflare.com/changelog/post/2026-01-13-wrangler-types-multi-environment/)

---

## Proposed Directives (Ranked by leverage × portability)

**#1 — Parse external inputs; never cast them.**

_Directive:_ At every trust boundary (incoming HTTP request body, webhook payload, D1/KV query result, external API response), use `schema.parse()` or `schema.safeParse()`. Never use `as SomeType` or `JSON.parse() as SomeType`.

_Why:_ TypeScript's type system is compile-time only. External data that doesn't match its declared type causes silent data corruption or runtime crashes deep in business logic. Agents habitually write `as SomeType` because it satisfies the compiler immediately — this rule prevents the pattern at the root.

_How to apply:_ Fires at any function that crosses a trust boundary. The boundary is: data you did not produce (HTTP body, DB row, env var value, third-party API call). Internal function calls between your own typed modules do not need parse overhead.

_Enforceability:_ Partially enforced by `@typescript-eslint/no-unsafe-assignment` (catches assignment of `any`) and `no-explicit-any`. The `as` cast specifically requires PR review — there is no mechanical lint rule that bans `as SomeType` in the general case (only `no-unsafe-*` rules for `any`-typed sources).

---

**#2 — Floating Promises are build failures.**

_Directive:_ Every Promise-returning expression must be `await`ed, `return`ed, passed to `ctx.waitUntil()`, or explicitly marked `void expr` with a comment explaining why.

_Why:_ Floating Promises silently swallow errors. In Workers, they can also fail to complete before the runtime terminates the isolate. In Next.js Server Actions, a floating write causes a race condition visible only under concurrent load.

_How to apply:_ `@typescript-eslint/no-floating-promises` enforces the mechanical rule. The `void` escape hatch with a comment makes intentional fire-and-forget explicit and reviewable.

_Enforceability:_ Full lint rule: `@typescript-eslint/no-floating-promises` in recommended-type-checked. Requires `parserServices` (typed linting). Already standard in Vercel's style guide.

---

**#3 — Enable `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` in tsconfig.**

_Directive:_ All projects set `noUncheckedIndexedAccess: true` and `exactOptionalPropertyTypes: true` in `tsconfig.json` beyond the base `strict: true`.

_Why:_ `noUncheckedIndexedAccess` makes `rows[0]` return `T | undefined`, forcing the agent to handle the empty-result case that causes the most common production crash pattern ("Cannot read property 'id' of undefined"). `exactOptionalPropertyTypes` distinguishes absent from explicitly-undefined, which matters for every PATCH endpoint where "missing field" and "clear field" are different operations.

_How to apply:_ Set once in the root tsconfig. Propagates to all packages. Expect a one-time fix pass on existing code.

_Enforceability:_ tsconfig flag — mechanical and automatic.

---

**#4 — Exhaustive discriminated union checks with `assertNever`.**

_Directive:_ Every `switch` or `if/else-if` chain over a union type must have a default branch that calls `assertNever(x)` (a function typed `(x: never) => never` that throws). Never use a bare `default: break` on a typed discriminant.

_Why:_ When a future agent adds a new member to a union (a new `EventType`, a new `Status`), every switch that doesn't handle it silently executes the wrong branch or falls through. The compiler flags the missing case at every switch the moment the union changes. This is the highest-leverage pattern for multi-session agent code — it turns a silent runtime regression into a compile-time build failure.

_How to apply:_ Add `assertNever` to a shared utility module. Apply to all switches over `EventType`, `Status`, route discriminants, and any `type | union` that represents a closed set of cases. Does not apply to `string | undefined` or open-ended string unions.

_Enforceability:_ Partially: `@typescript-eslint/switch-exhaustiveness-check` enforces this mechanically. PR review for the `if/else-if` pattern.

---

**#5 — Never store request-scoped state in module-level variables in Workers.**

_Directive:_ In Cloudflare Workers code, module-level `let` and `const` may only hold immutable, initialization-time values (parsed config, compiled regexes, reusable fetch clients). Never store per-request data (user context, request IDs, accumulated state) in module scope.

_Why:_ Workers reuse isolates across requests. A module-level variable set in request A is visible in request B. This causes cross-request data leaks, stale authorization state, and "Cannot perform I/O on behalf of a different request" errors that are invisible in local dev and destructive in production under real traffic.

_How to apply:_ All per-request state flows through function parameters. `env` bindings are safe (they are per-deployment, not per-request). `ctx.waitUntil()` callbacks must close over values, not read them from module scope.

_Enforceability:_ PR review only. No lint rule catches module-level mutation in isolation.

---

**#6 — Run `wrangler types` on every binding change; commit the output.**

_Directive:_ The `Env` interface for Workers is always generated by `wrangler types` and committed to the repository. Hand-written `Env` interfaces are prohibited. Re-run `wrangler types` whenever `wrangler.jsonc` changes and commit the updated output.

_Why:_ Hand-written `Env` drifts from the actual Wrangler configuration immediately. A binding that appears in code but not in `wrangler.jsonc` compiles fine but throws at runtime. The generated file is the only source of truth that catches binding mismatches at compile time.

_How to apply:_ Add `wrangler types` to the prebuild step. In CI, run `wrangler types --dry-run` and diff against committed output to catch drift.

_Enforceability:_ CI check. Run `wrangler types` and verify the output matches the committed file (a deterministic diff check).

---

**#7 — Avoid barrel files (`index.ts` re-export aggregators) in application code.**

_Directive:_ `index.ts` files that re-export from sibling modules (barrel files) are prohibited in application source directories. Direct imports are required. Barrel files are acceptable only at package boundaries (the public surface of an npm-style package).

_Why:_ Barrel files create circular dependency traps (an agent imports from `index.ts`, `index.ts` imports the file the agent is editing). They cause bundlers to load every module in the barrel when only one is needed, producing 3-5x startup time regressions. They also defeat `import/no-cycle` lint rules because the cycle runs through the barrel, not between leaf files directly.

_How to apply:_ Direct imports everywhere: `import { validateToken } from '../auth/validate-token'` not `import { validateToken } from '../auth'`. Package-level `index.ts` files that are a deliberate public API surface are acceptable.

_Enforceability:_ `import/no-barrel-files` (eslint-plugin-barrel-files) or ban-specific-patterns in ESLint. PR review for the pattern.

---

**#8 — Use `unknown` not `any` for untyped inputs; use type guards to narrow.**

_Directive:_ Declare untyped inputs as `unknown`, never `any`. Write a type guard or parse function to narrow before use.

_Why:_ `any` disables type checking for all downstream uses of the value. `unknown` forces a guard at the narrowing site, which keeps type unsafety contained. Agents write `any` because it resolves type errors immediately — this rule pushes them toward a correct solution instead.

_How to apply:_ `@typescript-eslint/no-explicit-any` as a warning (not an error, since some interop genuinely needs `any`). `@typescript-eslint/no-unsafe-assignment` as an error catches the propagation problem. Exception: external library types that are `any`-typed at source — annotate the boundary callsite.

_Enforceability:_ Lint rules: `no-explicit-any` (warn), `no-unsafe-assignment` (error), `no-unsafe-member-access` (error), `no-unsafe-return` (error).

---

**#9 — No default exports.**

_Directive:_ All modules use named exports. Default exports are prohibited except in framework-required positions (`next.config.ts`, Astro layout files, Cloudflare Worker `export default { fetch }` entry point).

_Why:_ Default exports break global search — `grep -r 'AuthService'` finds nothing if the export is unnamed at point of use. They create inconsistent naming when imported across files. Agents consistently auto-complete named imports; default exports require knowing the file path. The exceptions are framework-mandated and mechanical.

_How to apply:_ `import/no-default-export` ESLint rule with per-file overrides for framework entry points.

_Enforceability:_ Full lint rule.

---

**#10 — Prefer `const` object maps over TypeScript `enum`.**

_Directive:_ Use `const` objects with `as const` for enumerated values. Avoid TypeScript `enum` keyword (numeric and string both). Use `type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]` for the type.

_Why:_ TypeScript `enum` produces non-erasable runtime JavaScript. Numeric enums have unsafe reverse-mapping behavior (`EventType[0]` is a valid string). `const enum` cannot be used across module/package boundaries without `isolatedModules` workarounds. `const` object maps are plain JavaScript objects, fully transparent, and work identically in Next.js, Astro, and Workers.

_How to apply:_ Apply on new code and when touching existing enums. The `@typescript-eslint/no-enum` rule enforces mechanically.

_Enforceability:_ `@typescript-eslint/no-enum` (available in strict config, or add manually).

---

**#11 — File cohesion ceiling: 400 lines; hard stop at 600.**

_Directive:_ Source files should not exceed 400 lines. Files over 600 lines must be split before merging. The split should follow cohesion, not arbitrary line counts (split at a conceptual boundary, not mid-function).

_Why:_ A 1,200-line file consumes 1,200+ tokens of context before an agent has written any code. Agents reading a 600-line file cold miss behavior defined in lines 450-600. The 400/600 boundary is calibrated to fit the file + surrounding context + generation buffer inside a comfortable working window. This is different from Clean Code's 5-20 line function dogma — the unit here is the file, and the driver is agent context arithmetic, not human attention span.

_How to apply:_ `max-lines` ESLint rule (`"max-lines": ["error", { max: 600 }]`). Use 400 as the PR review trigger point.

_Enforceability:_ Full lint rule: `max-lines`.

---

**#12 — Error handling: catch at boundaries, propagate typed errors internally.**

_Directive:_ `try/catch` blocks are only permitted at system boundaries (request handlers, queue consumers, cron triggers, external API call wrappers). Within business logic, functions either return a typed value or throw a typed `Error` subclass. Do not use Result types (neverthrow) on new code unless a module already uses them consistently.

_Why:_ Result types (neverthrow, ts-results) provide compile-time enforced error handling, which is valuable. However, they require consistent adoption to be effective — a single `throw` in a chain of `.andThen()` calls breaks the contract silently. For an agent-authored codebase that will be touched by many sessions, mixed error handling styles are worse than either pure strategy. The pragmatic position for 2026: typed Error subclasses (e.g., `class NotFoundError extends Error { readonly type = 'NOT_FOUND' }`) plus exhaustive boundary catches is the lowest-friction approach that still provides meaningful error categorization. Adopt neverthrow only if the entire module is greenfield and the captain explicitly authorizes it.

_How to apply:_ `try/catch` blocks in route handlers, `fetch` wrappers, D1 query wrappers. Typed Error subclasses for distinct failure modes. No bare `throw 'string'` or `throw { message: '...' }` — always `throw new SomeError(...)`.

_Enforceability:_ Google style guide rule enforced by `@typescript-eslint` `no-throw-literal` rule (throw only Error instances). The boundary-only-catch pattern is PR review.

---

**#13 — Type function signatures at the boundary; let inference work inside.**

_Directive:_ Explicitly annotate the parameter types and return types of exported functions. Allow TypeScript inference for internal variables, intermediate values, and closures.

_Why:_ Explicit boundary annotations make the contract of a function clear to a cold-reading agent without requiring them to trace inference through the implementation. Over-annotating internal variables adds noise without signal. This is the practical middle ground between "annotate everything" (Java-style verbosity) and "annotate nothing" (implicit contracts that agents misread).

_How to apply:_ All exported functions have explicit return types. `const` declarations inside function bodies use inference. `@typescript-eslint/explicit-module-boundary-types` enforces this mechanically.

_Enforceability:_ `@typescript-eslint/explicit-module-boundary-types` (warn or error).

---

**#14 — Validate Worker `nodejs_compat` flag in tests.**

_Directive:_ Vitest / miniflare test configuration must NOT inject `nodejs_compat` unless the production `wrangler.jsonc` also enables it. Pin test compatibility flags to match production.

_Why:_ Vitest's Workers pool automatically injects `nodejs_compat`, allowing Node.js built-ins (`node:crypto`, `node:buffer`, `node:stream`) to work in tests. Code that imports these modules passes all tests and silently throws `ReferenceError` or `Module not found` in production Workers. This is the most common "passes CI, breaks prod" failure pattern specific to the Workers stack.

_How to apply:_ In `vitest.config.ts`, set `pool: 'workers'` with `miniflare: { compatibilityFlags: [] }` (or explicitly match `wrangler.jsonc` flags). Add a CI step that diffs `wrangler types` output to catch drift.

_Enforceability:_ Configuration check. Can add a test that asserts the Vitest config flags match the Wrangler config flags programmatically.

---

## Things We Should Explicitly NOT Adopt

**1. Function size limits (Martin's 5-20 lines rule)**

The premise is that "smaller functions are easier to understand." This is only true up to a point. A 60-line function with a clear flow — guard clauses, main logic, return — is easier to understand than six 10-line functions spread across a file, each requiring navigation to understand the whole. For agents reading cold, the six-function version requires loading six additional function bodies into context to understand what one function does. The qntm.org critique and Gerlach's analysis both document how literal application produces verbose function names ("smallestOddNthMultipleNotLessThanCandidate"), hidden side-effects, and CQS violations in Martin's own example code. Keep the existing "three similar lines > premature abstraction" stance and add: a function should be as long as it needs to be to complete one coherent operation, with a pragmatic ceiling around 80-100 lines before asking whether it is genuinely two operations.

**2. Comment every public function with JSDoc**

Google's style guide says "only when they add information." For an agent-authored codebase where function names are precise (directive #9 above: no vague names), most function-level JSDoc is type information the TS compiler already expresses. The maintenance burden is real — agents write JSDoc at creation time and never update it. Stale JSDoc is worse than no JSDoc. Keep the existing "only WHY when non-obvious" rule and do not add JSDoc mandates.

**3. Decorator-based dependency injection**

tsyringe, InversifyJS, and similar frameworks rely on `emitDecoratorMetadata` and `experimentalDecorators` — the legacy decorator specification that TypeScript 5.0 marked obsolete in favor of the TC39 decorator standard. They cannot run on workerd (no `Reflect` polyfill, no class field initialization guarantees). They add a mandatory Babel/esbuild transform step. The "DI for testability" argument is better served by passing dependencies as function parameters (a pattern that works identically on Node, Astro SSR, and Workers) and using `vi.fn()` at the call boundary in tests.

**4. `interface` for everything; `type` for nothing**

Google's style guide recommends interfaces over type aliases for object shapes. This is sound at Google's scale (interfaces are open for augmentation in `.d.ts` files). At 6-10 ventures, the distinction adds cognitive overhead without payoff. Use `type` for union types, computed types, and mapped types; use `interface` when you expect the shape to be extended or implemented by a class. Don't mandate one over the other for plain data shapes.

**5. Strict no-comments in functions**

Martin's book reads as "fewer comments are always better." For a codebase where Workers have surprising runtime semantics (`ctx.waitUntil()`, isolate reuse, `this`-binding on destructured methods), a one-line comment at the site of a non-obvious platform behavior is worth more than no comment. Existing CLAUDE.md stance is correct; the refinement is: platform-specific workarounds and deliberate rule violations must have a comment. Everything else follows the default-no-comment rule.

---

## Open Questions / Stack-Specific Considerations

**Next.js vs Astro vs CF Workers divergence:**

- _Error handling at the boundary:_ Next.js Server Actions have `useFormState` / `useActionState` for propagating typed errors to the client. Workers have no equivalent — error handling is entirely response-body-based. Astro endpoints fall between the two. The "typed Error subclass" pattern works across all three, but the boundary shape differs.

- _File-based routing and default exports:_ Next.js App Router requires `export default` for `page.tsx`, `layout.tsx`, `loading.tsx`, `route.ts`. Astro requires `export default` for `*.astro` pages. The "no default exports" lint rule needs per-pattern overrides for framework files. The `import/no-default-export` rule supports glob-based overrides.

- _Global state and module caching:_ Next.js caches module-level values across server-rendered requests in the same Node.js process (similar risk to Workers, different runtime semantics). Astro SSR on Node has the same issue. The module-level state rule applies everywhere, not just Workers.

- _`ctx.waitUntil()` vs `after()`:_ Next.js 15 introduced `unstable_after()` for post-response work, analogous to Workers' `ctx.waitUntil()`. The pattern is now portable. A shared abstraction (`fire(fn)`) that calls the appropriate mechanism per runtime is viable but may be premature abstraction for the current portfolio scale.

**The "agent-authored" angle changes the calculus in these ways:**

- Naming matters more, not less. An agent reading cold has no IDE hover, no "go to definition" muscle memory, no knowledge of the codebase's history. Names are the primary navigation signal.

- Explicit over implicit everywhere. Human developers learn implicit conventions through team culture. Agents learn them through CLAUDE.md and from the code itself. If a convention is not encoded in the code structure or a lint rule, it will be violated.

- Dead code accumulates faster. Agents write code that satisfies a test or a type check without always tracing whether the code is reachable in production. `@typescript-eslint/no-unnecessary-condition` and `no-unreachable` lint rules catch some of this. Code review gates (the `code-review` skill) catch the rest.

- Abstraction debt accrues differently. Human teams over-abstract proactively. Agent teams under-abstract (prefer duplication, per existing CLAUDE.md) but then miss the point where duplication becomes a liability. The three-lines rule is correct — the signal to abstract is when a third near-identical block appears, not before.

---

_Sources cited in this document:_

- [It's probably time to stop recommending Clean Code (qntm)](https://qntm.org/clean)
- [Clean Code: The Good, the Bad and the Ugly (Gerlach)](https://gerlacdt.github.io/blog/posts/clean_code/)
- [Are SOLID Principles Cargo Cult? (NDepend)](https://blog.ndepend.com/are-solid-principles-cargo-cult/)
- [Effective TypeScript (effectivetypescript.com)](https://effectivetypescript.com/)
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- [Effective Context Engineering for AI Agents (Anthropic)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Coding Guidelines for Your AI Agents (JetBrains)](https://blog.jetbrains.com/idea/2025/05/coding-guidelines-for-your-ai-agents/)
- [AI Coding Style Guides repo](https://github.com/lidangzzz/AI-Coding-Style-Guides)
- [Please Stop Using Barrel Files (TkDodo)](https://tkdodo.eu/blog/please-stop-using-barrel-files)
- [Workers Best Practices (Cloudflare)](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Write Workers in TypeScript (Cloudflare)](https://developers.cloudflare.com/workers/languages/typescript/)
- [wrangler types multi-environment (Cloudflare changelog)](https://developers.cloudflare.com/changelog/post/2026-01-13-wrangler-types-multi-environment/)
- [typescript-eslint rules](https://typescript-eslint.io/rules/)
- [typescript-eslint shared configs](https://typescript-eslint.io/users/configs/)
- [Vercel style guide (GitHub)](https://github.com/vercel/style-guide)
- [neverthrow (GitHub)](https://github.com/supermacro/neverthrow)
- [Error handling in TypeScript (Jökull Sólberg)](https://www.solberg.is/neverthrow)
- [The Strictest TypeScript Config (Vladyslav Zubko)](https://whatislove.dev/articles/the-strictest-typescript-config/)
- [Discriminated Unions and Exhaustiveness Checking (FullStory)](https://www.fullstory.com/blog/discriminated-unions-and-exhaustiveness-checking-in-typescript/)
- [Structuring Your Codebase for AI Tools 2025 (Propel Code)](https://www.propelcode.ai/blog/structuring-codebases-for-ai-tools-2025-guide)
