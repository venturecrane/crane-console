/**
 * Crane Watch Worker
 *
 * Webhook gateway for Venture Crane.
 * Receives GitHub App webhooks for issue QA classification and CI/CD event
 * forwarding, and Vercel webhooks for deployment failure notifications.
 */

import { BUILD_INFO } from './generated/build-info'

// ============================================================================
// TYPES
// ============================================================================

interface Env {
  DB: D1Database
  GH_APP_ID: string
  GH_INSTALLATIONS_JSON: string
  GH_PRIVATE_KEY_PEM: string
  GEMINI_API_KEY: string
  GH_WEBHOOK_SECRET: string
  CLASSIFIER_API_KEY?: string
  CONTEXT_RELAY_KEY?: string
  CRANE_CONTEXT_URL?: string
  CRANE_CONTEXT?: Fetcher
  VERCEL_WEBHOOK_SECRET?: string
  ENVIRONMENT?: string
}

// ============================================================================
// VERSION ENDPOINT (Plan v3.1 §D.1)
// ============================================================================

const COLD_START_AT = new Date().toISOString()

function handleVersion(env: Env): Response {
  const body = {
    service: BUILD_INFO.service,
    commit: BUILD_INFO.commit,
    commit_short: BUILD_INFO.commit_short,
    build_timestamp: BUILD_INFO.build_timestamp,
    deployed_at: COLD_START_AT,
    schema_hash: null,
    schema_version: null,
    migrations_applied: [] as string[],
    features_enabled: {} as Record<string, boolean>,
    environment: env.ENVIRONMENT || 'unknown',
  }
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface GradeIssueResult {
  grade: 'qa:0' | 'qa:1' | 'qa:2' | 'qa:3'
  confidence: number
  rationale: string
  signals: string[]
  test_required?: boolean
}

export interface IssuePayload {
  repo: string
  issue_number: number
  issue_node_id?: string
  title: string
  body: string
  labels: string[]
  url?: string
  updated_at: string
  sender: {
    login: string
    type: string
  }
  delivery_id: string
}

// ============================================================================
// PROMPTS
// ============================================================================

const CLASSIFY_PROMPT = {
  system: `You are a strict GitHub issue QA grader.

Your job: assign exactly one grade label for verification method:
- qa:0 = Automated only (CI/unit/integration tests cover it; no manual verification needed)
- qa:1 = CLI/API verifiable (curl/gh/DB queries; deterministic checks; no UI walkthrough)
- qa:2 = Light visual (single page/spot-check; minimal UI confirmation)
- qa:3 = Full visual (multi-step UI walkthrough, multiple states, flows, or regressions)

You also detect if the issue REQUIRES unit tests (test_required: true) when the issue IMPLEMENTS or MODIFIES:
- Calculation logic (formulas, algorithms, mathematical operations)
- Money/financial computations (balance calculations, fee calculations, margin calculations)
- Data transformation with numeric outputs (parsing prices, converting currencies)
- State machine transitions where correctness is critical

Do NOT set test_required for:
- UI/UX issues that merely DISPLAY financial data
- Issues about layout, styling, or visual design
- Documentation or process issues
- Issues that mention money terms but don't change calculation logic

Rules:
- Output MUST be valid JSON matching the provided schema.
- rationale must be <= 240 characters.
- signals must be lowercase snake_case-like tokens.
- test_required should be true if unit tests are needed to verify correctness.
- If Acceptance Criteria are missing or ambiguous, grade higher (qa:2 or qa:3) and include signal "missing_acceptance_criteria".`,

  userTemplate: (ctx: { title: string; labels: string; body: string; ac_extracted: string }) => {
    return `Issue Title:
${ctx.title}

Labels:
${ctx.labels}

Issue Body (verbatim):
${ctx.body}

Extracted Acceptance Criteria (best-effort):
${ctx.ac_extracted}

Task:
1. Choose qa:0/1/2/3 based on how the ACs can be verified.
2. Set test_required to true if this issue involves calculations, money, status transitions, or numerical logic that should have unit tests.

Return JSON only.`
  },
}

const PROMPT_VERSION = 'grade_issue_v3'

// ============================================================================
// TEST REQUIRED DETECTION (Narrow local patterns - supplement only)
// ============================================================================

// Only match very specific patterns that strongly indicate calculation logic
// Gemini is the primary detector; this catches obvious cases Gemini might miss
const TEST_REQUIRED_PATTERNS = [
  // Explicit calculation implementation
  /\b(implement|fix|update|change|modify).{0,30}(calculation|formula|algorithm)\b/i,
  // Specific financial calculation terms
  /\b(buyer\s*premium|margin\s*percent|balance\s*calculation|split\s*ratio\s*logic)\b/i,
  // Database schema changes for numerical fields
  /\b(amount_cents|price_cents|fee_schedule|margin_percent)\b/i,
  // Explicit test mentions
  /\b(unit\s+test|add\s+test|test\s+coverage|edge\s+case|rounding\s+error)\b/i,
  // Code file references suggesting calculation logic
  /\b(calculation-spine|money-math|calculateBalance|dollarsToCents)\b/i,
]

export function detectTestRequired(title: string, body: string): boolean {
  const content = `${title} ${body}`.toLowerCase()
  return TEST_REQUIRED_PATTERNS.some((pattern) => pattern.test(content))
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function nowIso(): string {
  return new Date().toISOString()
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', enc)
  const bytes = new Uint8Array(hash)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ============================================================================
// ACCEPTANCE CRITERIA EXTRACTION
// ============================================================================

export function extractAcceptanceCriteria(issueBody: string): { ac: string; signal?: string } {
  if (!issueBody || issueBody.trim().length === 0) {
    return { ac: '(missing)', signal: 'missing_acceptance_criteria' }
  }

  // Search for ## Acceptance Criteria heading (case-insensitive)
  const acHeaderMatch = issueBody.match(/^##\s+acceptance\s+criteria/im)

  if (acHeaderMatch) {
    const startIdx = acHeaderMatch.index! + acHeaderMatch[0].length
    // Extract until next ## heading or end of string
    const afterHeader = issueBody.slice(startIdx)
    const nextHeaderMatch = afterHeader.match(/^##\s+/m)
    const ac = nextHeaderMatch
      ? afterHeader.slice(0, nextHeaderMatch.index).trim()
      : afterHeader.trim()

    if (ac.length > 0) {
      return { ac: ac.slice(0, 8000) } // Truncate to 8KB max
    }
  }

  // Fallback: look for AC1, AC2 patterns
  const acPatternMatch = issueBody.match(/\b(AC\d+|AC \d+):.*?(?=\n\n|\n\s*AC\d+|$)/gis)
  if (acPatternMatch && acPatternMatch.length > 0) {
    const extracted = acPatternMatch.join('\n\n').trim()
    return { ac: extracted.slice(0, 8000) }
  }

  // No ACs found
  return { ac: '(missing)', signal: 'missing_acceptance_criteria' }
}

// ============================================================================
// SEMANTIC KEY COMPUTATION
// ============================================================================

export async function computeSemanticKey(
  repo: string,
  issueNumber: number,
  promptVersion: string,
  acText: string,
  labels: string[]
): Promise<string> {
  // Normalize AC text (lowercase, collapse whitespace)
  const normalizedAC = acText.toLowerCase().replace(/\s+/g, ' ').trim()

  // Only include status:* and component:* labels for semantic key
  const relevantLabels = labels
    .filter((l) => l.startsWith('status:') || l.startsWith('component:'))
    .sort()
    .join(',')

  const input = `${repo}#${issueNumber}|${promptVersion}|${normalizedAC}|${relevantLabels}`
  return sha256Hex(input)
}

// ============================================================================
// GITHUB SIGNATURE VALIDATION
// ============================================================================

export async function validateGitHubSignature(
  body: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) {
    return false
  }

  // GitHub sends signature as "sha256=<hash>"
  const expectedSig = signature.replace('sha256=', '')

  // Compute HMAC-SHA256
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const computedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  // Use timing-safe comparison to prevent side-channel attacks
  const a = encoder.encode(computedSig)
  const b = encoder.encode(expectedSig)
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b)
}

// ============================================================================
// GITHUB APP JWT CREATION
// ============================================================================

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array
  if (typeof input === 'string') bytes = new TextEncoder().encode(input)
  else bytes = input instanceof Uint8Array ? input : new Uint8Array(input)

  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
    .replace(/-----END RSA PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(clean)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const keyData = pemToArrayBuffer(pem)
  try {
    return await crypto.subtle.importKey(
      'pkcs8',
      keyData,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    )
  } catch {
    throw new Error("Failed to import private key. Ensure it's in PKCS8 format.")
  }
}

async function createAppJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iat: now - 30,
    exp: now + 9 * 60,
    iss: Number(env.GH_APP_ID),
  }

  const encodedHeader = b64url(JSON.stringify(header))
  const encodedPayload = b64url(JSON.stringify(payload))
  const toSign = `${encodedHeader}.${encodedPayload}`

  const key = await importPrivateKey(env.GH_PRIVATE_KEY_PEM)
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(toSign))
  const encodedSig = b64url(sig)

  return `${toSign}.${encodedSig}`
}

