/**
 * Crane Context Worker - Documentation Utilities
 *
 * Helper functions for fetching and managing operational documentation.
 */

import type { Env } from './types';
import { sha256 } from './utils';

// ============================================================================
// Types
// ============================================================================

export interface ContextDoc {
  scope: string;
  doc_name: string;
  content: string;
  content_hash: string;
  title: string | null;
  description: string | null;
  version: number;
}

export interface DocsResponse {
  docs: ContextDoc[];
  count: number;
  content_hash_combined: string; // Combined hash of all docs for cache validation
}

// ============================================================================
// Documentation Fetching
// ============================================================================

/**
 * Fetch all relevant documentation for a venture
 * Returns global docs + venture-specific docs
 *
 * @param db - D1 database binding
 * @param venture - Venture code (vc, dfg, sc)
 * @returns Documentation response with docs and combined hash
 */
export async function fetchDocsForVenture(
  db: D1Database,
  venture: string
): Promise<DocsResponse> {
  try {
    // Fetch global docs + venture-specific docs
    const result = await db
      .prepare(
        `SELECT scope, doc_name, content, content_hash, title, description, version
         FROM context_docs
         WHERE scope = 'global' OR scope = ?
         ORDER BY scope DESC, doc_name ASC`
      )
      .bind(venture)
      .all();

    const docs = result.results as unknown as ContextDoc[];

    // Calculate combined content hash for cache validation
    const combinedContent = docs.map(d => d.content_hash).join('|');
    const contentHashCombined = await sha256(combinedContent);

    return {
      docs,
      count: docs.length,
      content_hash_combined: contentHashCombined,
    };
  } catch (error) {
    console.error('Error fetching docs:', error);
    // Return empty response on error (graceful degradation)
    return {
      docs: [],
      count: 0,
      content_hash_combined: '',
    };
  }
}

/**
 * Fetch only document metadata (without content) for lightweight responses
 *
 * @param db - D1 database binding
 * @param venture - Venture code
 * @returns Metadata response
 */
export async function fetchDocsMetadata(
  db: D1Database,
  venture: string
): Promise<{
  docs: Array<{
    scope: string;
    doc_name: string;
    content_hash: string;
    title: string | null;
    version: number;
  }>;
  count: number;
}> {
  try {
    const result = await db
      .prepare(
        `SELECT scope, doc_name, content_hash, title, version
         FROM context_docs
         WHERE scope = 'global' OR scope = ?
         ORDER BY scope DESC, doc_name ASC`
      )
      .bind(venture)
      .all();

    return {
      docs: result.results as any,
      count: result.results.length,
    };
  } catch (error) {
    console.error('Error fetching docs metadata:', error);
    return {
      docs: [],
      count: 0,
    };
  }
}

/**
 * Check if documentation is available for a venture
 *
 * @param db - D1 database binding
 * @param venture - Venture code
 * @returns True if docs exist
 */
export async function hasDocsForVenture(
  db: D1Database,
  venture: string
): Promise<boolean> {
  try {
    const result = await db
      .prepare(
        `SELECT COUNT(*) as count
         FROM context_docs
         WHERE scope = 'global' OR scope = ?`
      )
      .bind(venture)
      .first<{ count: number }>();

    return (result?.count || 0) > 0;
  } catch (error) {
    console.error('Error checking docs availability:', error);
    return false;
  }
}

/**
 * Fetch a single document by scope and name
 *
 * @param db - D1 database binding
 * @param scope - Document scope (global or venture code)
 * @param docName - Document name
 * @returns Document or null if not found
 */
export async function fetchDoc(
  db: D1Database,
  scope: string,
  docName: string
): Promise<ContextDoc | null> {
  try {
    const result = await db
      .prepare(
        `SELECT scope, doc_name, content, content_hash, title, description, version
         FROM context_docs
         WHERE scope = ? AND doc_name = ?`
      )
      .bind(scope, docName)
      .first<ContextDoc>();

    return result || null;
  } catch (error) {
    console.error('Error fetching doc:', error);
    return null;
  }
}
