/**
 * crane launcher - extracted testable logic
 *
 * Every function the CLI needs lives here so tests can import
 * real code instead of simulating behavior externally.
 *
 * launch.ts is the thin entry point that calls main().
 */

import { createInterface } from 'readline'
import { spawn, spawnSync, execSync } from 'child_process'
import {
  existsSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'fs'
import { join, dirname, basename } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { Venture } from '../lib/crane-api.js'
import { API_BASE_PRODUCTION, getCraneEnv, getStagingInfisicalPath } from '../lib/config.js'
import { scanLocalRepos, LocalRepo } from '../lib/repo-scanner.js'
import { prepareSSHAuth } from './ssh-auth.js'

// Resolve crane-console root relative to this script
// Compiled path: packages/crane-mcp/dist/cli/launch-lib.js -> 4 levels up
const __filename = fileURLToPath(import.meta.url)
export const CRANE_CONSOLE_ROOT = join(dirname(__filename), '..', '..', '..', '..')
export const WORKSPACE_ID = '2da2895e-aba2-4faf-a65a-b86e1a7aa2cb'

// Known agent CLIs and their binary names
export const KNOWN_AGENTS: Record<string, string> = {
  claude: 'claude',
  gemini: 'gemini',
  codex: 'codex',
  hermes: 'hermes',
}

export const AGENT_FLAGS = Object.keys(KNOWN_AGENTS).map((a) => `--${a}`)

export const AGENT_INSTALL_HINTS: Record<string, string> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  gemini: 'npm install -g @google/gemini-cli',
  codex: 'npm install -g @openai/codex',
  hermes: 'pip install hermes-agent (or: cd ~/.hermes/hermes-agent && pip install -e .)',
}

// Venture Infisical paths - derived from config/ventures.json.
// Convention: each venture's secrets live at /{code} in Infisical.
// Only secrets at these exact paths are injected into agent env.
// Sub-paths (e.g., /vc/vault) are NOT fetched - use for storage-only secrets.
// See docs/infra/secrets-management.md "Vault" section.
const venturesConfig = JSON.parse(
  readFileSync(join(CRANE_CONSOLE_ROOT, 'config', 'ventures.json'), 'utf-8')
)
export const INFISICAL_PATHS: Record<string, string> = Object.fromEntries(
  venturesConfig.ventures.map((v: { code: string }) => [v.code, `/${v.code}`])
)

export interface VentureWithRepo extends Venture {
  localPath: string | null
}

/**
 * Resolve which agent to launch.
 * Priority: explicit flag > --agent <name> > CRANE_DEFAULT_AGENT > "claude"
 */
export function resolveAgent(args: string[]): string {
  // 1. Explicit flags: --claude, --gemini, --codex
  const matched = AGENT_FLAGS.filter((f) => args.includes(f))
  if (matched.length > 1) {
    console.error(`Conflicting agent flags: ${matched.join(', ')}. Pick one.`)
    process.exit(1)
  }
  if (matched.length === 1) {
    return matched[0].replace('--', '')
  }

  // 2. --agent <name> flag
  const agentIdx = args.indexOf('--agent')
  if (agentIdx !== -1) {
    const name = args[agentIdx + 1]?.toLowerCase()
    if (!name || name.startsWith('-')) {
      console.error('--agent requires a value (e.g., --agent gemini)')
      process.exit(1)
    }
    if (!(name in KNOWN_AGENTS)) {
      console.error(`Unknown agent: ${name}`)
      console.error(`Supported: ${Object.keys(KNOWN_AGENTS).join(', ')}`)
      process.exit(1)
    }
    return name
  }

  // 3. CRANE_DEFAULT_AGENT env var
  const envAgent = process.env.CRANE_DEFAULT_AGENT?.toLowerCase()
  if (envAgent) {
    if (!(envAgent in KNOWN_AGENTS)) {
      console.error(`Unknown CRANE_DEFAULT_AGENT: ${envAgent}`)
      console.error(`Supported: ${Object.keys(KNOWN_AGENTS).join(', ')}`)
      process.exit(1)
    }
    return envAgent
  }

  // 4. Default
  return 'claude'
}

/** Verify the agent binary is installed and on PATH. */
export function validateAgentBinary(agent: string): void {
  const binary = KNOWN_AGENTS[agent]
  try {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process — `binary` is a closed-set lookup from KNOWN_AGENTS (not user-controlled); unknown `agent` produces undefined and `which undefined` fails safely
    execSync(`which ${binary}`, { stdio: 'pipe' })
  } catch {
    console.error(`\n${binary} is not installed or not in PATH.`)
    if (AGENT_INSTALL_HINTS[agent]) {
      console.error(`Install: ${AGENT_INSTALL_HINTS[agent]}`)
    }
    process.exit(1)
  }
}

/** Strip agent-related flags from args so they don't interfere with venture parsing. */
export function stripAgentFlags(args: string[]): string[] {
  const result: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (AGENT_FLAGS.includes(args[i])) {
      continue // skip --claude, --gemini, --codex
    }
    if (args[i] === '--agent') {
      i++ // skip --agent AND its value
      continue
    }
    result.push(args[i])
  }
  return result
}

/**
 * Crane's own flags that are consumed by the launcher and NOT passed through
 * to the agent binary. Everything else passes through to enable headless mode
 * (e.g., `crane vc -p "prompt"` passes `-p "prompt"` to claude).
 */
const CRANE_FLAGS = new Set([
  '--debug',
  '-d',
  '--list',
  '-l',
  '--help',
  '-h',
  '--secrets-audit',
  '--fix',
  ...AGENT_FLAGS,
  '--agent',
])

/**
 * Extract passthrough args - everything that isn't a crane flag or the venture code.
 * These are forwarded to the agent binary (e.g., -p "prompt" for headless mode).
 */
export function extractPassthroughArgs(args: string[]): string[] {
  const result: string[] = []
  let ventureCodeSeen = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    // Skip crane flags
    if (CRANE_FLAGS.has(arg)) {
      // --agent takes a value, skip it too
      if (arg === '--agent') i++
      continue
    }

    // Skip the first non-flag arg (venture code)
    if (!arg.startsWith('-') && !ventureCodeSeen) {
      ventureCodeSeen = true
      continue
    }

    // Everything else passes through
    result.push(arg)
  }

  return result
}

export async function fetchVentures(): Promise<Venture[]> {
  try {
    // Always fetch from production - staging DB may be empty
    const response = await fetch(`${API_BASE_PRODUCTION}/ventures`)
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`)
    }
    const data = (await response.json()) as { ventures: Venture[] }
    return data.ventures
  } catch (error) {
    console.error('Failed to fetch ventures from API')
    throw error
  }
}

/**
 * Match a venture to its local repo.
 *
 * All ventures live under the same GitHub org (venturecrane), so org-only
 * matching is ambiguous. We match by org + repo name convention:
 *   {code}-console  (ke → ke-console, dc → dc-console)
 *   crane-console   (special case for vc, the infra venture)
 */
function matchVentureToRepo(venture: Venture, repos: LocalRepo[]): LocalRepo | undefined {
  return repos.find((r) => {
    if (r.org.toLowerCase() !== venture.org.toLowerCase()) return false
    // Convention: {code}-console, with crane-console for vc
    return (
      r.repoName === `${venture.code}-console` ||
      (venture.code === 'vc' && r.repoName === 'crane-console')
    )
  })
}

export function matchVenturesToRepos(ventures: Venture[]): VentureWithRepo[] {
  const repos = scanLocalRepos()
  return ventures.map((v) => {
    const repo = matchVentureToRepo(v, repos)
    return {
      ...v,
      localPath: repo?.path || null,
    }
  })
}

export async function cloneVenture(venture: VentureWithRepo): Promise<string | null> {
  let repos: { name: string; description: string }[]
  try {
    const output = execSync(
      // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process — `venture.org` comes from the ventures.json registry, not user input; no shell metacharacters possible in an org slug
      `gh repo list ${venture.org} --json name,description --limit 20 --no-archived`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    repos = JSON.parse(output)
  } catch {
    console.error(`Cannot list repos for ${venture.org}. Check: gh repo list ${venture.org}`)
    return null
  }

  if (repos.length === 0) {
    console.error(`No repos found in the ${venture.org} organization.`)
    return null
  }

  let repoName: string

  if (repos.length === 1) {
    repoName = repos[0].name
    console.log(`  Repo: ${venture.org}/${repoName}`)
  } else {
    console.log(`\n  Repos in ${venture.org}:\n`)
    for (let i = 0; i < repos.length; i++) {
      const desc = repos[i].description ? `  ${repos[i].description}` : ''
      console.log(`    ${i + 1}) ${repos[i].name}${desc}`)
    }
    console.log()

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise<string>((resolve) => {
      rl.question(`  Which repo? (1-${repos.length}): `, resolve)
    })
    rl.close()

    const num = parseInt(answer, 10)
    if (isNaN(num) || num < 1 || num > repos.length) {
      return null
    }
    repoName = repos[num - 1].name
  }

  const targetPath = join(homedir(), 'dev', repoName)

  if (existsSync(targetPath)) {
    console.error(`\n  ~/dev/${repoName} already exists but isn't linked to ${venture.org}.`)
    console.error(`  Check its git remote: git -C "${targetPath}" remote -v`)
    return null
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const confirm = await new Promise<string>((resolve) => {
    rl.question(`  Clone to ~/dev/${repoName}? (Y/n): `, resolve)
  })
  rl.close()

  if (confirm.trim().toLowerCase() === 'n') {
    return null
  }

  console.log(`\n-> Cloning ${venture.org}/${repoName}...`)
  try {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process — `venture.org` and `repoName` from ventures.json registry + `gh repo list` output, not user input; `targetPath` computed from internal config
    execSync(`gh repo clone ${venture.org}/${repoName} "${targetPath}"`, {
      stdio: 'inherit',
    })
    console.log(`-> Cloned to ~/dev/${repoName}\n`)
    return targetPath
  } catch {
    console.error(`\nClone failed. Verify access: gh repo list ${venture.org}`)
    return null
  }
}

