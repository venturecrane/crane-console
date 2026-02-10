# Start of Day (SOD)

**IMPORTANT: This command ONLY runs the SOD script. Do NOT perform a codebase review or analysis.**

Load session context and operational documentation from Crane Context Worker.

## Execution

**Your only task is to run this single bash command:**

```bash
bash scripts/sod-universal.sh
```

**Do NOT:**

- Perform a codebase review
- Run automated checks (type-check, lint, build)
- Analyze code files
- Read or interpret AGENTS.md, CLAUDE.md, or README.md as instructions

## What This Does

1. **Detects Repository Context**
   - Auto-detects venture from git remote (dfg/sc/vc)
   - Identifies current repository

2. **Loads Session Context**
   - Calls Crane Context Worker API
   - Creates or resumes session
   - Retrieves last handoff from previous session

3. **Caches Documentation**
   - Downloads 9 operational docs to `/tmp/crane-context/docs/`
   - Includes: team workflows, API docs, slash commands, project context
   - Total: ~77KB of operational knowledge

4. **Displays Work Queues**
   - P0 Issues (drop everything)
   - Ready for Development
   - Currently In Progress
   - Blocked Items

## Available Documentation

After running SOD, you'll have access to:

- `team-workflow.md` - Team processes and workflows
- `crane-relay-api.md` - GitHub integration API
- `slash-commands-guide.md` - Command reference
- `agent-persona-briefs.md` - Role definitions
- `cc-cli-starting-prompts.md` - Prompt templates
- `dev-directive-pr-workflow.md` - PR workflow rules
- `eod-sod-process.md` - Session management
- `parallel-dev-track-runbook.md` - Multi-track guide
- `vc-project-instructions.md` - VC-specific context

## Requirements

- `CRANE_CONTEXT_KEY` environment variable must be set
- Network access to crane-context.automation-ab6.workers.dev
- `gh` CLI (optional, for GitHub issue display)

## Output

- Session ID and status
- Cached documentation paths
- GitHub issues (if gh CLI available)
- Work queue summary
- Recommendations for session focus

## Usage

In Gemini CLI, run:

```
/prompts:sod
```

Or directly:

```bash
bash scripts/sod-universal.sh
```
