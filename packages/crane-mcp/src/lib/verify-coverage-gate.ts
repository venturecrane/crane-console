/**
 * verify-coverage-gate.ts — EOS-time verify-coverage gate (Layer 4c of the EOS surface verification gate).
 *
 * Catches the failure mode captured by `feedback_verify_fix_end_to_end.md` and
 * `feedback_verify_root_cause_before_fixing.md`: agents merge cross-boundary
 * surface changes (mcp-tool, boot-config, fleet-artifact, config-canon)
 * without running fresh-process / live-state verification. Layer 4b catches
 * the next-most-direct failure (red CI on open PRs); Layer 4c catches the
 * subtler one (PR ships green but the runtime claim was never tested).
 *
 * Decision tree (any "yes" short-circuits to should_block: false):
 *   1. Is gh or git unavailable, or are we not in a git repo? → skip
 *   2. Is the diff origin/main..HEAD empty AND working tree clean? → skip
 *      (this captures doc-only sessions, fleet machines doing read-only work,
 *      agents reviewing without writing — without depending on branch names)
 *   3. Did the diff touch only skill / docs / tests / build-info? → skip
 *      (skill triplet drift is caught by Layer 2; the rest are exempt)
 *   4. Was the verify_ledger written to in this session at least once?
 *      Yes → skip. No → block.
 *
 * Best-effort by design: any infra failure (gh missing, classifier exit ≠ 0,
 * fetch failure, etc.) returns should_block: false. Never fail closed on
 * gate-infrastructure problems.
 *
 * Branch-name heuristics are intentionally NOT used — direct-on-main hotfixes
 * are the riskiest case and a "feature branch only" check would let them
 * bypass the gate.
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Surface classes that warrant a verify-coverage gate.
 *
 * `skill` is intentionally excluded — Layer 2's skill-triplet check already
 * covers the most common skill failure mode (.claude/commands edited without
 * regenerating .agents/skills/ and .gemini/commands/), and the verify gate
 * would mostly produce false positives on routine skill prose changes.
 */
const SURFACE_CLASSES_REQUIRING_VERIFY = new Set<string>([
  'mcp-tool',
  'boot-config',
  'fleet-artifact',
  'config-canon',
])

export interface VerifyCoverageGateInput {
  /** Path to the repo root (where config/eos-gate-surfaces.json lives) */
  repoRoot: string
  /** Path to the eos-gate-classify.mjs script */
  classifyScript: string
  /** Path to the manifest JSON */
  manifestPath: string
  /** Session ID for ledger lookup (passed in from session context) */
  sessionId: string
  /**
   * Function that returns the verify-ledger record count for the session.
   * Wrapped so the gate can be tested without network. The caller
   * (`handoff.ts`) wires this to `api.getVerifySessionCount(sessionId)`.
   */
  getSessionCount: (sessionId: string) => Promise<number>
}

export interface VerifyCoverageGateResult {
  branch: string | null
  /** Names of surface classes the diff touches (post-classification) */
  surfaces_touched: string[]
  /** Verify-ledger row count for this session at gate-evaluation time */
  verify_count: number
  should_block: boolean
  reason: string
}

/**
 * Build a child env with every GIT_* var stripped so child git invocations
 * don't inherit hook-context state (GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE
 * etc.) and accidentally target the parent repository when we asked them
 * to run inside `cwd`. Matters when the gate is invoked from inside a git
 * hook (pre-push, pre-commit) — git pre-fills these vars and child
 * processes prefer them over the working directory.
 */
function gitChildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key]
  }
  return env
}

function safeExec(cmd: string, opts?: { cwd?: string }): string | null {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: gitChildEnv(),
      ...(opts?.cwd ? { cwd: opts.cwd } : {}),
    }).trim()
  } catch {
    return null
  }
}

function getCurrentBranch(repoRoot: string): string | null {
  const out = safeExec('git branch --show-current 2>/dev/null', { cwd: repoRoot })
  return out && out !== 'HEAD' ? out : null
}

/**
 * Returns true if the working tree changed nothing relative to origin/main —
 * i.e. neither has uncommitted edits nor commits ahead of origin/main.
 *
 * Uses two checks:
 *   1. `git diff --quiet origin/main...HEAD` — exit 0 means HEAD is at
 *      origin/main or its commits are already merged.
 *   2. `git status --porcelain` — empty means no uncommitted/untracked.
 *
 * Either failing means there IS something to verify.
 */
function diffIsEmpty(repoRoot: string): boolean {
  // `--quiet` returns exit 1 when there are differences; safeExec returns
  // null on non-zero exit, which is the "differences present" signal.
  const diffOk = safeExec('git diff --quiet origin/main...HEAD 2>/dev/null', { cwd: repoRoot })
  if (diffOk === null) return false

  const status = safeExec('git status --porcelain 2>/dev/null', { cwd: repoRoot })
  if (status === null) return false
  return status.length === 0
}

