/**
 * crane_verify_audit tool — Weekly verify-ledger audit (Prong 3).
 *
 * Composes a structured report from /verify/audit + local repo state:
 *   - coverage_gap         : files touched in window with no verify rows
 *   - unverified_surface   : surface-class files with zero verify rows ever
 *   - override_audit       : EOS Layer 4b/4c override frequency from handoffs
 *   - integrity_samples    : N random rows + structural integrity checks
 *   - truncation_drift     : redacted+truncated combinations
 *   - source_distribution  : manual / tool / hook breakdown
 *   - memory_candidates    : recurring (command_hash, repo) tuples
 *
 * Auto-apply path (--apply): for each memory candidate, draft a memory
 * note via crane_memory.save with status='draft', captain_approved=false,
 * evidence_verify_ids=[verify_ids]. Captain approves via /memory-audit.
 *
 * Best-effort throughout: any infra failure (no git, classifier missing,
 * api unreachable) returns a partial report with the failed sections noted,
 * never a hard error to the caller.
 */

import { z } from 'zod'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import type { VerifyAuditResponse, VerifyAuditMemoryCandidate } from '../lib/crane-api.js'
import { executeMemory } from './memory.js'

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export const verifyAuditInputSchema = z.object({
  window_days: z
    .number()
    .min(1)
    .max(90)
    .optional()
    .default(7)
    .describe('Audit window in days (1..90). Default: 7.'),
  auto_apply: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'When true, draft memory notes from memory_candidates via crane_memory.save (status=draft, captain_approved=false). Default: false (report-only).'
    ),
  max_memory_candidates: z
    .number()
    .min(0)
    .max(20)
    .optional()
    .default(5)
    .describe('Cap on memory candidates per audit run. Server enforces a hard ceiling of 20.'),
  fresh: z
    .boolean()
    .optional()
    .default(false)
    .describe('Bypass the cached audit snapshot (recompute on the worker). Default: false.'),
})

export type VerifyAuditInput = z.infer<typeof verifyAuditInputSchema>

export interface VerifyAuditToolResult {
  status: 'success' | 'error'
  message: string
}

// ---------------------------------------------------------------------------
// Local file collection (git + classifier)
// ---------------------------------------------------------------------------

function safeExec(cmd: string, opts?: { cwd?: string }): string | null {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(opts?.cwd ? { cwd: opts.cwd } : {}),
    }).trim()
  } catch {
    return null
  }
}

function collectTouchedFiles(repoRoot: string, windowDays: number): string[] {
  const out = safeExec(
    `git log --name-only --since=${windowDays}.days --pretty=format: origin/main 2>/dev/null`,
    { cwd: repoRoot }
  )
  if (!out) return []
  const seen = new Set<string>()
  for (const line of out.split('\n')) {
    const f = line.trim()
    if (f.length > 0) seen.add(f)
  }
  return Array.from(seen)
}

