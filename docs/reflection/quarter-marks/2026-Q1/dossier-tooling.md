# Dossier: Tooling Inventory

Window: 2026-01-13 to 2026-05-09 (snapshot at window end + diff from window start)

## Skills (project-level, .claude/commands/)

- Total today: 38
- Added in window: 44 unique add events (some skills added, removed, re-added)
- Removed in window: 12 unique delete events (all net-removed; none of the 12 are currently present)
- Net delta: +38 (zero skills existed before 2026-01-13)

### Added in window (skills present today, first add date)

| Date       | Skill                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------- |
| 2026-01-19 | heartbeat, status, update (early adds; deleted 2026-04-12 then re-added 2026-04-25/2026-04-30) |
| 2026-02-06 | new-venture, prd-review                                                                        |
| 2026-02-13 | design-brief                                                                                   |
| 2026-02-14 | critique, edit-article, portfolio-review                                                       |
| 2026-02-15 | build-log (deleted 2026-05-05), code-review, edit-log, enterprise-review                       |
| 2026-02-16 | go-live (deleted/re-added)                                                                     |
| 2026-02-17 | analytics (deleted/re-added), content-scan                                                     |
| 2026-02-20 | orchestrate                                                                                    |
| 2026-03-22 | calendar-sync                                                                                  |
| 2026-03-23 | docs-refresh (deleted/re-added)                                                                |
| 2026-03-26 | ship                                                                                           |
| 2026-03-27 | eos, sos                                                                                       |
| 2026-03-31 | context-refresh                                                                                |
| 2026-04-12 | platform-audit                                                                                 |
| 2026-04-15 | nav-spec, skill-audit, skill-review                                                            |
| 2026-04-17 | own-it, product-design, ux-brief                                                               |
| 2026-04-23 | auto-build                                                                                     |
| 2026-04-24 | save-lesson                                                                                    |
| 2026-04-25 | auth-setup, ui-drift-audit                                                                     |
| 2026-04-30 | new-client, new-engagement                                                                     |
| 2026-05-05 | docs-audit, estimate                                                                           |
| 2026-05-06 | verify-audit                                                                                   |

### Removed in window (net-removed, not currently present)

| Date (final delete) | Skill                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| 2026-04-12          | heartbeat, status, update (superseded versions; re-added 2026-04-25)  |
| 2026-04-17          | stitch-design, stitch-ux-brief (replaced by product-design, ux-brief) |
| 2026-04-20          | work-plan                                                             |
| 2026-04-21          | analytics (v1), docs-refresh (v1), go-live (v1), skill-deprecate      |
| 2026-05-05          | build-log, sprint                                                     |

## Skills (user-level, ~/.claude/)

- Total today: 0 (neither `~/.claude/skills/` nor `~/.claude/commands/` exists)

## MCPs / Plugins

- Active today: 5 plugins (from `enabledPlugins` in `~/.claude/settings.json`) plus crane MCP (injected by crane launcher)
- Inventory:
  - context7: Live library documentation lookup (Context7 API)
  - typescript-lsp: TypeScript/JavaScript language server (go-to-def, references, hover)
  - playwright: Browser automation via Playwright MCP server
  - frontend-design: Opinionated HTML/CSS component generation
  - vercel: Vercel platform management (deployments, env vars, domains, marketplace)
  - crane (launcher-injected): Enterprise MCP — memory, docs, schedule, fleet dispatch, notifications, notes, sessions

## Fleet Machines

- Roster:
  - mac23: macOS 26.2 arm64, 64GB. Primary dev (Captain's Mac). Tailscale 100.115.75.103
  - mini: Ubuntu 24.04 x86_64, 16GB. Always-on server / CI runners. Tailscale 100.105.134.85
  - mbp27: Ubuntu 24.04 x86_64, 16GB. Secondary dev workstation. Tailscale 100.73.218.64
  - think: Ubuntu 24.04 x86_64, 8GB. Secondary dev workstation (ThinkPad). Tailscale 100.69.57.3
  - m16: macOS 26.2 arm64, 16GB. Field dev (portable MacBook Air). Tailscale 100.119.24.42
  - mba: RETIRED (replaced by m16, 2026-02-09)
- Source: `/Users/scottdurgan/dev/crane-console/docs/infra/machine-inventory.md`

## Hooks (settings.json blocks)

- Project-level (`.claude/settings.json`): 1 hook
  - UserPromptSubmit (1): `redirect-reflex-hook.sh` routes prompts through session reflex classifier before delivery
- User-level (`~/.claude/settings.json`): 3 hooks
  - SessionStart (1): `parallel-session-detect.sh` detects parallel agent sessions at startup
  - PreToolUse (1): `parallel-session-gate.sh` (matcher: `*`) gates tool calls in parallel session context
  - PostToolUse (1): `parallel-session-provision.sh` (matcher: `EnterWorktree`) provisions isolation after worktree entry

## Data Sources Used

- `ls .claude/commands/*.md` for current skill count and names
- `git log --since=2026-01-13 --until=2026-05-09 --diff-filter=A --name-only` for skills added in window
- `git log --since=2026-01-13 --until=2026-05-09 --diff-filter=D --name-only` for skills deleted in window
- `git log --before=2026-01-13 --diff-filter=A` for pre-window baseline (returned empty; all skills born in window)
- `~/.claude/settings.json` for user-level plugins (`enabledPlugins`) and hooks
- `.claude/settings.json` for project-level hooks
- `/Users/scottdurgan/dev/crane-console/docs/infra/machine-inventory.md` for fleet roster
- `ls ~/.claude/skills/ ~/.claude/commands/` for user-level skills (both paths absent)
- System reminder plugin list (corroborated `enabledPlugins`)
