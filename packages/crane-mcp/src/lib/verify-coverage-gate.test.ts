/**
 * Unit tests for evaluateVerifyCoverageGate (Layer 4c).
 *
 * The gate is best-effort and depends on git + a classifier script. Tests
 * exercise the decision tree using a fake repo root (so git commands fail
 * predictably) and an injected getSessionCount, isolating the policy logic
 * from the surrounding infrastructure.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluateVerifyCoverageGate } from './verify-coverage-gate.js'

// Manifest matching the production shape just enough to drive classification.
const MANIFEST_JSON = {
  surface_classes: {
    'mcp-tool': {
      paths: ['packages/crane-mcp/src/tools/*.ts'],
      exclude_paths: ['packages/crane-mcp/src/tools/*.test.ts'],
    },
    'fleet-artifact': { paths: ['scripts/sync-commands.sh'] },
    'config-canon': { paths: ['config/*.json'] },
    skill: { paths: ['.claude/commands/*.md'] },
  },
  exempt_classes: {
    'docs-only': { paths: ['docs/**/*.md'] },
  },
}

// Build a minimal repo with a real git history so the gate can run its
// `git diff origin/main...HEAD` and `git status` checks against actual git
// state. This is the smallest reproduction that exercises both empty-diff
// and non-empty-diff branches without mocking execSync.
function makeRepo(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'verify-cov-repo-'))
  const run = (cmd: string) =>
    execSync(cmd, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] }).toString()

  // Force initial branch to `main` regardless of the user's global
  // `init.defaultBranch` so the test is portable across machines (some
  // dev environments default to main, the harness-runner default does not).
  run('git -c init.defaultBranch=main init -q')
  run('git config user.email test@example.com')
  run('git config user.name test')
  // Switch to (or create) main. If main already exists from init.defaultBranch,
  // -B is idempotent; if not, -B creates it. Either way, we end on main.
  run('git checkout -q -B main')
  writeFileSync(join(dir, 'README.md'), '# repo\n')
  run('git add README.md')
  run('git commit -q -m initial')
  // Establish a fake `origin/main` ref pointing at the same commit so
  // `origin/main...HEAD` resolves cleanly.
  run('git update-ref refs/remotes/origin/main HEAD')

  const cleanup = () => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
  return { dir, cleanup }
}

function writeManifest(): string {
  // Write outside the repo so it doesn't show up in `git status --porcelain`
  // and accidentally make the working tree look dirty.
  const dir = mkdtempSync(join(tmpdir(), 'verify-cov-manifest-'))
  const path = join(dir, 'eos-gate-surfaces.json')
  writeFileSync(path, JSON.stringify(MANIFEST_JSON, null, 2))
  return path
}

// Path to the real classifier — it's a pure node script with no repo deps.
const CLASSIFY_SCRIPT = join(__dirname, '..', '..', '..', '..', 'scripts', 'eos-gate-classify.mjs')

