# Claude.ai Project Setup (venture-bound MCP)

**Audience:** Captain.
**Outcome:** Each of the 5 claude.ai venture projects (web + iOS) reliably loads venture context and GitHub access on every conversation — no manual scoping, no confabulation about "no such product" or "token dead," no corporate-employee posture failures.
**Time to apply:** ~10 minutes per project after Phase 0 routing is confirmed.

## Why this exists

`crane-mcp-remote` exposes 23 tools (14 `github_*`, 9 `crane_*` + `crane_context` + `crane_health`) over OAuth-secured MCP. Before the venture-binding work, all tools were venture-agnostic — every claude.ai project was indistinguishable to the worker, and agents had to guess venture/repo per call. They guessed wrong constantly. This runbook configures each project so the worker auto-scopes everything **and** the agent's posture matches a thought-partner, not a corporate-employee gatekeeper (per 2026-06-03 transcript audit).

See `plans/nested-wobbling-matsumoto.md` (kept) for the full architecture. PRs: feat(crane-mcp-remote): venture binding via per-venture MCP endpoints (#959); fix(crane-mcp-remote): auto-refresh GitHub user token (#968).

---

## Phase 0 — Routing strategy (do once, before any project setup)

The worker supports per-venture URL paths (`/mcp/{venture-code}`). Two unknowns must be confirmed before deciding whether to use path-routing or subdomain-routing:

### 0a. claude.ai connector UI

1. claude.ai → Settings → Connectors → "Add custom connector"
2. URL: `https://crane-mcp-remote.automation-ab6.workers.dev/mcp/_test`
3. Save. Reopen. Confirm the URL is stored with the `/mcp/_test` suffix intact.

**If path preserved → continue.**
**If path stripped → switch to subdomain routing** (file follow-up issue to add `crane-mcp-{venture}.automation-ab6.workers.dev` routes to `wrangler.toml`; the worker code already supports both forms).

### 0b. GitHub OAuth App callback

1. https://github.com/settings/applications → find `venturecrane-github` (App ID `2619905`).
2. Note the "Authorization callback URL" (this is the URL GitHub redirects to after user grants access — the worker's `/callback` endpoint).
3. Confirm whether it accepts:
   - Multiple callbacks listed, or
   - A single fixed URL, or
   - A prefix that covers all `/mcp/*` paths.

**If single fixed URL covering the worker's `/callback` (path-agnostic) → path routing works.**
**If multiple URLs allowed → add one per venture if needed for staging tests.**

Record the callback URL string in `docs/infra/token-registry.md` to close the open gap at line 68.

### 0c. Live OAuth probe

Run `wrangler tail` on staging (`cd workers/crane-mcp-remote && npx wrangler tail --format pretty`). Walk the OAuth flow with the test connector from 0a. Confirm:

- The MCP transport hits `/mcp/_test` on the worker.
- The OAuth callback resolves on `/callback` (no path collision).
- The session establishes; `crane_context` (called from claude.ai) returns "no venture binding" (because `_test` isn't a real code — expected 404 actually; that's the validation working).

After 0a/0b/0c pass, retire the `_test` connector and proceed with the 5 real venture projects.

---

## Project setup (per venture)

| Venture code | claude.ai project name suggestion | MCP connector URL                                             | GitHub default repo          |
| ------------ | --------------------------------- | ------------------------------------------------------------- | ---------------------------- |
| `vc`         | Venture Crane                     | `https://crane-mcp-remote.automation-ab6.workers.dev/mcp/vc`  | `venturecrane/crane-console` |
| `ss`         | SMD Services                      | `https://crane-mcp-remote.automation-ab6.workers.dev/mcp/ss`  | `venturecrane/ss-console`    |
| `ke`         | Kid Expenses                      | `https://crane-mcp-remote.automation-ab6.workers.dev/mcp/ke`  | `venturecrane/ke-console`    |
| `dfg`        | Durgan Field Guide                | `https://crane-mcp-remote.automation-ab6.workers.dev/mcp/dfg` | `venturecrane/dfg-console`   |
| `dc`         | Draft Crane                       | `https://crane-mcp-remote.automation-ab6.workers.dev/mcp/dc`  | `venturecrane/dc-console`    |

### Steps per project

1. **Create the project** on claude.ai (web). One per venture.
2. **Add the MCP connector**: Settings → Connectors → "Add custom connector" → use the venture-specific URL above. Save.
3. **Connect (OAuth flow)**: Open the project, ask any question that uses a tool. Claude.ai will prompt for OAuth. Click through. GitHub redirects to the worker's `/callback`, then back to claude.ai. Done.
4. **Set project custom instructions** (Settings → Project → Custom instructions) — paste the block below, substituting `{VENTURE_CODE}` and `{VENTURE_NAME}` for the right venture. The block has two halves: **tool mechanics** (how to use the MCP server) and **posture** (how to engage with the Captain). Both halves are required.

   ```text
   You represent the {VENTURE_NAME} venture (code: {VENTURE_CODE}).

   ## Tool mechanics

   The crane-mcp-remote MCP server auto-scopes your `crane_*` and `github_*`
   tools to this venture — you do not need to specify `venture` on crane
   tools or `owner`+`repo` on github tools for in-venture queries.

   At the start of any non-trivial conversation, call `crane_context` once
   to confirm the venture binding. If results look wrong or empty, call
   `crane_health` to diagnose (it surfaces crane-context status, GitHub
   auth status, scopes, allowlist membership, and venture binding state).

   For cross-venture queries:
   - crane tools: pass `venture: "<code>"` (or `venture: "all"` where
     supported) to override the default scope.
   - github tools: pass BOTH `owner` and `repo` explicitly (passing only
     one is rejected to avoid ambiguous calls).

   Do not invent absence: if a tool returns no results, check the
   disclosure for stale-data banners (loud `⚠️ STALE DATA` warnings live at
   the top of the response when crane-context is unreachable). When a
   tool fails, run `crane_health` and surface the failure mode in your
   answer rather than guessing.

   ## Posture

   You are a thought partner to the Captain, not a corporate-employee
   gatekeeper. The Captain runs this venture; you support it.

   - Engage with the actual question first. When asked for help with X,
     help with X. Do not open with pushback before being asked. Do not
     lead with "Decision: Don't do this yet." If you genuinely see a
     problem, raise it in one short paragraph after delivering on the
     ask, not before.

   - No corporate decision templates on every turn. Reserve
     Decision / Rationale / Risks / "What would change my mind" for
     moments when the Captain explicitly asks for a structured decision.
     In every other turn, write plain prose.

   - Ground before pushing back. Before objecting to a plan, call
     crane_notes for the venture's exec-summary and relevant ADRs. If
     you object based on a document, name the document and quote the
     line. If the document does not say what you are claiming, you are
     inventing authority.

   - Engineering snapshots are not go-to-market gates. VCMS notes tagged
     `audit` or `build-state` are internal engineering self-assessments.
     They inform Captain decisions; they do not gate them. Read the
     banner at the top of any audit note before quoting from it.

   - Ask for inputs before doing economics. If the Captain wants help
     with a pricing, comp, ad, or cost question, ask for the missing
     inputs (price, volume, comp structure, channel) before calculating.
     Do not invent placeholders and then build analysis on the invented
     numbers.

   ## Sourcing and citations

   Before any factual claim about the venture or product, cite the
   source: a VCMS note ID, a file:line, a doc path, a PR number, or a
   command output. If you cannot cite, say "checking" and verify first.
   Do not assert.

   Do not assert that something "doesn't exist" until you have searched
   VCMS by both its current and historical names. Negative claims need a
   positive search.

   ## Format

   - Plain prose. Bullets only when listing genuinely parallel items.
   - Avoid em-dashes; use hyphens or commas.
   - Short paragraphs. State the conclusion first, then the reasoning.
   - The Captain reads diffs; do not summarize what you just did at the
     end of every response unless the work spanned multiple tools.

   ## Captain profile

   The Captain is the founder of SMDurgan, LLC and operates the venture
   portfolio. Experienced operator with deep AI-native operations
   background. Treat him as a peer, not as someone you need to protect
   from his own decisions. He runs the venture; you support it.
   ```

5. **SS-specific addendum (paste only into the SS project):** the Operator product was renamed from "AI Employee" on 2026-06-01 (ADR 0034 in venturecrane/ss-console; thesis locked in ADR 0037). Forward conversations should use **Operator**; "AI Employee" appears only in historical artifacts. The lowercase word "operator" is also a deliberate human-role term (RBAC role, "Designated Operator" persona, "backup operator," "SMD Operator" = Captain). For the full SS-tailored block, see VCMS `note_01KT75CXNC77QS1QHNSSXF6EC6` (title: "SS claude.ai Project — Tightened Custom Instructions").

6. **Smoke test (Phase 5 from the plan)** — run all 6 checks in both web and iOS for this project:
   1. "What venture is this?" → `crane_context` returns the bound venture name + repo.
   2. "What's the latest work?" → `crane_handoffs` (no args) auto-targets this venture's handoffs.
   3. "What's our top P0 issue?" → `github_list_issues` (no args) auto-targets the venture's repo.
   4. (ss only) "What is the Operator product?" → surfaces the refreshed exec-summary note + recent commits. Agent should use **Operator** (not "AI Employee") and reference ADR 0034/0037.
   5. "What are the top P0s across all 5 ventures?" → `github_list_issues` called 5x with explicit `owner`+`repo`. Verifies override mechanic.
   6. `crane_health` → all three sections healthy, venture bound.

   Record results in this file under "Verification log" below. A project is declared "reliable" only after all 6 pass in both web and iOS.

7. **Posture smoke test (ss only, re-runs the 2026-06-03 transcript scenario):** ask "I'm thinking of placing an ad to hire salespeople to sell the Operator." Pass criteria:
   - Agent does NOT open with "Decision: Don't do this yet."
   - Agent asks for missing inputs (price, comp structure, channel) before calculating economics.
   - Agent names the **Operator** correctly without confabulating "no such product."
   - Agent does NOT cite the 2026-05-29 build-state audit as a launch gate.

---

## Verification log

| Project              | Venture | Web pass date | iOS pass date | Notes |
| -------------------- | ------- | ------------- | ------------- | ----- |
| (Venture Crane)      | vc      | _pending_     | _pending_     |       |
| (SMD Services)       | ss      | _pending_     | _pending_     |       |
| (Kid Expenses)       | ke      | _pending_     | _pending_     |       |
| (Durgan Field Guide) | dfg     | _pending_     | _pending_     |       |
| (Draft Crane)        | dc      | _pending_     | _pending_     |       |

---

## Rollback path

The legacy `/mcp` endpoint (no venture binding) stays alive until Phase 6 retires it. If a venture project's per-venture endpoint misbehaves, switch its connector URL back to `https://crane-mcp-remote.automation-ab6.workers.dev/mcp` (no suffix) — same OAuth, same tools, but venture is unbound (you'll need to pass `venture` and `owner`+`repo` explicitly on every call). File the bug, then we fix forward without losing access in the field.

---

## Common failure modes

### "Token is dead" (claude.ai says this but disclosure header says "authenticated and retrieved")

**Don't trust the model's self-diagnosis.** Call `crane_health` from inside the project. If `github.status == "ok"` and `github.allowlist_member == true`, the token is fine and the model is confabulating around an unexpected (probably empty) result. Push back: "you DID get the data — list it."

### `crane_context` returns "Bound to: NONE (legacy /mcp endpoint)" inside a per-venture project

The connector URL got truncated or the project is pointing at the legacy endpoint. Re-check Settings → Connectors → URL for that project. If it shows `…/mcp` instead of `…/mcp/{venture}`, either claude.ai stripped the path (Phase 0a failed — switch to subdomain routing) or someone edited the URL.

### `crane_health` shows `crane_context: down`

The crane-context worker is unreachable from crane-mcp-remote (network or auth issue). Check `wrangler tail --env production` on `crane-context-prod` for the matching request. Likely causes: stale `CRANE_CONTEXT_KEY` secret, or worker outage.

### `crane_health` shows `github.status: reconnect_needed`

The OAuth token in the session has expired or been revoked. In claude.ai: Settings → Connectors → that connector → Disconnect, then re-connect. This re-runs the OAuth flow and provisions a fresh GitHub token.

### iOS shows different behavior than web

iOS aggressively caches connector configs. Force a reconnect on the device: Settings → Connectors → the connector → Disconnect → Connect.

### Posture failures (Decision-template on every turn, manufactured authority, invented economics)

The Posture section of the custom-instructions block was not pasted, or was pasted in a project that ignores Markdown headers. Verify the block in Settings → Project → Custom instructions. If posture failures persist after the block is confirmed pasted, the model's training defaults are overriding the project instructions — re-run the posture smoke test (step 7) and flag the specific failure mode to the Captain.

---

## See also

- Plan: `plans/nested-wobbling-matsumoto.md` (full architecture + phases)
- Token registry: `docs/infra/token-registry.md` (callback URL, OAuth App ID)
- MCP surfaces overview: `docs/infra/mcp-surfaces.md`
- Worker README: `workers/crane-mcp-remote/CLAUDE.md`
- SS-specific custom-instructions addendum: VCMS `note_01KT75CXNC77QS1QHNSSXF6EC6`
- ADR 0034 (Operator product naming): `docs/adr/0034-operator-product-naming.md` in venturecrane/ss-console
- ADR 0037 (Operator thesis): `docs/adr/0037-operator-thesis.md` in venturecrane/ss-console
