---
name: content-scan
description: Triage tool scanning all ventures for publishable content candidates
---

# Content Scan

Read-only triage tool that scans all ventures for publishable content candidates. Produces a ranked list of article candidates, promotion candidates, and build log gaps. Does NOT draft anything - that's the build-log skill's job.

## Usage

```
content-scan              # Default: 7-day lookback
content-scan --days 14    # Custom lookback
content-scan --save       # Also save results to VCMS
```

## Arguments

Parse the arguments provided by the user:

- If `--days N` is present, set `LOOKBACK_DAYS` to N. Default: 7.
- If `--save` is present, set `SAVE_TO_VCMS` to true. Default: false.
- If no arguments, use defaults (7 days, no save).

---

## Step 1: Pre-flight

### 1a. Environment check

Verify `CRANE_CONTEXT_KEY` is set in the environment. If not, stop: "CRANE_CONTEXT_KEY not set. Launch with `crane vc`."

### 1b. API health check

Ping the crane-context API:

```bash
curl -sS -o /dev/null -w "%{http_code}" \
  "https://crane-context.automation-ab6.workers.dev/health"
```

If the response is not `200`, stop: "crane-context API unreachable (HTTP {code}). Cannot run content scan without handoff data."

**Do not silently degrade to git-only mode.** Handoffs are the primary signal. Without them, the scan produces noise.

### 1c. Load venture registry

Read `~/dev/crane-console/config/ventures.json`. Store as `VENTURE_REGISTRY`.

Build a list of **active ventures** - entries with a non-empty `repos` array. Skip ventures with `"repos": []`.

### 1d. Load content index

Scan `~/dev/vc-web/src/content/` for published content:

- **Articles**: Search for files matching `~/dev/vc-web/src/content/articles/*.md`. Read frontmatter (title, date, tags) from each file.
- **Build logs**: Search for files matching `~/dev/vc-web/src/content/logs/*.md`. Read frontmatter (title, date, tags, draft) from each file. Exclude files where `draft: true`.

Store these as `ARTICLE_INDEX` and `LOG_INDEX`.

For each venture, count published articles where the venture's name or code appears in tags. Store as `ARTICLE_COUNTS`.

---

## Step 2: Short-circuit check

Search VCMS for the most recent `content-scan` note:

```
crane_notes(tag: "content-scan", limit: 1)
```

If a note exists, extract its `created_at` timestamp as `LAST_SCAN_DATE`.

Query all handoffs created since the last scan:

```bash
curl -sS "https://crane-context.automation-ab6.workers.dev/handoffs?created_after=${LAST_SCAN_DATE}&limit=1" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY"
```

If **zero** ventures have new handoffs since the last scan:

1. Output: "No new signals since last scan ({LAST_SCAN_DATE}). Skipping."
2. Record cadence: `crane_schedule(action: "complete", name: "content-scan", result: "skipped", summary: "No new handoffs since last scan", completed_by: "crane-mcp")`
3. Stop.

---

## Step 3: Gather signals per venture

### 3a. Handoffs (primary signal)

Fetch all handoffs within the lookback window in a single call:

```bash
CUTOFF=$(date -v-${LOOKBACK_DAYS}d -u +%Y-%m-%dT%H:%M:%SZ)
curl -sS "https://crane-context.automation-ab6.workers.dev/handoffs?created_after=${CUTOFF}&limit=100" \
  -H "X-Relay-Key: $CRANE_CONTEXT_KEY"
```

Group the returned handoffs by their `venture` field. For each venture, store the `summary` and `created_at` from each handoff.

**Note**: Handoffs created from crane-console sessions carry `venture=vc` even when the work targets another venture. Scan each handoff's `summary` text for venture names and codes (dc, ke, sc, dfg) and cross-reference mentions to associate handoffs with the correct venture when the `venture` field doesn't match.

### 3b. Git activity (metadata only)

For each active venture, for each repo in its `repos` array:

```bash
# Merged PRs in the lookback window
gh pr list --repo {ORG}/{REPO} --state merged --json number,title,mergedAt \
  --jq '.[] | select(.mergedAt >= "CUTOFF_DATE")'

# Closed issues in the lookback window
gh issue list --repo {ORG}/{REPO} --state closed --json number,title,closedAt \
  --jq '.[] | select(.closedAt >= "CUTOFF_DATE")'
```

Store PR titles and counts per venture-repo.

**Selective PR body fetching**: For PRs whose titles contain any of these keywords (case-insensitive): `redesign`, `migrate`, `remove`, `replace`, `decision`, `tradeoff`, `rewrite`, `new` - fetch the full PR body. **Cap at 5 body fetches per repo.**

### 3c. Record signal counts

For each venture, record: number of handoffs, number of merged PRs, number of PR bodies fetched.

