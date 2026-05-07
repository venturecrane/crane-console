/**
 * Agent resolution, validation, and venture launch logic.
 *
 * Shared spawn infrastructure (buildChildEnv, spawnAgent, applyHermesTranslation,
 * getStartupPrompt) is exported for use by engagement-launch.ts.
 */

import { spawn } from 'node:child_process'
import { basename } from 'node:path'
import { getCraneEnv } from '../../lib/config.js'
import { prepareSSHAuth } from '../ssh-auth.js'
import {
  KNOWN_AGENTS,
  AGENT_FLAGS,
  AGENT_INSTALL_HINTS,
  INFISICAL_PATHS,
  VentureWithRepo,
} from './constants.js'
import { fetchSecrets } from './secrets.js'
import { checkMcpSetup } from './mcp-setup.js'
import { syncVentureRepo } from './build-utils.js'
import { execSync } from 'node:child_process'

/**
 * Resolve which agent to launch.
 * Priority: explicit flag > --agent <name> > CRANE_DEFAULT_AGENT > "claude"
 */
export function resolveAgent(args: string[]): string {
  const matched = AGENT_FLAGS.filter((f) => args.includes(f))
  if (matched.length > 1) {
    console.error(`Conflicting agent flags: ${matched.join(', ')}. Pick one.`)
    process.exit(1)
  }
  if (matched.length === 1) {
    return matched[0].replace('--', '')
  }

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

  const envAgent = process.env.CRANE_DEFAULT_AGENT?.toLowerCase()
  if (envAgent) {
    if (!(envAgent in KNOWN_AGENTS)) {
      console.error(`Unknown CRANE_DEFAULT_AGENT: ${envAgent}`)
      console.error(`Supported: ${Object.keys(KNOWN_AGENTS).join(', ')}`)
      process.exit(1)
    }
    return envAgent
  }

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
      continue
    }
    if (args[i] === '--agent') {
      i++
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

    if (CRANE_FLAGS.has(arg)) {
      if (arg === '--agent') i++
      continue
    }

    if (!arg.startsWith('-') && !ventureCodeSeen) {
      ventureCodeSeen = true
      continue
    }

    result.push(arg)
  }

  return result
}

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
  if (extraArgs.includes('-p') || extraArgs.includes('--print')) {
    return null
  }

  const hasPositional = extraArgs.some((a) => !a.startsWith('-'))
  if (hasPositional) {
    return null
  }

  switch (agent) {
    case 'claude':
      return '/sos'
    case 'codex':
      return CODEX_STARTUP_PROMPT
    default:
      return null
  }
}

export interface VentureIdentity {
  code: string
  name: string
  repoName: string
}

export function buildChildEnv(
  secrets: Record<string, string>,
  sshAuthEnv: Record<string, string>,
  identity: VentureIdentity,
  extraEnv?: Record<string, string>
): Record<string, string | undefined> {
  return {
    ...process.env,
    ...secrets,
    ...sshAuthEnv,
    ...extraEnv,
    CRANE_ENV: getCraneEnv(),
    CRANE_VENTURE_CODE: identity.code,
    CRANE_VENTURE_NAME: identity.name,
    CRANE_REPO: identity.repoName,
    MCP_TIMEOUT: process.env.MCP_TIMEOUT ?? '30000',
    ENABLE_TOOL_SEARCH: 'false',
  }
}

export function spawnAgent(
  binary: string,
  args: string[],
  cwd: string,
  env: Record<string, string | undefined>,
  debug: boolean
): void {
  // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process — `spawn(binary, args, ...)` uses argv-array form (not shell interpolation); `binary` is closed-set from KNOWN_AGENTS; no command-injection surface
  const child = spawn(binary, args, {
    stdio: 'inherit',
    cwd,
    env,
  })

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

export function applyHermesTranslation(
  childEnv: Record<string, string | undefined>,
  extraArgs: string[]
): string[] {
  // Hermes uses OpenRouter (OPENROUTER_API_KEY from its own .env), not the
  // OpenAI-compatible key crane injects. If OPENAI_API_KEY leaks into
  // hermes's env, the OpenAI SDK picks it up before OPENROUTER_API_KEY,
  // causing 401s against OpenRouter. Remove it.
  delete (childEnv as Record<string, string | undefined>).OPENAI_API_KEY

  const pIdx = extraArgs.indexOf('-p')
  if (pIdx !== -1) {
    extraArgs[pIdx] = '-q'
    return ['chat', ...extraArgs]
  }

  const hermesSubcommands = [
    'chat',
    'gateway',
    'setup',
    'doctor',
    'config',
    'skills',
    'cron',
    'status',
  ]
  if (!extraArgs.some((a) => hermesSubcommands.includes(a))) {
    return ['chat', ...extraArgs]
  }

  return extraArgs
}

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

  const sshAuth = prepareSSHAuth(debug)
  if (sshAuth.abort) {
    console.error(`\n${sshAuth.abort}`)
    process.exit(1)
  }

  validateAgentBinary(agent)
  checkMcpSetup(venture.localPath!, agent)

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

  process.chdir(venture.localPath!)
  syncVentureRepo(venture.localPath!)

  const binary = KNOWN_AGENTS[agent]
  const repoName = basename(venture.localPath!)

  if (process.stdout.isTTY) {
    process.stdout.write(`\x1b]2;[${venture.code.toUpperCase()}] ${repoName}\x07`)
  }

  const childEnv = buildChildEnv(secrets, sshAuth.env, {
    code: venture.code,
    name: venture.name,
    repoName,
  })

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

  const startupPrompt = getStartupPrompt(agent, extraArgs)
  if (startupPrompt !== null) {
    extraArgs.push(startupPrompt)
  }

  let finalArgs = extraArgs
  if (agent === 'hermes') {
    finalArgs = applyHermesTranslation(childEnv, extraArgs)
  }

  spawnAgent(binary, finalArgs, venture.localPath!, childEnv, debug)
}