export function printVentureList(ventures: VentureWithRepo[]): void {
  console.log('\nCrane Ventures')
  console.log('==============\n')

  const home = homedir()
  for (let i = 0; i < ventures.length; i++) {
    const v = ventures[i]
    const num = `${i + 1})`.padEnd(3)
    const name = v.name.padEnd(20)
    const code = `[${v.code}]`.padEnd(6)
    const path = v.localPath ? v.localPath.replace(home, '~') : '(not cloned)'
    console.log(`  ${num} ${name} ${code} ${path}`)
  }
  console.log()
}

export async function promptSelection(
  ventures: VentureWithRepo[]
): Promise<VentureWithRepo | null> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  const answer = await new Promise<string>((resolve) => {
    rl.question(`Select (1-${ventures.length}): `, resolve)
  })
  rl.close()

  const num = parseInt(answer, 10)
  if (isNaN(num) || num < 1 || num > ventures.length) {
    return null
  }

  const selected = ventures[num - 1]
  if (!selected.localPath) {
    console.log(`\n${selected.name} is not cloned locally.`)
    const clonedPath = await cloneVenture(selected)
    if (!clonedPath) {
      return null
    }
    selected.localPath = clonedPath
  }

  return selected
}

// ============================================================================
// Infisical config helpers
// ============================================================================

/**
 * Ensure .infisical.json exists in the repo (auto-copy from crane-console if missing).
 * Returns an error string if the config can't be resolved, null on success.
 */
export function ensureInfisicalConfig(repoPath: string): string | null {
  const configPath = join(repoPath, '.infisical.json')
  if (existsSync(configPath)) return null

  const source = join(CRANE_CONSOLE_ROOT, '.infisical.json')
  if (existsSync(source)) {
    copyFileSync(source, configPath)
    console.log(`-> Copied .infisical.json from crane-console`)
    return null
  }

  return `Missing .infisical.json in ${repoPath} and no source found in ~/dev/crane-console/`
}

// ============================================================================
// Secret fetching - single fetch, parse, validate
// ============================================================================

/**
 * Fetch secrets from Infisical once, parse them, and validate.
 *
 * Trade-off: secrets are frozen at launch time. This is fine for static keys
 * like CRANE_CONTEXT_KEY and API tokens. If we ever need rotating secrets that
 * refresh mid-session, we'd need a different approach (e.g., sidecar process).
 *
 * Replaces the old checkInfisicalSetup + infisical-run-wrapper pattern.
 * Instead of two separate fetches (one to validate, one to run), we fetch
 * once with `infisical export --format=json`, parse the JSON, guard on
 * content, and inject the resulting env vars directly into the agent process.
 */
export function fetchSecrets(
  repoPath: string,
  infisicalPath: string,
  extraEnv?: Record<string, string>
): { secrets: Record<string, string> } | { error: string } {
  // Ensure .infisical.json exists
  const configError = ensureInfisicalConfig(repoPath)
  if (configError) return { error: configError }

  // Resolve environment and path - staging uses a different Infisical path for vc
  const craneEnv = getCraneEnv()
  let resolvedEnv = craneEnv === 'dev' ? 'dev' : 'prod'
  let resolvedPath = infisicalPath

  if (craneEnv === 'dev') {
    // Derive venture code from infisicalPath (e.g., '/vc' -> 'vc')
    const ventureCode = infisicalPath.replace(/^\//, '')
    const stagingPath = getStagingInfisicalPath(ventureCode)

    if (stagingPath) {
      resolvedPath = stagingPath
    } else {
      console.warn(`-> Warning: Staging not available for ${ventureCode}, using production secrets`)
      resolvedEnv = 'prod'
    }
  }

  // Build the infisical export command
  const args = ['export', '--format=json', '--silent', '--path', resolvedPath, '--env', resolvedEnv]

  // When INFISICAL_TOKEN is present (SSH/UA path), add --projectId since
  // token-based auth doesn't read .infisical.json for project context
  if (extraEnv?.INFISICAL_TOKEN) {
    args.push('--projectId', WORKSPACE_ID)
  }

  const result = spawnSync('infisical', args, {
    cwd: repoPath,
    env: extraEnv ? { ...process.env, ...extraEnv } : undefined,
    timeout: 30_000,
    encoding: 'utf-8',
  })

  // Check for spawn failures
  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        error:
          'infisical CLI not found.\n' +
          'Install: https://infisical.com/docs/cli/overview\n' +
          'Or: brew install infisical/get-cli/infisical',
      }
    }
    return { error: `Failed to run infisical: ${result.error.message}` }
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim()
    return {
      error:
        `infisical export failed (exit ${result.status}) for path '${infisicalPath}'.\n` +
        (stderr ? `Stderr: ${stderr}\n` : '') +
        'Check: infisical login, or verify the path exists in Infisical web UI.',
    }
  }

  // Parse JSON output
  const stdout = result.stdout?.trim()
  if (!stdout) {
    return {
      error:
        `infisical export returned empty output for path '${infisicalPath}'.\n` +
        'The path may not exist or may have no secrets configured.',
    }
  }

  let parsed: Array<{ key: string; value: string }>
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return {
      error:
        `infisical export returned malformed JSON.\n` +
        `Output (first 200 chars): ${stdout.slice(0, 200)}`,
    }
  }

  // Convert array of {key, value} to Record
  const secrets: Record<string, string> = {}
  for (const entry of parsed) {
    if (entry.key && typeof entry.value === 'string') {
      secrets[entry.key] = entry.value
    }
  }

  // Guard: no secrets at all
  if (Object.keys(secrets).length === 0) {
    return {
      error:
        `infisical export returned no secrets for path '${resolvedPath}' (env: ${resolvedEnv}).\n` +
        'Add secrets in Infisical web UI: https://app.infisical.com',
    }
  }

  // Guard: CRANE_CONTEXT_KEY specifically
  if (!secrets.CRANE_CONTEXT_KEY) {
    return {
      error:
        `Secrets fetched from '${infisicalPath}' but CRANE_CONTEXT_KEY is missing.\n` +
        `Keys found: ${Object.keys(secrets).join(', ')}\n` +
        `Fix: cd ~/dev/crane-console && bash scripts/sync-shared-secrets.sh --fix\n` +
        'Or add CRANE_CONTEXT_KEY manually in Infisical web UI.',
    }
  }

  return { secrets }
}

// ============================================================================
// Auto-rebuild: detect stale builds and re-exec with fresh code
// ============================================================================

/**
 * Get the newest mtime (ms since epoch) of files with the given extension
 * in a directory tree. Returns 0 if no matching files found.
 */
