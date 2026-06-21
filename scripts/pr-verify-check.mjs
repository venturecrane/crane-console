#!/usr/bin/env node
//
// pr-verify-check.mjs — PR-CI verify gate (Layer of Prong 2).
//
// Reads the PR body, extracts vfy_<ULID> IDs, and confirms each one (a) exists
// in the verify_ledger, and (b) actually PROVES a changed seam: at least one
// listed verification must be a live_state/fresh_process observation whose
// files_touched names one of the PR's changed surface files AND whose captured
// output showed data (server-computed aliveness). This turns "verified
// something" into "verified the thing you shipped". Used by pr-verify-gate.yml.
//
// Required env:
//   GITHUB_TOKEN       — gh CLI auth (provided automatically in workflows)
//   PR_NUMBER          — PR number to inspect
//   GITHUB_REPOSITORY  — owner/repo (provided automatically)
//   CRANE_RELAY_KEY    — X-Relay-Key for crane-context API
//
// Optional env:
//   CRANE_API_BASE     — defaults to production worker
//   GRACE_MINUTES      — opened-but-zero-IDs grace window (default 5)
//   SURFACE_FILES      — comma-separated changed surface files (relevance set).
//                        Empty / worker without `records` → degrade to
//                        existence-only with a loud warning (never silent).
//
// Exit codes:
//   0  — pass (or grace window: warn-only, or degraded existence-only)
//   1  — fail (zero IDs past grace, any ID missing, or no listed verification
//        proves a changed seam)
//   2  — script error (invalid args, network, etc.) — workflow treats as failure

import { execSync } from 'node:child_process'

const VFY_REGEX = /vfy_[0-9A-HJKMNP-TV-Z]{26}/g
const DEFAULT_API_BASE = 'https://crane-context.automation-ab6.workers.dev'

function fail(message, code = 1) {
  console.error(`::error::${message}`)
  process.exit(code)
}

function warn(message) {
  console.log(`::warning::${message}`)
}

function notice(message) {
  console.log(`::notice::${message}`)
}

function getEnv(name, fallback) {
  const v = process.env[name]
  if (v && v.length > 0) return v
  if (fallback !== undefined) return fallback
  fail(`Missing required env var: ${name}`, 2)
}

