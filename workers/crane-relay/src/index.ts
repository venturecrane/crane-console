/**
 * Crane Relay Worker
 *
 * Enables PM Team to create GitHub issues via HTTP POST.
 * Eliminates copy-paste handoffs between Claude Web and GitHub.
 *
 * Multi-repo support: All endpoints accept an optional `repo` parameter.
 * If not provided, defaults to GITHUB_OWNER/GITHUB_REPO from env.
 */

interface Env {
  // V1 bindings
  GITHUB_TOKEN: string;
  RELAY_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;

  // V2 bindings
  DB: D1Database;
  EVIDENCE_BUCKET: R2Bucket;
  RELAY_SHARED_SECRET: string;
  GH_APP_ID: string;
  GH_INSTALLATIONS_JSON: string;
  GH_PRIVATE_KEY_PEM: string;
  LABEL_RULES_JSON: string;
  GH_API_BASE?: string;
  GEMINI_API_KEY: string;
  GH_WEBHOOK_SECRET?: string;
}

interface DirectivePayload {
  to: 'dev' | 'qa' | 'pm';
  title: string;
  labels: string[];
  body: string;
  assignees?: string[];
  repo?: string; // Optional: defaults to GITHUB_OWNER/GITHUB_REPO
}

interface CommentPayload {
  issue: number;
  body: string;
  repo?: string; // Optional: defaults to GITHUB_OWNER/GITHUB_REPO
}

interface ClosePayload {
  issue: number;
  comment?: string;
  repo?: string; // Optional: defaults to GITHUB_OWNER/GITHUB_REPO
}

interface LabelsPayload {
  issue: number;
  add?: string[];
  remove?: string[];
  repo?: string; // Optional: defaults to GITHUB_OWNER/GITHUB_REPO
}

interface MergePayload {
  repo: string;  // Required: must specify repo for merge operations
  pr: number;    // Required: PR number to merge
  merge_method?: 'squash' | 'merge' | 'rebase';  // Optional: defaults to 'squash'
  commit_title?: string;    // Optional: custom merge commit title
  commit_message?: string;  // Optional: custom merge commit message
}

interface GitHubIssueResponse {
  number: number;
  html_url: string;
  title: string;
}

// ============================================================================
// V2 TYPES
// ============================================================================

type Verdict = "PASS" | "FAIL" | "BLOCKED" | "PASS_UNVERIFIED" | "FAIL_UNCONFIRMED" | "PASS_PENDING_APPROVAL";
type Role = "QA" | "DEV" | "PM" | "MENTOR";
type ScopeResult = { id: string; status: "PASS" | "FAIL" | "SKIPPED"; notes?: string };
type RelayEvent = {
  event_id: string;
  repo: string;
  issue_number: number;
  role: Role;
  agent: string;
  event_type: string;
  summary?: string;
  environment?: "preview" | "production" | "dev";
  build?: { pr?: number; commit_sha: string };
  overall_verdict?: Verdict;
  scope_results?: ScopeResult[];
  severity?: "P0" | "P1" | "P2" | "P3";
  repro_steps?: string;
  expected?: string;
  actual?: string;
  evidence_urls?: string[];
  artifacts?: Array<{ type: string; label?: string; href: string }>;
  details?: unknown;
};
type LabelRule = { add?: string[]; remove?: string[] };
type LabelRules = Record<string, Record<string, LabelRule>>;

// ============================================================================
// GEMINI CLASSIFICATION TYPES (Phase 1)
// ============================================================================

interface GradeIssueRequest {
  task: "grade_issue";
  idempotency_key: string;
  prompt_version: string;
  auto_apply: boolean;
  payload: {
    repo: string;
    issue_number: number;
    issue_node_id?: string;
    title: string;
    body: string;
    labels: string[];
    url?: string;
    updated_at: string;
    sender: {
      login: string;
      type: string;
    };
    event: {
      name: string;
      action: string;
      delivery: string;
    };
  };
}

interface GradeIssueResult {
  grade: "qa:0" | "qa:1" | "qa:2" | "qa:3";
  confidence: number;
  rationale: string;
  signals: string[];
}

interface GradeIssueResponse {
  ok: boolean;
  task: "grade_issue";
  idempotency_key: string;
  result?: GradeIssueResult;
  actions_taken: Array<{
    type: string;
    target?: string;
    status: "success" | "skipped" | "failed";
    reason?: string;
  }>;
  meta: {
    model: string;
    auth_path: "gemini_developer_api";
    prompt_version: string;
    latency_ms: number;
    input_chars: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// V2 CONSTANTS
// ============================================================================

const RELAY_STATUS_MARKER = "<!-- RELAY_STATUS v2 -->";

// ============================================================================
// GEMINI CLASSIFICATION PROMPTS
// ============================================================================

const CLASSIFY_PROMPTS: Record<string, { system: string; userTemplate: (ctx: any) => string }> = {
  grade_issue_v1: {
    system: `You are a strict GitHub issue QA grader.

Your job: assign exactly one grade label for verification method:
- qa:0 = Automated only (CI/unit/integration tests cover it; no manual verification needed)
- qa:1 = CLI/API verifiable (curl/gh/DB queries; deterministic checks; no UI walkthrough)
- qa:2 = Light visual (single page/spot-check; minimal UI confirmation)
- qa:3 = Full visual (multi-step UI walkthrough, multiple states, flows, or regressions)

Rules:
- Output MUST be valid JSON matching the provided schema.
- rationale must be <= 240 characters.
- signals must be lowercase snake_case-like tokens.
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
Choose qa:0/1/2/3 based on how the ACs can be verified.

Return JSON only.`;
    }
  }
};

// ============================================================================
// V2 UTILITY FUNCTIONS
// ============================================================================

function v2Json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function badRequest(message: string, details?: unknown) {
  return v2Json({ error: message, details }, 400);
}

function conflict(message: string, details?: unknown) {
  return v2Json({ error: message, details }, 409);
}

function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

function nowIso() {
  return new Date().toISOString();
}

function requireAuth(req: Request, env: Env): Response | null {
  const key = req.headers.get("x-relay-key");
  if (!key || key !== env.RELAY_SHARED_SECRET) return unauthorized();
  return null;
}

function isHexSha(s: string) {
  return /^[0-9a-f]{7,40}$/i.test(s);
}

function isRepoSlug(s: string) {
  return /^[^/]+\/[^/]+$/.test(s);
}

function safeInt(x: unknown): number | null {
  const n = typeof x === "string" ? Number(x) : (typeof x === "number" ? x : NaN);
  return Number.isFinite(n) ? n : null;
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate repo format and return error response if invalid
 * Returns null if validation passes
 */
function validateRepoFormat(repo?: string): Response | null {
  if (repo && !isRepoSlug(repo)) {
    return jsonResponse({
      success: false,
      error: "Invalid repo format. Must be 'owner/repo'"
    }, 400);
  }
  return null;
}

/**
 * Get default repo from env or use provided repo
 * Assumes repo has already been validated via validateRepoFormat()
 */
function getRepo(env: Env, providedRepo?: string): string {
  if (providedRepo && isRepoSlug(providedRepo)) {
    return providedRepo;
  }
  return `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
}

// CORS configuration (#98)
const ALLOWED_ORIGINS = [
  'https://app.durganfieldguide.com',
  'https://durganfieldguide.com',
  'https://core.durganfieldguide.com',
  'https://crane-command.vercel.app',
  'http://localhost:3000',
];

function getCorsOrigin(request: Request): string {
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

// Store request for CORS in responses
let currentRequest: Request | null = null;

// ============================================================================
// ACCEPTANCE CRITERIA EXTRACTION
// ============================================================================

function extractAcceptanceCriteria(issueBody: string): { ac: string; signal?: string } {
  if (!issueBody || issueBody.trim().length === 0) {
    return { ac: "(missing)", signal: "missing_acceptance_criteria" };
  }

  // Search for ## Acceptance Criteria heading (case-insensitive)
  const acHeaderMatch = issueBody.match(/^##\s+acceptance\s+criteria/im);

  if (acHeaderMatch) {
    const startIdx = acHeaderMatch.index! + acHeaderMatch[0].length;
    // Extract until next ## heading or end of string
    const afterHeader = issueBody.slice(startIdx);
    const nextHeaderMatch = afterHeader.match(/^##\s+/m);
    const ac = nextHeaderMatch
      ? afterHeader.slice(0, nextHeaderMatch.index).trim()
      : afterHeader.trim();

    if (ac.length > 0) {
      return { ac: ac.slice(0, 8000) }; // Truncate to 8KB max
    }
  }

  // Fallback: look for AC1, AC2 patterns
  const acPatternMatch = issueBody.match(/\b(AC\d+|AC \d+):.*?(?=\n\n|\n\s*AC\d+|$)/gis);
  if (acPatternMatch && acPatternMatch.length > 0) {
    const extracted = acPatternMatch.join("\n\n").trim();
    return { ac: extracted.slice(0, 8000) };
  }

  // No ACs found
  return { ac: "(missing)", signal: "missing_acceptance_criteria" };
}

// ============================================================================
// GEMINI API CLIENT
// ============================================================================

interface GeminiRequestPayload {
  contents: Array<{
    role: string;
    parts: Array<{ text: string }>;
  }>;
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
  generationConfig: {
    temperature: number;
    responseMimeType: string;
    responseSchema: any;
  };
}

async function callGeminiFlash(
  env: Env,
  systemPrompt: string,
  userPrompt: string,
  responseSchema: any,
  timeoutMs: number
): Promise<{ ok: boolean; result?: any; raw?: string; error?: string; latency: number }> {
  const startTime = Date.now();

  const requestPayload: GeminiRequestPayload = {
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }]
      }
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: responseSchema
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        error: `Gemini API ${response.status}: ${errorText}`,
        latency: Date.now() - startTime
      };
    }

    const data = await response.json() as any;
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Try to parse JSON from response
    try {
      const parsed = JSON.parse(rawText);
      return {
        ok: true,
        result: parsed,
        raw: rawText,
        latency: Date.now() - startTime
      };
    } catch {
      return {
        ok: false,
        raw: rawText,
        error: "Response not valid JSON",
        latency: Date.now() - startTime
      };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);

    if (err.name === "AbortError") {
      return {
        ok: false,
        error: "MODEL_TIMEOUT",
        latency: Date.now() - startTime
      };
    }

    return {
      ok: false,
      error: String(err?.message || err),
      latency: Date.now() - startTime
    };
  }
}

// ============================================================================
// CLASSIFICATION IDEMPOTENCY & LOOP PREVENTION
// ============================================================================

async function checkIdempotency(
  env: Env,
  idempotencyKey: string
): Promise<{ exists: boolean; cached?: any }> {
  const existing = await env.DB.prepare(
    "SELECT * FROM classify_runs WHERE idempotency_key = ? LIMIT 1"
  ).bind(idempotencyKey).first<any>();

  if (existing) {
    return {
      exists: true,
      cached: {
        ok: existing.valid_json === 1,
        task: "grade_issue",
        idempotency_key: idempotencyKey,
        result: existing.model_output_json ? JSON.parse(existing.model_output_json) : undefined,
        actions_taken: existing.actions_taken_json ? JSON.parse(existing.actions_taken_json) : [],
        meta: {
          model: existing.model,
          auth_path: existing.auth_path,
          prompt_version: existing.prompt_version,
          latency_ms: existing.latency_ms,
          input_chars: 0
        },
        error: existing.error_code ? {
          code: existing.error_code,
          message: existing.error_message
        } : undefined
      }
    };
  }

  return { exists: false };
}

function shouldSkipClassification(payload: GradeIssueRequest["payload"]): { skip: boolean; reason?: string } {
  // Rule 1: Skip if sender is bot (future-proofing)
  if (payload.sender.type === "Bot") {
    return { skip: true, reason: "sender_is_bot" };
  }

  // Rule 2: Skip if event is adding a qa:* or automation:graded label
  if (payload.event.action === "labeled") {
    const lastLabel = payload.labels[payload.labels.length - 1];
    if (lastLabel && (lastLabel.match(/^qa:\d$/) || lastLabel.startsWith("automation:graded"))) {
      return { skip: true, reason: "loop_prevention_qa_label_added" };
    }
  }

  // Rule 3: Skip if issue already has qa:* label
  const hasQaLabel = payload.labels.some(l => l.match(/^qa:\d$/));
  if (hasQaLabel) {
    return { skip: true, reason: "already_has_qa_label" };
  }

  // Rule 4: Skip if not status:ready
  const hasStatusReady = payload.labels.some(l => l === "status:ready");
  if (!hasStatusReady) {
    return { skip: true, reason: "not_status_ready" };
  }

  return { skip: false };
}

function computeSemanticKey(
  repo: string,
  issueNumber: number,
  promptVersion: string,
  acText: string,
  labels: string[]
): Promise<string> {
  // Normalize AC text (lowercase, collapse whitespace)
  const normalizedAC = acText.toLowerCase().replace(/\s+/g, " ").trim();

  // Only include status:* and component:* labels for semantic key
  const relevantLabels = labels
    .filter(l => l.startsWith("status:") || l.startsWith("component:"))
    .sort()
    .join(",");

  const input = `${repo}#${issueNumber}|${promptVersion}|${normalizedAC}|${relevantLabels}`;
  return sha256Hex(input);
}

// ============================================================================
// CLASSIFICATION REQUEST VALIDATION
// ============================================================================

function validateClassifyRequest(payload: any): { ok: true; request: GradeIssueRequest } | { ok: false; message: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, message: "Body must be JSON object" };
  }