/**
 * Get the list of files changed in this session's branch vs origin/main,
 * including any uncommitted/untracked files. Returns empty list if git
 * unavailable or commands fail (caller treats this as "nothing to classify").
 */
function getChangedFiles(repoRoot: string): string[] {
  // Tracked changes vs origin/main (both committed and uncommitted)
  const committed = safeExec('git diff --name-only origin/main...HEAD 2>/dev/null', {
    cwd: repoRoot,
  })
  const uncommitted = safeExec('git diff --name-only HEAD 2>/dev/null', { cwd: repoRoot })
  const untracked = safeExec('git ls-files --others --exclude-standard 2>/dev/null', {
    cwd: repoRoot,
  })

  const all = new Set<string>()
  for (const block of [committed, uncommitted, untracked]) {
    if (!block) continue
    for (const line of block.split('\n')) {
      const f = line.trim()
      if (f) all.add(f)
    }
  }
  return Array.from(all)
}

interface ClassifyResult {
  requires_probe: boolean
  surfaces_touched: Record<string, string[]>
  exempt_files: string[]
  unclassified: string[]
}

/**
 * Run eos-gate-classify.mjs against the file list. Returns null on any
 * infra failure (script missing, exit ≠ 0, parse error). Caller treats
 * null as "skip the gate" — best-effort.
 */
function classifyFiles(
  classifyScript: string,
  manifestPath: string,
  files: string[],
  repoRoot: string
): ClassifyResult | null {
  if (!existsSync(classifyScript) || !existsSync(manifestPath)) return null
  if (files.length === 0) {
    return { requires_probe: false, surfaces_touched: {}, exempt_files: [], unclassified: [] }
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'verify-cov-'))
  const filesPath = join(tmpDir, 'files.txt')
  writeFileSync(filesPath, files.join('\n'), 'utf8')

  try {
    const out = safeExec(
      `node ${JSON.stringify(classifyScript)} --manifest ${JSON.stringify(manifestPath)} --files ${JSON.stringify(filesPath)}`,
      { cwd: repoRoot }
    )
    if (!out) return null
    return JSON.parse(out) as ClassifyResult
  } catch {
    return null
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  }
}

const SKIP_OK = (
  branch: string | null,
  reason: string,
  surfaces: string[] = [],
  count = 0
): VerifyCoverageGateResult => ({
  branch,
  surfaces_touched: surfaces,
  verify_count: count,
  should_block: false,
  reason,
})

export async function evaluateVerifyCoverageGate(
  input: VerifyCoverageGateInput
): Promise<VerifyCoverageGateResult> {
  const { repoRoot, classifyScript, manifestPath, sessionId, getSessionCount } = input

  // Step 1: gh/git availability
  const ghAvailable = safeExec('gh --version') !== null
  const gitAvailable = safeExec('git --version') !== null
  if (!ghAvailable || !gitAvailable) {
    return SKIP_OK(null, '[skip] gh or git not available; verify-coverage gate cannot evaluate')
  }

  // Confirm we're inside a git repo
  if (safeExec('git rev-parse --git-dir 2>/dev/null', { cwd: repoRoot }) === null) {
    return SKIP_OK(null, '[skip] not inside a git repository')
  }

  const branch = getCurrentBranch(repoRoot)

  // Step 2: diff-emptiness
  if (diffIsEmpty(repoRoot)) {
    return SKIP_OK(branch, '[skip] no diff vs origin/main and working tree clean')
  }

  // Step 3: classify changed files
  const files = getChangedFiles(repoRoot)
  const classified = classifyFiles(classifyScript, manifestPath, files, repoRoot)
  if (!classified) {
    return SKIP_OK(branch, '[skip] classifier unavailable; verify-coverage gate cannot evaluate')
  }

  const touchedSurfaces = Object.keys(classified.surfaces_touched).filter((c) =>
    SURFACE_CLASSES_REQUIRING_VERIFY.has(c)
  )

  if (touchedSurfaces.length === 0) {
    return SKIP_OK(
      branch,
      '[ok] no verify-required surface classes touched',
      Object.keys(classified.surfaces_touched)
    )
  }

  // Step 4: ledger lookup
  let count: number
  try {
    count = await getSessionCount(sessionId)
  } catch {
    // Best-effort: fail open on count-fetch failure.
    return SKIP_OK(
      branch,
      '[skip] verify-ledger lookup failed; gate cannot evaluate',
      touchedSurfaces
    )
  }

  if (count > 0) {
    return {
      branch,
      surfaces_touched: touchedSurfaces,
      verify_count: count,
      should_block: false,
      reason: `[ok] ${count} verification(s) recorded this session covering ${touchedSurfaces.join(', ')}`,
    }
  }

  return {
    branch,
    surfaces_touched: touchedSurfaces,
    verify_count: 0,
    should_block: true,
    reason:
      `[gate] No crane_verify records this session, but the diff touches ` +
      `${touchedSurfaces.join(', ')}. Record at least one verification of the runtime ` +
      `claim — fresh process, live state, or vendor docs. See docs/global/verify.md.`,
  }
}
