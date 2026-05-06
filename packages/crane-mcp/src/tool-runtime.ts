import type { ZodType } from 'zod'

import { logToolTokens } from './lib/tool-tokens.js'

export type ToolDefinition = {
  name: string
  description: string
  inputSchema: object
}

type TextResponse = {
  content: Array<{ type: 'text'; text: string }>
}

type ErrorResponse = TextResponse & { isError: true }

type Executor<TInput> = (input: TInput) => Promise<{ message: string }>

export type ToolEntry = {
  definition: ToolDefinition
  invoke: (args: unknown) => Promise<{ message: string }>
  logsTokens: boolean
}

export function makeEntry<TInput>(
  definition: ToolDefinition,
  schema: ZodType<TInput>,
  execute: Executor<TInput>,
  logsTokens: boolean
): ToolEntry {
  return {
    definition,
    invoke: async (args) => execute(schema.parse(args)),
    logsTokens,
  }
}

export function buildRegistry(entries: ToolEntry[]): Map<string, ToolEntry> {
  return new Map(entries.map((entry) => [entry.definition.name, entry]))
}

export async function dispatchTool(
  registry: Map<string, ToolEntry>,
  name: string,
  args: unknown,
  startMs: number
): Promise<TextResponse | ErrorResponse> {
  const entry = registry.get(name)
  if (!entry) {
    return errorResponse(`Unknown tool: ${name}`)
  }

  try {
    const result = await entry.invoke(args)
    const response: TextResponse = {
      content: [{ type: 'text', text: result.message }],
    }
    if (entry.logsTokens) {
      logToolTokens(name, args, response, startMs)
    }
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const failure = errorResponse(`Error executing ${name}: ${message}`)
    logToolTokens(name, args, failure, startMs)
    return failure
  }
}

function errorResponse(text: string): ErrorResponse {
  return {
    isError: true,
    content: [{ type: 'text', text }],
  }
}