function getNewestMtime(dir: string, ext: string): number {
  try {
    const files = readdirSync(dir, { recursive: true }) as string[]
    let newest = 0
    for (const file of files) {
      if (file.endsWith(ext)) {
        const stat = statSync(join(dir, file))
        if (stat.mtimeMs > newest) newest = stat.mtimeMs
      }
    }
    return newest
  } catch {
    return 0
  }
}

/**
 * Check if the crane-mcp build is stale (source newer than dist).
 * If stale, rebuild and re-exec so the fresh code runs.
 *
 * This solves the fleet deployment gap: once a machine does `git pull`,
 * the next `crane` invocation auto-rebuilds and runs the new code.
 * Without this, every machine needs manual `npm run build` after pulling.
 */
export function ensureFreshBuild(): void {
  // Guard: prevent infinite re-exec if rebuild doesn't update mtimes
  if (process.env.CRANE_FRESH_BUILD === '1') return

  const mcpDir = join(CRANE_CONSOLE_ROOT, 'packages', 'crane-mcp')
  const srcDir = join(mcpDir, 'src')
  const distDir = join(mcpDir, 'dist')

  // If no dist directory, checkMcpBinary() handles the full rebuild later
  if (!existsSync(distDir)) return

  // If no src directory (installed package, not dev checkout), skip
  if (!existsSync(srcDir)) return

  const newestSrc = getNewestMtime(srcDir, '.ts')
  const newestDist = getNewestMtime(distDir, '.js')

  // Build is fresh (or we can't determine)
  if (newestSrc === 0 || newestDist === 0 || newestSrc <= newestDist) return

  console.log('-> crane-mcp source is newer than build, rebuilding...')
  try {
    execSync('npm run build', {
      cwd: mcpDir,
      stdio: 'pipe',
      timeout: 30_000,
    })
    console.log('-> Rebuild complete, restarting...\n')
  } catch {
    console.warn('-> Auto-rebuild failed, continuing with existing build')
    return
  }

  // Re-exec with fresh build - the new dist/ files will be picked up
  const result = spawnSync(process.argv[0], process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, CRANE_FRESH_BUILD: '1' },
  })
  process.exit(result.status ?? 0)
}

/**
 * Sync the venture repo with origin before handing control to the agent.
 *
 * Fixes the "stale checkout" class of bug: `crane vc` / `crane ss` / etc. used
 * to chdir into a possibly-weeks-stale working tree and start the agent there.
 * Agents that trusted `git log` / `git grep` would then report "feature doesn't
 * exist" when it had been merged upstream the whole time.
 *
 * Behavior:
 *   - `git fetch origin` (quiet, 15s timeout) — offline failure is non-fatal.
 *   - If dirty → warn with counts, never auto-pull (preserves in-progress work).
 *   - If ahead → warn, never auto-pull (avoid merge conflicts mid-launch).
 *   - If clean + behind → `git pull --ff-only`, print "✓ synced +N".
 *   - If current → silent.
 *
 * Never throws; sync hygiene must not block the launcher.
 */
export function syncVentureRepo(repoPath: string): void {
  try {
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal — repoPath sourced from venture registry (API), not user input; matches ~13 other path.join(repoPath, ...) calls in this file
    if (!existsSync(join(repoPath, '.git'))) return

    // Use spawnSync with args array throughout to keep user input out of a shell
    // command string — every call is `git <fixed-args>` with cwd=repoPath.
    const gitOut = (args: string[], timeout: number): string | null => {
      const r = spawnSync('git', args, {
        cwd: repoPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout,
        encoding: 'utf-8',
      })
      if (r.status !== 0 || r.error) return null
      return (r.stdout ?? '').trim()
    }

    const fetchResult = spawnSync('git', ['fetch', 'origin', '--quiet'], {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15_000,
    })
    if (fetchResult.status !== 0 || fetchResult.error) {
      console.warn('-> git fetch failed (offline?); skipping sync check')
      return
    }

    const branch = gitOut(['rev-parse', '--abbrev-ref', 'HEAD'], 5_000)
    if (!branch || branch === 'HEAD') return // missing or detached HEAD

    const upstream = gitOut(['rev-parse', '--abbrev-ref', '@{u}'], 5_000)
    if (!upstream) return // no upstream tracking

    // upstream is derived from git itself (e.g., "origin/main") — not user input.
    const behindStr = gitOut(['rev-list', '--count', `HEAD..${upstream}`], 5_000)
    const aheadStr = gitOut(['rev-list', '--count', `${upstream}..HEAD`], 5_000)
    const dirtyStr = gitOut(['status', '--porcelain'], 5_000)

    const behind = parseInt(behindStr ?? '0', 10) || 0
    const ahead = parseInt(aheadStr ?? '0', 10) || 0
    const dirty = (dirtyStr ?? '').split('\n').filter(Boolean).length

    if (behind === 0 && ahead === 0 && dirty === 0) return

    if (dirty > 0 && behind > 0) {
      console.warn(
        `-> ⚠ ${branch}: ${dirty} dirty file(s), ${behind} behind ${upstream} — not auto-syncing`
      )
      return
    }
    if (ahead > 0) {
      console.warn(`-> ⚠ ${branch}: ${ahead} ahead of ${upstream} — push when ready`)
      return
    }
    if (dirty > 0) {
      // dirty but current — just a heads-up, no action
      return
    }

    // clean + behind: fast-forward
    const pullResult = spawnSync('git', ['pull', '--ff-only', '--quiet'], {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    })
    if (pullResult.status === 0 && !pullResult.error) {
      console.log(`-> ✓ synced ${branch} +${behind} from ${upstream}`)
    } else {
      console.warn(`-> git pull --ff-only failed on ${branch}; continuing with stale tree`)
    }
  } catch {
    // Never fail the launcher over sync hygiene
  }
}

// ============================================================================
// MCP setup helpers
// ============================================================================

export function checkMcpBinary(): void {
  try {
    execSync('which crane-mcp', { stdio: 'pipe' })
  } catch {
    console.log('-> crane-mcp not found on PATH, rebuilding...')
    const mcpDir = join(CRANE_CONSOLE_ROOT, 'packages', 'crane-mcp')
    if (existsSync(mcpDir)) {
      execSync('npm install && npm run build && npm link', {
        cwd: mcpDir,
        stdio: 'inherit',
      })
      console.log('-> crane-mcp rebuilt and linked\n')
    } else {
      console.error('Cannot find packages/crane-mcp - is this crane-console?')
      process.exit(1)
    }
  }
}

/**
 * Ensure the venture project is marked trusted in ~/.claude.json so Claude Code
 * loads its project-scope .mcp.json automatically.
 *
 * Background: Claude Code only starts servers from a project's .mcp.json after
 * the user accepts the project trust dialog (which sets `hasTrustDialogAccepted`
 * on the project entry in ~/.claude.json). On a fresh venture clone on a fresh
 * fleet machine, the dialog has never been accepted, so `crane-mcp` silently
 * fails to start and the agent reports "no MCP tools available" with no clear
 * cause. Crane-managed venture repos are trusted by definition — the user
 * explicitly opted in by running `crane <venture>` — so we stamp the flag
 * directly, the same way the launcher already auto-configures Gemini and Codex.
 *
 * Idempotent: only writes when the flag actually changes. Tolerates a missing
 * or malformed ~/.claude.json (skips silently — claude's first interactive
 * launch will create it).
 */
export function ensureClaudeProjectTrust(repoPath: string): void {
  const claudeConfigPath = join(homedir(), '.claude.json')

  if (!existsSync(claudeConfigPath)) {
    // Claude has never been onboarded on this machine; nothing to patch.
    // The first interactive `claude` launch will create the file and prompt.
    return
  }

  let config: Record<string, unknown>
  try {
    config = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'))
  } catch {
    // Malformed user config — refuse to clobber, fall back to interactive prompt.
    console.warn('-> Warning: ~/.claude.json is malformed; skipping project trust patch')
    return
  }

  if (!config.projects || typeof config.projects !== 'object') {
    config.projects = {}
  }
  const projects = config.projects as Record<string, Record<string, unknown>>

  const existing = projects[repoPath]
  if (existing && existing.hasTrustDialogAccepted === true) {
    return // already trusted, no-op
  }

  projects[repoPath] = {
    ...(existing ?? {}),
    hasTrustDialogAccepted: true,
  }

  writeFileSync(claudeConfigPath, JSON.stringify(config, null, 2) + '\n')
  console.log(`-> Marked ${basename(repoPath)} as trusted in ~/.claude.json`)
}

