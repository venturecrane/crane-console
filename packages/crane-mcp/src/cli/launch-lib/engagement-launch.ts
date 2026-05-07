import { existsSync, readFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { getApiBase } from '../../lib/config.js'
import { KNOWN_AGENTS, EngagementContext } from './constants.js'
import { fetchSecrets } from './secrets.js'
import { checkMcpSetup } from './mcp-setup.js'
import { syncVentureRepo } from './build-utils.js'
import { prepareSSHAuth } from '../ssh-auth.js'
import {
  buildChildEnv,
  spawnAgent,
  applyHermesTranslation,
  getStartupPrompt,
  validateAgentBinary,
} from './agent-launch.js'

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
