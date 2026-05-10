# Quarter Mark Reflection

Periodic structured reflection on the Venture Crane operation. Seven phases. Quarterly cadence. Designed to extract maximum value from the documented operation by leveraging the unique advantage we have: every handoff, lesson, PR, article, and memory entry is already in queryable storage.

## Why This Exists

Most reflection exercises fail in predictable ways. The methodology below is engineered to defeat each one.

| Failure mode                                 | Defeat mechanism                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Vanity metrics (hours, commits, PRs)         | Phase 1 captures these as evidence, but Phase 3 critiques and Phase 5 decisions are graded on substance, not volume |
| Recency bias                                 | Lookback window is fixed at the start; Phase 6 calibration looks across windows                                     |
| Asymmetric honesty (wins louder than losses) | Three adversarial critiques in Phase 3, each in isolation                                                           |
| Unfalsifiable claims                         | Phase 5 decisions are concrete (kept / changed / killed / bet); Phase 6 grades them                                 |
| Reflection without action                    | Phase 5 is the decisions document; the exercise is judged by that artifact                                          |
| No calibration loop                          | Phase 6 grades the previous Quarter Mark's predictions before writing new ones                                      |

## Our Data Substrate

This is what makes the methodology cheap to run for us specifically:

- **D1 handoffs ledger** - 229+ session handoffs as of 2026-05-09 (per `crane_sos`), each with status, summary, venture, timestamp
- **Memory store** - 57 auto-memory files as of 2026-05-09 (`~/.claude/projects/-Users-scottdurgan-dev-crane-console/memory/`); enterprise memory via `crane_memory`
- **GitHub** - 13 venturecrane org repos plus dfg-console; full PR, issue, commit history
- **Public journal** - venturecrane.com (vc-web repo), articles dated and tagged
- **Lessons** - captured via `/save-lesson`, retrieved via `crane_doc('global', 'memory/governance.md')` taxonomy
- **Skills, MCPs, fleet, hooks** - all version-controlled in this repo

Phase 1 mines these. Most of the heavy lifting parallelizes across agent dispatches.

## The Seven-Phase Methodology

### Phase 1 - Ledger Mining

Parallel agent dispatches. Each agent produces a section of an evidence dossier. No interpretation, no judgment. Just data.

1. **D1 Handoff Miner** - Counts by status; theme clustering; recurring blockers; time-on-task per venture
2. **Git/PR Miner** - PRs merged, average merge time, reviewers, issue throughput, dependabot debt trajectory, per repo
3. **Memory Miner** - Entries by type, capture-rate per month, top tags, categories with most accumulation
4. **Article Miner** - Articles published, themes, voice (captain-perspective vs methodology vs venture-update)
5. **Cost Miner** - API spend, infrastructure spend per venture (where attributable)
6. **Tooling Inventory** - Skills added/deprecated, MCPs added/removed, fleet machines, hooks, with diff against window start

### Phase 2 - System Inventory

Parallel agent dispatches. What exists now that didn't at window start.

7. **Architectural Decisions** - ADR directory, deprecation log, killed features (per `feedback_kill_dont_file`, hard deletes only)
8. **Knowledge Inventory** - VCMS notes, runbooks, docs structure, memory entries

### Phase 3 - Three Adversarial Critiques

Sequential. Each in isolation. Each gets a fresh agent context to prevent rapport bleed.

9. **Skeptic** - "What did we waste time on? What's theater? What hasn't moved a venture toward revenue?"
10. **Customer** - "If a Solution Partner client opened our portfolio tomorrow, what would they trust? What would alarm them? What evidence of outcomes do we actually have?"
11. **Successor** - "If a different operator inherited this Monday, what would they keep? What would they tear out on day one? What couldn't they understand without us?"

Each critique receives the dossier from Phases 1 and 2 as input. Output is a written critique, attached to the dossier.

### Phase 4 - Captain's Reflection

Not delegable. Per `Core Identity` memory (agents are the voice of outputs, but direction requires the operator) and E-Myth alignment (this is the on-the-business work).

Captain reads the dossier and the three critiques, then answers five questions in writing:

1. What do I believe now that I didn't believe at window start?
2. What am I tired of and want to delete?
3. What have I been avoiding and why?
4. What am I proud of and want to compound?
5. What is the next bet?