/**
 * Ensure user-scope ~/.claude/settings.json contains every entry in
 * config/claude-deny-rules.json under permissions.deny.
 *
 * Why user-scope, not per-repo: writing the deny rule into each venture repo's
 * tracked .claude/settings.json would dirty seven working trees on first launch
 * after a fleet sync, opening the door to cross-machine commit races and the
 * mac23-conflict pattern in MEMORY.md. The user-scope file is untracked, applies
 * across every Claude Code session on the machine, and is the layer Claude Code
 * itself expects for user-managed permission policy. Deny-wins precedence
 * guarantees the rule beats any in-repo allow wildcards (docs:
 * "if a tool is denied at any level, no other level can allow it").
 *
 * Idempotent: only writes when a missing rule or a stale narrower entry in the
 * same namespace needs to be reconciled. Tolerates missing/malformed settings
 * files (warns and skips instead of clobbering hand edits).
 */
export function ensureClaudeUserDenyRules(): void {
  const claudeDir = join(homedir(), '.claude')
  const settingsPath = join(claudeDir, 'settings.json')
  const rules = loadClaudeDenyRules()

  if (rules.length === 0) return

  let settings: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    } catch {
      console.warn('-> Warning: ~/.claude/settings.json is malformed; skipping deny-rule injection')
      return
    }
  }

  if (!settings.permissions || typeof settings.permissions !== 'object') {
    settings.permissions = {}
  }
  const permissions = settings.permissions as Record<string, unknown>

  // Coerce permissions.deny: missing -> [], string -> [string], otherwise skip+warn.
  if (permissions.deny === undefined) {
    permissions.deny = []
  } else if (typeof permissions.deny === 'string') {
    permissions.deny = [permissions.deny]
  } else if (!Array.isArray(permissions.deny)) {
    console.warn(
      '-> Warning: ~/.claude/settings.json permissions.deny has unexpected type; skipping'
    )
    return
  }

  let dirty = false
  for (const rule of rules) {
    const deny = permissions.deny as string[]

    // A wildcard rule supersedes any narrower same-namespace entry (e.g. adding
    // `mcp__claude_ai_crane_context__*` strips a stale
    // `mcp__claude_ai_crane_context__github_search_code`).
    if (rule.endsWith('__*')) {
      const prefix = rule.slice(0, -1) // strip trailing *
      const narrower = deny.filter((d) => d !== rule && d.startsWith(prefix))
      if (narrower.length > 0) {
        permissions.deny = deny.filter((d) => !narrower.includes(d))
        dirty = true
      }
    }

    if (!(permissions.deny as string[]).includes(rule)) {
      ;(permissions.deny as string[]).push(rule)
      dirty = true
    }
  }

  if (!dirty) return

  mkdirSync(claudeDir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  console.log('-> Added crane-context deny rule to ~/.claude/settings.json')
}

export function setupClaudeMcp(repoPath: string): void {
  // Pre-accept the project trust dialog so Claude Code loads .mcp.json on first run.
  // Without this, project-scope MCP servers stay dormant until the user clicks
  // through an interactive prompt — easy to miss, easy to dismiss, and the
  // resulting "no crane MCP" failure is opaque.
  ensureClaudeProjectTrust(repoPath)

  // Maintain the user-scope deny rules that block redundant Claude.ai remote
  // MCP proxy tools (currently just crane-context, which duplicates our local
  // mcp__crane__* surface). Writes ~/.claude/settings.json idempotently.
  ensureClaudeUserDenyRules()

  const mcpJson = join(repoPath, '.mcp.json')
  const source = join(CRANE_CONSOLE_ROOT, '.mcp.json')

  if (!existsSync(source)) {
    console.warn('-> Warning: .mcp.json missing in crane-console')
    return
  }

  let sourceConfig: Record<string, unknown>
  try {
    sourceConfig = JSON.parse(readFileSync(source, 'utf-8'))
  } catch {
    console.warn('-> Warning: .mcp.json in crane-console is malformed')
    return
  }

  const sourceServers = (sourceConfig.mcpServers ?? {}) as Record<string, unknown>

  // If target doesn't exist, copy from source
  if (!existsSync(mcpJson)) {
    copyFileSync(source, mcpJson)
    console.log('-> Copied .mcp.json from crane-console')
    return
  }

  // Sync: add missing servers AND update stale configs from source
  let targetConfig: Record<string, unknown>
  try {
    targetConfig = JSON.parse(readFileSync(mcpJson, 'utf-8'))
  } catch {
    copyFileSync(source, mcpJson)
    console.log('-> Replaced malformed .mcp.json from crane-console')
    return
  }

  if (!targetConfig.mcpServers) {
    targetConfig.mcpServers = {}
  }
  const targetServers = targetConfig.mcpServers as Record<string, unknown>

  let dirty = false
  for (const [name, config] of Object.entries(sourceServers)) {
    if (JSON.stringify(targetServers[name]) !== JSON.stringify(config)) {
      targetServers[name] = config
      dirty = true
    }
  }

  if (dirty) {
    writeFileSync(mcpJson, JSON.stringify(targetConfig, null, 2) + '\n')
    console.log('-> Updated .mcp.json (synced MCP servers from crane-console)')
  }
}

/**
 * Sync .claude/commands/ and .claude/agents/ from crane-console to the target repo.
 * Overwrites stale files silently. Only copies .md files.
 * Skips sync when repoPath IS crane-console (source === target).
 */
/** Load VC-only skill names from config/skill-exclusions.json */
function loadSkillExclusions(): Set<string> {
  try {
    const exclusionPath = join(CRANE_CONSOLE_ROOT, 'config', 'skill-exclusions.json')
    const content = readFileSync(exclusionPath, 'utf-8')
    const names: string[] = JSON.parse(content)
    return new Set(names.map((n) => `${n}.md`))
  } catch {
    return new Set()
  }
}

/**
 * Load launcher-managed Claude Code deny rules from config/claude-deny-rules.json.
 *
 * These rules are injected into user-scope ~/.claude/settings.json on every
 * `crane <venture>` launch by ensureClaudeUserDenyRules(). Adding a new rule
 * is a one-line config commit, not a launcher code change.
 *
 * Graceful fallback: a missing or malformed config file yields an empty list,
 * making the launcher a no-op rather than crashing.
 */
function loadClaudeDenyRules(): string[] {
  try {
    const rulesPath = join(CRANE_CONSOLE_ROOT, 'config', 'claude-deny-rules.json')
    const content = readFileSync(rulesPath, 'utf-8')
    const rules = JSON.parse(content)
    return Array.isArray(rules) ? rules.filter((r): r is string => typeof r === 'string') : []
  } catch {
    return []
  }
}

export function syncClaudeAssets(repoPath: string): void {
  const resolvedRepo = readdirSync(repoPath).length >= 0 ? repoPath : repoPath // validate exists
  const resolvedConsole = CRANE_CONSOLE_ROOT

  // Skip if target is crane-console itself
  try {
    if (statSync(resolvedRepo).ino === statSync(resolvedConsole).ino) return
  } catch {
    // If stat fails, proceed with sync anyway
  }

  const excluded = loadSkillExclusions()
  const dirs = ['commands', 'agents'] as const
  let totalSynced = 0

  for (const dir of dirs) {
    const sourceDir = join(resolvedConsole, '.claude', dir)
    const targetDir = join(resolvedRepo, '.claude', dir)

    if (!existsSync(sourceDir)) continue

    const sourceFiles = readdirSync(sourceDir).filter(
      (f) => f.endsWith('.md') && (dir !== 'commands' || !excluded.has(f))
    )
    if (!sourceFiles.length) continue

    mkdirSync(targetDir, { recursive: true })

    for (const file of sourceFiles) {
      const sourcePath = join(sourceDir, file)
      const targetPath = join(targetDir, file)

      // Skip if target file is identical
      if (existsSync(targetPath)) {
        const sourceContent = readFileSync(sourcePath, 'utf-8')
        const targetContent = readFileSync(targetPath, 'utf-8')
        if (sourceContent === targetContent) continue
      }

      copyFileSync(sourcePath, targetPath)
      totalSynced++
    }
  }

  if (totalSynced > 0) {
    console.log(
      `-> Synced ${totalSynced} Claude command/agent file${totalSynced > 1 ? 's' : ''} from crane-console`
    )
  }
}

