# Skill Governance

This document defines how skills are created, reviewed, audited, and retired in the Venture Crane enterprise.

A **skill** is a structured prompt file at `.agents/skills/<name>/SKILL.md` that an agent invokes via a slash command (`/<name>`). Skills may bundle supporting files (workflows, references, examples, scripts) in sibling directories. Skills are this enterprise's operating system — every agent workflow (`/sos`, `/work-plan`, `/stitch-ux-brief`) is a skill.

## Frontmatter schema

Every `SKILL.md` MUST have YAML frontmatter at the top of the file:

```yaml
---
name: skill-name
description: One-line purpose statement (1-2 sentences).
version: 1.0.0
scope: enterprise
owner: captain
status: stable
depends_on:
  mcp_tools:
    - crane_sos
    - crane_schedule
  files:
    - crane-console:docs/planning/WEEKLY_PLAN.md
    - venture:.stitch/NAVIGATION.md
    - global:~/.agents/skills/nav-spec/validate.py
  commands:
    - gh
    - npm
---
```

### Required fields

| Field         | Type          | Description                                                                                                                                 |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | string        | kebab-case, MUST match the parent directory name and the `# /<name>` heading in the body                                                    |
| `description` | string        | 1-2 sentence purpose statement, used by the Claude Code harness to decide when to trigger the skill                                         |
| `version`     | semver string | `MAJOR.MINOR.PATCH`. Bump MINOR on additive changes, MAJOR on breaking restructures, PATCH on fixes                                         |
| `scope`       | enum          | `enterprise` (crane-console workflow), `global` (usable in any venture context), or `venture:<code>` (venture-specific, e.g., `venture:ss`) |
| `owner`       | string        | MUST be a key from `config/skill-owners.json`. Currently: `captain` or `agent-team`                                                         |
| `status`      | enum          | `draft` (in-progress, not yet stable), `stable` (production), `deprecated` (being retired)                                                  |

### Optional fields

| Field                  | Type     | Description                                                                                                                                                                         |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `depends_on.mcp_tools` | string[] | MCP tool names this skill calls. Validated against `config/mcp-tool-manifest.json` (CI-generated)                                                                                   |
| `depends_on.files`     | string[] | File references, **scope-prefixed**: `crane-console:<path>`, `venture:<path>`, or `global:<path>`. The `/skill-review` validator enforces the correct scope when checking existence |
| `depends_on.commands`  | string[] | External shell commands the skill invokes. Checked as PATH warnings only                                                                                                            |
| `backend_only`         | boolean  | If `true`, the skill has no matching `.claude/commands/<name>.md` dispatcher. Default `false`                                                                                       |
| `deprecation_date`     | ISO date | Set by `/skill-deprecate` when status flips to `deprecated`                                                                                                                         |
| `sunset_date`          | ISO date | Set by `/skill-deprecate`. Skill is a candidate for removal after this date                                                                                                         |
| `deprecation_notice`   | string   | Human-readable reason + migration path, shown in the SKILL.md banner                                                                                                                |

### Deliberately not in the schema

- **`last_reviewed`** — staleness is derived from `git log -1 --format=%cI -- <path>`, which gives truthful data for free. Stored dates drift into lies.
- **`allowed_tools`** — some legacy skills have this field; leave it in place during backfill but don't elevate it to governance. The Claude Code harness enforces tool access separately via `settings.json`.

## Scopes — where do skills live?

