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
}

export const AGENT_FLAGS = Object.keys(KNOWN_AGENTS).map((a) => `--${a}`)

export const AGENT_INSTALL_HINTS: Record<string, string> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  gemini: 'npm install -g @google/gemini-cli',
  codex: 'npm install -g @openai/codex',
}

// Venture code to Infisical path mapping.
// Only secrets at these exact paths are injected into agent env.
// Sub-paths (e.g., /vc/vault) are NOT fetched - use for storage-only secrets.
// See docs/infra/secrets-management.md "Vault" section.
export const INFISICAL_PATHS: Record<string, string> = {
  vc: '/vc',
  ke: '/ke',
  sc: '/sc',
  dfg: '/dfg',
  smd: '/smd',
  dc: '/dc',
}

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

export function setupClaudeMcp(repoPath: string): void {
  const mcpJson = join(repoPath, '.mcp.json')
  if (!existsSync(mcpJson)) {
    const source = join(CRANE_CONSOLE_ROOT, '.mcp.json')
    if (existsSync(source)) {
      copyFileSync(source, mcpJson)
      console.log('-> Copied .mcp.json from crane-console')
    } else {
      console.warn('-> Warning: .mcp.json missing - crane MCP tools may not work')
    }
  }
}

export function setupGeminiMcp(repoPath: string): void {
  const geminiDir = join(repoPath, '.gemini')
  const settingsPath = join(geminiDir, 'settings.json')

  // Read existing settings or start fresh
  let settings: { mcpServers?: Record<string, unknown> } = {}
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

  // Already registered - ensure env passthrough is present
  if (settings.mcpServers.crane) {
    const crane = settings.mcpServers.crane as Record<string, unknown>
    if (crane.env) {
      return
    }
    crane.env = {
      CRANE_CONTEXT_KEY: '$CRANE_CONTEXT_KEY',
      CRANE_ENV: '$CRANE_ENV',
      CRANE_VENTURE_CODE: '$CRANE_VENTURE_CODE',
      CRANE_VENTURE_NAME: '$CRANE_VENTURE_NAME',
      CRANE_REPO: '$CRANE_REPO',
    }
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
    console.log('-> Updated crane MCP server with env in .gemini/settings.json')
    return
  }

  settings.mcpServers.crane = {
    command: 'crane-mcp',
    args: [],
    env: {
      CRANE_CONTEXT_KEY: '$CRANE_CONTEXT_KEY',
      CRANE_ENV: '$CRANE_ENV',
      CRANE_VENTURE_CODE: '$CRANE_VENTURE_CODE',
      CRANE_VENTURE_NAME: '$CRANE_VENTURE_NAME',
      CRANE_REPO: '$CRANE_REPO',
    },
  }

  mkdirSync(geminiDir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  console.log('-> Registered crane MCP server in .gemini/settings.json')
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
    '["CRANE_CONTEXT_KEY", "CRANE_ENV", "CRANE_VENTURE_CODE", "CRANE_VENTURE_NAME", "CRANE_REPO", "GH_TOKEN", "VERCEL_TOKEN"]'

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

export function checkMcpSetup(repoPath: string, agent: string): void {
  // Ensure crane-mcp binary is on PATH
  checkMcpBinary()

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
    default:
      // Unknown agent - skip MCP registration, binary is still validated
      console.warn(`-> Warning: no MCP registration for agent '${agent}'`)
  }
}

// ============================================================================
// Agent launcher - direct spawn, no infisical wrapper
// ============================================================================

export function launchAgent(venture: VentureWithRepo, agent: string, debug: boolean = false): void {
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
    console.log(`[debug] command: ${binary} (direct spawn, secrets injected via env)`)
    if (sshAuth.env.INFISICAL_TOKEN) {
      console.log(`[debug] using INFISICAL_TOKEN from Universal Auth`)
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
  const childEnv = {
    ...process.env,
    ...secrets,
    ...sshAuth.env,
    CRANE_ENV: getCraneEnv(),
    CRANE_VENTURE_CODE: venture.code,
    CRANE_VENTURE_NAME: venture.name,
    CRANE_REPO: repoName,
  }

  // Spawn agent directly - secrets are already in the env, no infisical wrapper needed
  const child = spawn(binary, [], {
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
  crane --claude     Launch with Claude (default)
  crane --gemini     Launch with Gemini
  crane --codex      Launch with Codex
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
  CRANE_DEFAULT_AGENT   Default agent (claude|gemini|codex). Default: claude
  CRANE_ENV             Environment (dev|prod). Default: prod

Examples:
  crane vc             # Launch Claude into Venture Crane
  crane vc --gemini    # Launch Gemini into Venture Crane
  crane ke --codex     # Launch Codex into Kid Expenses
  crane --list         # List all ventures and their local paths
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

    launchAgent(venture, agent, debug)
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

  launchAgent(selected, agent, debug)
}