/**
 * Load skill names from config/global-skills.json.
 *
 * These skills are mirrored from crane-console/.agents/skills/<name>/ to
 * ~/.agents/skills/<name>/ on every launch. They are global tools (e.g.,
 * nav-spec, product-design) that must be available in any venture context,
 * not just when Claude Code runs from crane-console.
 *
 * Graceful fallback: missing or malformed config yields empty list, making
 * the sync a no-op rather than crashing.
 */
function loadGlobalSkills(): string[] {
  try {
    const configPath = join(CRANE_CONSOLE_ROOT, 'config', 'global-skills.json')
    const content = readFileSync(configPath, 'utf-8')
    const names = JSON.parse(content)
    return Array.isArray(names) ? names.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

/**
 * Recursively mirror a directory tree from source to target.
 *
 * - Creates target directories as needed.
 * - Skips files whose content is identical between source and target.
 * - Always overwrites stale files (source is authoritative).
 * - Returns the count of files actually copied.
 *
 * Does not delete files that exist in target but not in source — this keeps
 * local-only additions (e.g., user experiments) intact. Rename with caution.
 */
function mirrorDirectoryTree(sourceDir: string, targetDir: string): number {
  if (!existsSync(sourceDir)) return 0

  let copied = 0
  mkdirSync(targetDir, { recursive: true })

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name)
    const targetPath = join(targetDir, entry.name)

    if (entry.isDirectory()) {
      copied += mirrorDirectoryTree(sourcePath, targetPath)
    } else if (entry.isFile()) {
      if (existsSync(targetPath)) {
        const sourceContent = readFileSync(sourcePath, 'utf-8')
        const targetContent = readFileSync(targetPath, 'utf-8')
        if (sourceContent === targetContent) continue
      }
      copyFileSync(sourcePath, targetPath)
      copied++
    }
  }

  return copied
}

/**
 * Mirror version-controlled enterprise skills from crane-console to ~/.agents/skills/.
 *
 * Skills listed in config/global-skills.json are copied recursively from
 * crane-console/.agents/skills/<name>/ to ~/.agents/skills/<name>/. This keeps
 * the home-directory copies in sync with the source of truth across the fleet,
 * without requiring each venture repo to hold its own copy.
 *
 * Runs on every `crane <venture>` launch (via checkMcpSetup). Fast no-op when
 * everything is already current (identical files skipped by content compare).
 *
 * Also flags orphan directories — entries in ~/.agents/skills/ that are not in
 * config/global-skills.json. These are typically leftovers from retired skills
 * or pre-canonical hand-placed content; the warning prompts the operator to
 * either canonicalize them in crane-console or remove them.
 */
export function syncGlobalSkills(): void {
  const skills = loadGlobalSkills()
  const targetRoot = join(homedir(), '.agents', 'skills')

  if (skills.length > 0) {
    const sourceRoot = join(CRANE_CONSOLE_ROOT, '.agents', 'skills')
    let totalSynced = 0
    for (const skill of skills) {
      const sourceDir = join(sourceRoot, skill)
      const targetDir = join(targetRoot, skill)
      totalSynced += mirrorDirectoryTree(sourceDir, targetDir)
    }

    if (totalSynced > 0) {
      console.log(
        `-> Synced ${totalSynced} global skill file${totalSynced > 1 ? 's' : ''} to ~/.agents/skills/`
      )
    }
  }

  warnOrphanGlobalSkills(targetRoot, skills)
}

/**
 * Warn about directories in ~/.agents/skills/ that are not declared in
 * config/global-skills.json. Pure read; never mutates the filesystem.
 */
function warnOrphanGlobalSkills(targetRoot: string, expected: string[]): void {
  if (!existsSync(targetRoot)) return

  const expectedSet = new Set(expected)
  const orphans: string[] = []
  for (const entry of readdirSync(targetRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && !expectedSet.has(entry.name)) {
      orphans.push(entry.name)
    }
  }

  if (orphans.length === 0) return

  const noun = orphans.length === 1 ? 'entry' : 'entries'
  console.log(
    `-> Warning: ~/.agents/skills/ contains ${orphans.length} non-canonical ${noun}: ${orphans.join(', ')}`
  )
  console.log(
    '-> Add to config/global-skills.json (and place under crane-console/.agents/skills/) or remove. See docs/skills/governance.md.'
  )
}

/**
 * Derive the venture code for a given repo path.
 *
 * Matches by repo directory name against the convention:
 *   {code}-console  (ke → ke-console, sc → sc-console, etc.)
 *   crane-console   (special case for vc, the infra venture)
 *
 * Returns null when no match is found (safe-default: scope-guarded skills skipped).
 */
function resolveVentureCodeFromPath(repoPath: string): string | null {
  const repoName = basename(repoPath)
  for (const v of venturesConfig.ventures as Array<{ code: string }>) {
    const expectedName = v.code === 'vc' ? 'crane-console' : `${v.code}-console`
    if (repoName === expectedName) return v.code
  }
  return null
}

/**
 * Extract the `scope:` value from a SKILL.md YAML frontmatter block.
 *
 * Handles both bare and quoted values:
 *   scope: global
 *   scope: "venture:ss"
 *   scope: enterprise
 *
 * Returns the trimmed, unquoted value, or null if absent or unreadable.
 */
export function parseSkillScope(skillMdPath: string): string | null {
  try {
    const content = readFileSync(skillMdPath, 'utf-8')
    // Match scope: inside a YAML frontmatter block (between the first two ---)
    // We only need the scope line — no need for a full YAML parse.
    const frontmatterMatch = /^---\n([\s\S]*?)\n---/.exec(content)
    if (!frontmatterMatch) return null
    const scopeMatch = /^scope:\s*["']?([^"'\n]+)["']?\s*$/m.exec(frontmatterMatch[1])
    if (!scopeMatch) return null
    return scopeMatch[1].trim()
  } catch {
    return null
  }
}

/**
 * Mirror .agents/skills/ from crane-console to a venture repo.
 *
 * Walks every skill directory in <crane-console>/.agents/skills/<name>/ and
 * recursively mirrors it to <venture-repo>/.agents/skills/<name>/.
 *
 * Safety checks applied per-skill:
 *  1. Scope filter: if the skill's SKILL.md declares `scope: venture:<code>`
 *     where <code> does NOT match the target venture, the skill is skipped.
 *     This prevents vc-specific or ss-specific skills from leaking to wrong repos.
 *  2. Content compare: mirrorDirectoryTree skips identical files — no needless I/O.
 *  3. Target-only preservation: files/dirs that exist in the venture repo but NOT
 *     in crane-console are never deleted.
 *
 * After mirroring, flags orphan directories — entries in the venture repo that
 * are neither mirrored from canon nor legitimately venture-scoped to this repo.
 * These typically indicate hand-ported content that's drifted from canonical.
 *
 * On first run for a venture repo that has zero skills, all non-excluded skills
 * propagate. The count appears in launcher output; the Captain can review the diff.
 *
 * Env flag: CRANE_ENABLE_VENTURE_SKILL_SYNC — defaults to enabled ("1").
 * Set to "0" to disable for a session without code changes:
 *   CRANE_ENABLE_VENTURE_SKILL_SYNC=0 crane ke
 */
