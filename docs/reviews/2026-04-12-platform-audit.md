# Platform Audit - Crane Operating System

**Date:** 2026-04-12
**Auditor:** Claude (Opus 4.6, via `/platform-audit`)
**Machine:** m16
**Scope:** crane-console (workers, packages, scripts), `.agents/skills/`, MCP tool surface, D1 datastores, documentation system, operational scaffolding. **Excludes** individual venture product codebases.
**Method:** Six parallel Explore agents covering distinct domains, synthesized into a single senior-engineer report.
**Prior audit:** 2026-04-11 (branch `audit/platform-audit-skill-and-report`)
**Verdict:** **B- overall.** Up from C+. Three prior-audit critical items resolved. Architecture remains sound. The platform's core strengths (auth, idempotency, MCP layering, migrations, memory system) are unchanged. Sprawl and incomplete migrations persist but are better understood. Two new critical bugs found in the MCP tool surface that silently degrade local sessions.

---

## TL;DR

The bones are good and the prior audit's worst item (Fleet Ops Health workflow dark for days) is fixed. Two new critical MCP bugs surfaced: the local `crane_sos` output tells the LLM to call tools that don't exist locally (`crane_note_read`, `crane_handoffs`), and the `crane_handoff` static schema is missing a parameter the Zod schema has. The sprawl identified last time (god files, bootstrap overlap, dead scripts, incomplete SOS/EOS migration) is almost entirely unchanged - none of the structural fixes were executed. The documentation system improved: secrets duplication resolved, design spec authority clarified, AGENTS.md/GEMINI.md differentiated. Rate of new sprawl is low; rate of cleanup is also low.

---

## Critical / fix this week

| #     | Issue                                                         | Where                                                                                                           | Why it matters                                                                                                                                                                                                                                                                                            | Fix                                                                                                                                               |
| ----- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **`crane_sos` references non-existent local tools**           | `packages/crane-mcp/src/tools/sos.ts:708,734,747,762,1037,1063`                                                 | SOS output tells the LLM to call `crane_note_read(id: ...)` and `crane_handoffs(venture: ...)` as follow-ups. These tools exist in remote MCP only. Local sessions get "Unknown tool" errors on every suggested follow-up.                                                                                | Either register both tools locally (with appropriate implementations) or change the output text to reference `crane_notes()` and inline the data. |
| **2** | **`crane_handoff` static schema missing `venture` param**     | `packages/crane-mcp/src/index.ts:159-180`                                                                       | The Zod schema at `handoff.ts:18-24` accepts `venture` for cross-venture sessions. The static JSON schema in `index.ts` omits it. The LLM never sees the parameter and can never pass it.                                                                                                                 | Add `venture` to the static JSON schema properties. One-line fix.                                                                                 |
| **3** | **`rate_limits` table rows accumulate forever**               | `workers/crane-context/src/mcp.ts:79-100`                                                                       | New key per actor per minute, no reaper, no cleanup. `expires_at` is advisory. Index `idx_rate_limits_expires` exists but nothing queries it. Table grows without bound.                                                                                                                                  | Add opportunistic `DELETE FROM rate_limits WHERE expires_at < datetime('now')` after the UPSERT, mirroring `idempotency.ts:44-71`.                |
| **4** | **Deprecated SOS/EOS scripts still being installed**          | `scripts/setup-cli-commands.sh:37-43`                                                                           | `sos-universal.sh` and `eos-universal.sh` are deprecated in their headers, but `setup-cli-commands.sh` still copies them to `~/.local/bin`. Codex/Gemini prompt templates in the same file (lines 78-154, 167-243) still tell agents to invoke them. Two parallel session systems on every fleet machine. | Remove the `cp` lines. Update the embedded prompt templates to reference MCP tools.                                                               |
| **5** | **Genericization rules duplicated across 3 editorial skills** | `.agents/skills/build-log/SKILL.md`, `.agents/skills/edit-log/SKILL.md`, `.agents/skills/edit-article/SKILL.md` | The crane-\* substitution table and stealth venture filtering logic are embedded inline in all three. All three also read `~/dev/vc-web/docs/content/terminology.md` at runtime. When the terminology doc changes, all three must be updated by hand.                                                     | Move the substitution table exclusively into the terminology doc. Skills say "apply rules from the terminology doc" instead of re-embedding.      |

