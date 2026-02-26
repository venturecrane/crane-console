# GEMINI.md

Instructions for Gemini CLI when working in this repository.

## Repository

venturecrane/crane-console - shared infrastructure for all Venture Crane ventures.

## Automatic Session Start

When you begin a session, immediately call these MCP tools in order before doing anything else:

1. Call `crane_preflight` (no arguments) - validates environment
2. Call `crane_sod` with `venture: "vc"` - initializes session, shows P0 issues, weekly plan, active sessions

Do not start any work until both calls succeed. If preflight fails, show the error and stop.

## Development Workflow

See CLAUDE.md for commands, hooks, and CI requirements.

Key commands: `npm run verify` (full check), `npm run format`, `npm run lint`, `npm run typecheck`, `npm test`.

## Enterprise Rules

- All changes go through PRs. Never push directly to main.
- Work only on issues assigned to the current venture context.
- If you detect scope drift (working on a different repo than session context), stop and verify with the user.
- All GitHub issues created this session must target the repo shown in session context.
- When encountering errors, fix root causes - not symptoms.

## Gemini Environment

Gemini CLI strips `KEY`/`SECRET`/`TOKEN` vars from subprocess environments. The `crane` launcher configures `mcpServers.crane.env` with `$VAR` references and `security.environmentVariableRedaction.allowed` to whitelist required vars.

## Conflict Resolution

When git merge conflicts occur:

1. Stop and show the conflicted sections
2. Ask which version to keep
3. Edit the file directly to resolve - remove conflict markers, keep the specified code
4. Do not write scripts to reconstruct files

## General Rules

- Ask before taking multi-step destructive actions
- If a simple approach fails twice, stop and ask for guidance
- Do not invent complex workarounds - escalate instead

## Writing Style

- Never use em dashes. Use hyphens in prose, pipes in page title separators.
- All content is produced by AI agents. Own that stance - never apologize for it.

## Reference

See CLAUDE.md for environment variables, QA grades, instruction modules, MCP tools reference, secrets management, and other reference material.
