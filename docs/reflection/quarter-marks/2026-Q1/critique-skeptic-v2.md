# Critique: Skeptic (v2)

Window: 2026-01-13 to 2026-05-09 (~16 weeks). Frame: Stage 1 capability building, per `charter.md`. Revenue and named clients are out of scope. The charter's question: within Stage 1, where did the operation indulge itself, repeat its own mistakes, or pour effort into work that did not advance the ten capability checkpoints?

In several specific places, more than the operation appears willing to admit. The v1 skeptic was right about a number of in-window facts; it just hung them on Stage 2 scaffolding. v2 keeps the findings that survive the charter and drops the ones that fail it.

## 1. The discovery loop ran without instrumentation for most of the window

This is the strongest within-charter finding. The charter flags discovery-loop discipline as in-scope. The data is damning:

- **Auto-memory: 0 before March, 1 in March, 33 in April, 22 in May (partial)** (`dossier-memory.md`). Eleven weeks of lessons not captured. Every hard-won answer to a Stage 1 question - "how do parallel agents not clobber each other," "how do you bridge MCP to claude.ai" - had to be re-derived because no system existed to retain it.
- **Enterprise memory layer: 20 entries, all created 2026-05-05 to 2026-05-06**. Cite count across all 20: zero. As capability checkpoint #2, the layer is built but unproven.
- **`/save-lesson` skill added 2026-04-24** (`dossier-tooling.md`). The dedicated capture skill arrived in week 14 of 16.

A Stage 1 operation whose entire purpose is to invent novel answers, and whose lesson-capture cadence was zero-zero-one across the first three months, was discovering twice and remembering once. That ratio cannot be defended on stage grounds.

## 2. The 256 net-new doc files were not policed for sixteen weeks

