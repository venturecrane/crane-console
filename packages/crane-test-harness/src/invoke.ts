/**
 * HTTP invoker for Cloudflare Workers.
 *
 * Builds a real `Request` object from a small options bag and dispatches it
 * directly into a worker's exported `fetch(request, env)` handler. Returns
 * the real `Response` object so tests can use the standard Web API surface
 * (`response.status`, `await response.json()`, `response.headers.get(...)`).
 *
 * Deliberately NOT a wrapper. Tests should not need to learn a custom API.
 *
 * Note on `ExecutionContext` (`ctx`): this helper does NOT pass a `ctx`
 * argument to `fetch()`. Workers that call `ctx.waitUntil(...)` for
 * fire-and-forget work cannot be tested through this invoker until a `ctx`
 * shim is added (see D1_SEMANTIC_DIFFERENCES.md). Crane-context's worker
 * does not use `ctx` at all, so the omission is safe for the first
 * adopters.
 */

export interface InvokeOptions<TEnv> {
  /** HTTP method. Defaults to 'GET'. */
  method?: string
  /** Path including query string, e.g. '/sos' or '/active?venture=vc'. */
  path: string
  /** Optional headers. Content-Type is set automatically for JSON bodies. */
  headers?: Record<string, string>
  /**
   * Optional request body. Plain objects are JSON-serialized and the
   * Content-Type header is set to 'application/json' unless the caller
   * already provided one. Strings and Uint8Array bodies pass through.
   */
  body?: unknown
  /**
   * The env object to pass to the worker's fetch handler. The caller is
   * responsible for constructing this with whatever bindings (D1, KV,
   * secrets, env vars) the worker expects.
   */
  env: TEnv
  /**
   * Base URL the path is resolved against. Defaults to a deterministic
   * test URL. Override only if a worker handler inspects request URL
   * components beyond the path.
   */
  baseUrl?: string
}

/**
 * A worker entry that exports a fetch handler. Matches the shape of
 * `export default { fetch: ... }` from a Cloudflare Workers source file.
 */
export interface WorkerEntry<TEnv> {
  fetch(request: Request, env: TEnv): Promise<Response> | Response
}

/**
 * Dispatch a request into a worker's `fetch` handler.
 *
 * @example
 * ```ts
 * import worker from '../../src/index'
 * const res = await invoke(worker, {
 *   method: 'POST',
 *   path: '/sos',
 *   headers: { 'X-Relay-Key': 'test-key' },
 *   body: { agent: 'cc-cli', venture: 'vc', repo: 'a/b' },
 *   env,
 * })
 * expect(res.status).toBe(200)
 * ```
 */
export async function invoke<TEnv>(
  worker: WorkerEntry<TEnv>,
  opts: InvokeOptions<TEnv>
): Promise<Response> {
  const baseUrl = opts.baseUrl ?? 'http://test.local'
  const url = new URL(opts.path, baseUrl)
  const headers = new Headers(opts.headers ?? {})

  let body: BodyInit | undefined
  if (opts.body !== undefined && opts.body !== null) {
    if (typeof opts.body === 'string') {
      body = opts.body
    } else if (opts.body instanceof Uint8Array) {
      // Cast through BodyInit: TS's BodyInit narrows ArrayBufferLike in some
      // versions but the runtime accepts Uint8Array directly.
      body = opts.body as unknown as BodyInit
    } else if (opts.body instanceof FormData || opts.body instanceof URLSearchParams) {
      body = opts.body
    } else {
      // Plain object → JSON
      body = JSON.stringify(opts.body)
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json')
      }
    }
  }

  const request = new Request(url, {
    method: opts.method ?? 'GET',
    headers,
    body,
  })

  return await worker.fetch(request, opts.env)
}
