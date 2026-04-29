/**
 * Claude Code session JSONL reader.
 * Discovers the active session log and extracts the last activity timestamp.
 *
 * Used at EOD to determine when the agent actually stopped working,
 * which may differ significantly from when /eos is run.
 */

import { readFileSync, openSync, readSync, closeSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

interface SessionFile {
  pid: number
  sessionId: string
  cwd: string
  startedAt: number
}

interface JournalEntry {
  type?: string
  timestamp?: string
  message?: {
    role?: string
    content?: unknown
  }
}

/**
 * Resolve the active Claude Code session id by walking process.ppid →
 * ~/.claude/sessions/{ppid}.json → sessionId. Returns null if discovery fails
 * (e.g. running outside a Claude Code parent process).
 */
export function getClientSessionId(): string | null {
  try {
    const ppid = process.ppid
    if (!ppid) return null
    const sessionFilePath = join(homedir(), '.claude', 'sessions', `${ppid}.json`)
    const sessionFile: SessionFile = JSON.parse(readFileSync(sessionFilePath, 'utf-8'))
    return sessionFile.sessionId || null
  } catch {
    return null
  }
}

/**
 * Build the absolute path to a Claude Code JSONL transcript given a working
 * directory and a Claude Code session id. Pure — does not check existence.
 */
export function jsonlPathFor(cwd: string, sessionId: string): string {
  const projectDir = `-${cwd.replace(/\//g, '-').replace(/^-/, '')}`
  return join(homedir(), '.claude', 'projects', projectDir, `${sessionId}.jsonl`)
}

/**
 * Get the timestamp of the last real agent activity from the Claude Code session log.
 *
 * Discovery: process.ppid → ~/.claude/sessions/{ppid}.json → sessionId → JSONL file.
 * Then reads the tail of the JSONL to find the last assistant message before /eos.
 *
 * @returns ISO 8601 timestamp or null if discovery fails
 */
export async function getLastActivityTimestamp(): Promise<string | null> {
  try {
    const sessionId = getClientSessionId()
    if (!sessionId) return null

    const jsonlPath = jsonlPathFor(process.cwd(), sessionId)

    // Read tail of JSONL (last 64KB should contain recent messages)
    const tail = readTail(jsonlPath, 64 * 1024)
    if (!tail) return null

    // 4. Parse lines backwards, find last assistant message before /eos
    const lines = tail.split('\n').filter((l) => l.trim())

    // First pass: find the /eos boundary (last user message containing /eos)
    let eodTimestamp: string | null = null
    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = safeParse(lines[i])
      if (!entry) continue

      if (entry.type === 'user' && entry.timestamp) {
        const content = extractTextContent(entry.message?.content)
        if (content && /\/e(os|od)\b/i.test(content)) {
          eodTimestamp = entry.timestamp
          break
        }
      }
    }

    // Second pass: find the last assistant message before the /eos boundary
    // If no /eos found, find the last assistant message period
    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = safeParse(lines[i])
      if (!entry) continue

      if (entry.type === 'assistant' && entry.timestamp) {
        // If we found an /eos boundary, only accept messages before it
        if (eodTimestamp && entry.timestamp >= eodTimestamp) continue
        return entry.timestamp
      }
    }

    return null
  } catch {
    // Best-effort: any failure returns null (caller falls back to current behavior)
    return null
  }
}

/** Activity-bearing entry types in Claude Code JSONL transcripts. */
const ACTIVITY_TYPES = new Set(['assistant', 'user', 'system', 'attachment', 'last-prompt'])

/** Cap full-file reads at 50MB to bound memory on pathological transcripts. */
const MAX_JSONL_BYTES = 50 * 1024 * 1024

/**
 * Extract every activity-bearing timestamp from a Claude Code JSONL transcript.
 *
 * Yields ISO 8601 strings from entries with type in ACTIVITY_TYPES. The list is
 * NOT deduped or floored — that's the server's job (minute-bucket PK).
 *
 * @param jsonlPath - Absolute path to the JSONL file.
 * @param sinceTs - If provided, only events strictly after this timestamp are returned.
 * @returns Array of ISO 8601 timestamps in chronological order. Empty if the
 *   file is missing, unreadable, or contains no activity entries.
 */
export function extractActivityEvents(jsonlPath: string, sinceTs?: string): string[] {
  let buf: string
  try {
    const stats = statSync(jsonlPath)
    if (stats.size === 0) return []
    if (stats.size > MAX_JSONL_BYTES) {
      // For pathological transcripts, fall back to tail-only — better partial
      // coverage than OOM.
      const tail = readTail(jsonlPath, MAX_JSONL_BYTES)
      if (!tail) return []
      buf = tail
    } else {
      buf = readFileSync(jsonlPath, 'utf-8')
    }
  } catch {
    return []
  }

  const out: string[] = []
  // Split lines without allocating a giant array on huge files: prefer
  // for/index loop over .split() when possible. .split() is fine here since
  // we cap at 50MB.
  const lines = buf.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const entry = safeParse(line)
    if (!entry || !entry.timestamp || !entry.type) continue
    if (!ACTIVITY_TYPES.has(entry.type)) continue
    if (sinceTs && entry.timestamp <= sinceTs) continue
    out.push(entry.timestamp)
  }
  // Defensive: ensure chronological order even if the source happened to be
  // out of order (e.g., concurrent writers).
  out.sort()
  return out
}

/**
 * Read the last N bytes of a file.
 */
function readTail(filePath: string, bytes: number): string | null {
  try {
    const stats = statSync(filePath)
    const fileSize = stats.size
    const readSize = Math.min(bytes, fileSize)
    const offset = fileSize - readSize

    const fd = openSync(filePath, 'r')
    try {
      const buffer = Buffer.alloc(readSize)
      readSync(fd, buffer, 0, readSize, offset)
      return buffer.toString('utf-8')
    } finally {
      closeSync(fd)
    }
  } catch {
    return null
  }
}

/**
 * Safely parse a JSON line, returning null on failure.
 */
function safeParse(line: string): JournalEntry | null {
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

/**
 * Extract text content from a message content field.
 * Handles both string content and array-of-blocks content.
 */
function extractTextContent(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    for (const block of content) {
      if (typeof block === 'string') return block
      if (block && typeof block === 'object' && 'text' in block && typeof block.text === 'string') {
        return block.text
      }
    }
  }
  return null
}
