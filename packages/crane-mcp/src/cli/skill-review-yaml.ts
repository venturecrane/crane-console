/**
 * skill-review-yaml - hand-rolled YAML frontmatter parser for SKILL.md files.
 *
 * Supports: strings, booleans, null, simple lists (- item), and nested maps
 * (key:\n  subkey: val). This is sufficient for the SKILL.md schema.
 *
 * Extracted from skill-review.ts to keep individual modules under the
 * max-lines and complexity ceilings.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Frontmatter {
  name?: unknown
  description?: unknown
  version?: unknown
  scope?: unknown
  owner?: unknown
  status?: unknown
  backend_only?: unknown
  depends_on?: {
    mcp_tools?: unknown
    files?: unknown
    commands?: unknown
  }
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Scalar coercion
// ---------------------------------------------------------------------------

export function coerceScalar(val: string): unknown {
  if (val === 'true') return true
  if (val === 'false') return false
  if (val === 'null' || val === '~') return null
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1)
  }
  return val
}

// ---------------------------------------------------------------------------
// Child-block collection
// ---------------------------------------------------------------------------

/**
 * Collect child lines (indent > baseIndent) starting at index `start`.
 * Returns { children, nextIndex }.
 */
function collectChildren(
  lines: string[],
  start: number,
  baseIndent: number
): { children: string[]; nextIndex: number } {
  const children: string[] = []
  let j = start
  while (j < lines.length) {
    const childLine = lines[j]
    if (!childLine || childLine.trim() === '') {
      children.push(childLine ?? '')
      j++
      continue
    }
    const childIndent = childLine.length - childLine.trimStart().length
    if (childIndent <= baseIndent) break
    children.push(childLine)
    j++
  }
  // Trim trailing blank lines
  while (
    children.length > 0 &&
    (!children[children.length - 1] || children[children.length - 1].trim() === '')
  ) {
    children.pop()
  }
  return { children, nextIndex: j }
}

// ---------------------------------------------------------------------------
// Value resolution for key with no inline value
// ---------------------------------------------------------------------------

/**
 * Resolve the value for a YAML key whose inline portion is empty.
 * Returns the parsed value.
 */
function resolveChildValue(children: string[]): unknown {
  const firstNonBlank = children.find((c) => c && c.trim() !== '')
  if (firstNonBlank && firstNonBlank.trimStart().startsWith('- ')) {
    return children
      .filter((c) => c && c.trim().startsWith('-'))
      .map((c) => c.replace(/^\s*-\s*/, '').trim())
      .filter((c) => c.length > 0)
  }
  if (children.length > 0) {
    return parseYamlBlock(children)
  }
  return null
}

// ---------------------------------------------------------------------------
// Base indent detection
// ---------------------------------------------------------------------------

function detectBaseIndent(lines: string[]): number {
  for (const line of lines) {
    if (!line || line.trim() === '' || line.trim().startsWith('#')) continue
    return line.length - line.trimStart().length
  }
  return -1
}

// ---------------------------------------------------------------------------
// Block parser
// ---------------------------------------------------------------------------

const SIBLING_RE = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/

export function parseYamlBlock(lines: string[]): Frontmatter {
  const result: Frontmatter = {}
  if (lines.length === 0) return result

  const baseIndent = detectBaseIndent(lines)
  if (baseIndent === -1) return result

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line || line.trim() === '' || line.trim().startsWith('#')) {
      i++
      continue
    }

    const indent = line.length - line.trimStart().length
    if (indent < baseIndent) break
    if (indent > baseIndent) {
      i++
      continue
    }

    const keyMatch = SIBLING_RE.exec(line.trimStart())
    if (!keyMatch) {
      i++
      continue
    }

    const key = keyMatch[1]
    const rest = keyMatch[2].trim()

    if (rest === '' || rest === null) {
      const { children, nextIndex } = collectChildren(lines, i + 1, baseIndent)
      result[key] = resolveChildValue(children)
      i = nextIndex
    } else {
      result[key] = coerceScalar(rest)
      i++
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Public API: parse YAML frontmatter from a markdown string
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { data, content } where data is the parsed frontmatter object and
 * content is the body after the closing `---`.
 */
export function parseFrontmatter(raw: string): { data: Frontmatter; content: string } {
  const lines = raw.split('\n')

  if (lines[0]?.trim() !== '---') {
    return { data: {}, content: raw }
  }

  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      closeIdx = i
      break
    }
  }

  if (closeIdx === -1) {
    return { data: {}, content: raw }
  }

  const yamlLines = lines.slice(1, closeIdx)
  const content = lines.slice(closeIdx + 1).join('\n')
  const data = parseYamlBlock(yamlLines)
  return { data, content }
}
