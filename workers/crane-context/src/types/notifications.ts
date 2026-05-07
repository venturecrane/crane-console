import type {
  NotificationSeverity,
  NotificationStatus,
  NotificationSource,
  NotificationMatchKeyVersion,
  NotificationAutoResolveReason,
} from '../constants'

export type {
  NotificationSeverity,
  NotificationStatus,
  NotificationSource,
  NotificationMatchKeyVersion,
  NotificationAutoResolveReason,
}

export interface NotificationRecord {
  id: string
  source: NotificationSource
  event_type: string
  severity: NotificationSeverity
  status: NotificationStatus
  summary: string
  details_json: string
  external_id: string | null
  dedupe_hash: string
  venture: string | null
  repo: string | null
  branch: string | null
  environment: string | null
  created_at: string
  received_at: string
  updated_at: string
  actor_key_id: string

  // Match-key fields (added in migration 0023 for the auto-resolver).
  // Nullable for backward compatibility with rows inserted before the
  // PR A2 code path was deployed. Legacy rows are backfilled in-migration
  // from details_json where possible.
  workflow_id: number | null
  workflow_name: string | null
  run_id: number | null
  head_sha: string | null
  check_suite_id: number | null
  check_run_id: number | null
  app_id: number | null
  app_name: string | null
  deployment_id: string | null
  project_name: string | null
  target: string | null
  match_key: string | null
  match_key_version: NotificationMatchKeyVersion | null
  run_started_at: string | null
  auto_resolved_by_id: string | null
  auto_resolve_reason: NotificationAutoResolveReason | null
  resolved_at: string | null
}