---

## Step 4: Classify candidates

Evaluate gathered signals using bucket-based assessment. Do not assign numeric scores.

### Article candidates

**Gating question**: Does the material have handoff narrative AND a decision or surprise worth generalizing to readers outside Venture Crane?

- **High confidence**: Handoff explicitly describes a design decision, tradeoff, architectural choice, or surprising outcome. The topic generalizes beyond the specific venture.
- **Medium confidence**: Handoff describes substantive work with some narrative depth, but the generalizable angle is less obvious.

Produce a one-line headline and a "Why" rationale for each candidate.

### Promotion candidates (weekly only)

**Skip this section entirely if `LOOKBACK_DAYS` < 7.**

**Gating question**: Does an existing build log read like a draft article worth promoting?

Filter `LOG_INDEX` to logs older than 14 days and longer than 400 words.

- **High confidence**: Log has substantive narrative depth AND no existing article covers the same topic for the same venture.
- **Medium confidence**: Log has some narrative depth but the article angle needs more development.

### Log candidates

**Gating question**: Did something ship (merged PR with handoff narrative) with no matching build log?

For each venture with merged PRs in the window, check if the venture has any build log published within the lookback window. If merged PRs AND handoff narrative exist but NO log was published, flag as a log gap.

### Suppression rules (never surface as candidates)

- Git-only activity with no handoff narrative
- Routine operational work: dependency updates, config tweaks, linting fixes, formatting changes, CI adjustments
- Topics already covered by a published article with the same venture context

### Coverage boost

If a venture has zero published articles (`ARTICLE_COUNTS[code] == 0`), boost its candidates one confidence level (Medium -> High, borderline -> Medium). This integrates the gap signal into the ranking. Do not present it as a separate analysis.

---

## Step 5: Display output

```
CONTENT SCAN - {TODAY} - Last {LOOKBACK_DAYS} days
================================================================================

ARTICLE CANDIDATES
--------------------------------------------------------------------
HIGH  {CODE}  {Headline}
              Why: {rationale}
              Source: handoff {date}
              Note: {venture name} has zero published articles (coverage boost)

MED   {CODE}  {Headline}
              Why: {rationale}
              Source: handoff {date}

PROMOTION CANDIDATES (weekly)
--------------------------------------------------------------------
HIGH  {CODE}  {log-slug} ({date})
              Why: {word count} words, substantive section, no article on topic
              Action: draft article via build-log

LOG CANDIDATES
--------------------------------------------------------------------
      {CODE}  {description} - merged PR, handoff exists, no log
              Source: PR #{number} merged {date}

COVERAGE GAPS (ventures with zero published articles)
  {comma-separated list of venture names}

SIGNAL HEALTH
  {code}  handoffs: {N}   git: {N} PRs     {status}
  ...
================================================================================
```

**Status labels for signal health**: `OK` (at least 1 handoff), `low activity` (sparse), `no signal` (zero handoffs and zero PRs).

**Section omission rules**: Omit any section with no entries. SIGNAL HEALTH always displays. If zero candidates across all sections, display "No publishable candidates found." with SIGNAL HEALTH.

---

## Step 6: Save to VCMS

If `SAVE_TO_VCMS` is true, save automatically. If false, ask: "Save results to VCMS? (y/n)"

If saving:

```
crane_note(
  action: "create",
  title: "Content Scan - {TODAY}",
  content: "{full output text from Step 5}",
  tags: ["content-scan"],
  venture: null
)
```

The note is global (no venture), tagged `content-scan` so the short-circuit check in Step 2 can find it.

---

## Step 7: Record cadence

After completing the scan, record in the Cadence Engine:

```
crane_schedule(
  action: "complete",
  name: "content-scan",
  result: "{result}",
  summary: "{summary}",
  completed_by: "crane-mcp"
)
```

**Result enum**:

- `success` - API healthy, at least one article-grade candidate found
- `warning` - API healthy but zero article-grade candidates, OR partial API failures
- `skipped` - short-circuited in Step 2 (already recorded there; do not record again)

---

## Notes

- **This is a triage tool, not a drafting tool.** It identifies what to write about. Use the build-log skill to draft.
- **Handoffs are the primary signal.** Git activity confirms something shipped but never justifies a candidate alone.
- **Promotion scanning is weekly.** Gated behind `LOOKBACK_DAYS >= 7`.
- **Coverage boost is integrated, not separate.** Ventures with zero articles get +1 confidence level.
- **Fail fast on API failure.** If crane-context is down, stop.
- **Stealth ventures** (`showInPortfolio: false`) are skipped. If a stealth venture's work generates a candidate, omit the venture name and flag: "Candidate from internal venture - discuss with Captain before proceeding."
