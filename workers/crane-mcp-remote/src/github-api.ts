/**
 * GitHub REST API client for the MCP remote worker.
 *
 * Uses raw fetch() - no Octokit dependency. Designed for Cloudflare Workers
 * where bundle size matters and we only need a handful of endpoints.
 */

const OWNER_REPO_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

function validateOwnerRepo(value: string, field: string): void {
  if (!value || !OWNER_REPO_PATTERN.test(value)) {
    throw new Error(
      `Invalid ${field}: "${value}". Must match pattern: alphanumeric, hyphens, underscores, dots.`
    )
  }
}

export interface PaginatedResponse<T> {
  data: T
  total_count?: number
  page: number
  has_next_page: boolean
}

interface GitHubErrorBody {
  message?: string
  errors?: Array<{ message?: string; code?: string; field?: string }>
}

export class GitHubApiClient {
  private token: string
  private actorLogin: string

  constructor(token: string, actorLogin: string) {
    this.token = token
    this.actorLogin = actorLogin
  }

  get hasToken(): boolean {
    return this.token.length > 0
  }

  private async request<T>(
    method: string,
    path: string,
    opts?: {
      body?: Record<string, unknown>
      accept?: string
      params?: Record<string, string | number | undefined>
      rawText?: boolean
    }
  ): Promise<{ data: T; headers: Headers }> {
    if (!this.token) {
      throw new Error(
        'GitHub tools require reconnecting the crane MCP integration in claude.ai to enable repository access. Go to claude.ai Settings > Integrations, disconnect crane, then reconnect.'
      )
    }

    const url = new URL(path, 'https://api.github.com')
    if (opts?.params) {
      for (const [key, val] of Object.entries(opts.params)) {
        if (val !== undefined) url.searchParams.set(key, String(val))
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'crane-mcp-remote',
      Accept: opts?.accept || 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }

    const resp = await fetch(url.toString(), {
      method,
      headers,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
    })

    if (!resp.ok) {
      await this.handleError(resp)
    }

    if (opts?.rawText) {
      const text = await resp.text()
      return { data: text as unknown as T, headers: resp.headers }
    }

    const data = (await resp.json()) as T
    return { data, headers: resp.headers }
  }

  private async handleError(resp: Response): Promise<never> {
    const status = resp.status
    let body: GitHubErrorBody = {}
    try {
      body = (await resp.json()) as GitHubErrorBody
    } catch {
      // Body may not be JSON
    }

    if (status === 401) {
      throw new Error(
        'GitHub token is invalid or revoked. To fix: disconnect the crane MCP integration in claude.ai Settings > Integrations, then reconnect.'
      )
    }

    if (status === 403) {
      const rateLimitRemaining = resp.headers.get('x-ratelimit-remaining')
      const rateLimitReset = resp.headers.get('x-ratelimit-reset')

      if (rateLimitRemaining === '0' && rateLimitReset) {
        const resetDate = new Date(parseInt(rateLimitReset, 10) * 1000)
        throw new Error(`GitHub API rate limit exceeded. Resets at ${resetDate.toISOString()}.`)
      }

      throw new Error(
        `Permission denied. The GitHub App may not have access to this repository. ${body.message || ''}`
      )
    }

    if (status === 404) {
      throw new Error(
        `Not found. The repository may not exist or the GitHub App is not installed there. ${body.message || ''}`
      )
    }

    if (status === 422) {
      const details = body.errors?.map((e) => e.message || e.code).join(', ') || body.message
      throw new Error(`Invalid request: ${details || 'validation error'}`)
    }

    throw new Error(`GitHub API error ${status}: ${body.message || resp.statusText}`)
  }

  private parsePagination(headers: Headers, currentPage: number) {
    const link = headers.get('link') || ''
    const hasNext = link.includes('rel="next"')
    return { page: currentPage, has_next_page: hasNext }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Issues
  // ──────────────────────────────────────────────────────────────────────────

  async listIssues(
    owner: string,
    repo: string,
    params?: {
      state?: string
      labels?: string
      assignee?: string
      per_page?: number
      page?: number
    }
  ): Promise<PaginatedResponse<Array<Record<string, unknown>>>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const page = params?.page || 1
    const { data, headers } = await this.request<Array<Record<string, unknown>>>(
      'GET',
      `/repos/${owner}/${repo}/issues`,
      {
        params: {
          state: params?.state,
          labels: params?.labels,
          assignee: params?.assignee,
          per_page: params?.per_page || 30,
          page,
        },
      }
    )
    return { data, ...this.parsePagination(headers, page) }
  }

  async getIssue(owner: string, repo: string, number: number): Promise<Record<string, unknown>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const { data } = await this.request<Record<string, unknown>>(
      'GET',
      `/repos/${owner}/${repo}/issues/${number}`
    )
    return data
  }