// ============================================================================
// GITHUB API FUNCTIONS
// ============================================================================

async function githubFetch(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const base = 'https://api.github.com'
  return fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'crane-watch',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function getInstallationToken(env: Env, repo: string): Promise<string> {
  const owner = repo.split('/')[0]
  const installations = JSON.parse(env.GH_INSTALLATIONS_JSON || '{}')
  const installationId = installations[owner]
  if (!installationId) {
    throw new Error(`No GitHub App installation found for org: ${owner}`)
  }

  const appJwt = await createAppJwt(env)
  const res = await githubFetch(
    appJwt,
    'POST',
    `/app/installations/${installationId}/access_tokens`
  )
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`GitHub installation token error: ${res.status} ${txt}`)
  }
  const data = (await res.json()) as { token: string }
  return data.token
}

async function addGitHubLabels(
  token: string,
  repo: string,
  issueNumber: number,
  labels: string[]
): Promise<void> {
  const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}/labels`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'crane-watch',
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({ labels }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`GitHub API ${response.status}: ${errorBody}`)
  }
}

// ============================================================================
// GEMINI API CLIENT
// ============================================================================

interface GeminiRequestPayload {
  contents: Array<{
    role: string
    parts: Array<{ text: string }>
  }>
  systemInstruction?: {
    parts: Array<{ text: string }>
  }
  generationConfig: {
    temperature: number
    responseMimeType: string
    responseSchema: unknown
  }
}

async function callGeminiFlash(
  env: Env,
  systemPrompt: string,
  userPrompt: string,
  responseSchema: unknown,
  timeoutMs: number
): Promise<{
  ok: boolean
  result?: GradeIssueResult
  raw?: string
  error?: string
  latency: number
}> {
  const startTime = Date.now()

  const requestPayload: GeminiRequestPayload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
    },
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY,
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      }
    )

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text()
      return {
        ok: false,
        error: `Gemini API ${response.status}: ${errorText}`,
        latency: Date.now() - startTime,
      }
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Try to parse JSON from response
    try {
      const parsed = JSON.parse(rawText) as GradeIssueResult
      return {
        ok: true,
        result: parsed,
        raw: rawText,
        latency: Date.now() - startTime,
      }
    } catch {
      return {
        ok: false,
        raw: rawText,
        error: 'Response not valid JSON',
        latency: Date.now() - startTime,
      }
    }
  } catch (err: unknown) {
    clearTimeout(timeoutId)

    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        error: 'MODEL_TIMEOUT',
        latency: Date.now() - startTime,
      }
    }

    return {
      ok: false,
      error: String(err instanceof Error ? err.message : err),
      latency: Date.now() - startTime,
    }
  }
}

// ============================================================================
// IDEMPOTENCY CHECK
// ============================================================================

async function checkIdempotency(
  env: Env,
  idempotencyKey: string
): Promise<{ exists: boolean; cached?: { grade?: string; confidence?: number } }> {
  const existing = await env.DB.prepare(
    'SELECT grade, confidence FROM classify_runs WHERE idempotency_key = ? LIMIT 1'
  )
    .bind(idempotencyKey)
    .first<{ grade?: string; confidence?: number }>()

  if (existing) {
    return { exists: true, cached: existing }
  }

  return { exists: false }
}

// ============================================================================
// SKIP CLASSIFICATION LOGIC
// ============================================================================

export function shouldSkipClassification(payload: IssuePayload): {
  skip: boolean
  reason?: string
} {
  // Rule 1: Skip if sender is bot
  if (payload.sender.type === 'Bot') {
    return { skip: true, reason: 'sender_is_bot' }
  }

  // Rule 2: Skip if issue already has qa:* label
  const hasQaLabel = payload.labels.some((l) => /^qa:\d$/.test(l))
  if (hasQaLabel) {
    return { skip: true, reason: 'already_has_qa_label' }
  }

  // Rule 3: Skip if issue has automation:graded label
  if (payload.labels.includes('automation:graded')) {
    return { skip: true, reason: 'already_graded' }
  }

  return { skip: false }
}

// ============================================================================
// CLASSIFY ISSUE
// ============================================================================

async function classifyIssue(
  env: Env,
  payload: IssuePayload
): Promise<{ ok: boolean; grade?: string; error?: string; actions: string[] }> {
  const startTime = Date.now()
  const idempotencyKey = `gh:delivery:${payload.delivery_id}`
  const actions: string[] = []

  // Check idempotency
  const idempCheck = await checkIdempotency(env, idempotencyKey)
  if (idempCheck.exists) {
    return {
      ok: true,
      grade: idempCheck.cached?.grade,
      error: undefined,
      actions: ['skipped:idempotency'],
    }
  }

  // Check skip conditions
  const skipCheck = shouldSkipClassification(payload)
  if (skipCheck.skip) {
    // Log skip
    await env.DB.prepare(
      `INSERT INTO classify_runs
       (id, created_at, repo, issue_number, idempotency_key, prompt_version,
        model, auto_apply, input_hash, valid_json, error_code, error_message, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        nowIso(),
        payload.repo,
        payload.issue_number,
        idempotencyKey,
        PROMPT_VERSION,
        'gemini-2.0-flash',
        1,
        '',
        0,
        'SKIPPED',
        skipCheck.reason,
        Date.now() - startTime
      )
      .run()

    return { ok: true, error: undefined, actions: [`skipped:${skipCheck.reason}`] }
  }

  // Extract ACs
  const { ac: acExtracted, signal: acSignal } = extractAcceptanceCriteria(payload.body)

  // Compute semantic key
  const semanticKey = await computeSemanticKey(
    payload.repo,
    payload.issue_number,
    PROMPT_VERSION,
    acExtracted,
    payload.labels
  )

  // Semantic idempotency check
  const semanticCheck = await env.DB.prepare(
    'SELECT grade, confidence FROM classify_runs WHERE semantic_key = ? AND valid_json = 1 ORDER BY created_at DESC LIMIT 1'
  )
    .bind(semanticKey)
    .first<{ grade?: string; confidence?: number }>()

  if (semanticCheck) {
    return {
      ok: true,
      grade: semanticCheck.grade,
      error: undefined,
      actions: ['skipped:semantic_idempotency'],
    }
  }

  // Prepare prompt
  const labelsStr = payload.labels.join(', ')
  const userPrompt = CLASSIFY_PROMPT.userTemplate({
    title: payload.title,
    labels: labelsStr,
    body: payload.body.slice(0, 8000),
    ac_extracted: acExtracted,
  })

  // Response schema
  const responseSchema = {
    type: 'object',
    properties: {
      grade: { type: 'string', enum: ['qa:0', 'qa:1', 'qa:2', 'qa:3'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      rationale: { type: 'string', maxLength: 240 },
      signals: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 12 },
      test_required: { type: 'boolean' },
    },
    required: ['grade', 'confidence', 'rationale', 'signals'],
  }

  // Call Gemini
  const geminiResult = await callGeminiFlash(
    env,
    CLASSIFY_PROMPT.system,
    userPrompt,
    responseSchema,
    20000
  )

  // Handle errors
  if (!geminiResult.ok) {
    await env.DB.prepare(
      `INSERT INTO classify_runs
       (id, created_at, repo, issue_number, idempotency_key, semantic_key, prompt_version,
        model, auto_apply, input_hash, ac_extracted, model_output_raw, valid_json,
        error_code, error_message, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        nowIso(),
        payload.repo,
        payload.issue_number,
        idempotencyKey,
        semanticKey,
        PROMPT_VERSION,
        'gemini-2.0-flash',
        1,
        await sha256Hex(userPrompt),
        acExtracted.slice(0, 8000),
        geminiResult.raw || '',
        0,
        geminiResult.error === 'MODEL_TIMEOUT' ? 'MODEL_TIMEOUT' : 'MODEL_ERROR',
        geminiResult.error || 'Unknown error',
        geminiResult.latency
      )
      .run()

    return { ok: false, error: geminiResult.error, actions: ['error:gemini'] }
  }

  const result = geminiResult.result!

  // Validate result
  if (!result.grade || !['qa:0', 'qa:1', 'qa:2', 'qa:3'].includes(result.grade)) {
    await env.DB.prepare(
      `INSERT INTO classify_runs
       (id, created_at, repo, issue_number, idempotency_key, semantic_key, prompt_version,
        model, auto_apply, input_hash, ac_extracted, model_output_raw, model_output_json,
        valid_json, error_code, error_message, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        nowIso(),
        payload.repo,
        payload.issue_number,
        idempotencyKey,
        semanticKey,
        PROMPT_VERSION,
        'gemini-2.0-flash',
        1,
        await sha256Hex(userPrompt),
        acExtracted.slice(0, 8000),
        geminiResult.raw || '',
        JSON.stringify(result),
        0,
        'INVALID_SCHEMA',
        'Result does not match schema',
        geminiResult.latency
      )
      .run()

    return { ok: false, error: 'Invalid model response', actions: ['error:invalid_schema'] }
  }

  // Add AC signal if present
  if (acSignal && !result.signals.includes(acSignal)) {
    result.signals.push(acSignal)
  }

  // Determine if test:required should be applied
  // Use Gemini's detection OR local pattern detection as fallback
  const testRequired = result.test_required || detectTestRequired(payload.title, payload.body)
  if (testRequired && !result.signals.includes('test_required')) {
    result.signals.push('test_required')
  }

  // Apply labels
  try {
    const ghToken = await getInstallationToken(env, payload.repo)
    const labelsToAdd = [result.grade, 'automation:graded']
    if (testRequired) {
      labelsToAdd.push('test:required')
    }
    await addGitHubLabels(ghToken, payload.repo, payload.issue_number, labelsToAdd)
    actions.push(`labeled:${result.grade}`)
    actions.push('labeled:automation:graded')
    if (testRequired) {
      actions.push('labeled:test:required')
    }
  } catch (labelErr) {
    actions.push(`error:label:${String(labelErr)}`)
  }

  // Log success
  await env.DB.prepare(
    `INSERT INTO classify_runs
     (id, created_at, repo, issue_number, idempotency_key, semantic_key, prompt_version,
      model, auto_apply, input_hash, ac_extracted, model_output_raw, model_output_json,
      valid_json, confidence, grade, actions_taken_json, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      crypto.randomUUID(),
      nowIso(),
      payload.repo,
      payload.issue_number,
      idempotencyKey,
      semanticKey,
      PROMPT_VERSION,
      'gemini-2.0-flash',
      1,
      await sha256Hex(userPrompt),
      acExtracted.slice(0, 8000),
      geminiResult.raw || '',
      JSON.stringify(result),
      1,
      result.confidence,
      result.grade,
      JSON.stringify(actions),
      geminiResult.latency
    )
    .run()

  return { ok: true, grade: result.grade, error: undefined, actions }
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

async function handleGitHubWebhook(
  req: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  // Validate signature
  const bodyText = await req.text()
  const signature = req.headers.get('X-Hub-Signature-256')

  const isValid = await validateGitHubSignature(bodyText, signature, env.GH_WEBHOOK_SECRET)
  if (!isValid) {
    console.error('Invalid webhook signature')
    return new Response('Invalid signature', { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(bodyText)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  // Short-circuit CI events before issue classification path
  const eventType = req.headers.get('X-GitHub-Event')
  if (eventType && CI_EVENT_TYPES.includes(eventType)) {
    const deliveryId = req.headers.get('X-GitHub-Delivery') || crypto.randomUUID()
    ctx.waitUntil(forwardToNotifications(env, 'github', eventType, deliveryId, payload))
    // Also feed the deploy-heartbeats observer for workflow_run events.
    // The two pipelines are independent — the heartbeats endpoint is
    // tolerant of unknown ventures and non-default branches.
    if (eventType === 'workflow_run') {
      ctx.waitUntil(forwardToDeployHeartbeats(env, 'workflow-run', payload))
    }
    return new Response('OK - CI event forwarded', { status: 200 })
  }

  // Push events feed the deploy-heartbeats commit-without-deploy detector.
  // We don't forward to notifications for pushes — only to heartbeats.
  if (eventType === 'push') {
    ctx.waitUntil(forwardToDeployHeartbeats(env, 'push', payload))
    return new Response('OK - push event forwarded', { status: 200 })
  }

  // Only handle issues events
  if (!payload.issue) {
    return new Response('OK - not an issue event', { status: 200 })
  }

  // Only handle opened action (per plan: grade on creation, not status:ready)
  if (payload.action !== 'opened') {
    return new Response('OK - not an opened action', { status: 200 })
  }

  const deliveryId = req.headers.get('X-GitHub-Delivery') || crypto.randomUUID()

  // Cast issue fields for classification
  const issue = payload.issue as {
    number: number
    node_id?: string
    title: string
    body?: string
    html_url?: string
    updated_at: string
    labels?: Array<string | { name: string }>
  }
  const repository = payload.repository as { full_name: string } | undefined
  const sender = payload.sender as { login: string; type?: string } | undefined

  // Extract labels
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map((l: string | { name: string }) => (typeof l === 'string' ? l : l.name))
    : []

  const issuePayload: IssuePayload = {
    repo: repository?.full_name || '',
    issue_number: issue.number,
    issue_node_id: issue.node_id,
    title: issue.title,
    body: issue.body || '',
    labels,
    url: issue.html_url,
    updated_at: issue.updated_at,
    sender: {
      login: sender?.login || 'unknown',
      type: sender?.type || 'User',
    },
    delivery_id: deliveryId,
  }

  // Classify the issue
  try {
    const result = await classifyIssue(env, issuePayload)

    if (result.ok) {
      return jsonResponse({
        ok: true,
        grade: result.grade,
        actions: result.actions,
      })
    } else {
      // Return 200 to GitHub even on error (don't block webhook)
      return jsonResponse({
        ok: false,
        error: result.error,
        actions: result.actions,
      })
    }
  } catch (err: unknown) {
    console.error('Classification error:', err)
    return new Response(`OK - error: ${err instanceof Error ? err.message : String(err)}`, {
      status: 200,
    })
  }
}

// ============================================================================
// REGRADE EXISTING ISSUES
// ============================================================================

interface RegradeRequest {
  repo: string
  issue_numbers?: number[] // Specific issues to regrade
  all_open?: boolean // Regrade all open issues
}

async function handleRegrade(req: Request, env: Env): Promise<Response> {
  // Validate API key
  const apiKey =
    req.headers.get('X-Classifier-Key') || req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!env.CLASSIFIER_API_KEY || apiKey !== env.CLASSIFIER_API_KEY) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let body: RegradeRequest
  try {
    body = (await req.json()) as RegradeRequest
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.repo) {
    return jsonResponse({ error: 'repo is required' }, 400)
  }

  const results: Array<{ issue: number; status: string; grade?: string; test_required?: boolean }> =
    []

  try {
    const ghToken = await getInstallationToken(env, body.repo)

    // Get issues to process
    let issueNumbers = body.issue_numbers || []

    if (body.all_open && issueNumbers.length === 0) {
      // Fetch all open issues from GitHub
      const listRes = await githubFetch(
        ghToken,
        'GET',
        `/repos/${body.repo}/issues?state=open&per_page=100`
      )
      if (!listRes.ok) {
        const txt = await listRes.text()
        return jsonResponse({ error: `GitHub API error: ${txt}` }, 500)
      }
      const issues = (await listRes.json()) as Array<{ number: number; pull_request?: unknown }>
      // Filter out PRs (they show up in issues endpoint)
      issueNumbers = issues.filter((i) => !i.pull_request).map((i) => i.number)
    }

    if (issueNumbers.length === 0) {
      return jsonResponse(
        { error: 'No issues to regrade. Provide issue_numbers or set all_open: true' },
        400
      )
    }

    // Process each issue
    for (const issueNum of issueNumbers) {
      try {
        // Fetch issue details
        const issueRes = await githubFetch(ghToken, 'GET', `/repos/${body.repo}/issues/${issueNum}`)
        if (!issueRes.ok) {
          results.push({ issue: issueNum, status: 'fetch_failed' })
          continue
        }

        const issueData = (await issueRes.json()) as {
          number: number
          node_id?: string
          title: string
          body?: string
          html_url?: string
          updated_at: string
          labels?: Array<string | { name: string }>
          user?: { login: string; type?: string }
        }

        const labels = Array.isArray(issueData.labels)
          ? issueData.labels.map((l) => (typeof l === 'string' ? l : l.name))
          : []

        // Remove existing qa:* and test:required labels before regrading
        const labelsToRemove = labels.filter(
          (l) => /^qa:\d$/.test(l) || l === 'test:required' || l === 'automation:graded'
        )
        if (labelsToRemove.length > 0) {
          for (const label of labelsToRemove) {
            try {
              await githubFetch(
                ghToken,
                'DELETE',
                `/repos/${body.repo}/issues/${issueNum}/labels/${encodeURIComponent(label)}`
              )
            } catch {
              // Ignore label removal errors
            }
          }
        }

        // Create payload for classification
        const payload: IssuePayload = {
          repo: body.repo,
          issue_number: issueNum,
          issue_node_id: issueData.node_id,
          title: issueData.title,
          body: issueData.body || '',
          labels: labels.filter((l) => !labelsToRemove.includes(l)),
          url: issueData.html_url,
          updated_at: issueData.updated_at,
          sender: {
            login: issueData.user?.login || 'unknown',
            type: issueData.user?.type || 'User',
          },
          delivery_id: `regrade:${body.repo}#${issueNum}:${Date.now()}`,
        }

        // Classify
        const classifyResult = await classifyIssue(env, payload)

        results.push({
          issue: issueNum,
          status: classifyResult.ok ? 'regraded' : 'error',
          grade: classifyResult.grade,
          test_required: classifyResult.actions.includes('labeled:test:required'),
        })
      } catch (err) {
        results.push({
          issue: issueNum,
          status: `error: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }

    return jsonResponse({
      ok: true,
      repo: body.repo,
      processed: results.length,
      results,
    })
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
}

// ============================================================================
// CI/CD NOTIFICATION FORWARDING
// ============================================================================

const CI_EVENT_TYPES = ['workflow_run', 'check_suite', 'check_run']

async function forwardToNotifications(
  env: Env,
  source: string,
  eventType: string,
  deliveryId: string,
  payload: unknown
): Promise<void> {
  const relayKey = env.CONTEXT_RELAY_KEY

  if (!relayKey) {
    console.error('CONTEXT_RELAY_KEY not configured, skipping notification forwarding')
    return
  }

  // Prefer Service Binding (direct Worker-to-Worker), fall back to public URL
  const fetcher = env.CRANE_CONTEXT || null
  const contextUrl = env.CRANE_CONTEXT_URL

  if (!fetcher && !contextUrl) {
    console.error(
      'Neither CRANE_CONTEXT service binding nor CRANE_CONTEXT_URL configured, skipping notification forwarding'
    )
    return
  }

  try {
    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': relayKey,
      },
      body: JSON.stringify({
        source,
        event_type: eventType,
        delivery_id: deliveryId,
        payload,
      }),
    }

    const response = fetcher
      ? await fetcher.fetch('https://crane-context/notifications/ingest', requestInit)
      : await fetch(`${contextUrl}/notifications/ingest`, requestInit)

    if (!response.ok) {
      const text = await response.text()
      console.error(`Notification forwarding failed: ${response.status} ${text}`)
    }
  } catch (err) {
    console.error('Notification forwarding error:', err)
  }
}

// ============================================================================
// DEPLOY HEARTBEAT FORWARDING
// ============================================================================
//
// Forwards `push` and `workflow_run.completed` events to the deploy-heartbeats
// observer endpoints in crane-context. The two pipelines are independent of
// notification forwarding: a push event has no notification side-effect, and
// a workflow_run produces both a notification (failure path) AND a heartbeat
// observation (success or failure).
//
// The endpoint is tolerant of unknown ventures and non-default branches —
// it returns 200 with `ignored: true` rather than erroring.

async function forwardToDeployHeartbeats(
  env: Env,
  kind: 'push' | 'workflow-run',
  payload: unknown
): Promise<void> {
  const relayKey = env.CONTEXT_RELAY_KEY
  if (!relayKey) {
    console.error('CONTEXT_RELAY_KEY not configured, skipping heartbeat forwarding')
    return
  }

  const fetcher = env.CRANE_CONTEXT || null
  const contextUrl = env.CRANE_CONTEXT_URL
  if (!fetcher && !contextUrl) {
    console.error(
      'Neither CRANE_CONTEXT service binding nor CRANE_CONTEXT_URL configured, skipping heartbeat forwarding'
    )
    return
  }

  const path =
    kind === 'push'
      ? '/deploy-heartbeats/observe-github-push'
      : '/deploy-heartbeats/observe-github-workflow-run'

  try {
    const requestInit: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Relay-Key': relayKey,
      },
      body: JSON.stringify(payload),
    }

    const response = fetcher
      ? await fetcher.fetch(`https://crane-context${path}`, requestInit)
      : await fetch(`${contextUrl}${path}`, requestInit)

    if (!response.ok) {
      const text = await response.text()
      console.error(`Heartbeat forwarding (${kind}) failed: ${response.status} ${text}`)
    }
  } catch (err) {
    console.error(`Heartbeat forwarding (${kind}) error:`, err)
  }
}

// ============================================================================
// VERCEL WEBHOOK HANDLER
// ============================================================================

async function validateVercelSignature(
  bodyText: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(bodyText))
  const computedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const a = encoder.encode(computedSig)
  const b = encoder.encode(signature)
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b)
}

