/**
 * Tests for session-log.ts - Claude Code JSONL session log reader
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, homedir } from 'node:os'

// We need to mock homedir and process.ppid to control file paths
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os')
  return { ...actual, homedir: vi.fn(() => actual.homedir()) }
})

const getModule = async () => {
  vi.resetModules()
  return import('./session-log.js')
}

describe('session-log', () => {
  let tempHome: string
  let originalPpid: number

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'session-log-test-'))
    vi.mocked(homedir).mockReturnValue(tempHome)
    originalPpid = process.ppid
  })

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true })
    Object.defineProperty(process, 'ppid', { value: originalPpid, writable: true })
    vi.restoreAllMocks()
  })

  function setupSessionFiles(sessionId: string, journalLines: string[], cwd?: string): void {
    const pid = process.ppid
    const effectiveCwd = cwd || process.cwd()

    // Create ~/.claude/sessions/{ppid}.json
    const sessionsDir = join(tempHome, '.claude', 'sessions')
    mkdirSync(sessionsDir, { recursive: true })
    writeFileSync(
      join(sessionsDir, `${pid}.json`),
      JSON.stringify({ pid, sessionId, cwd: effectiveCwd, startedAt: Date.now() })
    )

    // Create ~/.claude/projects/{projectDir}/{sessionId}.jsonl
    const projectDir = `-${effectiveCwd.replace(/\//g, '-').replace(/^-/, '')}`
    const projectPath = join(tempHome, '.claude', 'projects', projectDir)
    mkdirSync(projectPath, { recursive: true })
    writeFileSync(join(projectPath, `${sessionId}.jsonl`), journalLines.join('\n') + '\n')
  }

  function assistantMsg(timestamp: string, text: string): string {
    return JSON.stringify({
      type: 'assistant',
      timestamp,
      message: { role: 'assistant', content: [{ type: 'text', text }] },
    })
  }

  function userMsg(timestamp: string, text: string): string {
    return JSON.stringify({
      type: 'user',
      timestamp,
      message: { role: 'user', content: [{ type: 'text', text }] },
    })
  }

  function toolResultMsg(timestamp: string): string {
    return JSON.stringify({
      type: 'user',
      timestamp,
      message: {
        role: 'user',
        content: [{ tool_use_id: 'tool_1', type: 'tool_result', content: 'ok' }],
      },
    })
  }

  it('returns timestamp of last assistant message', async () => {
    const { getLastActivityTimestamp } = await getModule()

    setupSessionFiles('sess-001', [
      userMsg('2026-03-23T10:00:00.000Z', 'Fix the bug'),
      assistantMsg('2026-03-23T10:01:00.000Z', 'Looking at the code...'),
      toolResultMsg('2026-03-23T10:01:05.000Z'),
      assistantMsg('2026-03-23T10:02:00.000Z', 'Fixed the bug.'),
      userMsg('2026-03-23T10:03:00.000Z', 'Thanks'),
    ])

    const result = await getLastActivityTimestamp()
    expect(result).toBe('2026-03-23T10:02:00.000Z')
  })

  it('returns last assistant message before /eod boundary', async () => {
    const { getLastActivityTimestamp } = await getModule()

    setupSessionFiles('sess-002', [
      userMsg('2026-03-23T10:00:00.000Z', 'Fix the bug'),
      assistantMsg('2026-03-23T10:01:00.000Z', 'Done fixing.'),
      userMsg(
        '2026-03-23T14:00:00.000Z',
        '# /eod - End of Day Handoff\n\nAuto-generate handoff...'
      ),
      assistantMsg('2026-03-23T14:00:05.000Z', 'Here is your handoff summary...'),
      assistantMsg('2026-03-23T14:00:10.000Z', 'Handoff saved to D1.'),
    ])

    const result = await getLastActivityTimestamp()
    expect(result).toBe('2026-03-23T10:01:00.000Z')
  })

  it('returns null when session file not found', async () => {
    const { getLastActivityTimestamp } = await getModule()

    // No files set up
    const result = await getLastActivityTimestamp()
    expect(result).toBeNull()
  })

  it('returns null when JSONL file is empty', async () => {
    const { getLastActivityTimestamp } = await getModule()

    setupSessionFiles('sess-003', [])

    const result = await getLastActivityTimestamp()
    expect(result).toBeNull()
  })

  it('handles malformed JSONL lines gracefully', async () => {
    const { getLastActivityTimestamp } = await getModule()

    setupSessionFiles('sess-004', [
      assistantMsg('2026-03-23T10:00:00.000Z', 'Valid message'),
      'not valid json at all',
      '{"incomplete": true',
      assistantMsg('2026-03-23T10:05:00.000Z', 'Another valid message'),
    ])

    const result = await getLastActivityTimestamp()
    expect(result).toBe('2026-03-23T10:05:00.000Z')
  })

  it('returns null when no assistant messages exist', async () => {
    const { getLastActivityTimestamp } = await getModule()

    setupSessionFiles('sess-005', [
      userMsg('2026-03-23T10:00:00.000Z', 'Hello'),
      userMsg('2026-03-23T10:01:00.000Z', 'Anyone there?'),
    ])

    const result = await getLastActivityTimestamp()
    expect(result).toBeNull()
  })
})