  if (payload.task !== "grade_issue") {
    return { ok: false, message: "task must be 'grade_issue'" };
  }

  const idempotencyKey = String(payload.idempotency_key || "").trim();
  if (!idempotencyKey || idempotencyKey.length < 10 || idempotencyKey.length > 200) {
    return { ok: false, message: "idempotency_key must be 10-200 characters" };
  }

  const promptVersion = String(payload.prompt_version || "").trim();
  if (!promptVersion.match(/^grade_issue_v\d+$/)) {
    return { ok: false, message: "prompt_version must match pattern: grade_issue_v{number}" };
  }

  if (typeof payload.auto_apply !== "boolean") {
    return { ok: false, message: "auto_apply must be boolean" };
  }

  if (!payload.payload || typeof payload.payload !== "object") {
    return { ok: false, message: "payload object required" };
  }

  const p = payload.payload;

  if (!p.repo || !isRepoSlug(p.repo)) {
    return { ok: false, message: "payload.repo must be 'org/repo'" };
  }

  const issueNumber = safeInt(p.issue_number);
  if (!issueNumber || issueNumber < 1) {
    return { ok: false, message: "payload.issue_number must be positive integer" };
  }

  if (!p.title || String(p.title).trim().length === 0) {
    return { ok: false, message: "payload.title required" };
  }

  if (!p.body || typeof p.body !== "string") {
    return { ok: false, message: "payload.body required" };
  }

  if (!Array.isArray(p.labels)) {
    return { ok: false, message: "payload.labels must be array" };
  }

  if (!p.sender || !p.sender.login) {
    return { ok: false, message: "payload.sender.login required" };
  }

  if (!p.event || !p.event.name || !p.event.action || !p.event.delivery) {
    return { ok: false, message: "payload.event requires: name, action, delivery" };
  }

  return { ok: true, request: payload as GradeIssueRequest };
}

// ============================================================================
// COMMENT FORMATTING
// ============================================================================

function formatSuggestComment(result: GradeIssueResult, promptVersion: string): string {
  const signalsFormatted = result.signals.map(s => `\`${s}\``).join(", ");

  return [
    `## Gemini grade suggestion (\`${promptVersion}\`)`,
    "",
    `- **Proposed:** \`${result.grade}\` (confidence ${result.confidence.toFixed(2)})`,
    `- **Rationale:** ${result.rationale}`,
    `- **Signals:** ${signalsFormatted}`,
    "",
    "---",
    "",
    "If you agree, apply the \`qa:*\` label. If not, apply the correct \`qa:*\` label.",
    "",
    "_This is a calibration suggestion. Auto-apply is not yet enabled._"
  ].join("\n");
}

// ============================================================================
// GITHUB WEBHOOK SIGNATURE VALIDATION
// ============================================================================

async function validateGitHubSignature(
  body: string,
  signature: string | null,
  secret: string | undefined
): Promise<boolean> {
  if (!signature || !secret) {
    return false;
  }

  // GitHub sends signature as "sha256=<hash>"
  const expectedSig = signature.replace("sha256=", "");

  // Compute HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computedSig = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return computedSig === expectedSig;
}

function formatIssuePayloadForClassify(ghPayload: any): GradeIssueRequest["payload"] {
  const issue = ghPayload.issue;
  const labels = Array.isArray(issue.labels)
    ? issue.labels.map((l: any) => (typeof l === "string" ? l : l.name))
    : [];

  return {
    repo: ghPayload.repository.full_name,
    issue_number: issue.number,
    issue_node_id: issue.node_id,
    title: issue.title,
    body: issue.body || "",
    labels,
    url: issue.html_url,
    updated_at: issue.updated_at,
    sender: {
      login: ghPayload.sender.login,
      type: ghPayload.sender.type || "User"
    },
    event: {
      name: "issues",
      action: ghPayload.action,
      delivery: "" // Will be set by handler from header
    }
  };
}

// ============================================================================
// GITHUB WEBHOOK HANDLER
// ============================================================================

