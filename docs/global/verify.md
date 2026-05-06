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

The cost of a missing record is one round-trip; the cost of habituating to "I'll skip the record this time" is the recurring failure mode this whole substrate exists to end.
