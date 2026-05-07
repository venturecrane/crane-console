/**
 * MCP server configuration for all agent types.
 *
 * Handles Claude, Gemini, Codex, and Hermes MCP setup,
 * plus parallel-isolation hook provisioning and Claude user settings.
 */

import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import { CRANE_CONSOLE_ROOT } from './constants.js'
import { loadClaudeDenyRules } from './skill-sync.js'
import { syncClaudeAssets, syncGlobalSkills, syncVentureSkills } from './skill-sync.js'

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
    return
  }

  let config: Record<string, unknown>
  try {
    config = JSON.parse(readFileSync(claudeConfigPath, 'utf-8'))
  } catch {
    console.warn('-> Warning: ~/.claude.json is malformed; skipping project trust patch')
    return
  }

  if (!config.projects || typeof config.projects !== 'object') {
    config.projects = {}
  }
  const projects = config.projects as Record<string, Record<string, unknown>>

  const existing = projects[repoPath]
  if (existing && existing.hasTrustDialogAccepted === true) {
    return
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

    if (rule.endsWith('__*')) {
      const prefix = rule.slice(0, -1)
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

/**
 * Parallel-isolation hooks (#788).
 *
 * Detects sibling claude processes attached to the same repo at SessionStart;
 * if a peer is present, the model is forced through EnterWorktree before any
 * tool call. PreToolUse gate enforces the wait. PostToolUse on EnterWorktree
 * provisions node_modules into the worktree via APFS clonefile (or npm ci
 * fallback) and clears the gate.
 *
 * Why user-scope, not per-repo: same reason as ensureClaudeUserDenyRules —
 * writing the hook entries into each venture's tracked .claude/settings.json
 * dirties working trees. User-scope ~/.claude/settings.json applies machine-
 * wide. Non-venture sessions are no-ops because the detector exits silently
 * when no peer is found.
 *
 * Scripts are copied from crane-console/scripts/ into ~/.claude/parallel-
 * isolation/scripts/ so the hook commands resolve regardless of which
 * directory claude was launched from.
 *
 * Idempotent: copies scripts only when the source is newer; merges hooks
 * only when missing or pointing at a different command.
 */
const PARALLEL_ISOLATION_SCRIPTS = [
  'parallel-session-detect.sh',
  'parallel-session-gate.sh',
  'parallel-session-provision.sh',
] as const

function installParallelIsolationScripts(installDir: string, sourceDir: string): boolean {
  let scriptsDirty = false
  mkdirSync(installDir, { recursive: true })

  for (const script of PARALLEL_ISOLATION_SCRIPTS) {
    const src = join(sourceDir, script)
    const dst = join(installDir, script)

    if (!existsSync(src)) {
      console.warn(
        `-> Warning: ${script} missing in crane-console; skipping parallel-isolation install`
      )
      return false
    }

    let needsCopy = false
    if (!existsSync(dst)) {
      needsCopy = true
    } else {
      try {
        const srcMtime = statSync(src).mtimeMs
        const dstMtime = statSync(dst).mtimeMs
        if (srcMtime > dstMtime) needsCopy = true
      } catch {
        needsCopy = true
      }
    }

    if (needsCopy) {
      copyFileSync(src, dst)
      try {
        execSync(`chmod +x "${dst}"`, { stdio: 'ignore' })
      } catch {
        /* ignore */
      }
      scriptsDirty = true
    }
  }

  return scriptsDirty
}

type HookEntry = {
  matcher?: string
  hooks: Array<{ type: string; command: string; _managedBy?: string }>
}

function buildParallelIsolationHookEntries(installDir: string): Record<string, HookEntry> {
  const detectCmd = join(installDir, 'parallel-session-detect.sh')
  const gateCmd = join(installDir, 'parallel-session-gate.sh')
  const provisionCmd = join(installDir, 'parallel-session-provision.sh')

  return {
    SessionStart: {
      hooks: [{ type: 'command', command: detectCmd, _managedBy: 'crane-parallel-isolation' }],
    },
    PreToolUse: {
      matcher: '*',
      hooks: [{ type: 'command', command: gateCmd, _managedBy: 'crane-parallel-isolation' }],
    },
    PostToolUse: {
      matcher: 'EnterWorktree',
      hooks: [{ type: 'command', command: provisionCmd, _managedBy: 'crane-parallel-isolation' }],
    },
  }
}

function mergeParallelIsolationHooks(
  hooks: Record<string, unknown>,
  desired: Record<string, HookEntry>
): boolean {
  const before = JSON.stringify(hooks)

  for (const [event, entry] of Object.entries(desired)) {
    if (!Array.isArray(hooks[event])) {
      hooks[event] = []
    }
    const arr = hooks[event] as HookEntry[]
    const filtered = arr.filter(
      (e) => !(e.hooks && e.hooks.some((h) => h._managedBy === 'crane-parallel-isolation'))
    )
    filtered.push(entry)
    hooks[event] = filtered
  }

  return JSON.stringify(hooks) !== before
}

export function ensureParallelIsolationHooks(): void {
  const claudeDir = join(homedir(), '.claude')
  const installDir = join(claudeDir, 'parallel-isolation', 'scripts')
  const sourceDir = join(CRANE_CONSOLE_ROOT, 'scripts')

  const scriptsDirty = installParallelIsolationScripts(installDir, sourceDir)
  if (scriptsDirty) {
    console.log(
      `-> Synced parallel-isolation hook scripts to ~/.claude/parallel-isolation/scripts/`
    )
  }

  const settingsPath = join(claudeDir, 'settings.json')
  let settings: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    } catch {
      console.warn(
        '-> Warning: ~/.claude/settings.json is malformed; skipping parallel-isolation hooks'
      )
      return
    }
  }

  if (!settings.hooks || typeof settings.hooks !== 'object') {
    settings.hooks = {}
  }
  const hooks = settings.hooks as Record<string, unknown>

  const desired = buildParallelIsolationHookEntries(installDir)
  const changed = mergeParallelIsolationHooks(hooks, desired)

  if (!changed) return

  mkdirSync(claudeDir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  console.log(
    '-> Synced parallel-isolation hooks (SessionStart, PreToolUse, PostToolUse) to ~/.claude/settings.json'
  )
}

function syncMcpJsonFromSource(mcpJson: string, source: string): void {
  let sourceConfig: Record<string, unknown>
  try {
    sourceConfig = JSON.parse(readFileSync(source, 'utf-8'))
  } catch {
    console.warn('-> Warning: .mcp.json in crane-console is malformed')
    return
  }

  const sourceServers = (sourceConfig.mcpServers ?? {}) as Record<string, unknown>

  if (!existsSync(mcpJson)) {
    copyFileSync(source, mcpJson)
    console.log('-> Copied .mcp.json from crane-console')
    return
  }

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

export function setupClaudeMcp(repoPath: string): void {
  ensureClaudeProjectTrust(repoPath)
  ensureClaudeUserDenyRules()
  ensureParallelIsolationHooks()

  const mcpJson = join(repoPath, '.mcp.json')
  const source = join(CRANE_CONSOLE_ROOT, '.mcp.json')

  if (!existsSync(source)) {
    console.warn('-> Warning: .mcp.json missing in crane-console')
    return
  }

  syncMcpJsonFromSource(mcpJson, source)
}

export function setupGeminiMcp(repoPath: string): void {
  const geminiDir = join(repoPath, '.gemini')
  const settingsPath = join(geminiDir, 'settings.json')

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

  if (!dirty) return

  mkdirSync(geminiDir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n')
  console.log('-> Updated .gemini/settings.json (MCP env + security allowlist)')
}

export function setupCodexMcp(): void {
  const codexDir = join(homedir(), '.codex')
  const configPath = join(codexDir, 'config.toml')

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

  if (content.includes('[mcp_servers.crane]')) {
    if (content.includes('env_vars')) {
      const patched = content.replace(/env_vars = \[.*?\]/, `env_vars = ${envVars}`)
      if (patched !== content) {
        content = patched
        updated = true
      }
    } else {
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
    const fullEntry = '\n[mcp_servers.crane]\ncommand = "crane-mcp"\n' + `env_vars = ${envVars}\n`
    content = content.trimEnd() + '\n' + fullEntry
    updated = true
  }

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
  checkMcpBinary()
  syncClaudeAssets(repoPath)
  syncGlobalSkills()
  syncVentureSkills(repoPath)

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
      console.warn(`-> Warning: no MCP registration for agent '${agent}'`)
  }
}
