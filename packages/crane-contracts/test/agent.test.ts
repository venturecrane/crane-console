/**
 * Canonical test suite for the agent-identity contract.
 *
 * These tests are authoritative — both the crane-mcp client and the
 * crane-context worker consume the same module, so every behavior
 * codified here is shared between them. If a future PR needs to alter
 * the contract (e.g., allow uppercase, extend the prefix), the change
 * must land here first.
 */

import { describe, it, expect } from 'vitest'
import {
  AGENT_PATTERN,
  AGENT_MAX_LENGTH,
  AGENT_HASH_SUFFIX_LENGTH,
  DEFAULT_AGENT_PREFIX,
  UNKNOWN_HOST_SANITIZED,
  isValidAgent,
  sanitizeHostnameForAgent,
  hashHostname,
  buildAgentName,
} from '../src/agent.js'

describe('AGENT_PATTERN', () => {
  it.each([
    ['crane-mcp-m16', true],
    ['crane-mcp-m16-local', true],
    ['crane-mcp-m16-local-c1d2', true],
    ['claude-desktop', true],
    ['cc-cli', true],
    ['cc-cli-host', true],
    ['a-b', true],
    ['0-0', true],
  ])('accepts %s', (input, expected) => {
    expect(isValidAgent(input)).toBe(expected)
  })

  it.each([
    ['crane-mcp-m16.local', false], // the original bug
    ['CRANE-MCP-m16', false], // uppercase
    ['crane_mcp_m16', false], // underscores
    ['', false],
    ['foo', false], // no hyphen
    ['-foo', false], // leading hyphen (needs [a-z0-9]+ first)
    ['foo-', false], // trailing hyphen (needs [a-z0-9-]+ nonempty — but the second group requires at least one char)
    ['foo bar', false], // whitespace
    ['foo/bar', false], // slash
    ['日本-local', false], // non-ascii
  ])('rejects %s', (input, expected) => {
    expect(isValidAgent(input)).toBe(expected)
  })
})

describe('sanitizeHostnameForAgent', () => {
  it.each([
    ['m16.local', 'm16-local'],
    ['MBP-27.local', 'mbp-27-local'],
    ['mac23.local', 'mac23-local'],
    ['think', 'think'],
    ['mac.mini', 'mac-mini'],
    ['mac-mini', 'mac-mini'],
    ['mac--mini', 'mac-mini'], // repeated hyphens collapse
    ['DESKTOP-ABC123', 'desktop-abc123'],
    ['host_with_underscore', 'host-with-underscore'],
    ['a3f892bc1d4e', 'a3f892bc1d4e'], // container-style
    ['日本.local', 'local'], // unicode stripped
    ['  leading-trailing  ', 'leading-trailing'], // whitespace both sides
    ['a.b.c.d', 'a-b-c-d'],
  ])('%s -> %s', (input, expected) => {
    expect(sanitizeHostnameForAgent(input)).toBe(expected)
  })

  it.each([
    [null],
    [undefined],
    [''],
    ['---'],
    ['...'],
    ['   '],
    ['日本'], // all unicode, no ascii
  ])('%s -> unknown', (input) => {
    expect(sanitizeHostnameForAgent(input)).toBe(UNKNOWN_HOST_SANITIZED)
  })

  it('truncates long hostnames to the available budget', () => {
    const longInput = 'a'.repeat(200)
    const result = sanitizeHostnameForAgent(longInput)
    // Default available = 63 - 9 (prefix) - 1 - 1 - 4 (hash) = 48
    expect(result.length).toBeLessThanOrEqual(48)
    expect(result).toMatch(/^a+$/)
  })

  it('never returns a value ending in a hyphen after truncation', () => {
    // Input where truncation boundary falls on a hyphen
    const input = 'aaaaaaaa-' + 'b'.repeat(100)
    const result = sanitizeHostnameForAgent(input, 9) // cap at 9 chars
    expect(result.endsWith('-')).toBe(false)
  })

  it('respects the maxLength parameter', () => {
    expect(sanitizeHostnameForAgent('abcdefghij', 5)).toBe('abcde')
  })
})

describe('hashHostname', () => {
  it('returns AGENT_HASH_SUFFIX_LENGTH hex chars', () => {
    expect(hashHostname('anything')).toMatch(/^[0-9a-f]{4}$/)
  })

  it('is deterministic', () => {
    expect(hashHostname('m16.local')).toBe(hashHostname('m16.local'))
  })

  it('produces different suffixes for colliding sanitized outputs', () => {
    // mac.mini and mac-mini both sanitize to "mac-mini" but hash to different values
    expect(hashHostname('mac.mini')).not.toBe(hashHostname('mac-mini'))
  })

  it('handles null and undefined without throwing', () => {
    expect(hashHostname(null)).toMatch(/^[0-9a-f]{4}$/)
    expect(hashHostname(undefined)).toMatch(/^[0-9a-f]{4}$/)
    expect(hashHostname(null)).toBe(hashHostname(undefined)) // both -> '' -> same hash
    expect(hashHostname(null)).toBe(hashHostname(''))
  })
})

