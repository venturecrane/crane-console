export type TextContent = { type: 'text'; text: string }
export type ToolResult = { content: TextContent[]; isError?: true }

export function staleWarning(stale: boolean): string {
  return stale ? '\n\n[stale data - crane-context may be unreachable]' : ''
}

export function textResult(text: string, isError?: true): ToolResult {
  const result: ToolResult = { content: [{ type: 'text' as const, text }] }
  if (isError) result.isError = isError
  return result
}
