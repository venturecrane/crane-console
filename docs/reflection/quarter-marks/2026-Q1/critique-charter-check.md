# Critique: Charter Check
Window: 2026-01-13 to 2026-05-09 (Stage 1 capability assessment)

## Summary verdict

Stage 1 capability came together as a coherent stack, with measurable evidence on nine of ten checkpoints and one checkpoint that finished the window in active rollout rather than steady state. The handoff ledger (501 sessions across 7 ventures), the GitHub history (907 PRs merged across 13 repos), the architectural decision log (2 ADRs and ~50 distinct pivots/additions captured in `dossier-decisions.md`), and the published article cadence (45 pieces, 85,340 words) are not the artifacts of an operation still figuring out whether the model works. They are the artifacts of an operation that learned to run. The capability stack — sessions, memory, isolation, content, telemetry, gates, governance, fleet — is in production and has carried real venture work through it. The operation is ready to enter Stage 2 in the sense that its operating substrate no longer needs to be invented during a client engagement; it is ready, with caveats, named below, that should be retired before client work depends on them.

## Per-checkpoint assessment

### 1. Session continuity
**Verdict:** Done.

Evidence: 501 handoffs persisted to D1 via `crane-context` worker (`dossier-handoffs.md`); `/sos` and `/eos` are the deterministic primary path with the SOD/EOD rename completed 2026-04-12 (PR #523, `dossier-decisions.md`). Cadence engine and session-history surface shipped 2026-02-15 (commit 4960493). EOS surface verification gate landed 2026-05-06 (PR #832, #866, #867) closing the loophole where a session could end with skill-triplet drift or unverified surfaces.

Risk or gap: 185 of 501 handoffs (37%) ended `in_progress` with numbered pickup lists (`dossier-handoffs.md`), and 32 ended with PRs open awaiting Captain merge. The continuity primitive works; the discipline of finishing inside one session does not yet match it. That is a Stage 1.5 polish, not a capability gap.

### 2. Cross-machine memory
**Verdict:** Working but brittle.

Evidence: Memory layer upgraded 2026-05-05 with FTS5 full-text recall, corpus migration, eval harness, and per-machine JSONL ingest cron (PR #791, #794 in `dossier-decisions.md`). Auto-memory at 56 entries; enterprise memory at 20 entries; 76 combined (`dossier-memory.md`). `memory_invocations` telemetry table shipped 2026-04-24 (PR #688).

Risk or gap: The brittleness is real and named in `MEMORY.md` itself — the memory store sits on mac23 as a single host, and zero of the 20 enterprise memories had a citation event when this dossier was captured (`dossier-memory.md`). The whole-window capture-date histogram (0 in Jan, 0 in Feb, 1 in Mar, 33 in Apr, 22 in May partial) confirms the charter's own observation: discipline of writing memories did not exist in the early window. Capability is there; usage curve has just started bending.

### 3. Parallel session isolation
**Verdict:** Done.

Evidence: `parallel-session-detect.sh` (SessionStart), `parallel-session-gate.sh` (PreToolUse `*`), `parallel-session-provision.sh` (PostToolUse `EnterWorktree`) are wired in `~/.claude/settings.json` (`dossier-tooling.md`). Worktree isolation hooks merged 2026-05-01 (PR #789); `crane_worktree_doctor` MCP tool replaced inline destructive bash 2026-05-06 (PR #826). The "git add -A sweeps another agent's edits" failure mode is documented (`feedback_commit_early_when_parallel_agents.md`) and the article `parallel-session-worktree-isolation` (2026-05-05) closed the public loop.

Risk or gap: `feedback_agent_isolation_worktree_unreliable.md` flags two failure modes still present — shared worktree and agents landing in primary checkout — and `/auto-build` step 5 is the recommended pre-flight probe. Isolation is in production but its reliability score is not yet measured.

### 4. Cross-venture context
**Verdict:** Done.

Evidence: `CRANE_VENTURE_CODE`, `CRANE_VENTURE_NAME`, `CRANE_REPO`, `CRANE_CONTEXT_KEY` injected by the launcher and visible in this very session (CLAUDE.md "Environment Variables"). The article `cross-venture-context-agent-awareness` (2026-03-28) documents the mechanism. `docs/claude-projects/` carries per-venture instruction files for dc, dfg, ke, sc, smd, ss, vc (`dossier-knowledge.md`). The handoff ledger's by-venture distribution (vc=268, ss=150, dc=65, dfg=8, ke=5, sc=4) shows the system tagging sessions correctly across the portfolio.

Risk or gap: None at the capability level.

### 5. Content engine
**Verdict:** Done.

Evidence: 45 articles published in window; 2.8/week average; 85,340 words; voice mix 62% methodology / 33% captain-perspective / 4% venture-update (`dossier-articles.md`). The pipeline is `/edit-article` + `/edit-log` (skills shipped 2026-02-14 and 2026-02-15) plus the captured lesson in `feedback_edit_article_skill.md` ("always use both before merge"). Output is steady through the entire window after the Feb dip — including a 7-piece week 2026-04-20 immediately after the kill-discipline cascade.

Risk or gap: Voice distribution is methodology-heavy. The charter's Stage 2 deliverable (case studies, named outcomes) needs `venture-update` voice volume to grow; today it is 4% of corpus.

### 6. Operational telemetry
**Verdict:** Done.

Evidence: Deploy heartbeat system shipped 2026-04-08 (PR #450, #452, #484) with cold-deploy detector, GitHub webhook adapters, reconciliation cron (`dossier-decisions.md`). Fleet-ops-health D1-persisted findings surface in `/sos` (PR #467). `crane_notifications` ledger and `crane_notification_update` ack/resolve flow are exposed as MCP tools.

Risk or gap: 81 unresolved CI/CD alerts at window end with sc-console alone carrying 40 (`dossier-handoffs.md` recurring blockers). Telemetry surface works; the response-rate on its alerts is the weak link, and that is operator discipline, not capability.

### 7. Security gates
**Verdict:** Done.

Evidence: Semgrep CI gate rolled to all 6 venture repos by 2026-04-25 (`dossier-decisions.md`, `project_semgrep_fleet_rollout.md`). Promoted to required `Security Summary` branch-protection ruleset 2026-04-22 (PR #639, #649). gitleaks pre-commit hook added 2026-02-19 (PR #256). Fleet branch-protection canonical profile script shipped 2026-05-01 (PR #782). The article `four-auth-vulnerabilities-one-code-review` (2026-02-20) is the public artifact.

Risk or gap: One named gap remains in MEMORY.md — `sc-console` npm-audit gap pending Astro v13.2+ upgrade (sc-console#116). Known and tracked.

### 8. Kill discipline
**Verdict:** Done.

Evidence: `dossier-decisions.md` "Features Killed in Window" lists 10 distinct kill events including the meta-kill (PR #818 immediately after PR #817 ripped out the soft-sunset/deprecation lifecycle the prior PR introduced). Article `shipped-friday-retired-monday` (2026-05-05) and `killing-skills-on-purpose` (2026-04-22) are public artifacts. The lessons `feedback_kill_dont_file.md` and `feedback_no_soft_sunset.md` codify the policy.

Risk or gap: None at the capability level. The discipline survived its own deletion.

### 9. Skill governance
**Verdict:** Done.

Evidence: SKILL.md schema, `/skill-review` lint, `/skill-audit` cron, CI gate on skill changes shipped 2026-04-15 (PR #529). `docs/skills/governance.md` and `docs/skills/deprecated.md` exist (`dossier-knowledge.md`). 38 skills present today after a +44 / -12 churn (`dossier-tooling.md`). `crane_skill_invoked` and `crane_skill_usage` MCP tools wired for telemetry.

Risk or gap: 38 skills is large; whether the audit has converged to a stable count is not visible from the dossiers. The cycle of add-then-retire on heartbeat/status/update/analytics/go-live/docs-refresh suggests the deprecation queue is doing its job rather than being symptomatic of churn.

### 10. Multi-machine fleet
**Verdict:** Done.

Evidence: 5 active machines (mac23, mini, mbp27, think, m16) plus retired mba, all Tailscale-meshed (`dossier-tooling.md`). Fleet orchestrator with parallel agent dispatch via SSH and per-machine reliability scoring shipped 2026-02-20 (PR #260). Hermes `fleet_update` skill with systemd units shipped 2026-04-23 (PR #661). Branch-protection canonical profile script enforced on all venture repos 2026-05-01 (PR #782).

Risk or gap: mac23 is a single point of failure for memory ingest and fleet provisioning, named explicitly in MEMORY.md "SSH & Fleet Bootstrap." Capability exists; resilience to mac23 loss is not proven.

## Stage 1 -> Stage 2 readiness

What gates open: the substrate is ready. Sessions persist, memory recalls, isolation holds, content ships, telemetry alerts, gates block bad code, kills happen, governance lints, fleet meshes. A Stage 2 client engagement could be initiated tomorrow on this stack and it would not have to invent its operating system on the fly.

What blocks: three specific items.

1. **Cost blind spot.** `dossier-cost.md` is the most damning artifact in the package — sixteen weeks with no per-month spend visibility on Anthropic, Cloudflare, Vercel, or GitHub Actions. The charter explicitly names this as a Stage 1 failure ("any operation should know its burn"). Stage 2 cannot quote a client engagement without unit economics.
2. **Memory citation curve.** Capability shipped 2026-05-05; zero enterprise-memory citations recorded as of the dossier. Three more weeks of usage data are needed before claiming the recall layer actually changes agent behavior.
3. **Single points of failure.** GitHub App on personal account, memory store on mac23, single Cloudflare account, mac23 as sole fleet-bootstrap host. Each is a known risk in MEMORY.md; none would survive a Stage 2 audit by a client's security team.

## What Stage 1 produced that the charter did not anticipate

Three bonuses worth naming.

1. **The reflection apparatus itself.** Quarter Mark v1 (this exercise) plus `/docs-audit`, `/skill-audit`, `/memory-audit`, `crane_docs_drift_audit`, `crane_memory_audit` constitute a self-inspection layer the charter did not list. The operation built tools to critique itself, then ran them.
2. **Justification-discipline lessons as a category.** Five memories under `feedback: justification-discipline` (`no_human_ergonomics_arguments`, `no_quick_win_framing`, `no_soft_sunset`, `kill_dont_file`, `no_manufactured_loose_ends`) are a kind of meta-capability — the operation learned how to argue with itself honestly. That is rarer and more valuable than the technical capabilities the charter listed.
3. **Public-facing methodology corpus at scale.** 28 of 45 articles are voice=methodology. The charter named "content engine" but did not anticipate that the methodology corpus would itself become a Stage 2 sales artifact — partner-network application, client onboarding, peer recruitment all draw from this corpus. It is unintentional case-study substrate.
