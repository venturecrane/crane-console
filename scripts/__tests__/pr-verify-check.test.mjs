#!/usr/bin/env node
//
// Pure-JS unit test for scripts/pr-verify-check.mjs.
//
// The script is executed as a subprocess with controlled env and a mocked
// HTTP server bound to a local port. Two side-channel mocks:
//   - PR_GH_VIEW_OUTPUT — pre-baked gh pr view JSON (the script's `gh pr view`
//     call is monkey-patched out via PATH override + a wrapper script)
//   - CRANE_API_BASE pointing to a tiny local HTTP server
//
// Run from repo root:  node scripts/__tests__/pr-verify-check.test.mjs

import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SCRIPT = join(__dirname, '..', 'pr-verify-check.mjs')

let pass = 0
let fail = 0
const fails = []

function expect(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`)
    pass++
  } else {
    console.log(`  ✗ ${label}  ${detail}`)
    fail++
    fails.push({ label, detail })
  }
}

// Build a tmp dir with a fake `gh` binary that prints whatever JSON we
// supplied via PR_GH_VIEW_OUTPUT.
function makeFakeGhBin(prViewJson) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-gh-'))
  const binDir = join(dir, 'bin')
  mkdirSync(binDir)
  const ghPath = join(binDir, 'gh')
  writeFileSync(
    ghPath,
    `#!/usr/bin/env bash
# Fake gh used by pr-verify-check tests. Recognizes "pr view <num> --json ...".
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  cat <<'JSON'
${prViewJson}
JSON
  exit 0
fi
echo "fake-gh: unsupported command: $@" >&2
exit 1
`
  )
  chmodSync(ghPath, 0o755)
  return binDir
}

// Spin up an HTTP server that responds to GET /verify/lookup?ids=...
// with the per-ID exists map provided by the caller.
function startMockApi(routes) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const route = routes[req.url]
      if (route) {
        const status = route.status ?? 200
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(route.body))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'not found', url: req.url }))
      }
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, base: `http://127.0.0.1:${port}` })
    })
  })
}

// Async spawn so the parent process can keep serving HTTP requests while
// the child runs. spawnSync deadlocks: it blocks the parent's event loop,
// so the parent's mock server never accepts the child's fetch, child hangs.
function runScript({ ghBin, env }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: {
        ...process.env,
        PATH: `${ghBin}:${process.env.PATH}`,
        ...env,
      },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) => resolve({ exitCode: code, stdout, stderr }))
  })
}

const NOW = new Date()
const RECENT_TS = new Date(NOW.getTime() - 60_000).toISOString() // 1 min ago
const OLD_TS = new Date(NOW.getTime() - 30 * 60_000).toISOString() // 30 min ago

const VALID_ID = 'vfy_01HQXV3NK8YXM3G5ZXQXQXQXQX'
const VALID_ID_2 = 'vfy_01HQXV3NK8YXM3G5ZXQXAAAAAA'
const FAKE_ID = 'vfy_01HQXV3NK8YXM3G5ZXQXFAKEFA'

console.log('PR-CI verify check tests:')

// Test 1: zero IDs + recent PR → grace warning, exit 0
{
  const ghBin = makeFakeGhBin(JSON.stringify({ body: 'No vfy IDs here', createdAt: RECENT_TS }))
  const api = await startMockApi({})
  const out = await runScript({
    ghBin,
    env: {
      PR_NUMBER: '999',
      GITHUB_REPOSITORY: 'test/test',
      CRANE_RELAY_KEY: 'k',
      CRANE_API_BASE: api.base,
    },
  })
  api.server.close()
  expect('zero IDs + recent PR → exit 0 (grace)', out.exitCode === 0, `(exit ${out.exitCode})`)
  expect(
    'zero IDs + recent PR → emits warning annotation',
    /::warning::/.test(out.stdout) || /::warning::/.test(out.stderr)
  )
}

// Test 2: zero IDs + old PR → fail
{
  const ghBin = makeFakeGhBin(JSON.stringify({ body: 'No vfy IDs here', createdAt: OLD_TS }))
  const api = await startMockApi({})
  const out = await runScript({
    ghBin,
    env: {
      PR_NUMBER: '999',
      GITHUB_REPOSITORY: 'test/test',
      CRANE_RELAY_KEY: 'k',
      CRANE_API_BASE: api.base,
    },
  })
  api.server.close()
  expect('zero IDs + old PR → exit 1 (fail)', out.exitCode === 1, `(exit ${out.exitCode})`)
  expect(
    'zero IDs + old PR → emits error annotation',
    /::error::/.test(out.stderr) || /::error::/.test(out.stdout)
  )
}

