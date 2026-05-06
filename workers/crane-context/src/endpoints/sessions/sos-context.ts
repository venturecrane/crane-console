/**
 * SOS context-fetch helpers.
 *
 * All of the optional parallel lookups performed during /sos:
 * docs, scripts, doc-audit, enterprise context, knowledge-base, last handoff.
 * Each fetch is non-fatal – errors are logged and the field is omitted.
 */

import { fetchDocsForVenture, fetchDocsMetadata } from '../../docs'
import { fetchScriptsForVenture, fetchScriptsMetadata } from '../../scripts'
import { fetchEnterpriseContext, listNotes } from '../../notes'
import { runDocAudit } from '../../audit'
import type { DocAuditResult } from '../../audit'
import { getLatestHandoff } from '../../handoffs'
import { KNOWLEDGE_BASE_TAGS } from '../../constants'

// ============================================================================
// Return types
// ============================================================================

export interface DocsPayload {
  docs: unknown[]
  count: number
  content_hash: string
}

export interface DocIndexPayload {
  docs: unknown[]
  count: number
}

export interface ScriptsPayload {
  scripts: unknown[]
  count: number
  content_hash: string
}

export interface ScriptIndexPayload {
  scripts: unknown[]
  count: number
}

export interface EnterpriseContextPayload {
  notes: Awaited<ReturnType<typeof fetchEnterpriseContext>>
  count: number
}

export interface KnowledgeBaseEntry {
  id: string
  title: string | null
  tags: string | null
  venture: string | null
  updated_at: string
}

export interface KnowledgeBasePayload {
  notes: KnowledgeBaseEntry[]
  count: number
}

export interface SosContextResult {
  docsResponse: Awaited<ReturnType<typeof fetchDocsForVenture>> | null
  docsIndexResponse: Awaited<ReturnType<typeof fetchDocsMetadata>> | null
  scriptsResponse: Awaited<ReturnType<typeof fetchScriptsForVenture>> | null
  scriptsIndexResponse: Awaited<ReturnType<typeof fetchScriptsMetadata>> | null
  docAudit: DocAuditResult | null
  enterpriseContext: EnterpriseContextPayload | null
  knowledgeBase: KnowledgeBasePayload | null
  lastHandoff: Awaited<ReturnType<typeof getLatestHandoff>>
}

// ============================================================================
// Helpers
// ============================================================================

async function fetchDocs(
  db: D1Database,
  venture: string,
  format: 'full' | 'index',
  correlationId: string
): Promise<{
  docsResponse: Awaited<ReturnType<typeof fetchDocsForVenture>> | null
  docsIndexResponse: Awaited<ReturnType<typeof fetchDocsMetadata>> | null
}> {
  try {
    if (format === 'full') {
      return { docsResponse: await fetchDocsForVenture(db, venture), docsIndexResponse: null }
    }
    return { docsResponse: null, docsIndexResponse: await fetchDocsMetadata(db, venture) }
  } catch (error) {
    console.error('Failed to fetch documentation', {
      correlationId,
      venture,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { docsResponse: null, docsIndexResponse: null }
  }
}

async function fetchScripts(
  db: D1Database,
  venture: string,
  format: 'full' | 'index',
  correlationId: string
): Promise<{
  scriptsResponse: Awaited<ReturnType<typeof fetchScriptsForVenture>> | null
  scriptsIndexResponse: Awaited<ReturnType<typeof fetchScriptsMetadata>> | null
}> {
  try {
    if (format === 'full') {
      return {
        scriptsResponse: await fetchScriptsForVenture(db, venture),
        scriptsIndexResponse: null,
      }
    }
    return { scriptsResponse: null, scriptsIndexResponse: await fetchScriptsMetadata(db, venture) }
  } catch (error) {
    console.error('Failed to fetch scripts', {
      correlationId,
      venture,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return { scriptsResponse: null, scriptsIndexResponse: null }
  }
}

async function fetchAudit(
  db: D1Database,
  venture: string,
  correlationId: string
): Promise<DocAuditResult | null> {
  try {
    return await runDocAudit(db, venture)
  } catch (error) {
    console.error('Failed to run doc audit', {
      correlationId,
      venture,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

async function fetchEC(
  db: D1Database,
  venture: string,
  correlationId: string
): Promise<EnterpriseContextPayload | null> {
  try {
    const ecNotes = await fetchEnterpriseContext(db, venture, { limit: 10 })
    if (ecNotes.length > 0) {
      return { notes: ecNotes, count: ecNotes.length }
    }
    return null
  } catch (error) {
    console.error('Failed to fetch enterprise context', {
      correlationId,
      venture,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

async function fetchKB(
  db: D1Database,
  venture: string,
  correlationId: string
): Promise<KnowledgeBasePayload | null> {
  try {
    const kbResult = await listNotes(db, {
      tags: [...KNOWLEDGE_BASE_TAGS],
      venture,
      include_global: true,
      metadata_only: true,
      limit: 30,
    })
    if (kbResult.notes.length > 0) {
      return {
        notes: kbResult.notes.map((n) => ({
          id: n.id,
          title: n.title,
          tags: n.tags,
          venture: n.venture,
          updated_at: n.updated_at,
        })),
        count: kbResult.notes.length,
      }
    }
    return null
  } catch (error) {
    console.error('Failed to fetch knowledge base', {
      correlationId,
      venture,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

async function fetchHandoff(
  db: D1Database,
  venture: string,
  repo: string,
  track: number | undefined,
  correlationId: string
): Promise<Awaited<ReturnType<typeof getLatestHandoff>>> {
  try {
    return await getLatestHandoff(db, { venture, repo, track })
  } catch (error) {
    console.error('Failed to fetch last handoff', {
      correlationId,
      venture,
      repo,
      track,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return null
  }
}

// ============================================================================
// Public entry point
// ============================================================================

export async function fetchSosContext(
  db: D1Database,
  opts: {
    venture: string
    repo: string
    track: number | undefined
    includeDocs: boolean
    docsFormat: 'full' | 'index'
    includeScripts: boolean
    scriptsFormat: 'full' | 'index'
    correlationId: string
  }
): Promise<SosContextResult> {
  const {
    venture,
    repo,
    track,
    includeDocs,
    docsFormat,
    includeScripts,
    scriptsFormat,
    correlationId,
  } = opts

  const [docsResult, scriptsResult, docAudit, enterpriseContext, knowledgeBase, lastHandoff] =
    await Promise.all([
      includeDocs
        ? fetchDocs(db, venture, docsFormat, correlationId)
        : Promise.resolve({ docsResponse: null, docsIndexResponse: null }),
      includeScripts
        ? fetchScripts(db, venture, scriptsFormat, correlationId)
        : Promise.resolve({ scriptsResponse: null, scriptsIndexResponse: null }),
      fetchAudit(db, venture, correlationId),
      fetchEC(db, venture, correlationId),
      fetchKB(db, venture, correlationId),
      fetchHandoff(db, venture, repo, track, correlationId),
    ])

  return {
    docsResponse: docsResult.docsResponse,
    docsIndexResponse: docsResult.docsIndexResponse,
    scriptsResponse: scriptsResult.scriptsResponse,
    scriptsIndexResponse: scriptsResult.scriptsIndexResponse,
    docAudit,
    enterpriseContext,
    knowledgeBase,
    lastHandoff,
  }
}
