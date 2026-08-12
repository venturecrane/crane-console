# Runbook: restoring a D1 backup

**Applies to:** `crane-context-db-prod`, `crane-context-db-staging`
**Backup source:** the `D1 Nightly Backup` workflow artifact (90-day retention)
**Read this before you need it.** The dump is deliberately incomplete in one specific way, and a restore that ignores that leaves search silently broken.

## What the backup contains, and what it does not

The nightly dump contains every ordinary table, discovered from `sqlite_master` at run time rather than from a hardcoded list.

It **excludes** fts5 virtual tables and their shadow tables (`notes_fts`, `notes_fts_data`, `notes_fts_idx`, `notes_fts_docsize`, `notes_fts_config`). This is not a gap in coverage — the D1 exporter refuses to export any database containing a virtual table, which is why the previous whole-database backup failed 60 out of 60 runs and produced nothing for months.

Nothing is lost. `notes_fts` is an **external-content** fts5 index over `notes(content, title)` (`migrations/0045_notes_fts5.sql`). Every byte in it is derived from `notes`. It is rebuilt in step 4 below.

## Restore

### 1. Get the artifact and check it

```bash
gh run download <RUN_ID> -R venturecrane/crane-console -n backup-crane-context-db-prod-<TIMESTAMP>
sha256sum -c backup-crane-context-db-prod-<TIMESTAMP>.sql.sha256
```

Do not skip the checksum. Read the dump's header comment — it records the run URL and the table count that run exported.

### 2. Confirm the target

`wrangler d1 execute` writes to whatever `--env` resolves to. Restoring prod over staging is recoverable; the reverse is not.

```bash
cd workers/crane-context
npx wrangler d1 info DB --env production   # prod
npx wrangler d1 info DB                    # staging
```

### 3. Import

```bash
npx wrangler d1 execute DB --env production --remote \
  --file=backup-crane-context-db-prod-<TIMESTAMP>.sql
```

### 4. Recreate the search index — the step that is easy to forget

The import restores `notes` but not `notes_fts`. Until this runs, `crane_memory` recall with a `query` returns **nothing**, and it does so without erroring — the recall path finds an empty index and reports no matches, which is indistinguishable from "no memories matched."

```bash
npx wrangler d1 execute DB --env production --remote \
  --file=migrations/0045_notes_fts5.sql
```

That file creates the virtual table, reinstalls the three sync triggers, and ends with `INSERT INTO notes_fts(notes_fts) VALUES('rebuild');`.

Apply any migrations numbered above 0045 that also create virtual tables. `grep -l 'CREATE VIRTUAL TABLE' migrations/*.sql` lists them.

### 5. Verify the restore rather than assuming it

```bash
# Row counts against the source table
npx wrangler d1 execute DB --env production --remote --json \
  --command "SELECT (SELECT COUNT(*) FROM notes) AS notes, (SELECT COUNT(*) FROM notes_fts) AS fts"
```

`notes` and `fts` must match. If `fts` is 0 or short, step 4 did not take — rerun it before declaring the restore done.

```bash
# The index actually answers a query
npx wrangler d1 execute DB --env production --remote --json \
  --command "SELECT COUNT(*) AS hits FROM notes_fts WHERE notes_fts MATCH 'the'"
```

A non-zero count proves the index is populated and queryable. A restore verified only by "the import command exited 0" has verified nothing — that was exactly the failure mode of the backup this runbook replaces.

## If the nightly backup is failing

Failures open (or comment on) a single issue labelled `d1-backup-failure`. There is no fresh off-platform backup while that issue is open — treat it as such.

Cloudflare **Time Travel** provides on-platform point-in-time restore for the last 30 days and is independent of this workflow. It is the fallback if no artifact is usable:

```bash
npx wrangler d1 time-travel restore DB --env production --timestamp=<UNIX_TS>
```

Time Travel is not a substitute for the artifact: it lives in the same account as the database it protects, so it does not survive account-level loss.
