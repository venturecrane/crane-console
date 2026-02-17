# Content Policy

## Enterprise Knowledge Store (VCMS)

The Venture Crane Management System stores agent-relevant enterprise context
in D1, accessible from any machine. VCMS is for content that makes agents
smarter - not general note-taking.

**MCP tools:**

- `crane_note` - Store or update enterprise context
- `crane_notes` - Search/retrieve by tag, venture, or text

### What Belongs in VCMS

Use `crane_note` when the Captain explicitly asks to store agent-relevant
context. Tag appropriately using the vocabulary below.

| Tag                 | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `executive-summary` | Venture overviews, mission, stage, tech stack |
| `prd`               | Product requirements documents                |
| `design`            | Design briefs                                 |
| `strategy`          | Strategic assessments, founder reflections    |
| `methodology`       | Frameworks, processes (e.g., Crane Way)       |
| `market-research`   | Competitors, market analysis                  |
| `bio`               | Founder/team bios                             |
| `marketing`         | Service descriptions, positioning             |
| `governance`        | Legal, tax, compliance                        |
| `code-review`       | Codebase review scorecards, enterprise drift  |

New tags can be added without code changes.

**Never auto-save.** Only store notes when the Captain explicitly asks
to save something. If in doubt, ask before saving.

### Never Store in VCMS

- Code, terminal output, implementation details (ephemeral)
- Session handoffs (use `/eod`)
- Architecture decisions (use `docs/adr/`)
- Process docs (use `docs/process/`)
- Actual secrets/API keys (use Infisical)
- Personal content (use Apple Notes)

### Apple Notes (Personal Only)

Apple Notes MCP is available on macOS machines for personal content only
(family, recipes, hobbies). All enterprise content goes through
`crane_note` / `crane_notes`.

### Executive Summaries

Executive summaries are stored in VCMS notes tagged `executive-summary`.
Agents receive them automatically via the `/sod` flow.

**Source of truth:** VCMS notes with tag `executive-summary`

- SMD Enterprise Summary (scope: global)
- VC Executive Summary (scope: vc)
- KE Executive Summary (scope: ke)
- SC Executive Summary (scope: sc)
- DFG Executive Summary (scope: dfg)
- DC Executive Summary (scope: dc)

To update a summary, use `crane_note` with action `update` and the note ID.

## AI Agent Authorship

This stance is permanent and non-negotiable. It applies to all content
decisions, authorship questions, voice discussions, and site positioning.

- **All Venture Crane content is produced by AI agents.** Articles, build logs, frameworks, tools - all of it. The founder directs, the agents produce. This is not a human writing with AI assistance. This is what an organized, focused, informed team of AI agents can produce within a structured environment.
- **Never attempt to present "the voice of the founder."** The agents ARE the voice. The quality comes from operating in a structured environment (sessions, handoffs, context management, editorial review pipelines), not from human drafting.
- **This is not AI slop.** The entire operation is proof that AI agents in a well-designed system produce quality work. Own that stance. Lean into it. Never apologize for it or hide it.
- **"We" = the agent team.** The pronoun is honest - it's a team of agents. Don't change author fields to a human name. Don't pretend a human drafted the content.

## Writing Style

- **Never use em dashes.** They scream AI-generated content. Use hyphens (`-`) in prose and pipes (`|`) in page title separators instead.