async function handleGitHubWebhook(
  req: Request,
  env: Env,
  getGhToken: (repo: string) => Promise<string>
): Promise<Response> {
  // Validate signature
  const bodyText = await req.text();
  const signature = req.headers.get("X-Hub-Signature-256");

  if (env.GH_WEBHOOK_SECRET) {
    const isValid = await validateGitHubSignature(bodyText, signature, env.GH_WEBHOOK_SECRET);
    if (!isValid) {
      return new Response("Invalid signature", { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Only handle issues events
  if (!payload.issue) {
    return new Response("OK - not an issue event", { status: 200 });
  }

  // Only handle labeled action with status:ready
  if (payload.action !== "labeled") {
    return new Response("OK - not a labeled action", { status: 200 });
  }

  const labelAdded = payload.label?.name;
  if (labelAdded !== "status:ready") {
    return new Response("OK - not status:ready label", { status: 200 });
  }

  // Format payload for classify endpoint
  const issuePayload = formatIssuePayloadForClassify(payload);

  // Add delivery ID to event
  const deliveryId = req.headers.get("X-GitHub-Delivery") || crypto.randomUUID();
  issuePayload.event.delivery = deliveryId;

  // Check loop prevention before calling classify
  const skipCheck = shouldSkipClassification(issuePayload);
  if (skipCheck.skip) {
    return new Response(`OK - skipped: ${skipCheck.reason}`, { status: 200 });
  }

  // Build classify request
  const classifyRequest: GradeIssueRequest = {
    task: "grade_issue",
    idempotency_key: `gh:delivery:${deliveryId}`,
    prompt_version: "grade_issue_v1",
    auto_apply: true, // Enabled: Gemini API with billing configured
    payload: issuePayload
  };

  // Create internal request object for handleClassify
  const classifyReq = new Request(req.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-relay-key": env.RELAY_SHARED_SECRET
    },
    body: JSON.stringify(classifyRequest)
  });

  // Call classify handler
  try {
    const result = await handleClassify(classifyReq, env, getGhToken);
    return result;
  } catch (err: any) {
    console.error("Webhook classify error:", err);
    return new Response(`OK - classify failed: ${err.message}`, { status: 200 });
  }
}

// ============================================================================
// /v2/classify ENDPOINT HANDLER
// ============================================================================

async function handleClassify(
  req: Request,
  env: Env,
  getGhToken: (repo: string) => Promise<string>
): Promise<Response> {
  const startTime = Date.now();

  // Auth check
  const authErr = requireAuth(req, env);
  if (authErr) return authErr;

  // Parse payload
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  // Validate request structure
  const validated = validateClassifyRequest(payload);
  if (!validated.ok) {
    return badRequest(validated.message);
  }

  const request = validated.request;

  // Delivery idempotency check
  const idempotencyCheck = await checkIdempotency(env, request.idempotency_key);
  if (idempotencyCheck.exists) {
    return v2Json(idempotencyCheck.cached);
  }

  // Loop prevention
  const skipCheck = shouldSkipClassification(request.payload);
  if (skipCheck.skip) {
    // Log skip to D1
    await env.DB.prepare(
      `INSERT INTO classify_runs
       (id, created_at, task, repo, issue_number, idempotency_key, prompt_version,
        model, auth_path, auto_apply, input_hash, valid_json, error_code, error_message, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      nowIso(),
      "grade_issue",
      request.payload.repo,
      request.payload.issue_number,
      request.idempotency_key,
      request.prompt_version,
      "gemini-2.0-flash",
      "gemini_developer_api",
      request.auto_apply ? 1 : 0,
      "",
      0,
      "SKIPPED",
      skipCheck.reason,
      Date.now() - startTime
    ).run();

    return v2Json({
      ok: true,
      task: "grade_issue",
      idempotency_key: request.idempotency_key,
      actions_taken: [{
        type: "classify",
        status: "skipped",
        reason: skipCheck.reason
      }],
      meta: {
        model: "gemini-2.0-flash",
        auth_path: "gemini_developer_api",
        prompt_version: request.prompt_version,
        latency_ms: Date.now() - startTime,
        input_chars: 0
      }
    });
  }

  // Extract ACs
  const { ac: acExtracted, signal: acSignal } = extractAcceptanceCriteria(request.payload.body);

  // Compute semantic key
  const semanticKey = await computeSemanticKey(
    request.payload.repo,
    request.payload.issue_number,
    request.prompt_version,
    acExtracted,
    request.payload.labels
  );

  // Semantic idempotency check
  const semanticCheck = await env.DB.prepare(
    "SELECT * FROM classify_runs WHERE semantic_key = ? AND valid_json = 1 ORDER BY created_at DESC LIMIT 1"
  ).bind(semanticKey).first<any>();

  if (semanticCheck) {
    // Return cached semantic result
    return v2Json({
      ok: true,
      task: "grade_issue",
      idempotency_key: request.idempotency_key,
      result: semanticCheck.model_output_json ? JSON.parse(semanticCheck.model_output_json) : undefined,
      actions_taken: [{
        type: "classify",
        status: "skipped",
        reason: "semantic_idempotency"
      }],
      meta: {
        model: semanticCheck.model,
        auth_path: semanticCheck.auth_path,
        prompt_version: semanticCheck.prompt_version,
        latency_ms: Date.now() - startTime,
        input_chars: request.payload.body.length
      }
    });
  }

  // Get prompt template
  const promptTemplate = CLASSIFY_PROMPTS[request.prompt_version];
  if (!promptTemplate) {
    return badRequest(`Unknown prompt_version: ${request.prompt_version}`);
  }

  // Prepare prompt context
  const labelsStr = request.payload.labels.join(", ");
  const userPrompt = promptTemplate.userTemplate({
    title: request.payload.title,
    labels: labelsStr,
    body: request.payload.body.slice(0, 8000), // Truncate to 8KB
    ac_extracted: acExtracted
  });

  // Define response schema for JSON Mode
  const responseSchema = {
    type: "object",
    properties: {
      grade: { type: "string", enum: ["qa:0", "qa:1", "qa:2", "qa:3"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      rationale: { type: "string", maxLength: 240 },
      signals: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 }
    },
    required: ["grade", "confidence", "rationale", "signals"]
  };

  // Call Gemini API
  const geminiResult = await callGeminiFlash(
    env,
    promptTemplate.system,
    userPrompt,
    responseSchema,
    6000 // 6 second timeout
  );

  // Handle timeout specifically
  if (geminiResult.error === "MODEL_TIMEOUT") {
    // Log to D1
    await env.DB.prepare(
      `INSERT INTO classify_runs
       (id, created_at, task, repo, issue_number, idempotency_key, semantic_key, prompt_version,
        model, auth_path, auto_apply, input_hash, ac_extracted, valid_json, error_code, error_message, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      nowIso(),
      "grade_issue",
      request.payload.repo,
      request.payload.issue_number,
      request.idempotency_key,
      semanticKey,
      request.prompt_version,
      "gemini-2.0-flash",
      "gemini_developer_api",
      request.auto_apply ? 1 : 0,
      await sha256Hex(userPrompt),
      acExtracted.slice(0, 8000),
      0,
      "MODEL_TIMEOUT",
      "Gemini API timeout after 6 seconds",
      geminiResult.latency
    ).run();

    // Post comment on issue
    try {
      const ghToken = await getGhToken(request.payload.repo);
      const commentBody = `⚠️ **Automated QA grading failed**\n\nThe Gemini classification API timed out. Please manually assign a \`qa:*\` label to this issue.\n\n_Idempotency key: \`${request.idempotency_key}\`_`;
      await createIssueComment(env, ghToken, request.payload.repo, request.payload.issue_number, commentBody);
    } catch (commentErr) {
      console.error("Failed to post timeout comment:", commentErr);
    }

    // Return 200 to GitHub (don't block webhook)
    return v2Json({
      ok: false,
      task: "grade_issue",
      idempotency_key: request.idempotency_key,
      actions_taken: [{
        type: "comment",
        status: "success",
        reason: "timeout_notification"
      }],
      meta: {
        model: "gemini-2.0-flash",
        auth_path: "gemini_developer_api",
        prompt_version: request.prompt_version,
        latency_ms: geminiResult.latency,
        input_chars: userPrompt.length
      },
      error: {
        code: "MODEL_TIMEOUT",
        message: "Gemini API timeout"
      }
    });
  }

  // Handle other Gemini errors (fail closed)
  if (!geminiResult.ok) {
    await env.DB.prepare(
      `INSERT INTO classify_runs
       (id, created_at, task, repo, issue_number, idempotency_key, semantic_key, prompt_version,
        model, auth_path, auto_apply, input_hash, ac_extracted, model_output_raw, valid_json,
        error_code, error_message, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      nowIso(),
      "grade_issue",
      request.payload.repo,
      request.payload.issue_number,
      request.idempotency_key,
      semanticKey,
      request.prompt_version,
      "gemini-2.0-flash",
      "gemini_developer_api",
      request.auto_apply ? 1 : 0,
      await sha256Hex(userPrompt),
      acExtracted.slice(0, 8000),
      geminiResult.raw || "",
      0,
      "MODEL_ERROR",
      geminiResult.error || "Unknown error",
      geminiResult.latency
    ).run();

    return v2Json({
      ok: false,
      task: "grade_issue",
      idempotency_key: request.idempotency_key,
      actions_taken: [],
      meta: {
        model: "gemini-2.0-flash",
        auth_path: "gemini_developer_api",
        prompt_version: request.prompt_version,
        latency_ms: geminiResult.latency,
        input_chars: userPrompt.length
      },
      error: {
        code: "MODEL_ERROR",
        message: geminiResult.error || "Gemini API failed"
      }
    });
  }

  // Validate result schema
  const result = geminiResult.result as GradeIssueResult;
  if (!result.grade || !["qa:0", "qa:1", "qa:2", "qa:3"].includes(result.grade)) {
    // Schema validation failed
    await env.DB.prepare(
      `INSERT INTO classify_runs
       (id, created_at, task, repo, issue_number, idempotency_key, semantic_key, prompt_version,
        model, auth_path, auto_apply, input_hash, ac_extracted, model_output_raw, model_output_json,
        valid_json, error_code, error_message, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      nowIso(),
      "grade_issue",
      request.payload.repo,
      request.payload.issue_number,
      request.idempotency_key,
      semanticKey,
      request.prompt_version,
      "gemini-2.0-flash",
      "gemini_developer_api",
      request.auto_apply ? 1 : 0,
      await sha256Hex(userPrompt),
      acExtracted.slice(0, 8000),
      geminiResult.raw || "",
      JSON.stringify(result),
      0,
      "INVALID_SCHEMA",
      "Result does not match GradeIssueResult schema",
      geminiResult.latency
    ).run();

    return v2Json({
      ok: false,
      task: "grade_issue",
      idempotency_key: request.idempotency_key,
      actions_taken: [],
      meta: {
        model: "gemini-2.0-flash",
        auth_path: "gemini_developer_api",
        prompt_version: request.prompt_version,
        latency_ms: geminiResult.latency,
        input_chars: userPrompt.length
      },
      error: {
        code: "INVALID_SCHEMA",
        message: "Result schema validation failed"
      }
    });
  }

  // Validate rationale length
  if (result.rationale && result.rationale.length > 240) {
    await env.DB.prepare(
      `INSERT INTO classify_runs
       (id, created_at, task, repo, issue_number, idempotency_key, semantic_key, prompt_version,
        model, auth_path, auto_apply, input_hash, ac_extracted, model_output_raw, model_output_json,
        valid_json, error_code, error_message, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      nowIso(),
      "grade_issue",
      request.payload.repo,
      request.payload.issue_number,
      request.idempotency_key,
      semanticKey,
      request.prompt_version,
      "gemini-2.0-flash",
      "gemini_developer_api",
      request.auto_apply ? 1 : 0,
      await sha256Hex(userPrompt),
      acExtracted.slice(0, 8000),
      geminiResult.raw || "",
      JSON.stringify(result),
      0,
      "RATIONALE_TOO_LONG",
      `Rationale exceeds 240 chars: ${result.rationale.length}`,
      geminiResult.latency
    ).run();

    return v2Json({
      ok: false,
      task: "grade_issue",
      idempotency_key: request.idempotency_key,
      actions_taken: [],
      meta: {
        model: "gemini-2.0-flash",
        auth_path: "gemini_developer_api",
        prompt_version: request.prompt_version,
        latency_ms: geminiResult.latency,
        input_chars: userPrompt.length
      },
      error: {
        code: "RATIONALE_TOO_LONG",
        message: `Rationale exceeds 240 characters (${result.rationale.length})`
      }
    });
  }

  // SUCCESS - classification complete

  // Add AC signal if present
  if (acSignal) {
    if (!result.signals.includes(acSignal)) {
      result.signals.push(acSignal);
    }
  }

  const actionsTaken: Array<any> = [];

  // Suggest-only mode or auto-apply mode
  if (!request.auto_apply) {
    // Post suggest-only comment
    try {
      const ghToken = await getGhToken(request.payload.repo);
      const commentBody = formatSuggestComment(result, request.prompt_version);
      await createIssueComment(env, ghToken, request.payload.repo, request.payload.issue_number, commentBody);

      actionsTaken.push({
        type: "comment",
        target: `${request.payload.repo}#${request.payload.issue_number}`,
        status: "success",
        reason: "suggest_only_mode"
      });
    } catch (commentErr) {
      actionsTaken.push({
        type: "comment",
        status: "failed",
        reason: String(commentErr)
      });
    }
  } else {
    // Auto-apply mode: add qa:* label and automation:graded label
    try {
      const ghToken = await getGhToken(request.payload.repo);
      const labelsToAdd = [result.grade, "automation:graded"];
      await addGitHubLabels(env, ghToken, request.payload.repo, request.payload.issue_number, labelsToAdd);

      actionsTaken.push({
        type: "label",
        target: `${request.payload.repo}#${request.payload.issue_number}`,
        labels: labelsToAdd,
        status: "success"
      });
    } catch (labelErr) {
      actionsTaken.push({
        type: "label",
        status: "failed",
        reason: String(labelErr)
      });
    }
  }

  // Log to D1
  await env.DB.prepare(
    `INSERT INTO classify_runs
     (id, created_at, task, repo, issue_number, idempotency_key, semantic_key, prompt_version,
      model, auth_path, auto_apply, input_hash, ac_extracted, model_output_raw, model_output_json,
      valid_json, confidence, grade, actions_taken_json, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    nowIso(),
    "grade_issue",
    request.payload.repo,
    request.payload.issue_number,
    request.idempotency_key,
    semanticKey,
    request.prompt_version,
    "gemini-2.0-flash",
    "gemini_developer_api",
    request.auto_apply ? 1 : 0,
    await sha256Hex(userPrompt),
    acExtracted.slice(0, 8000),
    geminiResult.raw || "",
    JSON.stringify(result),
    1,
    result.confidence,
    result.grade,
    JSON.stringify(actionsTaken),
    geminiResult.latency
  ).run();

  return v2Json({
    ok: true,
    task: "grade_issue",
    idempotency_key: request.idempotency_key,
    result,
    actions_taken: actionsTaken,
    meta: {
      model: "gemini-2.0-flash",
      auth_path: "gemini_developer_api",
      prompt_version: request.prompt_version,
      latency_ms: geminiResult.latency,
      input_chars: userPrompt.length
    }
  }, 201);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    currentRequest = request;

    // Request-lifecycle cache for GitHub tokens (V2) - keyed by org
    const ghTokenCache: Record<string, Promise<string>> = {};
    const getGhToken = (repo: string) => {
      const org = repo.split("/")[0];
      if (!ghTokenCache[org]) {
        ghTokenCache[org] = getInstallationToken(env, repo);
      }
      return ghTokenCache[org];
    };

    // CORS headers for preflight (#98: restricted origins)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': getCorsOrigin(request),
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Relay-Key',
        },
      });
    }

    // V2 ROUTES (processed before V1 routes)
    if (request.method === "POST" && url.pathname === "/v2/events") {
      try {
        return await handlePostEvents(request, env, getGhToken);
      } catch (err: any) {
        return v2Json({ error: "Internal error", details: String(err?.message || err) }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/v2/evidence") {
      try {
        return await handleEvidenceUpload(request, env);
      } catch (err: any) {
        return v2Json({ error: "Internal error", details: String(err?.message || err) }, 500);
      }
    }

    if (request.method === "GET" && url.pathname.startsWith("/v2/evidence/")) {
      const id = url.pathname.replace("/v2/evidence/", "").trim();
      if (!id) return badRequest("Missing evidence id");
      try {
        return await handleEvidenceGet(request, env, id);
      } catch (err: any) {
        return v2Json({ error: "Internal error", details: String(err?.message || err) }, 500);
      }
    }

    if (request.method === "GET" && url.pathname === "/v2/approval-queue") {
      try {
        return await handleGetApprovalQueue(request, env);
      } catch (err: any) {
        return v2Json({ error: "Internal error", details: String(err?.message || err) }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/v2/approve") {
      try {
        return await handleApprove(request, env, getGhToken);
      } catch (err: any) {
        return v2Json({ error: "Internal error", details: String(err?.message || err) }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/v2/classify") {
      try {
        return await handleClassify(request, env, getGhToken);
      } catch (err: any) {
        return v2Json({ error: "Internal error", details: String(err?.message || err) }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/webhooks/github") {
      try {
        return await handleGitHubWebhook(request, env, getGhToken);
      } catch (err: any) {
        console.error("Webhook handler error:", err);
        return new Response(`OK - error: ${err.message}`, { status: 200 });
      }
    }

    // V1 ROUTE HANDLING (existing endpoints)
    switch (url.pathname) {
      case '/health':
        return handleHealth();

      case '/directive':
        return handleDirective(request, env, getGhToken);

      case '/comment':
        return handleComment(request, env, getGhToken);

      case '/close':
        return handleClose(request, env, getGhToken);

      case '/labels':
        return handleLabels(request, env, getGhToken);

      case '/merge':
        return handleMerge(request, env, getGhToken);

      default:
        return jsonResponse({ error: 'Not found' }, 404);
    }
  },
};

/**
 * Health check endpoint
 */
function handleHealth(): Response {
  return jsonResponse({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
}

/**
 * Create GitHub issue from directive
 */
async function handleDirective(request: Request, env: Env, getGhToken: (repo: string) => Promise<string>): Promise<Response> {
  // Method check
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  // Auth check
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.RELAY_TOKEN}`) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  // Parse payload
  let payload: DirectivePayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }

  // Validate repo format
  const repoError = validateRepoFormat(payload.repo);
  if (repoError) return repoError;

  // Validate required fields
  if (!payload.title || !payload.body || !payload.to) {
    return jsonResponse({
      success: false,
      error: 'Missing required fields: title, body, to'
    }, 400);
  }

  // Get repo (with default)
  const repo = getRepo(env, payload.repo);

  // Build issue body with metadata header
  const issueBody = buildIssueBody(payload);

  // Create GitHub issue
  try {
    const ghToken = await getGhToken(repo);
    const issue = await createGitHubIssue(env, ghToken, repo, {
      title: payload.title,
      body: issueBody,
      labels: payload.labels || [],
      assignees: payload.assignees || [],
    });

    return jsonResponse({
      success: true,
      issue: issue.number,
      url: issue.html_url,
      repo,
    });
  } catch (error) {
    console.error('GitHub API error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'GitHub API failed',
    }, 500);
  }
}

