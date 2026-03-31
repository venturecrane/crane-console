/**
 * crane_handoff_update tool - Update status on an existing handoff
 *
 * Used to close out stale in_progress/blocked handoffs that were
 * superseded by subsequent sessions.
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'
import { getApiBase } from '../lib/config.js'

export const handoffUpdateInputSchema = z.object({
  handoff_id: z.string().describe('The handoff ID to update (e.g., ho_01HQXV4NK8...)'),
  status: z.enum(['done', 'in_progress', 'blocked']).describe('New status for the handoff'),
})

export type HandoffUpdateInput = z.infer<typeof handoffUpdateInputSchema>

export interface HandoffUpdateResult {
  success: boolean
  message: string
}

export async function executeHandoffUpdate(
  input: HandoffUpdateInput
): Promise<HandoffUpdateResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Cannot update handoff.',
    }
  }

  const api = new CraneApi(apiKey, getApiBase())

  try {
    const result = await api.updateHandoffStatus(input.handoff_id, input.status)

    return {
      success: true,
      message:
        `Handoff ${result.handoff.id} updated to "${input.status}".\n` +
        `From: ${result.handoff.from_agent}\n` +
        `Created: ${result.handoff.created_at}`,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error'
    return {
      success: false,
      message: `Failed to update handoff: ${detail}`,
    }
  }
}