describe('buildAgentName', () => {
  it.each([
    'm16.local',
    'MBP-27.local',
    'mac23.local',
    'think',
    'mac.mini',
    'mac-mini',
    'DESKTOP-ABC123',
    'host_with_underscore',
    'a3f892bc1d4e',
    '日本.local',
    '',
    null,
    undefined,
    '---',
    'a'.repeat(200),
  ])('produces a valid AGENT_PATTERN match for input %s', (input) => {
    const agent = buildAgentName(input)
    expect(isValidAgent(agent)).toBe(true)
    expect(agent.length).toBeLessThanOrEqual(AGENT_MAX_LENGTH)
    expect(agent.startsWith(DEFAULT_AGENT_PREFIX + '-')).toBe(true)
  })

  it('includes the hash suffix', () => {
    const agent = buildAgentName('m16.local')
    expect(agent).toMatch(/-[0-9a-f]{4}$/)
  })

  it('is stable across calls with the same input', () => {
    expect(buildAgentName('m16.local')).toBe(buildAgentName('m16.local'))
  })

  it('disambiguates hostnames that sanitize to the same token', () => {
    const a = buildAgentName('mac.mini')
    const b = buildAgentName('mac-mini')
    // Both sanitize to "mac-mini" but hash differently
    expect(a).not.toBe(b)
    expect(a.replace(/-[0-9a-f]{4}$/, '')).toBe(b.replace(/-[0-9a-f]{4}$/, ''))
  })

  it('honors a custom prefix', () => {
    const agent = buildAgentName('m16.local', 'claude-code')
    expect(agent.startsWith('claude-code-')).toBe(true)
    expect(isValidAgent(agent)).toBe(true)
  })

  it('accepts an empty/null host and still produces a valid agent name', () => {
    const a = buildAgentName('')
    const b = buildAgentName(null)
    const c = buildAgentName(undefined)
    expect(isValidAgent(a)).toBe(true)
    expect(isValidAgent(b)).toBe(true)
    expect(isValidAgent(c)).toBe(true)
    // null/undefined/'' all funnel through sanitize -> 'unknown' and hash('')
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('always stays within AGENT_MAX_LENGTH for extreme inputs', () => {
    const agent = buildAgentName('a'.repeat(1000))
    expect(agent.length).toBeLessThanOrEqual(AGENT_MAX_LENGTH)
    expect(isValidAgent(agent)).toBe(true)
  })

  it('matches the expected shape for known fleet machines', () => {
    // Sanity: the exact m16.local case from the original bug
    const agent = buildAgentName('m16.local')
    expect(agent).toMatch(/^crane-mcp-m16-local-[0-9a-f]{4}$/)
    expect(agent).not.toContain('.')
    expect(agent).not.toContain('_')
  })
})

describe('collision resistance across fleet matrix', () => {
  // Every distinct raw input should produce a distinct final agent name.
  // This guards against silent session-sharing between machines whose
  // hostnames coincidentally sanitize to the same token.
  const fleetInputs = [
    'm16.local',
    'm16-local', // would collide with sanitize alone
    'm16',
    'mac23.local',
    'mac23-local',
    'mbp27.local',
    'mbp-27.local',
    'MBP-27.local',
    'mini',
    'think',
    'mac.mini',
    'mac-mini',
    'mac_mini',
    'DESKTOP-1',
    'DESKTOP-2',
    'a3f892bc1d4e',
    'a3f892bc1d4f',
  ]

  it('produces distinct agent names for every input in the fleet matrix', () => {
    const agents = fleetInputs.map((h) => buildAgentName(h))
    const unique = new Set(agents)
    expect(unique.size).toBe(agents.length)
  })

  it('every generated name satisfies AGENT_PATTERN', () => {
    for (const input of fleetInputs) {
      const agent = buildAgentName(input)
      expect(isValidAgent(agent)).toBe(true)
    }
  })
})

describe('constants sanity', () => {
  it('AGENT_MAX_LENGTH accommodates the canonical shape', () => {
    // prefix + "-" + sanitized(>=1) + "-" + hash(4) must fit
    const minLength = DEFAULT_AGENT_PREFIX.length + 1 + 1 + 1 + AGENT_HASH_SUFFIX_LENGTH
    expect(AGENT_MAX_LENGTH).toBeGreaterThanOrEqual(minLength)
  })

  it('AGENT_PATTERN does not allow dots', () => {
    expect(AGENT_PATTERN.test('crane-mcp-m16.local')).toBe(false)
  })

  it('AGENT_PATTERN accepts the default builder output', () => {
    expect(AGENT_PATTERN.test(buildAgentName('m16.local'))).toBe(true)
  })
})