export function syncVentureSkills(repoPath: string): void {
  // Belt-and-suspenders opt-out flag (defaults to enabled)
  if (process.env['CRANE_ENABLE_VENTURE_SKILL_SYNC'] === '0') return

  const sourceRoot = join(CRANE_CONSOLE_ROOT, '.agents', 'skills')
  if (!existsSync(sourceRoot)) return

  // Skip when target IS crane-console (source === target)
  try {
    if (statSync(repoPath).ino === statSync(CRANE_CONSOLE_ROOT).ino) return
  } catch {
    // If stat fails, proceed with sync anyway
  }

  const targetRoot = join(repoPath, '.agents', 'skills')
  const ventureCode = resolveVentureCodeFromPath(repoPath)

  let totalSynced = 0
  const canonicalNames = new Set<string>()

  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue

    const skillName = entry.name
    canonicalNames.add(skillName)
    const sourceSkillDir = join(sourceRoot, skillName)
    const skillMdPath = join(sourceSkillDir, 'SKILL.md')

    // Scope check: parse SKILL.md frontmatter and filter venture-scoped skills
    const scope = parseSkillScope(skillMdPath)
    if (scope !== null && scope.startsWith('venture:')) {
      const scopeCode = scope.slice('venture:'.length)
      // If venture code is unknown OR the scope targets a different venture, skip
      if (ventureCode === null || scopeCode !== ventureCode) continue
    }

    const targetSkillDir = join(targetRoot, skillName)
    totalSynced += mirrorDirectoryTree(sourceSkillDir, targetSkillDir)
  }

  if (totalSynced > 0) {
    console.log(
      `-> Synced ${totalSynced} venture skill file${totalSynced > 1 ? 's' : ''} to ${repoPath}/.agents/skills/`
    )
  }

  warnOrphanVentureSkills(targetRoot, canonicalNames, ventureCode)
}

/**
 * Warn about directories in <venture>/.agents/skills/ that are neither mirrored
 * from canon nor scoped to this venture. Pure read; never mutates the filesystem.
 *
 * An entry is an orphan when ALL of:
 *  - It's a directory (loose files like .DS_Store are ignored)
 *  - It does NOT appear in crane-console/.agents/skills/
 *  - Its SKILL.md (if any) is NOT scope: venture:<this-venture>
 *
 * Orphans typically come from hand-ported skill content that's drifted from
 * canonical. Removing them is a Captain-directive action; this function only
 * surfaces the drift.
 */
function warnOrphanVentureSkills(
  targetRoot: string,
  canonicalNames: Set<string>,
  ventureCode: string | null
): void {
  if (!existsSync(targetRoot)) return

  const orphans: string[] = []
  for (const entry of readdirSync(targetRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (canonicalNames.has(entry.name)) continue

    // Allow legitimate venture-scoped skills that don't exist in canon
    const skillMdPath = join(targetRoot, entry.name, 'SKILL.md')
    const scope = parseSkillScope(skillMdPath)
    if (
      scope !== null &&
      scope.startsWith('venture:') &&
      ventureCode !== null &&
      scope.slice('venture:'.length) === ventureCode
    ) {
      continue
    }

    orphans.push(entry.name)
  }

  if (orphans.length === 0) return

  const noun = orphans.length === 1 ? 'entry' : 'entries'
  console.log(
    `-> Warning: ${targetRoot} contains ${orphans.length} non-canonical ${noun}: ${orphans.join(', ')}`
  )
  console.log(
    `-> Either canonicalize in crane-console/.agents/skills/, scope as venture:${ventureCode ?? '<code>'}, or remove. See docs/skills/governance.md.`
  )
}

export function setupGeminiMcp(repoPath: string): void {
  const geminiDir = join(repoPath, '.gemini')
  const settingsPath = join(geminiDir, 'settings.json')

  // Read existing settings or start fresh
  let settings: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    } catch {
      // Malformed JSON - overwrite
    }
  }

  if (!settings.mcpServers) {
    settings.mcpServers = {}
  }
  const mcpServers = settings.mcpServers as Record<string, unknown>

  const mcpEnv: Record<string, string> = {
    CRANE_CONTEXT_KEY: '$CRANE_CONTEXT_KEY',
    CRANE_ENV: '$CRANE_ENV',
    CRANE_VENTURE_CODE: '$CRANE_VENTURE_CODE',
    CRANE_VENTURE_NAME: '$CRANE_VENTURE_NAME',
    CRANE_REPO: '$CRANE_REPO',
    GH_TOKEN: '$GH_TOKEN',
    VERCEL_TOKEN: '$VERCEL_TOKEN',
    CLOUDFLARE_API_TOKEN: '$CLOUDFLARE_API_TOKEN',
    NODE_AUTH_TOKEN: '$NODE_AUTH_TOKEN',
  }

  // Gemini CLI sanitizes process.env before passing to MCP servers, stripping
  // vars matching /TOKEN/i, /KEY/i, /SECRET/i etc. The allowedEnvironmentVariables
  // whitelist bypasses sanitization so tokens survive even if $VAR resolution in
  // the env section has timing issues.
  const allowedEnvVars = Object.keys(mcpEnv)

  let dirty = false

  // --- MCP server env ---
  if (mcpServers.crane) {
    const crane = mcpServers.crane as Record<string, unknown>
    const existing = (crane.env ?? {}) as Record<string, string>
    const merged = { ...existing, ...mcpEnv }
    if (JSON.stringify(existing) !== JSON.stringify(merged)) {
      crane.env = merged
      dirty = true
    }
  } else {
    mcpServers.crane = {
      command: 'crane-mcp',
      args: [],
      env: mcpEnv,
    }
    dirty = true
  }

  // --- Security allowlist for env sanitization bypass ---
  if (!settings.security) {
    settings.security = {}
  }
  const security = settings.security as Record<string, unknown>
  if (!security.environmentVariableRedaction) {
    security.environmentVariableRedaction = {}
  }
  const redaction = security.environmentVariableRedaction as Record<string, unknown>
  const existingAllowed = Array.isArray(redaction.allowed) ? (redaction.allowed as string[]) : []
  const missingVars = allowedEnvVars.filter((v) => !existingAllowed.includes(v))
  if (missingVars.length > 0) {
    redaction.allowed = [...existingAllowed, ...missingVars]
    dirty = true
  }

  if (!dirty) {
    return
  }

  mkdirSync(geminiDir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  console.log('-> Updated .gemini/settings.json (MCP env + security allowlist)')
}

export function setupCodexMcp(): void {
  const codexDir = join(homedir(), '.codex')
  const configPath = join(codexDir, 'config.toml')

  // Read existing config
  let content = ''
  if (existsSync(configPath)) {
    content = readFileSync(configPath, 'utf-8')
  }

  // Codex strips env vars containing KEY/SECRET/TOKEN from ALL subprocess
  // environments (shell commands AND MCP servers) by default.
  // Two configs needed:
  //   1. env_vars - whitelists vars the crane-mcp MCP server can see
  //   2. shell_environment_policy - stops the default filter for shell
  //      commands so gh CLI etc. can access GH_TOKEN
  const envVars =
    '["CRANE_CONTEXT_KEY", "CRANE_ENV", "CRANE_VENTURE_CODE", "CRANE_VENTURE_NAME", "CRANE_REPO", "GH_TOKEN", "VERCEL_TOKEN", "CLOUDFLARE_API_TOKEN", "NODE_AUTH_TOKEN"]'

  let updated = false

  // --- MCP server registration ---
  if (content.includes('[mcp_servers.crane]')) {
    if (content.includes('env_vars')) {
      // Replace existing env_vars with current whitelist (may have new vars)
      const patched = content.replace(/env_vars = \[.*?\]/, `env_vars = ${envVars}`)
      if (patched !== content) {
        content = patched
        updated = true
      }
    } else {
      // Add env_vars after the command line
      const patched = content.replace(
        /(\[mcp_servers\.crane\]\ncommand = "crane-mcp")\n/,
        `$1\nenv_vars = ${envVars}\n`
      )
      if (patched !== content) {
        content = patched
        updated = true
      }
    }
  } else {
    // New registration
    const fullEntry = '\n[mcp_servers.crane]\ncommand = "crane-mcp"\n' + `env_vars = ${envVars}\n`
    content = content.trimEnd() + '\n' + fullEntry
    updated = true
  }

  // --- Shell environment policy ---
  // Without this, Codex strips GH_TOKEN, CRANE_CONTEXT_KEY, CLOUDFLARE_API_TOKEN
  // etc. from shell commands, breaking gh CLI and other tools.
  if (!content.includes('[shell_environment_policy]')) {
    content = content.trimEnd() + '\n\n[shell_environment_policy]\nignore_default_excludes = true\n'
    updated = true
  } else if (!content.includes('ignore_default_excludes')) {
    content = content.replace(
      '[shell_environment_policy]',
      '[shell_environment_policy]\nignore_default_excludes = true'
    )
    updated = true
  }

  // --- Sandbox network access ---
  // workspace-write sandbox blocks network by default, which breaks gh CLI,
  // crane-mcp API calls, and any tool that hits external APIs.
  if (!content.includes('[sandbox_workspace_write]')) {
    content = content.trimEnd() + '\n\n[sandbox_workspace_write]\nnetwork_access = true\n'
    updated = true
  } else if (!content.includes('network_access')) {
    content = content.replace(
      '[sandbox_workspace_write]',
      '[sandbox_workspace_write]\nnetwork_access = true'
    )
    updated = true
  }

  if (updated) {
    mkdirSync(codexDir, { recursive: true })
    writeFileSync(configPath, content)
    console.log('-> Updated Codex config: MCP env_vars + shell_environment_policy')
  }
}

