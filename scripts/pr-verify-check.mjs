#!/usr/bin/env node
//
// pr-verify-check.mjs — PR-CI verify gate (Layer of Prong 2).
//
// Reads the PR body, extracts vfy_<ULID> IDs, and confirms each one exists
// in the verify_ledger. Used by .github/workflows/pr-verify-gate.yml.
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
//
// Exit codes:
//   0  — pass (or grace window: warn-only)
//   1  — fail (zero IDs past grace, or any listed ID missing from ledger)
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

notice(`All ${ids.length} vfy_ ID(s) verified against the ledger.`)
process.exit(0)
