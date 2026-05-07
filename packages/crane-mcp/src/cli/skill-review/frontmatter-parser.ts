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

function collectChildren(
  lines: string[],
  startIdx: number,
  baseIndent: number
): { children: string[]; nextIdx: number } {
  const children: string[] = []
  let j = startIdx
  while (j < lines.length) {
    const childLine = lines[j]
    if (!childLine || childLine.trim() === '') {
      children.push(childLine)
      j++
      continue
    }
    if (childLine.length - childLine.trimStart().length <= baseIndent) break
    children.push(childLine)
    j++
  }
  while (
    children.length > 0 &&
    (!children[children.length - 1] || children[children.length - 1].trim() === '')
  ) {
    children.pop()
  }
  return { children, nextIdx: j }
}

function parseChildValue(children: string[]): unknown {
  if (children.length === 0) return null
  const firstNonBlank = children.find((c) => c && c.trim() !== '')
  if (firstNonBlank && firstNonBlank.trimStart().startsWith('- ')) {
    return children
      .filter((c) => c && c.trim().startsWith('-'))
      .map((c) => c.replace(/^\s*-\s*/, '').trim())
      .filter((c) => c.length > 0)
  }
  return parseYamlBlock(children)
}

function isBlankOrComment(line: string | undefined): boolean {
  return !line || line.trim() === '' || line.trim().startsWith('#')
}

function parseYamlBlock(lines: string[]): Frontmatter {
  const result: Frontmatter = {}
  if (lines.length === 0) return result

  let baseIndent = -1
  for (const line of lines) {
    if (isBlankOrComment(line)) continue
    baseIndent = line.length - line.trimStart().length
    break
  }
  if (baseIndent === -1) return result

  const siblingRe = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (isBlankOrComment(line)) {
      i++
      continue
    }

    const indent = line.length - line.trimStart().length
    if (indent < baseIndent) break
    if (indent > baseIndent) {
      i++
      continue
    }

    const trimmed = line.trimStart()
    const keyMatch = siblingRe.exec(trimmed)
    if (!keyMatch) {
      i++
      continue
    }

    const key = keyMatch[1]
    const rest = keyMatch[2].trim()

    if (rest === '' || rest === null) {
      const { children, nextIdx } = collectChildren(lines, i + 1, baseIndent)
      result[key] = parseChildValue(children)
      i = nextIdx
    } else {
      result[key] = coerceScalar(rest)
      i++
    }
  }

  return result
}

function coerceScalar(val: string): unknown {
  if (val === 'true') return true
  if (val === 'false') return false
  if (val === 'null' || val === '~') return null
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1)
  }
  return val
}
