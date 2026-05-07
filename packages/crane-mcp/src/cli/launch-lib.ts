/**
 * crane launcher - extracted testable logic
 *
 * Every function the CLI needs lives here so tests can import
 * real code instead of simulating behavior externally.
 *
 * launch.ts is the thin entry point that calls main().
 *
 * Implementation is split across sub-modules under launch-lib/:
 *   constants.ts       — shared constants, registries, types
 *   secrets.ts         — Infisical fetch and hydration
 *   build-utils.ts     — stale-build detection, venture repo sync
 *   skill-sync.ts      — skill and Claude asset mirroring
 *   mcp-setup.ts       — Claude/Gemini/Codex/Hermes MCP configuration
 *   engagement.ts      — SS engagement parsing and lookup
 *   venture.ts         — venture discovery, cloning, display
 *   agent-launch.ts    — agent resolution, validation, launch
 *   main-router.ts     — main() routing helpers
 */

// Re-export all public symbols so consumers (launch.ts, tests) continue to
// import from './launch-lib.js' with no changes.
export {
  CRANE_CONSOLE_ROOT,
  WORKSPACE_ID,
  KNOWN_AGENTS,
  AGENT_FLAGS,
  AGENT_INSTALL_HINTS,
  INFISICAL_PATHS,
  ENGAGEMENT_REGISTRY,
  type EngagementContext,
  type VentureWithRepo,
} from './launch-lib/constants.js'

export { ensureInfisicalConfig, fetchSecrets } from './launch-lib/secrets.js'

export { ensureFreshBuild, syncVentureRepo } from './launch-lib/build-utils.js'

export {
  parseSkillScope,
  syncClaudeAssets,
  syncGlobalSkills,
  syncVentureSkills,
} from './launch-lib/skill-sync.js'

export {
  checkMcpBinary,
  ensureClaudeProjectTrust,
  ensureClaudeUserDenyRules,
  ensureParallelIsolationHooks,
  setupClaudeMcp,
  setupGeminiMcp,
  setupCodexMcp,
  setupHermesMcp,
  checkMcpSetup,
} from './launch-lib/mcp-setup.js'

export { listClientEngagements, parseEngagementArg } from './launch-lib/engagement.js'

export {
  fetchVentures,
  matchVenturesToRepos,
  cloneVenture,
  printVentureList,
  promptSelection,
} from './launch-lib/venture.js'

export {
  resolveAgent,
  validateAgentBinary,
  stripAgentFlags,
  extractPassthroughArgs,
  getStartupPrompt,
  launchAgent,
} from './launch-lib/agent-launch.js'

export { assertEngagementScope, launchEngagement } from './launch-lib/engagement-launch.js'

import { ensureFreshBuild } from './launch-lib/build-utils.js'
import { runMain } from './launch-lib/main-router.js'

export async function main(): Promise<void> {
  ensureFreshBuild()
  await runMain()
}
