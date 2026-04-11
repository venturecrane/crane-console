# Platform Audit — Crane Operating System

**Date:** 2026-04-11
**Auditor:** Claude (Opus 4.6, via `/platform-audit`)
**Scope:** crane-console (workers, packages, scripts), `.claude/` skills + commands, MCP tool surface, D1 datastores, documentation system, operational scaffolding. **Excludes** individual venture product codebases.
**Method:** Six parallel Explore agents covering distinct domains, synthesized into a single senior-engineer report.
**Verdict:** **C+ overall.** Functional, reasonably secure, architecturally coherent at the macro level. Concentrated sprawl in a few hot spots, an incomplete migration, dead code that nobody noticed, and a critical CI failure with a five-minute fix sitting unfixed for days.

---

## TL;DR

A senior team would say this in their out-brief: _"You have a real platform here. The bones are good — auth, idempotency, migrations, MCP layering, the memory system, the core process docs. The problems are not architectural; they are hygiene. You have ~30% sprawl by volume, an unfinished migration leaving two systems running in parallel, and a handful of latent issues you should fix immediately. None of it is on fire. All of it is fixable in 2-3 focused weeks."_

---

## 🔥 Critical / fix this week

These are not "nice to have" — they're current bugs, security smells, or blocking issues.

| #     | Issue                                                                  | Where                                                                                                                                                                | Why it matters                                                                                                                                 | Fix                                                                                                                    |
| ----- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **1** | **Fleet Ops Health workflow failing** (the 9 critical alerts on SOS)   | `.github/workflows/fleet-ops-health.yml`                                                                                                                             | The workflow exits with `CRANE_ADMIN_KEY secret is not set`. It has been failing since at least Apr 9. The weekly cross-venture audit is dark. | Add the secret: `gh secret list \| grep CRANE_ADMIN_KEY`, then `gh secret set CRANE_ADMIN_KEY` from Infisical. ~5 min. |
| **2** | **GitHub HMAC signature validation duplicated across 3 workers**       | `crane-watch/src/index.ts`, `crane-context/src/notifications-github.ts`, `crane-mcp-remote/src/github-api.ts`                                                        | Same `crypto.createHmac('sha256', ...)` pattern in 3 places. A security bug fixed in one will not fix the others.                              | Extract to `packages/crane-lib/src/github-signature.ts`, import everywhere.                                            |
| **3** | **`NOTIFICATIONS_AUTO_RESOLVE_ENABLED` flag scattered across 4 files** | `constants.ts`, `notifications.ts`, `endpoints/admin-notifications.ts`, `notifications-green.ts`                                                                     | Impossible to audit whether the flag is consistently honored. Correctness risk.                                                                | Centralize: `notifications-auto-resolve-config.ts` with `shouldAutoResolve(env)` helper.                               |
| **4** | **Bare `console.log(error)` in production error path**                 | `crane-context/src/endpoints/sessions.ts:401`                                                                                                                        | Swallows stack traces. Loses evidence on the next session-handling bug.                                                                        | One-line fix: log with stack or rethrow.                                                                               |
| **5** | **Deprecated SOS/EOS scripts still being installed**                   | `setup-cli-commands.sh:37-40` copies `sos-universal.sh` and `eos-universal.sh` into `~/.local/bin` even though their headers say "DEPRECATED: replaced by MCP tools" | Two parallel SOS systems. Drift risk. New machines get the legacy version.                                                                     | Delete the `cp` lines from `setup-cli-commands.sh`. Delete the `*-universal.sh` scripts.                               |

---

## Inventory (what we have, sized)

