# Venture Crane | Site Positioning Pattern & Style Guide Addendum

**Date:** 2026-04-21
**Scope:** venturecrane.com Claude / Claude Code attribution updates (Phase 2 site edits)
**Audience:** Site editors executing page updates against the audit table

---

## 1. Purpose

This document is the work brief for Phase 2 site editors updating venturecrane.com with accurate, consistent Claude and Claude Code attribution. It applies to every page on the audit table that is not already marked "already-good." Use it before editing any page. Do not invent framing outside what is documented here.

---

## 2. The Honesty Frame

The goal is not marketing. The goal is accurate witness.

- **Transparency is the commitment signal.** Partner Network reviewers will read the site. Vague attribution ("AI agents," "AI coding tools") reads as evasion, not humility. Naming Claude where it belongs is honest, not promotional.

- **Don't retrofit history.** Articles that made their point without naming a platform should not have Claude inserted just to have Claude in the article. Attribution goes where Claude is the actual subject - in tools sections, operating model descriptions, and infrastructure overviews.

- **Tool attribution is specific.** Claude Code (the CLI harness) is not the Claude API (direct HTTP inference). Neither is the Agent SDK, MCP, or claude.ai. Get the level of the stack right. Imprecise attribution undermines credibility.

- **Distinguish shipping from planned.** SS lead pipelines and DFG analyst use the Claude API in production today. DC, KE, and SC are Claude Code-built at the development layer. Their product-layer Claude features exist in backlog. The canonical framing: "every venture product has Claude-powered features, shipping or in backlog." Never flatten shipping and planned into a single claim without the distinction.

- **Do not overclaim partnership status.** The accurate description is: "Venture Crane is in the Claude Partner Network pipeline." Not "Claude Certified Partner." Not "Anthropic Partner." Not "official partner." The application cleared initial review on 2026-04-09. That is the verifiable fact.

---

## 3. Canonical Framing Sentences

Editors should use these as anchors, not starting points for rewrites. Drop the right sentence at the right depth. Do not combine multiple blocks on a single page unless the page explicitly warrants that depth.

**One-line intro (homepage, top-of-nav pages):**

> Venture Crane is one operator and an AI agent workforce, powered by Claude Code.

**Agent workforce framing (methodology pages, The System):**

> Our agent workforce runs on Claude Code - the CLI harness - with Claude as the foundation model. Every session, every pull request, every pipeline runs through it.

**Portfolio framing (multi-venture overview contexts):**

> Every venture in the portfolio has Claude-powered features, either shipping in production or in the active backlog. SS and DFG run direct Claude API inference today. The development layer across all ventures runs through Claude Code agents.

**Stack framing (technical articles, infrastructure overviews):**

> Claude Code handles session-based agent work. Claude API handles production runtime inference. MCP handles tool and resource integration. These are distinct layers - the CLI, the HTTP endpoint, and the protocol. They are not interchangeable terms.

**Dario anchor (methodology pages, origin story, when explicitly about the operating thesis):**

> At Code with Claude in San Francisco (May 2025), Dario Amodei put 70-80% probability on the first one-person billion-dollar company powered by AI agents arriving by 2026. Venture Crane is building toward that thesis. Not as an exception to any rule. As the example he named.

---

## 4. Tool Attribution Lexicon

| Term                                               | Definition                                                                                                                                                               | When to Use on the Site                                                                                                                                                                 | Common Conflation Errors                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Claude**                                         | The Anthropic foundation model family (Sonnet, Haiku, Opus checkpoints)                                                                                                  | When referring to the model doing inference - scoring leads, analyzing auction items, generating completions                                                                            | Confusing the model with the CLI harness. "We use Claude" alone is ambiguous when you mean Claude Code.       |
| **Claude Code / CC CLI**                           | Anthropic's CLI agent harness. Agent sessions run inside it. It orchestrates tools, context, memory, and sub-agents                                                      | The correct term for the agent development environment across all VC ventures. Use "Claude Code" in full on first mention per page; subsequent references may use "the agent" naturally | Calling this "the Claude API." Claude Code uses the Claude model but the harness is its own distinct product. |
| **Claude API**                                     | Direct HTTP calls to `api.anthropic.com/v1/messages` with an `ANTHROPIC_API_KEY`. Used in production workers for inference                                               | Use when describing SS pipelines (review-mining, job-monitor, new-business) and DFG analyst worker. These make direct API calls - not CLI sessions                                      | Calling it "Claude Code." These pipelines do not use the CLI; they call the API directly.                     |
| **MCP / Model Context Protocol**                   | Open protocol for connecting Claude agents to tools, resources, and services. Anthropic introduced it Nov 2024; now an industry standard under the Agentic AI Foundation | Use when describing crane-mcp or crane-mcp-remote. Appropriate on infrastructure and methodology pages                                                                                  | Treating MCP as equivalent to "using Claude." MCP is the protocol layer, not the model.                       |
| **Agent SDK**                                      | Anthropic's framework for building custom agent harnesses programmatically                                                                                               | VC does not currently use the Agent SDK. Do not attribute Agent SDK usage to VC unless confirmed.                                                                                       |                                                                                                               |
| **Claude Managed Agents**                          | Anthropic's hosted agent infrastructure (not a product VC uses today)                                                                                                    | Do not reference on the site without confirmation of usage                                                                                                                              |                                                                                                               |
| **claude.ai**                                      | Anthropic's web interface. crane-mcp-remote serves MCP to claude.ai clients over HTTP                                                                                    | Accurate when describing crane-mcp-remote's remote MCP capability for claude.ai sessions                                                                                                | Confusing claude.ai with Claude Code. The web interface and the CLI are different surfaces.                   |
| **Anthropic Academy / Claude Certified Architect** | Anthropic's training and certification program. Scott Durgan pursuing the Foundations exam, target May 20-22, 2026                                                       | Use on credential or "about" contexts if referenced. Precise: "Foundations exam" is the current certification. Not yet "certified."                                                     | Claiming the certification before the exam date. Use "pursuing" until confirmed.                              |

