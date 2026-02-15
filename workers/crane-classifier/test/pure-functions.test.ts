/**
 * Unit Tests: Crane Classifier Pure Functions
 *
 * Tests the pure, side-effect-free functions exported from the classifier worker.
 * These functions handle AC extraction, skip logic, signature validation,
 * test-required detection, and idempotency key computation.
 */

import { describe, it, expect } from 'vitest'
import {
  extractAcceptanceCriteria,
  shouldSkipClassification,
  validateGitHubSignature,
  detectTestRequired,
  computeSemanticKey,
  IssuePayload,
} from '../src/index'

// ============================================================================
// Helper: Build an IssuePayload with sensible defaults
// ============================================================================

function makePayload(overrides: Partial<IssuePayload> = {}): IssuePayload {
  return {
    repo: 'venturecrane/crane-console',
    issue_number: 42,
    title: 'Test issue',
    body: 'Test body',
    labels: [],
    updated_at: '2026-02-15T00:00:00Z',
    sender: { login: 'scottdurgan', type: 'User' },
    delivery_id: 'test-delivery-001',
    ...overrides,
  }
}

// ============================================================================
// extractAcceptanceCriteria
// ============================================================================

describe('extractAcceptanceCriteria', () => {
  it('returns missing signal for empty body', () => {
    const result = extractAcceptanceCriteria('')
    expect(result.ac).toBe('(missing)')
    expect(result.signal).toBe('missing_acceptance_criteria')
  })

  it('returns missing signal for whitespace-only body', () => {
    const result = extractAcceptanceCriteria('   \n\t  ')
    expect(result.ac).toBe('(missing)')
    expect(result.signal).toBe('missing_acceptance_criteria')
  })

  it('extracts ACs from ## Acceptance Criteria heading', () => {
    const body = `## Summary
Some context about the issue.

## Acceptance Criteria
- [ ] AC1: User can log in
- [ ] AC2: User sees dashboard

## Notes
Some follow-up notes.`

    const result = extractAcceptanceCriteria(body)
    expect(result.ac).toContain('AC1: User can log in')
    expect(result.ac).toContain('AC2: User sees dashboard')
    expect(result.signal).toBeUndefined()
  })

  it('handles case-insensitive heading matching', () => {
    const body = `## acceptance criteria
- [ ] Widget renders correctly`

    const result = extractAcceptanceCriteria(body)
    expect(result.ac).toContain('Widget renders correctly')
    expect(result.signal).toBeUndefined()
  })

  it('handles mixed case heading', () => {
    const body = `## ACCEPTANCE CRITERIA
- [ ] API returns 200`

    const result = extractAcceptanceCriteria(body)
    expect(result.ac).toContain('API returns 200')
    expect(result.signal).toBeUndefined()
  })

  it('extracts content until the next ## heading', () => {
    const body = `## Acceptance Criteria
- [ ] First criterion
- [ ] Second criterion

## Implementation Notes
This should not be included.`

    const result = extractAcceptanceCriteria(body)
    expect(result.ac).toContain('First criterion')
    expect(result.ac).toContain('Second criterion')
    expect(result.ac).not.toContain('Implementation Notes')
    expect(result.ac).not.toContain('should not be included')
  })

  it('extracts to end of string when no following heading', () => {
    const body = `## Acceptance Criteria
- [ ] Only criterion here
Some additional text at the end`

    const result = extractAcceptanceCriteria(body)
    expect(result.ac).toContain('Only criterion here')
    expect(result.ac).toContain('additional text at the end')
  })

  it('returns missing when AC heading exists but has no content', () => {
    const body = `## Acceptance Criteria

## Next Section`

    const result = extractAcceptanceCriteria(body)
    expect(result.ac).toBe('(missing)')
    expect(result.signal).toBe('missing_acceptance_criteria')
  })

  it('falls back to AC1/AC2 numbered patterns', () => {
    const body = `This is an issue body.

AC1: User can create an account
AC2: User receives confirmation email`

    const result = extractAcceptanceCriteria(body)
    expect(result.ac).toContain('AC1: User can create an account')
    expect(result.ac).toContain('AC2: User receives confirmation email')
    expect(result.signal).toBeUndefined()
  })

  it('returns missing when no ACs found at all', () => {
    const body = `This is just a regular issue body with no acceptance criteria section
and no AC patterns either. Just plain text describing a bug.`

    const result = extractAcceptanceCriteria(body)
    expect(result.ac).toBe('(missing)')
    expect(result.signal).toBe('missing_acceptance_criteria')
  })

  it('truncates AC text to 8000 characters', () => {
    const longAC = 'x'.repeat(9000)
    const body = `## Acceptance Criteria
${longAC}`

    const result = extractAcceptanceCriteria(body)
    expect(result.ac.length).toBeLessThanOrEqual(8000)
  })

  it('handles body with only whitespace after AC heading before next section', () => {
    const body = `## Acceptance Criteria

## Design`

    const result = extractAcceptanceCriteria(body)
    expect(result.ac).toBe('(missing)')
    expect(result.signal).toBe('missing_acceptance_criteria')
  })
})

