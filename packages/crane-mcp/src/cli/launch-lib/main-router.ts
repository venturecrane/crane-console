/**
 * main() routing helpers.
 *
 * Extracted from main() to keep cyclomatic complexity and line count
 * within the max-lines-per-function: 75 and complexity: 15 limits.
 */

import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { CRANE_CONSOLE_ROOT, ENGAGEMENT_REGISTRY, VentureWithRepo } from './constants.js'
import { fetchVentures, matchVenturesToRepos, printVentureList, cloneVenture } from './venture.js'
import {
  resolveAgent,
  stripAgentFlags,
  extractPassthroughArgs,
  launchAgent,
} from './agent-launch.js'
import { launchEngagement } from './engagement-launch.js'
import { parseEngagementArg, listClientEngagements } from './engagement.js'

function handleMissingEngagement(code: string, clientSlug: string): never {
  const engagements = listClientEngagements(code, clientSlug)
  console.error(
    `Missing engagement slug. ${code}/${clientSlug}/<engagement> requires three segments.`
  )
  if (engagements.length > 0) {
    console.error(`Available engagements for ${code}/${clientSlug}:`)
    for (const e of engagements) {
      console.error(`  crane ${code}/${clientSlug}/${e.engagementSlug}`)
    }
  } else {
    console.error(`(No engagements registered for ${code}/${clientSlug}.)`)
  }
  process.exit(1)
}

interface EngagementLaunchOpts {
  code: string
  clientSlug: string
  engagementSlug: string
  agent: string
  debug: boolean
  passthrough: string[]
}

async function handleEngagementLaunch(opts: EngagementLaunchOpts): Promise<void> {
  const { code, clientSlug, engagementSlug, agent, debug, passthrough } = opts
  const key = `${code}/${clientSlug}/${engagementSlug}`
  const ctx = ENGAGEMENT_REGISTRY[key]
  if (!ctx) {
    console.error(`Unknown engagement: ${key}`)
    const siblings = listClientEngagements(code, clientSlug)
    if (siblings.length > 0) {
      console.error(`Engagements registered for ${code}/${clientSlug}:`)
      for (const e of siblings) {
        console.error(`  ${e.engagementSlug}`)
      }
    }
    process.exit(1)
  }
  await launchEngagement(ctx, agent, debug, passthrough)
}

async function handleVentureLaunch(
  code: string,
  withRepos: VentureWithRepo[],
  agent: string,
  debug: boolean,
  passthrough: string[]
): Promise<void> {
  const venture = withRepos.find((v) => v.code === code)
  if (!venture) {
    console.error(`Unknown venture code: ${code}`)
    console.error(`Available: ${withRepos.map((v) => v.code).join(', ')}`)
    process.exit(1)
  }

  if (!venture.localPath) {
    console.log(`\n${venture.name} is not cloned locally.`)
    const clonedPath = await cloneVenture(venture)
    if (!clonedPath) process.exit(1)
    venture.localPath = clonedPath
  }

  launchAgent(venture, agent, debug, passthrough)
}

/**
 * Route a non-flag argument (venture code or engagement path) to the
 * appropriate launch handler.
 */
export async function routeDirectLaunch(
  arg: string,
  withRepos: VentureWithRepo[],
  agent: string,
  debug: boolean,
  passthrough: string[]
): Promise<void> {
  const parsed = parseEngagementArg(arg)

  if (parsed.kind === 'invalid') {
    console.error(`Invalid launcher arg: ${parsed.raw}`)
    console.error(`Expected: <code>  or  <code>/<client>/<engagement>`)
    process.exit(1)
  }

  if (parsed.kind === 'missing-engagement') {
    handleMissingEngagement(parsed.code, parsed.clientSlug)
  }

  if (parsed.kind === 'engagement') {
    await handleEngagementLaunch({
      code: parsed.code,
      clientSlug: parsed.clientSlug,
      engagementSlug: parsed.engagementSlug,
      agent,
      debug,
      passthrough,
    })
    return
  }

  await handleVentureLaunch(parsed.code, withRepos, agent, debug, passthrough)
}

export function handleSecretsAudit(filteredArgs: string[]): void {
  const fix = filteredArgs.includes('--fix')
  const scriptPath = join(CRANE_CONSOLE_ROOT, 'scripts', 'sync-shared-secrets.sh')
  const auditArgs = fix ? ['--fix'] : []
  const result = spawnSync('bash', [scriptPath, ...auditArgs], {
    stdio: 'inherit',
    cwd: CRANE_CONSOLE_ROOT,
  })
  process.exit(result.status ?? 0)
}

export function printHelp(): void {
  console.log(`
crane - Venture launcher

Usage:
  crane              Interactive menu - pick a venture
  crane <code>       Direct launch - e.g., crane vc, crane ke
  crane ss/<client>/<engagement>  Launch into an SS engagement
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
}

export async function runMain(): Promise<void> {
  const args = process.argv.slice(2)
  const debug = args.includes('--debug') || args.includes('-d')
  const filteredArgs = args.filter((a) => a !== '--debug' && a !== '-d')

  if (filteredArgs.includes('--list') || filteredArgs.includes('-l')) {
    const ventures = await fetchVentures()
    printVentureList(matchVenturesToRepos(ventures))
    return
  }

  if (filteredArgs.includes('--help') || filteredArgs.includes('-h')) {
    printHelp()
    return
  }

  if (filteredArgs.includes('--secrets-audit')) {
    handleSecretsAudit(filteredArgs)
    return
  }

  const agent = resolveAgent(filteredArgs)
  const cleanArgs = stripAgentFlags(filteredArgs)
  const ventures = await fetchVentures()
  const withRepos = matchVenturesToRepos(ventures)
  const passthrough = extractPassthroughArgs(args)

  const nonFlagArgs = cleanArgs.filter((a) => !a.startsWith('-'))
  if (nonFlagArgs.length > 0) {
    await routeDirectLaunch(nonFlagArgs[0], withRepos, agent, debug, passthrough)
    return
  }

  // Interactive menu
  const { promptSelection } = await import('./venture.js')
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