---

## Inventory

| Domain                   | Count                               | Size                                  | Health                                                         | Delta from prior    |
| ------------------------ | ----------------------------------- | ------------------------------------- | -------------------------------------------------------------- | ------------------- |
| Workers                  | 3                                   | ~28K LOC                              | crane-context solid core, crane-watch still a god file         | Unchanged           |
| Packages                 | 2                                   | ~23K LOC                              | crane-mcp clean wrapper, launch-lib.ts grew to 1,580 LOC       | launch-lib +106 LOC |
| MCP tools (local)        | 19                                  | ~5,363 tokens schema at session start | Two critical bugs found, two dead tools remain                 | New bugs found      |
| MCP tools (remote)       | 23 (9 crane + 14 GitHub)            | -                                     | Clean Zod registration, some drift from local                  | +4 GitHub tools     |
| Skills                   | 25                                  | 256 KB / ~5,400 lines                 | 3 editorial skills duplicate rules; 2 use raw curl             | Unchanged count     |
| Agents                   | 0                                   | -                                     | sprint-worker.md removed                                       | -1                  |
| Shell scripts            | 62                                  | ~8K LOC                               | ~6 confirmed dead, 4 bootstrap scripts still overlap           | +6 scripts          |
| GitHub Actions workflows | 12                                  | -                                     | All healthy (fleet-ops-health fixed)                           | Fixed 1             |
| D1 tables                | 22                                  | -                                     | 1 dead (request_log), 1 never-written column (notes.meta_json) | Unchanged           |
| D1 migrations            | 32 (0003-0032)                      | -                                     | Well-ordered, 0027 tracking in place                           | +5 migrations       |
| docs/ tree               | 19 subdirs / 121 files              | ~948 KB                               | Secrets and design authority resolved; stale items persist     | Improved            |
| Instruction files        | 3 (CLAUDE.md, AGENTS.md, GEMINI.md) | -                                     | Now differentiated; small shared-block duplication remains     | Improved            |
| Memory system            | MEMORY.md + 17 satellite files      | -                                     | Exemplary - best surface in the system                         | Unchanged           |

---

## Findings by domain

### 1. Workers & packages - Grade: C+ (unchanged)

**God files persist.** The top offenders are unchanged or worse:

| File                                              | LOC   | Mixed concerns                                                                                                        |
| ------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------- |
| `packages/crane-mcp/src/cli/launch-lib.ts`        | 1,580 | 8+ concerns: MCP config, claude.json, gemini config, codex config, Stitch MCP, SSH auth, secret fetching, agent spawn |
| `workers/crane-watch/src/index.ts`                | 1,347 | Types, crypto utils, GitHub JWT, Gemini classification, webhook routing, deploy heartbeat forwarding                  |
| `packages/crane-mcp/src/tools/sos.ts`             | 1,289 | Schema, session start, doc fetching, enterprise context, fleet health, notification counts, text rendering            |
| `workers/crane-context/src/endpoints/sessions.ts` | 1,053 | 5 endpoint handlers, 15 catch blocks, doc fetching, enterprise context inline                                         |
| `workers/crane-context/src/notifications.ts`      | 929   | Write path, read path, venture derivation, match key construction, green event processing                             |
| `workers/crane-context/src/endpoints/queries.ts`  | 891   | 6 unrelated GET endpoints, session block-merging algorithm                                                            |