/**
 * Build issue body with metadata header, planning requirement, and suggested commands (#164, #166)
 */
function buildIssueBody(payload: DirectivePayload): string {
  const header = [
    '<!-- Crane Relay: Auto-generated issue -->',
    `**Routed to:** ${payload.to.toUpperCase()} Team`,
    `**Created:** ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ].join('\n');

  const planningSection = requiresPlanning(payload.labels)
    ? '\n\n---\n\n### Planning Required\n\n⚠️ **This issue requires planning before implementation.**\n\nRun `/project:plan` to create an implementation plan before starting work.\n\n'
    : '';

  const suggestedCommands = getSuggestedCommands(payload.labels);
  const commandsSection = suggestedCommands.length > 0
    ? '\n\n---\n\n### Suggested Commands\n\n' + suggestedCommands.join('\n') + '\n'
    : '';

  return header + payload.body + planningSection + commandsSection;
}

/**
 * Check if issue requires planning based on labels (#166)
 * Planning required if: points >= 3 OR prio:P0
 */
function requiresPlanning(labels: string[]): boolean {
  for (const label of labels) {
    // Check for prio:P0
    if (label === 'prio:P0') {
      return true;
    }

    // Check for points >= 3
    const pointsMatch = label.match(/^points:(\d+)$/);
    if (pointsMatch) {
      const points = parseInt(pointsMatch[1], 10);
      if (points >= 3) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get suggested commands based on labels (#164)
 */
function getSuggestedCommands(labels: string[]): string[] {
  const commands: string[] = [];

  for (const label of labels) {
    if (label === 'component:dfg-relay') {
      commands.push('```bash\ncd workers/dfg-relay\nnpx wrangler deploy\n```');
    } else if (label === 'component:dfg-api') {
      commands.push('```bash\ncd workers/dfg-api\nnpm run test\nnpx tsc --noEmit\nnpx wrangler deploy\n```');
    } else if (label === 'component:dfg-scout') {
      commands.push('```bash\ncd workers/dfg-scout\nnpm run test\nnpx tsc --noEmit\nnpx wrangler deploy\n```');
    } else if (label === 'component:dfg-analyst') {
      commands.push('```bash\ncd workers/dfg-analyst\nnpm run test\nnpx tsc --noEmit\nnpx wrangler deploy\n```');
    } else if (label === 'component:dfg-app') {
      commands.push('```bash\ncd apps/dfg-app\nnpm run lint\nnpm run type-check\nnpm run build\n```');
    }
  }

  return commands;
}

/**
 * Add comment to existing GitHub issue (#165)
 */
async function handleComment(request: Request, env: Env, getGhToken: (repo: string) => Promise<string>): Promise<Response> {
  // Method check
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  // Auth check
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.RELAY_TOKEN}`) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  // Parse payload
  let payload: CommentPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }

  // Validate repo format
  const repoError = validateRepoFormat(payload.repo);
  if (repoError) return repoError;

  // Validate required fields
  if (!payload.issue || !payload.body) {
    return jsonResponse({
      success: false,
      error: 'Missing required fields: issue, body'
    }, 400);
  }

  // Get repo (with default)
  const repo = getRepo(env, payload.repo);

  // Create GitHub comment
  try {
    const ghToken = await getGhToken(repo);
    await createGitHubComment(env, ghToken, repo, payload.issue, payload.body);

    return jsonResponse({
      success: true,
      issue: payload.issue,
      repo,
    });
  } catch (error) {
    console.error('GitHub API error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'GitHub API failed',
    }, 500);
  }
}

