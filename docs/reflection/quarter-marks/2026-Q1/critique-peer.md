# Critique: Peer

I run my own AI-agent operation. Smaller fleet (two boxes, SSH only), different cloud, three published methodology pieces to your forty-five. I have shipped a few of the same primitives and watched a few of mine die. So I am reading these dossiers as someone who has tried to invent against the same horizon. The skeptic and customer critiques already nailed what is missing. My job is to call the work itself.

## 1. Genuinely novel work

There is real, citeable invention in this window. Not all of it. But more than is comfortable to admit.

**Parallel-session worktree isolation as a filesystem-level problem (PR #789, article `parallel-session-worktree-isolation.md`).** This is the strongest work in the corpus and I had not seen it solved publicly before May. The core insight - that branches are commit-level isolation, not filesystem-level isolation, and two agents in the same checkout sweep each other's uncommitted work via `git add -A` - is obvious in retrospect, which is the signature of a real find. The shipped article cites roughly five collision pairs per day across two active repos before the fix. The solution (bare-repo + worktrees + the three hook scripts in `dossier-tooling.md`, plus `crane_worktree_doctor` in PR #826) is concrete. The `feedback_agent_isolation_worktree_unreliable` memory tells the harder truth: even with the fix, you have to probe before you trust it. That nuance is what makes this a contribution, not a brag.

**Sessions-as-first-class-citizens with D1-backed handoffs and heartbeats (ADR-025, article `sessions-heartbeats-handoffs.md`).** Second strongest. ADR-025 is a real spec for a real worker, and 501 typed handoffs across 16 weeks is real telemetry. Borrowing distributed-systems liveness primitives (heartbeats, idempotent handoffs, abandoned-process recovery) for agent sessions is a non-obvious move other operators are not making. The active/stale/abandoned state machine is something I will end up rebuilding because I did not think of it that way.

**MCP-over-HTTP with OAuth for claude.ai (PR #262, 2026-02-22).** When this shipped, claude.ai's MCP story was hostile to anyone not running locally. The crane-mcp-remote worker (OAuth2 callback, KV session state) solved the bridge before Anthropic gave the rest of us a happy path. The successor critic called it low-value on Stage-2 grounds; for Stage 1 capability building, this is the operation publishing the receipt that the bridge can be built. Worth keeping.

**Cross-venture context as registry-driven SoS injection (`cross-venture-context-agent-awareness.md` and `monorepo-registry-driven.md`).** Together these make one unified claim: spatial awareness is an infrastructure problem, not a prompt problem, and the registry is the single source of truth. I have wrestled with the same failure modes - wrong-repo targeting, secret bleed, cadence cross-talk - and patched them in prompts. This is the first time I have seen the registry-as-spatial-anchor approach articulated as deliberate design.

**Memory-as-FTS5 with a ground-truth eval harness (PR #791, #794).** The reflection-time honesty about v1 having 0/18 corpus recall (`feedback_validate_patterns_against_corpus`) is itself novel. Most operators would have shipped the v1 hook and called it done. Building an eval harness that tested against actual transcripts and exposed the recall failure - then publishing `validating-patterns-against-a-corpus.md` about the discipline - is meta-work that is actually transferable.

**Quarter Mark methodology, partial credit.** The 7-phase methodology is currently mid-execution for the first time, which the successor critic correctly identified as architecture astronomy. But the *act* of dossier-first reflection, then four-critic adversarial review, then captain reflection - that structure is good. I would not write the meta-doc before running it twice. The structure itself is worth copying after seeing whether v1 produces decisions.

Not novel, despite framing: kill discipline. Operators have been killing their own work forever; `kill-discipline-ai-agents` and `killing-skills-on-purpose` are good restatements, not inventions.

## 2. Where this operation reinvented the wheel

Three places, ranked by how loudly the wheel-noise rang.

**Skill governance schema (`/skill-review`, `/skill-audit`, `crane_skill_invoked` telemetry, frontmatter spec, deprecation queue - PR #529 onward).** Largest reinvention in the corpus. The skill catalog is 38 markdown files in `.claude/commands/` and three mirrors. Well-trodden patterns exist for governing small command-collection systems: a flat directory with a README, or namespace-then-version like Homebrew taps. The operation built a custom schema, custom lint, custom audit cron, custom invocation telemetry, custom citation tracker, and custom CI gate. For 38 markdown files. For one operator. The successor critic is right - the audit grades a system that has not been used long enough to deserve grading. The 126 sessions tagged "Skill & Command Infrastructure" (`dossier-handoffs.md`) is the bill for that decision. Your skill catalog is your personal exocortex masquerading as an OS; transferable it is not.

**Session reflexes hook chain (PR #779, v1 with 0/18 corpus recall, v2.1 in PR #869).** Pattern-matching the prompt to inject context primers is a reasonable instinct, but you already have a heavier instrument that does this better: the SoS briefing. The reflex chain duplicates that surface with worse data, against a corpus v1 had not been validated on. The `feedback_validate_patterns_against_corpus` memory is honest - but it surfaces after the design shipped. I would have killed the approach the moment v1 hit zero recall and put the effort into prompt-conditional SoS injection.

**Portfolio ESLint coding standard (PR #868, #722, 190-256-file refactors).** "Function-per-file, no barrel exports" is a defensible style preference. Imposing it as a 256-file structural refactor across the portfolio in a single sprint, in a window with zero ventures shipped to revenue, is over-engineered. The rule could have been a warning-not-blocking lint adopted file-by-file as code was touched. Enforcing personal style across a codebase your customers will never read is the most legible scaffolding-as-capability line item this window.

## 3. What I am stealing

These I am taking back to my operation this week. No diplomacy.

- **`docs/adr/025-crane-context-worker.md`** as a template for speccing a typed-handoff worker before writing it. Structure (problem, alternatives, schema, endpoints, telemetry) is reusable verbatim.
- **The bare-repo + worktrees + hook-chain pattern from PR #789** plus `crane_worktree_doctor`. The five-collisions-per-day pre-fix data point is what I will cite when I sell my own operator on adopting it.
- **The registry-as-spatial-anchor approach.** The moment I add a second venture I am copying `cross-venture-context-agent-awareness.md` line for line.
- **The two-ADRs-in-16-weeks cadence as floor.** ADR-025 and ADR-026 are the only docs in this window where reasoning is preserved in a way a new operator can pick up. Two ADRs, well-written, beats 256 docs no one consults.
- **The `feedback_validate_patterns_against_corpus` discipline.** Mine ~5 transcripts before merging pattern-matching code. I will frame this as a reviewer-level requirement.
- **PR #818 deleting the deprecation lifecycle four days after shipping it.** The operation killing its own deprecation framework as theater is the most quotable thing in the dossier. I am putting that on a sticker.

## 4. Where I would fix the approach

Four concrete substitutions.

**Replace the skill governance layer with a flat directory and a one-page README.** Keep `/sos`, `/eos`, `/code-review`, `/auto-build`, maybe `/edit-article`. Delete the rest. Stop `/skill-audit`. Stop `crane_skill_invoked` telemetry. Re-evaluate at 60 commands or 12 months, whichever first.

**Kill the session-reflex hook chain entirely and put the energy into a richer SoS.** The SoS already runs at session start, already loads D1 context, already has the venture registry. Make it prompt-class conditional (what the reflex hook is trying to do, badly) and you collapse two systems into one. v1's 0/18 recall is the operation telling itself this in advance.

**Build cost telemetry before any more skills.** Sixteen weeks without monthly burn visibility is a Stage 1 failure inside the charter's own frame. The `dossier-cost.md` recommendations (Anthropic `/v1/usage` puller, per-worker `CF-Worker-Name` tagging, `spend` VCMS tag) are correct and small. Ship them in week one. You cannot make Stage 2 venture-investment trade-offs against unknown unit economics.

**Move the GitHub App off your personal account.** Single most brittle dependency in the operation (`MEMORY.md`). Every other piece of fleet auth has a documented recovery path. The personal GitHub App does not. Transfer it to venturecrane org. Two days, once.

## 5. The next horizon question

Stage 2 is the obvious answer and it is not the right answer. Stage 2 is execution against a discovered capability; the harder question is upstream.

**The next genuinely-unknown question: what does an AI-agent operation that produces revenue-bearing client work without a human-services bench actually look like in the contract layer?**

Everyone on this horizon (myself included) is solving capability problems - keeping agents coordinated, memory hot, git clean. You have answered most of those well enough. What no one has shipped publicly is the engagement primitive: the SOW format, the discovery transcript, the deliverable handoff, the change-control process, the post-engagement retro - all designed for a substrate where the worker is an agent fleet and the accountable party is one human. The customer critique is right that smd.services does not make this concrete. But upstream: what operational primitives does the engagement layer need that differ from a traditional firm's? What does the buyer need preserved for auditability? What can be different because agents do not tire or quit? What pricing structure expresses unit-economics with near-zero marginal labor cost above tooling spend?

If I were inheriting this operation tomorrow, that is the work I would prioritize ahead of any further capability-stack polish. The 38 skills, FTS5 memory, worktree isolation - they are the substrate. The substrate is good enough. The next invention is the contract that runs on it.

Bring me the first SOW an AI-agent operation could deliver under with the same accountability surface a human firm offers a buyer, and I will read every word of next quarter's dossiers.