// ============================================================================
// shouldSkipClassification
// ============================================================================

describe('shouldSkipClassification', () => {
  it('does not skip for a normal user-created issue', () => {
    const payload = makePayload()
    const result = shouldSkipClassification(payload)
    expect(result.skip).toBe(false)
    expect(result.reason).toBeUndefined()
  })

  it('skips when sender is a Bot', () => {
    const payload = makePayload({
      sender: { login: 'dependabot[bot]', type: 'Bot' },
    })
    const result = shouldSkipClassification(payload)
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('sender_is_bot')
  })

  it('does not skip for User type even with bot-like login name', () => {
    const payload = makePayload({
      sender: { login: 'bot-manager', type: 'User' },
    })
    const result = shouldSkipClassification(payload)
    expect(result.skip).toBe(false)
  })

  it('skips when issue already has qa:0 label', () => {
    const payload = makePayload({ labels: ['bug', 'qa:0'] })
    const result = shouldSkipClassification(payload)
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('already_has_qa_label')
  })

  it('skips when issue already has qa:1 label', () => {
    const payload = makePayload({ labels: ['qa:1', 'enhancement'] })
    const result = shouldSkipClassification(payload)
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('already_has_qa_label')
  })

  it('skips when issue already has qa:2 label', () => {
    const payload = makePayload({ labels: ['qa:2'] })
    const result = shouldSkipClassification(payload)
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('already_has_qa_label')
  })

  it('skips when issue already has qa:3 label', () => {
    const payload = makePayload({ labels: ['qa:3'] })
    const result = shouldSkipClassification(payload)
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('already_has_qa_label')
  })

  it('does not skip for non-matching qa-like labels', () => {
    const payload = makePayload({ labels: ['qa:grade', 'qa-grade:2', 'qa:10'] })
    const result = shouldSkipClassification(payload)
    expect(result.skip).toBe(false)
  })

  it('skips when issue has automation:graded label', () => {
    const payload = makePayload({ labels: ['automation:graded'] })
    const result = shouldSkipClassification(payload)
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('already_graded')
  })

  it('prioritizes bot check over label checks', () => {
    // Bot sender AND has qa label - should report bot reason first
    const payload = makePayload({
      sender: { login: 'github-actions[bot]', type: 'Bot' },
      labels: ['qa:1', 'automation:graded'],
    })
    const result = shouldSkipClassification(payload)
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('sender_is_bot')
  })

  it('prioritizes qa label over automation:graded', () => {
    // Has both qa label AND automation:graded
    const payload = makePayload({
      labels: ['qa:2', 'automation:graded'],
    })
    const result = shouldSkipClassification(payload)
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('already_has_qa_label')
  })

  it('handles empty labels array', () => {
    const payload = makePayload({ labels: [] })
    const result = shouldSkipClassification(payload)
    expect(result.skip).toBe(false)
  })
})