Short. First person. Dated.

### Phase 5 - Decisions Document

The artifact that justifies the exercise. Format:

- **Kept** - each item with rationale. Forces defense of continuation, not inertia.
- **Changed** - what changes, why, who or what executes
- **Killed** - per `feedback_no_soft_sunset`, hard delete. Replacement named or void rationale stated.
- **The Bet** - one or two named priorities for the next period

### Phase 6 - Calibration

Pull the previous Quarter Mark Report. Compare predictions to reality. Score each prediction (right / wrong / partial / not-yet-resolved). Note pattern of errors.

For v1: there is no prior. Phase 6 becomes "establish baseline predictions and lock them" so v2 can grade.

### Phase 7 - Publish

Two versions:

- **Public-redacted** - article on venturecrane.com. Sensitive numbers and unannounced bets removed. The reflection produces partner-network and client-ready collateral as a side effect.
- **Full** - committed to this repo at `docs/reflection/quarter-marks/<YYYY-QN>.md`. Sensitive numbers retained. Queryable by future agents.

## Cadence

| Cadence    | Scope                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| Quarterly  | Full seven-phase exercise                                                                                          |
| Monthly    | Phase 6 only (calibration); three questions: what did we predict last cycle, what happened, what do we predict now |
| Continuous | Handoffs and captured lessons (already running). They are the substrate.                                           |

## v1 Scope

### Lookback Window

**2026-01-13 to 2026-05-09** (~16 weeks). Anchored on venturecrane org creation (`gh api orgs/venturecrane`). dfg-console predates this anchor by ~2 weeks (created 2025-12-27); it is included in scope but the org-creation date is the formal window start.

Rationale: the venturecrane org marks the structural beginning of "Venture Crane the operating system." Earlier work was prototype.

### Output Artifact Locations

- **Methodology and v1 scope** (this document): `docs/reflection/quarter-mark.md`
- **v1 report** (when written): `docs/reflection/quarter-marks/2026-Q1.md`
- **Dossier and critiques** (when generated): `docs/reflection/quarter-marks/2026-Q1/dossier.md`, `docs/reflection/quarter-marks/2026-Q1/critique-skeptic.md`, etc.
- **Public version**: article on venturecrane.com (vc-web), date-stamped
- **VCMS note**: tagged `quarter-mark` for `crane_notes` retrieval

### Agent Dispatch Prompts

Each Phase 1-3 agent receives a self-contained prompt. The prompts below are the v1 versions. Refine after the v1 run.

#### Phase 1.1 - D1 Handoff Miner

> You are mining the Crane Console handoff ledger to build evidence for a Quarter Mark reflection. Window: 2026-01-13 to 2026-05-09.
>
> Use `crane_sos` and any available D1 query path to retrieve all session handoffs in the window. Do not interpret or critique. Output a markdown section titled "Handoff Ledger" with:
>
> 1. Total handoff count, broken down by status (`done`, `in_progress`, `blocked`, `abandoned`)
> 2. Distribution per venture
> 3. Theme clustering: group handoffs by topic (use 8-12 themes maximum). Show handoff count per theme.
> 4. Top 5 recurring blockers (verbatim phrases that appear in 3+ handoffs)
> 5. Sessions per week trajectory (chart-style or table)
>
> Save output to `docs/reflection/quarter-marks/2026-Q1/dossier-handoffs.md`.

#### Phase 1.2 - Git/PR Miner

> You are mining the GitHub history of the Venture Crane portfolio for a Quarter Mark reflection. Window: 2026-01-13 to 2026-05-09.
>
> Repos to mine: all repos in the venturecrane org (per `gh repo list venturecrane`) plus dfg-console. For each repo, capture:
>
> 1. PRs merged in window (count)
> 2. Average time-to-merge (median + p90)
> 3. Reviewer distribution (who reviewed what)
> 4. Issue throughput (opened in window vs closed in window)
> 5. Dependabot PR count over time (current vs window-start)
> 6. Top 5 largest PRs by file count (titles only, no diff content)
>
> Save output to `docs/reflection/quarter-marks/2026-Q1/dossier-github.md`. No interpretation.

#### Phase 1.3 - Memory Miner