/**
 * Close GitHub issue (#168)
 */
async function handleClose(request: Request, env: Env, getGhToken: (repo: string) => Promise<string>): Promise<Response> {
  // Method check
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  // Auth check
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.RELAY_TOKEN}`) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  // Parse payload
  let payload: ClosePayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }

  // Validate repo format
  const repoError = validateRepoFormat(payload.repo);
  if (repoError) return repoError;

  // Validate required fields
  if (!payload.issue) {
    return jsonResponse({
      success: false,
      error: 'Missing required field: issue'
    }, 400);
  }

  // Get repo (with default)
  const repo = getRepo(env, payload.repo);

  // Close GitHub issue (with optional comment)
  try {
    const ghToken = await getGhToken(repo);

    // Add comment if provided
    if (payload.comment) {
      await createGitHubComment(env, ghToken, repo, payload.issue, payload.comment);
    }

    // Close the issue
    await closeGitHubIssue(env, ghToken, repo, payload.issue);

    return jsonResponse({
      success: true,
      issue: payload.issue,
      repo,
    });
  } catch (error) {
    console.error('GitHub API error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'GitHub API failed',
    }, 500);
  }
}

/**
 * Update labels on GitHub issue (#179)
 */
async function handleLabels(request: Request, env: Env, getGhToken: (repo: string) => Promise<string>): Promise<Response> {
  // Method check
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  // Auth check
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.RELAY_TOKEN}`) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  // Parse payload
  let payload: LabelsPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }

  // Validate repo format
  const repoError = validateRepoFormat(payload.repo);
  if (repoError) return repoError;

  // Validate required fields
  if (!payload.issue) {
    return jsonResponse({
      success: false,
      error: 'Missing required field: issue'
    }, 400);
  }

  // At least one operation required
  if (!payload.add && !payload.remove) {
    return jsonResponse({
      success: false,
      error: 'Must specify at least one of: add, remove'
    }, 400);
  }

  // Get repo (with default)
  const repo = getRepo(env, payload.repo);

  // Update labels on GitHub issue
  try {
    const ghToken = await getGhToken(repo);

    // Remove labels first (if specified)
    if (payload.remove && payload.remove.length > 0) {
      for (const label of payload.remove) {
        await removeGitHubLabel(env, ghToken, repo, payload.issue, label);
      }
    }

    // Add labels (if specified)
    if (payload.add && payload.add.length > 0) {
      await addGitHubLabels(env, ghToken, repo, payload.issue, payload.add);
    }

    // Fetch updated labels
    const labels = await getGitHubLabels(env, ghToken, repo, payload.issue);

    return jsonResponse({
      success: true,
      issue: payload.issue,
      repo,
      labels,
    });
  } catch (error) {
    console.error('GitHub API error:', error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : 'GitHub API failed',
    }, 500);
  }
}

/**
 * Merge GitHub PR (#7)
 */
async function handleMerge(request: Request, env: Env, getGhToken: (repo: string) => Promise<string>): Promise<Response> {
  // Method check
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  // Auth check
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.RELAY_TOKEN}`) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  // Parse payload
  let payload: MergePayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400);
  }

  // Validate repo format (required for merge operations)
  if (!payload.repo || !isRepoSlug(payload.repo)) {
    return jsonResponse({
      success: false,
      error: "Invalid repo format. Must be 'owner/repo'"
    }, 400);
  }

  // Validate PR number
  if (!payload.pr || typeof payload.pr !== 'number' || payload.pr < 1) {
    return jsonResponse({
      success: false,
      error: 'Invalid PR number. Must be a positive integer'
    }, 400);
  }

  // Validate merge method
  const ALLOWED_METHODS: Array<'squash' | 'merge' | 'rebase'> = ['squash', 'merge', 'rebase'];
  const mergeMethod = payload.merge_method || 'squash';
  if (!ALLOWED_METHODS.includes(mergeMethod)) {
    return jsonResponse({
      success: false,
      error: `Invalid merge_method. Must be one of: ${ALLOWED_METHODS.join(', ')}`
    }, 400);
  }

  // Merge GitHub PR
  try {
    const ghToken = await getGhToken(payload.repo);
    const result = await mergeGitHubPR(
      env,
      ghToken,
      payload.repo,
      payload.pr,
      mergeMethod,
      payload.commit_title,
      payload.commit_message
    );

    return jsonResponse({
      success: true,
      pr: payload.pr,
      repo: payload.repo,
      sha: result.sha,
      merged: result.merged,
      message: result.message,
    });
  } catch (error) {
    console.error('GitHub API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'GitHub API failed';

    // Extract status code from error message if present
    const statusMatch = errorMessage.match(/GitHub API (\d+):/);
    const status = statusMatch ? parseInt(statusMatch[1]) : 500;

    return jsonResponse({
      success: false,
      error: errorMessage,
    }, status);
  }
}

/**
 * Create issue via GitHub REST API
 */
async function createGitHubIssue(
  env: Env,
  token: string,
  repo: string,
  params: {
    title: string;
    body: string;
    labels: string[];
    assignees: string[];
  }
): Promise<GitHubIssueResponse> {
  const url = `https://api.github.com/repos/${repo}/issues`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'crane-relay-worker',
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      labels: params.labels,
      assignees: params.assignees,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API ${response.status}: ${errorBody}`);
  }

  return response.json();
}

/**
 * Add comment to GitHub issue via REST API (#165)
 */
async function createGitHubComment(
  env: Env,
  token: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<void> {
  const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'crane-relay-worker',
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API ${response.status}: ${errorBody}`);
  }
}

/**
 * Close GitHub issue via REST API (#168)
 */
async function closeGitHubIssue(
  env: Env,
  token: string,
  repo: string,
  issueNumber: number
): Promise<void> {
  const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'crane-relay-worker',
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({ state: 'closed' }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API ${response.status}: ${errorBody}`);
  }
}

/**
 * Add labels to GitHub issue via REST API (#179)
 */
async function addGitHubLabels(
  env: Env,
  token: string,
  repo: string,
  issueNumber: number,
  labels: string[]
): Promise<void> {
  const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}/labels`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'crane-relay-worker',
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({ labels }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API ${response.status}: ${errorBody}`);
  }
}

/**
 * Remove label from GitHub issue via REST API (#179)
 */
async function removeGitHubLabel(
  env: Env,
  token: string,
  repo: string,
  issueNumber: number,
  label: string
): Promise<void> {
  const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'crane-relay-worker',
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API ${response.status}: ${errorBody}`);
  }
}

/**
 * Get labels for GitHub issue via REST API (#179)
 */
async function getGitHubLabels(
  env: Env,
  token: string,
  repo: string,
  issueNumber: number
): Promise<string[]> {
  const url = `https://api.github.com/repos/${repo}/issues/${issueNumber}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'crane-relay-worker',
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API ${response.status}: ${errorBody}`);
  }

  const issue = await response.json() as { labels: Array<{ name: string }> };
  return issue.labels.map(l => l.name);
}

/**
 * Merge GitHub PR via REST API (#7)
 */
