/**
 * Shared constants and registries for the crane launcher.
 *
 * Loaded once at module init from config files.
 * All other launch-lib modules import from here.
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve crane-console root relative to this script
// Compiled path: packages/crane-mcp/dist/cli/launch-lib/constants.js -> 5 levels up
const __filename = fileURLToPath(import.meta.url)
export const CRANE_CONSOLE_ROOT = join(dirname(__filename), '..', '..', '..', '..', '..')
export const WORKSPACE_ID = '2da2895e-aba2-4faf-a65a-b86e1a7aa2cb'

// Known agent CLIs and their binary names
export const KNOWN_AGENTS: Record<string, string> = {
  claude: 'claude',
  gemini: 'gemini',
  codex: 'codex',
  hermes: 'hermes',
}

export const AGENT_FLAGS = Object.keys(KNOWN_AGENTS).map((a) => `--${a}`)

export const AGENT_INSTALL_HINTS: Record<string, string> = {
  claude: 'npm install -g @anthropic-ai/claude-code',
  gemini: 'npm install -g @google/gemini-cli',
  codex: 'npm install -g @openai/codex',
  hermes: 'pip install hermes-agent (or: cd ~/.hermes/hermes-agent && pip install -e .)',
}

// Venture Infisical paths - derived from config/ventures.json.
// Convention: each venture's secrets live at /{code} in Infisical.
// Only secrets at these exact paths are injected into agent env.
// Sub-paths (e.g., /vc/vault) are NOT fetched - use for storage-only secrets.
// See docs/infra/secrets-management.md "Vault" section.
export const venturesConfig = JSON.parse(
  readFileSync(join(CRANE_CONSOLE_ROOT, 'config', 'ventures.json'), 'utf-8')
)
export const INFISICAL_PATHS: Record<string, string> = Object.fromEntries(
  venturesConfig.ventures.map((v: { code: string }) => [v.code, `/${v.code}`])
)

// SS engagement registry — flat lookup keyed by `<code>/<client>/<engagement>`.
// Populated from optional clients[].engagements[] in ventures.json. Only SS
// uses this today; other ventures have no nested clients.
//
// Disk-only by design: the /ventures HTTP API doesn't expose this nested
// structure, which keeps the API contract stable when fleet machines run
// different launcher builds. ventures.json is the source of truth.
export interface EngagementContext {
  code: string
  clientSlug: string
  engagementSlug: string
  repo: string
  infisicalPath: string
  githubOrg: string
}

export const ENGAGEMENT_REGISTRY: Record<string, EngagementContext> = {}

interface VenturesClientEntry {
  slug: string
  displayName?: string
  githubOrg?: string
  infisicalPath?: string
  engagements?: Array<{
    slug: string
    displayName?: string
    repo: string
    infisicalPath: string
  }>
}

for (const v of venturesConfig.ventures as Array<{
  code: string
  clients?: VenturesClientEntry[]
}>) {
  if (!Array.isArray(v.clients)) continue
  for (const c of v.clients) {
    if (!Array.isArray(c.engagements)) continue
    for (const e of c.engagements) {
      const key = `${v.code}/${c.slug}/${e.slug}`
      ENGAGEMENT_REGISTRY[key] = {
        code: v.code,
        clientSlug: c.slug,
        engagementSlug: e.slug,
        repo: e.repo,
        infisicalPath: e.infisicalPath,
        githubOrg: c.githubOrg ?? 'smdservices-clients',
      }
      INFISICAL_PATHS[key] = e.infisicalPath
    }
  }
}

import type { Venture } from '../../lib/crane-api.js'

export interface VentureWithRepo extends Venture {
  localPath: string | null
}