| Domain                    | Count                               | Size                                     | Health                                                      |
| ------------------------- | ----------------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Workers                   | 3                                   | 27,854 LOC                               | crane-context healthy core, crane-watch is a god file       |
| Packages                  | 2                                   | 22,847 LOC                               | crane-mcp clean (thin wrapper), crane-test-harness modest   |
| Test files                | 54                                  | ~8,000 LOC                               | 17% test ratio overall; over-mocked at the tool layer       |
| MCP tools (local)         | 19                                  | ~7,640 tokens of schema at session start | Architecturally sound; one bloated tool, two dead ones      |
| MCP tools (remote)        | 8                                   | —                                        | Read-only subset for claude.ai; intentional                 |
| Slash commands            | 25                                  | 256 KB / 5,403 lines                     | Functional but ~28% reducible via consolidation             |
| Project agents            | 1                                   | —                                        | sprint-worker.md only                                       |
| User-level skills         | 5                                   | —                                        | All design tooling; no overlap with commands                |
| Shell scripts             | 56                                  | ~8,000 LOC                               | ~30% deletable or mergeable                                 |
| GitHub Actions workflows  | several                             | —                                        | 1 broken, rest healthy                                      |
| D1 tables                 | 22                                  | —                                        | 1 dead, 1 sprawled, 2 marginal, 18 healthy                  |
| D1 migrations             | 27 (0003-0029)                      | —                                        | Includes one drop-and-rebuild and one retroactive bootstrap |
| docs/ tree                | 19 subdirs / 120 files              | 1.2 MB                                   | 60% healthy / 40% stale or contradictory                    |
| Instruction files at root | 3 (CLAUDE.md, AGENTS.md, GEMINI.md) | —                                        | CLAUDE.md restrained; AGENTS/GEMINI ~95% redundant, no sync |
| Memory system             | MEMORY.md + 17 satellite files      | —                                        | **Exemplary** — best-maintained surface in the system       |

---

## Findings by domain (condensed)

### 1. Workers & packages — Grade: C+

**Strengths.** The auth pattern (timing-safe key compare + correlation IDs), the idempotency implementation, the handoff content-hashing, the migrations (well-ordered, prepared statements), and the MCP protocol handler are all solid work. The constants file is well-disciplined.

**God files.** Five files cross 800 LOC; three of them mux unrelated concerns:

- `crane-watch/src/index.ts` — **1,347 LOC.** Webhook routing + GitHub signature validation + Gemini classification + DB audit logging + Vercel forwarding. Should be 4 files.
- `crane-context/src/endpoints/sessions.ts` — **1,053 LOC.** Five endpoint handlers (SOS/EOS/heartbeat/checkpoint/update) crammed together. **15 catch blocks** in one file.
- `crane-context/src/endpoints/queries.ts` — **891 LOC.** Six unrelated GET endpoints in one file.
- `crane-context/src/notifications.ts` — **929 LOC.** Notification state machine with feature-flag branching across files.
- `packages/crane-mcp/src/cli/launch-lib.ts` — **1,474 LOC.** This one is at least cohesive (CLI launcher) but is approaching the upper bound of "one thing".

**Test pathology.** `sos.ts` is 1,289 LOC; `sos.test.ts` is **1,368 LOC** (test file bigger than source). Tool tests mock `CraneApi` entirely — they prove the harness works, not that the tool does. The reconciliation logic in `deploy-heartbeats-reconcile.ts` is cron-triggered and barely tested.

**Logging discipline.** ~10 `console.log` statements left in production code paths in admin-doc and reconciliation handlers.

**Layer leakage.** `crane-mcp-remote` has its own HTTP client to crane-context that duplicates `packages/crane-mcp/src/lib/crane-api.ts`. Two clients, one API.

### 2. Slash commands & instruction files — Grade: C

**Three sprawl clusters that should consolidate:**

1. **Session lifecycle:** `/sos /status /update /heartbeat /eos` — five commands manipulating the same session state with overlapping semantics. `/status` and `/sos` both display session age. `/update`, `/heartbeat`, and `/eos` all refresh the heartbeat. **Should be 2 commands** (`/sos` to start, `/eos` to end). The rest is auto-managed.
2. **Reviews:** `/code-review`, `/enterprise-review`, `/critique`. `/enterprise-review` is `/code-review` with `--enterprise`. **Merge.**
3. **Editorial:** `/build-log`, `/edit-log`, `/edit-article`. The genericization rules (crane-\* hiding, stealth filtering) are duplicated inline in all three. **Extract a shared editorial subroutine.**

**Massive duplication inside `/prd-review` (28KB) + `/design-brief` (30KB).** Both implement multi-round parallel agent orchestration with archive rotation. The orchestration engine is copy-pasted between them. ~40KB of pure duplication. Should be one shared subroutine.

