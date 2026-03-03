/**
 * Tests for notifications.ts tools (crane_notifications / crane_notification_update)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getModule = async () => {
  vi.resetModules()
  return import('./notifications.js')
}

describe('crane_notifications tool', () => {
  const originalEnv = process.env
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env = { ...originalEnv, CRANE_CONTEXT_KEY: 'test-key' }

    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('lists notifications with table formatting', async () => {
    const { executeNotifications } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [
          {
            id: 'notif_01ABC',
            source: 'github',
            event_type: 'workflow_run.failure',
            severity: 'critical',
            status: 'new',
            summary: 'CI #42 failure on main (venturecrane/crane-console)',
            details_json: '{}',
            venture: 'vc',
            repo: 'venturecrane/crane-console',
            branch: 'main',
            created_at: new Date(Date.now() - 3600000).toISOString(),
            received_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        pagination: {},
      }),
    })

    const result = await executeNotifications({})

    expect(result.success).toBe(true)
    expect(result.message).toContain('CI/CD Notifications')
    expect(result.message).toContain('CRIT')
    expect(result.message).toContain('github')
    expect(result.message).toContain('notif_01ABC')
  })

  it('shows empty message when no notifications', async () => {
    const { executeNotifications } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [],
        pagination: {},
      }),
    })

    const result = await executeNotifications({ status: 'new' })

    expect(result.success).toBe(true)
    expect(result.message).toContain('No notifications found')
    expect(result.message).toContain('status=new')
  })

  it('returns error when API key missing', async () => {
    process.env = { ...originalEnv }
    delete process.env.CRANE_CONTEXT_KEY

    const { executeNotifications } = await getModule()

    const result = await executeNotifications({})

    expect(result.success).toBe(false)
    expect(result.message).toContain('CRANE_CONTEXT_KEY')
  })

  it('passes filter params to API', async () => {
    const { executeNotifications } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [], pagination: {} }),
    })

    await executeNotifications({
      status: 'new',
      severity: 'critical',
      venture: 'vc',
      source: 'github',
    })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('status=new')
    expect(url).toContain('severity=critical')
    expect(url).toContain('venture=vc')
    expect(url).toContain('source=github')
  })
})

describe('crane_notification_update tool', () => {
  const originalEnv = process.env
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    process.env = { ...originalEnv, CRANE_CONTEXT_KEY: 'test-key' }

    mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('updates notification status to acked', async () => {
    const { executeNotificationUpdate } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notification: {
          id: 'notif_01ABC',
          status: 'acked',
          summary: 'CI #42 failure on main',
        },
      }),
    })

    const result = await executeNotificationUpdate({
      id: 'notif_01ABC',
      status: 'acked',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('acked')
    expect(result.message).toContain('notif_01ABC')
  })

  it('updates notification status to resolved', async () => {
    const { executeNotificationUpdate } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notification: {
          id: 'notif_01ABC',
          status: 'resolved',
          summary: 'Vercel deployment failed',
        },
      }),
    })

    const result = await executeNotificationUpdate({
      id: 'notif_01ABC',
      status: 'resolved',
    })

    expect(result.success).toBe(true)
    expect(result.message).toContain('resolved')
  })

  it('handles API errors gracefully', async () => {
    const { executeNotificationUpdate } = await getModule()

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: async () => 'Invalid state transition',
    })

    const result = await executeNotificationUpdate({
      id: 'notif_01ABC',
      status: 'acked',
    })

    expect(result.success).toBe(false)
    expect(result.message).toContain('Failed')
  })
})
