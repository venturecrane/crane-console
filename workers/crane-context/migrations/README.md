# crane-context D1 migrations

## Forward flow (canonical)

From `workers/crane-context/`:

```bash
# 1. Write a new migration file
#    Use the next sequential number: 0028_add_foo.sql
#    Prefer IF NOT EXISTS / OR IGNORE for idempotency
#    See "Idempotency rules" below

# 2. Pre-flight check — refuses to apply against an empty d1_migrations
npm run db:migrate:check staging
npm run db:migrate:check production

# 3. Apply to staging
npm run db:migrate:apply

# 4. Verify
npm run db:migrate:list

# 5. Apply to production
npm run db:migrate:apply:prod

# 6. Verify production
npm run db:migrate:list:prod
```

Each `migrations apply` run honors wrangler's native `d1_migrations` tracking
table, so re-runs are safe no-ops.

## The d1_migrations tracking table

Wrangler's `d1 migrations apply` command uses a `d1_migrations` table in D1 to
track which migrations have been applied. Each row is a migration file name
plus the timestamp when it was applied.

**Before 2026-04-08 (legacy, broken):** historical migrations 0003..0026 were
applied via `wrangler d1 execute --remote --file=./migrations/NNNN_*.sql`,
which bypasses the tracking table entirely. As a result, `d1_migrations` was
empty on both staging and production, and running `wrangler d1 migrations
apply` would have attempted to re-run all 26 historical migrations — many of
which are non-idempotent (`ALTER TABLE ADD COLUMN`, `DROP TABLE` patterns, etc)
— and would have corrupted production D1.

**After 2026-04-08 (fixed):** migration `0027_backfill_d1_migrations.sql`
creates `d1_migrations` and inserts one row per historical migration using its
actual git commit timestamp. From this point forward, `wrangler d1 migrations
apply` is safe because wrangler correctly sees the pre-existing history.

## Idempotency rules

When writing a new migration, follow these rules so it's safe to re-run
against a database where it has already been applied:

### ✅ Safe (idempotent by construction)

- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `CREATE UNIQUE INDEX IF NOT EXISTS`
- `INSERT OR IGNORE INTO <table> VALUES (...)`
- `DROP TABLE IF EXISTS`
- `DROP INDEX IF EXISTS`

### ⚠️ NOT safe in SQLite (no `IF NOT EXISTS` syntax available)

- `ALTER TABLE <t> ADD COLUMN <c>` — SQLite (as of 3.46) does not support
  `ALTER TABLE ADD COLUMN IF NOT EXISTS`. Re-running throws "duplicate column
  name" and halts the whole script.
- `ALTER TABLE <t> DROP COLUMN <c>` — same limitation.
- `ALTER TABLE <t> RENAME TO <new>` — runtime error if renamed target already
  exists.

For ALTER TABLE migrations, protection is:

1. **d1_migrations tracking** — the row is recorded after successful apply,
   and wrangler will skip the migration on subsequent `migrations apply` runs.
2. **Pre-flight guard** (`check-d1-migrations.sh`, also known as invariant
   I-3b) — refuses to run `migrations apply` against a DB where d1_migrations
   is empty or below the expected minimum, so the migration is never re-run
   against a populated DB with an empty tracking table.
3. **Document the non-idempotency** — add a comment at the top of the
   migration file explaining that it is destructive and linking back to this
   README.

### Destructive migrations (rebuild patterns)

Migrations that perform destructive rebuilds (e.g., creating a \_new table,
copying data, dropping the old, renaming) are inherently non-idempotent.
Example: `0011_drop_note_categories.sql`. For these, add a prominent warning
comment and rely on the d1_migrations tracking to prevent re-runs.

## Pre-flight check (I-3b)

The `db:migrate:check` script runs before any `migrations apply` to verify
that `d1_migrations` is populated. If the count is below the expected minimum
(historical count + current tree count), the script fails loudly with a
recovery procedure.

In CI, `.github/workflows/deploy.yml` runs this check before every
`migrations apply`. Locally, operators should run it manually before applying
migrations.

## Rollback

