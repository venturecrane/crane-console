# Venture Crane | Site Audit: Claude Attribution Gaps

**Date:** 2026-04-22
**Scope:** venturecrane.com - full site audit against the current Claude and Claude Code attribution state.
**Purpose:** Work-item inventory for Phase 2 site editors. Pair with `venturecrane-site-positioning-pattern.md` before editing any page.

---

## Summary

Total pages audited: 38 (homepage, 6 nav/structural pages, 31 articles, Ship Log index + 3 log entries read in full, remaining logs sampled by title).

| Gap type        | Count |
| --------------- | ----- |
| missing         | 8     |
| vague           | 12    |
| already-good    | 9     |
| conflation-risk | 2     |
| retrofit-risk   | 1     |
| inaccurate      | 0     |

Some pages are multi-tagged.

**Partnership overclaiming:** zero. No instances of "Claude Partner," "Anthropic Certified," or similar language found on the site. Appropriate given the Partner Network application is in pipeline.

---

## DO NOT EDIT (already-good or retrofit-risk)

Editors: skip these pages. Changing them creates regression, not improvement.

### Already good (accurate Claude attribution, no change needed)

- `/articles/agent-context-management-system/` | names Claude Code with install commands, config paths, architecture diagrams
- `/log/2026-02-17-three-clis-one-sprint/` | the best single commitment statement on the site: "We run Claude Code as our primary development agent"
- `/articles/multi-agent-team-protocols/` | clean role table: Dev Agent = Claude Code, PM Agent = Claude Code, Advisor = Gemini CLI
- `/articles/where-we-stand-agent-operations-2026/` | names Claude Code 6+ times with token efficiency benchmarks, MCP origin attribution, "Claude writes, Codex reviews" pattern
- `/articles/what-ai-agents-actually-cost/` | Anthropic Max 20x at $200/mo, Claude Code as "the workhorse"
- `/articles/figma-vs-stitch-design-tool-evaluation/` | honest bake-off, Claude Code named as MCP host
- `/articles/building-mcp-server/` | Claude Code named explicitly in diagram, tool table, tech table
- `/log/2026-04-12-killing-qa-grading-theatre/` | honest Gemini attribution; no edit warranted
- `/log/2026-02-22-remote-mcp-browser-advisor/` | accurate claude.ai attribution

### Retrofit-risk (DO NOT edit even though Claude naming is thin)

- `/articles/local-llms-offline-field-development/` | already names Claude Code as the production tool these supplement. The article's framing (Ollama/Qwen/DeepSeek as offline field-compute, NOT replacing Claude) is the point. Editing would dilute the architectural honesty.

### Historical inaccuracy (handle with ship-log entry, not an article edit)

- `/articles/figma-vs-stitch-design-tool-evaluation/` | Stitch was retired 2026-04-17. Article describes a decision that was subsequently reversed. Do NOT edit the article. Write a one-sentence ship-log entry noting the retirement.

---

## EDIT: High-priority pages

Highest leverage, largest credibility delta. Do these first.

### Nav / methodology pages (4)

These are the canonical pages linked from the homepage and Start Here. They describe VC's exact operating model without naming Claude. Single highest-leverage pattern-level gap on the site.

| URL               | Current state                                                                   | Suggested treatment                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `/` (homepage)    | Intro describes operating model; zero Claude references                         | Name Claude Code in the intro sentence. One sentence, no bolt-on paragraph. Flows into every search snippet and social card. |
| `/the-system/`    | "AI coding CLIs" and "AI agents" throughout, no platform named                  | Name Claude Code in the Tools/primitives section; name Anthropic as the platform once.                                       |
| `/start-here/`    | Curated reading guide, no Claude mentions                                       | Add a one-line tooling note in the intro: "Primary agent: Claude Code via Anthropic Max."                                    |
| `/open-problems/` | Describes cross-session memory and graceful-degradation gaps, no platform named | Ground the problems: "these are challenges we encounter daily running Claude Code sessions."                                 |

### High-priority articles (5)

| URL                                        | Current state                                                                                | Suggested treatment                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/articles/why-development-lab/`           | Origin story; zero Claude mentions despite being about the decision to build AI-native infra | One sentence in the "AI Agent Angle" section naming Claude Code as the primary agent interface.       |
| `/articles/when-the-agent-briefing-lies/`  | Operational article referencing $741 in compute; no platform named                           | One sentence in "what directing agents actually looked like" attributing the sessions to Claude Code. |
| `/articles/agents-building-ui-never-seen/` | 40+ agent-hours; article never names the agent                                               | Single attribution in opening context: "Claude Code agents, working from design specs."               |
| `/articles/kill-discipline-ai-agents/`     | Mentions `CLAUDE.md file` once in passing, never names platform                              | Add "This applies directly to Claude Code sessions" in the cultural-practice section.                 |
| `/articles/fleet-sprints-ai-agents/`       | Claude Code named in intro only, not followed through                                        | Reinforce CC CLI attribution in the mechanics description (one or two anchor sentences).              |

---

## EDIT: Medium-priority pages

Vague language worth tightening where it appears. Work these after high-priority is complete.

Pages flagged `vague` in the full audit but sampled (not fully read) by the auditor: editor should read each, apply pattern-doc guidance, add attribution where the content describes actual CC CLI work.

Candidates (from audit sampling):

- `/articles/cross-venture-context-agent-awareness/`
- `/articles/forty-hours-one-auth-bug/` (MCP debugging context)
- `/articles/tool-registration-not-integration/`
- `/articles/zero-to-landing-page-four-days/`
- `/articles/code-review-to-production-48-hours/`
- `/articles/secrets-management-ai-agents/`
- `/articles/secrets-injection-agent-launch/`
- `/articles/fleet-management-solo/`
- `/articles/lazy-loading-agent-context/`
- `/articles/sessions-heartbeats-handoffs/`
- `/articles/four-auth-vulnerabilities-one-code-review/`
- `/articles/staging-environments-ai-agents/`

Guidance per article: one or two attributions where the content concretely describes CC CLI work. Do not saturate.

---

## Site-wide patterns

1. **Nav pages generically say "AI agents" / "AI coding CLIs" / "AI coding tools."** Three high-traffic editorial pages describe VC's exact operating model without once naming the platform. This is the single highest-leverage gap.

2. **Articles use "AI coding agent," "AI agents," or "coding CLI"** without naming Claude Code when describing the primary workflow tool. Site-wide vague pattern.

3. **MCP is named correctly and frequently** across technical articles. No conflation issues with MCP itself.

4. **Dario Amodei one-person-billion-dollar-company framing** is cited in `where-we-stand-agent-operations-2026` but not echoed on the homepage or The System page, where it would land powerfully. Consider using the anchor sparingly on the top pages (once per page max).

---

## Flags

- **Stitch retirement:** article describes a retired tool as current. Ship-log entry to note retirement is the correct fix, NOT an article edit.
- **Articles sampled but not fully read:** editor should read each target article before applying guidance. Audit flagged ~12 articles as `vague` based on titles and summaries but did not fully read them.
- **No retrofitting.** If a page's subject was NOT Claude-specific, and adding Claude references would misrepresent the original scope, do not edit.
