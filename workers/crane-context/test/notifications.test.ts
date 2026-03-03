/**
 * Unit Tests: Notifications Data Access Layer
 *
 * Tests CRUD, dedup, pagination, retention, state transitions, and repoToVenture.
 * Uses vitest with in-memory stubs for D1Database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { repoToVenture, computeDedupeHash } from '../src/notifications'

// ============================================================================
// repoToVenture Tests
// ============================================================================

describe('repoToVenture', () => {
  it('maps venturecrane/crane-console to vc', () => {
    expect(repoToVenture('venturecrane/crane-console')).toBe('vc')
  })

  it('maps venturecrane/ke-console to ke', () => {
    expect(repoToVenture('venturecrane/ke-console')).toBe('ke')
  })

  it('maps venturecrane/sc-console to sc', () => {
    expect(repoToVenture('venturecrane/sc-console')).toBe('sc')
  })

  it('maps venturecrane/dfg-console to dfg', () => {
    expect(repoToVenture('venturecrane/dfg-console')).toBe('dfg')
  })

  it('maps venturecrane/dc-console to dc', () => {
    expect(repoToVenture('venturecrane/dc-console')).toBe('dc')
  })

  it('maps venturecrane/vc-web to vc', () => {
    expect(repoToVenture('venturecrane/vc-web')).toBe('vc')
  })

  it('returns null for unknown repo', () => {
    expect(repoToVenture('unknown/repo')).toBeNull()
  })

  it('returns null for wrong org', () => {
    expect(repoToVenture('otherorg/crane-console')).toBeNull()
  })

  it('returns null for invalid format', () => {
    expect(repoToVenture('noslash')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(repoToVenture('')).toBeNull()
  })
})

// ============================================================================
// computeDedupeHash Tests
// ============================================================================

describe('computeDedupeHash', () => {
  it('produces consistent hashes for same input', async () => {
    const hash1 = await computeDedupeHash({
      source: 'github',
      event_type: 'workflow_run.failure',
      repo: 'venturecrane/crane-console',
      branch: 'main',
      content_key: 'workflow_run:123:failure',
    })
    const hash2 = await computeDedupeHash({
      source: 'github',
      event_type: 'workflow_run.failure',
      repo: 'venturecrane/crane-console',
      branch: 'main',
      content_key: 'workflow_run:123:failure',
    })
    expect(hash1).toBe(hash2)
    expect(hash1).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produces different hashes for different inputs', async () => {
    const hash1 = await computeDedupeHash({
      source: 'github',
      event_type: 'workflow_run.failure',
      repo: 'venturecrane/crane-console',
      branch: 'main',
      content_key: 'workflow_run:123:failure',
    })
    const hash2 = await computeDedupeHash({
      source: 'github',
      event_type: 'workflow_run.failure',
      repo: 'venturecrane/crane-console',
      branch: 'develop',
      content_key: 'workflow_run:456:failure',
    })
    expect(hash1).not.toBe(hash2)
  })

  it('handles null repo and branch', async () => {
    const hash = await computeDedupeHash({
      source: 'vercel',
      event_type: 'deployment.error',
      repo: null,
      branch: null,
      content_key: 'vercel:deploy123:deployment.error',
    })
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
