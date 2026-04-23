# Claude Design

Enterprise instructions for using [Claude Design](https://claude.ai/design) across the Venture Crane portfolio.

## What It Is

Claude Design is an Anthropic Labs product (launched 2026-04-17, powered by Claude Opus 4.7) that lets you collaborate with Claude to produce polished visual work — designs, interactive prototypes, slides, one-pagers — from a chat + canvas UI. It is included with Pro, Max, Team, and Enterprise plans and uses subscription limits.

**Verified facts** (from [Anthropic's announcement](https://www.anthropic.com/news/claude-design-anthropic-labs) and [Get started](https://support.claude.com/en/articles/14604416-get-started-with-claude-design)):

- Claude Design is **default OFF for Enterprise plans** — a workspace admin must enable it.
- Design systems are **organization-scoped**. A workspace can maintain **more than one** design system; every new project inherits the system selected at creation.
- Onboarding ingests a linked code repository plus uploaded design files. **Link a specific subdirectory, not a full monorepo** — linking large repos causes lag and browser issues (official guidance).
- Handoff path: "Send to local coding agent" (Claude Code on your box) or "Send to Claude Code Web." Claude Design packages the work into a bundle and Claude Code completes the build from a single instruction.
- **No public API or MCP server yet.** Anthropic says integrations are "coming weeks." Do not plan automation that depends on a Claude Design API that does not exist.

## When To Use Claude Design (vs. Our Existing Tools)

| Situation                                                        | Tool                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| Brand-new venture, no design system yet                          | `/design-brief` → produce `design-spec.md` first                |
| Generating production-aligned screens for an established venture | **Claude Design** (picks up the onboarded system automatically) |
| Token refresh or spec-only changes                               | Edit `docs/ventures/{code}/design-spec.md` directly             |
| Implementing a design into code                                  | `/product-design` → `/react-components` → PR                    |
| Sharing a static mockup in-browser quickly                       | **Claude Design** (export to PPTX/PDF/Canva)                    |

Claude Design **supplements** `/design-brief` and `/product-design`; it does not replace them. The charter and spec remain the source of truth for tokens.

## Portfolio Setup Model

The rollout has three layers. Layers 1 and 2 are performed by the Captain in the browser at [claude.ai/design](https://claude.ai/design); Layer 3 is what this module and the `/new-venture` skill give you.

1. **Workspace enablement** (one-time) — admin toggles Claude Design ON for the Anthropic workspace.
2. **Per-venture design system** (once per venture) — create a named system, link the recommended subdirectory, upload the venture's `design-spec.md` to seed identity.
3. **Instruction + scaffold** (this module) — agents know Claude Design exists, when to recommend it, and what the handoff flow looks like; the `/new-venture` skill includes Claude Design onboarding as a standard step.

Full step-by-step: `docs/runbooks/claude-design-enterprise-setup.md`.

## Per-Venture Link Paths

When linking a venture's code to its Claude Design system, point at the **smallest subdirectory** that contains the design tokens (`globals.css` or equivalent) and the component library. Avoid linking the repo root.

| Venture            | Code  | Repo                           | Recommended link path               | `globals.css`             |
| ------------------ | ----- | ------------------------------ | ----------------------------------- | ------------------------- |
| Venture Crane      | `vc`  | `venturecrane/vc-web`          | `src/components/`                   | confirm on vc-web clone   |
| Kid Expenses       | `ke`  | `kidexpenses/ke-console`       | `app/src/components/`               | `app/src/app/globals.css` |
| Draft Crane        | `dc`  | `draftcrane/dc-console`        | `web/src/components/`               | `web/src/app/globals.css` |
| Silicon Crane      | `sc`  | `siliconcrane/sc-console`      | select the active app under `apps/` | confirm at link time      |
| Durgan Field Guide | `dfg` | `durganfieldguide/dfg-console` | `apps/dfg-app/src/components/`      | confirm at link time      |
| SMD Services       | `ss`  | `smdservices/ss-console`       | `src/components/`                   | confirm at link time      |
| SMD Ventures       | `smd` | pending install                | TBD after install                   | TBD                       |

If you add a venture, add its row here and in the runbook in the same PR that adds it to `config/ventures.json`.

## Handoff to Claude Code

When a design is ready to build:

1. In Claude Design, open the design and choose **Send to local coding agent** (Claude Code on your box) or **Send to Claude Code Web**.
2. Claude Design bundles the design artifacts and passes a single instruction to Claude Code.
3. In the Claude Code session, verify the venture context (`/sos` if not active) and confirm the target branch before Claude Code begins implementation.
4. All resulting work goes through the normal PR flow. Do not bypass `/ship`, pre-push verify, or the PR Completion Rule.

## What Agents Must NOT Assume

- **No CLI.** There is no `claude design` CLI command to script against. Do not invent one.
- **No MCP server.** Do not add a Claude Design MCP server to `.mcp.json` or claim one exists.
- **No per-repo install.** Claude Design is not a plugin you install in a venture's repo — the linkage lives in the Anthropic workspace.
- **No silent design-spec drift.** If Claude Design produces tokens that diverge from `design-spec.md`, update the spec (and the PR referencing it) — do not let the canvas and the spec disagree.

If a user asks you to "integrate Claude Design," first read this module and the runbook. If the ask exceeds what the current product supports (e.g., programmatic design generation), say so plainly and route to `/product-design` for the automatable path.

## References

- Anthropic announcement: https://www.anthropic.com/news/claude-design-anthropic-labs
- Get started: https://support.claude.com/en/articles/14604416-get-started-with-claude-design
- Runbook: `docs/runbooks/claude-design-enterprise-setup.md`
- Design-system module: `docs/instructions/design-system.md`
- Skill: `.agents/skills/new-venture/SKILL.md`
