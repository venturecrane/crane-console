---
name: new-engagement
description: Creates a new engagement repo under an existing SS client and wires it into the launcher (registry, Infisical folder, GitHub repo, local clone). Engagements are the unit of billable work.
version: 1.0.0
scope: venture:ss
owner: agent-team
status: stable
---

# /new-engagement - Set Up a New SS Engagement

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "new-engagement")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.

Creates a new engagement repo under an existing client and wires it into the launcher. An engagement is the unit of billable work for a client.

## Execution

Follow the full skill specification at `.agents/skills/new-engagement/SKILL.md`.

Key points:

- This skill is venture-scoped to SS — it only meaningfully runs from `crane ss`.
- The client must already exist (run `/new-client` first).
- The skill delegates to `scripts/setup-new-engagement.sh` for the wiring (provision Infisical → create repo → mutate ventures.json with rollback → clone → scaffold → redeploy).
- Manual prereqs: `smdservices-clients` GitHub org, `smdservices-platform` GitHub App, `INFISICAL_MANAGEMENT_TOKEN` configured on `crane-context`, `engagement-template` repo. See `docs/process/new-engagement-setup-checklist.md`.
