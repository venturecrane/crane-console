# Critique: Successor (v2)

A different operator inherits Venture Crane on Monday. Competent, has run AI-agent operations, did not build this stack. They have repo access, the memory store, the docs, the tools. They are operating against the **same Stage 1 charter** (`charter.md`): the deliverable is the capability, not revenue. They are not tearing out 30 skills on day one because Stage 1 is about whether the capability stack came together, not whether it converts. The relevant questions are: what transfers cleanly, what is operator-flavored (and may need retuning, not deletion), what is actually brittle, and what would they invest in next to harden the inheritance.

## 1. Capability that transfers cleanly

The Stage 1 capability checkpoints in `charter.md` map to durable, vendor-or-spec backed components. A successor inherits and uses them within the first session.

- **Session continuity primitives.** ADR-025 (`docs/adr/025-crane-context-worker.md`) specifies the crane-context worker; `dossier-handoffs.md` shows 501 typed handoffs across 16 weeks queryable by venture, status, and date. `/sos` reads it and `/eos` writes to it. These two skills are the only two from the 38 that a successor uses on day one without retuning, because they are the deterministic interface to the D1 ledger.
- **Two-environment discipline.** ADR-026 + the four phases of staging/production split executed 2026-02-11 to 2026-02-14 (`dossier-decisions.md`). Infisical namespace split, per-worker `*-staging` deployments, branch-protection canonical profile (PR #782). Operator-independent.
- **Branch-protection + Semgrep CI gate** rolled to all six venture repos (PRs #639, #649, #782; `project_semgrep_fleet_rollout`). The `Security Summary` required check is infrastructure-as-code.
- **Deploy heartbeat + cold-deploy detection** (PR #450, #452, #484). `crane_deploy_heartbeat` MCP tool surfaces cold pipelines; webhook adapters and reconciliation cron run without operator intervention.
- **Bare-repo + worktree pattern + crane_worktree_doctor** (PR #789, #826). The MCP tool replaced inline destructive bash in `/sos`, which is the right architectural move - past the auto-mode classifier (`reference_auto_mode_classifier`).
- **EOS surface verification gate** (PRs #832, #866, #867; `feedback_eos_surface_verification_gate`). Mechanical PR-time and EOS-time skill triplet sync verification.
- **Tailscale fleet roster** of five active machines documented in `docs/infra/machine-inventory.md` (`dossier-tooling.md`): mac23, mini, mbp27, think, m16. Mesh established, branch-protected, reliability-scored.
- **Article corpus.** 45 articles, 85,340 words, 2.8/week (`dossier-articles.md`). The `methodology` voice (62%) is most easily extended by a different operator; the `captain-perspective` voice (33%) is operator-flavored.
- **Infrastructure spec floor.** ADRs (`docs/adr/`), runbooks (9 files), instructions (`docs/instructions/`), enterprise plugin catalog (`reference_enterprise_plugins`), portfolio coding standard (PR #868). A successor reading just these understands what to do without asking.
- **Skill governance machinery.** `/skill-review`, `/skill-audit`, `crane_skill_invoked` telemetry, `docs/skills/governance.md` (PR #529). The audit harness transfers even if individual skills are retuned.

Nine of ten checkpoints in the charter have inherited substrate; only checkpoint 8 (kill discipline) is partly cultural and addressed below.

## 2. Capability that is operator-specific (NOT necessarily wrong)

Some skills, memories, and content are tuned to Scott's operating cadence and personal taste. The successor's question is "do I keep operating this way, or retune?" - a calibration question, not a kill question.

**Operator-specific by necessity.** Cannot be cleanly transferred without breaking what they exist for:

- **Captain voice in branded content.** `feedback_captain_perspective_in_content`, `feedback_partner_network_transparent_framing`, `feedback_no_em_dashes`. The 15 captain-perspective articles are written in Scott's lens; rewriting the voice would invalidate the public artifact. The successor either keeps the voice (cultural inheritance) or pivots and starts a new content arc.
- **Venture priority order.** `project_venture_priority` (SS > DC > KE > SC > DFG) is justified by time-to-revenue and Solution Partner pipeline that live in Scott's strategic context. PR throughput shows DC=200 vs SS=197 (`dossier-github.md`); a different operator might reorder rationally.
- **E-Myth lens** (`project_emyth_captain_operator`). Captain-as-entrepreneur, agents-as-workforce. A successor with a different operating philosophy reads operating cadence as overhead instead of strategic on-the-business work.
- **Anthropic Partner Network pursuit.** `docs/anthropic-partnership/` materials are inheritable; the relationships and framing decisions (`project_claude_partner_network`, `feedback_broadcast_vs_personal_comms`) are not.

**Operator-specific by accident.** Tuned to Scott's session cadence but the underlying capability is generic:

- **Cadence-shaped skills.** `/portfolio-review`, `/enterprise-review`, `/calendar-sync`, `/orchestrate`, `/new-engagement`, `/new-client`, `/new-venture` encode Scott's weekly rhythm. The capability is real; the trigger schedule is operator-specific. A successor retunes the cadence (`mcp__crane__crane_schedule`) without deleting the skills.
- **The 32 feedback memories.** Read as universal principles but are tastes (`feedback_no_em_dashes`, `feedback_no_quick_win_framing`). Some are load-bearing operating principles (`kill_dont_file`, `no_soft_sunset` - both produced PRs that ripped out scaffolding); others are stylistic. A successor reviews and either re-asserts or retunes; the memory layer itself transfers.
- **VCMS tag taxonomy.** 175 notes, ~121 untagged (`dossier-knowledge.md`). Taxonomy reflects Scott's mental filing system. A successor either re-indexes or learns the existing model.
- **Skill triplet directories.** `.claude/commands/`, `.gemini/commands/`, `.agents/skills/` (`feedback_skills_dirty_state_gitignore`, PR #822). Multi-harness mirroring is operator choice; a single-harness successor consolidates. Capability content preserved either way.

The v1 critique called for tearing out 30+ skills on day one. Under the Stage 1 charter that is a category error. The skill catalog is the workbench; a competent operator inheriting a workbench inspects the tools before pitching them.

## 3. Genuinely brittle

Real single points of failure that survive the charter framing. Brittleness at Stage 10 too.

- **GitHub App on personal account.** `MEMORY.md`: "Owner: personal account (smdurgan-llc), NOT the venturecrane org." App ID 2619905 is the auth substrate for crane-watch and crane-mcp-remote across four installations (venturecrane=104223482, durganfieldguide=103277966, siliconcrane=104223351, kidexpenses=106532992). PEM, OAuth client secret, webhook secret all bound to that account. Account locked, transferred, or suspended = entire automation fleet loses GitHub auth simultaneously.
- **Memory store on mac23 only.** All 56 auto-memory files at `~/.claude/projects/-Users-scottdurgan-dev-crane-console/memory/` on Scott's primary Mac (`dossier-tooling.md`, `dossier-memory.md`). Enterprise memory adds 20 entries via D1 from 2026-05-05 to 2026-05-06; that layer is centralized. The auto-memory layer is not, and no documented backup exists.
- **mac23 as fleet provisioner.** `MEMORY.md`: "mac23 runs `setup-ssh-mesh.sh` (has hostname check). Other machines can't run it." Provisioning a new fleet machine requires mac23 online. Hardcoded dependency on one of five machines.
- **Single Cloudflare account.** Seven ventures running Workers + D1 + KV + Pages on one account (`config/ventures.json`). Account suspension, billing-card failure, or compromise takes down all ventures together. No documented multi-account split or DR target.
- **Anthropic API spend invisible.** `dossier-cost.md` could not retrieve actual spend. `project_anthropic_api_costs` says ~$21/mo on the main key. A successor cannot answer "what does this cost per month per venture" without Scott's Anthropic console. Per-worker cost attribution does not exist (`dossier-cost.md` recommendation #3).
- **Infisical as single secret store.** All secrets piped through Infisical at launcher time. API change or account lock = every `crane` invocation across the fleet fails simultaneously. No documented secondary path.
- **Solo reviewer on 907 PRs.** `dossier-github.md`: virtually zero formal reviews except two SMDurgan reviews on dc-console. Agent-driven review (`/code-review`, multi-model review) is a substitute, not a replacement. A successor wanting peer review builds the social layer from scratch.
- **Single content domain.** 45 articles concentrated on venturecrane.com; SEO/authority risk concentrated.

## 4. What the successor would BUILD next

Given the charter's question - "is the operation ready for Stage 2?" - the next investments are not deletions. They are hardening moves that gate the transition.

1. **GitHub App moved to org ownership.** Re-create App 2619905 under the venturecrane GitHub org; rotate PEM, OAuth client secret, webhook secret; update Infisical `/vc` (`GH_PRIVATE_KEY_PEM`, `GH_WEBHOOK_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`); reinstall on all four installations. Eliminates the largest single point of failure. ADR-027 candidate.
2. **Cost telemetry per worker.** `dossier-cost.md` recommendation #3: emit `CF-Worker-Name` on Anthropic API call wrappers in SS and DFG workers. Monthly export script pulling Anthropic `GET /v1/usage` and Cloudflare Account Analytics into `docs/finance/`. Add a `spend` VCMS tag. Stage 2 cannot price an engagement without this.
3. **Memory store off-mac23 backup + mirror.** Auto-memory directory rsynced nightly to D1 or to a second Tailscale-meshed machine. Per `MEMORY.md`'s own discipline ("never assume which machine you're on"), the memory layer should not assume mac23.
4. **Multi-account Cloudflare DR plan.** Documented split: high-traffic ventures (vc, ss, dc) on the existing account, lower-traffic on a second account. Even unexecuted, an ADR documents the failover path. Cures the "account lock = total outage" risk.
5. **VCMS tag taxonomy normalization.** ~121 untagged notes (`dossier-knowledge.md`) is the largest retrieval gap. One pass of automated tagging using the existing tag set (code-review, methodology, prd, strategy, governance, executive-summary) plus a `spend` tag plus an `operator-context` tag would make recall actually work. Stage 2 retrieval depends on this.
6. **Auto-memory capture-rate hardening.** `dossier-memory.md` shows zero auto-memories before March, 33 in April, 22 in early May. A successor codifies a mid-session capture trigger or accepts the rate; either way, the gap is documented.
7. **Quarter Mark v1 closes the loop.** The charter explicitly asks "did the capability stack come together?" The QM artifact is itself the answer. Ship it, decide which gates are open, and let the next quarter's investments be charter-driven instead of memory-driven.

A successor operating Stage 1 inherits a real capability stack. The work to do next is not destruction; it is removing the operator-shaped single points of failure so that Stage 2 can be entered without re-inventing the substrate.
