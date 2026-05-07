/**
 * docs-refresh-markers - marker parsing, diff-gate, and block mutation helpers.
 *
 * Extracted from docs-refresh.ts to stay within the 500-line file ceiling.
 */

import type {
  MarkerBlock,
  DiffGateResult,
  InitMarkersResult,
  PageType,
} from './docs-refresh-types.js'
import { OPEN_RX, CLOSE_RX, MARKED_PAGES, INIT_ANCHORS } from './docs-refresh-types.js'

// ---------------------------------------------------------------------------
// Marker parsing
// ---------------------------------------------------------------------------

export function parseMarkers(content: string): MarkerBlock[] {
  const lines = content.split('\n')
  const blocks: MarkerBlock[] = []
  const seen = new Set<string>()
  let openName: string | null = null
  let openLine = 0
  let bodyStart = 0

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const line = lines[i]
    const openMatch = line.match(OPEN_RX)
    const closeMatch = line.match(CLOSE_RX)

    if (openMatch) {
      if (openName !== null) {
        throw new Error(
          `Nested marker: '${openMatch[1]}' opened at line ${lineNo} while '${openName}' (line ${openLine}) is still open`
        )
      }
      openName = openMatch[1]
      openLine = lineNo
      bodyStart = i + 1
    } else if (closeMatch) {
      const name = closeMatch[1]
      if (openName === null) {
        throw new Error(`Closing marker '${name}' at line ${lineNo} has no matching open`)
      }
      if (name !== openName) {
        throw new Error(
          `Mismatched markers: opened '${openName}' at line ${openLine}, but found close '${name}' at line ${lineNo}`
        )
      }
      if (seen.has(name)) {
        throw new Error(`Duplicate marker '${name}' on same page (second close at line ${lineNo})`)
      }
      seen.add(name)
      const bodyLines = lines.slice(bodyStart, i)
      blocks.push({ name, startLine: openLine, endLine: lineNo, body: bodyLines.join('\n') })
      openName = null
    }
  }

  if (openName !== null) {
    throw new Error(`Unclosed marker '${openName}' opened at line ${openLine}`)
  }

  return blocks
}

// ---------------------------------------------------------------------------
// Diff gate (structural)
// ---------------------------------------------------------------------------

function stripBlocks(text: string, blocks: MarkerBlock[]): string {
  if (blocks.length === 0) return text
  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  const sorted = [...blocks].sort((a, b) => a.startLine - b.startLine)
  while (i < lines.length) {
    const lineNo = i + 1
    const block = sorted.find((b) => lineNo >= b.startLine && lineNo <= b.endLine)
    if (block) {
      if (lineNo === block.startLine) {
        out.push(`<<docs-refresh-block:${block.name}>>`)
      }
      i = block.endLine
    } else {
      out.push(lines[i])
    }
    i++
  }
  return out.join('\n')
}

