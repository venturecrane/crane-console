/**
 * Tests for worktree-doctor.ts tool.
 *
 * Mocks `child_process.execSync` and `fs` (existsSync/readdirSync/statSync) to
 * exercise the safety gate logic without real worktrees. The PidChecker
 * abstraction is injected directly to avoid needing real subprocess spawning.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
  }
})

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}))

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

interface ExecCall {
  cmd: string
  output: string | (() => string) // string OR thrown error via fn
}

/**
 * Configure execSync to dispatch by substring match against the command. First
 * matching rule wins. Unmatched commands return ''.
 */
function setupExecMock(
  execSyncMock: ReturnType<typeof vi.fn>,
  rules: Array<{ match: string | RegExp; respond: () => string }>
) {
  execSyncMock.mockImplementation((cmd: string) => {
    for (const rule of rules) {
      if (typeof rule.match === 'string' ? cmd.includes(rule.match) : rule.match.test(cmd)) {
        return rule.respond()
      }
    }
    return ''
  })
}

function porcelainBlock(opts: {
  path: string
  head?: string
  branch?: string
  locked?: string | null // null → bare 'locked'; undefined → no lock
}) {
  const lines = [`worktree ${opts.path}`]
  if (opts.head) lines.push(`HEAD ${opts.head}`)
  if (opts.branch) lines.push(`branch refs/heads/${opts.branch}`)
  if (opts.locked === null) lines.push('locked')
  else if (typeof opts.locked === 'string') lines.push(`locked ${opts.locked}`)
  return lines.join('\n') + '\n'
}

const NOW_S = Math.floor(Date.now() / 1000)
const TWO_HOURS_AGO_S = NOW_S - 2 * 60 * 60

// ----------------------------------------------------------------------------
// Suite
// ----------------------------------------------------------------------------

