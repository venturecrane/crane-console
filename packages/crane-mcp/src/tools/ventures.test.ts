/**
 * Tests for ventures.ts tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockVentures } from '../__fixtures__/api-responses.js';
import { mockLocalRepos } from '../__fixtures__/repo-fixtures.js';

vi.mock('../lib/repo-scanner.js');

const getModule = async () => {
  vi.resetModules();
  return import('./ventures.js');
};

describe('ventures tool', () => {
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

  it('lists all ventures with paths', async () => {
    const { executeVentures } = await getModule();
    const { scanLocalRepos } = await import('../lib/repo-scanner.js');

    vi.mocked(scanLocalRepos).mockReturnValue(mockLocalRepos);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    });

    const result = await executeVentures({});

    expect(result.ventures).toHaveLength(4);
    expect(result.ventures[0].code).toBe('vc');
    expect(result.ventures[0].name).toBe('Venture Crane');
  });

  it('shows installed status when repo found', async () => {
    const { executeVentures } = await getModule();
    const { scanLocalRepos } = await import('../lib/repo-scanner.js');

    vi.mocked(scanLocalRepos).mockReturnValue(mockLocalRepos);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    });

    const result = await executeVentures({});

    // venturecrane is in mockLocalRepos
    const vcVenture = result.ventures.find((v) => v.code === 'vc');
    expect(vcVenture?.installed).toBe(true);
    expect(vcVenture?.local_path).toBe('/Users/testuser/dev/crane-console');
  });

  it('shows not installed status when repo not found', async () => {
    const { executeVentures } = await getModule();
    const { scanLocalRepos } = await import('../lib/repo-scanner.js');

    vi.mocked(scanLocalRepos).mockReturnValue(mockLocalRepos);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ventures: mockVentures }),
    });

    const result = await executeVentures({});

    // durganfieldguide is NOT in mockLocalRepos
    const dfgVenture = result.ventures.find((v) => v.code === 'dfg');
    expect(dfgVenture?.installed).toBe(false);
    expect(dfgVenture?.local_path).toBeNull();
  });

  it('handles API errors', async () => {
    const { executeVentures } = await getModule();

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await executeVentures({});

    expect(result.ventures).toHaveLength(0);
    expect(result.message).toContain('Failed to fetch ventures');
  });

  it('returns error when API key missing', async () => {
    const { executeVentures } = await getModule();

    delete process.env.CRANE_CONTEXT_KEY;

    const result = await executeVentures({});

    expect(result.ventures).toHaveLength(0);
    expect(result.message).toContain('CRANE_CONTEXT_KEY not found');
  });
});
