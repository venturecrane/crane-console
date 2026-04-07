/**
 * invoke() contract tests.
 *
 * Verifies the helper builds a real Request, calls the worker's fetch
 * handler with the right env, and returns the real Response. Uses a
 * minimal mock worker that echoes its input back.
 */

import { describe, it, expect } from 'vitest'
import { invoke, type WorkerEntry } from '../src/invoke.js'

interface TestEnv {
  TEST_KEY: string
}

/**
 * Echo worker: returns a JSON response describing what the request looked
 * like from the worker's perspective. Lets tests assert on what `invoke()`
 * actually built and passed in.
 */
const echoWorker: WorkerEntry<TestEnv> = {
  async fetch(request: Request, env: TestEnv): Promise<Response> {
    const url = new URL(request.url)
    let body: unknown = null
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const text = await request.text()
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = text
      }
    }
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      headers[key] = value
    })
    return new Response(
      JSON.stringify({
        method: request.method,
        path: url.pathname,
        search: url.search,
        headers,
        body,
        envKey: env.TEST_KEY,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'X-Test-Echo': 'true' },
      }
    )
  },
}

describe('invoke', () => {
  const env: TestEnv = { TEST_KEY: 'test-value' }

  it('calls worker.fetch and returns the real Response', async () => {
    const res = await invoke(echoWorker, { path: '/health', env })
    expect(res).toBeInstanceOf(Response)
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Test-Echo')).toBe('true')
  })

  it('defaults method to GET', async () => {
    const res = await invoke(echoWorker, { path: '/test', env })
    const body = (await res.json()) as { method: string }
    expect(body.method).toBe('GET')
  })

  it('passes the env through to the handler', async () => {
    const res = await invoke(echoWorker, { path: '/', env })
    const body = (await res.json()) as { envKey: string }
    expect(body.envKey).toBe('test-value')
  })

  it('JSON-serializes object bodies and sets Content-Type', async () => {
    const res = await invoke(echoWorker, {
      method: 'POST',
      path: '/items',
      body: { name: 'widget', count: 3 },
      env,
    })
    const body = (await res.json()) as {
      method: string
      headers: Record<string, string>
      body: unknown
    }
    expect(body.method).toBe('POST')
    expect(body.headers['content-type']).toBe('application/json')
    expect(body.body).toEqual({ name: 'widget', count: 3 })
  })

  it('preserves caller-provided Content-Type', async () => {
    const res = await invoke(echoWorker, {
      method: 'POST',
      path: '/',
      headers: { 'Content-Type': 'application/x-custom' },
      body: 'raw text payload',
      env,
    })
    const body = (await res.json()) as { headers: Record<string, string>; body: unknown }
    expect(body.headers['content-type']).toBe('application/x-custom')
    expect(body.body).toBe('raw text payload')
  })

  it('passes string bodies through unchanged', async () => {
    const res = await invoke(echoWorker, {
      method: 'POST',
      path: '/',
      body: 'plain string body',
      env,
    })
    const body = (await res.json()) as { body: unknown }
    expect(body.body).toBe('plain string body')
  })

  it('preserves query string in path', async () => {
    const res = await invoke(echoWorker, { path: '/search?q=hello&n=10', env })
    const body = (await res.json()) as { path: string; search: string }
    expect(body.path).toBe('/search')
    expect(body.search).toBe('?q=hello&n=10')
  })

  it('passes custom headers through', async () => {
    const res = await invoke(echoWorker, {
      path: '/auth',
      headers: { 'X-Relay-Key': 'secret-key', 'X-Idempotency-Key': 'idem-1' },
      env,
    })
    const body = (await res.json()) as { headers: Record<string, string> }
    expect(body.headers['x-relay-key']).toBe('secret-key')
    expect(body.headers['x-idempotency-key']).toBe('idem-1')
  })

  it('respects custom baseUrl', async () => {
    // Echo back the origin via a worker that exposes it
    const originWorker: WorkerEntry<TestEnv> = {
      async fetch(req) {
        const url = new URL(req.url)
        return new Response(url.origin, { status: 200 })
      },
    }
    const res = await invoke(originWorker, {
      path: '/test',
      baseUrl: 'https://example.test',
      env,
    })
    const text = await res.text()
    expect(text).toBe('https://example.test')
  })
})
