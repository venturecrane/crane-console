# Slash Commands Guide

**Version:** 2.0
**Last Updated:** 2026-03-23
**Purpose:** Reference for all available skills (slash commands) in Claude Code CLI

Skills are defined in `.agents/skills/*/SKILL.md` and invoked as `/skill-name` in Claude Code CLI sessions.

---

## Session Lifecycle

Commands for managing agent sessions, context, and continuity.

| Command | Description            |
| ------- | ---------------------- |
| `/sos`  | Start of Session       |
| `/eos`  | End of Session Handoff |

**Details:**

- `/sos` initializes the session via `crane_sos` MCP tool, loads venture context, shows priorities and handoffs from previous sessions
- `/eos` auto-generates a structured handoff from session history and saves to D1 via `crane_handoff` MCP tool

Session heartbeats are fully automatic - the MCP server refreshes them on every tool call and via a background timer. No manual keepalive is needed.

---

## Execution

Commands for planning and executing work.

| Command          | Description                                                 |
| ---------------- | ----------------------------------------------------------- |
| `/auto-build`    | Vetted plan-and-execute workflow for issues or feature work |
| `/orchestrate`   | Fleet sprint orchestrator (multi-machine dispatch)          |
| `/calendar-sync` | Calendar Sync                                               |

**Details:**

- `/auto-build` plans an approach, gets sign-off, then executes locally; supports solo and team modes
- `/orchestrate` dispatches issues across fleet machines for parallel execution
- `/calendar-sync` transforms planned calendar events into actuals using real session data from D1

---

## Content

Commands for content creation, editing, and discovery.

| Command         | Description                |
| --------------- | -------------------------- |
| `/edit-article` | Editorial Review Agent     |
| `/edit-log`     | Build Log Editorial Review |
| `/content-scan` | Content Candidate Triage   |

**Details:**

- `/edit-article` runs an article through two parallel editor agents, applies blocking fixes, and reports advisory issues
- `/edit-log` single-agent editorial review for build logs; checks genericization and style. Build logs are drafted directly against the terminology doc at `~/dev/vc-web/docs/content/terminology.md`, then reviewed with this skill.
- `/content-scan` read-only triage that scans all ventures for publishable content candidates and build log gaps

---

## Quality

Commands for code review and plan critique.

| Command        | Description                   |
| -------------- | ----------------------------- |
| `/code-review` | Codebase Review               |
| `/critique`    | Plan Critique & Auto-Revision |

**Details:**

- `/code-review` runs a deep codebase review with multi-model perspectives; produces a graded scorecard stored in VCMS
- `/critique` spawns critic subagents to challenge the current plan or approach, then auto-revises based on the critique

---

## Design

Commands for design artifacts and PRD review.

| Command         | Description                        |
| --------------- | ---------------------------------- |
| `/design-brief` | Multi-Agent Design Brief Generator |
| `/prd-review`   | Multi-Agent PRD Review             |

**Details:**

- `/design-brief` orchestrates a 4-agent design brief process with configurable rounds; requires an existing PRD
- `/prd-review` orchestrates a 6-agent PRD review process with configurable rounds; reads existing source documents

---

## Governance

Commands for portfolio management and enterprise-wide audits.

| Command              | Description                  |
| -------------------- | ---------------------------- |
| `/portfolio-review`  | Portfolio Status Review      |
| `/enterprise-review` | Cross-Venture Codebase Audit |

**Details:**

- `/portfolio-review` reviews and updates venture portfolio data; collects live signals and presents changes for Captain approval
- `/enterprise-review` detects configuration, structural, and practice drift across all venture repos; must run from crane-console

---

## Setup

Commands for venture provisioning and launch.

| Command        | Description          |
| -------------- | -------------------- |
| `/new-venture` | Set Up a New Venture |

**Details:**

- `/new-venture` walks through setting up a new venture with Crane infrastructure (GitHub org, Cloudflare, Infisical, etc.)

---

## Built-in Commands

These are Claude Code CLI built-ins, not custom skills:

| Command    | Description                                         |
| ---------- | --------------------------------------------------- |
| `/commit`  | Stage changes and create commit with proper message |
| `/pr`      | Create pull request from current branch             |
| `/compact` | Compress conversation context to reduce tokens      |
| `/clear`   | Clear conversation (re-run `/sos` after)            |
| `/help`    | Get help with Claude Code CLI                       |

---

## Quick Reference

```
SESSION         /sos  /eos
EXECUTION       /auto-build  /orchestrate  /calendar-sync
CONTENT         /edit-article  /edit-log  /content-scan
QUALITY         /code-review  /critique
DESIGN          /design-brief  /prd-review
GOVERNANCE      /portfolio-review  /enterprise-review
SETUP           /new-venture
```

---

## All Skills (auto-generated)

This table is auto-generated from `.agents/skills/*/SKILL.md` at build time. If a skill is missing here, it hasn't been added to the skills directory.

{{skills:table}}

---

## Version History

| Version | Date         | Changes                                           |
| ------- | ------------ | ------------------------------------------------- |
| 2.0     | Mar 23, 2026 | Full rewrite: all 22 skills organized by category |
| 1.0     | Jan 18, 2026 | Initial guide with 6 commands                     |