`dossier-knowledge.md` reports **256 net-new `.md` files in `docs/`** during the window. The `/docs-audit` skill and `crane_docs_drift_audit` MCP tool both shipped 2026-05-06 (PR #796, per `dossier-decisions.md`). For 16 weeks, no automated check existed for dead links, broken `crane_doc` references, deprecated-skill mentions, or stale-by-git docs.

Within Stage 1 this matters because **agent context lives in `docs/`**. Capability checkpoint #4 - cross-venture context - depends on agents finding the right doc on the first try. 256 net-new files with no drift gate is a discovery loop running blind against its own knowledge surface. The audit landed three days before window-end; the cleanup it would expose has not happened.

The v1 skeptic's framing ("most cannot be load-bearing") is harder to prove. The charter-aligned version is sharper: **whether the docs are load-bearing or not, the operation built no mechanism to find out for 16 weeks.**

## 3. ~121 of 175 VCMS notes are untagged

`dossier-knowledge.md`: 175 VCMS notes total, the eight queried tags account for ~54, leaving ~121 untagged or under non-standard tags. `crane_notes(tag: ...)` is the only retrieval interface agents have for these notes. An untagged note is a write-only artifact.

The charter names this directly: "~121 untagged VCMS notes is a Stage 1 problem because Stage 2 will rely on retrieval that does not work today." Same finding v1 made; survives the charter unchanged. The taxonomy work was the Stage 1 work, and it did not happen.

## 4. The session-reflex hook v1 had 0/18 corpus recall

Per `feedback_validate_patterns_against_corpus`. The reflex hook was built, deployed via UserPromptSubmit (still active per `dossier-tooling.md`), and matched **zero of eighteen** transcripts in the corpus that should have triggered it. v2 source-naming primer landed in PR #869 with a 2026-05-30 review.

This is theater within any stage. Pattern-matching that does not match anything is scaffolding pretending to be capability. The redeeming move is that the operation now requires corpus validation before pattern shipping. But the v1 hook ran in production for the back half of the window doing nothing visible. A Stage 1 operation building a session-reflex layer should validate against the corpus it has - which is the entire point of having 501 typed handoffs and 56 auto-memories.

## 5. Skill churn: real discovery mixed with self-indulgent polish

`dossier-tooling.md` is unambiguous: `/heartbeat`, `/status`, `/update` were added 2026-01-19, deleted 2026-04-12, re-added 2026-04-25/30. `/analytics`, `/docs-refresh`, `/go-live` were killed 2026-04-21 and replaced. `/sprint`, `/build-log`, `/skill-deprecate` were killed 2026-05-05; `/skill-deprecate` was killed four days after PR #817 introduced it (PR #818).

The Stitch-to-`/product-design` pivot (2026-04-17) and the Figma-MCP rejection (2026-03-28) are real Stage 1 discovery. But three things on the list are not discovery; they are the operation polishing the polishing tools:

- **`/skill-deprecate` born and killed in four days.** PR #817 shipped a soft-sunset lifecycle; PR #818 deleted it on the principle that an AI-agent operation does not need lifecycle theater. The `feedback_no_soft_sunset` memory frames the kill as discipline; the discipline lesson is that the lifecycle should not have shipped at all.
- **`/skill-audit` and `/skill-review` measuring 38 skills built in the previous four weeks** (`dossier-decisions.md` 2026-04-15). Capability checkpoint #9 was reached by building governance for skills with no usage history to govern. Process-on-process.
- **126 sessions tagged "Skill & Command Infrastructure"** (`dossier-handoffs.md`). More than every venture-build session combined except SS. v1 drew this line correctly. Three skills are durable per the successor critique (`/sos`, `/eos`, `/code-review`); 35 others are personal cadence. Poor return on investment, before Stage 2 enters the picture.

## 6. 185 in_progress handoffs - a flow-state problem at any stage

`dossier-handoffs.md`: of 501 handoffs, 185 ended `in_progress` with explicit numbered pickup lists. **More than one in three sessions did not finish its stated objective.**

The charter does not give this a pass. Capability checkpoint #1 is session continuity; checkpoint #8 is kill discipline. Both are violated when a third of sessions punt to "next session." The recurring-blocker list - SignWell auth (75x), CI alerts (41x), Dependabot (36x), captain-merge (32x) - shows the same mistakes class-recurring across the window. SignWell auth tripping 75 times is the operation walking into the same wall 75 times. The memory layer that arrived in March did not prevent this; the auth thread re-emerges in April and May handoffs.

## 7. Cost blind spot is a Stage 1 failure, not a stage gap

`dossier-cost.md` cannot produce a single dollar of monthly burn. The charter calls this out by name: "Sixteen weeks without per-month spend visibility is a Stage 1 failure, not a stage-appropriate gap." MEMORY.md has a single ~$21/mo figure for the Anthropic main key, undated, with no per-worker attribution. Cloudflare, GitHub Actions, and Vercel are inaccessible to the dossier. v1 was right; the charter agrees. In scope and unaddressed.

## 8. The Anthropic Partner Network materials read as out-of-stage work

13 net-new files under `docs/anthropic-partnership/`. Foundations exam target was set in early April; it is now 2026-05-09 and the exam has not been taken (per `project_claude_partner_network`, "30-day target").

Within Stage 1, the question is whether partner-pursuit materials advance any of the ten capability checkpoints. They do not. Partner status is a Stage 2 lever - it sells engagements. The materials are real work product, but they are work product for a stage the operation is explicit about not yet being in. Either the charter's stage definition is wrong (rewrite it), or this stack is theater. The honest read is the latter.

## What v1 had wrong

v1 anchored on "zero ventures generated revenue" and "no clients" - Stage 2 metrics applied to a Stage 1 window. Dropped. The "907 PRs with zero formal reviews" finding is also dropped: in an AI-agent operation where the model-as-reviewer pattern is the _thing being invented_, expecting human reviews is a category error. Same with the methodology-vs-venture-update article ratio - documenting capability-building as it happens _is_ the Stage 1 public surface (checkpoint #5).

What survives:

- Discovery-loop discipline failed for the first 11 weeks (memory layer, lesson capture).
- The doc tree grew untracked for 16 weeks (no drift audit until three days before window-end).
- The VCMS taxonomy was never established (~121 untagged notes).
- The session-reflex hook shipped without corpus validation and matched nothing.
- Skill governance was built before it was needed; the deprecation lifecycle was born and killed in four days.
- A third of sessions did not finish their stated objective; SignWell auth tripped 75 times.
- Spend is invisible.
- Partner-network materials are out-of-stage indulgence.

These are the within-charter findings. Smaller in scale than v1's, but they tell the operation where the Stage 1 frame did not excuse the work it did.
