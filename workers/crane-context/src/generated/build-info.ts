/**
 * AUTO-GENERATED — DO NOT EDIT.
 *
 * Placeholder committed so TypeScript has valid types at compile time.
 * Overwritten by scripts/inject-version.mjs at build time (invoked by
 * wrangler.toml [build] command on every `wrangler deploy`).
 *
 * If a deployed /version endpoint returns commit='UNSET-RUN-INJECT-VERSION'
 * or build_timestamp='UNSET', it means the worker was deployed WITHOUT
 * running the injection step. This is a deploy pipeline bug and should
 * trigger invariant I-1 (commit mismatch).
 *
 * See plan v3.1 §D.1.
 */

export interface BuildInfo {
  readonly service: 'crane-context' | 'crane-watch' | 'crane-mcp-remote'
  readonly commit: string
  readonly commit_short: string
  readonly build_timestamp: string
  readonly schema_hash_staging: string | undefined
  readonly schema_hash_production: string | undefined
}

export const BUILD_INFO: BuildInfo = {
  service: 'crane-context' as const,
  commit: 'UNSET-RUN-INJECT-VERSION',
  commit_short: 'UNSET',
  build_timestamp: 'UNSET',
  schema_hash_staging: undefined,
  schema_hash_production: undefined,
} as const
