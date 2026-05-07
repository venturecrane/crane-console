export interface Env {
  // Database binding
  DB: D1Database

  // Configuration (from wrangler.toml vars)
  CONTEXT_SESSION_STALE_MINUTES: string
  IDEMPOTENCY_TTL_SECONDS: string
  HEARTBEAT_INTERVAL_SECONDS: string
  HEARTBEAT_JITTER_SECONDS: string

  // Feature flags (PR A2 — gates the notification auto-resolver). Set to
  // 'true' to enable green webhook events to auto-resolve prior failure
  // notifications. Defaults to disabled until the rollout in PR A4.
  NOTIFICATIONS_AUTO_RESOLVE_ENABLED?: string

  // Plan v3.1 §D.1: explicit environment marker for /version endpoint
  // and for smoke-test-e2e.sh mutation-scenario guards. Values:
  // 'staging' | 'production'. Set via wrangler.toml [vars] and
  // [env.production.vars]. Missing = 'unknown' in /version output.
  ENVIRONMENT?: string

  // Memory recall efficacy upgrade (PR 2). Gate on which memories SOS
  // surfaces as Critical Anti-Patterns. Values:
  //   'captain_approved' - legacy: require frontmatter.captain_approved
  //   'injectable'       - require notes.injectable=1 (curator-set)
  //   'both'             - require BOTH (PR 2 default; bake-in mode)
  // Bake-in default is 'both' so an unflagged-but-cleanly-curated memory
  // does NOT inject until the Captain has spot-checked. Flip to
  // 'injectable' after the 48h observation window. Rollback path is the
  // same flip back to 'captain_approved' (~30s redeploy).
  MEMORY_INJECTION_GATE?: string

  // Workers AI binding (added in PR 2 wrangler.toml). Used by the
  // adversarial-check at write time and the contradiction-axis of the
  // memory-curator. Optional at type-time so unit tests against the
  // node:sqlite shim don't have to mock it.
  AI?: {
    run(model: string, params: Record<string, unknown>): Promise<unknown>
  }

  // Secrets (from wrangler secret put)
  CONTEXT_RELAY_KEY: string
  CONTEXT_ADMIN_KEY: string

  // Plan v3.1 §B.6 / #454: fine-grained PAT with read-only access to
  // venturecrane org. Used by the deploy-heartbeats reconciliation
  // cron (src/deploy-heartbeats-reconcile.ts) to query workflow runs.
  // If unset, the reconciliation no-ops with a warning log.
  GH_TOKEN?: string

  // Infisical management token used by /admin/provision-engagement and
  // /admin/engagement-secrets to create folders and proxy secret reads
  // for SS engagements. Scope this token to the /ss/clients/* subtree
  // only; rotate quarterly. See docs/process/new-engagement-setup-checklist.md.
  // If unset, the provisioning/secrets-proxy endpoints return 503.
  INFISICAL_MANAGEMENT_TOKEN?: string
}
