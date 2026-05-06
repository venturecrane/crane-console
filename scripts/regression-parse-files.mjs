#!/usr/bin/env node
//
// regression-parse-files.mjs — Extract repo-relative file paths from a GitHub
// issue body for the regression-claim-origin workflow (Prong 3).
//
// Two-pass parse:
//   1. Primary: locate H3 with text matching /^Affected files\s*$/im,
//      capture lines until the next H1/H2/H3 or EOF, extract bulleted
//      paths via /^\s*[-*]\s+([^\s#]+)/.
//   2. Fallback (only if pass 1 returned 0 paths): regex over the entire
//      body for paths matching common repo roots. Catches manually-applied
//      `regression` labels on issues that didn't use the template.
//
// Caps output at 20 paths after dedup.
//
// Input:  ISSUE_BODY environment variable (or stdin if empty).
// Output: JSON to stdout: {files: [...], source: 'h3'|'fallback'|'none', count: N}.
//
// Exit codes:
//   0 — parsed successfully (any source, including 'none' which is recoverable)
//   2 — script error (could not read input, etc.)

import { readFileSync } from 'node:fs'

const CAP_FILES = 20

const FALLBACK_PATH_REGEX =
  /\b(packages|src|workers|scripts|docs|app|components|pages|api|tests?|public|\.github|crane-mcp|crane-context|crane-watch)\/[A-Za-z0-9._\-/]+\.[A-Za-z]{1,6}\b/g

function readInput() {
  const fromEnv = process.env.ISSUE_BODY
  if (fromEnv && fromEnv.length > 0) return fromEnv
  try {
    return readFileSync(0, 'utf-8')
  } catch {
    return ''
  }
}

function parseH3Block(body) {
  // Find an H3 heading whose text is "Affected files" (case-insensitive,
  // allows trailing whitespace).
  const lines = body.split(/\r?\n/)
  let inBlock = false
  const collected = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!inBlock) {
      if (/^###\s+Affected files\s*$/i.test(line)) {
        inBlock = true
        continue
      }
    } else {
      // Stop on the next heading at the same level or higher
      if (/^#{1,3}\s+/.test(line)) break
      collected.push(line)
    }
  }

  if (!inBlock) return []

  const paths = []
  for (const raw of collected) {
    const m = raw.match(/^\s*[-*]\s+([^\s#`<]+)/)
    if (!m) continue
    let p = m[1].trim()
    // Strip Markdown link wrapper if present: [text](path) → path; or `path`
    p = p.replace(/^`(.+)`$/, '$1')
    // Drop trailing punctuation that isn't part of a path
    p = p.replace(/[,;:]+$/, '')
    if (p.length === 0) continue
    paths.push(p)
  }
  return paths
}

function parseFallbackRegex(body) {
  const matches = body.match(FALLBACK_PATH_REGEX) ?? []
  return matches
}

function dedupAndCap(paths) {
  const seen = new Set()
  const out = []
  for (const p of paths) {
    if (seen.has(p)) continue
    seen.add(p)
    out.push(p)
    if (out.length >= CAP_FILES) break
  }
  return out
}

function main() {
  const body = readInput()
  if (!body || body.trim().length === 0) {
    console.log(JSON.stringify({ files: [], source: 'none', count: 0 }))
    return
  }

  // Pass 1: H3
  const h3Paths = parseH3Block(body)
  if (h3Paths.length > 0) {
    const files = dedupAndCap(h3Paths)
    console.log(JSON.stringify({ files, source: 'h3', count: files.length }))
    return
  }

  // Pass 2: fallback regex
  const fallbackPaths = parseFallbackRegex(body)
  if (fallbackPaths.length > 0) {
    const files = dedupAndCap(fallbackPaths)
    console.log(JSON.stringify({ files, source: 'fallback', count: files.length }))
    return
  }

  console.log(JSON.stringify({ files: [], source: 'none', count: 0 }))
}

try {
  main()
} catch (err) {
  console.error(`regression-parse-files error: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(2)
}
