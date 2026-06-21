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
 *   3b. Is the diff on the surface files behaviorally inert (comments,
 *      imports, formatting only)? → skip (no seam to verify; avoids
 *      false-positives that train reflex-override)
 *   4. Does the session have ≥1 verification that PROVES a changed seam —
 *      a live_state/fresh_process record whose files_touched names a changed
 *      surface file AND whose captured output was alive (not []/empty)?
 *      Yes → skip. No → block. (Relevance + aliveness: "verified the thing
 *      you shipped", not "verified something".) Lookup failure → fail-open
 *      but mark the result `degraded` so the pass is recorded, not silent.
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
  // app-data-seam: read paths (worker endpoints, .astro pages, loaders) whose
  // failure mode is "renders honest-empty because the producer is dead". Added
  // so the SS-style "wasn't wired" failure is mechanically in scope, not just
  // deployment artifacts. Classification is by path glob in the manifest.
  'app-data-seam',
])

/**
 * Methods that count as PROOF a seam carried data. `vendor_docs` reads can be
 * relevant but never prove a runtime seam is alive — only a live_state or
 * fresh_process observation does. The policy lives here (gate), while the
 * content fact (`output_nonempty`) is computed server-side.
 */
const PROOF_METHODS = new Set<string>(['live_state', 'fresh_process'])

/** One verify-ledger row's gate-relevant facts (mirror of the worker shape). */
export interface VerificationDetail {
  id: string
  method: string
  files_touched: string[]
  output_nonempty: boolean
}

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
   * Returns this session's verify-ledger rows with the facts the gate needs:
   * method, files_touched, and the server-computed aliveness boolean. Wrapped
   * so the gate is testable without network. `handoff.ts` wires this to
   * `api.getSessionVerifications(sessionId)`.
   */
  getSessionVerifications: (sessionId: string) => Promise<VerificationDetail[]>
}

export interface VerifyCoverageGateResult {
  branch: string | null
  /** Names of surface classes the diff touches (post-classification) */
  surfaces_touched: string[]
  /** Total session verify-ledger rows seen at gate-evaluation time */
  verify_count: number
  /** Rows that PROVE a changed seam: proof-method + alive + names a surface file */
  qualifying_count: number
  /** True when an infra failure forced a fail-open pass (recorded, not silent) */
  degraded: boolean
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
  opts: { verify_count?: number; qualifying_count?: number; degraded?: boolean } = {}
): VerifyCoverageGateResult => ({
  branch,
  surfaces_touched: surfaces,
  verify_count: opts.verify_count ?? 0,
  qualifying_count: opts.qualifying_count ?? 0,
  degraded: opts.degraded ?? false,
  should_block: false,
  reason,
})

/**
 * A verification PROVES a changed seam iff it (a) used a proof method
 * (live_state / fresh_process — not vendor_docs), (b) its captured output was
 * alive (server-computed `output_nonempty`), and (c) its files_touched names
 * at least one of the changed surface files. This is the relevance+aliveness
 * test that turns "verified something" into "verified the thing you shipped".
 */
function isQualifyingProof(v: VerificationDetail, surfaceFiles: Set<string>): boolean {
  if (!PROOF_METHODS.has(v.method)) return false
  if (!v.output_nonempty) return false
  return v.files_touched.some((f) => surfaceFiles.has(f))
}

/**
 * Lines that change no runtime behavior: blank, comment-only, or
 * import/export-from statements. Used to detect a behaviorally-inert diff so
 * pure formatting / comment / import-sort changes to a surface file don't trip
 * the gate (the false-positive class that trains reflex-override). We only ever
 * SKIP on provably-inert diffs — never skip real code — so this narrows
 * false-positives without opening a false-negative hole.
 */