---

## 5. Page-Type Playbook

Work from the audit table. These are treatment rules by page type, not a sequence.

**Homepage**
Add one sentence of Claude attribution in the intro paragraph where the operating model is described. The one-line intro framing sentence is the right tool. Do not bolt on paragraphs. Do not link to a "Learn more about our Claude usage" section. One sentence, in context, done.

**Methodology pages (The System, Start Here, Open Problems)**
These pages use "AI coding CLIs" and "AI coding tools" as category-level references. Add "Claude Code" as the specific tool where those generic category terms appear, in the Tools or Primitives sections. Add one instance of "Anthropic" as platform attribution somewhere on the page - one, not every occurrence. Do not rewrite the structure of these pages. Attribution goes into existing slots; it does not require new sections.

**Origin-story articles (Why We Built a Development Lab)**
Locate the sentence or paragraph where the AI workflow or tooling decision is described. Add one sentence of Claude Code attribution at that point. The framing should read as historical fact, not insertion. "The agent workforce runs on Claude Code" as a matter-of-fact clause, not a feature announcement.

**Sprint and ops articles with generic agent language (What Breaks When You Sprint with 10 AI Agents, Kill Discipline for AI Agent Teams, When the Agent Briefing Lies, Agents Building UI Never Seen)**
Add attribution at the first mention of the agent tooling. One sentence in context. Subsequent references to "the agent" can stay natural. Do not saturate. The goal is one honest anchor per article, not product placement throughout.

**Already-good articles - do NOT edit:**

- How We Built an Agent Context Management System
- Three CLIs, One Sprint, Zero Excuses Left (Ship Log)
- Multi-Agent Team Protocols Without Chaos
- Where We Stand: AI Agent Operations in February 2026
- What Running Multiple Ventures with AI Agents Actually Costs
- A Design Tool Bake-Off - Figma MCP vs Google Stitch
- Building an MCP Server for Workflow Orchestration
- Killing the QA Grading Theatre (Ship Log)
- Giving the Browser Advisor Live Context Access via Remote MCP (Ship Log)
- Multi-Model Code Review

These articles earn their Claude attribution honestly through their content. Do not touch them. Do not second-guess the audit finding.

**Retrofit-risk articles - do NOT edit:**

- Local LLMs for Offline Field Development

This article's existing framing is accurate and valuable as written. Inserting Claude attribution would distort the point. Leave it.

**Historical inaccuracy (Stitch article):**
Do not edit the Figma vs. Stitch article. The decision described in that article was subsequently reversed when Stitch was retired on 2026-04-17. Editing the article would obscure the actual history. The right treatment is a short ship-log entry noting the retirement. Draft something like: "We shipped a build log entry evaluating Figma MCP versus Google Stitch. Subsequently retired Stitch from the stack on 2026-04-17. The evaluation documented the decision as made at the time; this log entry closes the loop."

---

## 6. Voice Rules

- **No em dashes.** Use hyphens in prose. Use pipes in page title separators. Em dashes read as AI-generated content; avoid them entirely in VC-branded text.

- **"We" means the agent team directed by the operator.** It is not a royal we. It is not aspirational plurality. It is accurate: the agents produced this content under operator direction.

- **Direct, not pitchy.** "The agent workforce runs on Claude Code" is a sentence. "Leveraging transformational AI-powered agent technology through the Claude ecosystem" is not. If you catch yourself writing marketing language, cut it and start again.

- **Match the benchmark tone.** The tonal benchmarks are `where-we-stand-agent-operations-2026` and `what-ai-agents-actually-cost`. Both lead with specifics, name numbers, name tools, and treat the reader as capable of handling unvarnished information. Attribution additions should feel like those articles wrote them, not like a marketing insert dropped into editorial copy.

- **Specificity is the voice.** "Claude Sonnet 4 scores Google reviews for operational pain signals" is better than "Claude powers our lead intelligence." Name the model, name the task, name the outcome where you have that detail.

---

## 7. Handoff Checklist for Phase 2 Editors

**Before editing any page:**

- Read this document end to end (not just the section for that page type)
- Read `docs/anthropic-partnership/operating-model.md` for the canonical one-operator-plus-agent-workforce framing
- Locate the target page in the audit table and confirm it is not on the already-good or retrofit-risk lists

**During editing:**

- Use the canonical framing sentences from Section 3 as your anchors - do not draft new framing
- Apply the tool attribution lexicon from Section 4 to every tool reference
- Keep the edit footprint minimal: one honest attribution anchor per page, not a rewrite
- If the edit starts reshaping the article beyond Claude attribution, stop

**After editing:**

- Check every tool attribution against the lexicon: Claude Code vs. Claude API vs. MCP vs. claude.ai
- Check for em dashes and remove them
- Check for overclaim: does any sentence imply we are a current Claude Certified Partner or that all ventures ship Claude API today? If yes, revise
- Read the edited section aloud against the tonal benchmarks - does it sound like VC editorial or a press release? If the latter, cut and simplify

**Scope discipline:**
If you find a legitimate issue with an already-good article during this process, note it separately for the operator. Do not fix it during Phase 2. Phase 2 scope is Claude attribution gaps in the audit table. Nothing else ships in this pass.
