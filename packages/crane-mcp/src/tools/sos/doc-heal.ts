/**
 * Self-healing documentation helpers for the SOS tool.
 */

import { createHash } from 'node:crypto'
import {
  type CraneApi,
  type DocAuditResult,
  type ScheduleBriefingResponse,
} from '../../lib/crane-api.js'
import { generateDoc } from '../../lib/doc-generator.js'
import { getAgentId } from '../../lib/agent-identity.js'

export interface HealingResults {
  generated: string[]
  failed: Array<{ doc: string; reason: string }>
}

interface HealItemsArgs {
  api: CraneApi
  docs: DocAuditResult['missing'] | DocAuditResult['stale']
  ventureCode: string
  ventureName: string
  repoPath: string
  results: HealingResults
}

async function healMissingItems(args: HealItemsArgs): Promise<void> {
  const { api, docs: missing, ventureCode, ventureName, repoPath, results } = args
  for (const doc of missing ?? []) {
    if (!doc.auto_generate) {
      results.failed.push({ doc: doc.doc_name, reason: 'manual generation required' })
      continue
    }

    try {
      const generated = generateDoc(
        doc.doc_name,
        ventureCode,
        ventureName,
        doc.generation_sources,
        repoPath
      )

      if (!generated) {
        results.failed.push({ doc: doc.doc_name, reason: 'insufficient sources' })
        continue
      }

      await api.uploadDoc({
        scope: ventureCode,
        doc_name: doc.doc_name,
        content: generated.content,
        title: generated.title,
        source_repo: `${ventureCode}-console`,
        uploaded_by: 'crane-mcp-autogen',
      })

      results.generated.push(doc.doc_name)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown error'
      results.failed.push({ doc: doc.doc_name, reason })
    }
  }
}

async function healStaleItems(args: HealItemsArgs): Promise<void> {
  const { api, docs: stale, ventureCode, ventureName, repoPath, results } = args
  for (const doc of stale ?? []) {
    if (!doc.auto_generate) continue

    try {
      const generated = generateDoc(
        doc.doc_name,
        ventureCode,
        ventureName,
        doc.generation_sources,
        repoPath
      )

      if (!generated) continue

      // Content-hash guard: skip upload if content unchanged
      const newHash = createHash('sha256').update(generated.content).digest('hex')
      const existing = await api.getDoc(ventureCode, doc.doc_name)
      if (existing && existing.content_hash === newHash) {
        await api.touchDoc(ventureCode, doc.doc_name)
        continue
      }

      await api.uploadDoc({
        scope: ventureCode,
        doc_name: doc.doc_name,
        content: generated.content,
        title: generated.title,
        source_repo: `${ventureCode}-console`,
        uploaded_by: 'crane-mcp-sos-heal',
      })

      results.generated.push(`${doc.doc_name} (refreshed)`)
    } catch {
      // Stale doc refresh failures are non-critical, don't report
    }
  }
}

export async function healMissingDocs(
  api: CraneApi,
  docAudit: DocAuditResult | undefined,
  ventureCode: string,
  ventureName: string,
  repoPath: string
): Promise<HealingResults> {
  const results: HealingResults = { generated: [], failed: [] }

  if (!docAudit || docAudit.status === 'complete') {
    return results
  }

  await healMissingItems({
    api,
    docs: docAudit.missing,
    ventureCode,
    ventureName,
    repoPath,
    results,
  })
  await healStaleItems({ api, docs: docAudit.stale, ventureCode, ventureName, repoPath, results })

  return results
}

/**
 * When the `context-refresh` cadence item is due or overdue, sweep all
 * ventures for missing/stale machine-derivable docs and regenerate them.
 * Idempotent (hash-gated in crane_doc_audit fix mode). Failures are
 * swallowed — a missed refresh should never break a session briefing.
 * On success, record completion so the cadence row flips to CURRENT.
 *
 * Keeps /context-refresh as the explicit Captain-interactive path for
 * executive-summary review and ventures.json drift (the parts that
 * can't safely auto-run).
 */
export async function maybeAutoRefreshContext(
  api: CraneApi,
  scheduleBriefing: ScheduleBriefingResponse
): Promise<void> {
  const item = scheduleBriefing.items.find((i) => i.name === 'context-refresh')
  if (!item || (item.status !== 'due' && item.status !== 'overdue')) {
    return
  }

  try {
    const { executeDocAudit } = await import('../doc-audit.js')
    const result = await executeDocAudit({ all: true, fix: true })

    await api
      .completeScheduleItem('context-refresh', {
        result: result.status === 'success' ? 'success' : 'warning',
        summary:
          'auto-regen via SOS (docs only; exec summaries + ventures.json via /context-refresh)',
        completed_by: getAgentId(),
      })
      .catch(() => {
        // Cadence write failure shouldn't break SOS.
      })
  } catch {
    // Audit or regen failed. Next SOS will retry when the cadence
    // item is still due/overdue.
  }
}
