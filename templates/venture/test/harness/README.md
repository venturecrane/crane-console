# Harness tests

In-process tests powered by
[`@venturecrane/crane-test-harness`](https://github.com/venturecrane/crane-console/releases/tag/crane-test-harness-v0.1.0).
They replace the legacy pattern of spinning up a live `wrangler dev` server
for every integration test — the harness provides an in-memory D1 shim and
an `invoke()` helper that calls your worker entry directly.

## What the harness exports

```ts
import {
  createTestD1,
  runMigrations,
  discoverNumericMigrations,
  invoke,
  installWorkerdPolyfills,
} from '@venturecrane/crane-test-harness'
```

- `createTestD1()` — returns a fresh in-memory `D1Database` shim.
- `runMigrations(db, { files })` — applies an ordered list of `.sql` files
  against the DB.
- `discoverNumericMigrations(dir)` — lists migration files in the correct
  order (`schema.sql` first, then `0003_…`, `0004_…`, …).
- `invoke(workerEntry, request, env)` — in-process HTTP invoke of a worker
  `export default { fetch }` module.
- `installWorkerdPolyfills()` — installs workerd globals when running under
  the default node test environment.

## Minimal migrations test

```ts
import { describe, expect, it } from 'vitest'
import {
  createTestD1,
  discoverNumericMigrations,
  runMigrations,
} from '@venturecrane/crane-test-harness'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = resolve(here, '../../migrations')

describe('migrations', () => {
  it('creates the expected tables', async () => {
    const db = createTestD1()
    const files = discoverNumericMigrations(migrationsDir)
    await runMigrations(db, { files })

    const { results } = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
    const tables = results.map((r: { name: string }) => r.name)

    expect(tables).toContain('your_expected_table')
  })
})
```

## Reference

Working example in the monorepo:
[`workers/crane-context/test/harness/migrations.test.ts`](../../../../workers/crane-context/test/harness/migrations.test.ts)