**Prior audit correction:** The "3-worker HMAC signature validation duplication" was misidentified. Only `crane-watch` validates inbound webhook HMAC signatures (correct - it is the webhook gateway). `crane-context` uses `X-Relay-Key` auth. `crane-mcp-remote` is a GitHub REST client, not a webhook receiver. The duplication is `sha256Hex` and `timingSafeStringEqual` utility functions between crane-watch and crane-context's `utils.ts`, which is unavoidable without a shared package (separate workers cannot import from each other).

**HTTP client duplication** between `packages/crane-mcp/src/lib/crane-api.ts` (1,434 LOC, Node.js) and `workers/crane-mcp-remote/src/crane-api.ts` (306 LOC, Workers) is intentional and documented. Interface types are duplicated between them with slightly different shapes. Structural but not straightforwardly fixable without a shared types package.

**NOTIFICATIONS_AUTO_RESOLVE_ENABLED** is in 3 files (not 4+ as prior audit claimed): `types.ts` (declaration), `endpoints/notifications.ts` (two runtime checks in parallel branches), `endpoints/version.ts` (feature flag registry). The `wrangler.toml` comment saying "Production stays false until PR A4" is stale - both envs are already `true`.

**`console.log` in production paths:** ~10 instances across `index.ts:121` (every request), `sessions.ts:401` (bare error log before console.error), admin-docs handlers (7 instances), deploy-heartbeats-reconcile (3 instances), `ssh-auth.ts:129-130` (unconditional when should be debug-gated).

**Test pathology unchanged:** `sos.test.ts` (1,368 LOC) > `sos.ts` (1,289 LOC). Tool tests mock `CraneApi` entirely. `deploy-heartbeats-reconcile.ts` has no test file. `merge-blocks.test.ts` lives in `src/endpoints/__tests__/` instead of `test/`.

### 2. Skills, agents, hooks - Grade: C+ (improved from C)

**Session lifecycle (sos/status/update/heartbeat/eos):** These are now confirmed distinct in purpose. However, `update` and `heartbeat` share ~55 lines of identical bash session-discovery boilerplate and both use raw `curl` against crane-context instead of MCP tools. Every other session lifecycle skill uses MCP.

**Reviews cluster:** No overlap found. `enterprise-review` is structural cross-venture drift detection, not a superset of `code-review`. `critique` is in-conversation plan critique. `prd-review` is multi-agent PRD synthesis. All serve different purposes.

**Editorial cluster (high-priority fix):** `build-log`, `edit-log`, and `edit-article` all embed the same crane-\* substitution table and stealth venture filtering rules inline. All three also reference the terminology doc at runtime. Triple-maintenance surface.

**`enhance-prompt` phantom:** Listed in the system prompt as an available skill but has no SKILL.md in `.agents/skills/`. Either a skill from another source or a stale listing.

**AGENTS.md/GEMINI.md:** Now meaningfully differentiated (AGENTS.md has MCP tool tables, GEMINI.md has conflict resolution guidance). Residual duplication is the "Automatic Session Start" block (identical in both). Significant improvement from prior audit.

**Settings.json deny/allow:** Still contradictory. `.claude/settings.json` denies `mcp__claude_ai_crane_context__*` while `.claude/settings.local.json` allows 6 specific tools in that namespace. Relies on implicit precedence ordering.

**CLAUDE.md:** Well-restrained at 4,504 bytes. No bloat. The "Architecture Reference" mention of "MEMORY.md governance" points to `team-workflow.md` which has no such section - dead pointer.

### 3. MCP tool surface - Grade: B (unchanged)

The MCP layer remains the best-architected surface. crane-mcp is a properly thin wrapper over crane-context. Zod validation at boundaries. Clean error handling.

**New critical bugs:**

- `crane_sos` output references `crane_note_read` and `crane_handoffs` which are remote-only tools. Local sessions get "Unknown tool" errors on every suggested follow-up.
- `crane_handoff` static JSON schema omits `venture` parameter that Zod schema accepts. LLM can never pass it.

**`crane_schedule` still monolithic:** 9 actions, 17 parameters, ~1,400 tokens. Stale docstring says "Two actions." Prior audit recommended splitting into 3 tools. Not addressed.

