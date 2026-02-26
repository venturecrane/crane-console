/**
 * Token usage estimation and logging for crane-mcp tools.
 *
 * Estimates token counts from tool input/output sizes and logs to
 * ~/.crane/token-usage.jsonl for analysis.
 *
 * Token estimation uses chars/3.5 for structured data (markdown tables, JSON, code)
 * and chars/4 for prose. These ratios should be calibrated against a real tokenizer
 * on 50 real tool responses (Phase 2.1 calibration step).
 */

import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// Token estimation ratios (chars per token)
// Structured data (markdown tables, JSON, code) tokenizes more densely
const CHARS_PER_TOKEN_STRUCTURED = 3.5
const CHARS_PER_TOKEN_PROSE = 4.0

// Tools that produce primarily structured output
const STRUCTURED_TOOLS = new Set([
  'crane_sod',
  'crane_status',
  'crane_doc_audit',
  'crane_schedule',
  'crane_fleet_status',
  'crane_notes',
  'crane_ventures',
  'crane_context',
])

interface TokenUsageEntry {
  timestamp: string
  tool: string
  venture: string | undefined
  est_input_tokens: number
  est_output_tokens: number
  output_chars: number
  duration_ms: number
}

const LOG_DIR = join(homedir(), '.crane')
const LOG_FILE = join(LOG_DIR, 'token-usage.jsonl')

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
}

function estimateTokens(text: string, tool: string): number {
  if (!text) return 0
  const ratio = STRUCTURED_TOOLS.has(tool) ? CHARS_PER_TOKEN_STRUCTURED : CHARS_PER_TOKEN_PROSE
  return Math.ceil(text.length / ratio)
}

export function logTokenUsage(entry: TokenUsageEntry): void {
  try {
    ensureLogDir()
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n')
  } catch {
    // Token logging is best-effort - never block tool execution
  }
}

/**
 * Wrap a tool handler to estimate and log token usage.
 */
export function wrapToolHandler<T>(
  toolName: string,
  handler: (args: T) => Promise<{ content: Array<{ type: string; text: string }> }>
): (args: T) => Promise<{ content: Array<{ type: string; text: string }> }> {
  return async (args: T) => {
    const inputStr = JSON.stringify(args)
    const startMs = Date.now()

    const result = await handler(args)

    const durationMs = Date.now() - startMs
    const outputText = result.content.map((c) => c.text).join('')

    logTokenUsage({
      timestamp: new Date().toISOString(),
      tool: toolName,
      venture: process.env.CRANE_VENTURE_CODE,
      est_input_tokens: estimateTokens(inputStr, toolName),
      est_output_tokens: estimateTokens(outputText, toolName),
      output_chars: outputText.length,
      duration_ms: durationMs,
    })

    return result
  }
}

/**
 * Generate a token usage report from the log file.
 */
export function generateTokenReport(options?: {
  hours?: number
  tool?: string
  venture?: string
}): string {
  try {
    const { readFileSync } = require('fs')
    if (!existsSync(LOG_FILE)) {
      return 'No token usage data found. Usage tracking starts after the first tool call.'
    }

    const raw = readFileSync(LOG_FILE, 'utf-8').trim()
    if (!raw) return 'No token usage data found.'

    const entries: TokenUsageEntry[] = raw
      .split('\n')
      .map((line: string) => {
        try {
          return JSON.parse(line) as TokenUsageEntry
        } catch {
          return null
        }
      })
      .filter((e: TokenUsageEntry | null): e is TokenUsageEntry => e !== null)

    // Apply filters
    let filtered = entries
    if (options?.hours) {
      const cutoff = Date.now() - options.hours * 60 * 60 * 1000
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() > cutoff)
    }
    if (options?.tool) {
      filtered = filtered.filter((e) => e.tool === options.tool)
    }
    if (options?.venture) {
      filtered = filtered.filter((e) => e.venture === options.venture)
    }

    if (filtered.length === 0) {
      return 'No matching token usage entries found.'
    }

    // Aggregate by tool
    const byTool = new Map<
      string,
      { calls: number; input: number; output: number; chars: number }
    >()
    for (const entry of filtered) {
      const existing = byTool.get(entry.tool) || { calls: 0, input: 0, output: 0, chars: 0 }
      existing.calls++
      existing.input += entry.est_input_tokens
      existing.output += entry.est_output_tokens
      existing.chars += entry.output_chars
      byTool.set(entry.tool, existing)
    }

    // Build report
    const lines: string[] = ['## Token Usage Report\n']
    const timeRange = options?.hours ? `Last ${options.hours}h` : 'All time'
    lines.push(`Period: ${timeRange} | Entries: ${filtered.length}\n`)
    lines.push('| Tool | Calls | Est. Input Tokens | Est. Output Tokens | Avg Output Chars |')
    lines.push('|------|-------|-------------------|--------------------|--------------------|')

    let totalInput = 0
    let totalOutput = 0

    const sorted = [...byTool.entries()].sort((a, b) => b[1].output - a[1].output)
    for (const [tool, stats] of sorted) {
      const avgChars = Math.round(stats.chars / stats.calls)
      lines.push(
        `| ${tool} | ${stats.calls} | ${stats.input.toLocaleString()} | ${stats.output.toLocaleString()} | ${avgChars.toLocaleString()} |`
      )
      totalInput += stats.input
      totalOutput += stats.output
    }

    lines.push('')
    lines.push(
      `**Totals:** ${totalInput.toLocaleString()} input + ${totalOutput.toLocaleString()} output = ${(totalInput + totalOutput).toLocaleString()} estimated tokens`
    )

    return lines.join('\n')
  } catch (error) {
    return `Failed to generate report: ${error instanceof Error ? error.message : 'unknown'}`
  }
}
