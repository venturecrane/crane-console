/**
 * crane_sod tool - Start of Day / Session initialization
 * Enhanced to include P0 issues, weekly plan status, and active sessions
 */

import { z } from 'zod'
import { homedir, hostname } from 'node:os'
import { existsSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  CraneApi,
  Venture,
  ActiveSession,
  DocAuditResult,
  VentureDoc,
  HandoffRecord,
} from '../lib/crane-api.js'
import { setSession } from '../lib/session-state.js'
import { getApiBase } from '../lib/config.js'
import {
  getCurrentRepoInfo,
  findVentureByOrg,
  findRepoForVenture,
  scanLocalRepos,
} from '../lib/repo-scanner.js'
import { getP0Issues, GitHubIssue } from '../lib/github.js'
import { generateDoc } from '../lib/doc-generator.js'

export const sodInputSchema = z.object({
  venture: z.string().optional().describe('Venture code to work on (skips selection if provided)'),
})

export type SodInput = z.infer<typeof sodInputSchema>

export interface WeeklyPlanStatus {
  status: 'valid' | 'stale' | 'missing'
  priority_venture?: string
  age_days?: number
}

export interface PortfolioReviewStatus {
  status: 'current' | 'due' | 'overdue' | 'missing'
  age_days?: number
  last_reviewed?: string
}

export interface SodResult {
  status: 'valid' | 'needs_navigation' | 'needs_clone' | 'select_venture' | 'error'
  current_dir: string
  context?: {
    venture: string
    venture_name: string
    repo: string
    branch: string
    session_id: string
  }
  last_handoff?: {
    summary: string
    from_agent: string
    status: string
    created_at: string
  }
  recent_handoffs?: HandoffRecord[]
  p0_issues: GitHubIssue[]
  weekly_plan: WeeklyPlanStatus
  portfolio_review?: PortfolioReviewStatus | null
  active_sessions: ActiveSession[]
  documentation?: VentureDoc[]
  // Legacy fields for backwards compatibility
  detected_venture?: string
  detected_repo?: string
  target_venture?: string
  target_path?: string
  clone_command?: string
  nav_command?: string
  session_id?: string
  ventures?: Array<{ code: string; name: string; installed: boolean }>
  message: string
}

function getApiKey(): string | null {
  if (process.env.CRANE_CONTEXT_KEY) {
    return process.env.CRANE_CONTEXT_KEY
  }
  return null
}

function getAgentName(): string {
  const host = process.env.HOSTNAME || hostname() || 'unknown'
  return `crane-mcp-${host}`
}

export function getPortfolioReviewStatus(ventureCode: string): PortfolioReviewStatus | null {
  if (ventureCode !== 'vc') return null

  const portfolioPath = join(process.cwd(), 'config', 'ventures.json')

  if (!existsSync(portfolioPath)) {
    return { status: 'missing' }
  }

  try {
    const content = readFileSync(portfolioPath, 'utf-8')
    const data = JSON.parse(content)
    const lastReview = data.lastPortfolioReview
    const cadenceDays = data.portfolioReviewCadenceDays || 7

    if (!lastReview) {
      return { status: 'missing' }
    }

    const [yr, mo, dy] = lastReview.split('-').map(Number)
    const reviewMs = Date.UTC(yr, mo - 1, dy)
    const now = new Date()
    const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    const ageDays = Math.round((todayMs - reviewMs) / (1000 * 60 * 60 * 24))

    if (ageDays > cadenceDays * 2) {
      return { status: 'overdue', age_days: ageDays, last_reviewed: lastReview }
    } else if (ageDays >= cadenceDays) {
      return { status: 'due', age_days: ageDays, last_reviewed: lastReview }
    } else {
      return { status: 'current', age_days: ageDays, last_reviewed: lastReview }
    }
  } catch {
    return { status: 'missing' }
  }
}

