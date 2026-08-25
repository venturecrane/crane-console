#!/usr/bin/env node
//
// Keep the AC-tick matcher in exactly one place.
//
// WHY. The matcher is 200-odd lines of pure string logic that decides whether a
// merged PR's claim ticks an acceptance criterion on an issue. It lived only
// inside tick-acs-on-merge-reusable.yml's `script:` block, where no test can
// reach it -- and it had none, in any of the nine repos that run it.
//
// It cannot simply be imported at runtime. That workflow is a `workflow_call`
// reusable with no checkout step, so on a caller's runner ${GITHUB_WORKSPACE}
// is the CALLER's workspace; importing from there would throw
// ERR_MODULE_NOT_FOUND for every venture. The one cross-repo precedent
// (regression-claim-origin-reusable.yml) sparse-checks-out crane-console at
// `ref: main`, which lets the parser and the workflow version drift apart --
// unacceptable for something pinned as @tick-acs-v1.
//
// So: scripts/ac-tick-matcher.mjs is the source and carries the tests; the
// workflow keeps a spliced copy between markers; this script regenerates it and
// `--check` fails CI when they diverge. The workflow stays hermetic, the logic
// stays tested, and the two cannot silently disagree.
//
// Usage:
//   node scripts/sync-ac-tick-matcher.mjs           # rewrite the workflow
//   node scripts/sync-ac-tick-matcher.mjs --check    # exit 1 on drift
//
// Same shape as sync-commands.sh --check, already in `npm run verify`.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODULE_PATH = join(ROOT, 'scripts/ac-tick-matcher.mjs')
const WORKFLOW_PATH = join(ROOT, '.github/workflows/tick-acs-on-merge-reusable.yml')

const BEGIN = '==== BEGIN SHARED MATCHER (spliced into the workflow; do not edit there) ===='
const END = '==== END SHARED MATCHER ===='
const INDENT = ' '.repeat(12) // the `script: |` block's indentation

function sharedRegion() {
  const src = readFileSync(MODULE_PATH, 'utf8')
  const from = src.indexOf(`// ${BEGIN}`)
  const to = src.indexOf(`// ${END}`)
  if (from === -1 || to === -1) {
    console.error(`FAIL: markers not found in ${MODULE_PATH}. Both must be present verbatim.`)
    process.exit(2)
  }
  return src.slice(from, to + `// ${END}`.length).trimEnd()
}

function indented(region) {
  return region
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : INDENT + line))
    .join('\n')
}

function splice(workflow, block) {
  const from = workflow.indexOf(`${INDENT}// ${BEGIN}`)
  const to = workflow.indexOf(`${INDENT}// ${END}`)
  if (from === -1 || to === -1) {
    console.error(`FAIL: markers not found in ${WORKFLOW_PATH}.`)
    console.error('The workflow must carry both marker lines at 12-space indent.')
    process.exit(2)
  }
  return workflow.slice(0, from) + block + workflow.slice(to + `${INDENT}// ${END}`.length)
}

const check = process.argv.includes('--check')
const workflow = readFileSync(WORKFLOW_PATH, 'utf8')
const next = splice(workflow, indented(sharedRegion()))

if (next === workflow) {
  console.log('OK: workflow matcher block matches scripts/ac-tick-matcher.mjs.')
  process.exit(0)
}

if (check) {
  console.error('DRIFT: the matcher block in tick-acs-on-merge-reusable.yml no longer')
  console.error('matches scripts/ac-tick-matcher.mjs.')
  console.error('')
  console.error('Edit the MODULE (it carries the tests), never the workflow copy, then run:')
  console.error('  node scripts/sync-ac-tick-matcher.mjs')
  process.exit(1)
}

writeFileSync(WORKFLOW_PATH, next)
console.log('Rewrote the matcher block in tick-acs-on-merge-reusable.yml.')