async function mergeGitHubPR(
  env: Env,
  token: string,
  repo: string,
  prNumber: number,
  mergeMethod: 'squash' | 'merge' | 'rebase',
  commitTitle?: string,
  commitMessage?: string
): Promise<{ sha: string; merged: boolean; message: string }> {
  const url = `https://api.github.com/repos/${repo}/pulls/${prNumber}/merge`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'crane-relay-worker',
      'Accept': 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      merge_method: mergeMethod,
      commit_title: commitTitle,
      commit_message: commitMessage,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API ${response.status}: ${errorBody}`);
  }

  const result = await response.json() as { sha: string; merged: boolean; message: string };
  return result;
}

/**
 * Helper: JSON response with CORS (#98: restricted origins)
 */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': currentRequest ? getCorsOrigin(currentRequest) : ALLOWED_ORIGINS[0],
    },
  });
}
// EVENT VALIDATION
// ============================================================================

function validateEvent(e: any): { ok: true; event: RelayEvent } | { ok: false; message: string } {
  if (!e || typeof e !== "object") return { ok: false, message: "Body must be a JSON object" };

  const event_id = String(e.event_id || "").trim();
  const repo = String(e.repo || "").trim();
  const issue_number = safeInt(e.issue_number);
  const role = String(e.role || "").trim();
  const agent = String(e.agent || "").trim();
  const event_type = String(e.event_type || "").trim();

  if (!event_id || event_id.length < 8) return { ok: false, message: "event_id is required (min length 8)" };
  if (!repo || !isRepoSlug(repo)) return { ok: false, message: "repo must be 'org/repo'" };
  if (!issue_number || issue_number < 1) return { ok: false, message: "issue_number must be a positive integer" };
  if (!["QA", "DEV", "PM", "MENTOR"].includes(role)) return { ok: false, message: "role must be QA|DEV|PM|MENTOR" };
  if (!agent || agent.length < 2) return { ok: false, message: "agent is required" };
  if (!event_type) return { ok: false, message: "event_type is required" };

  let build: RelayEvent["build"] | undefined;
  if (e.build) {
    if (typeof e.build !== "object") return { ok: false, message: "build must be an object" };
    const commit_sha = String(e.build.commit_sha || "").trim().toLowerCase();
    const pr = e.build.pr != null ? safeInt(e.build.pr) : undefined;
    if (!commit_sha || !isHexSha(commit_sha)) return { ok: false, message: "build.commit_sha must be a hex sha (7-40 chars)" };
    build = { commit_sha, ...(pr ? { pr } : {}) };
  }

  const environment = e.environment ? String(e.environment) : undefined;
  if (environment && !["preview", "production", "dev"].includes(environment)) {
    return { ok: false, message: "environment must be preview|production|dev" };
  }

  let overall_verdict: Verdict | undefined = e.overall_verdict;
  if (overall_verdict && !["PASS", "FAIL", "BLOCKED", "PASS_UNVERIFIED", "FAIL_UNCONFIRMED"].includes(overall_verdict)) {
    return { ok: false, message: "overall_verdict invalid" };
  }

  let scope_results: ScopeResult[] | undefined;
  if (e.scope_results != null) {
    if (!Array.isArray(e.scope_results) || e.scope_results.length < 1) {
      return { ok: false, message: "scope_results must be a non-empty array" };
    }
    scope_results = e.scope_results.map((r: any) => ({
      id: String(r.id || "").trim(),
      status: String(r.status || "").trim(),
      notes: r.notes != null ? String(r.notes) : undefined
    })) as any;

    for (const r of scope_results!) {
      if (!r.id) return { ok: false, message: "scope_results[].id is required" };
      if (!["PASS", "FAIL", "SKIPPED"].includes(r.status)) return { ok: false, message: "scope_results[].status must be PASS|FAIL|SKIPPED" };
    }
  }

  // Conditional requirements on FAIL/BLOCKED
  if (overall_verdict === "FAIL" || overall_verdict === "BLOCKED") {
    if (!e.severity || !["P0", "P1", "P2", "P3"].includes(String(e.severity))) {
      return { ok: false, message: "severity is required for FAIL/BLOCKED and must be P0|P1|P2|P3" };
    }
    for (const k of ["repro_steps", "expected", "actual"]) {
      if (!e[k] || String(e[k]).trim().length < 3) {
        return { ok: false, message: `${k} is required for FAIL/BLOCKED (min length 3)` };
      }
    }
  }

  const evidence_urls = e.evidence_urls
    ? (Array.isArray(e.evidence_urls) ? e.evidence_urls.map((u: any) => String(u)) : null)
    : undefined;
  if (evidence_urls === null) return { ok: false, message: "evidence_urls must be an array of strings" };

  const event: RelayEvent = {
    event_id,
    repo,
    issue_number,
    role: role as Role,
    agent,
    event_type,
    summary: e.summary != null ? String(e.summary) : undefined,
    environment: environment as any,
    build,
    overall_verdict,
    scope_results,
    severity: e.severity,
    repro_steps: e.repro_steps,
    expected: e.expected,
    actual: e.actual,
    evidence_urls,
    artifacts: Array.isArray(e.artifacts) ? e.artifacts : undefined,
    details: e.details
  };

  return { ok: true, event };
}

// ============================================================================
// GITHUB APP AUTH (RS256 JWT -> installation token)
// ============================================================================

function b64url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") bytes = new TextEncoder().encode(input);
  else bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, "")
    .replace(/-----END RSA PRIVATE KEY-----/g, "")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const keyData = pemToArrayBuffer(pem);
  // Try PKCS8 first, fall back to PKCS1
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
  } catch {
    // RSA PRIVATE KEY format (PKCS1) - need to wrap in PKCS8
    // For simplicity, we assume the key works with pkcs8 after stripping headers
    throw new Error("Failed to import private key. Ensure it's in PKCS8 or RSA PRIVATE KEY format.");
  }
}

async function createAppJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: now - 30,
    exp: now + 9 * 60,
    iss: Number(env.GH_APP_ID)
  };

  const encodedHeader = b64url(JSON.stringify(header));
  const encodedPayload = b64url(JSON.stringify(payload));
  const toSign = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(env.GH_PRIVATE_KEY_PEM);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(toSign));
  const encodedSig = b64url(sig);

  return `${toSign}.${encodedSig}`;
}

async function githubFetch(env: Env, token: string, method: string, path: string, body?: any) {
  const base = (env.GH_API_BASE || "https://api.github.com").replace(/\/+$/, "");
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "authorization": `Bearer ${token}`,
      "accept": "application/vnd.github+json",
      "user-agent": "crane-relay-v2",
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res;
}

async function getInstallationToken(env: Env, repo: string): Promise<string> {
  const { owner } = splitRepo(repo);
  const installations = JSON.parse(env.GH_INSTALLATIONS_JSON || '{}');
  const installationId = installations[owner];
  if (!installationId) {
    throw new Error(`No GitHub App installation found for org: ${owner}`);
  }
  
  const appJwt = await createAppJwt(env);
  const res = await githubFetch(env, appJwt, "POST", `/app/installations/${installationId}/access_tokens`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub installation token error: ${res.status} ${txt}`);
  }
  const data = await res.json() as any;
  return data.token as string;
}

function splitRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split("/");
  return { owner, name };
}

// ============================================================================
// GITHUB OPERATIONS
// ============================================================================

async function getPullRequestHeadSha(env: Env, ghToken: string, repo: string, prNumber: number): Promise<string> {
  const { owner, name } = splitRepo(repo);
  const res = await githubFetch(env, ghToken, "GET", `/repos/${owner}/${name}/pulls/${prNumber}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub PR fetch error: ${res.status} ${txt}`);
  }
  const pr = await res.json() as any;
  return String(pr.head?.sha || "").toLowerCase();
}

async function getIssueDetails(env: Env, ghToken: string, repo: string, issueNumber: number) {
  const { owner, name } = splitRepo(repo);
  const res = await githubFetch(env, ghToken, "GET", `/repos/${owner}/${name}/issues/${issueNumber}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub issue fetch error: ${res.status} ${txt}`);
  }
  return res.json() as Promise<any>;
}

async function listIssueComments(env: Env, ghToken: string, repo: string, issueNumber: number, page = 1) {
  const { owner, name } = splitRepo(repo);
  const res = await githubFetch(env, ghToken, "GET", `/repos/${owner}/${name}/issues/${issueNumber}/comments?per_page=100&page=${page}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub list comments error: ${res.status} ${txt}`);
  }
  return res.json() as Promise<any[]>;
}

async function createIssueComment(env: Env, ghToken: string, repo: string, issueNumber: number, body: string) {
  const { owner, name } = splitRepo(repo);
  const res = await githubFetch(env, ghToken, "POST", `/repos/${owner}/${name}/issues/${issueNumber}/comments`, { body });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub create comment error: ${res.status} ${txt}`);
  }
  return res.json() as Promise<any>;
}

async function updateIssueComment(env: Env, ghToken: string, repo: string, commentId: string, body: string) {
  const { owner, name } = splitRepo(repo);
  const res = await githubFetch(env, ghToken, "PATCH", `/repos/${owner}/${name}/issues/comments/${commentId}`, { body });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub update comment error: ${res.status} ${txt}`);
  }
  return res.json() as Promise<any>;
}