function getWeeklyPlanStatus(): WeeklyPlanStatus {
  const cwd = process.cwd()
  const planPath = join(cwd, 'docs', 'planning', 'WEEKLY_PLAN.md')

  if (!existsSync(planPath)) {
    return { status: 'missing' }
  }

  try {
    const stat = statSync(planPath)
    const mtime = stat.mtime.getTime()
    const now = Date.now()
    const ageDays = Math.floor((now - mtime) / (1000 * 60 * 60 * 24))
    const isStale = ageDays >= 7

    // Try to extract priority venture from file
    let priorityVenture: string | undefined
    try {
      const { readFileSync } = require('fs')
      const content = readFileSync(planPath, 'utf-8')
      const match = content.match(/## Priority Venture\s*\n+([^\n#]+)/i)
      if (match) {
        priorityVenture = match[1].trim()
      }
    } catch {
      // Ignore read errors
    }

    return {
      status: isStale ? 'stale' : 'valid',
      priority_venture: priorityVenture,
      age_days: ageDays,
    }
  } catch {
    return { status: 'missing' }
  }
}

export async function executeSod(input: SodInput): Promise<SodResult> {
  const cwd = process.cwd()
  const defaultResult: Partial<SodResult> = {
    current_dir: cwd,
    p0_issues: [],
    weekly_plan: { status: 'missing' },
    active_sessions: [],
    documentation: undefined,
  }

  // Check for API key
  const apiKey = getApiKey()
  if (!apiKey) {
    return {
      ...defaultResult,
      status: 'error',
      message: 'CRANE_CONTEXT_KEY not found.\n\n' + 'Launch with: crane vc',
    } as SodResult
  }

  const api = new CraneApi(apiKey, getApiBase())

  // Fetch ventures
  let ventures: Venture[]
  try {
    ventures = await api.getVentures()
  } catch (error) {
    return {
      ...defaultResult,
      status: 'error',
      message: 'Failed to connect to Crane API. Check your network connection.',
    } as SodResult
  }

  // Check current directory
  const currentRepo = getCurrentRepoInfo()

  if (currentRepo) {
    // We're in a git repo - check if it's a known venture
    const venture = findVentureByOrg(ventures, currentRepo.org)

    if (venture) {
      // Valid venture repo - start session
      try {
        const fullRepo = `${currentRepo.org}/${currentRepo.repo}`
        const session = await api.startSession({
          venture: venture.code,
          repo: fullRepo,
          agent: getAgentName(),
        })

        // Store session state for handoff tool
        setSession(session.session.id, venture.code, fullRepo)

        // Query recent handoffs from D1
        let recentHandoffs: HandoffRecord[] = []
        try {
          const handoffResult = await api.queryHandoffs({
            venture: venture.code,
            repo: fullRepo,
            track: 1,
            limit: 10,
          })
          // Filter to last 24 hours
          const cutoff = Date.now() - 24 * 60 * 60 * 1000
          recentHandoffs = handoffResult.handoffs.filter(
            (h) => new Date(h.created_at).getTime() > cutoff
          )
        } catch {
          // Fall back to single last_handoff from SOD response
        }

        // Get P0 issues
        const p0Result = getP0Issues(currentRepo.org, currentRepo.repo)
        const p0Issues = p0Result.success ? p0Result.issues || [] : []

        // Get weekly plan status
        const weeklyPlan = getWeeklyPlanStatus()

        // Get portfolio review status (vc only)
        const portfolioReview = getPortfolioReviewStatus(venture.code)

        // Get active sessions (excluding self)
        const activeSessions = (session.active_sessions || []).filter(
          (s) => s.agent !== getAgentName()
        )

        // Self-healing: generate missing docs if audit found gaps
        const docAudit = session.doc_audit
        const healingResults = await healMissingDocs(api, docAudit, venture.code, venture.name, cwd)

        // Build message
        let message = '## Session Context\n\n'
        message += `| Field | Value |\n|-------|-------|\n`
        message += `| Venture | ${venture.name} (${venture.code}) |\n`
        message += `| Repo | ${fullRepo} |\n`
        message += `| Branch | ${currentRepo.branch} |\n`
        message += `| Session | ${session.session.id} |\n\n`

        // Recent handoffs
        if (recentHandoffs.length > 0) {
          message += `### Recent Handoffs (last 24h)\n`
          for (const h of recentHandoffs) {
            const time = new Date(h.created_at).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
            message += `- **${time}** ${h.from_agent} [${h.status_label}]: ${h.summary}\n`
          }
          message += '\n'
        } else if (session.last_handoff) {
          // Fallback to single last_handoff from SOD response
          message += `### Last Handoff\n`
          message += `**From:** ${session.last_handoff.from_agent}\n`
          message += `**Status:** ${session.last_handoff.status_label}\n`
          message += `**Summary:** ${session.last_handoff.summary}\n\n`
        }

        // P0 issues
        if (p0Issues.length > 0) {
          message += `### 🚨 P0 Issues (Drop Everything)\n`
          for (const issue of p0Issues) {
            message += `- #${issue.number}: ${issue.title}\n`
          }
          message += `\n**⚠️ P0 issues require immediate attention**\n\n`
        }

        // Weekly plan
        message += `### Weekly Plan\n`
        if (weeklyPlan.status === 'valid') {
          message += `✓ Valid (${weeklyPlan.age_days} days old)`
          if (weeklyPlan.priority_venture) {
            message += ` - Priority: ${weeklyPlan.priority_venture}`
          }
          message += '\n\n'
        } else if (weeklyPlan.status === 'stale') {
          message += `⚠️ Stale (${weeklyPlan.age_days} days old) - Consider updating\n\n`
        } else {
          message += `⚠️ Missing - Set priorities before starting work\n\n`
        }

        // Portfolio review (vc only)
        if (portfolioReview) {
          message += `### Portfolio Review\n`
          if (portfolioReview.status === 'current') {
            message += `Current - last reviewed ${portfolioReview.age_days} days ago\n\n`
          } else if (portfolioReview.status === 'due') {
            message += `Due - last reviewed ${portfolioReview.age_days} days ago. Run /portfolio-review to update.\n\n`
          } else if (portfolioReview.status === 'overdue') {
            message += `Overdue - last reviewed ${portfolioReview.age_days} days ago. Run /portfolio-review to update.\n\n`
          } else {
            message += `Missing - no portfolio review data found. Run /portfolio-review to initialize.\n\n`
          }
        }

        // Active sessions
        if (activeSessions.length > 0) {
          message += `### ⚠️ Other Active Sessions\n`
          for (const s of activeSessions) {
            message += `- ${s.agent} on ${s.repo}`
            if (s.issue_number) {
              message += ` (Issue #${s.issue_number})`
            }
            message += '\n'
          }
          message += '\n'
        }

        // Doc index (lightweight, from doc_index response)
        const MAX_DOC_INDEX_ROWS = 30
        const docIndex = session.doc_index?.docs || []
        if (docIndex.length > 0) {
          const displayDocs = docIndex.slice(0, MAX_DOC_INDEX_ROWS)
          message += `### Available Documentation (${docIndex.length} docs)\n`
          message += `Fetch any document with \`crane_doc(scope, doc_name)\`.\n\n`
          message += `| Scope | Document | Version |\n|-------|----------|--------|\n`
          for (const doc of displayDocs) {
            message += `| ${doc.scope} | ${doc.doc_name} | v${doc.version} |\n`
          }
          if (docIndex.length > MAX_DOC_INDEX_ROWS) {
            message += `| ... | *${docIndex.length - MAX_DOC_INDEX_ROWS} more - use \`crane_doc_audit\` to see all* | |\n`
          }
          message += '\n'
        }

        // Enterprise context from notes (budget-based allocation)
        const EC_BUDGET = 12_000
        const MAX_EC_NOTES = 10
        const allNotes = (session.enterprise_context?.notes || []).slice(0, MAX_EC_NOTES)
        // Current-venture notes first, then other ventures, then global; freshest first within tiers
        const ventureCode = venture.code
        const ecNotes = [...allNotes].sort((a, b) => {
          const aRank = a.venture === ventureCode ? 0 : a.venture ? 1 : 2
          const bRank = b.venture === ventureCode ? 0 : b.venture ? 1 : 2
          if (aRank !== bRank) return aRank - bRank
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        })

        if (ecNotes.length > 0) {
          message += `### Enterprise Context\n`
          let budgetRemaining = EC_BUDGET
          let notesIncluded = 0

          for (const note of ecNotes) {
            const scope = note.venture || 'global'
            const header = `\n#### ${note.title || '(untitled)'} (${scope})\n\n`
            const headerCost = header.length + 1 // +1 for trailing \n

            if (note.content.length + headerCost <= budgetRemaining) {
              // Full note fits
              message += header + note.content + '\n'
              budgetRemaining -= note.content.length + headerCost
              notesIncluded++
            } else if (budgetRemaining >= 500) {
              // Partial fit - fill remaining budget
              const contentBudget = budgetRemaining - headerCost
              message += header + note.content.slice(0, Math.max(0, contentBudget)) + '\n\n'
              message += `*[Truncated - full content via \`crane_notes(q: "${note.title}")\`]*\n`
              notesIncluded++
              break
            } else {
              break
            }
          }

          // Indicate any omitted notes
          const notesOmitted = ecNotes.length - notesIncluded
          if (notesOmitted > 0) {
            message += `\n*${notesOmitted} more note(s) available via \`crane_notes(tag: "executive-summary")\`*\n`
          }
          message += '\n'
        }

        // Doc audit results
        if (healingResults.generated.length > 0) {
          message += `### Documentation (self-healed)\n`
          for (const doc of healingResults.generated) {
            message += `- Generated: ${doc}\n`
          }
          message += '\n'
        }
        if (healingResults.failed.length > 0) {
          message += `### Missing Documentation (auto-generation failed)\n`
          for (const { doc, reason } of healingResults.failed) {
            message += `- ${doc}: ${reason}\n`
          }
          message += '\n'
        }
        if (docAudit && docAudit.stale.length > 0) {
          message += `### Stale Documentation\n`
          for (const doc of docAudit.stale) {
            message += `- ${doc.doc_name} (${doc.days_since_update} days old, threshold: ${doc.staleness_threshold_days})\n`
          }
          message += '\n'
        }

        message += `**What would you like to focus on?**`

        if (message.length > 50_000) {
          message += `\n\n⚠️ *SOD message is ${Math.round(message.length / 1024)}KB - investigate size regression*`
        }

        return {
          status: 'valid',
          current_dir: cwd,
          context: {
            venture: venture.code,
            venture_name: venture.name,
            repo: fullRepo,
            branch: currentRepo.branch,
            session_id: session.session.id,
          },
          last_handoff: session.last_handoff
            ? {
                summary: session.last_handoff.summary,
                from_agent: session.last_handoff.from_agent,
                status: session.last_handoff.status_label,
                created_at: session.last_handoff.created_at,
              }
            : undefined,
          p0_issues: p0Issues,
          weekly_plan: weeklyPlan,
          portfolio_review: portfolioReview,
          active_sessions: activeSessions,
          recent_handoffs: recentHandoffs.length > 0 ? recentHandoffs : undefined,
          documentation: undefined,
          // Legacy fields
          detected_venture: venture.code,
          detected_repo: fullRepo,
          session_id: session.session.id,
          message,
        }
      } catch (error) {
        return {
          ...defaultResult,
          status: 'error',
          detected_venture: venture.code,
          message: 'Failed to start session. Check API connectivity.',
        } as SodResult
      }
    }
  }

  // Not in a valid venture repo
  // If venture code was provided, guide to that venture
  if (input.venture) {
    const targetVenture = ventures.find((v) => v.code === input.venture)

    if (!targetVenture) {
      return {
        ...defaultResult,
        status: 'error',
        message:
          `Unknown venture: ${input.venture}\n\n` +
          `Available: ${ventures.map((v) => v.code).join(', ')}`,
      } as SodResult
    }

    // Check if we have this venture's repo locally
    const localRepo = findRepoForVenture(targetVenture)

    if (localRepo) {
      return {
        ...defaultResult,
        status: 'needs_navigation',
        target_venture: targetVenture.code,
        target_path: localRepo.path,
        nav_command: `cd ${localRepo.path} && claude`,
        message:
          `To work on ${targetVenture.name}:\n\n` +
          `  cd ${localRepo.path} && claude\n\n` +
          `Then run crane_sod again.`,
      } as SodResult
    } else {
      // Need to clone
      const suggestedPath = `${homedir()}/dev/${targetVenture.code}-console`
      const cloneUrl = `git@github.com:${targetVenture.org}/${targetVenture.code}-console.git`

      return {
        ...defaultResult,
        status: 'needs_clone',
        target_venture: targetVenture.code,
        target_path: suggestedPath,
        clone_command: `git clone ${cloneUrl} ${suggestedPath}`,
        nav_command: `cd ${suggestedPath} && claude`,
        message:
          `Repo for ${targetVenture.name} not found locally.\n\n` +
          `Clone it (adjust repo name if needed):\n` +
          `  git clone ${cloneUrl} ${suggestedPath}\n\n` +
          `Then:\n` +
          `  cd ${suggestedPath} && claude`,
      } as SodResult
    }
  }

  // No venture specified - show options
  const localRepos = scanLocalRepos()
  const ventureList = ventures.map((v) => {
    const repo = localRepos.find((r) => r.org.toLowerCase() === v.org.toLowerCase())
    return {
      code: v.code,
      name: v.name,
      installed: !!repo,
      path: repo?.path,
    }
  })

  return {
    ...defaultResult,
    status: 'select_venture',
    ventures: ventureList.map((v) => ({
      code: v.code,
      name: v.name,
      installed: v.installed,
    })),
    message:
      `Not in a venture repo.\n\n` +
      `Current directory: ${cwd}\n` +
      (currentRepo
        ? `Git remote: ${currentRepo.org}/${currentRepo.repo} (not a known venture)\n`
        : `Not a git repository.\n`) +
      `\nAvailable ventures:\n` +
      ventureList
        .map((v) => `  ${v.code} - ${v.name} ${v.installed ? `[${v.path}]` : '[not installed]'}`)
        .join('\n') +
      `\n\nCall crane_sod with venture parameter to continue.\n` +
      `Example: crane_sod(venture: "vc")`,
  } as SodResult
}

// ============================================================================
// Self-Healing Documentation
// ============================================================================

interface HealingResults {
  generated: string[]
  failed: Array<{ doc: string; reason: string }>
}

async function healMissingDocs(
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

  const missing = docAudit.missing || []
  for (const doc of missing) {
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

  // Also regenerate stale docs
  const stale = docAudit.stale || []
  for (const doc of stale) {
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

      await api.uploadDoc({
        scope: ventureCode,
        doc_name: doc.doc_name,
        content: generated.content,
        title: generated.title,
        source_repo: `${ventureCode}-console`,
        uploaded_by: 'crane-mcp-autogen',
      })

      results.generated.push(`${doc.doc_name} (refreshed)`)
    } catch {
      // Stale doc refresh failures are non-critical, don't report
    }
  }

  return results
}
