# D1 Semantic Differences

`@venturecrane/crane-test-harness` provides an in-process SQLite shim that mimics Cloudflare D1 closely enough to test the vast majority of HTTP handler logic. It is **not** a perfect emulator. This document enumerates known semantic differences between the shim and real D1, both as a reference for adopters and as a forcing function: any divergence here that affects production code is a candidate for adding a new Miniflare canary endpoint.

## Backend

The shim wraps Node 22+'s built-in `node:sqlite` module (`DatabaseSync`). It runs the same SQLite engine that's bundled with Node, NOT the workerd-bundled SQLite that real D1 uses. The two engines are usually compatible but can drift on edge-case behaviors documented below.

## Foreign Keys

**Default**: real D1 enforces foreign keys (`PRAGMA foreign_keys = ON` is the default).

**`node:sqlite` default**: foreign keys are OFF.

**Shim behavior**: `createTestD1()` runs `PRAGMA foreign_keys = ON` at initialization, matching D1. If your migrations rely on FK enforcement (cascading deletes, rejected orphan inserts), the shim behaves correctly.

## `batch()` Atomicity

**Real D1**: `db.batch([s1, s2])` runs all statements in a single transaction. If any fails, all are rolled back.

**Shim**: Identical. The shim wraps the batch in `BEGIN; ... COMMIT;` and rolls back on any thrown error from underlying statements. The error from the failing statement is re-thrown.

**Caveat**: The `D1Result[]` returned for a successful batch contains real result objects from each statement. This is not a stubbed array.

## Type Coercion on `bind()`

**Real D1**: Accepts `null`, `number` (INTEGER for whole, REAL for fractional), `bigint`, `string`, `boolean` (silently coerced to 0/1), `Uint8Array`/`ArrayBuffer` (BLOB).

**`node:sqlite`**: Throws on `boolean` and `undefined`. Accepts the rest with similar semantics.

**Shim behavior**: `coerceForBind()` translates `boolean → 0/1` and `undefined → null` before passing to `node:sqlite`. SQL written for D1 should bind without modification.

## `last_row_id` for TEXT Primary Keys

**Real D1**: Returns `0` for tables whose `PRIMARY KEY` is `TEXT` (e.g. ULID-based IDs).

**`node:sqlite`**: Returns the rowid of the implicit rowid column (often non-zero, usually irrelevant).

**Shim behavior**: Forwards `node:sqlite`'s `lastInsertRowid` directly. Test code that checks `meta.last_row_id` for TEXT-PK tables may see different values from production. Avoid asserting on this field for TEXT-PK tables.

## `datetime('now')` Locale

Both `node:sqlite` and D1 return UTC for `datetime('now')`. No known divergence.

## Prepared Statement Caching

**Real D1**: Caches prepared statements server-side. Re-using a `prepare()` result across multiple `bind()` calls is efficient.

**Shim**: Caches `StatementSync` instances per SQL text inside `createTestD1()`. The first `prepare()` for a given SQL string compiles the statement; subsequent calls return the cached compiled form. `bind()` returns a new wrapper without recompiling.

The cache is per-`createTestD1()` instance, so each test that creates a new D1 starts with an empty cache.

## `dump()` and `withSession()`

**Real D1**: Both supported. `dump()` returns the database as an ArrayBuffer. `withSession()` is for read-replica session management.

**Shim**: Both throw `'not implemented'`. Tests should not need either.

## `ExecutionContext` (`ctx.waitUntil`)

**Real D1**: Workers can use `ctx.waitUntil(promise)` to keep work alive after the response is sent. The runtime awaits the promise out-of-band.

**Shim**: The harness's `invoke()` helper does NOT pass a `ctx` argument to the worker's `fetch` handler. Workers that call `ctx.waitUntil(...)` will throw a `TypeError: Cannot read properties of undefined`.

**Workaround for adopters**: If your worker uses `ctx.waitUntil`, the harness needs to be extended with an `ExecutionContext` shim that synchronously awaits queued promises before `invoke()` returns. This is tracked as a follow-up. Crane-context (the first in-monorepo adopter) does not use `ctx`, so the omission is safe for the initial release.

## Stability Warning

The shim relies on Node 22's `node:sqlite` module, which is stability index 1.2 ("release candidate") as of Node 22.x. Importing it emits a one-time stderr warning:

```
ExperimentalWarning: SQLite is an experimental feature and might change at any time
```

This is expected. The flag requirement (`--experimental-sqlite`) was removed in Node 22.13.0; only the warning remains. Suppress in test output via `NODE_NO_WARNINGS=1` if it clutters CI logs.

## How to Detect New Divergences

The Miniflare canary in `workers/crane-context/test/canary/` runs the same scenario against both backends and asserts identical behavior. If you hit a divergence the canary doesn't catch:

1. Add a new endpoint to the canary that exercises the divergent path.
2. Document the divergence here.
3. Decide whether to fix the shim or document the limitation.

The shim is intentionally minimal. Growing it without growing the canary is how silent drift accumulates.