export function setupHermesMcp(): void {
  const hermesAgent = join(homedir(), '.hermes', 'hermes-agent')
  const toolFile = join(hermesAgent, 'tools', 'crane_tools.py')

  if (!existsSync(toolFile)) {
    console.warn('-> Warning: crane_tools.py not found in hermes-agent/tools/')
    console.warn('   Hermes will not have crane API tools available')
    return
  }

  // Self-heal: verify model_tools.py still has crane_tools in its discovery list.
  // hermes update overwrites this file, so re-patch if needed.
  const modelToolsPath = join(hermesAgent, 'model_tools.py')
  if (existsSync(modelToolsPath)) {
    let content = readFileSync(modelToolsPath, 'utf-8')
    if (!content.includes('tools.crane_tools')) {
      content = content.replace(
        '"tools.honcho_tools",\n    ]',
        '"tools.honcho_tools",\n        "tools.crane_tools",\n    ]'
      )
      writeFileSync(modelToolsPath, content)
      console.log('-> Re-patched model_tools.py with crane_tools discovery')
    }
  }
}

export function checkMcpSetup(repoPath: string, agent: string): void {
  // Ensure crane-mcp binary is on PATH
  checkMcpBinary()

  // Sync enterprise commands/agents (all agent types benefit, but only Claude uses .claude/)
  syncClaudeAssets(repoPath)

  // Mirror global skills (nav-spec, product-design, etc.) to ~/.agents/skills/
  // so they are available in any venture context, not just crane-console.
  syncGlobalSkills()

  // Mirror enterprise skills from crane-console to the venture repo's .agents/skills/.
  // Scope-guarded skills (venture:<code>) only propagate to their matching venture.
  syncVentureSkills(repoPath)

  // Register crane MCP server for the target agent
  switch (agent) {
    case 'claude':
      setupClaudeMcp(repoPath)
      break
    case 'gemini':
      setupGeminiMcp(repoPath)
      break
    case 'codex':
      setupCodexMcp()
      break
    case 'hermes':
      setupHermesMcp()
      break
    default:
      // Unknown agent - skip MCP registration, binary is still validated
      console.warn(`-> Warning: no MCP registration for agent '${agent}'`)
  }
}

// ============================================================================
// Startup prompt injection
// ============================================================================

/**
 * Plain-English startup prompt for agents that don't support Claude-style
 * slash commands (Codex, etc). Codex auto-loads project AGENTS.md but most
 * venture repos don't have one — and even if they did, "auto session start"
 * instructions in AGENTS.md don't reliably translate into "stop and wait"
 * behavior. Injecting an explicit startup prompt is the only reliable way
 * to force the same SOS contract that Claude gets via /sos.
 */
const CODEX_STARTUP_PROMPT = `Run these MCP tool calls in order, then STOP and await user instructions:

1. crane_sos (no arguments)
2. crane_schedule with action="planned-events", from and to set to today's date, type="planned"

Display the briefing returned by crane_sos. Highlight any Resume block or P0 issues.

CRITICAL: Do not start any work after displaying the briefing. Do not explore the codebase, run tests, check git status, view PRs, or take any other action. Wait for the user to tell you what to focus on.`

/**
 * Decide which startup prompt (if any) to inject as a positional arg to the
 * agent binary. Returns null when injection should be skipped.
 *
 * Skip cases:
 * - User passed an explicit positional prompt or subcommand (we'd clobber it)
 * - User invoked headless mode (claude -p / --print)
 * - Agent has no defined startup prompt (gemini, hermes — left unchanged)
 */
export function getStartupPrompt(agent: string, extraArgs: string[]): string | null {
  // Headless / non-interactive modes — never inject
  if (extraArgs.includes('-p') || extraArgs.includes('--print')) {
    return null
  }

  // User-supplied positional arg (prompt OR subcommand like `codex exec`)
  // — never override
  const hasPositional = extraArgs.some((a) => !a.startsWith('-'))
  if (hasPositional) {
    return null
  }

  switch (agent) {
    case 'claude':
      // Claude executes /sos as a slash command (.claude/commands/sos.md)
      return '/sos'
    case 'codex':
      // Codex has no slash-command equivalent at the CLI level — pass the
      // full instructions as the initial prompt.
      return CODEX_STARTUP_PROMPT
    default:
      // gemini and hermes are intentionally not auto-injected here.
      // gemini supports .gemini/commands/sos.toml but no startup-prompt
      // mechanism is wired through this launcher yet.
      // hermes uses subcommand-based invocation (chat/gateway/etc.)
      return null
  }
}

// ============================================================================
// Agent launcher - direct spawn, no infisical wrapper
// ============================================================================

