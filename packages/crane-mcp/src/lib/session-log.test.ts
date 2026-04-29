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

  it('returns last assistant message before /eos boundary', async () => {
    const { getLastActivityTimestamp } = await getModule()

    setupSessionFiles('sess-002', [
      userMsg('2026-03-23T10:00:00.000Z', 'Fix the bug'),
      assistantMsg('2026-03-23T10:01:00.000Z', 'Done fixing.'),
      userMsg(
        '2026-03-23T14:00:00.000Z',
        '# /eos - End of Session Handoff\n\nAuto-generate handoff...'
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

  describe('getClientSessionId', () => {
    it('returns the session id from ~/.claude/sessions/<ppid>.json', async () => {
      const { getClientSessionId } = await getModule()
      setupSessionFiles('sess-cc-1', [assistantMsg('2026-04-29T10:00:00.000Z', 'hi')])
      expect(getClientSessionId()).toBe('sess-cc-1')
    })

    it('returns null when no session file exists', async () => {
      const { getClientSessionId } = await getModule()
      // No setup — no file at ~/.claude/sessions/<ppid>.json
      expect(getClientSessionId()).toBeNull()
    })
  })

  describe('extractActivityEvents', () => {
    function jsonlPath(sessionId: string, cwd?: string): string {
      const effectiveCwd = cwd || process.cwd()
      const projectDir = `-${effectiveCwd.replace(/\//g, '-').replace(/^-/, '')}`
      return join(tempHome, '.claude', 'projects', projectDir, `${sessionId}.jsonl`)
    }

    it('returns empty array for missing file', async () => {
      const { extractActivityEvents } = await getModule()
      expect(extractActivityEvents('/nonexistent/path.jsonl')).toEqual([])
    })

    it('returns timestamps from assistant + user + system + attachment + last-prompt', async () => {
      const { extractActivityEvents } = await getModule()
      setupSessionFiles('sess-ext-1', [
        userMsg('2026-04-29T10:00:00.000Z', 'first'),
        assistantMsg('2026-04-29T10:01:00.000Z', 'response'),
        JSON.stringify({ type: 'system', timestamp: '2026-04-29T10:02:00.000Z' }),
        JSON.stringify({ type: 'attachment', timestamp: '2026-04-29T10:03:00.000Z' }),
        JSON.stringify({ type: 'last-prompt', timestamp: '2026-04-29T10:04:00.000Z' }),
        // Excluded entry types should be ignored
        JSON.stringify({ type: 'permission-mode', timestamp: '2026-04-29T10:05:00.000Z' }),
        JSON.stringify({ type: 'file-history-snapshot', timestamp: '2026-04-29T10:06:00.000Z' }),
      ])
      const events = extractActivityEvents(jsonlPath('sess-ext-1'))
      expect(events).toEqual([
        '2026-04-29T10:00:00.000Z',
        '2026-04-29T10:01:00.000Z',
        '2026-04-29T10:02:00.000Z',
        '2026-04-29T10:03:00.000Z',
        '2026-04-29T10:04:00.000Z',
      ])
    })

    it('skips malformed lines without throwing', async () => {
      const { extractActivityEvents } = await getModule()
      setupSessionFiles('sess-ext-2', [
        assistantMsg('2026-04-29T10:00:00.000Z', 'ok'),
        'not json',
        '{"truncated":',
        userMsg('2026-04-29T10:05:00.000Z', 'still works'),
      ])
      const events = extractActivityEvents(jsonlPath('sess-ext-2'))
      expect(events).toEqual(['2026-04-29T10:00:00.000Z', '2026-04-29T10:05:00.000Z'])
    })

    it('skips entries missing timestamp or type', async () => {
      const { extractActivityEvents } = await getModule()
      setupSessionFiles('sess-ext-3', [
        JSON.stringify({ type: 'assistant' }), // missing timestamp
        JSON.stringify({ timestamp: '2026-04-29T10:00:00.000Z' }), // missing type
        assistantMsg('2026-04-29T10:01:00.000Z', 'real one'),
      ])
      const events = extractActivityEvents(jsonlPath('sess-ext-3'))
      expect(events).toEqual(['2026-04-29T10:01:00.000Z'])
    })

    it('sinceTs filter excludes events at or before the boundary', async () => {
      const { extractActivityEvents } = await getModule()
      setupSessionFiles('sess-ext-4', [
        assistantMsg('2026-04-29T09:00:00.000Z', 'before'),
        assistantMsg('2026-04-29T10:00:00.000Z', 'boundary'),
        assistantMsg('2026-04-29T11:00:00.000Z', 'after'),
      ])
      const events = extractActivityEvents(jsonlPath('sess-ext-4'), '2026-04-29T10:00:00.000Z')
      expect(events).toEqual(['2026-04-29T11:00:00.000Z'])
    })

    it('output is chronologically sorted defensively', async () => {
      const { extractActivityEvents } = await getModule()
      setupSessionFiles('sess-ext-5', [
        assistantMsg('2026-04-29T10:02:00.000Z', 'b'),
        assistantMsg('2026-04-29T10:00:00.000Z', 'a'),
        assistantMsg('2026-04-29T10:01:00.000Z', 'c'),
      ])
      const events = extractActivityEvents(jsonlPath('sess-ext-5'))
      expect(events).toEqual([
        '2026-04-29T10:00:00.000Z',
        '2026-04-29T10:01:00.000Z',
        '2026-04-29T10:02:00.000Z',
      ])
    })
  })
})