function isInertLine(line: string): boolean {
  const t = line.trim()
  if (t.length === 0) return true
  if (/^(\/\/|\/\*|\*\/|\*|#)/.test(t)) return true
  if (/^import\b/.test(t)) return true
  if (/^export\s+(\*|\{)[^=]*\bfrom\b/.test(t)) return true
  if (/^\}\s+from\b/.test(t)) return true
  return false
}

/**
 * True if the diff on the given surface files is behaviorally inert. Any
 * untracked (brand-new) surface file is never inert. Otherwise we scan the
 * added/removed content lines and ask whether anything substantive remains.
 */
function surfaceDiffIsInert(repoRoot: string, surfaceFiles: string[]): boolean {
  const untracked = new Set(
    (safeExec('git ls-files --others --exclude-standard 2>/dev/null', { cwd: repoRoot }) ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  )
  if (surfaceFiles.some((f) => untracked.has(f))) return false

  const quoted = surfaceFiles.map((f) => JSON.stringify(f)).join(' ')
  const committed = safeExec(`git diff origin/main...HEAD -- ${quoted} 2>/dev/null`, {
    cwd: repoRoot,
  })
  const uncommitted = safeExec(`git diff HEAD -- ${quoted} 2>/dev/null`, { cwd: repoRoot })
  const diff = `${committed ?? ''}\n${uncommitted ?? ''}`

  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++') || raw.startsWith('---')) continue
    if (raw.startsWith('+') || raw.startsWith('-')) {
      if (!isInertLine(raw.slice(1))) return false
    }
  }
  return true
}

export async function evaluateVerifyCoverageGate(
  input: VerifyCoverageGateInput
): Promise<VerifyCoverageGateResult> {
  const { repoRoot, classifyScript, manifestPath, sessionId, getSessionVerifications } = input

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

  const surfaceFiles = new Set<string>(
    touchedSurfaces.flatMap((c) => classified.surfaces_touched[c] ?? [])
  )

  // Step 3b: seam-triggered firing. A behaviorally-inert diff (comments,
  // imports, formatting) on the surface files has no runtime claim to prove.
  if (surfaceDiffIsInert(repoRoot, Array.from(surfaceFiles))) {
    return SKIP_OK(
      branch,
      `[ok] surface(s) ${touchedSurfaces.join(', ')} touched but the diff is behaviorally inert (comments/imports/formatting) — no seam to verify`,
      touchedSurfaces
    )
  }

  // Step 4: ledger lookup — relevance + aliveness.
  let verifications: VerificationDetail[]
  try {
    verifications = await getSessionVerifications(sessionId)
  } catch {
    // Fail-open-but-LOUD: pass so infra trouble never blocks legit work, but
    // mark the pass degraded so it's recorded on the handoff and audited —
    // never a silent bypass.
    return SKIP_OK(
      branch,
      `[degraded] verify-ledger lookup failed; could not confirm seam coverage for ${touchedSurfaces.join(', ')} — passing OPEN (recorded as degraded)`,
      touchedSurfaces,
      { degraded: true }
    )
  }

  return decideFromVerifications(branch, touchedSurfaces, surfaceFiles, verifications)
}

/**
 * Final verdict from this session's verifications: pass iff ≥1 qualifies
 * (proof method + alive + names a changed surface file), else block with a
 * reason naming the unproven seams. Extracted to keep the orchestrator under
 * the per-function line cap.
 */
function decideFromVerifications(
  branch: string | null,
  touchedSurfaces: string[],
  surfaceFiles: Set<string>,
  verifications: VerificationDetail[]
): VerifyCoverageGateResult {
  const qualifying = verifications.filter((v) => isQualifyingProof(v, surfaceFiles))

  if (qualifying.length > 0) {
    return {
      branch,
      surfaces_touched: touchedSurfaces,
      verify_count: verifications.length,
      qualifying_count: qualifying.length,
      degraded: false,
      should_block: false,
      reason: `[ok] ${qualifying.length} live verification(s) name and prove the changed seam(s) in ${touchedSurfaces.join(', ')}`,
    }
  }

  return {
    branch,
    surfaces_touched: touchedSurfaces,
    verify_count: verifications.length,
    qualifying_count: 0,
    degraded: false,
    should_block: true,
    reason:
      `[gate] The diff changes seam(s) in ${touchedSurfaces.join(', ')} but no crane_verify ` +
      `record this session PROVES them. A qualifying record must be a live_state or fresh_process ` +
      `observation whose files_touched names one of: ${Array.from(surfaceFiles).join(', ')}, and ` +
      `whose captured output shows the seam carried data (not []/empty). ` +
      `${verifications.length} record(s) exist but none qualify. See docs/global/verify.md.`,
  }
}
