# Claude.ai Project Instructions

Project-specific instructions for claude.ai Projects. Each file contains
the custom instructions to paste into a claude.ai Project's settings.

These are thin bootstraps - they tell Claude which venture to default to
and which tools to call for context. All venture data (tech stack, status,
business context) comes live from the crane context API via MCP tools.

## Setup

1. Go to claude.ai > Projects > Create Project
2. Name it (e.g., "Venture Crane")
3. In Project Settings > Custom Instructions, paste the contents of the matching file
4. Enable the crane context connector in conversations within the project

## Files

| File   | Venture            | Code |
| ------ | ------------------ | ---- |
| vc.md  | Venture Crane      | vc   |
| dc.md  | Draft Crane        | dc   |
| dfg.md | Durgan Field Guide | dfg  |
| sc.md  | Silicon Crane      | sc   |
| ke.md  | Kid Expenses       | ke   |
| ss.md  | SMD Services       | ss   |
| smd.md | SMD Ventures       | smd  |

## Keeping Context Current

These files rarely need updating. Venture-specific data (tech stack, status,
descriptions, business context) is served dynamically by crane-context tools:

- `crane_briefing` - Portfolio dashboard with schedule, sessions, handoffs
- `crane_ventures` - All ventures with tech stack, status, and descriptions
- `crane_notes` - Knowledge store (PRDs, strategy, business context)
- `crane_doc` - Documentation (project instructions, API docs, infra docs)

If venture data changes, update `config/ventures.json` and redeploy
crane-context. The project instructions do NOT need updating.
