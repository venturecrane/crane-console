/**
 * Tests for pr-merge-gate.ts (Layer 4b of the EOS surface verification gate).
 *
 * Mocks `execSync` to simulate git/gh CLI responses across the decision tree.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execSync } from 'node:child_process'

vi.mock('node:child_process')

const getModule = async () => {
  vi.resetModules()
  return import('./pr-merge-gate.js')
}

function mockExec(map: Record<string, string | Error>) {
  vi.mocked(execSync).mockImplementation((cmd) => {
    const cmdStr = String(cmd)
    for (const [pattern, response] of Object.entries(map)) {
      if (cmdStr.includes(pattern)) {
        if (response instanceof Error) throw response
        return response as unknown as Buffer
      }
    }
    throw new Error(`Unmocked command: ${cmdStr}`)
  })
}

describe('evaluatePrMergeGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips on main branch', async () => {
    mockExec({
      'gh --version': 'gh version 2.40.0',
      'git branch --show-current': 'main',
    })
    const { evaluatePrMergeGate } = await getModule()
    const result = evaluatePrMergeGate()
    expect(result.should_block).toBe(false)
    expect(result.reason).toContain('not on a feature branch')
  })

  it('skips when gh CLI is missing', async () => {
    mockExec({
      'gh --version': new Error('command not found'),
      'git branch --show-current': 'feature/foo',
    })
    const { evaluatePrMergeGate } = await getModule()
    const result = evaluatePrMergeGate()
    expect(result.should_block).toBe(false)
    expect(result.reason).toContain('gh CLI not available')
  })

  it('passes when no open PR for current branch', async () => {
    mockExec({
      'gh --version': 'gh version 2.40.0',
      'git branch --show-current': 'feature/foo',
      'gh pr list --head': '[]',
      'gh pr list --author @me': '[]',
    })
    const { evaluatePrMergeGate } = await getModule()
    const result = evaluatePrMergeGate()
    expect(result.should_block).toBe(false)
    expect(result.open_prs).toHaveLength(0)
  })

  it('blocks when open PR has FAILURE check', async () => {
    const prJson = JSON.stringify([
      {
        number: 42,
        title: 'feat: add /estimate skill',
        state: 'OPEN',
        headRefName: 'feature/estimate',
        url: 'https://github.com/venturecrane/crane-console/pull/42',
        mergeable: 'MERGEABLE',
        updatedAt: '2026-05-05T20:00:00Z',
        statusCheckRollup: [
          { name: 'verify', conclusion: 'FAILURE', status: 'COMPLETED' },
          { name: 'lint', conclusion: 'SUCCESS', status: 'COMPLETED' },
        ],
      },
    ])
    mockExec({
      'gh --version': 'gh version 2.40.0',
      'git branch --show-current': 'feature/estimate',
      'gh pr list --head': prJson,
      'gh pr list --author @me': '[]',
    })
    const { evaluatePrMergeGate } = await getModule()
    const result = evaluatePrMergeGate()
    expect(result.should_block).toBe(true)
    expect(result.blocking_pr_numbers).toEqual([42])
    expect(result.reason).toContain('PR #42')
    expect(result.reason).toContain('verify')
    expect(result.open_prs[0].failed_checks).toEqual(['verify'])
  })

  it('does not block when checks are all green', async () => {
    const prJson = JSON.stringify([
      {
        number: 99,
        title: 'feat: add new skill',
        state: 'OPEN',
        headRefName: 'feature/new-skill',
        url: 'https://github.com/test/repo/pull/99',
        mergeable: 'MERGEABLE',
        updatedAt: '2026-05-05T20:00:00Z',
        statusCheckRollup: [{ name: 'verify', conclusion: 'SUCCESS', status: 'COMPLETED' }],
      },
    ])
    mockExec({
      'gh --version': 'gh version 2.40.0',
      'git branch --show-current': 'feature/new-skill',
      'gh pr list --head': prJson,
      'gh pr list --author @me': '[]',
    })
    const { evaluatePrMergeGate } = await getModule()
    const result = evaluatePrMergeGate()
    expect(result.should_block).toBe(false)
    expect(result.open_prs).toHaveLength(1)
    expect(result.reason).toContain('checks green or pending')
  })

  it('does not block when checks are pending', async () => {
    const prJson = JSON.stringify([
      {
        number: 100,
        title: 'feat: x',
        state: 'OPEN',
        headRefName: 'feature/x',
        url: 'https://github.com/test/repo/pull/100',
        mergeable: 'MERGEABLE',
        updatedAt: '2026-05-05T20:00:00Z',
        statusCheckRollup: [{ name: 'verify', conclusion: null, status: 'IN_PROGRESS' }],
      },
    ])
    mockExec({
      'gh --version': 'gh version 2.40.0',
      'git branch --show-current': 'feature/x',
      'gh pr list --head': prJson,
      'gh pr list --author @me': '[]',
    })
    const { evaluatePrMergeGate } = await getModule()
    const result = evaluatePrMergeGate()
    expect(result.should_block).toBe(false)
    expect(result.open_prs[0].pending_checks).toEqual(['verify'])
  })

  it('catches PRs from @me search even when current branch has no PR', async () => {
    const headPrs = '[]'
    const recentPrs = JSON.stringify([
      {
        number: 17,
        title: 'feat: docs-audit',
        state: 'OPEN',
        headRefName: 'docs-audit-branch',
        url: 'https://github.com/test/repo/pull/17',
        mergeable: 'MERGEABLE',
        updatedAt: '2026-05-05T18:00:00Z',
        statusCheckRollup: [{ name: 'tests', conclusion: 'FAILURE', status: 'COMPLETED' }],
      },
    ])
    mockExec({
      'gh --version': 'gh version 2.40.0',
      'git branch --show-current': 'feature/different',
      'gh pr list --head': headPrs,
      'gh pr list --author @me': recentPrs,
    })
    const { evaluatePrMergeGate } = await getModule()
    const result = evaluatePrMergeGate()
    expect(result.should_block).toBe(true)
    expect(result.blocking_pr_numbers).toEqual([17])
  })

  it('deduplicates PRs that appear in both queries', async () => {
    const sharedPr = {
      number: 42,
      title: 'feat: shared',
      state: 'OPEN',
      headRefName: 'feature/shared',
      url: 'https://github.com/test/repo/pull/42',
      mergeable: 'MERGEABLE',
      updatedAt: '2026-05-05T20:00:00Z',
      statusCheckRollup: [{ name: 'verify', conclusion: 'SUCCESS', status: 'COMPLETED' }],
    }
    mockExec({
      'gh --version': 'gh version 2.40.0',
      'git branch --show-current': 'feature/shared',
      'gh pr list --head': JSON.stringify([sharedPr]),
      'gh pr list --author @me': JSON.stringify([sharedPr]),
    })
    const { evaluatePrMergeGate } = await getModule()
    const result = evaluatePrMergeGate()
    expect(result.open_prs).toHaveLength(1)
  })

  it('treats CANCELLED checks as failures', async () => {
    const prJson = JSON.stringify([
      {
        number: 7,
        title: 'feat: x',
        state: 'OPEN',
        headRefName: 'feature/x',
        url: 'https://github.com/test/repo/pull/7',
        mergeable: 'MERGEABLE',
        updatedAt: '2026-05-05T20:00:00Z',
        statusCheckRollup: [{ name: 'deploy', conclusion: 'CANCELLED', status: 'COMPLETED' }],
      },
    ])
    mockExec({
      'gh --version': 'gh version 2.40.0',
      'git branch --show-current': 'feature/x',
      'gh pr list --head': prJson,
      'gh pr list --author @me': '[]',
    })
    const { evaluatePrMergeGate } = await getModule()
    const result = evaluatePrMergeGate()
    expect(result.should_block).toBe(true)
    expect(result.open_prs[0].failed_checks).toContain('deploy')
  })
})
