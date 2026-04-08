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

/** Stitch remote MCP endpoint. Stitch is a remote HTTP MCP server — no local
 *  subprocess needed. Auth is via API key header (STITCH_API_KEY from Infisical).
 *  Docs: https://stitch.withgoogle.com/docs/mcp/setup */
const STITCH_MCP_URL = 'https://stitch.googleapis.com/mcp'

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
  '--stitch',
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

export function setupClaudeMcp(repoPath: string): void {
  // Pre-accept the project trust dialog so Claude Code loads .mcp.json on first run.
  // Without this, project-scope MCP servers stay dormant until the user clicks
  // through an interactive prompt — easy to miss, easy to dismiss, and the
  // resulting "no crane MCP" failure is opaque.
  ensureClaudeProjectTrust(repoPath)

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

  // Stitch is now a remote HTTP MCP server — no local subprocess needed.
  // The user-level config (~/.claude.json) handles the API key header.
  // Remove any legacy subprocess stitch entry from .mcp.json so it doesn't conflict.
  const servers = (sourceConfig.mcpServers ?? {}) as Record<string, Record<string, unknown>>
  if (servers.stitch && (servers.stitch as Record<string, unknown>).command) {
    delete servers.stitch
    writeFileSync(source, JSON.stringify(sourceConfig, null, 2) + '\n')
    console.log('-> Removed legacy Stitch subprocess from .mcp.json (now remote HTTP)')
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

  // Remove legacy Stitch subprocess from target (now remote HTTP, configured per-user)
  if (targetServers.stitch && (targetServers.stitch as Record<string, unknown>).command) {
    delete targetServers.stitch
    dirty = true
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

  // --- Stitch: remove legacy subprocess entry (now remote HTTP, configured per-user) ---
  if (mcpServers.stitch && (mcpServers.stitch as Record<string, unknown>).command) {
    delete mcpServers.stitch
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
    '["CRANE_CONTEXT_KEY", "CRANE_ENV", "CRANE_VENTURE_CODE", "CRANE_VENTURE_NAME", "CRANE_REPO", "GH_TOKEN", "VERCEL_TOKEN", "CLOUDFLARE_API_TOKEN"]'

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

  // Stitch is now a remote HTTP MCP server — no Codex config needed.
  // Remove legacy subprocess entry if present.
  if (content.includes('[mcp_servers.stitch]')) {
    content = content.replace(/\[mcp_servers\.stitch][^[]*/, '')
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

  // MIGRATION (2026-03-31): Remove stitch from user-scope MCP.
  // Stitch is now gated behind `crane --stitch` using project-scope registration.
  // Fleet machines may still have the old user-scope entry. Safe to remove after
  // all fleet machines have run at least one `crane` launch. Delete this block after 2026-04-14.
  if (agent === 'claude') {
    try {
      const check = spawnSync('claude', ['mcp', 'list'], { encoding: 'utf-8', stdio: 'pipe' })
      if (check.stdout?.includes('stitch') && check.stdout?.includes('googleapis.com')) {
        spawnSync('claude', ['mcp', 'remove', 'stitch', '-s', 'user'], { stdio: 'pipe' })
        console.log('-> Removed legacy user-scope Stitch MCP (now gated behind --stitch)')
      }
    } catch {
      // Best-effort migration
    }
  }

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
  extraArgs: string[] = [],
  enableStitch: boolean = false
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
    // Disable Claude.ai remote MCP integrations in CLI sessions.
    // The local crane MCP + gh CLI cover everything agents need.
    // Without this, remote servers like crane-context expose redundant
    // GitHub tools that bloat context and mislead agents.
    ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
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

  // Inject Stitch MCP when --stitch is passed (project-scope, writes to gitignored settings.local.json)
  if (enableStitch && agent === 'claude') {
    const stitchApiKey = secrets.STITCH_API_KEY || process.env.STITCH_API_KEY
    if (stitchApiKey) {
      try {
        spawnSync(
          'claude',
          [
            'mcp',
            'add',
            'stitch',
            '--transport',
            'http',
            STITCH_MCP_URL,
            '-H',
            `X-Goog-Api-Key: ${stitchApiKey}`,
            '-s',
            'project',
          ],
          { cwd: venture.localPath!, stdio: debug ? 'inherit' : 'pipe' }
        )
        console.log('-> Stitch MCP enabled for this session')
      } catch {
        console.warn('-> Warning: failed to add Stitch MCP')
      }
    } else {
      console.warn('-> Warning: --stitch passed but STITCH_API_KEY not found in secrets')
    }
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
    // Clean up Stitch MCP project-scope registration on exit
    if (enableStitch && agent === 'claude') {
      try {
        spawnSync('claude', ['mcp', 'remove', 'stitch', '-s', 'project'], {
          cwd: venture.localPath!,
          stdio: 'pipe',
        })
      } catch {
        // Best-effort cleanup - harmless if it fails
      }
    }

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
  crane --stitch     Enable Stitch design MCP for this session
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
  const enableStitch = args.includes('--stitch')

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

    launchAgent(venture, agent, debug, passthrough, enableStitch)
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

  launchAgent(selected, agent, debug, passthrough, enableStitch)
}
