# Memory Governance

This document defines how enterprise memories are created, validated, promoted, audited, and retired across Venture Crane ventures (vc, ke, sc, dfg, ss, dc).

A **memory** is a structured VCMS note carrying one of four memory tags, authored when an agent (or the Captain) has learned something worth carrying forward. Memories surface proactively at session start via `/sos` and on-demand via skill queries, so future agents don't pay the re-discovery cost. Memories are this enterprise's operational knowledge base — they turn one-time lessons into persistent behavior.

## Tag vocabulary — exactly 4

| Tag            | Meaning                                                                                                          | Polarity   |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| `lesson`       | Actionable behavioral correction. "Do X when Y."                                                                 | Positive   |
| `anti-pattern` | Prohibition with failure mode. "Do NOT X because Z." Injected most aggressively.                                 | Negative   |
| `runbook`      | Step-sequence for recurring situation. Procedure, not correction.                                                | Neutral    |
| `incident`     | Post-mortem with root cause + blast radius. Raw source — lessons and anti-patterns are distilled from incidents. | Historical |

Exactly four tags. A fifth requires explicit Captain directive. Knowledge-management systems atrophy when tags proliferate; the four-tag constraint is load-bearing.

A memory MAY carry multiple memory tags (e.g., an anti-pattern distilled from an incident carries `anti-pattern` + references the source incident in `supersedes_source`). Existing VCMS tags (`executive-summary`, `prd`, etc.) coexist — memory tags are additive.

## Frontmatter schema

Every memory note MUST have YAML frontmatter in the first ~500 bytes of its content:

```yaml
---
name: never-bulk-dump-infisical-secrets
description: Using `infisical secrets -o json` dumps plaintext values into the transcript.
kind: anti-pattern # lesson | anti-pattern | runbook | incident
scope: enterprise # enterprise | global | venture:vc
owner: captain # captain | agent-team (matches config/skill-owners.json)
status: stable # draft | stable | deprecated | parse_error
captain_approved: true # Captain has reviewed and approved for always-on SOS injection
version: 1.0.0
severity: P0 # P0 | P1 | P2 — anti-patterns only
applies_when:
  commands: [infisical]
  files: ['.infisical*', 'wrangler.toml']
  skills: [sos, ship, platform-audit]
supersedes: [] # IDs of prior notes this replaces (for evolution chains)
supersedes_source: # source path(s) this memory was distilled from
  - docs/reviews/2026-04-09-infisical-bulk-dump-incident.md
last_validated_on: 2026-04-24
---
```

### Required fields

| Field              | Type          | Description                                                                                                                                  |
| ------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | string        | kebab-case; unique identifier within scope. Used in audit reports and supersedes chains.                                                     |
| `description`      | string        | 1-2 sentence purpose statement. Shown in SOS output and audit reports — keep it readable.                                                    |
| `kind`             | enum          | One of `lesson`, `anti-pattern`, `runbook`, `incident`. Must match one of the memory tags.                                                   |
| `scope`            | enum          | `enterprise` (all ventures), `global` (usable in any Claude context including outside ventures), or `venture:<code>` (single venture).       |
| `owner`            | string        | Key from `config/skill-owners.json`. Currently `captain` or `agent-team`.                                                                    |
| `status`           | enum          | `draft` (new, not promoted), `stable` (promoted, visible to on-demand pulls), `deprecated` (retired), `parse_error` (synthetic, read-time).  |
| `captain_approved` | boolean       | **Load-bearing gate.** `true` only after Captain explicit approval (inline at `/eos`, or via `crane_memory(update)`). See "Injection gates". |
| `version`          | semver string | `MAJOR.MINOR.PATCH`. Bump MINOR on additive refinements, MAJOR on kind/scope change, PATCH on wording fixes.                                 |

### Optional fields