async function putIssueLabels(env: Env, ghToken: string, repo: string, issueNumber: number, labels: string[]) {
  const { owner, name } = splitRepo(repo);
  const res = await githubFetch(env, ghToken, "PUT", `/repos/${owner}/${name}/issues/${issueNumber}/labels`, { labels });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub update labels error: ${res.status} ${txt}`);
  }
  return res.json() as Promise<any>;
}

// ============================================================================
// LABEL TRANSITIONS
// ============================================================================

function parseLabelRules(env: Env): LabelRules | null {
  try {
    const parsed = JSON.parse(env.LABEL_RULES_JSON || "");
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as LabelRules;
  } catch {
    return null;
  }
}

async function applyLabelRules(
  env: Env,
  ghToken: string,
  repo: string,
  issueNumber: number,
  eventType: string,
  verdict: Verdict | undefined
) {
  const rules = parseLabelRules(env);
  if (!rules) return;

  const typeRule = rules[eventType];
  if (!typeRule) return;

  const key = verdict ?? "_";
  const rule = typeRule[key] || typeRule["_"];
  if (!rule) return;

  const add = Array.isArray(rule.add) ? rule.add : [];
  const remove = Array.isArray(rule.remove) ? rule.remove : [];

  const issue = await getIssueDetails(env, ghToken, repo, issueNumber);
  const current = (issue.labels || [])
    .map((l: any) => (typeof l === "string" ? l : l.name))
    .filter(Boolean) as string[];

  const next = new Set<string>(current);
  for (const a of add) next.add(a);
  for (const r of remove) next.delete(r);

  await putIssueLabels(env, ghToken, repo, issueNumber, Array.from(next));
}

// ============================================================================
// ROLLING COMMENT UPSERT
// ============================================================================

async function upsertRollingComment(env: Env, ghToken: string, repo: string, issueNumber: number, body: string): Promise<string> {
  // 1) Try D1 mapping
  const mapped = await env.DB.prepare(
    "SELECT comment_id FROM relay_status_comment WHERE repo = ? AND issue_number = ?"
  ).bind(repo, issueNumber).first<{ comment_id: string }>();

  if (mapped?.comment_id) {
    try {
      await updateIssueComment(env, ghToken, repo, mapped.comment_id, body);
      await env.DB.prepare(
        "UPDATE relay_status_comment SET updated_at = ? WHERE repo = ? AND issue_number = ?"
      ).bind(nowIso(), repo, issueNumber).run();
      return mapped.comment_id;
    } catch {
      // fall through - comment may have been deleted
    }
  }

  // 2) Search GitHub comments for marker (scan up to 3 pages / 300 comments)
  let page = 1;
  let found: any | null = null;
  while (page <= 3 && !found) {
    const comments = await listIssueComments(env, ghToken, repo, issueNumber, page);
    found = comments.find(c => typeof c.body === "string" && c.body.includes(RELAY_STATUS_MARKER)) || null;
    if (comments.length < 100) break;
    page += 1;
  }

  if (found?.id) {
    const commentId = String(found.id);
    await updateIssueComment(env, ghToken, repo, commentId, body);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO relay_status_comment (repo, issue_number, comment_id, updated_at) VALUES (?, ?, ?, ?)"
    ).bind(repo, issueNumber, commentId, nowIso()).run();
    return commentId;
  }

  // 3) Create new comment
  const created = await createIssueComment(env, ghToken, repo, issueNumber, body);
  const commentId = String(created.id);

  await env.DB.prepare(
    "INSERT OR REPLACE INTO relay_status_comment (repo, issue_number, comment_id, updated_at) VALUES (?, ?, ?, ?)"
  ).bind(repo, issueNumber, commentId, nowIso()).run();

  return commentId;
}

// ============================================================================
// ROLLING COMMENT RENDERING
// ============================================================================

function normalizeLabels(issue: any): string[] {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  return labels.map((l: any) => (typeof l === "string" ? l : l.name)).filter(Boolean);
}

function extractOwner(issue: any): string {
  const assignees = Array.isArray(issue.assignees) ? issue.assignees : [];
  if (assignees.length > 0) return `@${assignees[0].login}`;
  if (issue.assignee?.login) return `@${issue.assignee.login}`;
  return "unassigned";
}

function pickStatus(labels: string[]): string {
  const status = labels.find(l => l.startsWith("status:"));
  return status ? status.replace(/^status:/, "") : "unknown";
}

function formatShortSha(sha?: string | null) {
  if (!sha) return "n/a";
  return `\`${sha.slice(0, 7)}\``;
}

function safeParseEvent(payloadJson: string): RelayEvent | null {
  try {
    const e = JSON.parse(payloadJson);
    return e && typeof e === "object" ? (e as RelayEvent) : null;
  } catch {
    return null;
  }
}

async function getLatestEventByType(env: Env, repo: string, issueNumber: number, eventType: string): Promise<{ created_at: string; payload_json: string } | null> {
  const row = await env.DB.prepare(
    "SELECT created_at, payload_json FROM events WHERE repo = ? AND issue_number = ? AND event_type = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(repo, issueNumber, eventType).first<{ created_at: string; payload_json: string }>();
  return row || null;
}

async function getRecentEvents(env: Env, repo: string, issueNumber: number, limit = 5): Promise<Array<{ created_at: string; event_type: string; agent: string }>> {
  const rows = await env.DB.prepare(
    "SELECT created_at, event_type, agent FROM events WHERE repo = ? AND issue_number = ? ORDER BY created_at DESC LIMIT ?"
  ).bind(repo, issueNumber, limit).all();
  return (rows.results || []) as any[];
}

function renderRelayStatusMarkdown(input: {
  issue: any;
  repo: string;
  issueNumber: number;
  provenance: { pr?: number; commit?: string; verified: boolean | null; prHead?: string | null; environment?: string | null };
  latestDev?: RelayEvent | null;
  latestQa?: RelayEvent | null;
  recent: Array<{ created_at: string; event_type: string; agent: string }>;
}) {
  const labels = normalizeLabels(input.issue);
  const owner = extractOwner(input.issue);
  const status = pickStatus(labels);

  const pr = input.provenance.pr ? `#${input.provenance.pr}` : "n/a";
  const commit = formatShortSha(input.provenance.commit);
  const env = input.provenance.environment || "unknown";

  const prov =
    input.provenance.verified === null ? "n/a" :
    input.provenance.verified ? "VERIFIED (matches PR head)" :
    `UNVERIFIED (PR head: ${formatShortSha(input.provenance.prHead)})`;

  const qaVerdict = input.latestQa?.overall_verdict || "n/a";
  const qaScope = input.latestQa?.scope_results || [];
  const qaEvidence = input.latestQa?.evidence_urls || [];

  const devSummary = input.latestDev?.summary ? input.latestDev.summary : "";

  const scopeLines = qaScope.length
    ? qaScope.map(s => `  - ${s.id} — ${s.status}${s.notes ? ` (${s.notes})` : ""}`).join("\n")
    : "  - n/a";

  const evidenceLines = qaEvidence.length
    ? qaEvidence.map(u => `  - ${u}`).join("\n")
    : "  - n/a";

  const recentLines = input.recent.length
    ? input.recent.map(r => `- ${r.created_at.slice(11, 16)}Z — ${r.event_type} — ${r.agent}`).join("\n")
    : "- n/a";

  return [
    RELAY_STATUS_MARKER,
    "",
    `## Relay Status — ISSUE #${input.issueNumber}`,
    "",
    "### Current State",
    `- Status: \`${status}\``,
    `- Labels: ${labels.length ? labels.map(l => `\`${l}\``).join(", ") : "n/a"}`,
    `- Owner: ${owner}`,
    "",
    "### Build Provenance",
    `- Environment: \`${env}\``,
    `- PR: ${pr}`,
    `- Commit: ${commit}`,
    `- Provenance: ${prov}`,
    "",
    "### Latest Dev Update",
    devSummary ? `- Summary: ${devSummary}` : "- Summary: n/a",
    "",
    "### Latest QA Result",
    `- Verdict: \`${qaVerdict}\``,
    "- Scope:",
    scopeLines,
    "- Evidence:",
    evidenceLines,
    "",
    "### Recent Activity",
    recentLines,
    ""
  ].join("\n");
}

// ============================================================================
// EVIDENCE HANDLERS (Phase 2)
// ============================================================================

async function handleEvidenceUpload(req: Request, env: Env): Promise<Response> {
  const authErr = requireAuth(req, env);
  if (authErr) return authErr;

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return badRequest("Expected multipart/form-data");
  }

  const url = new URL(req.url);
  const form = await req.formData();

  const repo = String(form.get("repo") || "").trim();
  const issueNumber = safeInt(String(form.get("issue_number") || ""));
  const eventId = String(form.get("event_id") || "").trim() || null;

  const file = form.get("file");
  if (!repo || !isRepoSlug(repo) || !issueNumber) {
    return badRequest("Missing required fields: repo (org/repo), issue_number");
  }
  if (!file || typeof file === 'string') {
    return badRequest("Missing file field (multipart 'file')");
  }

  const id = crypto.randomUUID();
  const createdAt = nowIso();

  const fileBlob = file as File;
  const filename = fileBlob.name || "upload.bin";
  const fileType = fileBlob.type || "application/octet-stream";
  const sizeBytes = fileBlob.size;

  const r2Key = `evidence/${repo}/issue-${issueNumber}/${id}/${filename}`;

  await env.EVIDENCE_BUCKET.put(r2Key, fileBlob.stream(), {
    httpMetadata: { contentType: fileType },
    customMetadata: {
      repo,
      issue_number: String(issueNumber),
      event_id: eventId ?? "",
      uploaded_at: createdAt
    }
  });

  await env.DB.prepare(
    `INSERT INTO evidence_assets
     (id, repo, issue_number, event_id, filename, content_type, size_bytes, r2_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, repo, issueNumber, eventId, filename, fileType, sizeBytes, r2Key, createdAt
  ).run();

  const evidenceUrl = `${url.origin}/v2/evidence/${id}`;

  return v2Json({
    id,
    repo,
    issue_number: issueNumber,
    event_id: eventId,
    filename,
    content_type: fileType,
    size_bytes: sizeBytes,
    url: evidenceUrl
  }, 201);
}

async function handleEvidenceGet(req: Request, env: Env, evidenceId: string): Promise<Response> {
  const authErr = requireAuth(req, env);
  if (authErr) return authErr;

  const row = await env.DB.prepare(
    "SELECT r2_key, filename, content_type FROM evidence_assets WHERE id = ?"
  ).bind(evidenceId).first<{ r2_key: string; filename: string; content_type: string | null }>();

  if (!row) return new Response("Not found", { status: 404 });

  const obj = await env.EVIDENCE_BUCKET.get(row.r2_key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  headers.set("content-type", row.content_type || "application/octet-stream");
  headers.set("content-disposition", `inline; filename="${row.filename.replace(/"/g, "")}"`);
  obj.writeHttpMetadata(headers);

  return new Response(obj.body, { headers });
}

// ============================================================================
// EVENTS HANDLER (Phase 1)
// ============================================================================

