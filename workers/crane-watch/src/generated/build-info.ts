/**
 * AUTO-GENERATED — DO NOT EDIT.
 *
 * Placeholder committed so TypeScript has valid types at compile time.
 * Overwritten by scripts/inject-version.mjs at build time (invoked by
 * wrangler.toml [build] command on every `wrangler deploy`).
 *
 * See plan v3.1 §D.1.
 */

export interface BuildInfo {
  readonly service: 'crane-context' | 'crane-watch' | 'crane-mcp-remote'
  readonly commit: string
  readonly commit_short: string
  readonly build_timestamp: string
  readonly schema_hash: string | undefined
}

export const BUILD_INFO: BuildInfo = {
  service: 'crane-watch' as const,
  commit: 'UNSET-RUN-INJECT-VERSION',
  commit_short: 'UNSET',
  build_timestamp: 'UNSET',
  schema_hash: undefined,
} as const
