/**
 * Agent resolution, validation, and launch logic.
 *
 * Barrel re-exports + launch orchestrators.
 * Arg parsing / prompt selection: agent-args.ts
 */

export {
  resolveAgent,
  validateAgentBinary,
  stripAgentFlags,
  extractPassthroughArgs,
  getStartupPrompt,
  CRANE_FLAGS,
} from './agent-args.js'

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { getCraneEnv, getApiBase } from '../../lib/config.js'
import { prepareSSHAuth } from '../ssh-auth.js'
import { KNOWN_AGENTS, INFISICAL_PATHS, VentureWithRepo, EngagementContext } from './constants.js'
import { fetchSecrets } from './secrets.js'
import { checkMcpSetup } from './mcp-setup.js'
import { syncVentureRepo } from './build-utils.js'
import { validateAgentBinary, getStartupPrompt } from './agent-args.js'

interface VentureIdentity {
  code: string
  name: string
  repoName: string
}

function buildChildEnv(
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

function spawnAgent(
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

function applyHermesTranslation(
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

/**
 * Verify .claude/settings.json in the engagement repo doesn't grant access
 * to a broader filesystem scope than the engagement directory itself.
 * Per-engagement isolation collapses if `additionalDirectories` includes
 * the client dir (`~/dev/ss/<client>/`) — agents could read sibling
 * engagements via `cat ../<other>/`.
 *
 * Returns null on success, error message string on failure.
 */
export function assertEngagementScope(localPath: string, ctx: EngagementContext): string | null {
  const settingsPath = join(localPath, '.claude', 'settings.json')
  if (!existsSync(settingsPath)) return null

  let settings: { additionalDirectories?: unknown }
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
  } catch (e) {
    return `Cannot parse ${settingsPath}: ${(e as Error).message}`
  }

  const dirs = settings.additionalDirectories
  if (!Array.isArray(dirs) || dirs.length === 0) return null

  const home = homedir()
  const expectedTilde = `~/dev/ss/${ctx.clientSlug}/${ctx.engagementSlug}`
  const expectedAbs = `${home}/dev/ss/${ctx.clientSlug}/${ctx.engagementSlug}`

  for (const d of dirs) {
    if (typeof d !== 'string') {
      return `additionalDirectories contains non-string entry: ${JSON.stringify(d)}`
    }
    if (d !== expectedTilde && d !== expectedAbs) {
      return (
        `Engagement settings.json has additionalDirectories outside the engagement scope.\n` +
        `  Expected: ["${expectedTilde}"]\n` +
        `  Found:    ${JSON.stringify(dirs)}\n` +
        `Fix: edit ${settingsPath} so additionalDirectories contains only the engagement path.`
      )
    }
  }

  return null
}

async function fetchEngagementSecretsViaProxy(
  ctx: EngagementContext,
  adminKey: string
): Promise<Record<string, string>> {
  const apiBase = getApiBase()
  let proxyRes: Response
  try {
    proxyRes = await fetch(`${apiBase}/admin/engagement-secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify({ client_slug: ctx.clientSlug, engagement_slug: ctx.engagementSlug }),
    })
  } catch (err) {
    console.error(`\nFailed to reach crane-context: ${(err as Error).message}`)
    process.exit(1)
  }

  if (!proxyRes.ok) {
    const body = await proxyRes.text()
    console.error(
      `\nEngagement secrets fetch failed (${proxyRes.status}) for ${ctx.clientSlug}/${ctx.engagementSlug}:\n${body}`
    )
    process.exit(1)
  }

  const proxyData = (await proxyRes.json()) as { secrets: Array<{ key: string; value: string }> }
  const secrets: Record<string, string> = {}
  for (const s of proxyData.secrets) {
    if (s.key && typeof s.value === 'string') secrets[s.key] = s.value
  }
  return secrets
}

export async function launchEngagement(
  ctx: EngagementContext,
  agent: string,
  debug: boolean = false,
  extraArgs: string[] = []
): Promise<void> {
  const localPath = join(homedir(), 'dev', 'ss', ctx.clientSlug, ctx.engagementSlug)

  if (!existsSync(localPath)) {
    console.error(`Engagement repo not cloned: ${localPath}`)
    console.error(`Clone: gh repo clone ${ctx.repo} "${localPath}"`)
    process.exit(1)
  }

  const scopeError = assertEngagementScope(localPath, ctx)
  if (scopeError) {
    console.error(`\n${scopeError}`)
    process.exit(1)
  }

  validateAgentBinary(agent)
  checkMcpSetup(localPath, agent)

  const sshAuth = prepareSSHAuth(debug)
  if (sshAuth.abort) {
    console.error(`\n${sshAuth.abort}`)
    process.exit(1)
  }

  const ssResult = fetchSecrets(localPath, '/ss', sshAuth.env)
  if ('error' in ssResult) {
    console.error(`\nSS-level secret fetch failed:\n${ssResult.error}`)
    process.exit(1)
  }

  const adminKey = ssResult.secrets.CRANE_ADMIN_KEY
  if (!adminKey) {
    console.error(`CRANE_ADMIN_KEY missing from /ss secrets.`)
    console.error(`Run: cd ~/dev/crane-console && bash scripts/sync-shared-secrets.sh --fix`)
    process.exit(1)
  }

  const engagementSecrets = await fetchEngagementSecretsViaProxy(ctx, adminKey)

  console.log(`\n-> Switching to ${ctx.clientSlug}/${ctx.engagementSlug}...`)
  console.log(`-> Launching ${agent} with ${ctx.infisicalPath} secrets (via crane-context)...\n`)

  process.chdir(localPath)
  syncVentureRepo(localPath)

  const binary = KNOWN_AGENTS[agent]

  if (process.stdout.isTTY) {
    process.stdout.write(
      `\x1b]2;[${ctx.code.toUpperCase()}/${ctx.clientSlug}/${ctx.engagementSlug}]\x07`
    )
  }

  const childEnv = buildChildEnv(
    ssResult.secrets,
    sshAuth.env,
    {
      code: ctx.code,
      name: 'SMD Services',
      repoName: basename(localPath),
    },
    {
      ...engagementSecrets,
      CRANE_CLIENT_SLUG: ctx.clientSlug,
      CRANE_ENGAGEMENT_SLUG: ctx.engagementSlug,
    }
  )

  const startupPrompt = getStartupPrompt(agent, extraArgs)
  if (startupPrompt !== null) extraArgs.push(startupPrompt)

  const finalArgs = agent === 'hermes' ? applyHermesTranslation(childEnv, extraArgs) : extraArgs
  spawnAgent(binary, finalArgs, localPath, childEnv, debug)
}
