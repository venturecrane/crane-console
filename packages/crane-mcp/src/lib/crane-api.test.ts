/**
 * Tests for crane-api.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mockVenturesResponse,
  mockVentures,
  mockSodResponse,
} from '../__fixtures__/api-responses.js';

// Reset modules to clear the cache between tests
const getModule = async () => {
  vi.resetModules();
  return import('./crane-api.js');
};

describe('crane-api', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('CraneApi.getVentures', () => {
    it('returns parsed venture list', async () => {
      const { CraneApi } = await getModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVenturesResponse,
      });

      const api = new CraneApi('test-api-key');
      const ventures = await api.getVentures();

      expect(ventures).toHaveLength(4);
      expect(ventures[0].code).toBe('vc');
      expect(ventures[0].name).toBe('Venture Crane');
      expect(ventures[0].org).toBe('venturecrane');
    });

    it('caches results on subsequent calls', async () => {
      const { CraneApi } = await getModule();

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockVenturesResponse,
      });

      const api = new CraneApi('test-api-key');

      // First call
      await api.getVentures();
      // Second call
      await api.getVentures();

      // fetch should only be called once due to caching
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('handles API errors', async () => {
      const { CraneApi } = await getModule();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const api = new CraneApi('test-api-key');

      await expect(api.getVentures()).rejects.toThrow('API error: 500');
    });
  });

  describe('CraneApi.startSession', () => {
    it('sends correct payload and headers', async () => {
      const { CraneApi } = await getModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponse,
      });

      const api = new CraneApi('test-api-key');
      await api.startSession({
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        agent: 'test-agent',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sod'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Relay-Key': 'test-api-key',
          }),
        })
      );

      // Verify body content
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.venture).toBe('vc');
      expect(body.repo).toBe('venturecrane/crane-console');
      expect(body.agent).toBe('test-agent');
      expect(body.schema_version).toBe('1.0');
    });

    it('includes X-Relay-Key header', async () => {
      const { CraneApi } = await getModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSodResponse,
      });

      const api = new CraneApi('my-secret-key');
      await api.startSession({
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        agent: 'test-agent',
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers['X-Relay-Key']).toBe('my-secret-key');
    });
  });

  describe('CraneApi.createHandoff', () => {
    it('posts handoff data correctly', async () => {
      const { CraneApi } = await getModule();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const api = new CraneApi('test-api-key');
      await api.createHandoff({
        venture: 'vc',
        repo: 'venturecrane/crane-console',
        agent: 'test-agent',
        summary: 'Completed work on feature X',
        status: 'done',
        issue_number: 42,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/eod'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Relay-Key': 'test-api-key',
          }),
        })
      );

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.venture).toBe('vc');
      expect(body.summary).toBe('Completed work on feature X');
      expect(body.status_label).toBe('done');
      expect(body.issue_number).toBe(42);
    });
  });
});
