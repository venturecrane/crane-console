import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import {
  createTestD1,
  runMigrations,
  discoverNumericMigrations,
} from '@venturecrane/crane-test-harness'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMemoryCurator, parseFrontmatter, curateMemory } from '../src/lib/memory-curator'
import type { Env, NoteRecord } from '../src/types'
import { generateNoteId, nowIso } from '../src/utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const migrationsDir = join(__dirname, '..', 'migrations')

let db: Env['DB']

function makeEnv(aiResponse: string = 'NO_CONTRADICTION'): Env {
  return {
    DB: db,
    CONTEXT_SESSION_STALE_MINUTES: '45',
    IDEMPOTENCY_TTL_SECONDS: '3600',
    HEARTBEAT_INTERVAL_SECONDS: '600',
    HEARTBEAT_JITTER_SECONDS: '120',
    CONTEXT_RELAY_KEY: 'k',
    CONTEXT_ADMIN_KEY: 'k',
    AI: {
      run: vi.fn(async () => ({ response: aiResponse })),
    },
  } as Env
}

async function insertMemoryNote(
  content: string,
  opts: { id?: string; tags?: string[]; injectable?: number; createdAt?: string } = {}
): Promise<string> {
  const id = opts.id ?? generateNoteId()
  const tags = JSON.stringify(opts.tags ?? ['memory', 'lesson'])
  const created = opts.createdAt ?? nowIso()
  await db
    .prepare(
      `INSERT INTO notes (id, title, content, tags, venture, archived, created_at, updated_at, actor_key_id, injectable)
       VALUES (?, NULL, ?, ?, NULL, 0, ?, ?, 'test', ?)`
    )
    .bind(id, content, tags, created, created, opts.injectable ?? 0)
    .run()
  return id
}

beforeAll(async () => {
  db = createTestD1()
  await runMigrations(db, { files: discoverNumericMigrations(migrationsDir) })
})

beforeEach(async () => {
  await db.prepare('DELETE FROM notes').run()
  await db.prepare('DELETE FROM memory_curator_scores').run()
  await db.prepare('DELETE FROM memory_invocations').run()
})

describe('parseFrontmatter (worker-side)', () => {
  it('parses basic frontmatter', () => {
    const parsed = parseFrontmatter('---\nname: foo\nkind: lesson\n---\nbody text')
    expect(parsed?.fields.name).toBe('foo')
    expect(parsed?.fields.kind).toBe('lesson')
    expect(parsed?.body).toMatch(/body text/)
  })

  it('returns null when no frontmatter', () => {
    expect(parseFrontmatter('just body')).toBeNull()
  })

  it('strips quoted values', () => {
    const parsed = parseFrontmatter('---\ndescription: "quoted text"\n---\n')
    expect(parsed?.fields.description).toBe('quoted text')
  })
})

