# Claude.ai Project Setup (venture-bound MCP)

**Audience:** Captain.
**Outcome:** Each of the 5 claude.ai venture projects (web + iOS) reliably loads venture context and GitHub access on every conversation — no manual scoping, no confabulation about "no such product" or "token dead."
**Time to apply:** ~10 minutes per project after Phase 0 routing is confirmed.

## Why this exists

`crane-mcp-remote` exposes 23 tools (14 `github_*`, 9 `crane_*` + `crane_context` + `crane_health`) over OAuth-secured MCP. Before the venture-binding work, all tools were venture-agnostic — every claude.ai project was indistinguishable to the worker, and agents had to guess venture/repo per call. They guessed wrong constantly. This runbook configures each project so the worker auto-scopes everything.

See `plans/nested-wobbling-matsumoto.md` (kept) for the full architecture. PR: feat(crane-mcp-remote): venture binding via per-venture MCP endpoints.

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
4. **Set project custom instructions** (Settings → Project → Custom instructions) — paste the block below, substituting `{VENTURE_CODE}` and `{VENTURE_NAME}` for the right venture:

   ```text
   You represent the {VENTURE_NAME} venture (code: {VENTURE_CODE}).

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
   ```

5. **Smoke test (Phase 5 from the plan)** — run all 6 checks in both web and iOS for this project:
   1. "What venture is this?" → `crane_context` returns the bound venture name + repo.
   2. "What's the latest work?" → `crane_handoffs` (no args) auto-targets this venture's handoffs.
   3. "What's our top P0 issue?" → `github_list_issues` (no args) auto-targets the venture's repo.
   4. (ss only) "What is the ai-employee product?" → surfaces the refreshed exec-summary note + recent commits.
   5. "What are the top P0s across all 5 ventures?" → `github_list_issues` called 5x with explicit `owner`+`repo`. Verifies override mechanic.
   6. `crane_health` → all three sections healthy, venture bound.

   Record results in this file under "Verification log" below. A project is declared "reliable" only after all 6 pass in both web and iOS.

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

---

## See also

- Plan: `plans/nested-wobbling-matsumoto.md` (full architecture + phases)
- Token registry: `docs/infra/token-registry.md` (callback URL, OAuth App ID)
- MCP surfaces overview: `docs/infra/mcp-surfaces.md`
- Worker README: `workers/crane-mcp-remote/CLAUDE.md`
