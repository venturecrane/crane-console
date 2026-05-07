/**
 * MCP server configuration for all agent types.
 *
 * Barrel re-exports + entry-point dispatcher.
 * Claude-specific setup: mcp-setup-claude.ts
 * Other agents (Gemini, Codex, Hermes): mcp-setup-agents.ts
 */

export {
  ensureClaudeProjectTrust,
  ensureClaudeUserDenyRules,
  ensureParallelIsolationHooks,
  setupClaudeMcp,
} from './mcp-setup-claude.js'

export { setupGeminiMcp, setupCodexMcp, setupHermesMcp } from './mcp-setup-agents.js'

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CRANE_CONSOLE_ROOT } from './constants.js'
import { syncClaudeAssets, syncGlobalSkills, syncVentureSkills } from './skill-sync.js'
import { setupClaudeMcp } from './mcp-setup-claude.js'
import { setupGeminiMcp, setupCodexMcp, setupHermesMcp } from './mcp-setup-agents.js'

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
