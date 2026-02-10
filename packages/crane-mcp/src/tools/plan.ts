/**
 * crane_plan tool - Weekly plan reader (read-only)
 */

import { z } from 'zod'
import { readFileSync, statSync, existsSync } from 'fs'
import { join } from 'path'

export const planInputSchema = z.object({})

export type PlanInput = z.infer<typeof planInputSchema>

export interface WeeklyPlan {
  priority_venture?: string
  secondary_focus?: string
  target_issues: string[]
  capacity_notes?: string
  created?: string
  raw_content: string
}

export interface PlanResult {
  status: 'valid' | 'stale' | 'missing'
  plan?: WeeklyPlan
  age_days?: number
  file_path: string
  message: string
}

function parsePlan(content: string): WeeklyPlan {
  const plan: WeeklyPlan = {
    target_issues: [],
    raw_content: content,
  }

  // Parse Priority Venture
  const priorityMatch = content.match(/## Priority Venture\s*\n+([^\n#]+)/i)
  if (priorityMatch) {
    plan.priority_venture = priorityMatch[1].trim()
  }

  // Parse Secondary Focus
  const secondaryMatch = content.match(/## Secondary Focus\s*\n+([^\n#]+)/i)
  if (secondaryMatch) {
    plan.secondary_focus = secondaryMatch[1].trim()
  }

  // Parse Target Issues
  const issuesMatch = content.match(/## Target Issues\s*\n+([\s\S]*?)(?=\n## |$)/i)
  if (issuesMatch) {
    const issuesText = issuesMatch[1]
    const issues = issuesText
      .split('\n')
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter((line) => line.length > 0 && !line.toLowerCase().includes('none'))
    plan.target_issues = issues
  }

  // Parse Capacity Notes
  const capacityMatch = content.match(/## Capacity Notes\s*\n+([^\n#]+)/i)
  if (capacityMatch) {
    plan.capacity_notes = capacityMatch[1].trim()
  }

  // Parse Created timestamp
  const createdMatch = content.match(/## Created\s*\n+([^\n#]+)/i)
  if (createdMatch) {
    plan.created = createdMatch[1].trim()
  }

  return plan
}

export async function executePlan(_input: PlanInput): Promise<PlanResult> {
  const cwd = process.cwd()
  const planPath = join(cwd, 'docs', 'planning', 'WEEKLY_PLAN.md')

  // Check if file exists
  if (!existsSync(planPath)) {
    return {
      status: 'missing',
      file_path: planPath,
      message:
        '## Weekly Plan\n\n' +
        '**Status:** Missing\n\n' +
        'No weekly plan found at `docs/planning/WEEKLY_PLAN.md`.\n\n' +
        'Consider creating one to track priorities.',
    }
  }

  // Read file
  let content: string
  try {
    content = readFileSync(planPath, 'utf-8')
  } catch (error) {
    return {
      status: 'missing',
      file_path: planPath,
      message: '## Weekly Plan\n\n**Error:** Could not read plan file.',
    }
  }

  // Calculate age
  let ageDays: number
  try {
    const stat = statSync(planPath)
    const mtime = stat.mtime.getTime()
    const now = Date.now()
    ageDays = Math.floor((now - mtime) / (1000 * 60 * 60 * 24))
  } catch {
    ageDays = 999
  }

  // Determine status
  const isStale = ageDays >= 7
  const status = isStale ? 'stale' : 'valid'

  // Parse plan
  const plan = parsePlan(content)

  // Build message
  let message = '## Weekly Plan\n\n'
  message += `**Status:** ${status === 'valid' ? 'Valid' : 'Stale'} (${ageDays} days old)\n\n`

  if (plan.priority_venture) {
    message += `**Priority Venture:** ${plan.priority_venture}\n`
  }
  if (plan.secondary_focus) {
    message += `**Secondary Focus:** ${plan.secondary_focus}\n`
  }
  if (plan.target_issues.length > 0) {
    message += `**Target Issues:**\n${plan.target_issues.map((i) => `  - ${i}`).join('\n')}\n`
  }
  if (plan.capacity_notes) {
    message += `**Capacity:** ${plan.capacity_notes}\n`
  }

  if (isStale) {
    message += '\n⚠️ **Plan is stale.** Consider updating before starting work.'
  }

  return {
    status,
    plan,
    age_days: ageDays,
    file_path: planPath,
    message,
  }
}