**Three instruction files at root.** `CLAUDE.md` is well-restrained. `AGENTS.md` (Codex) and `GEMINI.md` (Gemini) are ~95% identical to CLAUDE.md and to each other, with no sync mechanism. Any rule update has to be made in three places by hand. **Either consolidate or add a CI check.**

**Settings precedence is muddled.** `.claude/settings.json` denies `mcp__claude_ai_crane_context__*`. `.claude/settings.local.json` allows it. If `.local` overrides, the deny is meaningless. If they merge, they contradict.

### 3. MCP tool surface — Grade: B

This is the **best-architected** part of the codebase. crane-mcp is a properly thin wrapper over crane-context; no business logic has leaked into the MCP layer. Error handling is comprehensive. Zod validation at boundaries. Architecturally sound.

**The exceptions:**

- **`crane_schedule` is bloated.** 9 actions in one tool (1,250 tokens of schema). It's actually three different tools mashed together: cadence management, planned events CRUD, and session history. **Split into 3.**
- **Two dead tools.** `crane_handoff_update` (only 1 reference) and `crane_token_report` (4 references, all internal). Delete or deprecate.
- **`crane_sos` is a 1,289-LOC handler.** Doesn't waste tokens (single-action), but it's doing a lot. Worth extracting helper functions.

Total session-start schema cost: ~7,640 tokens — 40% heavier than the stitch-design baseline. ~5% reducible via the cleanup above.

### 4. D1 datastores — Grade: B-

22 tables. The schema is mostly healthy and well-indexed for hot paths. Migrations use prepared statements throughout. The bootstrap recovery (migration 0027 retroactively populating `d1_migrations`) was a smart move.

**The problems:**

- **`request_log` is dead.** Defined in `schema.sql` with 5 indices, never written to anywhere in the codebase. Drop it.
- **`notifications` table has 35 columns.** Base 15 + match_key sprawl (9) + audit fields (3) + extras. Several columns (workflow_id, app_id) are stored both as relational columns and inside `details_json`. Over time this table will be a query nightmare. Normalize.
- **`work_days` is experimental** — 6 columns, only 3 references in code. Either use it or kill it.
- **`rate_limits` has no cleanup.** `expires_at` is advisory; nothing reaps expired rows. Add a cron or self-cleanup on read.
- **`meta_json` columns** appear on `sessions`, `machines`, and `notes` with undocumented semantics. The notes one is even labeled "unused in v1". Document or drop.
- **Migration 0011 dropped `notes.category`** and migrated to `notes_new` — proof of taxonomy churn. The leftover `notes_new` artifact may or may not have been cleaned up; verify.
- **Migrations 0001 and 0002 are missing** from the tree. Probably benign (consolidated into `schema.sql`), but worth a one-line note in the migrations README explaining why.

### 5. Documentation system — Grade: C+ (but the index is excellent)

**MEMORY.md is the best surface in the entire system.** Restrained, indexed, actionable, satellite files for detail. Use this as the model for everything else.

**docs/process/ (30 files, 324 KB) is also excellent** — actively maintained, well-linked, feeds crane_docs cleanly.

**The rest is mixed.** ~38% of docs/ files are >30 days old. Specific stale or dead items:

- `docs/pm/prd.md` — **119 KB monolithic PRD, 52 days untouched.** Either it's still the bible (and someone should re-read it) or it's archive material. Probably needs to be split.
- `docs/design/` — 7 venture-specific design specs, all 39 days stale. The design source of truth has effectively moved to Stitch (per the `stitchProjectId` in `config/ventures.json`), but these files are still presented as canonical. **Mark as archive, point to Stitch.**
- `docs/templates/newsletter-digest.md` — 54 days old, no references anywhere. **Dead.**
- `docs/wireframes/index.md` — orphaned single file with no actual wireframes. **Dead.**
- `docs/handoffs/` — 3 files from January, 70-80 days old. The handoff system moved to D1 (`crane_handoff` MCP tool) months ago. **Move to docs/archive/.**

**Contradictions found:**

- **Fleet bootstrap instructions are fragmented across 3 docs** (`MEMORY.md`, `docs/runbooks/new-mac-setup.md`, `docs/instructions/fleet-ops.md`) with different emphasis. `new-mac-setup.md` omits the optimize and mesh phases that MEMORY.md and `fleet-ops.md` consider mandatory. **Real risk** — someone bootstrapping a new machine from the runbook will get an incomplete setup.
- **Secrets docs duplicated** in `docs/process/secrets.md` and `docs/infra/secrets-management.md`.
- **Design spec authority unclear** — three documents say three different things about whether Stitch or the static specs are authoritative.

