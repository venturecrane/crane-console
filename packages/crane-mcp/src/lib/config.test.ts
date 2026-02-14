/**
 * Tests for environment configuration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getModule = async () => {
  vi.resetModules()
  return import('./config.js')
}

describe('config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('getCraneEnv', () => {
    it('defaults to prod when CRANE_ENV not set', async () => {
      delete process.env.CRANE_ENV
      const { getCraneEnv } = await getModule()
      expect(getCraneEnv()).toBe('prod')
    })

    it('returns prod when CRANE_ENV=prod', async () => {
      process.env.CRANE_ENV = 'prod'
      const { getCraneEnv } = await getModule()
      expect(getCraneEnv()).toBe('prod')
    })

    it('returns dev when CRANE_ENV=dev', async () => {
      process.env.CRANE_ENV = 'dev'
      const { getCraneEnv } = await getModule()
      expect(getCraneEnv()).toBe('dev')
    })

    it('is case-insensitive', async () => {
      process.env.CRANE_ENV = 'DEV'
      const { getCraneEnv } = await getModule()
      expect(getCraneEnv()).toBe('dev')
    })

    it('defaults to prod for unknown values', async () => {
      process.env.CRANE_ENV = 'staging'
      const { getCraneEnv } = await getModule()
      expect(getCraneEnv()).toBe('prod')
    })
  })

  describe('getApiBase', () => {
    it('returns production URL by default', async () => {
      delete process.env.CRANE_ENV
      const { getApiBase } = await getModule()
      expect(getApiBase()).toBe('https://crane-context.automation-ab6.workers.dev')
    })

    it('returns staging URL when CRANE_ENV=dev', async () => {
      process.env.CRANE_ENV = 'dev'
      const { getApiBase } = await getModule()
      expect(getApiBase()).toBe('https://crane-context-staging.automation-ab6.workers.dev')
    })
  })

  describe('API_BASE_PRODUCTION', () => {
    it('is always production URL regardless of CRANE_ENV', async () => {
      process.env.CRANE_ENV = 'dev'
      const { API_BASE_PRODUCTION } = await getModule()
      expect(API_BASE_PRODUCTION).toBe('https://crane-context.automation-ab6.workers.dev')
    })
  })

  describe('getEnvironmentName', () => {
    it('returns production by default', async () => {
      delete process.env.CRANE_ENV
      const { getEnvironmentName } = await getModule()
      expect(getEnvironmentName()).toBe('production')
    })

    it('returns staging when CRANE_ENV=dev', async () => {
      process.env.CRANE_ENV = 'dev'
      const { getEnvironmentName } = await getModule()
      expect(getEnvironmentName()).toBe('staging')
    })
  })

  describe('getStagingInfisicalPath', () => {
    it('returns /vc/staging for vc venture', async () => {
      const { getStagingInfisicalPath } = await getModule()
      expect(getStagingInfisicalPath('vc')).toBe('/vc/staging')
    })

    it('returns null for ke venture', async () => {
      const { getStagingInfisicalPath } = await getModule()
      expect(getStagingInfisicalPath('ke')).toBeNull()
    })

    it('returns null for sc venture', async () => {
      const { getStagingInfisicalPath } = await getModule()
      expect(getStagingInfisicalPath('sc')).toBeNull()
    })

    it('returns null for dfg venture', async () => {
      const { getStagingInfisicalPath } = await getModule()
      expect(getStagingInfisicalPath('dfg')).toBeNull()
    })
  })
})
