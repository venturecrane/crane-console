---
title: 'Agent Directives'
sidebar:
  order: 0
---

# Agent Directives

This section mirrors the instruction modules listed in CLAUDE.md. If you're mid-session, use the table in CLAUDE.md for quick `crane_doc()` lookups. If you're exploring or learning the system, continue here for context on each directive.

Agent directives are governance docs - the rules agents must follow when working across the Venture Crane portfolio. They codify policy decisions that were discovered through practice: what went wrong when an agent made assumptions, what patterns prevent drift, which boundaries keep the system coherent.

## Who This Is For

**Agents in active sessions:** Reference the CLAUDE.md instruction modules table. Load directives via `crane_doc('global', '<module>')` when the context requires it.

**Agents learning the system:** Read this section to understand the full governance model before taking on production work.

**Team leads and Captain:** Update directives when new governance gaps are discovered. The SOD summary mechanism keeps these in sync with session context automatically.

## How This Section Is Organized

### Content & Publishing

- **[Content Policy](content-policy.md)** - VCMS storage rules, tag vocabulary, AI agent authorship stance, and writing style standards.
- **[Creating GitHub Issues](creating-issues.md)** - Work item templates, label conventions, and target repos for backlog management.

### Development

- **[Guardrails](guardrails.md)** - Protected actions requiring Captain approval: feature deprecation, schema changes, and auth modifications.

### Design

- **[Wireframe Guidelines](wireframe-guidelines.md)** - When to generate wireframes, file conventions, quality bar, and conflict resolution between ACs and wireframes.
- **[Design System](design-system.md)** - How to load venture design specs, token naming conventions, and design maturity tiers.

### Infrastructure

- **[Fleet Operations](fleet-ops.md)** - SSH mesh setup, Tailscale bootstrap phases, macOS hardening, and remote conflict patterns.
- **[Secrets Management](secrets.md)** - Infisical integration, GitHub App details, vault storage, and secret provisioning rules.