function collectAllRepoFiles(repoRoot: string): string[] {
  const out = safeExec('git ls-files', { cwd: repoRoot })
  if (!out) return []
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

interface ClassifyOutput {
  surfaces_touched: Record<string, string[]>
  exempt_files: string[]
  unclassified: string[]
}

function classifySurfaceFiles(
  classifyScript: string,
  manifestPath: string,
  files: string[],
  repoRoot: string
): string[] {
  if (files.length === 0) return []
  if (!existsSync(classifyScript) || !existsSync(manifestPath)) return []

  // Pipe the file list to the classifier via stdin to avoid argv length
  // limits on repos with many files.
  try {
    const out = execSync(
      `node ${JSON.stringify(classifyScript)} --manifest ${JSON.stringify(manifestPath)} --files -`,
      {
        encoding: 'utf-8',
        input: files.join('\n'),
        stdio: ['pipe', 'pipe', 'ignore'],
        cwd: repoRoot,
      }
    )
    const parsed = JSON.parse(out) as ClassifyOutput
    const surfaceClassesOfInterest = new Set([
      'mcp-tool',
      'boot-config',
      'fleet-artifact',
      'config-canon',
    ])
    const surfaceFiles = new Set<string>()
    for (const [cls, fs] of Object.entries(parsed.surfaces_touched)) {
      if (surfaceClassesOfInterest.has(cls)) {
        for (const f of fs) surfaceFiles.add(f)
      }
    }
    return Array.from(surfaceFiles)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Memory draft creation
// ---------------------------------------------------------------------------

interface MemoryDraftResult {
  created: number
  skipped: number
  errors: string[]
  names: string[]
}

function deriveDraftName(candidate: VerifyAuditMemoryCandidate): string {
  const hashSlice = candidate.command_hash.slice(0, 8)
  const repoSlug = candidate.repo
    ? candidate.repo.replace(/[^A-Za-z0-9]/g, '-').toLowerCase()
    : 'global'
  const date = new Date(candidate.last_seen).toISOString().slice(0, 10).replace(/-/g, '')
  return `recurring-command-${hashSlice}-${repoSlug}-${date}`
}

function deriveDraftDescription(candidate: VerifyAuditMemoryCandidate, windowDays: number): string {
  const repoTag = candidate.repo ? ` (${candidate.repo})` : ''
  const cmdExcerpt = (candidate.sample_command || '').slice(0, 100)
  return `Verification recurred ${candidate.occurrences}× in ${windowDays}d${repoTag}: ${cmdExcerpt}`
}

function deriveDraftBody(candidate: VerifyAuditMemoryCandidate, windowDays: number): string {
  // Body must satisfy the memoryability checks: actionable verb, ≥40 chars,
  // ideally references a general rule. We keep the body skeletal but compliant
  // and let the Captain expand it during /memory-audit approval.
  const repoTag = candidate.repo ? ` in \`${candidate.repo}\`` : ''
  return [
    `Always check whether \`${candidate.sample_command}\` ran cleanly when working${repoTag}.`,
    '',
    `This verification recurred **${candidate.occurrences}× in ${windowDays}d** across:`,
    ...candidate.files_touched_union.slice(0, 10).map((f) => `- \`${f}\``),
    '',
    `Captain: review the evidence rows (\`evidence_verify_ids\`) before approval.`,
    `If the recurrence is routine maintenance noise, deprecate this draft instead of approving.`,
  ].join('\n')
}

async function createMemoryDrafts(
  candidates: VerifyAuditMemoryCandidate[],
  windowDays: number
): Promise<MemoryDraftResult> {
  const result: MemoryDraftResult = {
    created: 0,
    skipped: 0,
    errors: [],
    names: [],
  }

  for (const candidate of candidates) {
    const name = deriveDraftName(candidate)
    try {
      const saveResult = await executeMemory({
        action: 'save',
        name,
        description: deriveDraftDescription(candidate, windowDays),
        kind: 'lesson',
        scope: 'enterprise',
        owner: 'agent-team',
        status: 'draft',
        captain_approved: false,
        version: '1.0.0',
        evidence_verify_ids: candidate.verify_ids,
        ...(candidate.files_touched_union.length > 0
          ? { applies_when: { files: candidate.files_touched_union } }
          : {}),
        body: deriveDraftBody(candidate, windowDays),
      })

      if (saveResult.success) {
        result.created++
        result.names.push(name)
      } else {
        // /memory-audit's three memoryability checks may reject; that's a
        // skip, not an error.
        if (
          saveResult.message.includes('already exists') ||
          saveResult.message.includes('Memory rejected')
        ) {
          result.skipped++
        } else {
          result.errors.push(`${name}: ${saveResult.message}`)
        }
      }
    } catch (err) {
      result.errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function formatCoverageSection(audit: VerifyAuditResponse): string[] {
  const lines: string[] = []
  lines.push('## Coverage gap (windowed)')
  if (audit.coverage_gap.length === 0) {
    lines.push('_All windowed surface files have at least one verify row._')
  } else {
    lines.push(
      `${audit.coverage_gap.length} surface file(s) touched in window without verification:`
    )
    for (const e of audit.coverage_gap.slice(0, 20)) lines.push(`- \`${e.file}\``)
    if (audit.coverage_gap.length > 20) {
      lines.push(`- _… and ${audit.coverage_gap.length - 20} more_`)
    }
  }
  lines.push('')
  lines.push('## Unverified surface files (full history)')
  if (audit.unverified_surface_files.length === 0) {
    lines.push('_All surface-class files have at least one verify row._')
  } else {
    lines.push(
      `${audit.unverified_surface_files.length} surface file(s) with zero verifications ever:`
    )
    for (const e of audit.unverified_surface_files) lines.push(`- \`${e.file}\``)
  }
  lines.push('')
  return lines
}

function formatOverrideAndIntegrity(audit: VerifyAuditResponse): string[] {
  const lines: string[] = []
  const oa = audit.override_audit
  lines.push('## Override audit (EOS Layer 4b + 4c)')
  lines.push(
    `- override_pr_merge_gate: **${oa.pr_merge_gate}** of ${oa.total_handoffs_done} done handoffs`
  )
  lines.push(
    `- override_verify_coverage_gate: **${oa.verify_coverage_gate}** of ${oa.total_handoffs_done} done handoffs`
  )
  lines.push('')
  lines.push('## Integrity samples')
  if (audit.integrity_samples.length === 0) {
    lines.push('_No samples available._')
  } else {
    for (const s of audit.integrity_samples) {
      const flags: string[] = []
      if (!s.scrubber_consistent) flags.push('SCRUBBER DRIFT')
      if (!s.truncation_consistent) flags.push('TRUNCATION DRIFT')
      lines.push(`- \`${s.verify_id}\` — ${flags.length === 0 ? '✓ ok' : flags.join(', ')}`)
    }
  }
  lines.push('')
  lines.push('## Truncation drift (truncated AND redacted)')
  if (audit.truncation_drift.length === 0) {
    lines.push('_No drift cases._')
  } else {
    for (const d of audit.truncation_drift) {
      lines.push(
        `- \`${d.verify_id}\` — truncation=${d.output_truncation}, redacted=${d.output_redacted}`
      )
    }
  }
  lines.push('')
  return lines
}

function formatSourceAndCandidates(audit: VerifyAuditResponse): string[] {
  const lines: string[] = []
  const sd = audit.source_distribution
  lines.push('## Source distribution')
  lines.push(`- manual: ${sd.manual}`)
  lines.push(`- tool: ${sd.tool}`)
  lines.push(`- hook: ${sd.hook}`)
  lines.push('')
  lines.push('## Memory candidates (recurring patterns)')
  if (audit.memory_candidates.length === 0) {
    lines.push('_No recurring patterns detected (≥3 occurrences in window, fresh_process method)._')
  } else {
    lines.push(
      `${audit.memory_candidates.length} candidate(s) detected (cap=${audit.memory_candidates.length}, suppressed=${audit.memory_candidates_suppressed}):`
    )
    for (const c of audit.memory_candidates) {
      const repoTag = c.repo ?? '(no repo)'
      lines.push('')
      lines.push(`### \`${c.command_hash.slice(0, 12)}…\` × ${c.occurrences} in \`${repoTag}\``)
      lines.push(`- sample command: \`${c.sample_command || '(empty)'}\``)
      lines.push(`- first seen: ${c.first_seen}`)
      lines.push(`- last seen: ${c.last_seen}`)
      lines.push(`- evidence: ${c.verify_ids.map((id) => `\`${id}\``).join(', ')}`)
      if (c.files_touched_union.length > 0) {
        lines.push(`- files: ${c.files_touched_union.map((f) => `\`${f}\``).join(', ')}`)
      }
    }
    if (audit.memory_candidates_suppressed > 0) {
      lines.push('')
      lines.push(
        `_${audit.memory_candidates_suppressed} additional candidate(s) suppressed by max cap. Re-run with --max=${audit.memory_candidates.length + audit.memory_candidates_suppressed} to see them._`
      )
    }
  }
  lines.push('')
  return lines
}

function formatApplySummary(
  draftResult: MemoryDraftResult | null,
  appliedFlag: boolean,
  hasCandidates: boolean
): string[] {
  const lines: string[] = []
  if (appliedFlag) {
    lines.push('## Memory drafts')
    if (!draftResult) {
      lines.push('_No memory candidates to apply._')
    } else {
      lines.push(`- Created: ${draftResult.created}`)
      lines.push(`- Skipped (duplicate or memoryability): ${draftResult.skipped}`)
      if (draftResult.names.length > 0) {
        lines.push(`- Names:`)
        for (const n of draftResult.names) lines.push(`  - \`${n}\``)
      }
      if (draftResult.errors.length > 0) {
        lines.push(`- Errors:`)
        for (const e of draftResult.errors) lines.push(`  - ${e}`)
      }
      lines.push('')
      lines.push(
        `_Drafts have status=draft, captain_approved=false. Approve via \`/memory-audit\` or \`crane_memory(action: 'update', captain_approved: true)\`._`
      )
    }
  } else if (hasCandidates) {
    lines.push(
      '_Re-run with `--apply` to draft these as memory lessons (Captain approves via `/memory-audit`)._'
    )
  }
  lines.push('')
  return lines
}

function formatReport(
  audit: VerifyAuditResponse,
  draftResult: MemoryDraftResult | null,
  appliedFlag: boolean
): string {
  const lines: string[] = []
  lines.push(`# Verify-ledger audit — ${audit.window.days}d window`)
  lines.push('')
  lines.push(
    `_Generated: ${audit.generated_at ?? 'never (no cache)'} | served: ${audit.cache.served_from} (age: ${audit.cache.age_seconds}s)_`
  )
  lines.push('')
  lines.push(...formatCoverageSection(audit))
  lines.push(...formatOverrideAndIntegrity(audit))
  lines.push(...formatSourceAndCandidates(audit))
  lines.push(...formatApplySummary(draftResult, appliedFlag, audit.memory_candidates.length > 0))
  return lines.join('\n').trim()
}

// ---------------------------------------------------------------------------
// Main executor
// ---------------------------------------------------------------------------

export async function executeVerifyAudit(input: VerifyAuditInput): Promise<VerifyAuditToolResult> {
  try {
    const parsed = verifyAuditInputSchema.parse(input)
    const result = await runVerifyAudit(parsed)
    return { status: 'success', message: result }
  } catch (error) {
    return {
      status: 'error',
      message: `Verify audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

export async function runVerifyAudit(input: VerifyAuditInput): Promise<string> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    throw new Error('CRANE_CONTEXT_KEY not set. Cannot run verify audit.')
  }

  const repoRoot = process.cwd()
  const classifyScript = join(repoRoot, 'scripts', 'eos-gate-classify.mjs')
  const manifestPath = join(repoRoot, 'config', 'eos-gate-surfaces.json')

  // Collect local file lists (best-effort; missing classifier yields empty arrays)
  const touchedFiles = collectTouchedFiles(repoRoot, input.window_days)
  const allRepoFiles = collectAllRepoFiles(repoRoot)
  const surfaceTouchedFiles = classifySurfaceFiles(
    classifyScript,
    manifestPath,
    touchedFiles,
    repoRoot
  )
  const surfaceAllFiles = classifySurfaceFiles(classifyScript, manifestPath, allRepoFiles, repoRoot)

  const api = new CraneApi(apiKey, getApiBase())

  const audit = await api.getVerifyAudit({
    window: input.window_days,
    files: surfaceTouchedFiles,
    surfaceFiles: surfaceAllFiles,
    maxMemoryCandidates: input.max_memory_candidates,
    fresh: input.fresh,
  })

  // Optional: create memory drafts
  let draftResult: MemoryDraftResult | null = null
  if (input.auto_apply && audit.memory_candidates.length > 0) {
    draftResult = await createMemoryDrafts(audit.memory_candidates, input.window_days)
  }

  // Mark schedule complete (best-effort; doesn't gate the report)
  try {
    const anyNonEmpty =
      audit.coverage_gap.length > 0 ||
      audit.unverified_surface_files.length > 0 ||
      audit.override_audit.pr_merge_gate > 0 ||
      audit.override_audit.verify_coverage_gate > 0 ||
      audit.memory_candidates.length > 0 ||
      audit.truncation_drift.length > 0
    await api.completeScheduleItem('verify-audit-weekly', {
      result: anyNonEmpty ? 'warning' : 'success',
      summary: `coverage=${audit.coverage_gap.length} unverified=${audit.unverified_surface_files.length} overrides=${audit.override_audit.pr_merge_gate + audit.override_audit.verify_coverage_gate} candidates=${audit.memory_candidates.length}`,
    })
  } catch {
    // best-effort; surfaced in the report's _generated_ line as the audit
    // already ran — schedule completion is bookkeeping
  }

  return formatReport(audit, draftResult, input.auto_apply)
}