const PR_NUMBER = getEnv('PR_NUMBER')
const REPO = getEnv('GITHUB_REPOSITORY')
const RELAY_KEY = getEnv('CRANE_RELAY_KEY')
const API_BASE = getEnv('CRANE_API_BASE', DEFAULT_API_BASE)
const GRACE_MINUTES = parseInt(getEnv('GRACE_MINUTES', '5'), 10)
// Changed surface files the PR must PROVE. Empty when the workflow didn't pass
// them (older workflow) — then we degrade to existence-only.
const SURFACE_FILES = new Set(
  getEnv('SURFACE_FILES', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
)
// Only live observations prove a seam carried data — reading docs does not.
const PROOF_METHODS = new Set(['live_state', 'fresh_process'])

// Step 1: pull PR body + createdAt via gh CLI.
let prJson
try {
  const out = execSync(
    `gh pr view ${JSON.stringify(PR_NUMBER)} --repo ${JSON.stringify(REPO)} --json body,createdAt`,
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  )
  prJson = JSON.parse(out)
} catch (err) {
  fail(`gh pr view failed: ${err instanceof Error ? err.message : String(err)}`, 2)
}

const body = prJson.body ?? ''
const createdAt = prJson.createdAt
if (!createdAt) {
  fail(`PR ${PR_NUMBER} returned no createdAt; cannot compute grace window`, 2)
}

const ageMs = Date.now() - new Date(createdAt).getTime()
const ageMinutes = ageMs / 60_000
const inGrace = ageMinutes < GRACE_MINUTES

// Step 2: extract vfy_ IDs.
const matches = body.match(VFY_REGEX) ?? []
const ids = Array.from(new Set(matches))

console.log(`PR #${PR_NUMBER} age: ${ageMinutes.toFixed(1)} min (grace = ${GRACE_MINUTES} min)`)
console.log(`Extracted ${ids.length} unique vfy_ ID(s) from body`)

if (ids.length === 0) {
  if (inGrace) {
    warn(
      `PR opened recently (${ageMinutes.toFixed(1)} min ago) with no verifications listed in body. ` +
        `Gate will re-run on body edit or after ${GRACE_MINUTES} min — this run reports neutral. ` +
        `Edit the PR body to add a "## Verifications" block with vfy_ IDs from your crane_verify calls. ` +
        `See docs/global/verify.md.`
    )
    process.exit(0)
  }
  fail(
    `No vfy_ IDs found in PR body (PR is ${ageMinutes.toFixed(1)} min old, past ${GRACE_MINUTES} min grace). ` +
      `This PR touches a surface class that requires verification evidence. ` +
      `Run crane_verify on the runtime claim, then add the returned vfy_ ID to the "## Verifications" block ` +
      `in the PR body. See docs/global/verify.md, or apply the skip-verify-gate label with rationale to bypass.`
  )
}

// Step 3: lookup IDs in the ledger.
const idsParam = ids.map((s) => encodeURIComponent(s)).join(',')
const url = `${API_BASE.replace(/\/$/, '')}/verify/lookup?ids=${idsParam}`

let lookup
try {
  const res = await fetch(url, { headers: { 'X-Relay-Key': RELAY_KEY } })
  if (!res.ok) {
    const text = await res.text()
    fail(`/verify/lookup failed (${res.status}): ${text}`, 2)
  }
  lookup = await res.json()
} catch (err) {
  fail(
    `Network error calling /verify/lookup: ${err instanceof Error ? err.message : String(err)}`,
    2
  )
}

const exists = lookup.exists ?? {}
const missing = ids.filter((id) => exists[id] !== true)

if (missing.length > 0) {
  fail(
    `${missing.length} vfy_ ID(s) listed in PR body do not exist in the ledger:\n  ${missing.join('\n  ')}\n\n` +
      `Either the IDs are typos (re-paste from your crane_verify output), or the records were never created. ` +
      `Run crane_verify and use the returned IDs.`
  )
}

notice(`All ${ids.length} vfy_ ID(s) exist in the ledger.`)

// Step 4: relevance + aliveness. At least one listed verification must PROVE a
// changed seam. Degrade loudly (warn + pass) when we lack the inputs to judge
// relevance — never silently, and never fail-closed on a worker version skew.
const records = lookup.records
if (!records) {
  warn(
    `verify gate running in EXISTENCE-ONLY mode: the crane-context worker did not return ` +
      `per-record detail (it predates the relevance+aliveness check). IDs exist but the gate ` +
      `could not confirm any one names a changed seam. Deploy the updated worker to enforce.`
  )
  process.exit(0)
}
if (SURFACE_FILES.size === 0) {
  warn(
    `verify gate running in EXISTENCE-ONLY mode: no SURFACE_FILES were provided by the workflow, ` +
      `so relevance cannot be judged. IDs exist; passing. Update pr-verify-gate.yml to pass surface_files.`
  )
  process.exit(0)
}

const qualifying = ids.filter((id) => {
  const r = records[id]
  if (!r) return false
  if (!PROOF_METHODS.has(r.method)) return false
  if (r.output_nonempty !== true) return false
  return (r.files_touched ?? []).some((f) => SURFACE_FILES.has(f))
})

if (qualifying.length === 0) {
  fail(
    `No listed verification PROVES a changed seam. A qualifying record must be a ` +
      `live_state or fresh_process observation whose files_touched names one of the changed ` +
      `surface files and whose captured output showed data (not []/empty).\n\n` +
      `Changed surface files:\n  ${[...SURFACE_FILES].join('\n  ')}\n\n` +
      `${ids.length} ID(s) exist but none qualify. Run crane_verify against the actual seam ` +
      `(pass files_touched naming the changed file), then add its vfy_ ID to the PR body. ` +
      `See docs/global/verify.md, or apply skip-verify-gate with rationale to bypass.`
  )
}

notice(`${qualifying.length} verification(s) prove the changed seam(s): ${qualifying.join(', ')}`)
process.exit(0)
