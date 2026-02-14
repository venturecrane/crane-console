/**
 * crane_ventures tool - List available ventures
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'
import { scanLocalRepos } from '../lib/repo-scanner.js'

export const venturesInputSchema = z.object({})

export type VenturesInput = z.infer<typeof venturesInputSchema>

export interface VentureInfo {
  code: string
  name: string
  org: string
  local_path: string | null
  installed: boolean
}

export interface VenturesResult {
  ventures: VentureInfo[]
  message: string
}

export async function executeVentures(_input: VenturesInput): Promise<VenturesResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      ventures: [],
      message: 'CRANE_CONTEXT_KEY not found. Cannot fetch ventures.',
    }
  }

  const api = new CraneApi(apiKey, getApiBase())

  try {
    const ventures = await api.getVentures()
    const localRepos = scanLocalRepos()

    const ventureInfos: VentureInfo[] = ventures.map((v) => {
      const repo = localRepos.find((r) => r.org.toLowerCase() === v.org.toLowerCase())
      return {
        code: v.code,
        name: v.name,
        org: v.org,
        local_path: repo?.path || null,
        installed: !!repo,
      }
    })

    const message = ventureInfos
      .map(
        (v) =>
          `${v.code} - ${v.name}\n` +
          `  Org: ${v.org}\n` +
          `  Status: ${v.installed ? `installed at ${v.local_path}` : 'not installed'}`
      )
      .join('\n\n')

    return {
      ventures: ventureInfos,
      message,
    }
  } catch (error) {
    return {
      ventures: [],
      message: 'Failed to fetch ventures. Check API connectivity.',
    }
  }
}