**Dead tools unchanged:** `crane_handoff_update` (zero external usage), `crane_token_report` (zero external usage, skips Zod validation, in-memory only data lost on restart).

**Local-remote drift:** `crane_doc` remote is missing `max_chars` and `summary_only` params. `crane_doc_audit` remote omits the read-only `all` flag unnecessarily. Description text diverges in several tools.

### 4. D1 datastores - Grade: B- (unchanged)

22 tables. Schema mostly healthy and well-indexed.

**`request_log` still dead.** Defined with 4 indices in `schema.sql`, never written anywhere. The only reference is a JSDoc comment in `utils.ts`.

**`notes.meta_json` never written.** Column exists in the 0011 rebuild schema but zero code paths populate it. Stronger kill candidate than `sessions.meta_json` or `machines.meta_json` (which are at least written, just undocumented).

**`rate_limits` cleanup still missing.** New key per actor per minute, no reaper. The `idempotency_keys` table has opportunistic cleanup that should be mirrored here.

**`notifications` at 34 columns.** Intentional denormalization, well-documented in migration 0023. `smoke_test_notifications` (0028) omits `app_id`, `check_suite_id`, `check_run_id`, `deployment_id`, `project_name`, `target` - silent schema divergence from the real table.

**Migration history:** 0001/0002 still missing from the tree. 0027 backfill doesn't insert rows for them. Everything else well-managed.

### 5. Documentation - Grade: C+ (improved from C+)

**Resolved since prior audit:**

- Secrets docs duplication -> proper two-tier structure (`instructions/secrets.md` quick-ref + `infra/secrets-management.md` comprehensive)
- Design spec authority -> explicit in `design-system.md`: "design-spec.md is canonical, DESIGN.md is derivative"

**Still open:**

- `docs/pm/prd.md` (119 KB, 57 days stale) - now a shipped-product artifact, should be marked archived
- `docs/wireframes/` - single HTML artifact, no markdown, no links
- `docs/templates/newsletter-digest.md` - dead stub
- `docs/handoffs/` - 3 files from January, archival
- crane_docs manifest still a hardcoded bash array in `upload-doc-to-context-worker.sh`
- `docs/README.md` missing 6 subdirectories from its table

**New findings:**

- `docs/infra/ssh-tailscale-access.md` lists only 2 of 5+ fleet machines - dangerously stale for its purpose
- `docs/runbooks/new-box-onboarding.md` machine list stale
- `docs/process/dev-directive-pr-workflow.md` and `dev-directive-qa-grading.md` are superseded historical directives still listed under "Core Workflows"
- `docs/planning/WEEKLY_PLAN.md` 61 days stale (Week of 2026-02-02)

### 6. Scripts & ops - Grade: D+ (unchanged)

**Bootstrap scripts:** All 4 still exist unchanged. `bootstrap-new-box.sh` reimplements tool installation independently instead of calling `bootstrap-machine.sh` (the mac flow does call it). Core overlap unfixed.

**Prior audit correction:** 5 scripts flagged as dead are actually live: `ai-sesh.sh` (installed by setup-cli-commands.sh), `ccs.sh` (installed and documented), `harden-mac.sh` (called by bootstrap-new-mac.sh), `optimize-macos.sh` (called by bootstrap-new-mac.sh), `fix-tailscale-cli.sh` (documented operational fix).

**Confirmed dead (6):** `migrate-claude-native.sh`, `cache-docs.sh`, `golden-path-audit.sh`, `block-analytics-beacon.sh`, `extract-design-tokens.sh`, `setup-dev-box.sh` (deprecated Bitwarden version).

**SOS/EOS migration still incomplete.** `setup-cli-commands.sh` still copies deprecated scripts to `~/.local/bin` and Codex/Gemini prompt templates still reference them.

**New finding:** `setup-new-venture.sh` at 782 LOC is a god script (10+ distinct operations). Three doc-sync workflows (`sync-docs.yml`, `sync-docs-to-context-worker.yml`, `upload-instructions.yml`) cover different path trees but do the same operation - consolidation opportunity.

