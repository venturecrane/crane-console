import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getAgentId, getHostForRegistry, resetAgentIdCacheForTesting } from './agent-identity.js'
import { AGENT_PATTERN } from '@venturecrane/crane-contracts'

describe('getHostForRegistry', () => {
  const originalHostname = process.env.HOSTNAME

  afterEach(() => {
    if (originalHostname === undefined) delete process.env.HOSTNAME
    else process.env.HOSTNAME = originalHostname
  })

  it('prefers HOSTNAME env var when set', () => {
    process.env.HOSTNAME = 'ci-runner-abc123'
    expect(getHostForRegistry()).toBe('ci-runner-abc123')
  })

  it('falls back to os.hostname when HOSTNAME unset', () => {
    delete process.env.HOSTNAME
    const raw = getHostForRegistry()
    expect(typeof raw).toBe('string')
    // Whatever the actual hostname is, it's non-empty or we fall to ''
    // (either is valid behavior depending on test environment).
  })
})

describe('getAgentId', () => {
  const originalHostname = process.env.HOSTNAME

  beforeEach(() => {
    resetAgentIdCacheForTesting()
  })

  afterEach(() => {
    resetAgentIdCacheForTesting()
    if (originalHostname === undefined) delete process.env.HOSTNAME
    else process.env.HOSTNAME = originalHostname
  })

  it.each([
    'm16.local',
    'mac23.local',
    'mbp27.local',
    'MBP-27.local',
    'mini.local',
    'think',
    'DESKTOP-ABC123',
    'host_with_underscore',
    'a3f892bc1d4e',
    '',
    'a'.repeat(200),
  ])('output for HOSTNAME=%j always matches AGENT_PATTERN', (host) => {
    process.env.HOSTNAME = host
    resetAgentIdCacheForTesting()
    const agent = getAgentId()
    expect(agent).toMatch(AGENT_PATTERN)
  })

  it('caches the result so subsequent calls return the same value', () => {
    process.env.HOSTNAME = 'm16.local'
    resetAgentIdCacheForTesting()
    const a = getAgentId()
    // Even if HOSTNAME changes, the cache returns the original
    process.env.HOSTNAME = 'something-else'
    const b = getAgentId()
    expect(b).toBe(a)
  })

  it('resetAgentIdCacheForTesting forces recomputation', () => {
    process.env.HOSTNAME = 'host-one'
    resetAgentIdCacheForTesting()
    const a = getAgentId()
    process.env.HOSTNAME = 'host-two'
    resetAgentIdCacheForTesting()
    const b = getAgentId()
    expect(a).not.toBe(b)
  })

  it('the original bug shape is no longer produced', () => {
    process.env.HOSTNAME = 'm16.local'
    resetAgentIdCacheForTesting()
    const agent = getAgentId()
    expect(agent).not.toBe('crane-mcp-m16.local')
    expect(agent).not.toContain('.')
    expect(agent).toMatch(/^crane-mcp-m16-local-[0-9a-f]{4}$/)
  })
})
