#!/usr/bin/env node
/**
 * snapshot-mcp-tools.ts
 *
 * Scans packages/crane-mcp/src/tools/*.ts (excluding *.test.ts) and extracts
 * MCP tool names, writing the result to config/mcp-tool-manifest.json.
 *
 * Run via: npx tsx scripts/snapshot-mcp-tools.ts
 *
 * This file is intentionally dependency-free (pure Node builtins only).
 * Do NOT import from crane-mcp package internals.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// Repo root resolution (mirrors launch-lib.ts CRANE_CONSOLE_ROOT pattern)
// When running as source via tsx: __filename = scripts/snapshot-mcp-tools.ts
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = join(dirname(__filename), '..')

const TOOLS_DIR = join(REPO_ROOT, 'packages', 'crane-mcp', 'src', 'tools')
const OUTPUT_PATH = join(REPO_ROOT, 'config', 'mcp-tool-manifest.json')
const MCP_JSON_PATH = join(REPO_ROOT, '.mcp.json')

// ---------------------------------------------------------------------------
// Regex patterns for extracting crane_ tool names
// ---------------------------------------------------------------------------

/**
 * Matches crane_ tool names in JSDoc comment lines.
 * Handles:
 *   - Single tool:    " * crane_foo tool - description"
 *   - Multiple tools: " * crane_foo / crane_bar tools"
 *   - Inline refs:    " * crane_foo: ..."
 */
const CRANE_NAME_REGEX = /\bcrane_[a-z][a-z0-9_]*\b/g

/**
 * Extract tool names from the leading JSDoc block of a file.
 * Only looks in the first JSDoc comment (/** ... * /) to avoid picking up
 * tool names mentioned in implementation comments or string literals that
 * are cross-references rather than definitions.
 */
function extractToolNames(filePath: string, content: string): string[] {
  // Find the opening JSDoc block (must start at line 1 or 2)
  const jsdocMatch = content.match(/^\/\*\*([\s\S]*?)\*\//m)
  if (!jsdocMatch) {
    return extractFromFallback(content)
  }

  const jsdocBody = jsdocMatch[1]

  // Extract the first line(s) of the JSDoc that declare the tool name(s).
  // The declaring lines are those that contain "tool" or "tools" after the
  // crane_ name, signalling this is the tool declaration, not a reference.
  const declaringLines: string[] = []
  for (const line of jsdocBody.split('\n')) {
    // A declaring line: contains crane_xxx and either "tool" keyword or " / " separator
    if (/\bcrane_[a-z]/.test(line) && (/\btool\b/.test(line) || /\s\/\s/.test(line))) {
      declaringLines.push(line)
    }
  }

  if (declaringLines.length === 0) {
    // Fall back: just grab all crane_ names from the entire JSDoc
    return extractNamesFromText(jsdocBody, filePath)
  }

  const names = new Set<string>()
  for (const line of declaringLines) {
    const matches = line.match(CRANE_NAME_REGEX)
    if (matches) {
      for (const m of matches) {
        names.add(m)
      }
    }
  }

  return [...names]
}

/**
 * Fallback: grab any crane_ names from the whole file content.
 * Used when JSDoc detection fails. Warns on stderr.
 */
function extractFromFallback(content: string): string[] {
  return extractNamesFromText(content, '(unknown)')
}

function extractNamesFromText(text: string, _label: string): string[] {
  const names = new Set<string>()
  const matches = text.match(CRANE_NAME_REGEX)
  if (matches) {
    for (const m of matches) {
      names.add(m)
    }
  }
  return [...names]
}

// ---------------------------------------------------------------------------
// External MCP servers from .mcp.json
// ---------------------------------------------------------------------------
function readExternalServers(): string[] {
  if (!existsSync(MCP_JSON_PATH)) {
    return []
  }
  try {
    const raw = readFileSync(MCP_JSON_PATH, 'utf-8')
    const config = JSON.parse(raw) as { mcpServers?: Record<string, unknown> }
    const servers = Object.keys(config.mcpServers ?? {})
    // Exclude the crane-mcp server itself (named "crane")
    return servers.filter((s) => s !== 'crane')
  } catch (err) {
    process.stderr.write(`[snapshot] Warning: could not parse .mcp.json: ${err}\n`)
    return []
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  if (!existsSync(TOOLS_DIR)) {
    process.stderr.write(`[snapshot] Error: tools directory not found: ${TOOLS_DIR}\n`)
    process.exit(1)
  }

  const entries = readdirSync(TOOLS_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

  const allTools = new Set<string>()

  for (const entry of entries) {
    const filePath = join(TOOLS_DIR, entry)
    let content: string
    try {
      content = readFileSync(filePath, 'utf-8')
    } catch (err) {
      process.stderr.write(`[snapshot] Warning: could not read ${entry}: ${err}\n`)
      continue
    }

    const names = extractToolNames(filePath, content)

    if (names.length === 0) {
      process.stderr.write(`[snapshot] Warning: no crane_ tool name found in ${entry} — skipping\n`)
      continue
    }

    for (const name of names) {
      allTools.add(name)
    }
  }

  const toolsSorted = [...allTools].sort()
  const externalServers = readExternalServers()

  const manifest = {
    generated_at: new Date().toISOString(),
    source: 'packages/crane-mcp/src/tools/',
    tools: toolsSorted,
    external_servers: externalServers,
  }

  // Ensure config/ directory exists
  const configDir = dirname(OUTPUT_PATH)
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')

  process.stdout.write(
    `[snapshot] Wrote ${toolsSorted.length} tool(s) to config/mcp-tool-manifest.json\n`
  )
  process.stdout.write(`[snapshot] Tools: ${toolsSorted.join(', ')}\n`)
  if (externalServers.length > 0) {
    process.stdout.write(`[snapshot] External servers: ${externalServers.join(', ')}\n`)
  }
}

main()