describe('evaluateVerifyCoverageGate', () => {
  let repo: ReturnType<typeof makeRepo>
  let manifestPath: string

  beforeEach(() => {
    repo = makeRepo()
    manifestPath = writeManifest()
  })

  it('returns should_block:false when working tree is clean and no commits ahead', async () => {
    // Debug: confirm clean state via raw git
    const diffExit = execSync('git diff --quiet origin/main...HEAD; echo $?', {
      cwd: repo.dir,
      encoding: 'utf-8',
    }).trim()
    const status = execSync('git status --porcelain', {
      cwd: repo.dir,
      encoding: 'utf-8',
    }).trim()
    expect(diffExit).toBe('0')
    expect(status).toBe('')

    const gate = await evaluateVerifyCoverageGate({
      repoRoot: repo.dir,
      classifyScript: CLASSIFY_SCRIPT,
      manifestPath,
      sessionId: 'sess_test',
      getSessionCount: async () => 0,
    })
    expect(gate.should_block).toBe(false)
    expect(gate.reason).toMatch(/no diff vs origin\/main/)
    repo.cleanup()
  })

  it('blocks when surface class is touched and no verifications recorded', async () => {
    // Add an mcp-tool change (uncommitted is fine; gate sees it via git diff HEAD).
    const toolPath = join(repo.dir, 'packages/crane-mcp/src/tools')
    mkdirSync(toolPath, { recursive: true })
    writeFileSync(join(toolPath, 'fake.ts'), 'export const x = 1\n')

    const gate = await evaluateVerifyCoverageGate({
      repoRoot: repo.dir,
      classifyScript: CLASSIFY_SCRIPT,
      manifestPath,
      sessionId: 'sess_test',
      getSessionCount: async () => 0,
    })
    expect(gate.should_block).toBe(true)
    expect(gate.surfaces_touched).toContain('mcp-tool')
    expect(gate.reason).toMatch(/No crane_verify records/)
    expect(gate.verify_count).toBe(0)
    repo.cleanup()
  })

  it('passes when surface class is touched but verifications were recorded', async () => {
    const toolPath = join(repo.dir, 'packages/crane-mcp/src/tools')
    mkdirSync(toolPath, { recursive: true })
    writeFileSync(join(toolPath, 'fake.ts'), 'export const x = 1\n')

    const gate = await evaluateVerifyCoverageGate({
      repoRoot: repo.dir,
      classifyScript: CLASSIFY_SCRIPT,
      manifestPath,
      sessionId: 'sess_test',
      getSessionCount: async () => 3,
    })
    expect(gate.should_block).toBe(false)
    expect(gate.reason).toMatch(/3 verification\(s\) recorded/)
    expect(gate.verify_count).toBe(3)
    repo.cleanup()
  })

  it('passes when only docs (exempt) are touched', async () => {
    const docsPath = join(repo.dir, 'docs')
    mkdirSync(docsPath, { recursive: true })
    writeFileSync(join(docsPath, 'note.md'), '# note\n')

    const gate = await evaluateVerifyCoverageGate({
      repoRoot: repo.dir,
      classifyScript: CLASSIFY_SCRIPT,
      manifestPath,
      sessionId: 'sess_test',
      getSessionCount: async () => 0,
    })
    expect(gate.should_block).toBe(false)
    expect(gate.reason).toMatch(/no verify-required surface classes touched/)
    repo.cleanup()
  })

  it('passes when only skill files are touched (Layer 2 already covers them)', async () => {
    const cmdsPath = join(repo.dir, '.claude/commands')
    mkdirSync(cmdsPath, { recursive: true })
    writeFileSync(join(cmdsPath, 'newskill.md'), '# new skill\n')

    const gate = await evaluateVerifyCoverageGate({
      repoRoot: repo.dir,
      classifyScript: CLASSIFY_SCRIPT,
      manifestPath,
      sessionId: 'sess_test',
      getSessionCount: async () => 0,
    })
    expect(gate.should_block).toBe(false)
    expect(gate.reason).toMatch(/no verify-required surface classes touched/)
    repo.cleanup()
  })

  it('skips with should_block:false when classifier is missing', async () => {
    const toolPath = join(repo.dir, 'packages/crane-mcp/src/tools')
    mkdirSync(toolPath, { recursive: true })
    writeFileSync(join(toolPath, 'fake.ts'), 'export const x = 1\n')

    const gate = await evaluateVerifyCoverageGate({
      repoRoot: repo.dir,
      classifyScript: '/nonexistent/classify.mjs',
      manifestPath,
      sessionId: 'sess_test',
      getSessionCount: async () => 0,
    })
    expect(gate.should_block).toBe(false)
    expect(gate.reason).toMatch(/classifier unavailable/)
    repo.cleanup()
  })

  it('skips with should_block:false when getSessionCount throws', async () => {
    const toolPath = join(repo.dir, 'packages/crane-mcp/src/tools')
    mkdirSync(toolPath, { recursive: true })
    writeFileSync(join(toolPath, 'fake.ts'), 'export const x = 1\n')

    const gate = await evaluateVerifyCoverageGate({
      repoRoot: repo.dir,
      classifyScript: CLASSIFY_SCRIPT,
      manifestPath,
      sessionId: 'sess_test',
      getSessionCount: async () => {
        throw new Error('api unreachable')
      },
    })
    expect(gate.should_block).toBe(false)
    expect(gate.reason).toMatch(/verify-ledger lookup failed/)
    repo.cleanup()
  })
})