// Test 3: valid IDs all exist → pass
{
  const body = `## Summary\nFoo\n\n## Verifications\n- ${VALID_ID} · live_state · claim 1\n- ${VALID_ID_2} · fresh_process · claim 2`
  const ghBin = makeFakeGhBin(JSON.stringify({ body, createdAt: OLD_TS }))
  const api = await startMockApi({
    [`/verify/lookup?ids=${VALID_ID},${VALID_ID_2}`]: {
      body: { exists: { [VALID_ID]: true, [VALID_ID_2]: true } },
    },
  })
  const out = await runScript({
    ghBin,
    env: {
      PR_NUMBER: '1',
      GITHUB_REPOSITORY: 'test/test',
      CRANE_RELAY_KEY: 'k',
      CRANE_API_BASE: api.base,
    },
  })
  api.server.close()
  expect(
    'valid IDs all exist → exit 0',
    out.exitCode === 0,
    `(exit ${out.exitCode}, stderr: ${out.stderr.slice(0, 200)})`
  )
  expect('valid IDs all exist → emits notice annotation', /::notice::/.test(out.stdout))
}

// Test 4: one valid + one missing → fail with names
{
  const body = `## Verifications\n- ${VALID_ID}\n- ${FAKE_ID}`
  const ghBin = makeFakeGhBin(JSON.stringify({ body, createdAt: OLD_TS }))
  const api = await startMockApi({
    [`/verify/lookup?ids=${VALID_ID},${FAKE_ID}`]: {
      body: { exists: { [VALID_ID]: true, [FAKE_ID]: false } },
    },
  })
  const out = await runScript({
    ghBin,
    env: {
      PR_NUMBER: '1',
      GITHUB_REPOSITORY: 'test/test',
      CRANE_RELAY_KEY: 'k',
      CRANE_API_BASE: api.base,
    },
  })
  api.server.close()
  expect('mix of valid + missing → exit 1', out.exitCode === 1)
  expect('error message names the missing ID', out.stderr.includes(FAKE_ID))
  expect('valid ID is NOT in the missing list', !out.stderr.includes(`${VALID_ID}\n  ${VALID_ID}`))
}

// Test 5: API returns 500 → script error (exit 2)
{
  const body = `## Verifications\n- ${VALID_ID}`
  const ghBin = makeFakeGhBin(JSON.stringify({ body, createdAt: OLD_TS }))
  const api = await startMockApi({
    [`/verify/lookup?ids=${VALID_ID}`]: {
      status: 500,
      body: { error: 'internal' },
    },
  })
  const out = await runScript({
    ghBin,
    env: {
      PR_NUMBER: '1',
      GITHUB_REPOSITORY: 'test/test',
      CRANE_RELAY_KEY: 'k',
      CRANE_API_BASE: api.base,
    },
  })
  api.server.close()
  expect('API 500 → exit 2 (script error)', out.exitCode === 2, `(exit ${out.exitCode})`)
}

// Test 6: de-duplication of repeated IDs in body
{
  const body = `## Verifications\nClaim A: ${VALID_ID}\n\nAlso seen here: ${VALID_ID}\n\nAnd here: ${VALID_ID}`
  const ghBin = makeFakeGhBin(JSON.stringify({ body, createdAt: OLD_TS }))
  const api = await startMockApi({
    [`/verify/lookup?ids=${VALID_ID}`]: {
      body: { exists: { [VALID_ID]: true } },
    },
  })
  const out = await runScript({
    ghBin,
    env: {
      PR_NUMBER: '1',
      GITHUB_REPOSITORY: 'test/test',
      CRANE_RELAY_KEY: 'k',
      CRANE_API_BASE: api.base,
    },
  })
  api.server.close()
  expect('repeated IDs are de-duplicated and pass', out.exitCode === 0)
  expect('script reports 1 unique ID, not 3', /1 unique vfy_ ID/.test(out.stdout))
}

console.log(`\nResult: ${pass} passed, ${fail} failed`)
if (fail > 0) {
  for (const f of fails) console.log(`  - ${f.label}: ${f.detail}`)
  process.exit(1)
}
