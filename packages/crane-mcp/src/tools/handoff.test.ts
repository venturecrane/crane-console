/**
 * Tests for handoff.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockVentures } from '../__fixtures__/api-responses.js';
import { mockRepoInfo } from '../__fixtures__/repo-fixtures.js';

vi.mock('../lib/repo-scanner.js');

const getModule = async () => {
  vi.resetModules();
  return import('./handoff.js');
};

describe('handoff tool', () => {
  const originalEnv = process.env;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env = { ...originalEnv, CRANE_CONTEXT_KEY: 'test-key' };

    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates handoff with valid input', async () => {
    const { executeHandoff } = await getModule();
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js');

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo);
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0]);

    // Mock fetch for getVentures and createHandoff
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    const result = await executeHandoff({
      summary: 'Completed feature implementation',
      status: 'done',
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Handoff created');
  });

  it('returns error when API key missing', async () => {
    const { executeHandoff } = await getModule();

    delete process.env.CRANE_CONTEXT_KEY;

    const result = await executeHandoff({
      summary: 'Test summary',
      status: 'done',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('CRANE_CONTEXT_KEY not found');
  });

  it('returns error when not in git repo', async () => {
    const { executeHandoff } = await getModule();
    const { getCurrentRepoInfo } = await import('../lib/repo-scanner.js');

    vi.mocked(getCurrentRepoInfo).mockReturnValue(null);

    const result = await executeHandoff({
      summary: 'Test summary',
      status: 'done',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Not in a git repository');
  });

  it('includes issue number when provided', async () => {
    const { executeHandoff } = await getModule();
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js');

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo);
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    const result = await executeHandoff({
      summary: 'Working on issue',
      status: 'in_progress',
      issue_number: 42,
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain('#42');

    // Verify issue_number was passed to API
    const eodCall = mockFetch.mock.calls[1];
    const body = JSON.parse(eodCall[1].body);
    expect(body.issue_number).toBe(42);
  });

  it('handles API errors', async () => {
    const { executeHandoff } = await getModule();
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js');

    vi.mocked(getCurrentRepoInfo).mockReturnValue(mockRepoInfo);
    vi.mocked(findVentureByOrg).mockReturnValue(mockVentures[0]);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ventures: mockVentures }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

    const result = await executeHandoff({
      summary: 'Test summary',
      status: 'done',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to create handoff');
  });

  it('returns error for unknown org', async () => {
    const { executeHandoff } = await getModule();
    const { getCurrentRepoInfo, findVentureByOrg } = await import('../lib/repo-scanner.js');

    vi.mocked(getCurrentRepoInfo).mockReturnValue({
      org: 'unknownorg',
      repo: 'some-repo',
      branch: 'main',
    });
    vi.mocked(findVentureByOrg).mockReturnValue(null);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    });

    const result = await executeHandoff({
      summary: 'Test summary',
      status: 'done',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Unknown org');
  });
});