> You are inventorying the auto-memory and enterprise memory ledger for a Quarter Mark reflection. Window: 2026-01-13 to 2026-05-09.
>
> Sources:
>
> 1. `~/.claude/projects/-Users-scottdurgan-dev-crane-console/memory/` (auto-memory files)
> 2. `crane_memory(action: "list")` (enterprise memory)
>
> Output a markdown section with:
>
> 1. Total entries by type (feedback / project / reference / user)
> 2. Capture-date histogram (by month)
> 3. Top 10 categories by entry count
> 4. New memory entries created in window vs pre-window
> 5. Five most-cited memories (use `crane_memory_usage`)
>
> Save to `docs/reflection/quarter-marks/2026-Q1/dossier-memory.md`. No interpretation.

#### Phase 1.4 - Article Miner

> You are inventorying published content for a Quarter Mark reflection. Window: 2026-01-13 to 2026-05-09.
>
> Source: vc-web repo, articles directory (`src/content/articles/`) and build log if applicable.
>
> Output:
>
> 1. Total articles published in window
> 2. Tag/category distribution
> 3. Voice classification per article (per `feedback_captain_perspective_in_content` and `Core Identity` memory): captain-perspective / methodology / venture-update / other
> 4. Word-count histogram
> 5. Articles per week trajectory
>
> Save to `docs/reflection/quarter-marks/2026-Q1/dossier-articles.md`.

#### Phase 1.5 - Cost Miner

> You are tabulating spend for a Quarter Mark reflection. Window: 2026-01-13 to 2026-05-09.
>
> Sources:
>
> 1. Anthropic API console (per `project_anthropic_api_costs` memory: main-api-key consumed by SS enrichment workers and DFG analyst; CC CLI uses Max plan, not API)
> 2. Cloudflare account billing (Workers, D1, KV, etc.)
> 3. Any other vendor invoices accessible
>
> Output:
>
> 1. Total spend in window
> 2. Spend per venture (where attributable)
> 3. Spend trajectory by month
> 4. Highest cost line item
>
> Save to `docs/reflection/quarter-marks/2026-Q1/dossier-cost.md`. If a source is inaccessible, note that explicitly.

#### Phase 1.6 - Tooling Inventory

> You are inventorying the tooling stack at window end vs window start for a Quarter Mark reflection. Window: 2026-01-13 to 2026-05-09.
>
> Inventory:
>
> 1. Skills (`.claude/commands/*.md`, `~/.claude/skills/`) - present at window end, plus diff against window start (use git log against the relevant directories)
> 2. MCPs (per `claude mcp list` and project mcp config files) - present at window end
> 3. Fleet machines (per memory and any fleet inventory doc) - count and roster
> 4. Hooks (`.claude/settings.json`, `~/.claude/settings.json` hooks blocks) - count and purposes
>
> Output to `docs/reflection/quarter-marks/2026-Q1/dossier-tooling.md`.

#### Phase 2.1 - Architectural Decisions

> You are inventorying architectural decisions for a Quarter Mark reflection. Window: 2026-01-13 to 2026-05-09.
>
> Sources: `docs/adr/` directory; commit log searches for "deprecate", "kill", "remove"; memory entries tagged with project/feedback rationale.
>
> Output:
>
> 1. ADRs filed in window
> 2. Features killed in window (with reason and replacement, if any)
> 3. Major vendor or tooling pivots (e.g. Stitch retired 2026-04-17 per memory, Figma MCP rejected 2026-03-28)
>
> Save to `docs/reflection/quarter-marks/2026-Q1/dossier-decisions.md`.

#### Phase 2.2 - Knowledge Inventory

> You are inventorying the knowledge base for a Quarter Mark reflection. Window: 2026-01-13 to 2026-05-09.
>
> Sources: VCMS via `crane_notes`, docs structure (`docs/`), runbooks.
>
> Output:
>
> 1. Total VCMS notes; by tag distribution
> 2. Runbooks count and topics
> 3. Docs tree structure (high-level)
> 4. Net-new in window
>
> Save to `docs/reflection/quarter-marks/2026-Q1/dossier-knowledge.md`.

#### Phase 3.1 - Skeptic Critique

