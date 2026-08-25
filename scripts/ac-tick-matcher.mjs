// AC-tick matcher: the pure half, extracted so it can be unit-tested.
//
// WHY THIS FILE EXISTS. The matcher lived as 534 lines of github-script inside
// tick-acs-on-merge-reusable.yml with no test, no fixture and no CI coverage in
// any repo -- the same shape run-shell-tests.sh was written to condemn ("tests
// that nothing runs are the same defect as a check that cannot fail"). A
// workflow `script:` body cannot be executed by any test, so the part that
// decides was not written in one.
//
// It is NOT imported at runtime. tick-acs-on-merge-reusable.yml is a
// `workflow_call` reusable with no checkout step, so `${GITHUB_WORKSPACE}` on a
// caller's runner is the CALLER's workspace -- importing from there would throw
// ERR_MODULE_NOT_FOUND on all nine ventures the moment their pin moved. Instead
// the workflow keeps an inline copy between generated markers, and
// scripts/sync-ac-tick-matcher.mjs --check fails CI if the two drift apart. One
// source of truth, zero runtime change, full testability.
//
// WHAT THE REPLAY SAID (2026-08-24, 33 ss-console issues x 73 merging PRs).
// Refusal causes, measured rather than assumed:
//
//     53 of 73 PRs   no acceptance-criteria section at all
//     11             a heading the matcher accepts
//      6             an acceptance section under a heading it REJECTED
//      3             a status table with no heading
//
// and among rows that were reached: 9 ticked, 7 refused on internal rewording,
// 4 refused on status-cell variance ("met (defect fixed)"), 1 on a truncated
// prefix. So the two fixes here -- a wider heading match and a normalized status
// cell -- are the deterministic recoveries. Fuzzy row matching is deliberately
// NOT added: it would have addressed one row, and on the fixture that motivated
// it, it would have ticked an AC whose dropped "and ..." tail was a separate,
// unproven obligation. A wrong tick is worse than a refusal, because
// unmet-ac-on-close then waves it through.
//
// Everything below the marker is spliced verbatim into the workflow. Keep it
// pure: no `github`, no `core`, no network, no Node built-ins.
//
// @see scripts/sync-ac-tick-matcher.mjs
// @see scripts/__tests__/ac-tick-matcher.test.mjs
// @see docs/runbooks/ac-tick-workflow-rollout.md

// ==== BEGIN SHARED MATCHER (spliced into the workflow; do not edit there) ====

// Return the body of the first H2 section whose title starts with `prefix`,
// or null when there is none.
//
// Both parseAcStatusTable and extractIssueAcs carried their own copy of this
// scan, with subtly different prefixes ('acceptance criteria status' vs
// 'acceptance'). Sharing it removed the duplication and dropped
// parseAcStatusTable under the repo's complexity ceiling, which extracting the
// matcher out of the workflow YAML is what exposed -- eslint never saw this
// code while it lived inside a `script:` block.
function findSection(body, prefix) {
  const H2 = /^##\s+(.+?)\s*$/gm
  const headings = [...body.matchAll(H2)]
  for (let i = 0; i < headings.length; i++) {
    if (!headings[i][1].trim().toLowerCase().startsWith(prefix)) continue
    const start = headings[i].index + headings[i][0].length
    const end = i + 1 < headings.length ? headings[i + 1].index : body.length
    return body.slice(start, end)
  }
  return null
}

// Parse the PR body's "## Acceptance criteria status" table.
// Returns: array of { ac, status, evidence } | null on no/bad match.
function parseAcStatusTable(body) {
  const found = findSection(body, 'acceptance criteria')
  if (found === null) return null

  // Strip HTML comments from section before parsing.
  const section = found.replace(/<!--[\s\S]*?-->/g, '')

  const lines = section.split('\n').map((l) => l.trim())
  const rows = []
  let sawHeader = false
  let sawSeparator = false

  for (const line of lines) {
    if (!line.startsWith('|')) {
      if (sawSeparator && line === '') continue // blank within/after table
      if (sawSeparator) break // non-pipe content → table ended
      continue
    }
    if (!sawHeader) {
      sawHeader = true
      continue
    }
    if (!sawSeparator) {
      sawSeparator = true
      continue
    }

    const cells = splitTableRow(line)
    if (cells.length < 3) continue
    const ac = cells[0].trim()
    const status = cells[1].trim()
    const evidence = cells[2].trim()

    // Skip the literal template placeholder row (empty AC, or
    // status that's still the templated `met / deferred / n/a`).
    if (!ac) continue
    if (status.toLowerCase() === 'met / deferred / n/a') continue
    if (ac.toLowerCase().includes('verbatim from issue')) continue

    rows.push({ ac, status, evidence })
  }
  return rows.length > 0 ? rows : null
}

// Split a markdown table row into cells, tolerating escaped pipes.
function splitTableRow(line) {
  // Trim leading/trailing pipes, then split on unescaped pipes.
  const trimmed = line.replace(/^\|/, '').replace(/\|$/, '')
  const cells = []
  let buf = ''
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '\\' && trimmed[i + 1] === '|') {
      buf += '|'
      i++
    } else if (ch === '|') {
      cells.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  cells.push(buf)
  return cells
}

