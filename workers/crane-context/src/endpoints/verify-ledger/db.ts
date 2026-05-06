/**
 * DB write helpers for verify-ledger endpoints.
 *
 * Extracted to keep handleRecordVerification under the 75-line cap.
 * All functions are pure DB operations — no HTTP concerns.
 */

import type { Env } from '../../types'
import { type VerifySource, type VerifyTruncation, type VerifyMethod } from './validation'

export interface LedgerRow {
  id: string
  sessionId: string | null
  venture: string | null
  repo: string | null
  method: VerifyMethod
  source: VerifySource
  claim: string
  outputScrubbed: string
  outputHash: string
  outputRedacted: boolean
  outputTruncation: VerifyTruncation
  toolUsed: string
  command: string | null
  commandHash: string | null
  freshRuntime: boolean | undefined
  freshRuntimeJustification: string | null
  actorKeyId: string
}

/**
 * Atomically write a verify_ledger row + per-file verify_files rows.
 * Returns the D1 result (callers can ignore it; it throws on DB error).
 */
export async function writeLedgerRow(env: Env, filesTouched: string[], row: LedgerRow) {
  const stmts = [
    env.DB.prepare(
      `INSERT INTO verify_ledger
         (id, session_id, venture, repo, method, source, claim,
          output_scrubbed, output_hash, output_redacted, output_truncation,
          tool_used, command, command_hash,
          fresh_runtime, fresh_runtime_justification, actor_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      row.id,
      row.sessionId,
      row.venture,
      row.repo,
      row.method,
      row.source,
      row.claim,
      row.outputScrubbed,
      row.outputHash,
      row.outputRedacted ? 1 : 0,
      row.outputTruncation,
      row.toolUsed,
      row.command,
      row.commandHash,
      row.freshRuntime === undefined ? null : row.freshRuntime ? 1 : 0,
      row.freshRuntimeJustification,
      row.actorKeyId
    ),
    ...filesTouched.map((path) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO verify_files (verify_id, file_path) VALUES (?, ?)`
      ).bind(row.id, path)
    ),
  ]

  return env.DB.batch(stmts)
}
