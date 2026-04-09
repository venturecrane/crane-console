-- Migration: Add machines table for machine registry
-- Supports automated provisioning and SSH mesh generation

-- 2026-04-08 retroactive idempotency guard (see 0027) — do not remove.
CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL UNIQUE,
  tailscale_ip TEXT NOT NULL,
  user TEXT NOT NULL,
  os TEXT NOT NULL,
  arch TEXT NOT NULL,
  pubkey TEXT,
  role TEXT DEFAULT 'dev',
  status TEXT DEFAULT 'active',
  registered_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  meta_json TEXT,
  actor_key_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_machines_hostname ON machines(hostname);
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);