async function handleVercelWebhook(
  req: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  if (!env.VERCEL_WEBHOOK_SECRET) {
    console.error('VERCEL_WEBHOOK_SECRET not configured')
    return new Response('Webhook secret not configured', { status: 500 })
  }

  const bodyText = await req.text()
  const signature = req.headers.get('x-vercel-signature')

  const isValid = await validateVercelSignature(bodyText, signature, env.VERCEL_WEBHOOK_SECRET)
  if (!isValid) {
    console.error('Invalid Vercel webhook signature')
    return new Response('Invalid signature', { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(bodyText)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const webhookType = payload.type as string
  if (!webhookType) {
    return new Response('OK - no event type', { status: 200 })
  }

  // Only forward deployment error/canceled events
  if (webhookType === 'deployment.error' || webhookType === 'deployment.canceled') {
    const deliveryId = req.headers.get('x-vercel-delivery') || crypto.randomUUID()
    ctx.waitUntil(
      forwardToNotifications(env, 'vercel', webhookType, deliveryId, payload.payload || payload)
    )
  }

  return jsonResponse({ ok: true, event: webhookType })
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

function handleHealth(): Response {
  return jsonResponse({
    status: 'healthy',
    service: 'crane-watch',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  })
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Health check
    if (url.pathname === '/health' && request.method === 'GET') {
      return handleHealth()
    }

    // Version endpoint (Plan v3.1 §D.1 — public, no auth)
    if (url.pathname === '/version' && request.method === 'GET') {
      return handleVersion(env)
    }

    // GitHub webhook
    if (url.pathname === '/webhooks/github' && request.method === 'POST') {
      return handleGitHubWebhook(request, env, ctx)
    }

    // Vercel webhook
    if (url.pathname === '/webhooks/vercel' && request.method === 'POST') {
      return handleVercelWebhook(request, env, ctx)
    }

    // Regrade existing issues
    if (url.pathname === '/regrade' && request.method === 'POST') {
      return handleRegrade(request, env)
    }

    // 404 for everything else
    return new Response('Not found', { status: 404 })
  },
}