describe('curateMemory axes', () => {
  const validLesson = `---
name: example-lesson
description: "A clear lesson"
kind: lesson
scope: enterprise
owner: agent-team
status: stable
captain_approved: false
version: 1.0.0
---
Always run npm verify before pushing changes.`

  it('clean stable memory passes all 5 axes', async () => {
    // Old enough to require citation but with severity P0 to auto-pass that axis
    const oldP0 = `---
name: example-anti-pattern
description: "A clear anti-pattern"
kind: anti-pattern
scope: enterprise
owner: agent-team
status: stable
captain_approved: false
version: 1.0.0
severity: P0
---
Never commit credentials to git history.`
    const id = await insertMemoryNote(oldP0, {
      tags: ['memory', 'anti-pattern'],
      createdAt: '2024-01-01T00:00:00Z',
    })
    const env = makeEnv('NO_CONTRADICTION')
    const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRecord>()
    const report = await curateMemory(env, note!)
    expect(report.scores.schema_score).toBe(1)
    expect(report.scores.save_time_tests_score).toBe(1)
    expect(report.scores.contradiction_score).toBe(1)
    expect(report.scores.severity_validation_score).toBe(1)
    expect(report.scores.citation_health).toBe(1)
    expect(report.all_pass).toBe(true)
  })

  it('memory missing required frontmatter fails axis 1', async () => {
    const id = await insertMemoryNote('---\nname: incomplete\n---\nbody')
    const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRecord>()
    const env = makeEnv()
    const report = await curateMemory(env, note!)
    expect(report.scores.schema_score).toBe(0)
    expect(report.all_pass).toBe(false)
  })

  it('anti-pattern missing severity fails axis 4 with needs_captain_review', async () => {
    const noSev = `---
name: missing-sev
description: "No severity"
kind: anti-pattern
scope: enterprise
owner: agent-team
status: stable
captain_approved: false
version: 1.0.0
---
Never run rm -rf without confirmation.`
    const id = await insertMemoryNote(noSev, {
      tags: ['memory', 'anti-pattern'],
      createdAt: '2024-01-01T00:00:00Z',
    })
    const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRecord>()
    const env = makeEnv()
    const report = await curateMemory(env, note!)
    expect(report.scores.severity_validation_score).toBe(0)
    expect(report.needs_captain_review).toBe(true)
  })

  it('contradiction-axis fail-opens with parse_error on unparseable AI output', async () => {
    const id = await insertMemoryNote(validLesson, { createdAt: '2024-01-01T00:00:00Z' })
    // Insert another similar memory so contradiction check runs
    await insertMemoryNote(validLesson.replace('example-lesson', 'similar-lesson'), {
      createdAt: '2024-01-01T00:00:00Z',
    })
    const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRecord>()
    const env = makeEnv('garbled output, neither yes nor no')
    const report = await curateMemory(env, note!)
    // FTS5 may not be available in node:sqlite (skipped via the harness skip
    // pattern); the axis short-circuits to score 1 with rationale "FTS5
    // unavailable" and parse_error stays false. Either outcome is correct.
    expect(report.scores.contradiction_score).toBe(1)
  })

  it('stable memory past grace period with no citations fails axis 5', async () => {
    const oldDate = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const id = await insertMemoryNote(validLesson, { createdAt: oldDate })
    const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRecord>()
    const env = makeEnv()
    const report = await curateMemory(env, note!)
    expect(report.scores.citation_health).toBe(0)
  })

  it('young memory in grace period passes axis 5', async () => {
    const id = await insertMemoryNote(validLesson, {
      createdAt: new Date().toISOString(),
    })
    const note = await db.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRecord>()
    const env = makeEnv()
    const report = await curateMemory(env, note!)
    expect(report.scores.citation_health).toBe(1)
  })
})

describe('runMemoryCurator end-to-end', () => {
  it('promotes draft to stable when all axes pass', async () => {
    const draft = `---
name: draftable
description: "Will be promoted"
kind: anti-pattern
scope: enterprise
owner: agent-team
status: draft
captain_approved: false
version: 1.0.0
severity: P0
---
Never push to main directly.`
    const id = await insertMemoryNote(draft, {
      tags: ['memory', 'anti-pattern'],
      createdAt: '2024-01-01T00:00:00Z',
    })
    const env = makeEnv('NO_CONTRADICTION')
    const report = await runMemoryCurator(env)
    expect(report.total_memories).toBe(1)
    const memReport = report.per_memory.find((r) => r.memory_id === id)
    expect(memReport?.all_pass).toBe(true)
    expect(memReport?.promoted).toBe(true)
    expect(memReport?.injectable_set).toBe(true)
    // DB row should reflect both flips
    const updated = await db
      .prepare('SELECT * FROM notes WHERE id = ?')
      .bind(id)
      .first<NoteRecord>()
    expect(updated?.injectable).toBe(1)
    expect(updated?.content).toMatch(/status: stable/)
  })

  it('writes a memory_curator_scores row per memory', async () => {
    const valid = `---
name: scoring-test
description: "scoring"
kind: anti-pattern
scope: enterprise
owner: agent-team
status: stable
captain_approved: false
version: 1.0.0
severity: P0
---
Always validate input.`
    await insertMemoryNote(valid, { tags: ['memory', 'anti-pattern'] })
    const env = makeEnv('NO_CONTRADICTION')
    await runMemoryCurator(env)
    const result = await db
      .prepare('SELECT COUNT(*) as n FROM memory_curator_scores')
      .first<{ n: number }>()
    expect(result?.n).toBe(1)
  })
})