export function diffGate(before: string, after: string): DiffGateResult {
  let beforeBlocks: MarkerBlock[]
  let afterBlocks: MarkerBlock[]
  try {
    beforeBlocks = parseMarkers(before)
    afterBlocks = parseMarkers(after)
  } catch (err) {
    return { ok: false, reason: `parse error: ${(err as Error).message}` }
  }

  const beforeNames = beforeBlocks.map((b) => b.name).sort()
  const afterNames = afterBlocks.map((b) => b.name).sort()
  if (
    beforeNames.length !== afterNames.length ||
    !beforeNames.every((n, i) => n === afterNames[i])
  ) {
    return {
      ok: false,
      reason: `marker set changed: before=[${beforeNames.join(',')}] after=[${afterNames.join(',')}]`,
    }
  }

  const beforeStripped = stripBlocks(before, beforeBlocks)
  const afterStripped = stripBlocks(after, afterBlocks)
  if (beforeStripped !== afterStripped) {
    return { ok: false, reason: 'content outside managed blocks differs' }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Block body replacement
// ---------------------------------------------------------------------------

export function replaceBlockBody(content: string, name: string, newBody: string): string {
  const lines = content.split('\n')
  let openIdx = -1
  let closeIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const o = lines[i].match(OPEN_RX)
    const c = lines[i].match(CLOSE_RX)
    if (o && o[1] === name) openIdx = i
    if (c && c[1] === name) {
      closeIdx = i
      break
    }
  }
  if (openIdx === -1 || closeIdx === -1) {
    throw new Error(`replaceBlockBody: marker '${name}' not found`)
  }
  const newBodyLines = newBody.split('\n')
  return [...lines.slice(0, openIdx + 1), ...newBodyLines, ...lines.slice(closeIdx)].join('\n')
}

// ---------------------------------------------------------------------------
// Init-markers helpers
// ---------------------------------------------------------------------------

// A "bullet list body" is a sequence of lines where every non-blank line
// starts with '- ' (or '* '). Trailing blank lines tolerated.
export function isBulletListBody(lines: string[]): boolean {
  let sawBullet = false
  for (const line of lines) {
    const t = line.trim()
    if (t === '') continue
    if (!/^[-*]\s/.test(t)) return false
    sawBullet = true
  }
  return sawBullet
}

interface WrapResult {
  ok: boolean
  content: string
  reason?: string
}

function tryWrapAfterHeading(content: string, heading: string, blockName: string): WrapResult {
  const lines = content.split('\n')
  const wantNorm = heading.trim().toLowerCase()
  const headingIdx = lines.findIndex((l) => l.trim().toLowerCase() === wantNorm)
  if (headingIdx === -1) {
    return {
      ok: false,
      content,
      reason: `heading '${heading}' not found (case-insensitive); skipping init for this block (run a normalization PR first if you want coverage)`,
    }
  }
  let sectionEnd = lines.length
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^#{1,2}\s/.test(lines[i])) {
      sectionEnd = i
      break
    }
  }
  let bodyEnd = sectionEnd
  while (bodyEnd > headingIdx + 1 && lines[bodyEnd - 1].trim() === '') bodyEnd--
  let bodyStart = headingIdx + 1
  while (bodyStart < bodyEnd && lines[bodyStart].trim() === '') bodyStart++

  const body = lines.slice(bodyStart, bodyEnd)
  if (!isBulletListBody(body)) {
    return {
      ok: false,
      content,
      reason: `section under '${heading}' is not a bullet list (likely a table or prose); refusing to wrap to avoid renderer overreach`,
    }
  }

  const before = lines.slice(0, bodyStart)
  const after = lines.slice(bodyEnd)
  const wrapped = [
    ...before,
    `<!-- docs-refresh:${blockName} -->`,
    ...body,
    `<!-- /docs-refresh:${blockName} -->`,
    ...after,
  ]
  return { ok: true, content: wrapped.join('\n') }
}

function appendAsNewSection(content: string, heading: string, blockName: string): string {
  const trimmed = content.replace(/\s+$/, '')
  return (
    trimmed +
    '\n\n' +
    heading +
    '\n\n' +
    `<!-- docs-refresh:${blockName} -->\n` +
    `_(populated on next docs-refresh run)_\n` +
    `<!-- /docs-refresh:${blockName} -->\n`
  )
}

export function initMarkersForPageDetailed(content: string, page: PageType): InitMarkersResult {
  const renderers = MARKED_PAGES[page]
  let result = content
  const warnings: string[] = []
  for (const r of renderers) {
    if (parseMarkers(result).some((b) => b.name === r)) continue
    const anchor = INIT_ANCHORS[r]
    if (anchor.mode === 'wrap-after-heading') {
      const wrap = tryWrapAfterHeading(result, anchor.heading, r)
      if (wrap.ok) {
        result = wrap.content
      } else {
        warnings.push(`skipped ${r}: ${wrap.reason}`)
      }
    } else {
      result = appendAsNewSection(result, anchor.heading, r)
    }
  }
  return { content: result, warnings }
}

// Backwards-compatible: returns just the content (used by e2e test fixture).
export function initMarkersForPage(content: string, page: PageType): string {
  return initMarkersForPageDetailed(content, page).content
}
