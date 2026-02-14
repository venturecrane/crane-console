/**
 * Mock responses for Crane Context API
 */

import type { Venture, SodResponse, DocAuditResult, DocGetResponse } from '../lib/crane-api.js'

export const mockVentures: Venture[] = [
  { code: 'vc', name: 'Venture Crane', org: 'venturecrane' },
  { code: 'ke', name: 'Kid Expenses', org: 'kidexpenses' },
  { code: 'sc', name: 'Silicon Crane', org: 'siliconcrane' },
  { code: 'dfg', name: 'Durgan Field Guide', org: 'durganfieldguide' },
]

export const mockVenturesResponse = {
  ventures: mockVentures,
}

export const mockSodResponse: SodResponse = {
  session: {
    id: 'sess_test123',
    status: 'active',
    venture: 'vc',
    repo: 'venturecrane/crane-console',
    created_at: '2026-02-04T10:00:00Z',
  },
  last_handoff: {
    summary: 'Completed task implementation',
    from_agent: 'claude',
    created_at: '2026-02-03T18:00:00Z',
    status_label: 'done',
  },
  active_sessions: [],
}

export const mockSodResponseWithActiveSessions: SodResponse = {
  ...mockSodResponse,
  active_sessions: [
    {
      agent: 'other-agent',
      repo: 'venturecrane/crane-console',
      track: 1,
      issue_number: 42,
      created_at: '2026-02-04T09:00:00Z',
    },
  ],
}

export const mockDocAuditComplete: DocAuditResult = {
  venture: 'vc',
  venture_name: 'Venture Crane',
  status: 'complete',
  missing: [],
  stale: [],
  present: [
    {
      doc_name: 'vc-project-instructions.md',
      scope: 'vc',
      version: 1,
      updated_at: '2026-02-01T00:00:00Z',
    },
  ],
  summary: 'Venture Crane: 1 present',
}

export const mockDocAuditIncomplete: DocAuditResult = {
  venture: 'smd',
  venture_name: 'SMD Ventures',
  status: 'incomplete',
  missing: [
    {
      doc_name: 'smd-project-instructions.md',
      required: true,
      description: 'Project instructions',
      auto_generate: true,
      generation_sources: ['claude_md', 'readme', 'package_json'],
    },
  ],
  stale: [],
  present: [],
  summary: 'SMD Ventures: 1 missing',
}

export const mockSodResponseWithAudit: SodResponse = {
  ...mockSodResponse,
  doc_audit: mockDocAuditComplete,
}

export const mockSodResponseWithMissingDocs: SodResponse = {
  ...mockSodResponse,
  doc_audit: mockDocAuditIncomplete,
}

export const mockSodResponseWithDocIndex: SodResponse = {
  ...mockSodResponse,
  doc_index: {
    docs: [
      {
        scope: 'vc',
        doc_name: 'vc-project-instructions.md',
        content_hash: 'abc123',
        title: 'VC Project Instructions',
        version: 1,
      },
      {
        scope: 'global',
        doc_name: 'team-workflow.md',
        content_hash: 'def456',
        title: 'Team Workflow',
        version: 3,
      },
    ],
    count: 2,
  },
}

// Enterprise context fixtures for SOD guard tests
export const mockLongNoteContent = 'A'.repeat(3000) // Exceeds 2000-char cap

export const mockSodResponseWithEnterpriseContext: SodResponse = {
  ...mockSodResponse,
  enterprise_context: {
    notes: [
      {
        id: 'note_short',
        title: 'VC Executive Summary',
        content: 'Short summary under the cap.',
        tags: '["executive-summary"]',
        venture: 'vc',
        archived: 0,
        created_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
        actor_key_id: null,
        meta_json: null,
      },
      {
        id: 'note_long',
        title: 'SMD Enterprise Summary',
        content: mockLongNoteContent,
        tags: '["executive-summary"]',
        venture: null,
        archived: 0,
        created_at: '2026-01-15T00:00:00Z',
        updated_at: '2026-01-15T00:00:00Z',
        actor_key_id: null,
        meta_json: null,
      },
    ],
    count: 2,
  },
}

// Budget exhaustion fixture: 4 notes × 4000 chars = 16K > 12K budget
export const mockBudgetExhaustionContent = 'B'.repeat(4000)

export const mockSodResponseWithBudgetExhaustion: SodResponse = {
  ...mockSodResponse,
  enterprise_context: {
    notes: [
      {
        id: 'note_v1',
        title: 'VC Strategy',
        content: mockBudgetExhaustionContent,
        tags: '["executive-summary"]',
        venture: 'vc',
        archived: 0,
        created_at: '2026-02-10T00:00:00Z',
        updated_at: '2026-02-10T00:00:00Z',
        actor_key_id: null,
        meta_json: null,
      },
      {
        id: 'note_v2',
        title: 'VC Roadmap',
        content: mockBudgetExhaustionContent,
        tags: '["executive-summary"]',
        venture: 'vc',
        archived: 0,
        created_at: '2026-02-09T00:00:00Z',
        updated_at: '2026-02-09T00:00:00Z',
        actor_key_id: null,
        meta_json: null,
      },
      {
        id: 'note_g1',
        title: 'SMD Global Overview',
        content: mockBudgetExhaustionContent,
        tags: '["executive-summary"]',
        venture: null,
        archived: 0,
        created_at: '2026-02-08T00:00:00Z',
        updated_at: '2026-02-08T00:00:00Z',
        actor_key_id: null,
        meta_json: null,
      },
      {
        id: 'note_g2',
        title: 'Enterprise Governance',
        content: mockBudgetExhaustionContent,
        tags: '["executive-summary"]',
        venture: null,
        archived: 0,
        created_at: '2026-02-07T00:00:00Z',
        updated_at: '2026-02-07T00:00:00Z',
        actor_key_id: null,
        meta_json: null,
      },
    ],
    count: 4,
  },
}

// Doc index with 40 items for cap test
export const mockSodResponseWithLargeDocIndex: SodResponse = {
  ...mockSodResponse,
  doc_index: {
    docs: Array.from({ length: 40 }, (_, i) => ({
      scope: i % 2 === 0 ? 'vc' : 'global',
      doc_name: `doc-${String(i + 1).padStart(2, '0')}.md`,
      content_hash: `hash${i}`,
      title: `Document ${i + 1}`,
      version: 1,
    })),
    count: 40,
  },
}

export const mockDocGetResponse: DocGetResponse = {
  scope: 'vc',
  doc_name: 'vc-project-instructions.md',
  content: '# VC Project Instructions\n\nTest content...',
  content_hash: 'abc123',
  title: 'VC Project Instructions',
  description: null,
  version: 1,
}

export const mockHandoffResponse = { success: true }

export const mockHealthResponse = { status: 'ok' }
