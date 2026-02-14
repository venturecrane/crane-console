/**
 * crane_doc tool - Fetch a specific documentation document by scope and name
 */

import { z } from 'zod'
import { CraneApi } from '../lib/crane-api.js'

export const docInputSchema = z.object({
  scope: z.string().describe('Document scope: "global" or venture code (vc, ke, sc, dfg, dc)'),
  doc_name: z
    .string()
    .describe('Document name (e.g., "vc-project-instructions.md", "team-workflow.md")'),
})

export type DocInput = z.infer<typeof docInputSchema>

export interface DocResult {
  success: boolean
  message: string
}

export async function executeDoc(input: DocInput): Promise<DocResult> {
  const apiKey = process.env.CRANE_CONTEXT_KEY
  if (!apiKey) {
    return {
      success: false,
      message: 'CRANE_CONTEXT_KEY not found. Start with: crane <venture>',
    }
  }

  const api = new CraneApi(apiKey)
  try {
    const doc = await api.getDoc(input.scope, input.doc_name)
    if (!doc) {
      return {
        success: false,
        message: `Document not found: ${input.scope}/${input.doc_name}`,
      }
    }
    let message = `## ${doc.title || doc.doc_name} (${doc.scope}, v${doc.version})\n\n`
    message += doc.content
    return { success: true, message }
  } catch (error) {
    return {
      success: false,
      message: `Failed to fetch document: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}