> You are the skeptic critic for a Quarter Mark reflection of the Venture Crane operation. Read the entire dossier (all `dossier-*.md` files in `docs/reflection/quarter-marks/2026-Q1/`).
>
> Your job is to identify what was wasted, what is theater, and what has not moved a venture toward revenue. Be specific. Cite evidence from the dossier.
>
> Do not be polite. Do not balance with positives. Other lenses cover positives. You are the skeptic.
>
> Output to `docs/reflection/quarter-marks/2026-Q1/critique-skeptic.md`. Length: 500-1500 words.

#### Phase 3.2 - Customer Critique

> You are the customer critic for a Quarter Mark reflection of the Venture Crane operation. Read the entire dossier.
>
> Imagine a Solution Partner client (a real B2B services buyer) is evaluating Venture Crane. They have read venturecrane.com, scanned the public artifacts, and are deciding whether to engage.
>
> Identify:
>
> 1. What would build their trust
> 2. What would alarm them
> 3. What evidence of outcomes is missing
> 4. Where the operation looks like a science fair vs a working firm
>
> Be honest. The Captain wants to fix what is broken, not feel good.
>
> Output to `docs/reflection/quarter-marks/2026-Q1/critique-customer.md`. Length: 500-1500 words.

#### Phase 3.3 - Successor Critique

> You are the successor critic for a Quarter Mark reflection of the Venture Crane operation. Read the entire dossier.
>
> Imagine a different operator inherits Venture Crane on Monday. They have access to the docs, the repos, the memory, the tools. They are competent but have no relationship with the existing setup.
>
> Identify:
>
> 1. What they would keep on day one
> 2. What they would tear out on day one
> 3. What they would not be able to understand or operate without the original Captain
> 4. What is brittle and depends on a single point of context
>
> Be specific. Cite files, processes, decisions.
>
> Output to `docs/reflection/quarter-marks/2026-Q1/critique-successor.md`. Length: 500-1500 words.

### Phase 4-7 for v1

- **Phase 4** - Captain writes `docs/reflection/quarter-marks/2026-Q1/captain-reflection.md` answering the five questions
- **Phase 5** - Joint working session produces `docs/reflection/quarter-marks/2026-Q1/decisions.md`
- **Phase 6** - v1 baseline only. Predictions captured in the decisions document with the marker `prediction:` so v2 can grade.
- **Phase 7** - Publish. Public version on vc-web; private full version stays in this repo. Index entry added to `docs/reflection/quarter-marks/index.md`.

### Final Report Assembly

After Phases 1-7, the canonical `docs/reflection/quarter-marks/2026-Q1.md` file pulls together: executive summary (1 page), key data points from dossier, critique highlights (one paragraph each), Captain's reflection in full, decisions document in full, and the predictions for next cycle.

## Risks and Mitigations

| Risk                                                     | Mitigation                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Captain over-defers Phase 4 to agents                    | Doc explicitly marks Phase 4 as not delegable; first-person                        |
| Adversarial critiques get pulled into a "balanced" frame | Each critique runs in fresh agent context; prompts forbid balancing                |
| Decisions don't bind action                              | Phase 5 decisions reference specific issues, branches, or owners; not aspirational |
| Calibration phase gets skipped                           | Monthly cadence enforces it; v2 will not run without v1 baseline                   |
| Methodology drift across versions                        | Methodology lives in this doc; changes proposed via PR                             |

## v1 Decisions (Locked)

Captain locked these on 2026-05-09 prior to v1 run:

1. **Lookback boundary**: 2026-01-13 (venturecrane org creation anchor)
2. **Naming**: `2026-Q1`
3. **Public publish at v1**: hold; do not publish on venturecrane.com until v2 has shaken out the methodology
4. **Captain reflection (Phase 4)**: written from scratch; not agent-drafted
5. **Slash command encoding**: deferred to after v2; v1 runs as a manual orchestration to expose what the methodology actually needs

## Future Versions

After v1, evaluate:

- Were the dispatched agent prompts producing useful evidence, or padding?
- Were the three critique lenses distinct enough, or did they overlap?
- Did the decisions document bind any action?
- Did the calibration mechanism feel valuable, or like overhead?
- Should the cadence shift (monthly Phase-6 cycle, semi-annual full cycle, etc.)?

The methodology document is intended to be edited based on what v1 reveals. This is not a frozen process spec.