**No master manifest for crane_docs.** The "what's uploaded" index lives as a hardcoded bash array in `scripts/upload-doc-to-context-worker.sh`. A doc that gets added to `docs/instructions/` but not to that whitelist is invisible to crane_doc. Needs a real manifest.

**ADRs are aging.** ADR-026 (environment strategy) is 39 days stale and may not match current practice.

### 6. Scripts & ops scaffolding — Grade: D+

This is the worst surface by a meaningful margin. 56 shell scripts, ~8,000 LOC, with the most concentrated sprawl in the codebase.

**Bootstrap script chaos.** Four scripts overlap heavily:

- `bootstrap-machine.sh` (459 LOC) — the actual core, should be the source of truth
- `bootstrap-new-mac.sh` (564 LOC) — wraps the above with macOS specifics
- `bootstrap-new-box.sh` (468 LOC) — wraps the above with Linux specifics
- `setup-dev-box.sh` (294 LOC) — **deprecated, uses Bitwarden which has been replaced**, but still in the repo

Plus `ubuntu-server-setup.sh` and `xubuntu-dev-setup.sh` duplicate tool installation. **2,100 LOC could be ~600 LOC.**

**Migration cruft.** `migrate-claude-native.sh` (276 LOC) is a one-time fleet migration that's complete. Should be archived.

**Incomplete SOS/EOS migration.** As called out in the critical section: `sos-universal.sh` and `eos-universal.sh` are marked deprecated in their own headers, but `setup-cli-commands.sh` still copies them into `~/.local/bin`. Two parallel session systems.

**Dead scripts** (~7-10 candidates with no references in workflows, package.json, or docs): `ai-sesh.sh`, `ccs.sh`, `cache-docs.sh`, `golden-path-audit.sh`, `extract-design-tokens.sh`, `block-analytics-beacon.sh`, `field-mode.sh`, `harden-mac.sh`, `optimize-macos.sh`, `fix-tailscale-cli.sh`. Some are one-time fixes that should be archived; some are speculative tooling that never got wired up.

**Healthy scripts** (keep): `fleet-ops-health.sh` (the workflow is broken, the script is fine), `secret-sync-audit.sh`, `system-readiness-audit.sh`, `setup-new-venture.sh`, `setup-ssh-mesh.sh`, the smoke tests, `bootstrap-machine.sh`, `bootstrap-infisical-ua.sh`.

---

## Cross-cutting themes

These are the patterns that show up across multiple domains. They predict where the _next_ mess will appear.

### 1. Incomplete migrations leaving two systems running

- SOS/EOS: shell scripts + MCP tools, both installed
- Design specs: static markdown + Stitch, both labeled canonical somewhere
- Handoffs: D1 backend + 3 stale files in `docs/handoffs/`
- Bootstrap: 4 overlapping scripts, none clearly authoritative
- HTTP client: `packages/crane-mcp/src/lib/crane-api.ts` + `workers/crane-mcp-remote/src/crane-api.ts`

**Pattern:** When a new approach is built, the old one is rarely deleted. AI agents are conservative about deletion. **Fix:** every migration needs a "delete the old thing" step in its definition of done.

### 2. Inline duplication instead of shared subroutines

- GitHub signature validation in 3 workers
- Multi-round agent orchestration in `/prd-review` and `/design-brief`
- Genericization rules in 3 editorial commands
- Session-fetch boilerplate in `/update` and `/heartbeat`
- HTTP client in 2 places

**Pattern:** AI agents copy-paste before they extract. The cost shows up the second time someone tries to fix a bug "in that thing" and finds three of them.

### 3. God files where related concerns should be split

- `crane-watch/src/index.ts`
- `endpoints/sessions.ts`
- `endpoints/queries.ts`
- `notifications.ts`
- `notifications` D1 table (35 columns)

**Pattern:** When a file already exists for "the thing," new code goes there even if it's a different thing. AI agents under-create files.

### 4. Hardcoded indexes and whitelists where data should live

