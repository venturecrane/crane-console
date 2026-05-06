#!/usr/bin/env node
//
// Pure-JS unit test for scripts/regression-parse-files.mjs.
//
// Spawns the script as a subprocess with ISSUE_BODY env. No HTTP server,
// no fixtures-on-disk — fast and deterministic.

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SCRIPT = join(__dirname, '..', 'regression-parse-files.mjs')

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

function run(issueBody) {
  const out = spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, ISSUE_BODY: issueBody },
    encoding: 'utf-8',
  })
  if (out.status !== 0 && out.status !== null) {
    throw new Error(`script exit ${out.status}\nstdout: ${out.stdout}\nstderr: ${out.stderr}`)
  }
  return JSON.parse(out.stdout.trim())
}

console.log('regression-parse-files tests:')

// Test 1: H3 path with simple bullets
{
  const body = `## Problem

Something broke.

### Affected files

- packages/crane-mcp/src/tools/handoff.ts
- workers/crane-context/src/endpoints/verify-ledger.ts

## Evidence

Stack trace here.`
  const result = run(body)
  expect('H3 parses simple bullets', result.source === 'h3', `(source=${result.source})`)
  expect('H3 finds 2 files', result.count === 2, `(count=${result.count})`)
  expect(
    'H3 first file is correct',
    result.files[0] === 'packages/crane-mcp/src/tools/handoff.ts',
    `(got: ${result.files[0]})`
  )
}

// Test 2: H3 with paths in backticks
{
  const body = `### Affected files

- \`packages/crane-mcp/src/tools/handoff.ts\`
- \`workers/crane-context/src/endpoints/verify-ledger.ts\``
  const result = run(body)
  expect('H3 strips backticks', result.files[0] === 'packages/crane-mcp/src/tools/handoff.ts')
  expect('H3 finds 2 files in backticks', result.count === 2)
}

// Test 3: H3 with inline comments stripped
{
  const body = `### Affected files

- packages/foo.ts # the broken one
- packages/bar.ts`
  const result = run(body)
  expect('H3 stops bullet at # comment', result.files[0] === 'packages/foo.ts')
  expect('H3 keeps clean second bullet', result.files[1] === 'packages/bar.ts')
}

// Test 4: H3 stops at next heading
{
  const body = `### Affected files

- packages/foo.ts

### Other Section

- packages/should-not-appear.ts`
  const result = run(body)
  expect('H3 stops at next H3', result.count === 1, `(count=${result.count})`)
  expect(
    'H3 does not include paths from next section',
    !result.files.includes('packages/should-not-appear.ts')
  )
}

// Test 5: dedup across H3 bullets
{
  const body = `### Affected files

- packages/foo.ts
- packages/foo.ts
- packages/bar.ts
- packages/foo.ts`
  const result = run(body)
  expect('H3 deduplicates', result.count === 2, `(count=${result.count})`)
}

// Test 6: missing H3 → fallback regex finds paths in prose
{
  const body = `## Problem

The change in packages/crane-mcp/src/tools/handoff.ts broke something. See also workers/crane-context/src/endpoints/verify-ledger.ts.`
  const result = run(body)
  expect(
    'fallback fires when H3 missing',
    result.source === 'fallback',
    `(source=${result.source})`
  )
  expect('fallback finds 2 paths in prose', result.count === 2, `(count=${result.count})`)
}

// Test 7: fallback dedups
{
  const body = `Found in packages/foo.ts. Also packages/foo.ts. And packages/foo.ts again.`
  const result = run(body)
  expect('fallback deduplicates', result.count === 1, `(count=${result.count})`)
  expect('fallback path is correct', result.files[0] === 'packages/foo.ts')
}

// Test 8: no paths anywhere → source: none
{
  const body = `## Problem

Just text. No file paths to be found.`
  const result = run(body)
  expect('source: none on empty body', result.source === 'none', `(source=${result.source})`)
  expect('count is 0', result.count === 0)
  expect('files is empty array', Array.isArray(result.files) && result.files.length === 0)
}

// Test 9: empty body
{
  const result = run('')
  expect('empty body → source: none', result.source === 'none')
  expect('empty body → count 0', result.count === 0)
}

// Test 10: H3 with only blank lines
{
  const body = `### Affected files

(none yet — will fill in)

## Evidence`
  const result = run(body)
  expect(
    'H3 with no bullets falls through to fallback',
    result.source === 'fallback' || result.source === 'none',
    `(source=${result.source})`
  )
}

// Test 11: cap at 20 paths
{
  const lines = ['### Affected files', '']
  for (let i = 0; i < 25; i++) {
    lines.push(`- packages/file-${i}.ts`)
  }
  const result = run(lines.join('\n'))
  expect('caps at 20 after dedup', result.count === 20, `(count=${result.count})`)
}

// Test 12: H3 case-insensitive
{
  const body = `### AFFECTED FILES

- packages/foo.ts`
  const result = run(body)
  expect(
    'H3 matches "AFFECTED FILES" case-insensitively',
    result.source === 'h3' && result.count === 1,
    `(source=${result.source}, count=${result.count})`
  )
}

// Test 13: bullets with asterisks instead of dashes
{
  const body = `### Affected files

* packages/foo.ts
* packages/bar.ts`
  const result = run(body)
  expect('H3 accepts * bullets', result.count === 2, `(count=${result.count})`)
}

console.log(`\nResult: ${pass} passed, ${fail} failed`)
if (fail > 0) {
  for (const f of fails) console.log(`  - ${f.label}: ${f.detail}`)
  process.exit(1)
}
