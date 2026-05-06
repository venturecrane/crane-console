# crane_verify — Verification Recording Playbook

`crane_verify` records a verification artifact in the cross-session ledger. It does NOT execute commands; the agent runs the actual verification with whatever tool fits, then submits the captured output here for ledgering. Future PR 2 gates check for these records; PR 3 audits sample them and re-run the captured command for integrity.

## When to call it

Call `crane_verify` _before_ you state that something is true based on a check you ran. The pattern that costs sessions later: agent runs `gh pr view 100`, sees "merged", states "PR 100 is merged", but no record exists, so when a regression surfaces three sessions later, no one can find the originating claim.

The four signals that should trigger a `crane_verify` call:

- **You're about to opine on system behavior** based on something you ran or fetched. Record it before opining.
- **You're committing a fix** for `fix:`, `revert:`, `chore(migration|secrets|env):` change classes. Record the verification that grounded the fix.
- **You're stating something is current** ("main is at SHA X", "the env var is set", "the worker is deployed") based on a live-state check. Record the check.
- **You read vendor docs** to inform an integration choice. Record the doc fetch.

## The three methods

| Method          | Use when                                                             | `tool_used` examples         | Required fields      |
| --------------- | -------------------------------------------------------------------- | ---------------------------- | -------------------- |
| `live_state`    | You hit a real source — `gh api`, `wrangler tail`, D1 query, env var | `gh_api`, `wrangler`, `Bash` | `command`            |
| `fresh_process` | You ran a command in a clean shell to verify a runtime claim         | `Bash`                       | `command`            |
| `vendor_docs`   | You fetched current vendor documentation                             | `Context7`, `WebFetch`       | `output` ≥ 100 chars |

The method is the category. The `tool_used` enum lets audits group across categories. Pick the closest match; use `other` only if none fit.

## Required fields

Every call needs:

- **`method`** — one of the three above
- **`claim`** — what is supposedly true after this verification (max 300 chars; one-liner)
- **`output`** — literal output captured from the tool (max 8KB; see truncation below)
- **`tool_used`** — enum: `Bash | Context7 | WebFetch | gh_api | wrangler | vendor_mcp | other`

For `fresh_process` and `live_state`, **`command` is also required** — it's the audit anchor. Without it, the record is unrecheckable, defeating the integrity story.

For `vendor_docs`, `output` must be ≥ 100 characters. A trivially-empty "I read the docs" record has nothing to attach to when a regression surfaces.

## Optional but recommended

- **`files_touched`** — file paths this verification relates to. PR 3's regression auto-attach reads this column to surface the originating claim. If you're verifying behavior that ties to a file, name it.
- **`fresh_runtime`** — boolean: did the output come from a fresh process? PR 2's EOS gate reads this for runtime-config changes.
- **`session_id`** — current session ID if known. Pulled from env if not provided.

## Oversize output — the `head_tail` convention

If your output exceeds 8KB (e.g., full `npm test` output, `wrangler tail` capture, `gh run view --log`), the tool rejects it explicitly rather than silently truncating. Apply this convention:

```
<first 4KB of output>
...[truncated]...
<last 4KB of output>
```

Then set `output_truncation: "head_tail"`. This preserves the diagnostic head (test names, request lines) and the diagnostic tail (failure stacks, response codes) — the two parts that matter for re-running. PR 3 audit can re-run the command for the middle if needed.

## Examples

### live_state — confirming a PR merged

```ts
crane_verify({
  method: 'live_state',
  claim: 'PR 100 is merged',
  output: '{"state":"merged","mergedAt":"2026-05-06T17:00:00Z"}',
  tool_used: 'gh_api',
  command: 'gh pr view 100 --json state,mergedAt',
  files_touched: ['packages/crane-mcp/src/index.ts'],
})
```

### fresh_process — confirming a runtime config fix

```ts
crane_verify({
  method: 'fresh_process',
  claim: 'MCP launcher exposes new tools to fresh agent',
  output: 'crane_verify  Record a verification artifact...\ncrane_claim_origin  Look up...',
  tool_used: 'Bash',
  command:
    "echo 'tools/list' | npx @modelcontextprotocol/inspector packages/crane-mcp/dist/index.js | grep crane_verify",
  fresh_runtime: true,
  files_touched: ['packages/crane-mcp/src/index.ts'],
})
```

### vendor_docs — confirming a vendor API shape

