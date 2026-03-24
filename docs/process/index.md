---
title: 'Processes'
sidebar:
  order: 0
---

# Processes

A process is a named sequence of actions that produces a predictable outcome. Venture Crane runs on processes - from session lifecycles to multi-agent coordination to emergency security response. This section documents the operational patterns that keep the factory running.

Good processes disappear into the background. You know what to do when you start a session, when you commit code, when you discover a security issue, or when you need to spin up a new venture. The goal is to reduce cognitive overhead so agents and operators can focus on the work, not the workflow.

## Who This Is For

**Starting a session?** Start with [Session Lifecycle](session-lifecycle.md) and [EOD/SOD Process](eod-sod-process.md).

**Implementing a feature?** Read [Team Workflow](team-workflow.md) and [PR Workflow](pr-workflow.md) for the full development cycle.

**Setting up a dev environment?** Follow [Dev Box Setup](dev-box-setup.md) and [Crane CLI Launcher](crane-cli-launcher.md).

**Coordinating a multi-agent sprint?** Start with [Fleet Decision Framework](fleet-decision-framework.md), then proceed to [Fleet Orchestration](fleet-orchestration.md) or [Multi-Agent Coordination](multi-agent-coordination.md) depending on scale.

**Recovering from an incident?** Go straight to [Recovery Quick Reference](recovery-quickref.md) for triage, then [Security Incident Response](security-incident-response.md) if needed.

**Launching a new venture?** Follow [New Venture Setup Checklist](new-venture-setup-checklist.md) and [Adding a New Venture](add-new-venture.md).

Not finding what you need? Browse the full list below - these categories are starting points, not silos.

## How This Section Is Organized

### Core Workflows

The essential development cycle processes every agent uses:

- **[Team Workflow](team-workflow.md)** - Complete workflow specification: issue lifecycle, QA grading, status labels, communication patterns
- **[PR Workflow](pr-workflow.md)** - Pull request requirements for agents: branch naming, commit format, QA grades, post-merge verification
- **[EOD/SOD Process](eod-sod-process.md)** - Session lifecycle discipline: start of day briefing, end of day handoffs, session state management
- **[Dev Directive: PR Workflow](dev-directive-pr-workflow.md)** - Historical directive establishing PR-based workflow (no direct pushes to main)
- **[Dev Directive: QA Grading](dev-directive-qa-grading.md)** - QA grade assignment rules and routing by verification method
- **[QA Checklists](qa-checklists.md)** - Grade-specific verification checklists and evidence requirements

### Agent Roles & Coordination

How agents work together across machines and sessions:

- **[Agent Persona Briefs](agent-persona-briefs.md)** - Role definitions, responsibilities, quality bars, handoff protocols
- **[Multi-Agent Coordination](multi-agent-coordination.md)** - Session groups, worktree isolation, branch naming, conflict prevention
- **[Fleet Orchestration](fleet-orchestration.md)** - Multi-machine parallel execution: dispatch, monitoring, collection, cleanup
- **[Fleet Decision Framework](fleet-decision-framework.md)** - When to use fleet orchestration vs local sprint based on issue count, overlap, and machine health
- **[Parallel Dev Track Runbook](parallel-dev-track-runbook.md)** - Manual parallel track coordination across independent instances
- **[CC CLI Starting Prompts](cc-cli-starting-prompts.md)** - Practical prompt examples for common Claude Code CLI workflows

### Session & Context

Managing agent sessions, context, and continuity:

- **[Session Lifecycle](session-lifecycle.md)** - Session states, resume logic, heartbeats, checkpoints, handoffs
- **[CLI Context Integration](cli-context-integration.md)** - How CLIs integrate with Crane Context Worker for session management and documentation
- **[Slash Commands Guide](slash-commands-guide.md)** - Reference for all available skills and built-in commands
- **[Crane CLI Launcher](crane-cli-launcher.md)** - How the crane CLI resolves ventures, injects secrets, configures MCP, and spawns agents

### Infrastructure Setup

Setting up development environments and infrastructure components:

- **[MCP Server Architecture](mcp-server-architecture.md)** - crane-mcp server design: tool inventory, authentication, API mappings, token tracking
- **[Dev Box Setup](dev-box-setup.md)** - Bootstrap a development machine with CLI tools, MCP servers, and global secret scanning
- **[Context Worker Setup](CONTEXT-WORKER-SETUP.md)** - Quick setup guide for crane-context API authentication and testing
- **[Doc Sync Pipeline](doc-sync-pipeline.md)** - How documentation flows from git to agents (D1) and to the Starlight site
- **[Notifications Pipeline](notifications-pipeline.md)** - CI/CD event flow from GitHub/Vercel webhooks through crane-watch to agents
- **[Scheduled Automation Guide](scheduled-automation-guide.md)** - Available scheduling mechanisms: cron + pipe mode, GitHub Actions, Cloudflare cron triggers

### Security & Recovery

Emergency procedures and credential management:

- **[Secrets Rotation Runbook](secrets-rotation-runbook.md)** - When and how to rotate secrets: triggers, process, service-specific notes, schedule
- **[Security Incident Response](security-incident-response.md)** - Incident classification, escalation chain, containment, remediation, post-mortem
- **[Recovery Quick Reference](recovery-quickref.md)** - One-pager for common issues: fix in under 2 minutes or escalate

### Venture Lifecycle

Onboarding and launching new ventures:

- **[New Venture Setup Checklist](new-venture-setup-checklist.md)** - Complete onboarding checklist: GitHub setup, infrastructure, documentation, design system
- **[Add New Venture](add-new-venture.md)** - How to add a venture to the ecosystem: config file, deployment, verification
- **[VC Project Instructions](vc-project-instructions.md)** - Venture Crane mission, BVM methodology, team structure, shared infrastructure standards
- **[VCMS Conventions](vcms-conventions.md)** - Knowledge store usage: when to use VCMS vs other storage, tag taxonomy, CRUD via MCP tools
