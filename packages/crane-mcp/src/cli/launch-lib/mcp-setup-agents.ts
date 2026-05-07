import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

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