```ts
crane_verify({
  method: 'vendor_docs',
  claim: 'Vercel AI SDK v6 supports streamText with provider/model strings',
  output:
    "From context7/vercel-ai: streamText accepts a model string in 'provider/model' format... [more excerpt up to 100+ chars]",
  tool_used: 'Context7',
  command:
    "mcp__plugin_context7_context7__query-docs(libraryId: '/vercel/ai', query: 'streamText provider/model format')",
  files_touched: ['packages/crane-mcp/src/lib/llm.ts'],
})
```

## Looking up prior claims (`crane_claim_origin`)

When investigating a regression, query for prior verifications that touched the same file:

```ts
crane_claim_origin({
  file: 'packages/crane-mcp/src/index.ts',
  since: '90d', // optional; ISO date or "30d"/"90d"
})
```

Returns up to 50 claims sorted newest-first, each with `claim`, `verify_id`, `method`, `session_id`, `ts`, and the full `files_touched` array. PR 3's regression flow auto-attaches these to issues; for now, agents can use it manually when triaging.

## What this is not

- **Not a verification execution surface.** You already have Bash and Context7. The tool records the work you did, it doesn't replace it.
- **Not a freeform notepad.** Records below 100 chars on `vendor_docs`, missing `command` on runtime methods, or oversize `output` are rejected with explicit guidance — by design.
- **Not a place for secrets.** A scrubber masks known leak vectors (PATs, AWS keys, OpenAI keys, JWTs, PEM blocks, `KEY=value` lines) before storage. The result includes `redacted: true` so the audit signal is preserved. Don't rely on the scrubber as a substitute for not pasting secrets in the first place.

## Recording for a PR (Prong 2)

When the PR you're about to open touches `mcp-tool`, `boot-config`, `fleet-artifact`, or `config-canon` (the surface classes in `config/eos-gate-surfaces.json`), the PR-CI verify gate (`pr-verify-gate.yml`) will require at least one `vfy_<ULID>` in the PR body. The pattern is:

1. **During the work, run `crane_verify`** for each runtime claim. Pass `files_touched: [...]` with paths from your diff so PR 3's audit can correlate.
2. **Capture the returned `verify_id`** — it's the `vfy_*` string in the result message.
3. **Open the PR** with `gh pr create`. The default template now includes a `## Verifications` section.
4. **Edit the PR body** to list each `verify_id` under that section. Format: `vfy_<26-char-ULID> · <method> · <one-line claim>`.

The PR-CI gate:

- Runs on `opened`, `edited`, `synchronize`, `labeled`, `unlabeled`
- Has a 5-minute creation grace window: a brand-new PR with no IDs gets a warning annotation, not a failure. After 5 minutes (or on any subsequent edit/push) it's full fail-mode
- Calls `GET /verify/lookup?ids=...` to confirm each listed ID exists in the live ledger. Fake IDs fail
- Honors a `skip-verify-gate` label for genuine false positives — auditable in PR history; repeat use on the same surface triggers Captain review

The EOS-time Layer 4c gate (in `crane_handoff(status=done)`) catches the same failure earlier — at session-end rather than PR-merge — by refusing the handoff when surface classes are touched and zero `crane_verify` rows exist for the session. Override with `override_verify_coverage_gate: true` if it produces a false positive (logged on the handoff for audit).

## Failure modes

- **`CRANE_CONTEXT_KEY not set`** — launch via `crane <venture>`; the launcher provides the key.
- **API failure** — best-effort; the tool returns `{ success: false, message }` and never throws. Your work continues.
- **Validation failure** — Zod refinements reject before the network call. Fix the input shape and retry.

## Regression triage (Prong 3)

When a `regression`-labeled issue lands in any wired venture repo, `regression-claim-origin.yml` (caller of the reusable workflow in `crane-console/.github/workflows/regression-claim-origin-reusable.yml`) parses the issue body's `### Affected files` H3, looks up `/verify/origin?file=…&since=180d` for each file, and posts a comment listing prior `crane_verify` records (`verify_id`, `method`, `claim`, `ts`).

What the agent triaging the regression should do:

1. **Read the auto-attached comment first.** It surfaces evidence the prior session captured. Often the regression is described in the `claim` text of the most-recent record.
2. **If the comment says "no prior verifications,"** that's a signal too — the file has no captured runtime claims, so the agent should run `crane_verify` after triage to seed evidence for the next regression.
3. **If the comment says "no `### Affected files` section found,"** edit the issue with the H3 + bullet list and re-label `regression` to re-fire the workflow.
4. **After triage, run `crane_verify`** with `files_touched: [...]` matching the touched files. The next regression on those paths will see today's work as evidence.

Stale issues (>30 days old at label time) are skipped — retroactive label sets don't fire the workflow, by design.

## Audit cadence (Prong 3)

