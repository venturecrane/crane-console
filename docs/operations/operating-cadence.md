# Operating Cadence

The franchise routine. What it looks like to operate the Venture Crane enterprise day to day, week to week, and month to month. This is written for the Captain - the person directing the agent team and making Go/Kill decisions.

## The Daily Cycle

Every working session follows the same three-phase pattern:

### 1. Start of Session (SOS)

The Captain launches a session with `/sos`. The system loads:

- Active venture context (repo, branch, environment)
- Pending handoffs from previous sessions
- Overdue cadence items
- P0 issues and alerts
- Resume block (what was in progress when the last session ended)

The Captain reviews the briefing and decides what to focus on. The system suggests - the Captain directs.

### 2. Sprint Work

The Captain directs agents through the session's work. This could be:

- Building features on a venture product
- Running cadence items (reviews, audits, health checks)
- Investigating and fixing issues
- Content production and editorial review
- Infrastructure maintenance

Multi-agent teams can be spawned for parallel work. Fleet machines can be dispatched for independent tasks. The Captain's job is directing, not doing - setting priorities, reviewing output, making decisions.

### 3. End of Session (EOS)

Every session ends with `/eos`. The system automatically saves:

- What was accomplished
- What's still in progress
- Blockers and open questions
- Context for the next session to resume from

Handoffs are the continuity mechanism. They ensure no context is lost between sessions, regardless of which machine or agent picks up next.

## Weekly Cadence

| Item                    | Scope       | Purpose                                               |
| ----------------------- | ----------- | ----------------------------------------------------- |
| Weekly Plan             | CRANE       | Set priorities for the week via `/work-plan`          |
| Portfolio Review        | VC          | Review venture stages, metrics, and Go/Kill decisions |
| GBP Weekly Post         | SS          | SMD Services Google Business Profile content          |
| Code Reviews            | Per venture | Codebase health check on active ventures              |
| Secrets Rotation Review | CRANE       | Verify no expired or compromised credentials          |

The Weekly Plan is the Captain's primary steering mechanism. It sets which ventures get attention, what cadence items to execute, and what the week's deliverables are. Run `/work-plan` at the start of each week.

## Monthly Cadence

| Item                 | Scope | Purpose                                                             |
| -------------------- | ----- | ------------------------------------------------------------------- |
| Platform Audit       | CRANE | Senior-engineer audit of the operating system via `/platform-audit` |
| Context Refresh      | CRANE | Refresh enterprise documentation and D1 context                     |
| Enterprise Review    | CRANE | Cross-venture codebase audit                                        |
| Fleet Health Check   | CRANE | Verify all fleet machines are operational and current               |
| Command Sync         | CRANE | Sync slash commands across fleet machines                           |
| Dependency Freshness | CRANE | Check for outdated dependencies across all repos                    |
| Design System Review | CRANE | Review design token consistency and venture compliance              |
| Financial Review     | —     | Review the Financial Dashboard, update actuals, assess burn rate    |

The Platform Audit is the most important monthly item. It catches sprawl, dead code, and accumulated technical debt before they compound. The audit produces a graded report with kill/fix/invest lists.

## Quarterly Cadence

- **Strategic Planning Review**: Revisit capital allocation principles, portfolio evaluation, and risk register
- **Venture Stage Assessment**: Formal Go/Kill/Pivot decision for each venture based on metrics
- **Infrastructure Review**: Evaluate platform costs, capacity, and consolidation opportunities

## The Captain's Role

The Captain is not a developer, writer, or operator in the traditional sense. The Captain is the director of an AI agent team. The role is:

**Decide, don't do.** Set priorities. Choose which ventures get attention. Make Go/Kill calls. The agents execute.

**Review, don't write.** Read agent output. Approve PRs. Validate that work matches intent. Course-correct when it doesn't.

**Systematize, don't improvise.** If something works, document it. If a process is manual, automate it. The franchise prototype grows by capturing what works into repeatable systems.

**Kill fast.** The hardest part of the role. When a venture isn't working, shut it down. Don't prop up failing ventures with good-venture profits. Archive and move on.

This operating cadence IS the franchise routine. If a new Captain took over tomorrow, they would follow this same cycle - SOS, sprint, EOS, weekly plan, monthly audit, quarterly review - and the enterprise would continue to operate.
