# Critique: Successor

A different operator inherits Venture Crane on Monday. Competent, has run AI-agent operations before, but did not build this. They have repo access, the memory store, the docs, the tools. No relationship with Scott. Here is what they would do.

## 1. Keep on day one

The infrastructure spine is the durable asset.

- **crane-context worker + D1 handoff ledger.** ADR-025 (`docs/adr/025-crane-context-worker.md`) is the only proper specification of a core component, and it is good. 501 typed handoffs across 16 weeks (`dossier-handoffs.md`) is real operational telemetry, queryable by date range, status, and venture. A successor would understand it from the ADR alone and start writing handoffs within the first session.
- **Staging/production split per ADR-026.** Two-environment discipline across all workers, executed in four phases February 11-14, with an Infisical namespace split. This is a real engineering investment and works without the original Captain.
- **PR-only main + Semgrep CI gate on all six venture repos** (`dossier-decisions.md`, 2026-04-22 / 2026-04-25). The branch-protection canonical profile script (PR #782) and required `Security Summary` status check are infrastructure-as-code; they outlive any operator.
- **Per-venture deploy heartbeat + cold-deploy detection** (PR #450, #452, #484). Independently valuable. Plug-and-play.
- **Three of the 38 skills have non-trivial reuse value to anyone:** `/sos`, `/eos`, `/code-review`. `/sos` reads context out of D1; `/eos` writes a structured handoff back. `/code-review` is generic. The rest of the skill list (see below) would not survive the first quarter.
- **The five Claude Code plugins** (Context7, TypeScript LSP, Vercel, Playwright, Frontend Design - `dossier-tooling.md`). Vendor-maintained, no Captain-specific assumptions.
- **The article corpus on venturecrane.com.** 45 published pieces, 85,340 words (`dossier-articles.md`). This is a real public artifact and the successor inherits the SEO and the credibility surface.
- **The bare-repo + worktree pattern, conditional.** The pattern itself is good, but it is documented mostly inside memory entries (`feedback_agent_isolation_worktree_unreliable`, `feedback_skills_dirty_state_gitignore`) rather than in `docs/`. A successor reading only `docs/` would not understand why the .claude/worktrees/ paths exist or why three skill directories are gitignored.

## 2. Tear out on day one

A new operator without sentimental attachment would cut deeply.

- **Most of the 38 project-level skills.** Every single one was added inside the 16-week window (`dossier-tooling.md`: net delta +38, zero existed before 2026-01-13). The `feedback_kill_dont_file` and `feedback_no_soft_sunset` memories codify a hard-delete reflex - the irony is the skill catalog itself is the largest failure to apply that rule. A successor would keep `/sos`, `/eos`, `/code-review`, maybe `/auto-build`, and delete the other 30+ on day one. Items like `/own-it`, `/save-lesson`, `/heartbeat`, `/critique`, `/orchestrate`, `/edit-article`, `/edit-log`, `/portfolio-review`, `/enterprise-review`, `/new-engagement`, `/new-client`, `/new-venture`, `/calendar-sync`, `/platform-audit`, `/skill-audit`, `/skill-review`, `/docs-audit`, `/docs-refresh`, `/context-refresh`, `/ux-brief`, `/nav-spec`, `/design-brief`, `/product-design`, `/auth-setup`, `/estimate`, `/content-scan`, `/prd-review`, `/ui-drift-audit`, `/ship`, `/go-live`, `/analytics` - these encode Scott's specific weekly cadence, not a general operating system.

- **The session-reflex hooks layer.** Three hooks across user and project settings (`dossier-tooling.md`): `redirect-reflex-hook.sh`, `parallel-session-detect.sh`, `parallel-session-gate.sh`, `parallel-session-provision.sh`. The `feedback_validate_patterns_against_corpus` memory states v1 of the reflex hook had **0/18 corpus recall**. The whole feature is shipping pattern-matching that did not match anything. The `project_session_reflexes_v2_review` memory schedules a 2026-05-30 review, but a new operator would just turn the hook chain off and see if anything degrades.

- **The skill-triplet sync mechanism.** Three parallel directories (`.claude/commands/`, `.gemini/commands/`, `.agents/skills/`) all gitignored as launcher-mirrored artifacts (`feedback_skills_dirty_state_gitignore`, PR #822). A successor would either standardize on one harness (Claude Code) and delete the Gemini and generic agent mirrors, or treat the launcher's mirroring as an internal detail and hide it entirely. Three gitignored directories that the agents read at startup is a debugging trap.

- **The 7-phase Quarter Mark methodology that has not run once.** `docs/reflection/quarter-mark.md` is a 336-line process specification for an exercise that is currently mid-execution for the first time. That is architecture astronomy: writing the framework before validating that even one cycle produces an actionable artifact. A successor would run a single retro for one quarter, then decide whether to formalize.

- **`/skill-audit` and `/skill-review` and `crane_skill_invoked` telemetry.** A skill governance layer measuring 38 skills that the operator built four weeks ago, with citation counts of zero across all enterprise memories (`dossier-memory.md`: "Cited count is 0 across all entries"). The audit is grading a system that has not been used long enough to deserve grading.

- **The crane-mcp-remote OAuth bridge** (PR #262, 2026-02-22) for claude.ai. A successor would ask: who is using claude.ai web with this MCP, and how often? If the answer is "Captain, occasionally", the OAuth callback URLs, KV session state, and personal-account GitHub App OAuth client are all liability they did not need.

## 3. Cannot understand without the Captain

- **The 32 feedback memories.** These are Scott's tastes (`feedback_no_em_dashes`, `feedback_no_soft_sunset`, `feedback_no_quick_win_framing`, `feedback_kill_dont_file`, `feedback_no_human_ergonomics_arguments`, `feedback_captain_perspective_in_content`, `feedback_no_manufactured_loose_ends`). They read as universal principles but they are personal preferences a new operator would interpret differently. "No em dashes" is not load-bearing; "kill don't file" is. The successor cannot tell which from the memory store alone.

- **Venture priority.** `project_venture_priority` says SS > DC > KE > SC > DFG, justified by "time-to-revenue." A new operator looking at PR throughput sees SS=197, DC=200, KE=101, SC=49, DFG=51 (`dossier-github.md`) and would reasonably ask: why is DC a lower priority than SS when DC merged more PRs? The answer is in Scott's head (Solution Partner client pipeline, smd.services positioning) and not in any doc.

- **The Anthropic Partner Network pursuit.** `docs/anthropic-partnership/` exists with curriculum, engagements, qualification, the-ten, briefs, outbound. Materials are inheritable. The relationships are not. `feedback_partner_network_transparent_framing` and `feedback_broadcast_vs_personal_comms` are guardrails for conversations the successor was not part of.

- **What "transparent framing" means in branded content.** `feedback_partner_network_transparent_framing` says solo founder + AI agent workforce stated plainly. A new operator may have a different relationship to that disclosure - they may have a team of humans, or want to obscure the AI-agent operation. The 45-article corpus is built on this framing. A pivot would invalidate most of the public artifact.

- **The E-Myth lens** (`project_emyth_captain_operator`). Scott is operating on Gerber's framework with himself as the entrepreneur, the agents as workforce. This shapes every decision about delegation, skill-building, and on-the-business vs in-the-business work. A successor without this lens would read the operating cadence as overhead, not strategy.

- **VCMS notes.** 175 notes, ~121 untagged (`dossier-knowledge.md`). Searchable only by Scott's mental model of where he filed things. A new operator would re-indexing or migrate to a tag taxonomy they understand.

## 4. Brittle / single-point-of-failure

- **GitHub App owned by personal account, not org.** `MEMORY.md` is explicit: "Owner: personal account (smdurgan-llc), NOT the venturecrane org." App ID 2619905 is the auth substrate for crane-watch and crane-mcp-remote across four installations. If Scott's personal GitHub account is suspended, locked, or transferred, the entire automation fleet loses GitHub auth. The PEM key, OAuth client secret, and webhook secret are all bound to that account.

- **Anthropic API key consumption invisible.** `dossier-cost.md` could not retrieve actual spend. A successor inheriting the operation cannot answer "what does this cost per month" without logging into Scott's Anthropic console. Per-worker cost attribution does not exist (`dossier-cost.md` recommendation #3).

- **Memory store on Captain's laptop.** All 56 auto-memory files live at `~/.claude/projects/-Users-scottdurgan-dev-crane-console/memory/` on Scott's machine (mac23, per `dossier-tooling.md`). Enterprise memory layer has 20 entries created 2026-05-05 to 2026-05-06 with zero citations. If mac23 disk fails, the auto-memory layer is gone unless backed up elsewhere; the dossier does not confirm a backup.

- **mac23 as the only machine that runs `setup-ssh-mesh.sh`.** Per `MEMORY.md`: "mac23 runs `setup-ssh-mesh.sh` (has hostname check). Other machines can't run it." Provisioning a new fleet machine requires mac23 to be online. This is a hardcoded dependency on one of five machines.

- **Cloudflare account.** Seven ventures running Workers + D1 + KV + Pages on a single Cloudflare account (`config/ventures.json`). The successor inherits the account or they inherit nothing. Account suspension or billing failure takes down all ventures simultaneously. There is no documented multi-account split.

- **Solo founder, solo reviewer.** `dossier-github.md`: 907 PRs merged, virtually zero formal reviews recorded except for two SMDurgan reviews on dc-console. If the successor wants peer review, they need to build the social structure from scratch. The agent-driven review pipeline (`/code-review`, multi-model review) is a substitute, not a replacement.

- **Infisical as the secret store.** All secrets piped through Infisical. If Infisical's API changes or the account is locked, every `crane` launcher invocation across the fleet fails simultaneously. No documented secondary path.

- **The "wild band of AI agents with an ape commander" cultural directive** (`docs/instructions/operating-ethos.md`) is a Scott voice. A successor reading "Don't work like apes at the office" would either need to keep the voice (cultural inheritance) or rewrite the directive (cultural reset). Either way, the agents currently respond to a specific operator's tone.

A new operator who kept only the durable infrastructure - workers, D1, ADRs, branch protection, the article corpus - and rebuilt the skill layer, memory taxonomy, and partner-network materials from their own voice, would lose maybe 20% of the value and gain a system they could actually run.
