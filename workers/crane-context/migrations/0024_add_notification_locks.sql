-- Migration 0024: Notification locks for the backfill CLI
--
-- The notification backfill CLI walks all open notifications, queries the
-- GitHub Actions API for matching green runs, and POSTs auto-resolves to
-- the admin endpoint. It is intended to be a one-shot operation, but the
-- script must be safe against:
--
--   - Concurrent invocations from two machines (operator on mac23 and
--     operator on m16 both running the script at once)
--   - Re-running after a partial failure (resume safely)
--   - Stuck/orphaned locks if the holder crashes
--
-- This table is the application-level mutex. It is keyed by lock name
-- (only one global lock today: 'backfill-auto-resolve') and tracks the
-- holder, acquisition time, and an expiry. The CLI takes the lock with
-- INSERT OR IGNORE and refuses to start if another holder owns it. The
-- expiry handles the crash case: if a lock is older than its TTL, the
-- next acquirer can claim it after deleting the stale row.

CREATE TABLE IF NOT EXISTS notification_locks (
  name TEXT PRIMARY KEY,           -- e.g., 'backfill-auto-resolve'
  holder TEXT NOT NULL,            -- e.g., 'mac23.local:12345' (hostname:pid)
  acquired_at TEXT NOT NULL,       -- ISO timestamp
  expires_at TEXT NOT NULL,        -- ISO timestamp; lock can be reclaimed after this
  metadata_json TEXT               -- optional context (CLI version, dry_run flag, etc.)
);

CREATE INDEX IF NOT EXISTS idx_notification_locks_expires
  ON notification_locks(expires_at);
