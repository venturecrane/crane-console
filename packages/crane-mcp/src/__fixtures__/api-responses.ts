/**
 * Mock responses for Crane Context API
 */

import type { Venture, SodResponse } from '../lib/crane-api.js';

export const mockVentures: Venture[] = [
  { code: 'vc', name: 'Venture Crane', org: 'venturecrane' },
  { code: 'ke', name: 'Kid Expenses', org: 'kidexpenses' },
  { code: 'sc', name: 'Silicon Crane', org: 'siliconcrane' },
  { code: 'dfg', name: 'Durgan Field Guide', org: 'durganfieldguide' },
];

export const mockVenturesResponse = {
  ventures: mockVentures,
};

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
};

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
};

export const mockHandoffResponse = { success: true };

export const mockHealthResponse = { status: 'ok' };
