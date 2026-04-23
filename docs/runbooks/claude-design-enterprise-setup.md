# Runbook: Claude Design Enterprise Setup

Captain-executed runbook for enabling [Claude Design](https://claude.ai/design) across the Venture Crane portfolio. Sourced from the official [Get started](https://support.claude.com/en/articles/14604416-get-started-with-claude-design) guide and Anthropic's [launch announcement](https://www.anthropic.com/news/claude-design-anthropic-labs).

> **Context for agents:** This runbook describes browser/admin work the Captain performs. Do not attempt to automate it — there is no public API or MCP server for Claude Design as of this writing. Background: `docs/instructions/claude-design.md`.

## Prerequisites

- Anthropic workspace on a Pro, Max, Team, or Enterprise plan.
- Workspace admin access (required for Enterprise plans — Claude Design is default off).
- Each venture's `design-spec.md` uploaded to crane-context (`crane_doc('{code}', 'design-spec.md')` returns content).
- The venture's repo cloned locally (for confirming the link subdirectory before linking).

## Phase 1 — Workspace Enablement (one-time)

1. Sign in to [claude.ai](https://claude.ai) as a workspace admin.
2. Open the workspace admin panel → **Labs / Claude Design**.
3. Toggle **Claude Design** to **ON** for the workspace.
4. Verify: as a non-admin member, load `claude.ai/design` and confirm the product renders the chat + canvas UI.

Record the date of enablement in the portfolio note (Captain's call) so future audits know when the clock starts on usage limits.

## Phase 2 — Per-Venture Design System

Run this phase once per venture. Repeat for every currently-active venture (`vc`, `ke`, `dc`, `sc`, `dfg`, `ss`, and `smd` post-install) and for every future venture as part of `/new-venture`.

### 2.1 Create the Design System

1. Open [claude.ai/design](https://claude.ai/design).
2. Enter the **Design System** setup flow.
3. Name the system exactly `{Venture Display Name} — {code}` (e.g., `Kid Expenses — ke`). Consistent naming lets agents reference systems unambiguously.
4. Select the venture's active repo and **link the subdirectory from the table below**, not the repo root. Linking whole monorepos causes lag (official guidance).

| Venture            | Code  | Repo                           | Link path                      |
| ------------------ | ----- | ------------------------------ | ------------------------------ |
| Venture Crane      | `vc`  | `venturecrane/vc-web`          | `src/components/`              |
| Kid Expenses       | `ke`  | `kidexpenses/ke-console`       | `app/src/components/`          |
| Draft Crane        | `dc`  | `draftcrane/dc-console`        | `web/src/components/`          |
| Silicon Crane      | `sc`  | `siliconcrane/sc-console`      | active app under `apps/`       |
| Durgan Field Guide | `dfg` | `durganfieldguide/dfg-console` | `apps/dfg-app/src/components/` |
| SMD Services       | `ss`  | `smdservices/ss-console`       | `src/components/`              |
| SMD Ventures       | `smd` | pending install                | fill in after install          |

If Claude Design offers multiple directory granularities, always pick the tightest subdirectory that still contains the tokens file (`globals.css` or equivalent) and the primary component library.

### 2.2 Seed With `design-spec.md`

Claude Design reads uploaded design files during onboarding. Seed the system with the venture's spec so brand/identity is correct from project one.

1. Locally render the venture's spec:
   ```bash
   crane_doc('{code}', 'design-spec.md')
   ```
2. Export the spec to a file (save as `{code}-design-spec.md`).
3. In the Claude Design onboarding flow, upload that file when prompted for existing design work. Also upload any brand PDFs (logo guide, visual identity doc) the venture maintains.

### 2.3 Verify the Generated System

After Claude Design finishes ingesting:

1. Open the system's token view and confirm:
   - Colors match the `--{code}-*` tokens in the spec (chrome, surface, text, border, accent).
   - Typography matches the spec's font stacks.
   - Component examples look like the venture's actual components.
2. If tokens diverge, edit the system in Claude Design to match the spec. Do **not** "adopt" drifted tokens — the spec is the source of truth.
3. Create one test project ("Smoke test") inside the system, ask Claude to generate a simple card using the venture's tokens, and confirm the rendered output reads as the venture (not a generic AI look).

### 2.4 Document Linkage

Add a row to the per-venture table in `docs/instructions/claude-design.md` with the confirmed link path. If you created a fallback path (e.g., sc/dfg whose active app changed), update both this runbook and the instruction module in the same PR.

## Phase 3 — Handoff Workflow (per design)

Whenever a design is ready to implement:

1. In Claude Design, open the design and click **Send to local coding agent** (Claude Code on your box) or **Send to Claude Code Web**.
2. Claude Design passes a bundle + a single instruction to Claude Code.
3. In the receiving Claude Code session, confirm venture context (`/sos` if not active), confirm the branch is not `main`, and let Claude Code implement.
4. Ship via normal PR flow — never bypass `/ship`, pre-push verify, or the PR Completion Rule.

## Audit / Health Checks

Monthly, during `/portfolio-review` or `/skill-audit`:

- [ ] Workspace still has Claude Design enabled.
- [ ] Every installed venture has a named design system.
- [ ] Link paths in `docs/instructions/claude-design.md` still exist in their repos.
- [ ] Token drift check: spot-check one venture's Claude Design system against its `design-spec.md`.
- [ ] Capture any Claude Design product changes Anthropic has shipped (new export targets, MCP/API availability) and update `docs/instructions/claude-design.md`.

## Rollback

If a venture's Claude Design system misbehaves (bad tokens, wrong components, hallucinated brand):

1. In Claude Design, archive the broken system (do not delete — keep a record).
2. Rerun Phase 2 with a narrower link path and a fresh `design-spec.md` upload.
3. If Anthropic-side bugs block recovery, file in `docs/notes/issues.md` and fall back to `/product-design` until resolved.

## References

- https://claude.ai/design
- https://www.anthropic.com/news/claude-design-anthropic-labs
- https://support.claude.com/en/articles/14604416-get-started-with-claude-design
- `docs/instructions/claude-design.md`
- `docs/instructions/design-system.md`
- `.agents/skills/new-venture/SKILL.md`
