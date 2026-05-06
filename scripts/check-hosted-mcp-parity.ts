#!/usr/bin/env node
/**
 * check-hosted-mcp-parity.ts
 *
 * Static drift check for the hosted MCP tool surface. Three sources must agree:
 *
 *   1. HOSTED_MCP_TOOLS constant   in workers/crane-context/src/mcp.ts (source of truth)
 *   2. TOOL_DEFINITIONS entries    in workers/crane-context/src/mcp.ts (declarations)
 *   3. The hosted-tool table       in docs/infra/mcp-surfaces.md      (documentation)
 *
 * Wired into npm run verify so a pre-push or CI run blocks if any pair drifts.
 *
 * Why this exists: the hosted MCP is a contract surface. If documentation,
 * declarations, and the canonical constant drift, future agents read the
 * wrong source and ship aspirational tests against properties that don't
 * exist (the failure mode that produced today's parity-test fiasco).
 *
 * Pure Node builtins only — runs without dependencies during postinstall.
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = join(dirname(__filename), '..')

const WORKER_MCP = join(REPO_ROOT, 'workers', 'crane-context', 'src', 'mcp.ts')
const DOC = join(REPO_ROOT, 'docs', 'infra', 'mcp-surfaces.md')

function fail(msg: string): never {
  console.error(`\n[hosted-mcp-parity] FAIL: ${msg}`)
  process.exit(1)
}

function readFile(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (e) {
    fail(`could not read ${path}: ${(e as Error).message}`)
  }
}

// ---------------------------------------------------------------------------
// Source 1: HOSTED_MCP_TOOLS constant
// ---------------------------------------------------------------------------
function parseHostedMcpTools(src: string): string[] {
  const match = src.match(/export const HOSTED_MCP_TOOLS\s*=\s*\[([\s\S]*?)\]\s*as const/m)
  if (!match) {
    fail(`HOSTED_MCP_TOOLS constant not found in ${WORKER_MCP}. Has the export been renamed?`)
  }
  const body = match[1]
  const names = Array.from(body.matchAll(/['"]([a-z_][a-z_0-9]*)['"]/g)).map((m) => m[1])
  if (names.length === 0) {
    fail('HOSTED_MCP_TOOLS parsed but contained no tool names.')
  }
  return names
}

// ---------------------------------------------------------------------------
// Source 2: TOOL_DEFINITIONS entries (hosted tool declarations)
// ---------------------------------------------------------------------------
function parseToolDefinitionsNames(src: string): string[] {
  // Match the array body; allow nested brackets in inputSchema by greedy capture
  // up to the closing bracket of the top-level array. We use a simple line-based
  // pass that picks up `name: 'crane_xxx'` declarations, scoped to inside the
  // TOOL_DEFINITIONS array.
  const startIdx = src.indexOf('const TOOL_DEFINITIONS')
  if (startIdx < 0) fail('TOOL_DEFINITIONS not found.')
  // Skip past the type annotation (`: ToolDefinition[]`) to the assignment `=`
  // before scanning for the array literal's opening `[`.
  const eqIdx = src.indexOf('=', startIdx)
  if (eqIdx < 0) fail('Could not find `=` after TOOL_DEFINITIONS.')
  let i = src.indexOf('[', eqIdx)
  if (i < 0) fail('Could not locate `[` after TOOL_DEFINITIONS assignment.')
  let depth = 0
  let end = -1
  for (; i < src.length; i++) {
    if (src[i] === '[') depth++
    else if (src[i] === ']') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) fail('Could not locate end of TOOL_DEFINITIONS array.')
  const body = src.slice(src.indexOf('[', eqIdx), end + 1)
  const names = Array.from(body.matchAll(/^\s*name:\s*['"]([a-z_][a-z_0-9]*)['"]/gm)).map(
    (m) => m[1]
  )
  if (names.length === 0) fail('TOOL_DEFINITIONS body parsed but contained no tool names.')
  return names
}

// ---------------------------------------------------------------------------
// Source 3: Documented hosted tool table in mcp-surfaces.md
// ---------------------------------------------------------------------------
function parseDocumentedTools(src: string): string[] {
  // Find the section "## Hosted MCP — the canonical 5", then the second markdown
  // table after it (the one with | Tool | Purpose | columns).
  const sectionStart = src.indexOf('## Hosted MCP')
  if (sectionStart < 0) fail('"## Hosted MCP" section not found in docs.')
  const after = src.slice(sectionStart)
  // Match: | Tool | Purpose | header, then capture | `crane_x` | rows.
  // Note: no `m` flag — under multiline, $ matches end-of-line and the
  // non-greedy [\s\S]*? would terminate at the first newline.
  const tableMatch = after.match(/\|\s*Tool\s*\|\s*Purpose\s*\|[\s\S]*?(?=\n\n|\n##|$)/)
  if (!tableMatch) fail('Hosted-tool table not found under "## Hosted MCP" section.')
  const tableBody = tableMatch[0]
  const names = Array.from(tableBody.matchAll(/\|\s*`(crane_[a-z_]+)`\s*\|/g)).map((m) => m[1])
  if (names.length === 0) {
    fail('Hosted-tool table parsed but contained no `crane_*` entries.')
  }
  return names
}

// ---------------------------------------------------------------------------
// Diff helper
// ---------------------------------------------------------------------------
function setEq(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

function diff(label: string, expected: string[], actual: string[]): string {
  const exp = new Set(expected)
  const act = new Set(actual)
  const missing = expected.filter((x) => !act.has(x))
  const extra = actual.filter((x) => !exp.has(x))
  return `${label} drift:\n  missing: ${missing.join(', ') || '(none)'}\n  extra:   ${extra.join(', ') || '(none)'}`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const workerSrc = readFile(WORKER_MCP)
const docSrc = readFile(DOC)

const canonical = parseHostedMcpTools(workerSrc)
const declared = parseToolDefinitionsNames(workerSrc)
const documented = parseDocumentedTools(docSrc)

let ok = true

// Worker declarations must include every canonical tool (declarations may
// theoretically include more, but for the hosted surface they must match).
if (!setEq(canonical, declared)) {
  console.error(diff('HOSTED_MCP_TOOLS vs TOOL_DEFINITIONS', canonical, declared))
  ok = false
}

if (!setEq(canonical, documented)) {
  console.error(diff('HOSTED_MCP_TOOLS vs docs/infra/mcp-surfaces.md table', canonical, documented))
  ok = false
}

if (!ok) {
  console.error(
    '\nFix: update all three sources to match. See docs/infra/mcp-surfaces.md "References" section.'
  )
  process.exit(1)
}

console.log(
  `[hosted-mcp-parity] OK — ${canonical.length} tools agree across constant, declarations, and docs:`,
  canonical.join(', ')
)
