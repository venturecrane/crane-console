/**
 * Unit tests for evaluateVerifyCoverageGate (Layer 4c).
 *
 * The gate is best-effort and depends on git + a classifier script. Tests
 * exercise the decision tree using a real throwaway git repo and an injected
 * getSessionVerifications, isolating the relevance + aliveness + seam-trigger
 * policy from the surrounding infrastructure.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { evaluateVerifyCoverageGate, type VerificationDetail } from './verify-coverage-gate.js'

// Manifest matching the production shape just enough to drive classification.
const MANIFEST_JSON = {
  surface_classes: {
    'mcp-tool': {
      paths: ['packages/crane-mcp/src/tools/*.ts'],
      exclude_paths: ['packages/crane-mcp/src/tools/*.test.ts'],
    },
    'fleet-artifact': { paths: ['scripts/sync-commands.sh'] },
    'config-canon': { paths: ['config/*.json'] },
    'app-data-seam': { paths: ['src/pages/**/*.astro'] },
    skill: { paths: ['.claude/commands/*.md'] },
  },
  exempt_classes: {
    'docs-only': { paths: ['docs/**/*.md'] },
  },
}

const TOOL_FILE = 'packages/crane-mcp/src/tools/fake.ts'

// Strip every GIT_* env var so child git processes don't target the parent
// worktree (vitest inherits GIT_* when run from a hook). See original note.
function makeChildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key]
  }
  return env
}

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

function gitIn(dir: string, subcmd: string): string {
  try {
    return execSync(`git ${ISOLATED} ${subcmd}`, {
      cwd: dir,
      env: makeChildEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString()
  } catch (err) {
    const e = err as { stderr?: Buffer; stdout?: Buffer; message: string }
    throw new Error(`${e.message}\n${e.stderr?.toString() ?? ''}\n${e.stdout?.toString() ?? ''}`)
  }
}

function makeRepo(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'verify-cov-repo-'))
  gitIn(dir, 'init -q')
  gitIn(dir, 'config user.email test@example.com')
  gitIn(dir, 'config user.name test')
  gitIn(dir, 'checkout -q -B main')
  writeFileSync(join(dir, 'README.md'), '# repo\n')
  gitIn(dir, 'add README.md')
  gitIn(dir, 'commit -q -m initial')
  gitIn(dir, 'update-ref refs/remotes/origin/main HEAD')
  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    },
  }
}

function writeManifest(): string {
  const dir = mkdtempSync(join(tmpdir(), 'verify-cov-manifest-'))
  const path = join(dir, 'eos-gate-surfaces.json')
  writeFileSync(path, JSON.stringify(MANIFEST_JSON, null, 2))
  return path
}

/** Drop an uncommitted mcp-tool change so the gate sees a surface seam. */
function addToolSeam(dir: string, body = 'export const x = 1\n'): void {
  const toolPath = join(dir, 'packages/crane-mcp/src/tools')
  mkdirSync(toolPath, { recursive: true })
  writeFileSync(join(toolPath, 'fake.ts'), body)
}

function verif(overrides: Partial<VerificationDetail> = {}): VerificationDetail {
  return {
    id: 'vfy_test',
    method: 'live_state',
    files_touched: [TOOL_FILE],
    output_nonempty: true,
    ...overrides,
  }
}

const CLASSIFY_SCRIPT = join(__dirname, '..', '..', '..', '..', 'scripts', 'eos-gate-classify.mjs')

function run(
  repoDir: string,
  manifestPath: string,
  getSessionVerifications: () => Promise<VerificationDetail[]>,
  classifyScript = CLASSIFY_SCRIPT
) {
  return evaluateVerifyCoverageGate({
    repoRoot: repoDir,
    classifyScript,
    manifestPath,
    sessionId: 'sess_test',
    getSessionVerifications,
  })
}