- `GLOBAL_DOCS` whitelist as a bash array in `upload-doc-to-context-worker.sh`
- Slash command scoping rules embedded in each command's prompt
- QA grade strings hardcoded in `crane-watch/src/index.ts`

**Pattern:** "Index" data living in code instead of in a manifest file. Easy to fix, easy to forget.

### 5. Logging left in as debugging breadcrumbs

- `console.log` in 7+ admin-docs handlers
- `console.log` in deploy-heartbeats reconciliation
- Bare `console.log(error)` in sessions endpoint

**Pattern:** Agents add logging while debugging and don't remove it. **Fix:** add a CI check that fails on `console.log` outside test files (allow `console.error` and `console.warn`).

### 6. What's working: the disciplined cores

The places where someone clearly wrote a careful spec and stuck to it are excellent:

- **MEMORY.md and the satellite-file pattern.** Best documentation surface in the system.
- **Auth + idempotency + content-hashing** in crane-context. Senior-grade work.
- **`crane-mcp` as a thin wrapper** over crane-context. Clean layering, no leakage.
- **Migrations.** Well-ordered, prepared statements, recovered cleanly from the manual-execute era.
- **`docs/process/`** — 30 files, well-indexed, fed cleanly into crane_docs.
- **`config/ventures.json`** — single source of truth for venture metadata.

The pattern: things that have **one author and one specification** are tight. Things that have **accumulated through serial AI-agent edits** are sprawling. This is the most important architectural insight — the system needs explicit ownership/authority per surface.

---

## Action plan: kill / fix / invest

### 🪦 KILL LIST (delete these — ~30% volume reduction)

**Code:**

- `request_log` D1 table (after confirming zero rows)
- `crane_handoff_update` MCP tool
- Unused exports in `deploy-heartbeats-github.ts` (`ventureForRepo`, `defaultColdThresholdDays`)

**Scripts (delete or archive to `docs/migrations/`):**

- `sos-universal.sh`, `eos-universal.sh`, `ai-sesh.sh`
- `setup-dev-box.sh` (deprecated Bitwarden version)
- `migrate-claude-native.sh` (one-time, complete)
- `cache-docs.sh`, `ccs.sh`, `field-mode.sh`, `golden-path-audit.sh`, `extract-design-tokens.sh`, `block-analytics-beacon.sh`, `harden-mac.sh`, `optimize-macos.sh`, `fix-tailscale-cli.sh` (verify with grep first)

**Slash commands (consolidate, then delete originals):**

- `/status`, `/update`, `/heartbeat` (folded into `/sos`/`/eos` lifecycle)
- `/enterprise-review` (becomes `/code-review --enterprise`)

**Docs:**

- `docs/templates/newsletter-digest.md`
- `docs/wireframes/index.md` (if no wireframes follow)
- `docs/handoffs/*` (move to `docs/archive/handoffs/`)

### 🔧 FIX LIST (refactor these — ~2-3 weeks of focused work)

**Critical (this week):**

1. Add `CRANE_ADMIN_KEY` GitHub secret → unbreaks Fleet Ops Health workflow
2. Extract `packages/crane-lib/src/github-signature.ts`, replace 3 inline copies
3. Centralize `shouldAutoResolve(env)` in one config module
4. Remove deprecated SOS/EOS copies from `setup-cli-commands.sh`
5. Fix bare `console.log(error)` in `sessions.ts:401`

**Structural (week 2):**

6. Split `crane-watch/src/index.ts` into `index.ts` (router) + `github-webhook.ts` + `vercel-webhook.ts` + `classify.ts`
7. Split `endpoints/queries.ts` into 6 per-endpoint files
8. Split `crane_schedule` MCP tool into `crane_cadence`, `crane_planned_events`, `crane_session_history`
9. Merge `bootstrap-new-mac.sh` + `bootstrap-new-box.sh` → `bootstrap-remote.sh` with OS detection
10. Merge `ubuntu-server-setup.sh` + `xubuntu-dev-setup.sh` → `setup-linux-dev.sh`

**Content (week 3):**

