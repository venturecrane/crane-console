/**
 * Unit Tests: Vercel Event Normalizer
 *
 * Tests deployment.error, deployment.canceled, and ignored events.
 * Verifies severity rules and project-to-venture mapping.
 */

import { describe, it, expect } from 'vitest'
import { normalizeVercelDeployment } from '../src/notifications-vercel'

// ============================================================================
// Fixture Helpers
// ============================================================================

function deploymentPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dpl_abc123',
    name: 'crane-console',
    target: 'production',
    url: 'crane-console-abc123.vercel.app',
    errorMessage: 'Build failed: exit code 1',
    meta: {
      githubCommitRef: 'main',
      githubCommitSha: 'abc123def',
      githubCommitMessage: 'fix: something',
      githubOrg: 'venturecrane',
      githubRepo: 'crane-console',
    },
    creator: { username: 'scottdurgan' },
    ...overrides,
  }
}

// ============================================================================
// deployment.error Tests
// ============================================================================

describe('normalizeVercelDeployment - deployment.error', () => {
  it('returns critical for production deployment error', () => {
    const result = normalizeVercelDeployment('deployment.error', deploymentPayload())
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('critical')
    expect(result!.event_type).toBe('deployment.error')
    expect(result!.summary).toContain('crane-console')
    expect(result!.summary).toContain('failed')
    expect(result!.summary).toContain('production')
    expect(result!.venture).toBe('vc')
    expect(result!.repo).toBe('venturecrane/crane-console')
    expect(result!.branch).toBe('main')
    expect(result!.environment).toBe('production')
  })

  it('returns warning for preview deployment error', () => {
    const result = normalizeVercelDeployment(
      'deployment.error',
      deploymentPayload({ target: 'preview' })
    )
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('warning')
    expect(result!.environment).toBe('preview')
  })

  it('returns warning for staging deployment error', () => {
    const result = normalizeVercelDeployment(
      'deployment.error',
      deploymentPayload({ target: 'staging' })
    )
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('warning')
  })

  it('maps ke-console to ke venture', () => {
    const result = normalizeVercelDeployment(
      'deployment.error',
      deploymentPayload({ name: 'ke-console' })
    )
    expect(result!.venture).toBe('ke')
  })

  it('returns null venture for unknown project', () => {
    const result = normalizeVercelDeployment(
      'deployment.error',
      deploymentPayload({ name: 'unknown-project' })
    )
    expect(result!.venture).toBeNull()
  })

  it('includes error message in details', () => {
    const result = normalizeVercelDeployment('deployment.error', deploymentPayload())
    const details = JSON.parse(result!.details_json)
    expect(details.error_message).toBe('Build failed: exit code 1')
  })

  it('includes deployment URL in details', () => {
    const result = normalizeVercelDeployment('deployment.error', deploymentPayload())
    const details = JSON.parse(result!.details_json)
    expect(details.url).toBe('https://crane-console-abc123.vercel.app')
  })

  it('handles missing meta fields gracefully', () => {
    const result = normalizeVercelDeployment('deployment.error', deploymentPayload({ meta: {} }))
    expect(result).not.toBeNull()
    expect(result!.branch).toBeNull()
    expect(result!.repo).toBeNull()
  })
})

// ============================================================================
// deployment.canceled Tests
// ============================================================================

describe('normalizeVercelDeployment - deployment.canceled', () => {
  it('returns info severity for canceled deployment', () => {
    const result = normalizeVercelDeployment('deployment.canceled', deploymentPayload())
    expect(result).not.toBeNull()
    expect(result!.severity).toBe('info')
    expect(result!.event_type).toBe('deployment.canceled')
    expect(result!.summary).toContain('canceled')
  })
})

// ============================================================================
// Ignored Events Tests
// ============================================================================

describe('normalizeVercelDeployment - ignored events', () => {
  it('returns null for deployment.created', () => {
    expect(normalizeVercelDeployment('deployment.created', deploymentPayload())).toBeNull()
  })

  it('returns null for deployment.succeeded', () => {
    expect(normalizeVercelDeployment('deployment.succeeded', deploymentPayload())).toBeNull()
  })

  it('returns null for deployment.ready', () => {
    expect(normalizeVercelDeployment('deployment.ready', deploymentPayload())).toBeNull()
  })

  it('returns null for unknown event type', () => {
    expect(normalizeVercelDeployment('deployment.promoted', deploymentPayload())).toBeNull()
  })
})

// ============================================================================
// Content Key / Dedup Tests
// ============================================================================

describe('normalizeVercelDeployment - deduplication', () => {
  it('includes deployment ID in content_key', () => {
    const result = normalizeVercelDeployment('deployment.error', deploymentPayload())
    expect(result!.content_key).toBe('vercel:dpl_abc123:deployment.error')
  })

  it('uses uid field if id is missing', () => {
    const result = normalizeVercelDeployment(
      'deployment.error',
      deploymentPayload({ id: undefined, uid: 'uid_xyz789' })
    )
    expect(result!.content_key).toContain('uid_xyz789')
  })
})
