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
// When running inside a git hook (pre-push, pre-commit) — and apparently
// also inside vitest's harness, which inherits any GIT_* env from its
// parent — git child processes see GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE
// pointing at the parent worktree's .git. Even with `cwd: dir` set, git
// prefers the env override and writes the test's "initial" commit into
// the parent repo, corrupting it. Strip every GIT_* env var from the
// child env to fully isolate.
function makeChildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key]
  }
  return env
}

function makeRepo(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'verify-cov-repo-'))
  // Run git commands in the test repo with isolated config (no user-level
  // hooks, no signing, no commit template) so this test stays portable
  // across dev machines. Each command gets `-c` overrides explicitly.
  const ISOLATED = [
    '-c',
    'init.defaultBranch=main',
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'tag.gpgsign=false',
    '-c',
    'core.autocrlf=false',
    '-c',
    'commit.template=',
  ].join(' ')
  const childEnv = makeChildEnv()
  const run = (subcmd: string) => {
    try {
      return execSync(`git ${ISOLATED} ${subcmd}`, {
        cwd: dir,
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      }).toString()
    } catch (err) {
      // execSync's default Error swallows git stderr. Surface it so test
      // failures inside CI hooks aren't opaque.
      const e = err as { stderr?: Buffer; stdout?: Buffer; message: string }
      const stderr = e.stderr?.toString() ?? ''
      const stdout = e.stdout?.toString() ?? ''
      throw new Error(`${e.message}\n--- stderr ---\n${stderr}\n--- stdout ---\n${stdout}`)
    }
  }

  run('init -q')
  run('config user.email test@example.com')
  run('config user.name test')
  // -B is idempotent: switches to main if it exists, creates it if not.
  run('checkout -q -B main')
  writeFileSync(join(dir, 'README.md'), '# repo\n')
  run('add README.md')
  run('commit -q -m initial')
  // Establish a fake `origin/main` ref pointing at the same commit so
  // `origin/main...HEAD` resolves cleanly.
  run('update-ref refs/remotes/origin/main HEAD')

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