11. Extract a shared `multi_round_orchestrator()` subroutine; rewrite `/prd-review` and `/design-brief` to use it
12. Merge `/edit-log` and `/edit-article` into `/edit-content` with frontmatter detection
13. Decide AGENTS.md/GEMINI.md fate: either consolidate into CLAUDE.md with conditional sections, or add a pre-commit hook that checks all three for sync drift
14. Refresh the 3 stale doc series: `docs/pm/prd.md`, `docs/design/`, ADR-026
15. Consolidate fleet bootstrap instructions to a single `docs/instructions/bootstrap.md`; delete the contradictory copies
16. Normalize the `notifications` D1 table — extract `notification_workflows` and `notification_deployments` subtables, drop redundant match_key columns

### 🌱 INVEST LIST (do these to prevent regression)

1. **Add a `console.log` lint rule** that fails CI outside test files. Single biggest hygiene improvement for the cost.
2. **Create `docs-manifest.json`** — replace the bash whitelist in `upload-doc-to-context-worker.sh` with a real manifest. crane_docs becomes auditable.
3. **Define a "definition of done" for migrations** that includes deletion of the previous system. Add this to the team workflow doc.
4. **Add an integration test for `deploy-heartbeats-reconcile.ts`** — cron-triggered code with no real test coverage is a foot-gun.
5. **Create a shared HTTP/MCP schema package** — single source of truth for request/response shapes consumed by both crane-mcp (Zod) and crane-context HTTP validators.
6. **Adopt the MEMORY.md pattern for other doc surfaces** — short index, satellite files for detail, ruthless about pruning.
7. **Establish ownership per surface.** Every file should have a known author/maintainer. The unowned surfaces are where the sprawl came from.

---

## Risk assessment

| Risk                                                                                                              | Likelihood | Impact | Notes                                   |
| ----------------------------------------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------- |
| Security bug fixed in one signature validator but not the others                                                  | Medium     | High   | Fix item #2 makes this go away          |
| New machine bootstrapped from stale runbook gets incomplete setup                                                 | Medium     | Medium | Bootstrap doc consolidation             |
| Auto-resolve flag inconsistency causes notifications to silently auto-resolve when they shouldn't (or vice versa) | Low        | High   | Centralize the flag                     |
| New engineer (or new agent session) chooses the wrong SOS/EOS path because both exist                             | High       | Low    | Already happening; finish the migration |
| Slash command duplication causes a feature added to `/prd-review` to silently miss `/design-brief`                | High       | Medium | Extract shared subroutine               |
| Stale design specs in `docs/design/` get used by an agent instead of Stitch, producing off-brand work             | Medium     | Medium | Mark archive, point to Stitch           |
| `notifications` table query performance degrades as match_key combinations grow                                   | Low        | Medium | Normalize when convenient               |

**No critical security risks found.** Auth, SQL injection prevention, idempotency, and timing-safe comparisons are all done correctly. The signature-validation duplication is the closest thing to a security smell, and even that's not a bug today — it's a _latent_ bug waiting for someone to fix one and miss the others.

---

## What was deliberately not audited

So what's still in the dark:

- **Individual venture product codebases** (vc-web, dc-marketing, dfg-console, sc-console, kidexpenses) — separate audits.
- **The `site/` subdirectory** in this repo.
- **Cloudflare bindings and resource sizing** — D1 quotas, KV usage, worker CPU time.
- **Cost** — no spend audit.
- **The actual content of `docs/pm/prd.md`** — flagged as stale by date, didn't read its 119 KB to assess accuracy.
- **The 139 handoffs in D1** — flagged as accumulation, didn't audit their contents for value.
- **Cross-venture consistency** — whether the venture repos all consume crane-mcp the same way.

Each is a reasonable follow-up, none is urgent.

---

## Bottom line

This is not a slop problem — it's an **ungardened tool shed** problem. Most of what's in here works and several pieces are excellent. The mess is concentrated:

- **One critical bug** (Fleet Ops Health, 5-minute fix)
- **One incomplete migration** (SOS/EOS, half a day to finish)
- **Three sprawl clusters** (god files, command duplication, bootstrap scripts) that need 1-2 days each to clean up
- **Routine doc hygiene** — refresh 3 stale series, kill 2 dead ones, write a manifest

If the items above are addressed in the order listed over 2-3 weeks, the grade goes from C+ to B+ and the rate of debt accumulation drops materially. None of it is dramatic. All of it is the normal cost of building fast with AI agents and not pruning regularly.
