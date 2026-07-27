/**
 * Gate-semantics tests for filterEligibleRecords (crane-console#1164).
 *
 * The 'either' union gate: curator-set injectable OR captain_approved admits
 * a stable record — approval is sovereign, curation is the automated path.
 * Also pins two safety properties that predate #1164 but were untested:
 * an UNKNOWN gate value must degrade to the strictest mode ('both'), never
 * to gate-off (the old fall-through admitted everything stable), and drafts
 * never inject under any gate value.
 */
import { describe, it, expect } from 'vitest'
import { filterEligibleRecords } from './memory-inject.js'
import type { MemoryRecord } from '../memory-frontmatter.js'

function record(over: {
  name: string
  approved?: boolean
  injectable?: boolean
  status?: string
  scope?: string
}): MemoryRecord {
  return {
    note_id: `note_${over.name}`,
    injectable: over.injectable ?? false,
    parse_error: false,
    body: 'body',
    frontmatter: {
      name: over.name,
      description: 'test record',
      kind: 'anti-pattern',
      scope: over.scope ?? 'enterprise',
      owner: 'captain',
      status: (over.status ?? 'stable') as never,
      captain_approved: over.approved ?? false,
      version: '1.0.0',
    },
  } as unknown as MemoryRecord
}

const approvedOnly = record({ name: 'approved-only', approved: true })
const injectableOnly = record({ name: 'injectable-only', injectable: true })
const bothFlags = record({ name: 'both-flags', approved: true, injectable: true })
const neitherFlag = record({ name: 'neither-flag' })
const draftApproved = record({ name: 'draft-approved', approved: true, status: 'draft' })
const otherVenture = record({
  name: 'other-venture',
  approved: true,
  injectable: true,
  scope: 'venture:ke',
})
const all = [approvedOnly, injectableOnly, bothFlags, neitherFlag, draftApproved, otherVenture]

const names = (rs: MemoryRecord[]) => rs.map((r) => r.frontmatter.name).sort()

describe("gate 'either' — the union gate (#1164)", () => {
  it('admits captain-approved records without curator promotion (approval is sovereign)', () => {
    expect(names(filterEligibleRecords(all, 'either', 'ss'))).toEqual([
      'approved-only',
      'both-flags',
      'injectable-only',
    ])
  })
})

describe('existing gate modes are unchanged', () => {
  it("'injectable' admits curator picks only", () => {
    expect(names(filterEligibleRecords(all, 'injectable', 'ss'))).toEqual([
      'both-flags',
      'injectable-only',
    ])
  })

  it("'captain_approved' admits approved records only", () => {
    expect(names(filterEligibleRecords(all, 'captain_approved', 'ss'))).toEqual([
      'approved-only',
      'both-flags',
    ])
  })

  it("'both' requires both flags", () => {
    expect(names(filterEligibleRecords(all, 'both', 'ss'))).toEqual(['both-flags'])
  })
})

describe('safety properties', () => {
  it('an unknown gate value degrades to the strictest mode, never to gate-off', () => {
    expect(names(filterEligibleRecords(all, 'someday-a-typo', 'ss'))).toEqual(['both-flags'])
  })

  it('drafts never inject, even captain-approved, under every gate value', () => {
    for (const gate of ['either', 'injectable', 'captain_approved', 'both', 'unknown']) {
      expect(names(filterEligibleRecords([draftApproved], gate, 'ss'))).toEqual([])
    }
  })

  it('scope filtering still applies after the gate', () => {
    expect(names(filterEligibleRecords([otherVenture], 'either', 'ss'))).toEqual([])
    expect(names(filterEligibleRecords([otherVenture], 'either', 'ke'))).toEqual(['other-venture'])
  })
})