---

## Cross-cutting themes

### 1. Incomplete migrations leaving two systems running (unchanged)

- SOS/EOS: deprecated shell scripts still installed alongside MCP tools
- HTTP client: `CraneApi` (Node) and `CraneContextClient` (Workers) with duplicated interface types
- Bootstrap: 4 overlapping scripts, `bootstrap-new-box.sh` reimplements instead of delegating

**Pattern persists.** No structural fix was applied since the prior audit.

### 2. God files accumulating concerns (worse)

- `launch-lib.ts` grew from 1,474 to 1,580 LOC
- All other god files unchanged
- No splits were executed from the prior audit's recommendations

### 3. Schema/config drift between parallel surfaces

New instances discovered:

- Static JSON schema vs Zod schema (`crane_handoff` missing `venture`)
- Local vs remote tool registrations (`crane_doc` missing params, `crane_sos` referencing remote-only tools)
- `smoke_test_notifications` vs `notifications` table columns
- `wrangler.toml` comment contradicting actual config value

### 4. Prior audit items not addressed

Of the prior audit's 5 critical items: 1 resolved (Fleet Ops Health), 1 corrected as misidentified (3-worker HMAC), 3 remain open (auto-resolve flag scattering, console.log in sessions.ts, deprecated SOS/EOS install). Of the 10 structural fix items: 0 executed. Of the 7 invest items: 0 executed.

---

## Delta from prior audit (2026-04-11)

### Resolved (3)

1. **Fleet Ops Health workflow** - `CRANE_ADMIN_KEY` secret added, explicit empty-check at line 67. Workflow is operational.
2. **Secrets docs duplication** - Consolidated into two-tier structure: quick-ref + comprehensive reference with explicit cross-reference.
3. **Design spec authority** - `design-system.md` now explicitly states canonical hierarchy.

### Corrected (prior audit was wrong) (3)

1. **"3-worker HMAC duplication"** - Only crane-watch validates webhooks. crane-context uses relay-key auth. crane-mcp-remote is a REST client. The utility function duplication across workers is unavoidable.
2. **"NOTIFICATIONS_AUTO_RESOLVE_ENABLED in 4+ files"** - Actually in 3 files. `admin-notifications.ts` does not read the flag.
3. **"Dead scripts: ai-sesh.sh, ccs.sh, harden-mac.sh, optimize-macos.sh, fix-tailscale-cli.sh"** - All have real callers or documented operational references.

### Still on the list (not addressed) (14)

1. God files (crane-watch, sessions.ts, notifications.ts, queries.ts, launch-lib.ts)
2. SOS/EOS deprecated scripts still installed
3. Settings.json deny/allow contradiction
4. `request_log` table dead
5. `rate_limits` cleanup missing
6. `crane_schedule` monolithic (9 actions)
7. `crane_handoff_update` dead tool
8. `crane_token_report` dead tool
9. Bootstrap script overlap
10. crane_docs manifest hardcoded
11. docs/pm/prd.md stale monolith (now 57 days, was 52)
12. docs/wireframes/ orphaned
13. docs/templates/newsletter-digest.md dead
14. console.log in production paths

### New (9)

1. **[Critical]** `crane_sos` references non-existent local tools
2. **[Critical]** `crane_handoff` static schema missing `venture` param
3. Genericization rule duplication across 3 editorial skills
4. `update`/`heartbeat` skills use raw curl instead of MCP
5. `enhance-prompt` phantom skill
6. `notes.meta_json` never written
7. `smoke_test_notifications` schema divergence from `notifications`
8. `ssh-tailscale-access.md` machine table stale (2 of 5+)
9. `setup-new-venture.sh` 782-LOC god script

---

## Kill list

### Code