| Scope            | On-disk location                        | Distribution mechanism                                                                                                                     |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `enterprise`     | `crane-console/.agents/skills/<name>/`  | Primary — loaded directly when Claude Code runs in crane-console. Follow-up work will mirror to venture repos                              |
| `global`         | `~/.agents/skills/<name>/`              | Mirrored from `crane-console/.agents/skills/<name>/` to home via `config/global-skills.json` + launcher `syncGlobalSkills()` (see PR #528) |
| `venture:<code>` | `<venture-repo>/.agents/skills/<name>/` | Venture-specific. Not synced from crane-console. Example: a skill only useful in ss-console                                                |

## Lifecycle: draft → stable → deprecated → sunset

```
  draft ────── /skill-review passes ────▶ stable
    ▲                                        │
    │                                        │ /skill-deprecate
    │                                        ▼
    └────── reverted / reopened ────── deprecated
                                             │
                                             │ Captain directive after sunset_date
                                             ▼
                                          removed (separate PR)
```

- **draft** — in progress. `/skill-review` surfaces issues but the skill isn't advertised.
- **stable** — production. The default status after a passing review.
- **deprecated** — `/skill-deprecate` has set `deprecation_date` and `sunset_date`. Warning banner injected into the SKILL.md body. Invocations still work during the grace period.
- **removed** — after `sunset_date`, Captain can delete the skill in a separate PR. `guardrails.md` forbids removing features without Captain directive, so this is always manual.

## Review gate

`/skill-review` lints a single skill or the whole repo:

```bash
npm run skill-review -- --path .agents/skills/<name>
npm run skill-review -- --all --strict
```

Checks:

1. **Frontmatter conformance** — required fields present, enums valid, semver parseable.
2. **Dispatcher parity** — matching `.claude/commands/<name>.md` exists (unless `backend_only: true`).
3. **Reference validity**:
   - `depends_on.mcp_tools` — every name exists in `config/mcp-tool-manifest.json` (CI-generated).
   - `depends_on.files` — scope-prefixed; validator checks the correct location per scope.
   - `depends_on.commands` — checked on PATH as warnings only.
4. **Structural lint** — `# /<name>` heading matches frontmatter, `## Phases` or `## Workflow` section present.
5. **Deprecation sanity** — `status: deprecated` requires `deprecation_date` and `sunset_date`, and `sunset_date > deprecation_date`.

CI runs `skill-review` on every PR that touches `.agents/skills/**`. **Blocking mode** — any `error`-severity violation fails the check and blocks merge. Findings also post as a PR comment so fixes are actionable. Lower severities (`warning`, `info`) surface in the comment but don't block.

## Audit

`/skill-audit` runs a repo-wide health check. Monthly cadence, driven by `schedule_items` in crane-context D1. Surfaces in `/sos` briefing when due.

Report sections:

1. **Inventory** — totals by scope, status, owner.
2. **Schema gaps** — skills missing required frontmatter.
3. **Reference drift** — broken MCP tools / files / commands.
4. **Staleness** — skills whose SKILL.md hasn't been touched in git for > 180 days.
5. **Deprecation queue** — skills past `sunset_date`, flagged for Captain review.
6. **Zero-usage candidates** — skills with zero invocations in the last 90 days, grouped by owner. These are deprecation candidates.

## Invocation telemetry

Every non-`backend_only` SKILL.md includes an invocation directive as the first content line of the body (immediately after the `# /<name>` heading):

```markdown
> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "<name>")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.
```

### What gets recorded

Each call to `crane_skill_invoked` sends:

- `skill_name` — the skill being invoked
- `session_id` — current session ID (if known)
- `venture` — from `CRANE_VENTURE_CODE` env var
- `repo` — from `CRANE_REPO` env var
- `status` — `started` (default), `completed`, or `failed`
- `duration_ms` — elapsed time (set when reporting completion or failure)
- `error_message` — error detail (set on failure status)

### Enforcement

The `/skill-review` linter enforces the directive via the `structure.missing-invocation-directive` rule (severity: `error`). Skills missing the directive fail review. The check scans the first 20 non-empty lines of the body for a line matching `crane_skill_invoked.*skill_name.*"<name>"`.

Skills with `backend_only: true` in frontmatter are exempt — they are called programmatically, not by agents via slash commands.

### Where data lands

Invocations are recorded in the D1 `skill_invocations` table in `crane-context` via the `crane_skill_invoked` MCP tool, which calls `POST /skills/invocations`.

### How to query

- **MCP tool**: `crane_skill_usage(since: "90d")` — returns aggregate stats per skill
- **API**: `GET /skills/usage?since=90d` — same data via HTTP
- **Audit report**: the "Zero-usage candidates" section of `/skill-audit` cross-references inventory against live invocation counts

### Graceful degradation

The `crane_skill_invoked` MCP tool swallows all HTTP and network errors. A telemetry failure never blocks skill execution — the calling skill logs the warning and continues.

If `CRANE_CONTEXT_KEY` is not set, the tool returns immediately with a warning. The `/skill-audit` "Zero-usage candidates" section shows "Usage data unavailable" if the API is unreachable.

## Deprecation

`/skill-deprecate <name>` is Captain-gated. It:

1. Prompts for confirmation (cross-references `guardrails.md`).
2. Bumps frontmatter: `status: deprecated`, `deprecation_date: today`, `sunset_date: today + 90d`, `deprecation_notice: "<reason>"`.
3. Injects a warning banner at the top of the SKILL.md body.
4. Appends an entry to `docs/skills/deprecated.md`.
5. Creates a branch + PR for review.

The skill is NOT deleted. Removal is always a separate PR after `sunset_date`.

## Adding a new skill

1. Use `/skill-creator` to scaffold (or copy an existing skill's structure).
2. Fill out the frontmatter using the schema above. Default `status: draft` until ready.
3. Add the skill name to `config/skill-owners.json` under the owning team.
4. Write `.claude/commands/<name>.md` (unless `backend_only: true`).
5. Run `npm run skill-review -- --path .agents/skills/<name>` until it passes.
6. Flip `status: stable` and open a PR. CI will re-run `/skill-review`.

## Deferred (not yet implemented)

The following governance features are planned but not in this session's landing:

- **Venture-repo skill sync** — the launcher currently syncs `.claude/commands/` (via `syncClaudeAssets`) and global skills to `~/.agents/skills/` (via `syncGlobalSkills`). Extending this to mirror `.agents/skills/` to venture repos requires a reconcile pass for ss-console's 16 hand-ported skills; that work is tracked separately.
<!-- CI is already blocking; this item has shipped. Kept here as a historical note for future lifecycle entries. -->

See `docs/skills/deprecated.md` for the deprecation log.
