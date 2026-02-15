/**
 * Crane Context Worker - Scripts Utilities
 *
 * Helper functions for fetching and managing operational scripts.
 */

import type { Env } from './types'
import { sha256 } from './utils'

// ============================================================================
// Types
// ============================================================================

export interface ContextScript {
  scope: string
  script_name: string
  content: string
  content_hash: string
  script_type: string
  executable: boolean
  description: string | null
  version: number
}

export interface ScriptsResponse {
  scripts: ContextScript[]
  count: number
  content_hash_combined: string // Combined hash of all scripts for cache validation
}

export interface ScriptMetadataRow {
  scope: string
  script_name: string
  content_hash: string
  executable: boolean
  version: number
}

// ============================================================================
// Script Fetching
// ============================================================================

/**
 * Fetch all relevant scripts for a venture
 * Returns global scripts + venture-specific scripts
 *
 * @param db - D1 database binding
 * @param venture - Venture code (vc, dfg, sc)
 * @returns Scripts response with scripts and combined hash
 */
export async function fetchScriptsForVenture(
  db: D1Database,
  venture: string
): Promise<ScriptsResponse> {
  try {
    // Fetch global scripts + venture-specific scripts
    const result = await db
      .prepare(
        `SELECT scope, script_name, content, content_hash, script_type, executable, description, version
         FROM context_scripts
         WHERE scope = 'global' OR scope = ?
         ORDER BY scope DESC, script_name ASC`
      )
      .bind(venture)
      .all()

    const scripts = result.results as unknown as ContextScript[]

    // Calculate combined content hash for cache validation
    const combinedContent = scripts.map((s) => s.content_hash).join('|')
    const contentHashCombined = await sha256(combinedContent)

    return {
      scripts,
      count: scripts.length,
      content_hash_combined: contentHashCombined,
    }
  } catch (error) {
    console.error('Error fetching scripts:', error)
    // Return empty response on error (graceful degradation)
    return {
      scripts: [],
      count: 0,
      content_hash_combined: '',
    }
  }
}

/**
 * Fetch only script metadata (without content) for lightweight responses
 *
 * @param db - D1 database binding
 * @param venture - Venture code
 * @returns Metadata response
 */
export async function fetchScriptsMetadata(
  db: D1Database,
  venture: string
): Promise<{
  scripts: Array<{
    scope: string
    script_name: string
    content_hash: string
    executable: boolean
    version: number
  }>
  count: number
}> {
  try {
    const result = await db
      .prepare(
        `SELECT scope, script_name, content_hash, executable, version
         FROM context_scripts
         WHERE scope = 'global' OR scope = ?
         ORDER BY scope DESC, script_name ASC`
      )
      .bind(venture)
      .all()

    return {
      scripts: result.results as unknown as ScriptMetadataRow[],
      count: result.results.length,
    }
  } catch (error) {
    console.error('Error fetching scripts metadata:', error)
    return {
      scripts: [],
      count: 0,
    }
  }
}

/**
 * Check if scripts are available for a venture
 *
 * @param db - D1 database binding
 * @param venture - Venture code
 * @returns True if scripts exist
 */
export async function hasScriptsForVenture(db: D1Database, venture: string): Promise<boolean> {
  try {
    const result = await db
      .prepare(
        `SELECT COUNT(*) as count
         FROM context_scripts
         WHERE scope = 'global' OR scope = ?`
      )
      .bind(venture)
      .first<{ count: number }>()

    return (result?.count || 0) > 0
  } catch (error) {
    console.error('Error checking scripts availability:', error)
    return false
  }
}