| Item                            | File                                                             | Reason                                                          |
| ------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `crane_handoff_update` tool     | `packages/crane-mcp/src/index.ts:182`, `tools/handoff-update.ts` | Zero external usage, flagged in two consecutive audits          |
| `crane_token_report` tool       | `packages/crane-mcp/src/index.ts:394`, handler at line 735       | Zero external usage, skips Zod, in-memory only                  |
| `request_log` table + 4 indices | `workers/crane-context/migrations/schema.sql:160-192`            | Never written, dead since inception                             |
| `notes.meta_json` column        | `migrations/0011_drop_note_categories.sql:27`                    | Never written by any code path                                  |
| `console.log(error)`            | `workers/crane-context/src/endpoints/sessions.ts:401`            | Redundant noise before console.error on line 402                |
| Stale wrangler.toml comment     | `workers/crane-context/wrangler.toml:57-59`                      | Says production stays false until PR A4; both envs already true |

### Scripts

| Item                        | File                                | Reason                                                                       |
| --------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `migrate-claude-native.sh`  | `scripts/migrate-claude-native.sh`  | One-time completed migration, zero references                                |
| `cache-docs.sh`             | `scripts/cache-docs.sh`             | Superseded by MCP, only cited in a comment                                   |
| `golden-path-audit.sh`      | `scripts/golden-path-audit.sh`      | No callers, no workflow                                                      |
| `block-analytics-beacon.sh` | `scripts/block-analytics-beacon.sh` | One-shot applied fleet-wide, no workflow                                     |
| `extract-design-tokens.sh`  | `scripts/extract-design-tokens.sh`  | CLI tool with no integration point                                           |
| `setup-dev-box.sh`          | `scripts/setup-dev-box.sh`          | Deprecated Bitwarden version; update `docs/process/recovery-quickref.md:134` |

### Docs

| Item                                  | File             | Reason                                        |
| ------------------------------------- | ---------------- | --------------------------------------------- |
| `docs/wireframes/`                    | Entire directory | Single stale HTML artifact, no links          |
| `docs/templates/newsletter-digest.md` | Single file      | Dead stub, unlisted in README                 |
| `docs/planning/WEEKLY_PLAN.md`        | Single file      | 61 days stale, plan managed by crane_schedule |
| `dev-directive-pr-workflow.md`        | `docs/process/`  | Superseded by `pr-workflow.md`                |
| `dev-directive-qa-grading.md`         | `docs/process/`  | Superseded by `team-workflow.md`              |

---

## Fix list

### Critical (this week)

1. **Register `crane_note_read` and `crane_handoffs` locally** or rewrite `sos.ts` output to reference existing local tools - `packages/crane-mcp/src/tools/sos.ts:708,734,747,762,1037,1063`
2. **Add `venture` to `crane_handoff` static schema** - `packages/crane-mcp/src/index.ts:159-180` (one-line fix)
3. **Add rate_limits cleanup** - `workers/crane-context/src/mcp.ts:79-100` (mirror `idempotency.ts:44-71`)
4. **Stop installing deprecated SOS/EOS scripts** - `scripts/setup-cli-commands.sh:37-43` and update embedded Codex/Gemini templates at lines 78-154, 167-243
5. **Deduplicate genericization rules** - move substitution table to terminology doc only; skills reference it instead of embedding

### Structural (week 2-3)

6. Split `crane-watch/src/index.ts` (1,347 LOC) into `types.ts`, `crypto.ts`, `github-auth.ts`, `classify.ts`, `webhooks.ts`
7. Split `launch-lib.ts` (1,580 LOC) into `mcp-config.ts`, `claude-config.ts`, `gemini-config.ts`, `agent-spawn.ts`
8. Extract `assembleSosPayload()` from `sessions.ts` (1,053 LOC) to reduce handler to <150 lines
9. Split `crane_schedule` into 2-3 tools or at minimum add Zod discriminated unions for per-action required params
10. Refactor `bootstrap-new-box.sh` to call `bootstrap-machine.sh` via SSH (matching the mac flow)
11. Add `max_chars` and `summary_only` to remote `crane_doc` schema - `workers/crane-mcp-remote/src/tools.ts:196-221`
12. Consolidate 3 doc-sync workflows into a single parameterized workflow with path matrix