export function launchAgent(
  venture: VentureWithRepo,
  agent: string,
  debug: boolean = false,
  extraArgs: string[] = []
): void {
  const infisicalPath = INFISICAL_PATHS[venture.code]
  if (!infisicalPath) {
    console.error(`No Infisical path configured for venture: ${venture.code}`)
    process.exit(1)
  }

  // Handle SSH session auth (Infisical UA + keychain unlock)
  const sshAuth = prepareSSHAuth(debug)
  if (sshAuth.abort) {
    console.error(`\n${sshAuth.abort}`)
    process.exit(1)
  }

  // Verify agent binary is installed
  validateAgentBinary(agent)

  // Self-healing: ensure crane-mcp is on PATH and registered for this agent
  checkMcpSetup(venture.localPath!, agent)

  // Fetch and validate secrets (single fetch - no infisical wrapper)
  const result = fetchSecrets(venture.localPath!, infisicalPath, sshAuth.env)
  if ('error' in result) {
    console.error(`\nSecret fetch failed for ${venture.name}:\n${result.error}`)
    process.exit(1)
  }

  const { secrets } = result

  if (debug) {
    console.log(
      `[debug] Fetched ${Object.keys(secrets).length} secrets (direct, no infisical wrapper)`
    )
    console.log(`[debug] Keys: ${Object.keys(secrets).join(', ')}`)
  }

  console.log(`\n-> Switching to ${venture.name}...`)
  console.log(`-> Launching ${agent} with ${infisicalPath} secrets (direct inject)...\n`)

  // Change to the repo directory
  process.chdir(venture.localPath!)

  // Sync the venture repo with origin before handing off to the agent, so
  // the agent's `git log` / `git grep` reflects merged-upstream state. Never
  // pulls over uncommitted work or when the local branch is ahead. Fails
  // silently on network errors so an offline launch still works.
  syncVentureRepo(venture.localPath!)

  const binary = KNOWN_AGENTS[agent]

  if (debug) {
    console.log(`[debug] agent: ${agent}`)
    console.log(`[debug] cwd: ${venture.localPath}`)
    console.log(
      `[debug] command: ${binary}${extraArgs.length ? ` ${extraArgs.join(' ')}` : ''} (direct spawn, secrets injected via env)`
    )
    if (sshAuth.env.INFISICAL_TOKEN) {
      console.log(`[debug] using INFISICAL_TOKEN from Universal Auth`)
    }
    if (extraArgs.length) {
      console.log(`[debug] passthrough args: ${JSON.stringify(extraArgs)}`)
    }
  }

  const repoName = basename(venture.localPath!)

  // Set terminal title for Ghostty tab identification during startup/idle
  if (process.stdout.isTTY) {
    process.stdout.write(`\x1b]2;[${venture.code.toUpperCase()}] ${repoName}\x07`)
  }

  // Build child env: process.env + fetched secrets + SSH auth env
  // Propagate normalized CRANE_ENV so the MCP server uses the correct worker URL
  // Include venture identity vars for statusline and other tools
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    ...secrets,
    ...sshAuth.env,
    CRANE_ENV: getCraneEnv(),
    CRANE_VENTURE_CODE: venture.code,
    CRANE_VENTURE_NAME: venture.name,
    CRANE_REPO: repoName,
    MCP_TIMEOUT: process.env.MCP_TIMEOUT ?? '30000',
    // Claude.ai remote MCP integrations are left enabled so that
    // non-crane integrations (Google Calendar, Notion, etc.) remain
    // available. Redundant crane-context tools are blocked by deny
    // rules in .claude/settings.json instead of a blanket kill switch.
    // Force Claude Code to load all MCP tool schemas eagerly. By default
    // (Claude Code 2.1.x) MCP tools are auto-deferred when their schemas
    // exceed ~10% of the context window — they show up in a deferred-tool
    // system reminder and the agent must call `ToolSearch` to materialize
    // each schema before invoking it. Crane MCP exposes 17+ tools and
    // crosses that threshold every session, so the default behavior breaks
    // every slash command that calls a crane tool: the agent doesn't see
    // `crane_sos` (or any sibling) on its active tool list, doesn't know
    // about the deferral mechanism, and falsely reports "MCP not connected"
    // — even though the server is healthy and `claude mcp list` shows it
    // connected. We pay ~5K tokens of upfront context for guaranteed-direct
    // access to crane tools, which is the right trade-off for venture
    // sessions where crane MCP IS the working interface. No-op for non-Claude
    // agents (gemini/codex/hermes don't read this var).
    ENABLE_TOOL_SEARCH: 'false',
  }

  // Auto-inject startup prompt for interactive sessions.
  // Without this, agents launch bare and their first response to any user
  // message becomes a free-form action — Codex in particular will start
  // exploring the codebase, running tests, and resuming "blocked work" rather
  // than retrieving venture context and waiting for instructions.
  const startupPrompt = getStartupPrompt(agent, extraArgs)
  if (startupPrompt !== null) {
    extraArgs.push(startupPrompt)
  }

  // Hermes-specific env and arg translation
  if (agent === 'hermes') {
    // Hermes uses OpenRouter (OPENROUTER_API_KEY from its own .env), not the
    // OpenAI-compatible key crane injects. If OPENAI_API_KEY leaks into
    // hermes's env, the OpenAI SDK picks it up before OPENROUTER_API_KEY,
    // causing 401s against OpenRouter. Remove it.
    delete (childEnv as Record<string, string | undefined>).OPENAI_API_KEY

    // Translate -p (crane headless) to chat -q (hermes single-query mode)
    const pIdx = extraArgs.indexOf('-p')
    if (pIdx !== -1) {
      extraArgs[pIdx] = '-q'
      extraArgs = ['chat', ...extraArgs]
    } else if (
      !extraArgs.some((a) =>
        ['chat', 'gateway', 'setup', 'doctor', 'config', 'skills', 'cron', 'status'].includes(a)
      )
    ) {
      extraArgs = ['chat', ...extraArgs]
    }
  }

  // Spawn agent directly - secrets are already in the env, no infisical wrapper needed
  // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process — `spawn(binary, extraArgs, ...)` uses argv-array form (not shell interpolation); `binary` is closed-set from KNOWN_AGENTS; no command-injection surface
  const child = spawn(binary, extraArgs, {
    stdio: 'inherit',
    cwd: venture.localPath!,
    env: childEnv,
  })

  // Forward signals so Ctrl-C kills the child cleanly (no orphan processes)
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => child.kill(sig))
  }

  child.on('error', (err) => {
    console.error(`Failed to launch ${binary}: ${err.message}`)
    if (err.message.includes('ENOENT')) {
      console.error(`Is ${binary} installed and in PATH?`)
    }
    process.exit(1)
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      if (debug) {
        console.log(`[debug] Process terminated by signal: ${signal}`)
      }
      // Map common signals to exit codes
      const signalCodes: Record<string, number> = {
        SIGTERM: 143,
        SIGINT: 130,
        SIGKILL: 137,
      }
      process.exit(signalCodes[signal] || 128)
    }
    if (debug && code !== 0) {
      console.log(`[debug] Process exited with code: ${code}`)
    }
    process.exit(code || 0)
  })
}

// ============================================================================
// main() - CLI entry point logic
// ============================================================================

export async function main(): Promise<void> {
  // Auto-rebuild if source is newer than build (fleet deployment self-healing)
  ensureFreshBuild()

  const args = process.argv.slice(2)
  const debug = args.includes('--debug') || args.includes('-d')
  const filteredArgs = args.filter((a) => a !== '--debug' && a !== '-d')

  // Handle --list flag
  if (filteredArgs.includes('--list') || filteredArgs.includes('-l')) {
    const ventures = await fetchVentures()
    const withRepos = matchVenturesToRepos(ventures)
    printVentureList(withRepos)
    return
  }

  // Handle --help flag
  if (filteredArgs.includes('--help') || filteredArgs.includes('-h')) {
    console.log(`
crane - Venture launcher

Usage:
  crane              Interactive menu - pick a venture
  crane <code>       Direct launch - e.g., crane vc, crane ke
  crane <code> [agent args...]  Pass args through to agent binary
  crane --claude     Launch with Claude (default)
  crane --gemini     Launch with Gemini
  crane --codex      Launch with Codex
  crane --hermes     Launch with Hermes
  crane --agent X    Launch with agent X
  crane --list       Show ventures without launching
  crane --secrets-audit       Audit shared secrets across all ventures
  crane --secrets-audit --fix Fix missing shared secrets
  crane --debug      Enable debug output for troubleshooting
  crane --help       Show this help

Venture codes:
  vc   Venture Crane
  ke   Kid Expenses
  sc   Silicon Crane
  dfg  Durgan Field Guide

Environment:
  CRANE_DEFAULT_AGENT   Default agent (claude|gemini|codex|hermes). Default: claude
  CRANE_ENV             Environment (dev|prod). Default: prod

Arg passthrough:
  Any args not recognized as crane flags are forwarded to the agent binary.
  This enables headless mode and other agent-specific features.

Examples:
  crane vc             # Launch Claude into Venture Crane
  crane vc --gemini    # Launch Gemini into Venture Crane
  crane ke --codex     # Launch Codex into Kid Expenses
  crane --list         # List all ventures and their local paths
  crane vc -p "fix the typo in README"   # Headless: run prompt and exit
  crane vc -p "run tests" --allowedTools "Bash(npm test)"  # Headless with tool restrictions
`)
    return
  }

  // Handle --secrets-audit flag
  if (filteredArgs.includes('--secrets-audit')) {
    const fix = filteredArgs.includes('--fix')
    const scriptPath = join(CRANE_CONSOLE_ROOT, 'scripts', 'sync-shared-secrets.sh')
    const auditArgs = fix ? ['--fix'] : []
    const result = spawnSync('bash', [scriptPath, ...auditArgs], {
      stdio: 'inherit',
      cwd: CRANE_CONSOLE_ROOT,
    })
    process.exit(result.status ?? 0)
  }

  // Resolve agent first (checks for conflicts, validates name)
  const agent = resolveAgent(filteredArgs)

  // Strip agent flags so they don't interfere with venture parsing
  const cleanArgs = stripAgentFlags(filteredArgs)

  // Fetch ventures
  const ventures = await fetchVentures()
  const withRepos = matchVenturesToRepos(ventures)

  // Extract passthrough args for agent binary (e.g., -p "prompt" for headless mode)
  const passthrough = extractPassthroughArgs(args)

  // Direct launch by code
  const nonFlagArgs = cleanArgs.filter((a) => !a.startsWith('-'))
  if (nonFlagArgs.length > 0) {
    const code = nonFlagArgs[0].toLowerCase()
    const venture = withRepos.find((v) => v.code === code)

    if (!venture) {
      console.error(`Unknown venture code: ${code}`)
      console.error(`Available: ${withRepos.map((v) => v.code).join(', ')}`)
      process.exit(1)
    }

    if (!venture.localPath) {
      console.log(`\n${venture.name} is not cloned locally.`)
      const clonedPath = await cloneVenture(venture)
      if (!clonedPath) {
        process.exit(1)
      }
      venture.localPath = clonedPath
    }

    launchAgent(venture, agent, debug, passthrough)
    return
  }

  // Interactive menu
  console.log('\nCrane Console Launcher')
  console.log('======================')
  printVentureList(withRepos)

  const selected = await promptSelection(withRepos)
  if (!selected) {
    console.log('No venture selected.')
    process.exit(0)
  }

  launchAgent(selected, agent, debug, passthrough)
}
