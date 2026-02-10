#!/usr/bin/env node
/**
 * crane - Venture launcher CLI
 *
 * Launches an AI agent into any venture with proper secrets context.
 *
 * Usage:
 *   crane              # Interactive menu (launches default agent)
 *   crane vc           # Direct launch into Venture Crane
 *   crane vc --gemini  # Launch with Gemini instead of default
 *   crane --list       # Show ventures without launching
 */

import { createInterface } from 'readline'
import { spawn, execSync } from 'child_process'
import { existsSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { Venture } from '../lib/crane-api.js'
import { scanLocalRepos, LocalRepo } from '../lib/repo-scanner.js'
import { prepareSSHAuth } from './ssh-auth.js'

// Resolve crane-console root relative to this script
// Compiled path: packages/crane-mcp/dist/cli/launch.js → 4 levels up
const __filename = fileURLToPath(import.meta.url)
const CRANE_CONSOLE_ROOT = join(dirname(__filename), '..', '..', '..', '..')

const API_BASE = 'https://crane-context.automation-ab6.workers.dev'
const WORKSPACE_ID = '2da2895e-aba2-4faf-a65a-b86e1a7aa2cb'

// Known agent CLIs and their binary names
const KNOWN_AGENTS: Record<string, string> = {
  claude: 'claude',
  gemini: 'gemini',
  codex: 'codex',
}

const AGENT_FLAGS = Object.keys(KNOWN_AGENTS).map((a) => `--${a}`)

const AGENT_INSTALL_HINTS: Record<string, string> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  gemini: 'npm install -g @google/gemini-cli',
  codex: 'npm install -g @openai/codex',
}

/**
 * Resolve which agent to launch.
 * Priority: explicit flag > --agent <name> > CRANE_DEFAULT_AGENT > "claude"
 */
