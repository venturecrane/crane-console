# Dossier: Architectural Decisions

Window: 2026-01-13 to 2026-05-09 (~16 weeks)

## ADRs Filed

| Date | ADR | Title | Status |
| --- | --- | --- | --- |
| 2026-01-17 | ADR-025 | Crane Context Worker — Implementation Specification | Approved |
| 2026-02-11 | ADR-026 | Staging/Production Environment Strategy | Accepted (Phase 1-4 complete 2026-02-14) |

Note: Both ADRs were filed in the window; `docs/adr/` contains only these two records.

## Features Killed in Window

| Date | What | Reason | Replacement | Citation |
| --- | --- | --- | --- | --- |
| 2026-01-31 | crane-relay worker | Replaced by crane-watch + GitHub App (venturecrane-github); legacy D1/R2 decommissioned | crane-watch | PR #156, commit cca9a3d (2026-02-13 merge) |
| 2026-03-03 | crane-classifier name | Renamed to crane-watch to match narrower webhook-watch purpose | crane-watch | commit c259103 (2026-03-02) |
| 2026-03-28 | Figma MCP | API volume/cost ($660/yr Organization plan) unwarranted for current stage; community MCP too brittle | /product-design skill | memory:reference_figma_free_test.md |
| 2026-04-17 | Stitch MCP design tool | Multiple auth failures (API key vs OAuth2 conflicts, subprocess proxy churn); product-design skill end-to-end proved on ss-console | /product-design skill | PR #549 (2026-04-18), memory:design-tooling |
| 2026-04-22 | Semgrep as a Claude Code plugin | Agent-time static scans produced false-positive blocking; moved to CI-only gate | Semgrep in CI (`security.yml`) | PR #649 (2026-04-23) |
| 2026-04-22 | /analytics, /go-live, /work-plan, /status, /heartbeat, /update, /docs-refresh skills | Platform audit kill-list: unused/superseded skills cluttering surface | Context folded into /sos and other active skills | PR #616, #617, #618 (2026-04-22) |
| 2026-04-24 | crane-classifier + crane-relay empty stubs | Stale workspace entries after rename/decommission | (removed) | PR #683 (2026-04-24) |
| 2026-05-05 | /sprint and /build-log skills (and /skill-deprecate lifecycle) | No soft-sunset in an AI-agent operation; hard-delete on decision | Capability absorbed into /auto-build | PR #817 then immediately #818 (2026-05-05/06) |
| 2026-05-05 | gbp-weekly-post cadence item | SS is pre-launch; no GBP substrate exists | (dropped) | PR #821 (2026-05-06) |
| 2026-05-08 | /enhance-prompt and /react-components skills (from owners) | Removed from skill owner registry; stale/superseded | (removed) | PR #910 (2026-05-08) |

## Major Vendor / Tooling Pivots

| Date | Pivot | Citation |
| --- | --- | --- |
| 2026-02-13 | GitHub App renamed from "crane-relay" to "venturecrane-github"; relay worker deleted | commit cca9a3d, PR #156 |
| 2026-02-22 | crane-mcp-remote worker added: exposes MCP over HTTP for claude.ai integration (OAuth2, KV session state) | PR #262 |
| 2026-02-19 | gitleaks pre-commit hook added as secret detection layer | PR #256 |
| 2026-03-03 | Docs migration: Notion abandoned; all content moved to markdown + D1 (crane-context) | PR #300 |
| 2026-04-08 | ss-console transferred from smdservices GitHub org to venturecrane org (eliminates cross-org PAT requirement for shared packages) | memory:project_ss_org_transfer.md, PR #433/#434 |
| 2026-04-12 | crane-command docs site migrated from Vercel to Cloudflare Pages | PR #518 |
| 2026-04-15 | Skill governance floor: SKILL.md schema, /skill-review lint, /skill-audit cron, CI gate on skill changes | PR #529 |
| 2026-04-19 | Enterprise Claude Code plugin catalog established: Context7, TypeScript LSP, Vercel, Playwright, Frontend Design, Semgrep (6 plugins) | memory:reference_enterprise_plugins.md |
| 2026-04-22 | Semgrep promoted to required CI gate (`Security Summary` branch-protection ruleset); plugin retired from agents | PR #639, #649 |
| 2026-04-25 | Semgrep CI gate rolled to all 6 venture repos | memory:project_semgrep_fleet_rollout.md |
| 2026-04-26 | frontend-design plugin wired into /product-design as composition reference (not generator); Astro component generation remains in-loop | PR #747, memory:project_frontend_design_wire_in.md |
| 2026-05-01 | Session reflexes: UserPromptSubmit hook fires corpus-driven source-naming primer on every prompt (always-on) | PR #778, #779 |
| 2026-05-05 | Memory layer upgraded: FTS5 full-text recall, corpus migration, eval harness; fleet JSONL ingest + per-machine cron | PR #791 (1/3), PR #794 (3/3) |
| 2026-05-06 | TypeScript 6, ESLint 10, @types/node 25, node: prefix imports adopted across portfolio | PR #815 |

## New Components / Major Additions