describe('evaluateVerifyCoverageGate', () => {
  let repo: ReturnType<typeof makeRepo>
  let manifestPath: string

  beforeEach(() => {
    repo = makeRepo()
    manifestPath = writeManifest()
  })

  it('does not block when working tree is clean and no commits ahead', async () => {
    const gate = await run(repo.dir, manifestPath, async () => [])
    expect(gate.should_block).toBe(false)
    expect(gate.reason).toMatch(/no diff vs origin\/main/)
    repo.cleanup()
  })

  it('blocks when a surface seam is touched and no verification qualifies', async () => {
    addToolSeam(repo.dir)
    const gate = await run(repo.dir, manifestPath, async () => [])
    expect(gate.should_block).toBe(true)
    expect(gate.surfaces_touched).toContain('mcp-tool')
    expect(gate.reason).toMatch(/no crane_verify record this session PROVES/i)
    expect(gate.qualifying_count).toBe(0)
    repo.cleanup()
  })

  it('passes when a live, relevant verification proves the changed seam', async () => {
    addToolSeam(repo.dir)
    const gate = await run(repo.dir, manifestPath, async () => [verif()])
    expect(gate.should_block).toBe(false)
    expect(gate.qualifying_count).toBe(1)
    expect(gate.reason).toMatch(/prove the changed seam/)
    repo.cleanup()
  })

  it('blocks a relevant verification whose output was a stub (aliveness)', async () => {
    addToolSeam(repo.dir)
    const gate = await run(repo.dir, manifestPath, async () => [verif({ output_nonempty: false })])
    expect(gate.should_block).toBe(true)
    expect(gate.qualifying_count).toBe(0)
    repo.cleanup()
  })

  it('blocks a live verification whose files do not name the seam (relevance)', async () => {
    addToolSeam(repo.dir)
    const gate = await run(repo.dir, manifestPath, async () => [
      verif({ files_touched: ['some/other/file.ts'] }),
    ])
    expect(gate.should_block).toBe(true)
    repo.cleanup()
  })

  it('blocks a relevant alive verification that used vendor_docs (proof method)', async () => {
    addToolSeam(repo.dir)
    const gate = await run(repo.dir, manifestPath, async () => [verif({ method: 'vendor_docs' })])
    expect(gate.should_block).toBe(true)
    repo.cleanup()
  })

  it('covers app-data-seam paths (SS UI-renders-empty class)', async () => {
    const pagePath = join(repo.dir, 'src/pages/dashboard')
    mkdirSync(pagePath, { recursive: true })
    writeFileSync(join(pagePath, 'index.astro'), 'const rows = await db.all()\n')
    const gate = await run(repo.dir, manifestPath, async () => [])
    expect(gate.should_block).toBe(true)
    expect(gate.surfaces_touched).toContain('app-data-seam')
    repo.cleanup()
  })

  it('does not block a behaviorally-inert diff on a surface file (seam-trigger)', async () => {
    // Commit a tool file into origin/main, then make a comment-only edit.
    addToolSeam(repo.dir, 'export const x = 1\n')
    gitIn(repo.dir, 'add -A')
    gitIn(repo.dir, 'commit -q -m "add tool"')
    gitIn(repo.dir, 'update-ref refs/remotes/origin/main HEAD')
    writeFileSync(join(repo.dir, TOOL_FILE), 'export const x = 1\n// a clarifying comment\n')

    const gate = await run(repo.dir, manifestPath, async () => [])
    expect(gate.should_block).toBe(false)
    expect(gate.reason).toMatch(/behaviorally inert/)
    repo.cleanup()
  })

  it('passes when only docs (exempt) are touched', async () => {
    const docsPath = join(repo.dir, 'docs')
    mkdirSync(docsPath, { recursive: true })
    writeFileSync(join(docsPath, 'note.md'), '# note\n')
    const gate = await run(repo.dir, manifestPath, async () => [])
    expect(gate.should_block).toBe(false)
    expect(gate.reason).toMatch(/no verify-required surface classes touched/)
    repo.cleanup()
  })

  it('passes when only skill files are touched (Layer 2 covers them)', async () => {
    const cmdsPath = join(repo.dir, '.claude/commands')
    mkdirSync(cmdsPath, { recursive: true })
    writeFileSync(join(cmdsPath, 'newskill.md'), '# new skill\n')
    const gate = await run(repo.dir, manifestPath, async () => [])
    expect(gate.should_block).toBe(false)
    expect(gate.reason).toMatch(/no verify-required surface classes touched/)
    repo.cleanup()
  })

  it('skips (no block) when the classifier is missing', async () => {
    addToolSeam(repo.dir)
    const gate = await run(repo.dir, manifestPath, async () => [], '/nonexistent/classify.mjs')
    expect(gate.should_block).toBe(false)
    expect(gate.reason).toMatch(/classifier unavailable/)
    repo.cleanup()
  })

  it('fails open but LOUD (degraded) when the ledger lookup throws', async () => {
    addToolSeam(repo.dir)
    const gate = await run(repo.dir, manifestPath, async () => {
      throw new Error('api unreachable')
    })
    expect(gate.should_block).toBe(false)
    expect(gate.degraded).toBe(true)
    expect(gate.reason).toMatch(/degraded/i)
    repo.cleanup()
  })
})
