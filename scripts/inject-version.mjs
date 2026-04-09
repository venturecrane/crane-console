#!/usr/bin/env node
/**
 * scripts/inject-version.mjs
 *
 * Plan v3.1 §D.1. Build-time version metadata injection for Cloudflare
 * Workers in this monorepo. Writes `src/generated/build-info.ts` in the
 * target worker directory with commit SHA, build timestamp, and
 * schema hash (for crane-context).
 *
 * Invoked via each worker's wrangler.toml [build] command:
 *
 *   [build]
 *   command = "node ../../scripts/inject-version.mjs --service=crane-context"
 *
 * The generated build-info.ts is imported by the worker's /version
 * endpoint (see workers/<worker>/src/endpoints/version.ts).
 *
 * CODEOWNERS note: this file is owned by the captain. It is the source
 * of truth for the deployed-commit claim that invariant I-1 enforces.
 * Changes require captain review (see CODEOWNERS).
 *
 * Supply-chain hardening:
 * - Refuses to run if GITHUB_SHA env var is set (CI context) and
 *   disagrees with `git rev-parse HEAD`. This prevents a compromised
 *   CI workflow from forcing a fake commit SHA into build-info.
 * - Only reads the committed migrations/schema.hash for crane-context;
 *   never recomputes hashes at build time.
 *
 * Usage:
 *   node scripts/inject-version.mjs --service=crane-context
 *   node scripts/inject-version.mjs --service=crane-watch
 *   node scripts/inject-version.mjs --service=crane-mcp-remote
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

// ---- Args ----
const args = process.argv.slice(2)
let service = null
for (const a of args) {
  if (a.startsWith('--service=')) {
    service = a.slice('--service='.length)
  }
}
if (!service) {
  console.error('error: --service=<worker-name> is required')
  console.error(
    'usage: node scripts/inject-version.mjs --service=crane-context|crane-watch|crane-mcp-remote'
  )
  process.exit(2)
}

const ALLOWED_SERVICES = ['crane-context', 'crane-watch', 'crane-mcp-remote']
if (!ALLOWED_SERVICES.includes(service)) {
  console.error(`error: unknown service '${service}'. Allowed: ${ALLOWED_SERVICES.join(', ')}`)
  process.exit(2)
}

const WORKER_DIR = join(REPO_ROOT, 'workers', service)
const GENERATED_DIR = join(WORKER_DIR, 'src', 'generated')
const BUILD_INFO_PATH = join(GENERATED_DIR, 'build-info.ts')

if (!existsSync(WORKER_DIR)) {
  console.error(`error: worker directory not found: ${WORKER_DIR}`)
  process.exit(2)
}

// ---- Compute commit SHA ----
let commit
try {
  commit = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
} catch (err) {
  console.error('error: `git rev-parse HEAD` failed (not a git repo?)')
  console.error(err.message)
  process.exit(2)
}

// ---- Supply-chain guard ----
// If GITHUB_SHA is set (CI context) and disagrees with `git rev-parse HEAD`,
// something is wrong. Refuse to write a potentially-fake commit SHA.
if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== commit) {
  console.error('error: GITHUB_SHA env var disagrees with `git rev-parse HEAD`')
  console.error(`  GITHUB_SHA: ${process.env.GITHUB_SHA}`)
  console.error(`  git HEAD:   ${commit}`)
  console.error(
    'This usually indicates a CI-side commit SHA mismatch. Refusing to generate build-info.'
  )
  process.exit(2)
}

// ---- Build timestamp ----
const buildTimestamp = new Date().toISOString()

// ---- Schema hashes (crane-context only, both envs) ----
// The committed hash files are sourced from live D1 (via
// compute-schema-hash.sh --env=staging / --env=production). Each env has
// its own hash because live D1 stores historical SQL text and Cloudflare's
// internal d1_migrations DDL differs between staging and prod. The
// /admin/verify-schema endpoint picks the right hash at runtime based on
// env.ENVIRONMENT.
let schemaHashStaging = null
let schemaHashProd = null
if (service === 'crane-context') {
  const stagingPath = join(WORKER_DIR, 'migrations', 'schema.hash')
  const prodPath = join(WORKER_DIR, 'migrations', 'schema.production.hash')
  for (const [name, path, set] of [
    [
      'staging',
      stagingPath,
      (v) => {
        schemaHashStaging = v
      },
    ],
    [
      'production',
      prodPath,
      (v) => {
        schemaHashProd = v
      },
    ],
  ]) {
    if (!existsSync(path)) {
      console.error(`error: ${path} not found`)
      console.error(`Expected the ${name} schema hash to be committed. Run:`)
      console.error(
        `  bash workers/crane-context/scripts/compute-schema-hash.sh --env=${name} --update`
      )
      process.exit(2)
    }
    const h = readFileSync(path, 'utf8').trim()
    if (!/^[0-9a-f]{64}$/i.test(h)) {
      console.error(`error: ${path} does not contain a valid SHA-256 hex digest`)
      console.error(`  read: ${h}`)
      process.exit(2)
    }
    set(h)
  }
}

// ---- Generate build-info.ts ----
const safeService = JSON.stringify(service)
const safeCommit = JSON.stringify(commit)
const safeCommitShort = JSON.stringify(commit.slice(0, 7))
const safeBuildTimestamp = JSON.stringify(buildTimestamp)
const safeSchemaHashStaging = schemaHashStaging ? JSON.stringify(schemaHashStaging) : 'undefined'
const safeSchemaHashProd = schemaHashProd ? JSON.stringify(schemaHashProd) : 'undefined'

const content = `/**
 * AUTO-GENERATED — DO NOT EDIT.
 *
 * This file is generated by scripts/inject-version.mjs at build time
 * (invoked by wrangler.toml [build] command) and imported by the
 * /version endpoint. See plan v3.1 §D.1.
 */

export interface BuildInfo {
  readonly service: 'crane-context' | 'crane-watch' | 'crane-mcp-remote'
  readonly commit: string
  readonly commit_short: string
  readonly build_timestamp: string
  readonly schema_hash_staging: string | undefined
  readonly schema_hash_production: string | undefined
}

export const BUILD_INFO: BuildInfo = {
  service: ${safeService} as const,
  commit: ${safeCommit},
  commit_short: ${safeCommitShort},
  build_timestamp: ${safeBuildTimestamp},
  schema_hash_staging: ${safeSchemaHashStaging},
  schema_hash_production: ${safeSchemaHashProd},
} as const
`

// ---- Write ----
if (!existsSync(GENERATED_DIR)) {
  mkdirSync(GENERATED_DIR, { recursive: true })
}
writeFileSync(BUILD_INFO_PATH, content, 'utf8')

console.log(`✓ inject-version: ${service}`)
console.log(`  commit:          ${commit}`)
console.log(`  build_timestamp: ${buildTimestamp}`)
if (schemaHashStaging) {
  console.log(`  schema_hash_staging:    ${schemaHashStaging}`)
}
if (schemaHashProd) {
  console.log(`  schema_hash_production: ${schemaHashProd}`)
}
console.log(`  written to:      ${BUILD_INFO_PATH}`)
