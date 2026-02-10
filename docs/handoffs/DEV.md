# Dev Handoff

**Last Updated:** 2026-02-10
**Session:** m16 (Claude Opus 4.6)

## Summary

Made the Crane platform agent-agnostic across Claude Code, Codex CLI, and Gemini CLI. The launcher now supports all three agents with `--claude`, `--gemini`, `--codex` flags. MCP server auto-registration, instruction files, and venture documentation delivery all work across agents. Fixed several cross-agent gaps discovered during live testing with Codex on m16.

## Accomplished

- **Agent-agnostic launcher** (`fa58c80`) — `crane vc --gemini`, `crane ke --codex` now work. Agent resolution with conflict detection, binary validation with install hints, `CRANE_DEFAULT_AGENT` env var support
- **MCP auto-registration for all agents** (`54d8f12`) — Crane MCP server auto-registered in `.mcp.json` (Claude), `.gemini/settings.json` (Gemini), `~/.codex/config.toml` (Codex)
- **AGENTS.md for Codex** (`2bb5a31`, `e611633`) — Directive-style instruction file in crane-console and ke-console. Tells Codex to call MCP tools instead of slash commands
- **Full venture docs via MCP** (`0c6edc1`) — `crane_sod` now returns full documentation content (`include_docs: true, docs_format: 'full'`), closing the gap where only Claude got venture docs
- **Fixed `/sod` references in ke-console** (`4347f2d` in ke-console) — CLAUDE.md now uses agent-agnostic MCP tool instructions instead of Claude-only `/sod` slash command
- **Filed 23 issues** across dc-console and ke-console from code review (prior session segment)

## In Progress

- Codex still attempts `/sod` on first launch despite AGENTS.md — may need further directive tuning or a `.codex/` project-level config

## Blocked

None

## Next Session

- Test Codex session end-to-end: does it call `crane_preflight` + `crane_sod` automatically now that CLAUDE.md no longer says `/sod`?
- Test Gemini session on ke-console (`crane ke --gemini`)
- Audit other venture CLAUDE.md files (dc-console, sc-console, dfg-console) for `/sod` references that need updating
- Consider adding `crane_sod` auto-call to the launcher itself (agent-agnostic pre-flight before spawning the agent)

---

## Quick Reference

| Command                    | When to Use             |
| -------------------------- | ----------------------- |
| `/sod`                     | Start of session        |
| `/handoff <issue>`         | PR ready for QA         |
| `/question <issue> <text>` | Need PM clarification   |
| `/merge <issue>`           | After `status:verified` |
| `/eod`                     | End of session          |

### Fleet Commands

```bash
bash scripts/fleet-health.sh           # Check all machines
bash scripts/machine-health.sh         # Check local machine
bash scripts/deploy-to-fleet.sh ORG REPO  # Deploy repo to fleet
bash scripts/bootstrap-infisical-ua.sh # Set up UA creds (new machine)
```
