export interface NoteRecord {
  id: string
  title: string | null
  content: string
  tags: string | null // JSON array
  venture: string | null
  archived: number // 0 = false, 1 = true
  created_at: string
  updated_at: string
  actor_key_id: string | null
  meta_json: string | null
  // Provenance + curator fields (migration 0044, populated by PR 2 curator)
  authored_by_session_id?: string | null
  source_hash?: string | null
  embedding_model?: string | null
  embedding_version?: string | null
  embedding_hash?: string | null
  injectable?: number // 0 = false, 1 = true; default 0
}