  async getIssueComments(
    owner: string,
    repo: string,
    number: number,
    params?: { per_page?: number; page?: number }
  ): Promise<PaginatedResponse<Array<Record<string, unknown>>>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const page = params?.page || 1
    const { data, headers } = await this.request<Array<Record<string, unknown>>>(
      'GET',
      `/repos/${owner}/${repo}/issues/${number}/comments`,
      { params: { per_page: params?.per_page || 30, page } }
    )
    return { data, ...this.parsePagination(headers, page) }
  }

  async createIssue(
    owner: string,
    repo: string,
    params: {
      title: string
      body?: string
      labels?: string[]
      assignees?: string[]
    }
  ): Promise<Record<string, unknown>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const { data } = await this.request<Record<string, unknown>>(
      'POST',
      `/repos/${owner}/${repo}/issues`,
      { body: params }
    )
    return data
  }

  async updateIssue(
    owner: string,
    repo: string,
    number: number,
    params: {
      title?: string
      body?: string
      state?: string
      labels?: string[]
      assignees?: string[]
    }
  ): Promise<Record<string, unknown>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const { data } = await this.request<Record<string, unknown>>(
      'PATCH',
      `/repos/${owner}/${repo}/issues/${number}`,
      { body: params }
    )
    return data
  }

  async createComment(
    owner: string,
    repo: string,
    number: number,
    body: string
  ): Promise<Record<string, unknown>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const { data } = await this.request<Record<string, unknown>>(
      'POST',
      `/repos/${owner}/${repo}/issues/${number}/comments`,
      { body: { body } }
    )
    return data
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Pull Requests
  // ──────────────────────────────────────────────────────────────────────────

  async listPRs(
    owner: string,
    repo: string,
    params?: {
      state?: string
      head?: string
      base?: string
      per_page?: number
      page?: number
    }
  ): Promise<PaginatedResponse<Array<Record<string, unknown>>>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const page = params?.page || 1
    const { data, headers } = await this.request<Array<Record<string, unknown>>>(
      'GET',
      `/repos/${owner}/${repo}/pulls`,
      {
        params: {
          state: params?.state,
          head: params?.head,
          base: params?.base,
          per_page: params?.per_page || 30,
          page,
        },
      }
    )
    return { data, ...this.parsePagination(headers, page) }
  }

  async getPR(owner: string, repo: string, number: number): Promise<Record<string, unknown>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const { data } = await this.request<Record<string, unknown>>(
      'GET',
      `/repos/${owner}/${repo}/pulls/${number}`
    )
    return data
  }

  async getPRDiff(owner: string, repo: string, number: number): Promise<string> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const { data } = await this.request<string>('GET', `/repos/${owner}/${repo}/pulls/${number}`, {
      accept: 'application/vnd.github.diff',
      rawText: true,
    })
    return data
  }

  async getPRFiles(
    owner: string,
    repo: string,
    number: number,
    params?: { per_page?: number; page?: number }
  ): Promise<PaginatedResponse<Array<Record<string, unknown>>>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const page = params?.page || 1
    const { data, headers } = await this.request<Array<Record<string, unknown>>>(
      'GET',
      `/repos/${owner}/${repo}/pulls/${number}/files`,
      { params: { per_page: params?.per_page || 30, page } }
    )
    return { data, ...this.parsePagination(headers, page) }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Repository contents
  // ──────────────────────────────────────────────────────────────────────────

  async getFileContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<Record<string, unknown>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const { data } = await this.request<Record<string, unknown>>(
      'GET',
      `/repos/${owner}/${repo}/contents/${path}`,
      { params: { ref } }
    )
    return data
  }

  async listDirectory(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<Array<Record<string, unknown>>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const { data } = await this.request<Array<Record<string, unknown>>>(
      'GET',
      `/repos/${owner}/${repo}/contents/${path}`,
      { params: { ref } }
    )
    return data
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Code search
  // ──────────────────────────────────────────────────────────────────────────

  async searchCode(
    query: string,
    qualifiers?: { owner?: string; repo?: string }
  ): Promise<{ total_count: number; items: Array<Record<string, unknown>> }> {
    let q = query
    if (qualifiers?.repo) {
      q += ` repo:${qualifiers.repo}`
    } else if (qualifiers?.owner) {
      q += ` org:${qualifiers.owner}`
    } else {
      q += ' org:venturecrane'
    }

    const { data } = await this.request<{
      total_count: number
      items: Array<Record<string, unknown>>
    }>('GET', '/search/code', { params: { q, per_page: 30 } })
    return data
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────────────────────────────────────

  async listWorkflowRuns(
    owner: string,
    repo: string,
    params?: {
      branch?: string
      status?: string
      per_page?: number
      page?: number
    }
  ): Promise<PaginatedResponse<Array<Record<string, unknown>>>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const page = params?.page || 1
    const { data, headers } = await this.request<{
      total_count: number
      workflow_runs: Array<Record<string, unknown>>
    }>('GET', `/repos/${owner}/${repo}/actions/runs`, {
      params: {
        branch: params?.branch,
        status: params?.status,
        per_page: params?.per_page || 30,
        page,
      },
    })
    return {
      data: data.workflow_runs,
      total_count: data.total_count,
      ...this.parsePagination(headers, page),
    }
  }

  async getWorkflowRun(
    owner: string,
    repo: string,
    runId: number
  ): Promise<Record<string, unknown>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const { data } = await this.request<Record<string, unknown>>(
      'GET',
      `/repos/${owner}/${repo}/actions/runs/${runId}`
    )
    return data
  }

  async listRunJobs(
    owner: string,
    repo: string,
    runId: number
  ): Promise<Array<Record<string, unknown>>> {
    validateOwnerRepo(owner, 'owner')
    validateOwnerRepo(repo, 'repo')
    const { data } = await this.request<{
      total_count: number
      jobs: Array<Record<string, unknown>>
    }>('GET', `/repos/${owner}/${repo}/actions/runs/${runId}/jobs`)
    return data.jobs
  }

  // ──────────────────────────────────────────────────────────────────────────
  // User / diagnostics
  // ──────────────────────────────────────────────────────────────────────────

  async getAuthenticatedUser(): Promise<{
    user: Record<string, unknown>
    scopes: string
    rateLimit: { remaining: string; limit: string; reset: string }
  }> {
    const { data, headers } = await this.request<Record<string, unknown>>('GET', '/user')
    return {
      user: data,
      scopes: headers.get('x-oauth-scopes') || 'unknown',
      rateLimit: {
        remaining: headers.get('x-ratelimit-remaining') || 'unknown',
        limit: headers.get('x-ratelimit-limit') || 'unknown',
        reset: headers.get('x-ratelimit-reset') || 'unknown',
      },
    }
  }
}