// ============================================================================
// validateGitHubSignature
// ============================================================================

describe('validateGitHubSignature', () => {
  // Helper to compute expected HMAC-SHA256 signature
  async function computeHmacSig(body: string, secret: string): Promise<string> {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  it('returns true for a valid signature', async () => {
    const body = '{"action":"opened","issue":{"number":1}}'
    const secret = 'test-webhook-secret'
    const hmac = await computeHmacSig(body, secret)
    const signature = `sha256=${hmac}`

    const result = await validateGitHubSignature(body, signature, secret)
    expect(result).toBe(true)
  })

  it('returns false for an invalid signature', async () => {
    const body = '{"action":"opened"}'
    const secret = 'test-webhook-secret'
    const signature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000'

    const result = await validateGitHubSignature(body, signature, secret)
    expect(result).toBe(false)
  })

  it('returns false when signature is null', async () => {
    const result = await validateGitHubSignature('body', null, 'secret')
    expect(result).toBe(false)
  })

  it('returns false when secret is empty', async () => {
    const result = await validateGitHubSignature('body', 'sha256=abc', '')
    expect(result).toBe(false)
  })

  it('returns false when body has been tampered with', async () => {
    const originalBody = '{"action":"opened"}'
    const secret = 'my-secret'
    const hmac = await computeHmacSig(originalBody, secret)
    const signature = `sha256=${hmac}`

    // Tamper with the body
    const tamperedBody = '{"action":"closed"}'
    const result = await validateGitHubSignature(tamperedBody, signature, secret)
    expect(result).toBe(false)
  })

  it('returns false when signed with wrong secret', async () => {
    const body = '{"action":"opened"}'
    const wrongSecret = 'wrong-secret'
    const correctSecret = 'correct-secret'
    const hmac = await computeHmacSig(body, wrongSecret)
    const signature = `sha256=${hmac}`

    const result = await validateGitHubSignature(body, signature, correctSecret)
    expect(result).toBe(false)
  })

  it('handles empty body with valid signature', async () => {
    const body = ''
    const secret = 'test-secret'
    const hmac = await computeHmacSig(body, secret)
    const signature = `sha256=${hmac}`

    const result = await validateGitHubSignature(body, signature, secret)
    expect(result).toBe(true)
  })

  it('handles body with unicode characters', async () => {
    const body = '{"title":"Fix bug in cafe\u0301 module"}'
    const secret = 'unicode-secret'
    const hmac = await computeHmacSig(body, secret)
    const signature = `sha256=${hmac}`

    const result = await validateGitHubSignature(body, signature, secret)
    expect(result).toBe(true)
  })
})

// ============================================================================
// detectTestRequired
// ============================================================================

describe('detectTestRequired', () => {
  it('returns false for a plain UI issue', () => {
    const result = detectTestRequired(
      'Update dashboard layout',
      'Move the sidebar to the left. Change colors to match new design.'
    )
    expect(result).toBe(false)
  })

  it('detects "implement calculation" pattern', () => {
    const result = detectTestRequired(
      'Implement buyer premium calculation',
      'Add buyer premium calculation logic to the auction module.'
    )
    expect(result).toBe(true)
  })

  it('detects "fix formula" pattern', () => {
    const result = detectTestRequired(
      'Fix margin formula',
      'The margin formula is returning incorrect values for edge cases.'
    )
    expect(result).toBe(true)
  })

  it('detects "update algorithm" pattern', () => {
    const result = detectTestRequired(
      'Update sorting algorithm',
      'Change the recommendation algorithm to account for recency.'
    )
    expect(result).toBe(true)
  })

  it('detects specific financial terms - buyer premium', () => {
    const result = detectTestRequired(
      'Buyer premium changes',
      'Update buyer premium rates for the new fee schedule.'
    )
    expect(result).toBe(true)
  })

  it('detects specific financial terms - margin percent', () => {
    const result = detectTestRequired(
      'Fix display',
      'The margin percent is not being saved correctly.'
    )
    expect(result).toBe(true)
  })

  it('detects specific financial terms - balance calculation', () => {
    const result = detectTestRequired(
      'Balance calculation bug',
      'Balance calculation returns wrong amount when multiple credits applied.'
    )
    expect(result).toBe(true)
  })

  it('detects database schema fields - amount_cents', () => {
    const result = detectTestRequired(
      'Add new price field',
      'Add amount_cents column to the transactions table.'
    )
    expect(result).toBe(true)
  })

  it('detects database schema fields - price_cents', () => {
    const result = detectTestRequired(
      'Update pricing',
      'Migrate price_cents from integer to bigint for high-value items.'
    )
    expect(result).toBe(true)
  })

  it('detects database schema fields - fee_schedule', () => {
    const result = detectTestRequired(
      'New fee model',
      'Create fee_schedule table to support tiered pricing.'
    )
    expect(result).toBe(true)
  })

  it('detects explicit test mentions - unit test', () => {
    const result = detectTestRequired(
      'Add unit test for parser',
      'We need unit test coverage for the price parser module.'
    )
    expect(result).toBe(true)
  })

  it('detects explicit test mentions - add test', () => {
    const result = detectTestRequired(
      'Add test coverage',
      'We should add test coverage for the classifier functions.'
    )
    expect(result).toBe(true)
  })

  it('detects explicit test mentions - edge case', () => {
    const result = detectTestRequired(
      'Handle edge case in billing',
      'There is an edge case when the user has zero balance.'
    )
    expect(result).toBe(true)
  })

  it('detects explicit test mentions - rounding error', () => {
    const result = detectTestRequired(
      'Fix rounding error in totals',
      'Rounding error causes penny discrepancies in invoices.'
    )
    expect(result).toBe(true)
  })

  it('detects code file references - calculateBalance', () => {
    const result = detectTestRequired(
      'Refactor balance module',
      'Update the calculateBalance function to handle multi-currency.'
    )
    expect(result).toBe(true)
  })

  it('detects code file references - dollarsToCents', () => {
    const result = detectTestRequired(
      'Fix conversion helper',
      'dollarsToCents is losing precision for values over $1M.'
    )
    expect(result).toBe(true)
  })

  it('is case-insensitive', () => {
    const result = detectTestRequired(
      'FIX FORMULA for pricing',
      'The CALCULATION LOGIC needs an update.'
    )
    expect(result).toBe(true)
  })

  it('returns false for documentation-only issues', () => {
    const result = detectTestRequired(
      'Update README',
      'Add deployment instructions and API documentation.'
    )
    expect(result).toBe(false)
  })

  it('returns false for issues that mention money terms without calculation logic', () => {
    const result = detectTestRequired(
      'Update payment page layout',
      'Move the payment button to the top of the page. Show the total in bold.'
    )
    expect(result).toBe(false)
  })

  it('checks combined title and body', () => {
    // Pattern only in title
    const result1 = detectTestRequired('Fix calculation in module', 'Some plain body.')
    expect(result1).toBe(true)

    // Pattern only in body
    const result2 = detectTestRequired('Some plain title', 'Need to add test coverage for this.')
    expect(result2).toBe(true)
  })
})

// ============================================================================
// computeSemanticKey
// ============================================================================

describe('computeSemanticKey', () => {
  it('returns a 64-character hex string (SHA-256)', async () => {
    const key = await computeSemanticKey(
      'venturecrane/crane-console',
      42,
      'grade_issue_v3',
      'Some AC text',
      []
    )
    expect(key).toMatch(/^[a-f0-9]{64}$/)
  })

  it('produces consistent results for same input', async () => {
    const key1 = await computeSemanticKey(
      'venturecrane/crane-console',
      42,
      'grade_issue_v3',
      'AC1: User can log in',
      ['status:ready', 'component:auth']
    )
    const key2 = await computeSemanticKey(
      'venturecrane/crane-console',
      42,
      'grade_issue_v3',
      'AC1: User can log in',
      ['status:ready', 'component:auth']
    )
    expect(key1).toBe(key2)
  })

  it('changes when AC text changes', async () => {
    const key1 = await computeSemanticKey(
      'venturecrane/crane-console',
      42,
      'grade_issue_v3',
      'AC1: login works',
      []
    )
    const key2 = await computeSemanticKey(
      'venturecrane/crane-console',
      42,
      'grade_issue_v3',
      'AC1: login is broken',
      []
    )
    expect(key1).not.toBe(key2)
  })

  it('changes when issue number changes', async () => {
    const key1 = await computeSemanticKey('repo/name', 1, 'v1', 'ac text', [])
    const key2 = await computeSemanticKey('repo/name', 2, 'v1', 'ac text', [])
    expect(key1).not.toBe(key2)
  })

  it('changes when repo changes', async () => {
    const key1 = await computeSemanticKey('org/repo-a', 1, 'v1', 'ac', [])
    const key2 = await computeSemanticKey('org/repo-b', 1, 'v1', 'ac', [])
    expect(key1).not.toBe(key2)
  })

  it('changes when prompt version changes', async () => {
    const key1 = await computeSemanticKey('repo/name', 1, 'v1', 'ac', [])
    const key2 = await computeSemanticKey('repo/name', 1, 'v2', 'ac', [])
    expect(key1).not.toBe(key2)
  })

  it('normalizes AC text - whitespace collapsing', async () => {
    const key1 = await computeSemanticKey('repo/name', 1, 'v1', 'ac   text   here', [])
    const key2 = await computeSemanticKey('repo/name', 1, 'v1', 'ac text here', [])
    expect(key1).toBe(key2)
  })

  it('normalizes AC text - case insensitivity', async () => {
    const key1 = await computeSemanticKey('repo/name', 1, 'v1', 'AC Text Here', [])
    const key2 = await computeSemanticKey('repo/name', 1, 'v1', 'ac text here', [])
    expect(key1).toBe(key2)
  })

  it('normalizes AC text - leading/trailing whitespace', async () => {
    const key1 = await computeSemanticKey('repo/name', 1, 'v1', '  ac text  ', [])
    const key2 = await computeSemanticKey('repo/name', 1, 'v1', 'ac text', [])
    expect(key1).toBe(key2)
  })

  it('only includes status: and component: labels in key', async () => {
    const key1 = await computeSemanticKey('repo/name', 1, 'v1', 'ac', [
      'status:ready',
      'component:auth',
      'bug',
      'priority:high',
    ])
    const key2 = await computeSemanticKey('repo/name', 1, 'v1', 'ac', [
      'status:ready',
      'component:auth',
    ])
    expect(key1).toBe(key2)
  })

  it('ignores irrelevant labels', async () => {
    const key1 = await computeSemanticKey('repo/name', 1, 'v1', 'ac', ['bug', 'enhancement'])
    const key2 = await computeSemanticKey('repo/name', 1, 'v1', 'ac', [])
    expect(key1).toBe(key2)
  })

  it('sorts labels for consistent ordering', async () => {
    const key1 = await computeSemanticKey('repo/name', 1, 'v1', 'ac', ['component:z', 'status:a'])
    const key2 = await computeSemanticKey('repo/name', 1, 'v1', 'ac', ['status:a', 'component:z'])
    expect(key1).toBe(key2)
  })

  it('changes when relevant labels change', async () => {
    const key1 = await computeSemanticKey('repo/name', 1, 'v1', 'ac', ['status:ready'])
    const key2 = await computeSemanticKey('repo/name', 1, 'v1', 'ac', ['status:in-progress'])
    expect(key1).not.toBe(key2)
  })
})
