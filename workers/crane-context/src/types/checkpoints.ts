export interface CheckpointRecord {
  // Identity
  id: string

  // Linkage
  session_id: string

  // Context
  venture: string
  repo: string
  track: number | null
  issue_number: number | null
  branch: string | null
  commit_sha: string | null

  // Checkpoint content
  summary: string
  work_completed: string | null // JSON array
  blockers: string | null // JSON array
  next_actions: string | null // JSON array
  notes: string | null

  // Metadata
  checkpoint_number: number
  created_at: string

  // Attribution & tracing
  actor_key_id: string
  correlation_id: string
}