async function handlePostEvents(req: Request, env: Env, getGhToken: (repo: string) => Promise<string>): Promise<Response> {
  const authErr = requireAuth(req, env);
  if (authErr) return authErr;

  let payload: any;
  try { payload = await req.json(); } catch { return badRequest("Invalid JSON body"); }

  const validated = validateEvent(payload);
  if (!validated.ok) return badRequest(validated.message);

  const event = validated.event;

  const payloadJson = JSON.stringify(event);
  const payloadHash = await sha256Hex(payloadJson);

  // Idempotency check
  const existing = await env.DB.prepare(
    "SELECT payload_hash FROM events WHERE event_id = ?"
  ).bind(event.event_id).first<{ payload_hash: string }>();

  if (existing) {
    if (existing.payload_hash !== payloadHash) {
      return conflict("event_id already exists with different payload", {
        event_id: event.event_id,
        existing_hash: existing.payload_hash,
        new_hash: payloadHash
      });
    }
    return v2Json({ ok: true, idempotent: true, event_id: event.event_id });
  }

  const ghToken = await getGhToken(event.repo);

  // Provenance check
  let provenanceVerified: boolean | null = null;
  let prHeadSha: string | null = null;

  let effectiveVerdict: Verdict | undefined = event.overall_verdict;

  if (event.build?.pr && event.build.commit_sha) {
    prHeadSha = await getPullRequestHeadSha(env, ghToken, event.repo, event.build.pr);
    provenanceVerified = (prHeadSha === event.build.commit_sha.toLowerCase());

    if (!provenanceVerified && effectiveVerdict === "PASS") {
      effectiveVerdict = "PASS_UNVERIFIED";
    }
  }

  // Persist event
  await env.DB.prepare(
    `INSERT INTO events
     (event_id, repo, issue_number, event_type, role, agent, environment, overall_verdict, created_at, payload_hash, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    event.event_id,
    event.repo,
    event.issue_number,
    event.event_type,
    event.role,
    event.agent,
    event.environment ?? null,
    effectiveVerdict ?? null,
    nowIso(),
    payloadHash,
    payloadJson
  ).run();

  // Fetch issue for rendering
  const issue = await getIssueDetails(env, ghToken, event.repo, event.issue_number);

  // Pull latest dev/qa events
  const latestDevRow = await getLatestEventByType(env, event.repo, event.issue_number, "dev.update");
  const latestQaRow = await getLatestEventByType(env, event.repo, event.issue_number, "qa.result_submitted");
  const latestDev = latestDevRow ? safeParseEvent(latestDevRow.payload_json) : null;
  const latestQa = latestQaRow ? safeParseEvent(latestQaRow.payload_json) : null;

  const recent = await getRecentEvents(env, event.repo, event.issue_number, 5);

  const provenance = {
    pr: event.build?.pr,
    commit: event.build?.commit_sha,
    verified: provenanceVerified,
    prHead: prHeadSha,
    environment: event.environment ?? null
  };

  const body = renderRelayStatusMarkdown({
    issue,
    repo: event.repo,
    issueNumber: event.issue_number,
    provenance,
    latestDev,
    latestQa,
    recent
  });

  const commentId = await upsertRollingComment(env, ghToken, event.repo, event.issue_number, body);

  // Check if this needs approval queue
  if (effectiveVerdict === "PASS_PENDING_APPROVAL") {
    // Add to approval queue instead of transitioning labels
    const queueId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO approval_queue
       (id, event_id, repo, issue_number, pr_number, commit_sha, agent, verdict, summary, scope_results, evidence_urls, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).bind(
      queueId,
      event.event_id,
      event.repo,
      event.issue_number,
      event.build?.pr ?? null,
      event.build?.commit_sha ?? null,
      event.agent,
      effectiveVerdict,
      event.summary ?? null,
      event.scope_results ? JSON.stringify(event.scope_results) : null,
      event.evidence_urls ? JSON.stringify(event.evidence_urls) : null,
      nowIso()
    ).run();

    return v2Json({
      ok: true,
      event_id: event.event_id,
      stored: true,
      queued: true,
      queue_id: queueId,
      rolling_comment_id: commentId,
      verdict: effectiveVerdict,
      provenance_verified: provenanceVerified
    }, 201);
  }

  // Apply label transitions (for non-queued verdicts)
  await applyLabelRules(env, ghToken, event.repo, event.issue_number, event.event_type, effectiveVerdict);

  return v2Json({
    ok: true,
    event_id: event.event_id,
    stored: true,
    rolling_comment_id: commentId,
    verdict: effectiveVerdict,
    provenance_verified: provenanceVerified
  }, 201);
}

// ============================================================================
// APPROVAL QUEUE HANDLERS
// ============================================================================

async function handleGetApprovalQueue(req: Request, env: Env): Promise<Response> {
  const authErr = requireAuth(req, env);
  if (authErr) return authErr;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";
  const repo = url.searchParams.get("repo");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);

  let query = `SELECT * FROM approval_queue WHERE status = ?`;
  const params: any[] = [status];

  if (repo) {
    query += ` AND repo = ?`;
    params.push(repo);
  }

  query += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const results = await env.DB.prepare(query).bind(...params).all();

  const items = results.results.map((row: any) => ({
    id: row.id,
    event_id: row.event_id,
    repo: row.repo,
    issue_number: row.issue_number,
    pr_number: row.pr_number,
    commit_sha: row.commit_sha,
    agent: row.agent,
    verdict: row.verdict,
    summary: row.summary,
    scope_results: row.scope_results ? JSON.parse(row.scope_results) : null,
    evidence_urls: row.evidence_urls ? JSON.parse(row.evidence_urls) : null,
    created_at: row.created_at,
    status: row.status,
    reviewed_at: row.reviewed_at,
    reviewed_by: row.reviewed_by,
    review_notes: row.review_notes
  }));

  return v2Json({ ok: true, items, count: items.length });
}

async function handleApprove(req: Request, env: Env, getGhToken: (repo: string) => Promise<string>): Promise<Response> {
  const authErr = requireAuth(req, env);
  if (authErr) return authErr;

  let payload: { ids: string[]; action: "approve" | "reject"; notes?: string; reviewed_by?: string };
  try {
    payload = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  if (!payload.ids || !Array.isArray(payload.ids) || payload.ids.length === 0) {
    return badRequest("ids array required");
  }
  if (!payload.action || !["approve", "reject"].includes(payload.action)) {
    return badRequest("action must be 'approve' or 'reject'");
  }

  const results: Array<{ id: string; success: boolean; error?: string }> = [];

  for (const id of payload.ids) {
    try {
      // Get queue item
      const item = await env.DB.prepare(
        "SELECT * FROM approval_queue WHERE id = ? AND status = 'pending'"
      ).bind(id).first<any>();

      if (!item) {
        results.push({ id, success: false, error: "Not found or already processed" });
        continue;
      }

      const ghToken = await getGhToken(item.repo);

      // Update queue status
      await env.DB.prepare(
        `UPDATE approval_queue 
         SET status = ?, reviewed_at = ?, reviewed_by = ?, review_notes = ?
         WHERE id = ?`
      ).bind(
        payload.action === "approve" ? "approved" : "rejected",
        nowIso(),
        payload.reviewed_by || "captain",
        payload.notes || null,
        id
      ).run();

      // Apply label transitions
      if (payload.action === "approve") {
        // Same as PASS verdict
        await applyLabelRules(env, ghToken, item.repo, item.issue_number, "qa.result_submitted", "PASS");
      } else {
        // Rejection: add needs:dev
        const issue = await getIssueDetails(env, ghToken, item.repo, item.issue_number);
        const currentLabels = issue.labels.map((l: any) => l.name);
        const newLabels = currentLabels.filter((l: string) => l !== "needs:qa");
        if (!newLabels.includes("needs:dev")) {
          newLabels.push("needs:dev");
        }
        await putIssueLabels(env, ghToken, item.repo, item.issue_number, newLabels);
      }

      // Update rolling comment with approval note
      const issue = await getIssueDetails(env, ghToken, item.repo, item.issue_number);
      const latestDevRow = await getLatestEventByType(env, item.repo, item.issue_number, "dev.update");
      const latestQaRow = await getLatestEventByType(env, item.repo, item.issue_number, "qa.result_submitted");
      const latestDev = latestDevRow ? safeParseEvent(latestDevRow.payload_json) : null;
      const latestQa = latestQaRow ? safeParseEvent(latestQaRow.payload_json) : null;
      const recent = await getRecentEvents(env, item.repo, item.issue_number, 5);

      const approvalNote = `${payload.action === "approve" ? "✅ Approved" : "❌ Rejected"} by ${payload.reviewed_by || "captain"}${payload.notes ? `: ${payload.notes}` : ""}`;

      const body = renderRelayStatusMarkdown({
        issue,
        repo: item.repo,
        issueNumber: item.issue_number,
        provenance: {
          pr: item.pr_number,
          commit: item.commit_sha,
          verified: null,
          prHead: null,
          environment: null
        },
        latestDev,
        latestQa,
        recent
      }) + `\n\n### Approval\n${approvalNote}`;

      await upsertRollingComment(env, ghToken, item.repo, item.issue_number, body);

      results.push({ id, success: true });
    } catch (err: any) {
      results.push({ id, success: false, error: String(err?.message || err) });
    }
  }

  const approved = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return v2Json({
    ok: failed === 0,
    processed: results.length,
    approved,
    failed,
    results
  });
}

// ============================================================================
// EXPORTS (for integration)
// ============================================================================

export {
  handlePostEvents,
  handleEvidenceUpload,
  handleEvidenceGet,
  handleGetApprovalQueue,
  handleApprove,
  getInstallationToken,
  requireAuth,
  v2Json,
  badRequest,
  conflict,
  unauthorized
};


