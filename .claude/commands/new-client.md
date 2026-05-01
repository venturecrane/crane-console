---
name: new-client
description: Adds a client entity under the SS venture. Wiring only — registry entry + Infisical folder + local dev directory. Engagements live underneath.
version: 1.0.0
scope: venture:ss
owner: agent-team
status: stable
---

# /new-client - Set Up a New SS Client

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "new-client")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.

Adds a client entity under the SS venture. A client is the billing entity; engagements (the unit of work) live underneath.

## Execution

Follow the full skill specification at `.agents/skills/new-client/SKILL.md`.

Key points:

- This skill is venture-scoped to SS — it only meaningfully runs from `crane ss`.
- Captain must run the one-time prerequisites (GitHub org, GitHub App, Infisical management token, engagement-template repo) before any client can be onboarded. See `docs/process/new-engagement-setup-checklist.md`.
- The skill mutates `config/ventures.json` and provisions an Infisical folder. It does NOT create a GitHub repo (that's `/new-engagement`'s job).
