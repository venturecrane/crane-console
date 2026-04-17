import { describe, it, expect } from 'vitest'
import { ApiError, parseApiError } from './api-error.js'

function makeResponse(opts: { status: number; body: string; contentType?: string }): Response {
  return new Response(opts.body, {
    status: opts.status,
    headers: { 'Content-Type': opts.contentType ?? 'application/json' },
  })
}

describe('parseApiError', () => {
  it('extracts status, errorCode, correlation_id, and field errors from a validation_failed body', async () => {
    const res = makeResponse({
      status: 400,
      body: JSON.stringify({
        error: 'validation_failed',
        details: [
          {
            field: 'agent',
            message: 'Required, must match pattern: lowercase-alphanumeric-with-hyphens',
          },
        ],
        correlation_id: 'corr_abc-123',
      }),
    })
    const err = await parseApiError(res, '/sos')
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(400)
    expect(err.errorCode).toBe('validation_failed')
    expect(err.correlationId).toBe('corr_abc-123')
    expect(err.fieldErrors).toHaveLength(1)
    expect(err.fieldErrors[0].field).toBe('agent')
    expect(err.endpoint).toBe('/sos')
  })

  it('gracefully handles non-JSON response bodies', async () => {
    const res = makeResponse({
      status: 502,
      body: '<html>Bad Gateway</html>',
      contentType: 'text/html',
    })
    const err = await parseApiError(res, '/sos')
    expect(err.status).toBe(502)
    expect(err.errorCode).toBe('api_error')
    expect(err.correlationId).toBeUndefined()
    expect(err.fieldErrors).toEqual([])
    expect(err.responseBodySnippet).toContain('Bad Gateway')
  })

  it('limits field error count to 5 even when server returns more', async () => {
    const manyErrors = Array.from({ length: 20 }, (_, i) => ({
      field: `f${i}`,
      message: `msg${i}`,
    }))
    const res = makeResponse({
      status: 400,
      body: JSON.stringify({ error: 'validation_failed', details: manyErrors }),
    })
    const err = await parseApiError(res, '/eos')
    expect(err.fieldErrors).toHaveLength(5)
  })

  it('skips malformed detail entries without crashing', async () => {
    const res = makeResponse({
      status: 400,
      body: JSON.stringify({
        error: 'validation_failed',
        details: [
          { field: 'good', message: 'ok' },
          { no_field: true },
          null,
          'string',
          { field: 'also_good', message: 'ok2' },
        ],
      }),
    })
    const err = await parseApiError(res, '/sos')
    expect(err.fieldErrors).toHaveLength(2)
    expect(err.fieldErrors.map((f) => f.field)).toEqual(['good', 'also_good'])
  })
})

describe('ApiError.toToolMessage', () => {
  it('includes status, endpoint, correlation id, and field details', () => {
    const err = new ApiError({
      status: 400,
      errorCode: 'validation_failed',
      correlationId: 'corr_xyz',
      fieldErrors: [{ field: 'agent', message: 'bad shape' }],
      endpoint: '/sos',
      responseBodySnippet: '',
    })
    const msg = err.toToolMessage('crane-mcp-m16.local')
    expect(msg).toContain('HTTP 400')
    expect(msg).toContain('/sos')
    expect(msg).toContain('corr_xyz')
    expect(msg).toContain('validation_failed')
    expect(msg).toContain('"agent"')
    expect(msg).toContain('bad shape')
    expect(msg).toContain('"crane-mcp-m16.local"')
  })

  it('truncates server field messages to 200 chars', () => {
    const longMessage = 'x'.repeat(1000)
    const err = new ApiError({
      status: 400,
      errorCode: 'validation_failed',
      correlationId: 'corr_x',
      fieldErrors: [{ field: 'f', message: longMessage }],
      endpoint: '/sos',
      responseBodySnippet: '',
    })
    const msg = err.toToolMessage()
    const fieldLine = msg.split('\n').find((l) => l.includes('field "f"'))
    expect(fieldLine).toBeDefined()
    expect(fieldLine!.length).toBeLessThan(300)
    expect(fieldLine!.endsWith('…')).toBe(true)
  })

  it('omits the client-computed agent line when not provided', () => {
    const err = new ApiError({
      status: 400,
      errorCode: 'validation_failed',
      correlationId: undefined,
      fieldErrors: [{ field: 'f', message: 'm' }],
      endpoint: '/sos',
      responseBodySnippet: '',
    })
    const msg = err.toToolMessage()
    expect(msg).not.toContain('Client-computed agent')
    expect(msg).not.toContain('correlation_id')
  })

  it('falls back to the body snippet when there are no field errors', () => {
    const err = new ApiError({
      status: 500,
      errorCode: 'api_error',
      correlationId: 'corr_y',
      fieldErrors: [],
      endpoint: '/sos',
      responseBodySnippet: 'internal server error',
    })
    const msg = err.toToolMessage()
    expect(msg).toContain('internal server error')
  })
})
