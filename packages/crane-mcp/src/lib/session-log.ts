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
 * Get the timestamp of the last real agent activity from the Claude Code session log.
 *
 * Discovery: process.ppid → ~/.claude/sessions/{ppid}.json → sessionId → JSONL file.
 * Then reads the tail of the JSONL to find the last assistant message before /eos.
 *
 * @returns ISO 8601 timestamp or null if discovery fails
 */
export async function getLastActivityTimestamp(): Promise<string | null> {
  try {
    // 1. Find Claude Code session ID via parent PID
    const ppid = process.ppid
    if (!ppid) return null

    const sessionFilePath = join(homedir(), '.claude', 'sessions', `${ppid}.json`)
    const sessionFile: SessionFile = JSON.parse(readFileSync(sessionFilePath, 'utf-8'))
    const { sessionId } = sessionFile

    // 2. Build JSONL path from cwd
    const projectDir = `-${process.cwd().replace(/\//g, '-').replace(/^-/, '')}`
    const jsonlPath = join(homedir(), '.claude', 'projects', projectDir, `${sessionId}.jsonl`)

    // 3. Read tail of JSONL (last 64KB should contain recent messages)
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
