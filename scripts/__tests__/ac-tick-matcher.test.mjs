// Tests for the AC-tick matcher.
//
// This logic decides whether a merged PR's claim ticks an acceptance criterion
// on an issue, across nine ventures, and until now it had no test in any repo.
// Its only documented verification was a prose checklist in a runbook.
//
// Every accepting case below has a matching refusing case. A matcher that only
// ever says yes has measured nothing -- and here the failure is asymmetric: a
// wrong tick certifies work as done that is not, and unmet-ac-on-close then
// waves the issue through. Refusing is recoverable; mis-ticking is not.
//
// Run: node scripts/__tests__/ac-tick-matcher.test.mjs
//      (or `npm run test:scripts`, which discovers this file)

import {
  parseAcStatusTable,
  normalize,
  normalizeStatus,
  extractIssueAcs,
  matchAc,
  applyTicks,
} from '../ac-tick-matcher.mjs'

let passed = 0
const failures = []
function expect(label, condition, detail = '') {
  if (condition) {
    passed++
  } else {
    failures.push(`${label}${detail ? ` -- ${detail}` : ''}`)
  }
}

const TABLE = [
  '| AC (verbatim from issue) | Status | Evidence |',
  '| --- | --- | --- |',
  '| (repo) the thing is done | met | file.ts:12 |',
].join('\n')

// ---------------------------------------------------------------- heading
// Measured 2026-08-24: of 73 merging PRs behind stuck issues, 6 carried an
// acceptance section under a heading the matcher rejected. These are the real
// heading texts from that census.

expect(
  'heading: "Acceptance criteria status" still parses',
  parseAcStatusTable(`## Acceptance criteria status\n\n${TABLE}`)?.length === 1
)
expect(
  'heading: bare "Acceptance criteria" parses (3 real PRs)',
  parseAcStatusTable(`## Acceptance criteria\n\n${TABLE}`)?.length === 1
)
expect(
  'heading: "Acceptance criteria - (repo) rows only" parses',
  parseAcStatusTable(`## Acceptance criteria — (repo) rows only\n\n${TABLE}`)?.length === 1
)
expect(
  'heading: "Acceptance criteria (from the wired contract)" parses',
  parseAcStatusTable(`## Acceptance criteria (from the wired contract)\n\n${TABLE}`)?.length === 1
)

// Falsifiers: the widened match must not swallow unrelated sections, and a
// section with no table is still nothing to tick.
expect(
  'heading falsifier: an unrelated H2 yields null',
  parseAcStatusTable(`## Summary\n\n${TABLE}`) === null
)
expect(
  'heading falsifier: acceptance section with no table yields null',
  parseAcStatusTable('## Acceptance criteria\n\n- [ ] a checkbox, not a table\n') === null
)
expect(
  'heading falsifier: the template placeholder row is not a row',
  parseAcStatusTable(
    '## Acceptance criteria status\n\n| AC | Status | Evidence |\n| --- | --- | --- |\n| | met / deferred / n/a | |\n'
  ) === null
)

// ---------------------------------------------------------- status cell
// Measured 2026-08-24: 4 rows were dropped before matching because the status
// cell carried a qualifier. All four strings below are real.

for (const s of [
  'met',
  'met (defect fixed)',
  'met (stronger)',
  'met (shape correction)',
  'met (skeleton touch-ups deferred to PR 3, see below)',
  'Met ✅',
  'met — see below',
]) {
  expect(
    `status: ${JSON.stringify(s)} counts as met`,
    normalizeStatus(s) === 'met',
    normalizeStatus(s)
  )
}

// Falsifiers. Widening a non-verdict into "met" is the one thing this function
// must never do -- it would tick an AC the author explicitly did not claim.
for (const s of [
  'deferred to the runtime pass',
  'n/a',
  'not met',
  'unmet',
  'met / deferred / n/a',
  'partially met',
  '',
]) {
  expect(
    `status falsifier: ${JSON.stringify(s)} is NOT met`,
    normalizeStatus(s) !== 'met',
    normalizeStatus(s)
  )
}

// ------------------------------------------------------------ the tiers

const ISSUE = [
  '## Acceptance criteria',
  '',
  '- [ ] (repo) alpha does the alpha thing',
  '- [ ] (repo) beta does the beta thing',
].join('\n')

const acs = extractIssueAcs(ISSUE)
expect('issue ACs: two unchecked rows found', acs.length === 2)

expect(
  'tier 2: normalized exact text matches',
  matchAc({ ac: '(repo) alpha does the alpha thing' }, acs, false, 0).tier === 'text'
)
expect(
  'tier 2 falsifier: an unrelated row does not match',
  matchAc({ ac: '(repo) gamma does something else' }, acs, false, 0).match === null
)
expect(
  'tier 1: a leading H-code matches on the code alone',
  matchAc(
    { ac: 'H2 reworded entirely' },
    extractIssueAcs('## Acceptance criteria\n\n- [ ] H2 the original wording\n'),
    false,
    0
  ).tier === 'h-code'
)
expect(
  'tier 3: positional applies only when allowed',
  matchAc({ ac: 'nothing like the ACs' }, acs, true, 0).tier === 'positional'
)
expect(
  'tier 3 falsifier: positional refused when not allowed',
  matchAc({ ac: 'nothing like the ACs' }, acs, false, 0).match === null
)

// --------------------------------------------- the refusal that must hold
// Real strings from ss-console #2490 / PR #2493. The PR row is the issue AC
// with its tail dropped to fit a table column, and the tail --
// "and `resolve_template` returns the bytes that were just filed" -- is a
// separate obligation the PR's cited evidence does not assert.
//
// A prefix-matching tier was designed for exactly this row and then rejected,
// because truncation removes the TAIL and in AC prose the tail is where the
// second conjunct lives. This test pins the refusal so a future tier cannot
// quietly start ticking it.

const REAL_ISSUE_AC =
  '(repo) Test: a seat config with an override + an establishment file lands on ONE name, and `resolve_template` returns the bytes that were just filed'
const REAL_PR_ROW =
  '(repo) Test: a seat config with an override + an establishment file lands on ONE name'

const realAcs = extractIssueAcs(
  `## Acceptance criteria\n\n- [ ] ${REAL_ISSUE_AC}\n- [ ] (repo) something else entirely\n`
)
expect(
  'ss#2490: a row that drops an "and ..." conjunct must still REFUSE',
  matchAc({ ac: REAL_PR_ROW }, realAcs, false, 0).match === null,
  'a wrong tick here certifies an unproven obligation'
)
expect(
  'ss#2490: the row really is a prefix of the AC (so the refusal is the deliberate one)',
  normalize(REAL_ISSUE_AC).startsWith(normalize(REAL_PR_ROW))
)

// ------------------------------------------------------------- applyTicks

const ticked = applyTicks(ISSUE, [{ issueAc: acs[0] }])
expect(
  'applyTicks: the matched line becomes [x]',
  ticked.includes('- [x] (repo) alpha does the alpha thing')
)
expect(
  'applyTicks: the unmatched line is untouched',
  ticked.includes('- [ ] (repo) beta does the beta thing')
)

// ----------------------------------------------------------------- report

console.log(`ac-tick-matcher: ${passed} passed, ${failures.length} failed`)
if (failures.length > 0) {
  for (const f of failures) console.error(`  FAIL ${f}`)
  process.exit(1)
}
if (passed === 0) {
  console.error('FAIL: no assertions ran. A suite that asserts nothing is not a pass.')
  process.exit(1)
}