| Field               | Type     | Description                                                                                                                                       |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `severity`          | enum     | `P0` / `P1` / `P2`. Anti-patterns only. Drives the top-5 sort in SOS Critical Anti-Patterns. P0 = data loss / security / prod outage potential.   |
| `applies_when`      | object   | Trigger conditions for context-matched injection. Keys: `commands` (string[]), `files` (string[] — glob patterns), `skills` (string[]).           |
| `supersedes`        | string[] | VCMS note IDs this memory replaces. The superseded IDs get `status: deprecated` automatically, and reads on those IDs return a supersedes banner. |
| `supersedes_source` | string[] | Path(s) this memory was distilled from (retrospective .md, per-project memory file, issue). Auditable lineage.                                    |
| `last_validated_on` | date     | ISO date of most recent affirmative "I checked this and it still holds" action. Staleness is measured against this when present.                  |

### Deliberately NOT in the schema

- **`last_touched`** — derived from VCMS `updated_at`, same reasoning as skills/governance: stored dates drift into lies.
- **`cited_count` / `surfaced_count`** — computed from the `memory_invocations` table at query time, not stored on the note.

## Three memoryability tests (enforced at write)

Before a note can be saved with a memory tag, all three must hold:

1. **Actionable.** Tells future agent what to do or avoid, not how someone felt. "Don't `git reset --hard` without checking for uncommitted work first" passes; "Debugging was frustrating today" fails.
2. **Non-obvious.** Not derivable from reading the codebase or default Claude reasoning. "Use TypeScript strict mode" fails (obvious, enforced by tsconfig). "Stitch v0.5.1 has a broken stdio handshake — pin to v0.5.0" passes.
3. **General enough to recur.** Applies to a class of situations, not a single accident. "That specific migration needs a retroactive guard" fails. "All legacy migrations need retroactive idempotency guards when adding a new env" passes.

Enforcement: `crane_memory(save)` validates at save time. A draft that fails any test can be saved as an ordinary VCMS note (no memory tag), but not as a memory. The error message names the failed test.

## Lifecycle

```
      /eos accepts                                  /memory-audit
          │                                               │
          ▼                                               ▼
   status: stable                                  status: deprecated
   captain_approved: true  ─────────(unused)──────▶
          ▲                                               ▲
          │                                               │
  /save-lesson, migration,                         90d zero-cite AND
  /code-review extract                             ≥10 surfaced
          │                                               │
          ▼                                               │
   status: draft        ───14d + schema + ───────▶  status: stable
   captain_approved: false    no flags               captain_approved: false
                                                          │
                                                          ▼
                                                Captain explicitly approves
                                                          │
                                                          ▼
                                                   status: stable
                                                   captain_approved: true
```

- **draft** — in progress, not surfaced anywhere except explicit `crane_memory(list, status: 'draft')` queries.
- **stable** — visible to on-demand pulls (`/code-review`, `/ship` may query with `captain_approved_only: false`), but NOT injected into SOS unless `captain_approved: true`.
- **stable + captain_approved** — the only state that appears in always-on SOS Critical Anti-Patterns and Relevant Lessons sections.
- **deprecated** — retired. Excluded from all injection and recall paths. Kept for audit lineage; never hard-deleted.
- **parse_error** (synthetic) — a memory whose frontmatter failed to parse at read time. Quarantined from injection/recall until fixed. See "Parse-error quarantine".

## Injection gates — what goes into every session

The `captain_approved` boolean is the single gate that separates "injected into every session" from "available via explicit query."

- **SOS Critical Anti-Patterns** (always-on, top 5): filter `kind: anti-pattern AND status: stable AND captain_approved: true AND scope ∈ {enterprise, global, venture:current}`.
- **SOS Relevant Lessons** (context-matched, top 3): same filter with `kind: lesson`.
- **On-demand pulls** from skills (`/code-review`, `/ship`): may pass `captain_approved_only: false` to access the broader stable corpus.
- **Auto-promoted drafts**: reach `status: stable` but NOT `captain_approved: true`. They are on-demand-only until Captain approves.

This prevents the "noise bomb" failure mode where batch-migrated or auto-authored drafts flood every session with varying-quality content before a human has vetted them.

## Authorship paths

### 1. `/eos` inline capture (the only path to captain_approved=true at creation)

At session close, the `/eos` skill proposes 0-2 memoryable moments observed during the session. Each proposal includes the draft frontmatter (kind, scope, applies_when) and body. Captain accepts/rejects inline. Accepted items are saved with `status: stable, captain_approved: true` — no draft queue.