Wrangler's native `migrations apply` has no rollback command. To manually
"un-apply" a migration:

1. Manually reverse the DDL (the migration file's comment block should
   document the rollback procedure — if it doesn't, add it to the template).
2. Delete the corresponding row from `d1_migrations`:
   ```sql
   DELETE FROM d1_migrations WHERE name = '00NN_migration_name.sql';
   ```
3. If the rollback leaves the schema in a state incompatible with the
   deployed worker, roll back the worker deployment first via `wrangler
rollback`.

Rollbacks are risky. Prefer forward-fix migrations whenever possible.

## Schema.sql and schema.hash

`migrations/schema.sql` is the **v1.0 base schema** — the state of the
database before any incremental migration was written. It contains the
original `sessions`, `handoffs`, and `idempotency_keys` tables. (The
`request_log` table was removed in migration `0031_drop_request_log.sql`
after being identified as dead — it was never written to by any code path.)
**It is NOT the current consolidated schema.** Do not edit it.

`migrations/schema.hash` is the SHA-256 of the **current consolidated state**,
which is defined as:

```
state     = load(schema.sql) + apply(0003_*.sql) + apply(0004_*.sql) + ... + apply(latest_*.sql)
canonical = sqlite3 .schema (ordered by type DESC, name) — with ';' terminators
schema.hash = sha256(canonical)
```

In other words, schema.hash represents the SHAPE of the database after the
v1.0 base has been loaded AND every incremental migration applied on top. It
is NOT the hash of schema.sql alone.

**Two distinct roles:**

1. **Fresh-database bootstrap** (`db:schema:bootstrap`) loads schema.sql
   (v1.0 base) only. After bootstrap, operators must also run
   `db:migrate:apply` to bring the database up to the current state. This
   is rare: fresh DBs happen in local dev, CI test containers, disaster
   recovery.
2. **Live drift detection** — the `/admin/verify-schema` worker endpoint
   reads live `sqlite_master` from D1, computes the same canonical dump,
   and compares its SHA-256 to the committed `schema.hash`. If they
   differ, live D1 has drifted from the codebase's intended schema
   (someone ran stray DDL, a migration was not applied, etc).

### Regenerating schema.hash when a new migration lands

When you write a new incremental migration `00NN_foo.sql`:

```bash
cd workers/crane-context

# Write and test your migration
# ... edit migrations/00NN_foo.sql ...

# Regenerate the hash
bash scripts/compute-schema-hash.sh --update

# Verify it matches what the script computes
bash scripts/compute-schema-hash.sh --verify

# Commit the new migration AND the updated schema.hash in the same PR
git add migrations/00NN_foo.sql migrations/schema.hash
```

The `compute-schema-hash.sh` script:

- Loads schema.sql into a temporary SQLite DB
- Applies every 00NN\_\*.sql in sorted order
- Dumps sqlite_master with stable ordering (by type DESC, then name)
- Computes SHA-256 of the canonical output (with `;` + newline terminators)
- `--update` writes to schema.hash, `--verify` asserts the committed value
  matches the computed value

### CI enforcement (invariant I-6)

The readiness audit's I-6 invariant invokes `compute-schema-hash.sh --verify`
on every PR. If a migration was added without a corresponding schema.hash
update, CI fails with a clear error pointing to the fix command.

### Why not just hash schema.sql directly?

The plan's v3 draft proposed `sha256(schema.sql) == schema.hash`. The
critique pass pointed out that schema.sql is hand-maintained while the
incremental migrations are additive — the two inevitably drift. Worse,
committing to "they must match at all times" would turn CI red constantly
AND break the test harness whenever schema.sql was updated. The current
design (schema.sql stays as v1.0 base, schema.hash tracks the canonical
consolidated state computed by script) is round-trippable, stable across
SQLite versions, and does not fight the existing test harness which
expects schema.sql + all migrations applied in order.

## References

- Plan §D.3 (migration tracking repair): `/Users/scottdurgan/.claude/plans/kind-gliding-rossum.md`
- Wrangler D1 migrations docs: https://developers.cloudflare.com/d1/reference/migrations/
- H-1 PR: the fix that landed this README
