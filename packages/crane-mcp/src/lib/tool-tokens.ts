import { logTokenUsage } from './token-tracker.js'

const STRUCTURED_TOOLS = new Set([
  'crane_sos',
  'crane_status',
  'crane_doc_audit',
  'crane_schedule',
  'crane_fleet_status',
  'crane_notes',
  'crane_ventures',
  'crane_context',
  'crane_worktree_doctor',
])

export function logToolTokens(
  toolName: string,
  inputArgs: unknown,
  result: { content: Array<{ type: string; text: string }> },
  startMs: number
): void {
  try {
    const outputText = result.content.map((c) => c.text).join('')
    const inputStr = JSON.stringify(inputArgs)
    const ratio = STRUCTURED_TOOLS.has(toolName) ? 3.5 : 4.0
    logTokenUsage({
      timestamp: new Date().toISOString(),
      tool: toolName,
      venture: process.env.CRANE_VENTURE_CODE,
      est_input_tokens: Math.ceil(inputStr.length / ratio),
      est_output_tokens: Math.ceil(outputText.length / ratio),
      output_chars: outputText.length,
      duration_ms: Date.now() - startMs,
    })
  } catch {
    // Token logging is best-effort
  }
}