### Content / docs

13. Mark `docs/pm/prd.md` as "Status: Archived / Shipped"
14. Update `docs/infra/ssh-tailscale-access.md` machine table (lists 2 of 5+ machines)
15. Update `docs/README.md` to include missing directories
16. Create `docs/crane-docs-manifest.json` to replace hardcoded bash array in `upload-doc-to-context-worker.sh`
17. Document key contracts for `sessions.meta_json` and `machines.meta_json`
18. Fix CLAUDE.md dead pointer: "MEMORY.md governance" reference to team-workflow.md which has no such section

---

## Invest list

1. **Add `console.log` lint rule** failing CI outside test files. Biggest hygiene ROI.
2. **Create a shared types package** (`@venturecrane/crane-types`) for request/response shapes consumed by both `crane-mcp` and `crane-mcp-remote`. Eliminates interface duplication.
3. **Define "definition of done" for migrations** that includes deletion of the prior system. Add to team-workflow.md.
4. **Add a smoke test for `deploy-heartbeats-reconcile.ts`** - cron-triggered code with zero test coverage.
5. **Resolve settings.json deny/allow** - either make the deny specific (not wildcard) or remove it and let `.local` be sole gatekeeper.
6. **Establish test conventions** - move `src/endpoints/__tests__/merge-blocks.test.ts` to `test/`, gate `ssh-auth.ts:129-130` console.log behind debug flag.

---

## Risk assessment

| Risk                                                                         | Likelihood  | Impact     | Notes                                          |
| ---------------------------------------------------------------------------- | ----------- | ---------- | ---------------------------------------------- |
| LLM attempts `crane_note_read`/`crane_handoffs` and gets unknown-tool errors | **Certain** | Medium     | Happens every local /sos. Silent degradation.  |
| `venture` param never passed to `crane_handoff` in cross-venture sessions    | High        | Medium     | Schema omission prevents correct behavior      |
| `rate_limits` table grows unbounded                                          | High        | Low (slow) | One row per actor per minute, no cleanup       |
| New machine bootstrapped from stale `ssh-tailscale-access.md`                | Medium      | Medium     | Lists 2 of 5+ machines                         |
| Genericization rule change in terminology doc missed in 3 skills             | Medium      | Medium     | Triple-maintenance, no sync mechanism          |
| New `crane_context` remote tools blocked by settings.json wildcard deny      | Medium      | Low        | Requires manual allowlist update               |
| God file bug fixed in one concern but not tested in isolation                | Medium      | Medium     | 1,580 LOC launch-lib.ts is untestable by parts |

---

## What was deliberately not audited

- Individual venture product codebases (vc-web, dc-marketing, dfg-console, sc-console, kidexpenses, smd-console)
- Cloudflare bindings, resource sizing, D1 quotas, worker CPU time
- Cost / spend
- The actual content of `docs/pm/prd.md` (flagged by date, didn't read 119 KB)
- The 142 handoffs in D1
- Cross-venture consistency (whether venture repos consume crane-mcp identically)
- `config/ventures.json` accuracy against live Cloudflare/GitHub state

---

## Bottom line

The platform improved from C+ to B- in one day. The three prior-audit resolutions (Fleet Ops Health, secrets docs, design spec authority) were meaningful fixes. The two new MCP critical bugs are higher-impact than anything in the prior audit because they affect every local session - but they're also fast fixes (one is a one-liner, the other is output text or tool registration).

The unaddressed structural items (god files, bootstrap overlap, dead scripts, SOS/EOS migration) represent accumulated tech debt that compounds slowly. None is urgent. All would benefit from a dedicated cleanup sprint rather than piecemeal fixes.

If the 5 critical items above are fixed this week, the grade moves to B. If the 6 structural items are addressed over 2-3 weeks, the grade moves to B+. The invest items prevent regression.