`/verify-audit` is the weekly read of the verify_ledger. Wired as `verify-audit-weekly` in `crane_schedule` (`cadence_days: 7`); surfaces overdue in SOS like every other audit cadence item.

The MCP tool `crane_verify_audit` calls `GET /verify/audit` (cached for 8h; `?fresh=1` bypasses) and returns a structured report with eight sections:

| Section                      | What                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Coverage gap (windowed)**  | Surface-class files touched in window with no `verify_ledger` rows in window.                                        |
| **Unverified surface files** | Surface-class files with **zero** `verify_files` rows in the entire ledger history.                                  |
| **Override audit**           | Counts of `override_pr_merge_gate=true` and `override_verify_coverage_gate=true` in `done` handoffs (window).        |
| **Integrity samples**        | Random sample of recent rows + structural integrity checks (scrubber consistency, truncation marker presence).       |
| **Truncation drift**         | Rows where `output_truncation != 'none'` AND `output_redacted = 1` — potential evidence loss.                        |
| **Source distribution**      | manual / tool / hook breakdown. A 0 in `hook` while surfaces were touched suggests the PreToolUse hook isn't firing. |
| **Memory candidates**        | Recurring `(command_hash, repo)` tuples (≥3× in window, `method: fresh_process`). Nominees for memory promotion.     |

`crane_status` reads the cached snapshot via `?summary=1` (no recomputation; cheap) and renders a one-line summary with cache age. If the snapshot is >12h old, it suggests `--fresh`. If >7d old, it's surfaced as overdue.

### `command_hash` semantics

`command_hash` is computed worker-side as `sha256(body.command)` (literal command string). It does **not** include cwd, environment variables, or invocation context. This means:

- Same `npm test` from two different packages collides on `command_hash` alone but separates on `(command_hash, repo)`.
- Same command with different `--env=staging` vs `--env=production` flags hashes differently (correct: different runtime targets).
- Same command from two fresh sessions on the same package hashes identically (correct: that's the recurrence we want to surface).

The audit groups by `(command_hash, repo)` to keep cross-package collisions out of memory candidates while preserving in-repo recurrence detection. The grouping is documented here so future tuning has a starting point.

### Calibration note

Before merging Prong 3, the grouping was probed against the live ledger (production D1). _(After-merge: re-run the calibration whenever the audit's signal-to-noise feels off and update this note with the date + finding.)_

## Memory promotion path (Prong 3)

When `/verify-audit --apply` runs and the `memory_candidates` section is non-empty, each candidate becomes a draft memory note via `crane_memory.save`:

- `name` is deterministic — `recurring-command-<command_hash[0:8]>-<repo-slug>-<YYYYMMDD>` — so re-runs of the same audit are idempotent.
- `kind: lesson` (anti-pattern requires intent we can't infer).
- `status: draft`, `captain_approved: false` — never auto-approved.
- `evidence_verify_ids: [verify_ids…]` — the **new frontmatter field** that links the memory to the ledger rows that motivated it. Validated against `/^vfy_[26 Crockford]$/` at save time; the audit owns ledger-existence checks. See `docs/memory/governance.md` for the field reference.
- `applies_when.files: [files_touched_union]` so recall scoring works against the right paths.

The Captain approves drafts via the existing `/memory-audit` flow — `pending_captain_approval[]` lists them with the `evidence_verify_ids` rendered inline so the lineage is visible at approval time. Approve with `crane_memory(action: 'update', id: <id>, captain_approved: true)`.

Why a sibling field, not `supersedes_source`: `supersedes_source` is path-on-disk audited (`memory-audit.ts` checks each entry exists as a file). Putting `vfy_…` IDs there would fail the integrity check. `evidence_verify_ids` is purpose-built and zero-touch on existing flows.

## What's NOT in this audit (deliberate)

- **Skip-label PR audit** (`skip-eos-gate`, `skip-verify-gate`). Those labels live on GitHub PRs, not in this DB. Per-repo manual probe via `gh pr list --search "label:skip-eos-gate is:merged"`.
- **Re-running stored `command` for output integrity.** Out of scope — re-executing arbitrary stored commands is unsafe to automate.
- **Fuzzy claim-text similarity.** v1 uses `(command_hash, repo)` exact-match grouping. Add fuzzy matching only when a corpus shows it's missing recurrences this misses.
- **Cross-repo audit aggregation.** Coverage gap is per-repo (whichever repo the MCP tool runs in). Cross-repo would need a fleet-walker; v2.

The cost of a missing record is one round-trip; the cost of habituating to "I'll skip the record this time" is the recurring failure mode this whole substrate exists to end.
