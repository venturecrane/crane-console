# Critique: Skeptic

Window: 2026-01-13 to 2026-05-09 (~16 weeks). The mission is to validate, kill, or scale ventures toward revenue. By that yardstick this quarter looks less like a portfolio operation and more like a tooling startup that owns five sleeping ventures.

## Zero ventures generated revenue. Five remain pre-launch.

The handoff ledger (`dossier-handoffs.md`) is unambiguous about where the agent-hours went: VC = 268 sessions, SS = 150, DC = 65, DFG = 8, KE = 5, SC = 4. The operating-system meta-venture absorbed 53% of all sessions. SS, the only venture with serious build investment, ended the window still pre-launch — explicitly confirmed by the 2026-05-05 kill of the `gbp-weekly-post` cadence item with the note "SS is pre-launch; no GBP substrate exists" (`dossier-decisions.md`). Three ventures (DFG, KE, SC) received fewer than 10 sessions combined across 16 weeks; that is not validation work, that is neglect. The cost dossier (`dossier-cost.md`) cannot produce a single dollar of revenue figure from any source — not because spend telemetry is missing, but because there is none to attribute.

The portfolio strategy in MEMORY.md ranks SS > DC > KE > SC > DFG and cites "time-to-revenue" as the driver. None of the bottom three got enough investment to either ship or be killed. That is the worst of both worlds: open positions, no progress, ongoing carrying cost.

## 907 PRs merged with effectively zero formal reviews

`dossier-github.md` is blunt: "Virtually all PRs have zero formal reviews recorded in the API. The sole exception is dc-console with 2 SMDurgan reviews." Median time-to-merge across every active repo is 0.00 days. The largest PR of the window (dc-console #433, 256 files, 2026-03-03) merged the same day it opened with no recorded review. ss-console #722 (190 files), crane-console #868 (171 files) — same pattern. Ship-it-and-trust-the-author is a defensible model for a solo operator, but then stop calling self-review "/critique" and "/code-review" a quality gate. The 24 VCMS notes tagged `code-review` (`dossier-knowledge.md`) describe a process that, by the GitHub data, is not actually adversarial. If the author is the reviewer is the merger, the multi-step ceremony is theater.

## Skill churn: 44 adds, 12 deletes, 38 net — a build-tear-rebuild loop

`dossier-tooling.md` shows skills `heartbeat`, `status`, `update` were added 2026-01-19, deleted 2026-04-12, then re-added 2026-04-25/30. `analytics`, `docs-refresh`, `go-live` were added in February, killed in April, replaced by v2 versions of themselves. `stitch-design` and `stitch-ux-brief` (added February) were ripped out 2026-04-17 and replaced by `product-design`/`ux-brief`. `/sprint`, `/build-log`, and `/skill-deprecate` were killed 2026-05-05 — the latter being the deprecation lifecycle itself, deprecated four days after PR #817 introduced it (PR #818, 2026-05-06). That is a tooling system that built scaffolding to retire skills, then retired the scaffolding. The `feedback_no_soft_sunset` memory frames this as discipline; an outside reader would call it whiplash.

The 126 sessions tagged "Skill & Command Infrastructure" (`dossier-handoffs.md`) is more than every venture build session combined except SS. The operation spent more agent-time on the agents than on the ventures.

## 256 net-new doc files. Most cannot be load-bearing.

`dossier-knowledge.md` reports 256 net-new `.md` files in 16 weeks — 16 docs a week. The runbook count (9) is the only number that suggests operational use. The rest fan out across `docs/anthropic-partnership/`, `docs/design-system/`, `docs/process/` (30+ files), `docs/standards/`, `docs/research/`, `docs/reviews/`. The `/docs-audit` skill itself was only added 2026-05-06 — meaning for 16 weeks, no one was checking whether these docs were referenced, dead, or contradicting each other. The docs-drift audit will likely find a graveyard.

VCMS shows the same pattern: 175 notes, of which `dossier-knowledge.md` notes ~121 are untagged. Untagged notes do not surface in `crane_notes(tag: ...)` queries, which is the only way agents find them. An untagged note is a note that exists for the writer, not the reader.

## 56 auto-memories started March 2026. The first 11 weeks had zero lesson capture.

`dossier-memory.md` shows zero auto-memories before 2026-03, then 1 in March, 33 in April, 22 in May (partial). The enterprise memory layer (20 entries) was created entirely 2026-05-05 to 2026-05-06. Captured cite count across all 20 enterprise memories: zero. Surfaced count is non-zero on five entries; cite count is zero. The system has not yet demonstrated it changes agent behavior under load.

More damning: 32 of 56 auto-memories are `feedback` type. These are corrections — the agent making the same class of mistake until a memory is written. Categories include "verify_root_cause_before_fixing," "verify_fix_end_to_end," "audit_verify_against_live_state," "read_vendor_docs_first," "rebaseline_against_origin_main," "no_human_ergonomics_arguments," "no_quick_win_framing," "no_soft_sunset," "kill_dont_file." The sheer count says the operation kept tripping the same wires. The memory layer is post-hoc bandaging, not pre-hoc prevention.

## Maintenance backlog as ambient noise

`dossier-handoffs.md` cites 81 unresolved CI/CD alerts, 41 sessions touching that backlog, 36 sessions touching Dependabot drain, 47 open Dependabot PRs at peak on crane-console. The recurring blocker list is dominated by infrastructure self-care: SignWell auth (75 occurrences), CI alerts (41), Dependabot (36), unmerged PRs awaiting captain action (32). 185 handoffs ended `in_progress` with explicit numbered pickup lists — meaning more than a third of all sessions did not finish their stated objective.

## 45 articles. 28 methodology pieces. The marketing surface is the operation talking about itself.

`dossier-articles.md`: 62% of articles voice = "methodology." Titles include "Multi-Agent Team Protocols," "Sessions as First-Class Citizens," "Documentation as Operational Infrastructure," "Killing Skills on Purpose," "Plan-declared workstreams." The site is a journal of operating-system work for an operating system whose ventures have not produced revenue. Tag frequency: `infrastructure` 16, `agent-operations` 13, `agent-workflow` 10, `process` 9. `strategy` 2. `venture-update` 2 (literally two articles in 16 weeks describing venture progress). The content engine is documenting the lab, not the products.

## Anthropic Partner Network: months of work, no agreement, no revenue

`docs/anthropic-partnership/` ships 13 net-new files (curriculum, engagements, gap-ledger, operating-model, qualification, the-ten, briefs/, outbound/). The `claude_partner_network` memory states "cleared initial review 2026-04-09" and a "Foundations exam 30-day target." Foundations exam target was set in early April and it is now 2026-05-09. That target either slipped or was never tracked. There is no signed partner agreement. There is no inbound partner revenue. The agent time spent here came out of venture-build time.

## Hard questions worth printing

- If SS got 150 sessions and is still pre-launch, what is the launch criterion, and would a human auditor agree it has not been moved? If not, why is "build more" still the answer instead of "ship the smallest paid thing"?
- If `/auto-build`, `/critique`, `/code-review`, `/skill-review`, `/skill-audit`, `/docs-audit`, `/verify-audit`, and `/edit-article` all run during a single session, how much of the agent budget is meta-work? The ratio is not measured anywhere in the dossiers.
- The cost dossier (`dossier-cost.md`) cannot produce monthly spend. The operation literally does not know its own burn. Sixteen weeks is too long for that.
- 12 deleted skills, 33 deleted feature areas (`dossier-decisions.md` "Features Killed in Window"). Kill discipline is real. But none of the kills were ventures. The portfolio still has the same five sleeping products it started with.
