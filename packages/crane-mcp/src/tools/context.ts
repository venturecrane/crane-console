/**
 * crane_context tool - Get current session context
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getCurrentRepoInfo, findVentureByOrg } from '../lib/repo-scanner.js'

export const contextInputSchema = z.object({})

export type ContextInput = z.infer<typeof contextInputSchema>

export interface ContextResult {
  valid: boolean
  cwd: string
  git_repo?: string
  git_branch?: string
  venture?: string
  venture_name?: string
  api_key_present: boolean
  message: string
}

export async function executeContext(_input: ContextInput): Promise<ContextResult> {
  const cwd = process.cwd()
  const apiKey = process.env.CRANE_CONTEXT_KEY
  const repoInfo = getCurrentRepoInfo()

  if (!apiKey) {
    return {
      valid: false,
      cwd,
      git_repo: repoInfo ? `${repoInfo.org}/${repoInfo.repo}` : undefined,
      git_branch: repoInfo?.branch,
      api_key_present: false,
      message: 'CRANE_CONTEXT_KEY not set. Context cannot be validated.',
    }
  }

  if (!repoInfo) {
    return {
      valid: false,
      cwd,
      api_key_present: true,
      message: `Not in a git repository.\nCurrent directory: ${cwd}`,
    }
  }

  const fullRepo = `${repoInfo.org}/${repoInfo.repo}`

  // Try to match repo to a venture
  const api = new CraneApi(apiKey)
  try {
    const ventures = await api.getVentures()
    const venture = findVentureByOrg(ventures, repoInfo.org)

    if (venture) {
      return {
        valid: true,
        cwd,
        git_repo: fullRepo,
        git_branch: repoInfo.branch,
        venture: venture.code,
        venture_name: venture.name,
        api_key_present: true,
        message:
          `Venture: ${venture.name} (${venture.code})\n` +
          `Repo: ${fullRepo}\n` +
          `Branch: ${repoInfo.branch}\n` +
          `Directory: ${cwd}`,
      }
    } else {
      return {
        valid: false,
        cwd,
        git_repo: fullRepo,
        git_branch: repoInfo.branch,
        api_key_present: true,
        message:
          `Unknown org: ${repoInfo.org}\n` + `This repo is not associated with any known venture.`,
      }
    }
  } catch (error) {
    return {
      valid: false,
      cwd,
      git_repo: fullRepo,
      git_branch: repoInfo.branch,
      api_key_present: true,
      message: 'Failed to validate context. Check API connectivity.',
    }
  }
}
