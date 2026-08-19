/**
 * Integrity tests for the shipped Claude Code policy payloads under
 * config/claude-policy/.
 *
 * These read the real files (no fs mock) because the payloads themselves are
 * the deliverable — a malformed or subtly-wrong file is loaded at every session
 * start on every fleet machine, and the failure is silent.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { CRANE_CONSOLE_ROOT } from './launch-lib.js'

const POLICY_DIR = join(CRANE_CONSOLE_ROOT, 'config', 'claude-policy')
const VENTURES_DIR = join(POLICY_DIR, 'ventures')

function readPolicy(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, 'utf-8'))
}

describe('enterprise policy floor', () => {
  const floor = readPolicy(join(POLICY_DIR, 'managed-settings.json'))

  it('includes the literal $defaults in every autoMode list it sets', () => {
    // Omitting "$defaults" DISCARDS the entire built-in ruleset for that
    // section. soft_deny alone ships 66 built-ins covering production deploys,
    // production reads, secret-store writes, and irreversible deletion.
    for (const section of ['allow', 'soft_deny'] as const) {
      expect(floor.autoMode[section]).toContain('$defaults')
    }
  })

  it('gates every fly and wrangler subcommand that mutates or reads production', () => {
    const ask: string[] = floor.permissions.ask

    // Over-gating costs one prompt; under-gating costs an ungated production
    // command. Both spellings of the Fly CLI must be covered — `fly` is a
    // symlink to `flyctl` and either name reaches the same API.
    for (const verb of ['deploy', 'ssh', 'secrets', 'scale', 'machine', 'volumes', 'apps']) {
      expect(ask).toContain(`Bash(fly ${verb}:*)`)
      expect(ask).toContain(`Bash(flyctl ${verb}:*)`)
    }

    // Wrangler is reachable directly and through npx; gating only one leaves
    // the other open.
    for (const verb of ['deploy', 'delete', 'secret', 'd1', 'rollback', 'r2', 'kv']) {
      expect(ask).toContain(`Bash(wrangler ${verb}:*)`)
      expect(ask).toContain(`Bash(npx wrangler ${verb}:*)`)
    }
  })

  it('denies the secret-listing subcommands outright rather than asking', () => {
    // These leak values into the transcript, so a prompt is not a sufficient
    // control — there is no safe "yes".
    expect(floor.permissions.deny).toEqual(
      expect.arrayContaining(['Bash(infisical secrets:*)', 'Bash(infisical export:*)'])
    )
  })

  it('carries no venture-specific claims in the machine-wide floor', () => {
    // The floor is loaded for every venture on the machine. A venture's own
    // hosts, domains, or app names asserted here would be stated as fact during
    // sessions for a different venture.
    const prose = floor.autoMode.environment.join('\n')

    for (const leak of ['hermes-ashton-price', 'hermes-pilot-smokeball', 'smd.services']) {
      expect(prose).not.toContain(leak)
    }
  })
})

describe('venture overlays', () => {
  const overlays = existsSync(VENTURES_DIR)
    ? readdirSync(VENTURES_DIR).filter((f) => f.endsWith('.json'))
    : []

  it('ships at least one authored overlay', () => {
    expect(overlays.length).toBeGreaterThan(0)
  })

  it.each(overlays)('%s is valid JSON and sets only autoMode', (file) => {
    const overlay = readPolicy(join(VENTURES_DIR, file))

    // permissions belong in the machine-wide floor. A `permissions` block here
    // would apply only while that venture is launched through the crane
    // launcher, which is a gap, not a policy.
    expect(Object.keys(overlay)).toEqual(['autoMode'])
  })

  it.each(overlays)('%s preserves the built-in ruleset it overrides', (file) => {
    const overlay = readPolicy(join(VENTURES_DIR, file))

    for (const section of ['allow', 'soft_deny', 'hard_deny'] as const) {
      const list = overlay.autoMode[section]
      if (list === undefined) continue
      if (section === 'hard_deny' && list.length === 0) continue
      expect(list).toContain('$defaults')
    }
  })

  it('names the venture it applies to in its first environment entry', () => {
    // The overlay merges into a shared prose list. An entry that does not say
    // which venture it describes is read as an enterprise-wide fact.
    for (const file of overlays) {
      const overlay = readPolicy(join(VENTURES_DIR, file))
      const env = overlay.autoMode.environment
      if (env === undefined) continue
      const code = file.replace(/\.json$/, '')
      expect(env[0]).toContain(`(${code})`)
    }
  })
})
