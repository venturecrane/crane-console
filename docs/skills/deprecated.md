# Deprecated Skills

Skills that have been marked `status: deprecated` per the lifecycle defined in `docs/skills/governance.md`. Deprecated skills remain invocable for a 90-day grace period, then are removed in a follow-up PR.

Append new entries at the top.

## 2026-05-05

### `/sprint` — Sequential sprint execution

| Field            | Value                            |
| ---------------- | -------------------------------- |
| Skill path       | `.agents/skills/sprint/SKILL.md` |
| Dispatcher       | `.claude/commands/sprint.md`     |
| Owner            | captain                          |
| Deprecation date | 2026-05-05                       |
| Sunset date      | 2026-08-03                       |
| Replacement      | `/auto-build`                    |
| Trigger          | `/skill-audit` zero-usage report |

**Reason.** /sprint had zero invocations in the last 180 days. /auto-build covers the same plan-and-execute flow on pre-vetted issues, has 15 invocations in the same window, and is owned by Captain. Wave-based dependency planning in /sprint was never used in practice — Captain selects issues case by case and runs /auto-build.

**Removal-PR scope.** When the sunset date arrives, the cleanup PR will:

- Delete `.agents/skills/sprint/`, `.claude/commands/sprint.md`, `.claude/agents/sprint-worker.md` (if still present), and any sprint-state cache schema.
- Update `docs/process/fleet-orchestration.md`, `docs/process/fleet-decision-framework.md`, `docs/process/multi-agent-coordination.md`, `docs/process/agent-persona-briefs.md`, and `docs/process/slash-commands-guide.md` to remove /sprint references and replace the local-vs-fleet decision framework with /auto-build vs /orchestrate.
- Remove the `docs/reviews/2026-04-12-platform-audit.md` follow-up references to /sprint, if any.

### `/build-log` — Draft a Build Log Entry

| Field            | Value                               |
| ---------------- | ----------------------------------- |
| Skill path       | `.agents/skills/build-log/SKILL.md` |
| Dispatcher       | `.claude/commands/build-log.md`     |
| Owner            | agent-team                          |
| Deprecation date | 2026-05-05                          |
| Sunset date      | 2026-08-03                          |
| Replacement      | direct authoring + `/edit-log`      |
| Trigger          | `/skill-audit` zero-usage report    |

**Reason.** /build-log had zero invocations in the last 180 days, but seven build logs shipped in May 2026 alone (PRs #121-127, #129). The skill is bypassed: drafting flows directly through the terminology doc at `~/dev/vc-web/docs/content/terminology.md` and editorial review via `/edit-log`. The skill's interactive "Save as draft? (y/n)" flow added ceremony without participation. The 2026-04-12 platform audit (finding #5) already flagged genericization-rule duplication across build-log, edit-log, and edit-article — consolidation into the terminology doc is the durable path; the skill is not.

**Removal-PR scope.** When the sunset date arrives, the cleanup PR will:

- Delete `.agents/skills/build-log/` and `.claude/commands/build-log.md`.
- Update `docs/ventures/vc/website.md`, `docs/process/agent-persona-briefs.md`, and `docs/process/slash-commands-guide.md` to drop /build-log references.
- Confirm the genericization rules and stealth-venture filter live exclusively in the terminology doc (closing the 2026-04-12 platform-audit finding #5).