describe('crane_worktree_doctor', () => {
  let fsMock: typeof import('node:fs')
  let cpMock: typeof import('node:child_process')
  let cwdSpy: ReturnType<typeof vi.spyOn>
  let killSpy: ReturnType<typeof vi.spyOn>

  const REPO = '/tmp/repo'
  const WORKTREES_DIR = `${REPO}/.claude/worktrees`

  beforeEach(async () => {
    vi.resetModules()
    fsMock = await import('node:fs')
    cpMock = await import('node:child_process')

    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(REPO)
    // Default kill spy: throw ESRCH (dead) — tests override via injected PidChecker.
    killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {
      const err: NodeJS.ErrnoException = new Error('ESRCH')
      err.code = 'ESRCH'
      throw err
    })

    // Default fs: worktrees dir exists; specific tests override the listing.
    vi.mocked(fsMock.existsSync).mockImplementation((p: any) => {
      return p.toString().endsWith('.claude/worktrees')
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    cwdSpy.mockRestore()
    killSpy.mockRestore()
  })

  const getModule = async () => {
    vi.resetModules()
    return import('./worktree-doctor.js')
  }

  // -------------------------------------------------------------------------

  it('1. dead-PID lock + clean tree + squash-merged → cleaned (apply=true unlocks and removes)', async () => {
    const id = 'agent-aaa'
    const wtPath = `${WORKTREES_DIR}/${id}`
    const branch = 'worktree-agent-aaa'

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, head: 'a'.repeat(40), branch: 'main' }) +
          '\n' +
          porcelainBlock({
            path: wtPath,
            head: 'b'.repeat(40),
            branch,
            locked: `claude agent ${id} (pid 99998)`,
          }),
      },
      { match: 'gh pr list', respond: () => '[]' },
      { match: 'git worktree unlock', respond: () => '' },
      { match: 'lsof +D', respond: () => '' },
      { match: 'log -1 --format=%ct HEAD', respond: () => String(TWO_HOURS_AGO_S) },
      { match: 'status --porcelain', respond: () => '' },
      { match: '--not origin/main --oneline', respond: () => 'commit1\n' },
      { match: 'cherry origin/main', respond: () => '' }, // cherry-empty = squash-merged
      { match: 'git worktree remove --force', respond: () => '' },
      { match: 'git branch -D', respond: () => '' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const fakePidChecker = (pid: number) => false // always dead
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, fakePidChecker)
    const report = JSON.parse(result.message)

    expect(report.cleaned).toHaveLength(1)
    expect(report.cleaned[0].id).toBe(id)
    expect(report.cleaned[0].reason).toBe('clean+merged+squash')
    expect(report.cleaned[0].unlocked).toBe(true)
    expect(report.needs_review).toHaveLength(0)
    expect(report.errors).toHaveLength(0)

    // Verify destructive calls happened
    const calls = vi.mocked(cpMock.execSync).mock.calls.map((c) => c[0] as string)
    expect(calls.some((c) => c.includes('git worktree unlock'))).toBe(true)
    expect(calls.some((c) => c.includes('git worktree remove --force'))).toBe(true)
    expect(calls.some((c) => c.includes('git branch -D'))).toBe(true)
  })

  // -------------------------------------------------------------------------

  it('2. dead-PID lock + clean tree + squash-merged → would-clean (apply=false; no destructive calls)', async () => {
    const id = 'agent-bbb'
    const wtPath = `${WORKTREES_DIR}/${id}`
    const branch = 'worktree-agent-bbb'

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          porcelainBlock({
            path: wtPath,
            branch,
            locked: `claude agent ${id} (pid 99998)`,
          }),
      },
      { match: 'gh pr list', respond: () => '[]' },
      { match: 'lsof +D', respond: () => '' },
      { match: 'log -1 --format=%ct HEAD', respond: () => String(TWO_HOURS_AGO_S) },
      { match: 'status --porcelain', respond: () => '' },
      { match: '--not origin/main --oneline', respond: () => 'commit1\n' },
      { match: 'cherry origin/main', respond: () => '' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: false, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    expect(report.cleaned).toHaveLength(1)
    expect(report.cleaned[0].reason).toBe('clean+merged+squash')
    expect(report.apply).toBe(false)

    const calls = vi.mocked(cpMock.execSync).mock.calls.map((c) => c[0] as string)
    expect(calls.some((c) => c.includes('git worktree unlock'))).toBe(false)
    expect(calls.some((c) => c.includes('git worktree remove'))).toBe(false)
    expect(calls.some((c) => c.includes('git branch -D'))).toBe(false)
  })

  // -------------------------------------------------------------------------

  it('3. alive-PID lock → skipped, no unlock attempted', async () => {
    const id = 'agent-ccc'
    const wtPath = `${WORKTREES_DIR}/${id}`

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          porcelainBlock({
            path: wtPath,
            branch: `worktree-${id}`,
            locked: `claude agent ${id} (pid 12345)`,
          }),
      },
      { match: 'gh pr list', respond: () => '[]' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const fakePidChecker = (pid: number) => true // always alive
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, fakePidChecker)
    const report = JSON.parse(result.message)

    expect(report.cleaned).toHaveLength(0)
    expect(report.needs_review).toHaveLength(0)
    expect(report.scanned).toBe(1)

    const calls = vi.mocked(cpMock.execSync).mock.calls.map((c) => c[0] as string)
    expect(calls.some((c) => c.includes('git worktree unlock'))).toBe(false)
  })

  // -------------------------------------------------------------------------

  it('4. foreign lock pattern → needs_review with truncated reason; not unlocked', async () => {
    const id = 'agent-ddd'
    const wtPath = `${WORKTREES_DIR}/${id}`
    const longReason =
      'manually locked by some external tool with a very long explanation that exceeds eighty characters for sure'

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          porcelainBlock({
            path: wtPath,
            branch: `worktree-${id}`,
            locked: longReason,
          }),
      },
      { match: 'gh pr list', respond: () => '[]' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    expect(report.needs_review).toHaveLength(1)
    expect(report.needs_review[0].reason).toMatch(/^locked: /)
    expect(report.needs_review[0].reason.length).toBeLessThanOrEqual(90)
    expect(report.needs_review[0].reason).toContain('...')

    const calls = vi.mocked(cpMock.execSync).mock.calls.map((c) => c[0] as string)
    expect(calls.some((c) => c.includes('git worktree unlock'))).toBe(false)
  })

  // -------------------------------------------------------------------------

  it('5. lsof returns non-empty → skipped with reason "live process"', async () => {
    const id = 'agent-eee'
    const wtPath = `${WORKTREES_DIR}/${id}`

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          porcelainBlock({ path: wtPath, branch: `worktree-${id}` }),
      },
      { match: 'gh pr list', respond: () => '[]' },
      { match: 'lsof +D', respond: () => 'COMMAND PID USER ...\nclaude 1234 me cwd ...\n' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    expect(report.needs_review).toHaveLength(1)
    expect(report.needs_review[0].reason).toBe('live process')
  })

  // -------------------------------------------------------------------------

  it('6. lsof timeout → skipped with reason "lsof timeout"', async () => {
    const id = 'agent-fff'
    const wtPath = `${WORKTREES_DIR}/${id}`

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          porcelainBlock({ path: wtPath, branch: `worktree-${id}` }),
      },
      { match: 'gh pr list', respond: () => '[]' },
      {
        match: 'lsof +D',
        respond: () => {
          const err: NodeJS.ErrnoException & { signal?: string } = new Error('Command timed out')
          err.signal = 'SIGTERM'
          throw err
        },
      },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    expect(report.needs_review).toHaveLength(1)
    expect(report.needs_review[0].reason).toBe('lsof timeout')
  })

  // -------------------------------------------------------------------------

  it('7. fresh HEAD (mtime within 60min) → needs_review with reason "fresh HEAD"', async () => {
    const id = 'agent-ggg'
    const wtPath = `${WORKTREES_DIR}/${id}`

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          porcelainBlock({ path: wtPath, branch: `worktree-${id}` }),
      },
      { match: 'gh pr list', respond: () => '[]' },
      { match: 'lsof +D', respond: () => '' },
      { match: 'log -1 --format=%ct HEAD', respond: () => String(NOW_S - 30 * 60) }, // 30min ago
    ])

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    expect(report.needs_review).toHaveLength(1)
    expect(report.needs_review[0].reason).toBe('fresh HEAD')
  })

  // -------------------------------------------------------------------------

  it('8. dirty tree → needs_review with reason "dirty: N"', async () => {
    const id = 'agent-hhh'
    const wtPath = `${WORKTREES_DIR}/${id}`

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          porcelainBlock({ path: wtPath, branch: `worktree-${id}` }),
      },
      { match: 'gh pr list', respond: () => '[]' },
      { match: 'lsof +D', respond: () => '' },
      { match: 'log -1 --format=%ct HEAD', respond: () => String(TWO_HOURS_AGO_S) },
      { match: 'status --porcelain', respond: () => ' M file1\n M file2\n?? file3\n' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    expect(report.needs_review).toHaveLength(1)
    expect(report.needs_review[0].reason).toBe('dirty: 3')
  })

  // -------------------------------------------------------------------------

  it('9. unmerged: PR not found AND log shows commits AND cherry shows + → needs_review with N commits ahead', async () => {
    const id = 'agent-iii'
    const wtPath = `${WORKTREES_DIR}/${id}`

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          porcelainBlock({ path: wtPath, branch: `worktree-${id}` }),
      },
      { match: 'gh pr list', respond: () => '[]' },
      { match: 'lsof +D', respond: () => '' },
      { match: 'log -1 --format=%ct HEAD', respond: () => String(TWO_HOURS_AGO_S) },
      { match: 'status --porcelain', respond: () => '' },
      { match: '--not origin/main --oneline', respond: () => 'sha1 commit1\nsha2 commit2\n' },
      { match: 'cherry origin/main', respond: () => '+ sha1\n+ sha2\n' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    expect(report.needs_review).toHaveLength(1)
    expect(report.needs_review[0].reason).toBe('2 commit(s) ahead')
  })

  // -------------------------------------------------------------------------

  it('10. merged-via-PR: gh pr list returns branch → cleaned with reason clean+merged+pr', async () => {
    const id = 'agent-jjj'
    const wtPath = `${WORKTREES_DIR}/${id}`
    const branch = `worktree-${id}`

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          porcelainBlock({ path: wtPath, branch }),
      },
      {
        match: 'gh pr list',
        respond: () => JSON.stringify([{ number: 100, headRefName: branch }]),
      },
      { match: 'lsof +D', respond: () => '' },
      { match: 'log -1 --format=%ct HEAD', respond: () => String(TWO_HOURS_AGO_S) },
      { match: 'status --porcelain', respond: () => '' },
      { match: 'git worktree remove', respond: () => '' },
      { match: 'git branch -D', respond: () => '' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    expect(report.cleaned).toHaveLength(1)
    expect(report.cleaned[0].reason).toBe('clean+merged+pr')
  })

  // -------------------------------------------------------------------------

  it('11. merged-via-ff: log empty → cleaned with reason clean+merged+ff', async () => {
    const id = 'agent-kkk'
    const wtPath = `${WORKTREES_DIR}/${id}`

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          porcelainBlock({ path: wtPath, branch: `worktree-${id}` }),
      },
      { match: 'gh pr list', respond: () => '[]' },
      { match: 'lsof +D', respond: () => '' },
      { match: 'log -1 --format=%ct HEAD', respond: () => String(TWO_HOURS_AGO_S) },
      { match: 'status --porcelain', respond: () => '' },
      { match: '--not origin/main --oneline', respond: () => '' },
      { match: 'git worktree remove', respond: () => '' },
      { match: 'git branch -D', respond: () => '' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    expect(report.cleaned).toHaveLength(1)
    expect(report.cleaned[0].reason).toBe('clean+merged+ff')
  })

  // -------------------------------------------------------------------------

  it('12. merged-via-squash: cherry empty (single-commit case) → cleaned with reason clean+merged+squash', async () => {
    const id = 'agent-lll'
    const wtPath = `${WORKTREES_DIR}/${id}`

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          porcelainBlock({ path: wtPath, branch: `worktree-${id}` }),
      },
      { match: 'gh pr list', respond: () => '[]' },
      { match: 'lsof +D', respond: () => '' },
      { match: 'log -1 --format=%ct HEAD', respond: () => String(TWO_HOURS_AGO_S) },
      { match: 'status --porcelain', respond: () => '' },
      { match: '--not origin/main --oneline', respond: () => 'sha1 commit\n' },
      { match: 'cherry origin/main', respond: () => '- sha1\n' },
      { match: 'git worktree remove', respond: () => '' },
      { match: 'git branch -D', respond: () => '' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    expect(report.cleaned).toHaveLength(1)
    expect(report.cleaned[0].reason).toBe('clean+merged+squash')
  })

  // -------------------------------------------------------------------------

  it('13. cap exceeded: 25 worktrees, cap=20 → scanned=20, deferred_by_cap=5', async () => {
    const dirs = Array.from({ length: 25 }, (_, i) => ({
      name: `agent-${String(i).padStart(3, '0')}`,
      isDirectory: () => true,
    }))
    vi.mocked(fsMock.readdirSync).mockReturnValue(dirs as any)
    vi.mocked(fsMock.statSync).mockImplementation(
      (p: any) => ({ mtimeMs: Date.now() - parseInt(p.toString().slice(-3), 10) * 1000 }) as any
    )

    // Build a porcelain output with 25 entries, all skipped via alive-PID lock
    let porcelain = porcelainBlock({ path: REPO, branch: 'main' }) + '\n'
    for (let i = 0; i < 25; i++) {
      porcelain +=
        porcelainBlock({
          path: `${WORKTREES_DIR}/agent-${String(i).padStart(3, '0')}`,
          branch: `wt-${i}`,
          locked: `claude agent agent-${String(i).padStart(3, '0')} (pid 99999)`,
        }) + '\n'
    }

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      { match: 'git worktree list --porcelain', respond: () => porcelain },
      { match: 'gh pr list', respond: () => '[]' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    // Alive PIDs → all 20 scanned worktrees are skipped (no cleaned, no needs_review)
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => true)
    const report = JSON.parse(result.message)

    expect(report.deferred_by_cap).toBe(5)
    expect(report.scanned).toBe(20)
  })

  // -------------------------------------------------------------------------

  it('14. idempotent: empty worktrees dir → scanned=0, cleaned=[], needs_review=[]', async () => {
    vi.mocked(fsMock.readdirSync).mockReturnValue([])

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () => porcelainBlock({ path: REPO, branch: 'main' }),
      },
      { match: 'gh pr list', respond: () => '[]' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    expect(report.scanned).toBe(0)
    expect(report.cleaned).toHaveLength(0)
    expect(report.needs_review).toHaveLength(0)
    expect(report.errors).toHaveLength(0)
  })

  // -------------------------------------------------------------------------

  it('15. git command failure: worktree-remove throws, others continue; failure logged in errors[]', async () => {
    const ids = ['agent-mmm', 'agent-nnn']
    vi.mocked(fsMock.readdirSync).mockReturnValue(
      ids.map((id) => ({ name: id, isDirectory: () => true })) as any
    )
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    let removeCallCount = 0
    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          ids
            .map((id) => porcelainBlock({ path: `${WORKTREES_DIR}/${id}`, branch: `wt-${id}` }))
            .join('\n'),
      },
      { match: 'gh pr list', respond: () => '[]' },
      { match: 'lsof +D', respond: () => '' },
      { match: 'log -1 --format=%ct HEAD', respond: () => String(TWO_HOURS_AGO_S) },
      { match: 'status --porcelain', respond: () => '' },
      { match: '--not origin/main --oneline', respond: () => '' },
      {
        match: 'git worktree remove --force',
        respond: () => {
          removeCallCount++
          if (removeCallCount === 1) {
            throw new Error('worktree is dirty (forced)')
          }
          return ''
        },
      },
      { match: 'git branch -D', respond: () => '' },
    ])

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    // First worktree failed; second succeeded.
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].message).toContain('remove failed')
    expect(report.cleaned).toHaveLength(1)
  })

  // -------------------------------------------------------------------------

  it('16. worktrees dir absent: returns scanned=0 with init error in errors[]', async () => {
    vi.mocked(fsMock.existsSync).mockReturnValue(false)

    const { executeWorktreeDoctor } = await getModule()
    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, () => false)
    const report = JSON.parse(result.message)

    expect(report.scanned).toBe(0)
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0].id).toBe('<init>')
    expect(report.errors[0].message).toContain('not found')
  })

  // -------------------------------------------------------------------------

  it('17. PidChecker EPERM treated as alive → skipped same as alive PID', async () => {
    const id = 'agent-ppp'
    const wtPath = `${WORKTREES_DIR}/${id}`

    vi.mocked(fsMock.readdirSync).mockReturnValue([{ name: id, isDirectory: () => true } as any])
    vi.mocked(fsMock.statSync).mockReturnValue({ mtimeMs: Date.now() } as any)

    setupExecMock(vi.mocked(cpMock.execSync), [
      { match: 'git fetch', respond: () => '' },
      {
        match: 'git worktree list --porcelain',
        respond: () =>
          porcelainBlock({ path: REPO, branch: 'main' }) +
          '\n' +
          porcelainBlock({
            path: wtPath,
            branch: `worktree-${id}`,
            locked: `claude agent ${id} (pid 12345)`,
          }),
      },
      { match: 'gh pr list', respond: () => '[]' },
    ])

    // Default PidChecker calls process.kill — set killSpy to throw EPERM.
    killSpy.mockImplementation(() => {
      const err: NodeJS.ErrnoException = new Error('EPERM')
      err.code = 'EPERM'
      throw err
    })

    const { executeWorktreeDoctor, defaultPidChecker } = await getModule()
    expect(defaultPidChecker(12345)).toBe(true) // EPERM → alive

    const result = await executeWorktreeDoctor({ apply: true, cap: 20 }, defaultPidChecker)
    const report = JSON.parse(result.message)

    expect(report.cleaned).toHaveLength(0)
    expect(report.needs_review).toHaveLength(0) // skipped, not surfaced
  })

  // -------------------------------------------------------------------------

  it('18. PidChecker ESRCH treated as dead → proceeds through gates', async () => {
    const { defaultPidChecker } = await getModule()
    // killSpy default throws ESRCH
    expect(defaultPidChecker(99999)).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Parser unit tests
  // -------------------------------------------------------------------------

  it('parser: handles worktree blocks separated by blank lines', async () => {
    const { parseWorktreeList } = await getModule()
    const input = `worktree /repo
HEAD aaa
branch refs/heads/main

worktree /repo/.claude/worktrees/agent-x
HEAD bbb
branch refs/heads/wt-x
locked claude agent agent-x (pid 1234)
`
    const records = parseWorktreeList(input)
    expect(records).toHaveLength(2)
    expect(records[0].path).toBe('/repo')
    expect(records[0].branch).toBe('main')
    expect(records[1].locked?.reason).toBe('claude agent agent-x (pid 1234)')
  })

  it('parser: handles bare locked line', async () => {
    const { parseWorktreeList, classifyLock } = await getModule()
    const input = `worktree /a
branch refs/heads/x
locked
`
    const records = parseWorktreeList(input)
    expect(records[0].locked?.reason).toBe('')
    const cls = classifyLock(records[0].locked!.reason)
    expect(cls.kind).toBe('foreign')
  })

  it('parser: classifies claude-agent-pid pattern', async () => {
    const { classifyLock } = await getModule()
    const cls = classifyLock('claude agent agent-abc (pid 27557)')
    expect(cls.kind).toBe('claude-agent')
    if (cls.kind === 'claude-agent') {
      expect(cls.pid).toBe(27557)
    }
  })
})
