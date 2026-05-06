/**
 * Tests for SS client/engagement launcher extensions:
 *   - parseEngagementArg
 *   - ENGAGEMENT_REGISTRY derivation from ventures.json
 *   - listClientEngagements
 *   - assertEngagementScope (additionalDirectories isolation guard)
 *
 * Uses a local fs mock that injects nested clients[].engagements[] under SS,
 * including a slug collision (`redesign` exists under both `acme` and `foo`)
 * so we can verify the FK resolution doesn't ambiguously match.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({ on: vi.fn().mockReturnThis(), kill: vi.fn() })),
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn((filePath: string) => {
    if (String(filePath).includes('ventures.json')) {
      return JSON.stringify({
        ventures: [
          { code: 'vc' },
          { code: 'ke' },
          {
            code: 'ss',
            clients: [
              {
                slug: 'acme',
                displayName: 'Acme Co',
                githubOrg: 'smdservices-clients',
                infisicalPath: '/ss/clients/acme',
                engagements: [
                  {
                    slug: 'website',
                    displayName: 'Acme Website',
                    repo: 'smdservices-clients/acme-website',
                    infisicalPath: '/ss/clients/acme/website',
                  },
                  {
                    slug: 'redesign',
                    displayName: 'Acme Redesign',
                    repo: 'smdservices-clients/acme-redesign',
                    infisicalPath: '/ss/clients/acme/redesign',
                  },
                ],
              },
              {
                slug: 'foo',
                displayName: 'Foo Corp',
                infisicalPath: '/ss/clients/foo',
                engagements: [
                  {
                    slug: 'redesign',
                    displayName: 'Foo Redesign',
                    repo: 'smdservices-clients/foo-redesign',
                    infisicalPath: '/ss/clients/foo/redesign',
                  },
                ],
              },
            ],
          },
        ],
      })
    }
    // Default: empty additionalDirectories settings.json (per-test override below)
    return '{}'
  }),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ mtimeMs: 0 })),
}))

vi.mock('../lib/repo-scanner.js', () => ({ scanLocalRepos: vi.fn(() => []) }))
vi.mock('./ssh-auth.js', () => ({ prepareSSHAuth: vi.fn(() => ({ env: {} })) }))

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import {
  parseEngagementArg,
  ENGAGEMENT_REGISTRY,
  INFISICAL_PATHS,
  listClientEngagements,
  assertEngagementScope,
  type EngagementContext,
} from './launch-lib.js'

describe('parseEngagementArg', () => {
  it('returns venture for bare codes', () => {
    expect(parseEngagementArg('ss')).toEqual({ kind: 'venture', code: 'ss' })
    expect(parseEngagementArg('vc')).toEqual({ kind: 'venture', code: 'vc' })
  })

  it('lowercases the input', () => {
    expect(parseEngagementArg('SS/ACME/Website')).toEqual({
      kind: 'engagement',
      code: 'ss',
      clientSlug: 'acme',
      engagementSlug: 'website',
    })
  })

  it('returns missing-engagement for two-segment paths', () => {
    expect(parseEngagementArg('ss/acme')).toEqual({
      kind: 'missing-engagement',
      code: 'ss',
      clientSlug: 'acme',
    })
  })

  it('returns engagement for three-segment paths', () => {
    expect(parseEngagementArg('ss/acme/website')).toEqual({
      kind: 'engagement',
      code: 'ss',
      clientSlug: 'acme',
      engagementSlug: 'website',
    })
  })

  it('returns invalid for four-segment paths', () => {
    expect(parseEngagementArg('ss/acme/website/extra')).toEqual({
      kind: 'invalid',
      raw: 'ss/acme/website/extra',
    })
  })

  it('returns invalid for paths with empty segments', () => {
    expect(parseEngagementArg('ss//website')).toEqual({
      kind: 'invalid',
      raw: 'ss//website',
    })
    expect(parseEngagementArg('ss/acme/')).toEqual({
      kind: 'invalid',
      raw: 'ss/acme/',
    })
  })
})

describe('ENGAGEMENT_REGISTRY', () => {
  it('populates from nested clients[].engagements[] in ventures.json', () => {
    expect(ENGAGEMENT_REGISTRY['ss/acme/website']).toMatchObject({
      code: 'ss',
      clientSlug: 'acme',
      engagementSlug: 'website',
      repo: 'smdservices-clients/acme-website',
      infisicalPath: '/ss/clients/acme/website',
      githubOrg: 'smdservices-clients',
    })
  })

  it('resolves slug collisions across clients to distinct entries', () => {
    const acmeRedesign = ENGAGEMENT_REGISTRY['ss/acme/redesign']
    const fooRedesign = ENGAGEMENT_REGISTRY['ss/foo/redesign']

    expect(acmeRedesign).toBeDefined()
    expect(fooRedesign).toBeDefined()
    expect(acmeRedesign.repo).toBe('smdservices-clients/acme-redesign')
    expect(fooRedesign.repo).toBe('smdservices-clients/foo-redesign')
    expect(acmeRedesign.infisicalPath).not.toBe(fooRedesign.infisicalPath)
  })

  it('defaults githubOrg to smdservices-clients when client omits it', () => {
    // foo client in the mock has no githubOrg
    expect(ENGAGEMENT_REGISTRY['ss/foo/redesign'].githubOrg).toBe('smdservices-clients')
  })

  it('extends INFISICAL_PATHS with engagement keys', () => {
    expect(INFISICAL_PATHS['ss']).toBe('/ss')
    expect(INFISICAL_PATHS['ss/acme/website']).toBe('/ss/clients/acme/website')
    expect(INFISICAL_PATHS['ss/foo/redesign']).toBe('/ss/clients/foo/redesign')
  })

  it('does not pollute non-SS ventures with engagement entries', () => {
    expect(INFISICAL_PATHS['vc']).toBe('/vc')
    expect(INFISICAL_PATHS['ke']).toBe('/ke')
    // Only SS engagements should be in the registry
    for (const e of Object.values(ENGAGEMENT_REGISTRY)) {
      expect(e.code).toBe('ss')
    }
  })
})

describe('listClientEngagements', () => {
  it('returns engagements for a known client', () => {
    const acme = listClientEngagements('ss', 'acme')
    const slugs = acme.map((e) => e.engagementSlug).sort()
    expect(slugs).toEqual(['redesign', 'website'])
  })

  it('returns empty array for unknown client', () => {
    expect(listClientEngagements('ss', 'unknown')).toEqual([])
  })

  it('returns empty array for non-SS venture', () => {
    expect(listClientEngagements('vc', 'anything')).toEqual([])
  })
})

describe('assertEngagementScope', () => {
  const ctx: EngagementContext = {
    code: 'ss',
    clientSlug: 'acme',
    engagementSlug: 'website',
    repo: 'smdservices-clients/acme-website',
    infisicalPath: '/ss/clients/acme/website',
    githubOrg: 'smdservices-clients',
  }

  beforeEach(() => {
    vi.mocked(existsSync).mockReturnValue(true)
  })

  it('returns null when settings.json is absent', () => {
    vi.mocked(existsSync).mockReturnValueOnce(true) // localPath check
    vi.mocked(existsSync).mockReturnValueOnce(false) // settings.json check
    expect(assertEngagementScope('/tmp/anywhere', ctx)).toBeNull()
  })

  it('returns null when additionalDirectories matches engagement path (tilde form)', () => {
    vi.mocked(readFileSync).mockReturnValueOnce(
      JSON.stringify({ additionalDirectories: ['~/dev/ss/acme/website'] })
    )
    expect(assertEngagementScope('/tmp/anywhere', ctx)).toBeNull()
  })

  it('returns null when additionalDirectories matches engagement path (absolute form)', () => {
    const home = homedir()
    vi.mocked(readFileSync).mockReturnValueOnce(
      JSON.stringify({ additionalDirectories: [`${home}/dev/ss/acme/website`] })
    )
    expect(assertEngagementScope('/tmp/anywhere', ctx)).toBeNull()
  })

  it('returns error when additionalDirectories includes the client dir (broader scope)', () => {
    vi.mocked(readFileSync).mockReturnValueOnce(
      JSON.stringify({ additionalDirectories: ['~/dev/ss/acme'] })
    )
    const err = assertEngagementScope('/tmp/anywhere', ctx)
    expect(err).toBeTruthy()
    expect(err).toContain('outside the engagement scope')
  })

  it('returns error when additionalDirectories includes a sibling engagement', () => {
    vi.mocked(readFileSync).mockReturnValueOnce(
      JSON.stringify({
        additionalDirectories: ['~/dev/ss/acme/website', '~/dev/ss/foo/redesign'],
      })
    )
    const err = assertEngagementScope('/tmp/anywhere', ctx)
    expect(err).toBeTruthy()
    expect(err).toContain('outside the engagement scope')
  })

  it('returns null when additionalDirectories is empty', () => {
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({ additionalDirectories: [] }))
    expect(assertEngagementScope('/tmp/anywhere', ctx)).toBeNull()
  })
})