// Normalize a status cell down to its bare verdict.
//
// Authors qualify the cell in prose. Real examples from the 2026-08-24 replay:
// "met (defect fixed)", "met (stronger)", "met (shape correction)",
// "met (skeleton touch-ups deferred to PR 3, see below)". The caller compared
// `status.toLowerCase().trim() === 'met'`, so every one of those read as
// not-met and the row was never offered to the matcher at all -- 4 of 85
// outcomes, refused before any matching logic ran.
//
// Strips a trailing parenthetical, then a trailing em/en-dash clause, then
// pictographic characters, then case and whitespace. Deliberately conservative:
// it only removes decoration from around a verdict already present, and can
// never widen "deferred" or "n/a" into "met". Hyphens are left alone so
// hyphenated words survive.
function normalizeStatus(status) {
  return String(status ?? '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/\s*[—–]\s[\s\S]*$/, '')
    .replace(/[\p{Extended_Pictographic}️]/gu, '')
    .trim()
    .toLowerCase()
}

// Normalize AC text for fallback exact-equality matching.
function normalize(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?]+$/, '')
}

// Extract a leading H-code (H1, H15, AC2, etc.) if present.
function extractHCode(text) {
  const m = text.match(/^\s*\*\*([A-Z]+\d+)\*\*/) || text.match(/^\s*([A-Z]+\d+)\b/)
  return m ? m[1] : null
}

// Find the "Acceptance criteria" section in an issue body and
// return [{ raw, text, hCode }] for each `- [ ]` line.
function extractIssueAcs(body) {
  const section = findSection(body, 'acceptance')
  if (section === null) return []

  const UNCHECKED = /^(\s*-\s+\[ \]\s+)(.+?)\s*$/gm
  const result = []
  let m
  while ((m = UNCHECKED.exec(section)) !== null) {
    result.push({
      prefix: m[1],
      text: m[2],
      hCode: extractHCode(m[2]),
    })
  }
  return result
}

// Match a "met" AC-table row against issue ACs using the three-tier
// matcher. Returns { match: ac | null, tier: 'h-code' | 'text' | 'positional' | null, reason }.
function matchAc(metRow, issueAcs, allowPositional, positionalIndex) {
  const tableHCode = extractHCode(metRow.ac)

  // Tier 1: H-code primary
  if (tableHCode) {
    const candidates = issueAcs.filter((a) => a.hCode === tableHCode)
    if (candidates.length === 1) {
      return { match: candidates[0], tier: 'h-code' }
    }
    if (candidates.length > 1) {
      return {
        match: null,
        tier: null,
        reason: `H-code ${tableHCode} matched ${candidates.length} ACs`,
      }
    }
    // 0 H-code matches → fall through to text matching.
  }

  // Tier 2: normalized exact text
  const normTable = normalize(metRow.ac)
  const candidates = issueAcs.filter((a) => normalize(a.text) === normTable)
  if (candidates.length === 1) {
    return { match: candidates[0], tier: 'text' }
  }
  if (candidates.length > 1) {
    return {
      match: null,
      tier: null,
      reason: `Text matched ${candidates.length} ACs`,
    }
  }

  // Tier 3: positional (gated)
  if (allowPositional && positionalIndex < issueAcs.length) {
    return {
      match: issueAcs[positionalIndex],
      tier: 'positional',
    }
  }

  return {
    match: null,
    tier: null,
    reason: 'No match',
  }
}

// Find the closest issue AC to a given row text (for the "refused"
// surfaceing in the audit comment). Levenshtein-lite via shared word
// count.
function closestIssueAc(rowText, issueAcs) {
  const rowWords = new Set(
    normalize(rowText)
      .split(/\s+/)
      .filter((w) => w.length > 3)
  )
  if (rowWords.size === 0) return null
  let best = null
  let bestScore = 0
  for (const ac of issueAcs) {
    const acWords = new Set(
      normalize(ac.text)
        .split(/\s+/)
        .filter((w) => w.length > 3)
    )
    let shared = 0
    for (const w of rowWords) if (acWords.has(w)) shared++
    if (shared > bestScore) {
      bestScore = shared
      best = ac
    }
  }
  // 1 shared content word is enough for an informational suggestion;
  // human reads and judges, false suggestions are harmless.
  return bestScore >= 1 ? best : null
}

// Apply ticks: replace `- [ ] {text}` with `- [x] {text}` for each
// matched AC line. Returns updated body.
function applyTicks(body, matches) {
  let updated = body
  for (const { issueAc } of matches) {
    const target = `${issueAc.prefix}${issueAc.text}`
    const ticked = target.replace(/\[ \]/, '[x]')
    // Replace exactly once. If line not found verbatim, the body
    // changed since fetch — caller handles via retry.
    const idx = updated.indexOf(target)
    if (idx === -1) continue
    updated = updated.slice(0, idx) + ticked + updated.slice(idx + target.length)
  }
  return updated
}
// ==== END SHARED MATCHER ====

export {
  parseAcStatusTable,
  splitTableRow,
  normalize,
  findSection,
  normalizeStatus,
  extractHCode,
  extractIssueAcs,
  matchAc,
  closestIssueAc,
  applyTicks,
}