| Date | What | Citation |
| --- | --- | --- |
| 2026-01-17 | crane-context worker (D1-backed, Cloudflare Worker): session tracking, typed handoffs, health endpoints | ADR-025; PR #149 (2026-02-14 staging/prod split) |
| 2026-02-14 | Staging/production environment split for all workers (ADR-026 execution) | PR #149, #150, #151 |
| 2026-02-15 | Cadence Engine: schedule registry + briefing surface in crane-context | commit 4960493 |
| 2026-02-22 | crane-mcp-remote worker: OAuth2 MCP bridge for claude.ai | PR #262 |
| 2026-02-20 | Fleet orchestrator: parallel agent dispatch via SSH, per-machine reliability scoring | PR #260 |
| 2026-04-07 | @venturecrane/crane-test-harness npm package: shared test utilities for Cloudflare Workers | PR #433, #435 |
| 2026-04-08 | Deploy heartbeat system: cold-deploy detector + GitHub webhook adapters + reconciliation cron | PR #450, #452, #484 |
| 2026-04-08 | Fleet-ops-health: D1-persisted fleet findings surfaced in /sos | PR #467 |
| 2026-04-23 | Hermes fleet_update skill: systemd units + provisioner for Linux fleet machines | PR #661 |
| 2026-04-23 | /auto-build orchestrator skill: plan -> critique -> execute workflow | PR #647 |
| 2026-04-24 | memory_invocations table + /memory/invocations API (usage telemetry for memory system) | PR #688 |
| 2026-04-30 | AC-tick reusable workflows: cross-repo CI cascade architecture | PR #776 |
| 2026-05-01 | Parallel-session worktree isolation hooks: EnterWorktree + /sos backstop | PR #789 |
| 2026-05-05 | crane_worktree_doctor MCP tool: replaces inline destructive bash in /sos | PR #826 |
| 2026-05-06 | crane_verify ledger + EOS surface verification gate (3-PR system) | PR #832, #866, #867 |
| 2026-05-06 | /docs-audit skill + crane_docs_drift_audit MCP tool: 6-check drift detection | PR #796 |
| 2026-05-06 | /estimate skill: reference-class effort forecasting from cycle-time corpus | PR #795 |

## Org / Infra Decisions

| Date | Decision | Citation |
| --- | --- | --- |
| 2026-01-13 | crane-relay migrating to crane-classifier (watch-only model); relay deprecated | commit 7f634f1 (2026-02-02) |
| 2026-02-13 | GitHub App (ID: 2619905) ownership: personal account (smdurgan-llc), not venturecrane org; OAuth client for crane-mcp-remote | commit cca9a3d, memory:MEMORY.md |
| 2026-02-14 | ADR-026 Phase 3: Infisical prod environment split (staging vs production secret namespaces) | commit 1367259 |
| 2026-02-23 | Guardrails framework: protected-action categories requiring Captain directive (no feature drops, no schema drops, no auth changes without escalation) | commit f380b09 |
| 2026-03-02 | crane-watch uses Cloudflare service binding to crane-context (not HTTP) for internal forwarding | PR #301 |
| 2026-04-09 | D1 schema hash committed to repo as integrity invariant; verified on every deploy | PR #469, #470 |
| 2026-04-09 | Infisical: never run `infisical secrets` without `--values=false`; pipe-only secret delivery | memory:feedback_infisical_never_list_with_values.md |
| 2026-04-12 | SOD/EOD terminology renamed to SOS/EOS across entire codebase | PR #523 |
| 2026-04-12 | QA grading system removed from crane-watch and enterprise docs | PR #515 |
| 2026-04-16 | Global skills version-controlled in crane-console and synced to fleet via `.agents/skills/` | PR #528 |
| 2026-04-23 | Skill triplet (`.claude/commands/`, `.gemini/commands/`, `.agents/skills/`) added to `.gitignore` as launcher-mirrored artifacts | memory:feedback_skills_dirty_state_gitignore.md, PR #822 |
| 2026-04-25 | W3C-DTCG token format adopted as design token standard across venture design systems | PR #713, #725, #736 |
| 2026-05-01 | Fleet branch-protection: canonical profile script + required status checks enforced on all venture repos | PR #782 |
| 2026-05-05 | Memory injection gate flipped from `both` to `injectable` (`MEMORY_INJECTION_GATE` config) | PR #799 |
| 2026-05-06 | Portfolio ESLint coding standard adopted: function-per-file, no barrel exports; structural violations refactored | PR #868 |
| 2026-05-06 | Soft-sunset / deprecation grace window policy killed: hard-delete on decision, no lifecycle theater | PR #818, memory:feedback_no_soft_sunset.md |

## Data Sources Used

- `git log origin/main --since=2026-01-13 --grep='deprecate|kill|remove|sunset|retire' --pretty='%h %ad %s' --date=short`
- `git log origin/main --since=2026-01-13 --until=YYYY-MM-DD --pretty='%h %ad %s' --date=short` (multiple date slices)
- `gh pr list --repo venturecrane/crane-console --state merged --search 'kill OR remove OR deprecate' --limit 100`
- `gh pr list --repo venturecrane/crane-console --state merged --limit 300 --json number,title,mergedAt`
- `gh pr view N --repo venturecrane/crane-console --json mergedAt,title` (individual PR lookups)
- `docs/adr/025-crane-context-worker.md`, `docs/adr/026-environment-strategy.md`, `docs/adr/index.md`
- Memory files: `project_semgrep_fleet_rollout.md`, `project_ss_org_transfer.md`, `reference_enterprise_plugins.md`, `reference_figma_free_test.md`, `project_frontend_design_wire_in.md`, `feedback_no_soft_sunset.md`, `feedback_skills_dirty_state_gitignore.md`, `feedback_infisical_never_list_with_values.md`