Agent should err on fewer proposals. **0 is a valid answer.** Cheap misses (a genuinely memoryable moment that the agent didn't propose) are better than noisy hits (routine work captured as "lessons"). The memoryability tests apply.

### 2. `/save-lesson` explicit capture

Captain invokes `/save-lesson [summary]` inline during a session. The agent drafts frontmatter from session context (venture, recent files, active skills), writes the body, and saves with `status: draft, captain_approved: false`. Captain can follow up by promoting via the weekly `/memory-audit` review flow.

### 3. Batch migration (one-shot)

Scripts in `scripts/migrate-*-to-vcms.sh` read existing feedback files and retrospectives, apply the 3 memoryability tests heuristically, and write drafts with `supersedes_source` pointing at the original path. Non-interactive — Captain reviews through the audit flow, not at migration time.

### 4. `/code-review` post-review extraction

The `/code-review` skill, after storing its report, offers to extract HIGH+ findings as `anti-pattern` drafts and systemic cross-review patterns as `lesson` drafts. Same accept/reject flow as `/eos`; accepted items go directly to `stable, captain_approved: true`.

### 5. Post-retrospective extraction (automated, drafts only)

The `migrate-retros-to-vcms.sh` script and the updated retrospective template (`docs/reviews/TEMPLATE.md`) together ensure every retro produces 0-N distilled lesson drafts at write time.

## Audit

`/memory-audit` runs weekly (Mondays 08:17 local) via `config/schedule-items.json`, driven by the cadence engine in crane-context D1. Surfaces in `/sos` briefing when overdue.

### Seven checks

1. **Inventory** — totals by kind, scope, status, owner, captain_approved.
2. **Schema gaps** — memories missing required frontmatter fields.
3. **Staleness** — memories whose `updated_at > 180 days AND last_validated_on > 180 days`. Incidents are historical, not subject to staleness.
4. **Deprecated-but-surfaced** — any `status: deprecated` that still matches SOS or skill recall queries. Must be zero; if not, recall code has a bug.
5. **Zero-usage** — `status: stable` AND trailing-90-day `cited_count == 0` AND `surfaced_count ≥ 10`. Deprecation candidates.
6. **Supersedes-chain integrity** — `supersedes` IDs exist; `supersedes_source` paths exist on disk.
7. **Parse-error count** — memories whose frontmatter failed validation at last read. Blocks the audit from claiming a clean state until all are fixed.

### Auto-apply behavior

- **Auto-promote**: drafts that pass schema AND have `supersedes_source` OR are ≥14 days old with no flags move `draft → stable`. Never sets `captain_approved: true`.
- **Auto-deprecate**: memories meeting zero-usage criteria move `stable → deprecated`.
- **Flag-only**: schema gaps, supersedes-chain rot, orphaned drafts >30d, parse_errors. Surfaced in the report for Captain action.

### Output

Report sections: `promoted[]`, `deprecated[]`, `flagged[]`, `revalidated[]`, `parse_errors[]`, `pending_captain_approval[]` (stable + unapproved, with cite/surface stats for bulk review).

### Captain approval elevation

Outside the `/eos` and `/code-review` capture paths, `captain_approved: true` is set only through explicit action: `crane_memory(update, id, captain_approved: true)` or bulk-approve from the `/memory-audit` report. Promoting by auditor is **never** automatic — the whole point of the gate is that a human signs off on "this is worth injecting into every session."

## Telemetry

The `crane_memory_invoked` MCP tool records three event types:

| Event         | When                                              | Sampling       |
| ------------- | ------------------------------------------------- | -------------- |
| `surfaced`    | Memory appeared in SOS output or skill injection  | 1/10 (sampled) |
| `cited`       | Agent explicitly referenced the memory in output  | 1/1 (always)   |
| `parse_error` | Memory failed frontmatter validation at read time | 1/1 (always)   |

### Rare-memory protection

A memory is auto-deprecated only when:

```
status == 'stable'
AND cited_count (trailing 90d) == 0
AND surfaced_count (trailing 90d) >= 10
AND NOT newly_created (<30 days)
```

The `surfaced_count >= 10` floor is protective: rarely-surfaced memories (e.g., specific third-party tool gotchas that only apply in narrow contexts) are exempt from auto-deprecation regardless of citation count. Rarity is not the same as irrelevance.

Sampling `cited` events would destroy the statistical basis for this rule — a memory cited 2/20 times (10% cite rate) cannot be distinguished from one cited 0/20 times after 1/10 sampling. `cited` is always recorded at 1/1. `surfaced` is high-volume and sampled.

### Where data lands

Invocations are recorded in the D1 `memory_invocations` table in crane-context via the `crane_memory_invoked` MCP tool, which calls `POST /memory/invocations`.

### Graceful degradation

Telemetry failures NEVER block caller execution. The `crane_memory_invoked` tool swallows all HTTP and network errors. If `CRANE_CONTEXT_KEY` is unset, the tool returns immediately with a warning. `/memory-audit` shows "Usage data unavailable" if the API is unreachable.

## Parse-error quarantine

The frontmatter-in-content storage shape trades one risk for simplicity: manual edits to a memory can corrupt the YAML block.

### Behavior

- `crane_memory(get | list | recall)` validate that gray-matter returned the required frontmatter fields (`name`, `description`, `kind`, `scope`, `status`).
- If validation fails, the memory is returned with synthetic `status: parse_error` and is **excluded from ALL injection and recall paths**.
- The caller still sees the raw content (for debugging), but the memory is quarantined.
- Parse failures log via `crane_memory_invoked(event: 'parse_error')`.
- `/memory-audit` check #7 surfaces the quarantined count.

### Recovery

Captain fixes the frontmatter manually via `crane_memory(update)` or directly via `crane_note`, then validates with `/memory-audit` — the next run moves the memory back to its proper status.

## Cross-venture propagation

Memories with `scope: enterprise` or `scope: global` are visible to every venture via the shared crane-context D1. No separate sync path is required — `crane_memory` queries the same backend regardless of which venture the calling agent is in. A memory authored during a `ke-console` session is immediately available in the next `dfg-console` session's SOS (subject to the captain_approved gate).

Venture-scoped memories (`scope: venture:ke`) are filtered out of other ventures' queries automatically.

The `crane_memory` MCP tool itself is distributed via the existing crane-mcp package pipeline — every venture already consumes it. No new sync step.

## Staleness alarm in SOS

`/sos` checks the last-run timestamp of `/memory-audit`:

- **>30 days**: surface "Memory system unaudited for N days — run `/memory-audit`."
- **>60 days**: **pause** always-on Critical Anti-Patterns injection. Replace the section with a single line: "Memory system unaudited for N days. Anti-pattern injection paused. Run `/memory-audit`."

Stale memory is worse than no memory. The pause-after-60-days behavior is the system enforcing its own hygiene — if the Captain doesn't maintain the corpus, the system gracefully disables the injection that depends on the corpus being current.

## Adding a new memory

1. Prefer the automated capture paths (`/eos`, `/save-lesson`, `/code-review` extract). Only write memories manually via `crane_memory(save)` when those paths don't fit.
2. Fill out the frontmatter using the schema above.
3. Default `status: draft` unless writing through `/eos` or `/code-review` accept (which set `stable + captain_approved: true` directly).
4. Run the 3 memoryability tests mentally before saving — if any fails, reconsider whether this is a memory or just a log entry.
5. `crane_memory(save)` writes the note and tags it. That's it. Promotion is handled by the audit cadence.

## Deferred (not yet implemented)

The following governance features are planned but not in this session's landing:

- **Memory-review linter** — a counterpart to `/skill-review` that lints a memory's frontmatter ahead of save. Today, `crane_memory(save)` validates; a pre-save CLI linter would give faster feedback on batch-authoring workflows.
- **Structured storage migration** — memories currently live as frontmatter-in-content in the notes table. If the corpus grows to thousands of rows, migrate to dedicated columns via a backfill migration. Out of scope for v1.
- **Per-venture memory reviewers** — the `captain_approved` gate is a single global reviewer today. If per-venture reviewers become useful, extend `owner` to be a per-venture role rather than just `captain` or `agent-team`.

See `docs/memory/deprecated.md` (created when first memory is deprecated) for the deprecation log.
