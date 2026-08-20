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

  it('gates the fly verbs that mutate production, in both CLI spellings', () => {
    const ask: string[] = floor.permissions.ask

    // Both spellings must be covered — `fly` is a symlink to `flyctl` and
    // either name reaches the same API.
    //
    // These subcommands mutate on every invocation, so the whole namespace is
    // gated.
    for (const verb of ['deploy', 'secrets', 'scale', 'certs', 'ips']) {
      expect(ask).toContain(`Bash(fly ${verb}:*)`)
      expect(ask).toContain(`Bash(flyctl ${verb}:*)`)
    }

    // These namespaces are mostly reads, so only the unrecoverable verbs are
    // gated. Verb lists and aliases read off `fly {machine,apps,volumes}
    // --help`, not assumed.
    for (const cli of ['fly', 'flyctl']) {
      for (const alias of ['machine', 'machines', 'm']) {
        for (const verb of ['destroy', 'kill']) {
          expect(ask).toContain(`Bash(${cli} ${alias} ${verb}:*)`)
        }
      }
      for (const alias of ['apps', 'app', 'volumes', 'volume', 'vol']) {
        expect(ask).toContain(`Bash(${cli} ${alias} destroy:*)`)
      }
    }

    // Wrangler is reachable directly and through npx; gating only one leaves
    // the other open.
    for (const verb of ['deploy', 'delete', 'secret', 'd1', 'rollback', 'r2', 'kv']) {
      expect(ask).toContain(`Bash(wrangler ${verb}:*)`)
      expect(ask).toContain(`Bash(npx wrangler ${verb}:*)`)
    }
  })

  it('does not gate whole fly namespaces whose common use is reading', () => {
    // An `ask` rule resolves BEFORE the auto-mode classifier and cancels its
    // judgment: "If an explicit ask rule matches the command, Claude Code asks
    // you even in `auto` mode" (code.claude.com/docs/en/permission-modes). It
    // therefore does not add protection on top of the classifier — it replaces
    // the classifier with a blind prompt, and discards the one thing the
    // classifier does better. The built-in Production Reads rule ends with:
    // "Once the bar is met for a target, further read-only commands against it
    // are session-cleared." Name the app and operation once, run free for the
    // session.
    //
    // Gating these namespaces wholesale cost 157 forced prompts across one
    // day of ss-console sessions (2026-08-20) — 117 of them `fly ssh`, the
    // only way to read an Operator seat. Verb-scoping brought the same day to
    // 12, all of them real mutations. vfy_01M0GFM0TND74GQQTQZXX217B5,
    // vfy_01M0GJR10SWW5CQ8F00MJKP8ES.
    //
    // Removal is safe because these reach the classifier instead, where the
    // built-in Production Deploy / Production Reads / Irreversible Deletion
    // rules plus a venture overlay naming the specific apps still refuse until
    // the user names the target. It is NOT safe if a `permissions.allow` grant
    // for the same command family is hiding underneath — an old "don't ask
    // again" click. Check the local allow lists before widening this.
    const ask: string[] = floor.permissions.ask
    for (const cli of ['fly', 'flyctl']) {
      for (const ns of ['ssh', 'machine', 'machines', 'm', 'apps', 'app', 'volumes', 'volume', 'vol']) {
        expect(ask).not.toContain(`Bash(${cli} ${ns}:*)`)
      }
    }
  })

  it('denies the secret-listing subcommands outright rather than asking', () => {
    // These leak values into the transcript, so a prompt is not a sufficient
    // control — there is no safe "yes".
    expect(floor.permissions.deny).toEqual(
      expect.arrayContaining(['Bash(infisical secrets:*)', 'Bash(infisical export:*)'])
    )
  })

  it('fills every environment slot the built-in defaults provide', () => {
    // autoMode.environment has no "$defaults" token, and setting it REPLACES
    // the built-in list rather than merging with it — verified against
    // `claude auto-mode defaults` in a clean CLAUDE_CONFIG_DIR. Any default
    // slot this floor omits is not inherited; it simply disappears, taking its
    // safe fallback with it. (Scope-to-scope merging is a separate mechanism:
    // a venture overlay concatenates with this floor rather than replacing it.)
    const DEFAULT_SLOTS = [
      '**Organization**',
      '**Primary use of Claude Code**',
      '**Cloud provider(s)**',
      '**Repository visibility**',
      '**Internal sharing / snippet hosting**',
      '**Org-specific CLIs**',
      '**Secrets management**',
      '**CI/CD deploy targets**',
      '**Network posture**',
      '**Protected deployment namespaces / environments**',
      '**Data retention / declassification**',
      '**Trusted repo**',
      '**Source control**',
      '**Trusted internal domains**',
      '**Trusted cloud buckets**',
      '**Key internal services**',
      '**Internal package registry**',
      '**Sensitive data locations & audiences**',
      '**Sensitive remote targets**',
      '**Protected IaC scopes**',
    ]

    const present = (floor.autoMode.environment as string[])
      .map((e) => e.match(/^\*\*[^*]+\*\*/)?.[0])
      .filter((k): k is string => k !== undefined)

    expect(present).toEqual(expect.arrayContaining(DEFAULT_SLOTS))
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