function resolveAgent(args: string[]): string {
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
function validateAgentBinary(agent: string): void {
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
function stripAgentFlags(args: string[]): string[] {
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

// Venture code to Infisical path mapping
const INFISICAL_PATHS: Record<string, string> = {
  vc: '/vc',
  ke: '/ke',
  sc: '/sc',
  dfg: '/dfg',
  smd: '/smd',
  dc: '/dc',
}

interface VentureWithRepo extends Venture {
  localPath: string | null
}

async function fetchVentures(): Promise<Venture[]> {
  try {
    const response = await fetch(`${API_BASE}/ventures`)
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

function matchVenturesToRepos(ventures: Venture[]): VentureWithRepo[] {
  const repos = scanLocalRepos()
  return ventures.map((v) => {
    const repo = repos.find((r) => r.org.toLowerCase() === v.org.toLowerCase())
    return {
      ...v,
      localPath: repo?.path || null,
    }
  })
}

async function cloneVenture(venture: VentureWithRepo): Promise<string | null> {
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

function printVentureList(ventures: VentureWithRepo[]): void {
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

async function promptSelection(ventures: VentureWithRepo[]): Promise<VentureWithRepo | null> {
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

function checkInfisicalSetup(
  repoPath: string,
  infisicalPath: string,
  extraEnv?: Record<string, string>
): { ok: boolean; error?: string } {
  // Check for .infisical.json in repo — auto-copy from crane-console if missing
  const configPath = join(repoPath, '.infisical.json')
  if (!existsSync(configPath)) {
    const source = join(CRANE_CONSOLE_ROOT, '.infisical.json')
    if (existsSync(source)) {
      copyFileSync(source, configPath)
      console.log(`-> Copied .infisical.json from crane-console`)
    } else {
      return {
        ok: false,
        error: `Missing .infisical.json in ${repoPath} and no source found in ~/dev/crane-console/`,
      }
    }
  }

  // Check if Infisical path exists by trying to list secrets
  // When INFISICAL_TOKEN is provided (SSH/UA), add --projectId since
  // token-based auth doesn't read .infisical.json for project context
  try {
    let cmd = `infisical secrets --path ${infisicalPath} --env dev`
    if (extraEnv?.INFISICAL_TOKEN) {
      cmd += ` --projectId ${WORKSPACE_ID}`
    }
    execSync(cmd, {
      cwd: repoPath,
      stdio: 'pipe',
      env: extraEnv ? { ...process.env, ...extraEnv } : undefined,
    })
    return { ok: true }
  } catch {
    return {
      ok: false,
      error: `Infisical path '${infisicalPath}' not found.\nCreate it in Infisical web UI: https://app.infisical.com`,
    }
  }
}

function checkMcpSetup(repoPath: string): void {
  // Check 1: Is crane-mcp on PATH?
  try {
    execSync('which crane-mcp', { stdio: 'pipe' })
  } catch {
    console.log('-> crane-mcp not found on PATH, rebuilding...')
    const mcpDir = join(repoPath, 'packages', 'crane-mcp')
    if (existsSync(mcpDir)) {
      execSync('npm install && npm run build && npm link', {
        cwd: mcpDir,
        stdio: 'inherit',
      })
      console.log('-> crane-mcp rebuilt and linked\n')
    } else {
      console.error('Cannot find packages/crane-mcp — is this crane-console?')
      process.exit(1)
    }
  }

  // Check 2: Does .mcp.json exist in repo?
  const mcpJson = join(repoPath, '.mcp.json')
  if (!existsSync(mcpJson)) {
    const source = join(CRANE_CONSOLE_ROOT, '.mcp.json')
    if (existsSync(source)) {
      copyFileSync(source, mcpJson)
      console.log('-> Copied .mcp.json from crane-console')
    } else {
      console.warn(
        '-> Warning: .mcp.json missing and no source found — crane MCP tools may not work'
      )
    }
  }
}

function launchAgent(venture: VentureWithRepo, agent: string, debug: boolean = false): void {
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

  // Self-healing: ensure crane-mcp is on PATH and .mcp.json exists
  checkMcpSetup(venture.localPath!)

  // Validate Infisical setup before launching
  const check = checkInfisicalSetup(venture.localPath!, infisicalPath, sshAuth.env)
  if (!check.ok) {
    console.error(`\nInfisical setup error for ${venture.name}:\n${check.error}`)
    process.exit(1)
  }

  console.log(`\n-> Switching to ${venture.name}...`)
  console.log(`-> Launching ${agent} with ${infisicalPath} secrets...\n`)

  // Change to the repo directory
  process.chdir(venture.localPath!)

  // Build command arguments
  // --silent suppresses infisical update warnings and tips
  const args = ['run', '--silent', '--path', infisicalPath]

  // When using token-based auth (SSH/UA), add --projectId since
  // INFISICAL_TOKEN auth doesn't read .infisical.json for project context
  if (sshAuth.env.INFISICAL_TOKEN) {
    args.push('--projectId', WORKSPACE_ID)
  }

  args.push('--', KNOWN_AGENTS[agent])

  if (debug) {
    console.log(`[debug] agent: ${agent}`)
    console.log(`[debug] cwd: ${venture.localPath}`)
    console.log(`[debug] command: infisical ${args.join(' ')}`)
    if (sshAuth.env.INFISICAL_TOKEN) {
      console.log(`[debug] using INFISICAL_TOKEN from Universal Auth`)
    }
  }

  // Merge SSH auth env vars (INFISICAL_TOKEN) into child process env.
  // Token is passed via env (not --token flag) to avoid leaking in ps output.
  const childEnv =
    Object.keys(sshAuth.env).length > 0 ? { ...process.env, ...sshAuth.env } : undefined

  // Use spawn without shell: true to avoid DEP0190 warning and potential loop issues
  // The shell option can cause problems with process spawning on some machines
  const child = spawn('infisical', args, {
    stdio: 'inherit',
    cwd: venture.localPath!,
    env: childEnv,
  })

  child.on('error', (err) => {
    console.error(`Failed to launch infisical: ${err.message}`)
    if (err.message.includes('ENOENT')) {
      console.error('Is infisical installed and in PATH?')
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

async function main(): Promise<void> {
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
  crane --debug      Enable debug output for troubleshooting
  crane --help       Show this help

Venture codes:
  vc   Venture Crane
  ke   Kid Expenses
  sc   Silicon Crane
  dfg  Durgan Field Guide

Environment:
  CRANE_DEFAULT_AGENT   Default agent (claude|gemini|codex). Default: claude

Examples:
  crane vc             # Launch Claude into Venture Crane
  crane vc --gemini    # Launch Gemini into Venture Crane
  crane ke --codex     # Launch Codex into Kid Expenses
  crane --list         # List all ventures and their local paths
`)
    return
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

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
