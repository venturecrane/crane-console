---
name: docs-refresh
description: Update managed-block content on crane-command venture pages from canonical sources (gh PRs and issues). Deterministic, no LLM in the loop. Audit, refresh, init-markers modes.
version: 1.0.0
scope: enterprise
owner: agent-team
status: stable
depends_on:
  mcp_tools:
    - crane_skill_invoked
  files:
    - config/docs-refresh.json
    - packages/crane-mcp/src/cli/docs-refresh.ts
---

# /docs-refresh - Enterprise Docs Refresh

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "docs-refresh")`. This is non-blocking — if the call fails, log the warning and continue.

Refresh managed-block content on the crane-command site (`docs/ventures/<code>/{product-overview,roadmap}.md`). Companion to `/docs-audit` (which detects drift) — this is the appliance that closes the loop.

The skill is a thin wrapper around `npm run docs-refresh -w @venturecrane/crane-mcp`. The CLI is deterministic Node.js — no LLM in the loop. It's safe to wire to a cron, and a weekly cron is already in `.github/workflows/docs-refresh.yml`.

## Usage

```
/docs-refresh                        # audit mode (no writes)
/docs-refresh <code>                 # refresh a venture's marked pages
/docs-refresh <code>/<page>          # refresh a single page
/docs-refresh <page-type>            # refresh page type across configured ventures
/docs-refresh --init-markers <code>  # seed markers (first-run, gate-bypassed)
/docs-refresh --dry-run <code>       # render but don't write
```

Behind every form, the skill runs:

```
npm run docs-refresh -w @venturecrane/crane-mcp -- <args>
```

## What it manages

Two page types carry markers in v1; metrics has no managed blocks (placeholder-preserving renderer is a no-op):

| Page type          | Markers                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product-overview` | `activity-shipped` (last 5 merged feat: PRs)                                                                                                      |
| `roadmap`          | `activity-current-focus` (status:in-progress issues), `activity-near-term` (status:ready issues), `activity-completed` (last 10 merged feat: PRs) |
| `metrics`          | (none in v1)                                                                                                                                      |

Per-venture query strategy lives in `config/docs-refresh.json`. Adding a venture means adding an entry there with `primaryRepo` and `labels`, then running `/docs-refresh --init-markers <code>` to seed the markers.

## What it does NOT touch

- **Build-time tokens** (`{{venture:CODE:FIELD}}`, `{{portfolio:table}}`, etc.). Those resolve in `site/scripts/sync-docs.mjs` at site build time and don't need a refresh step.
- **Captain-curated narrative** (sections that aren't managed blocks). Refresh has a structural diff gate that aborts if anything outside marker pairs changes.
- **Pages without markers.** Refresh warns-and-skips. Run `--init-markers <code>` first.
- **Sections whose content is a table or prose** (not a bullet list). The `--init-markers` step refuses to wrap incompatible structure and reports a warning. Captain can normalize the page (e.g., convert a table to a bullet list under `## Near-term`) and re-run init.

## Workflow

### Audit a venture's pages

```
/docs-refresh
```

Prints per-page report: line count, markers present vs. expected, missing markers. No writes. Use this to triage.

### Seed markers on a new venture

Add the venture to `config/docs-refresh.json`, then:

```
/docs-refresh --init-markers <code>
```

Inspect the diff before committing — `--init-markers` bypasses the structural gate (it has to, since markers don't exist yet). Warnings are emitted for any section that can't be safely wrapped (heading missing, content not a bullet list).

### Refresh content from canonical sources

```
/docs-refresh <code>
```

Walks the venture's marked pages, fetches gh data per `config/docs-refresh.json`, replaces marker bodies, and runs the structural diff gate (asserts marker set is unchanged and outside-marker content is byte-equal). Aborts with a named violation if the gate fails.

### Closed-loop weekly run

`.github/workflows/docs-refresh.yml` runs the refresh weekly (Monday 13:17 UTC) for every venture in `config/docs-refresh.json` and opens a PR if the diff is non-empty. No manual invocation needed for ongoing maintenance — the loop is closed.

## How the diff gate works

After rendering, the CLI asserts:

1. **Marker set equal across runs.** `parseMarkers(before).names === parseMarkers(after).names`. New marker insertion only happens via `--init-markers`.
2. **Outside-marker content byte-equal.** The bytes outside any marker pair must be identical. This catches renderer overreach (e.g., accidentally rewriting prose adjacent to a marker).

Gate failure exits 2 and names the violation. Init mode bypasses both checks.

## Configuration

`config/docs-refresh.json`:

```json
{
  "ventures": {
    "<code>": {
      "primaryRepo": "venturecrane/<repo>",
      "labels": { "in_progress": "status:in-progress", "ready": "status:ready" },
      "shippedSearch": "feat: in:title"
    }
  },
  "limits": { "shippedRecent": 5, "completedHistory": 10, "currentFocus": 10, "nearTerm": 10 }
}
```

Both vc (in `crane-console`) and dfg (in `dfg-console`) use the same `status:` label vocabulary. If a venture uses different labels, override per-venture.

## Failure modes

| Condition                                    | Behavior                                   | Exit |
| -------------------------------------------- | ------------------------------------------ | ---- |
| `config/docs-refresh.json` missing           | Throw                                      | 1    |
| Venture not in config                        | skip with reason                           | 0    |
| Page missing all markers                     | skip with reason; suggest `--init-markers` | 0    |
| Page missing some markers                    | refresh present markers; warn about absent | 0    |
| Diff gate violation                          | Print named violation; exit 2              | 2    |
| `gh` CLI failure                             | Throw with `gh` stderr                     | 1    |
| Malformed marker (unclosed/nested/duplicate) | Throw with line number                     | 1    |

## Notes

- **Token vocabulary is unchanged.** `site/scripts/sync-docs.mjs` already supports every fact-zone field — `{{venture:CODE:FIELD}}` resolves both top-level and `portfolio.*` fields. No resolver extension was needed for v1.
- **Only bullet-list sections are wrapped.** This is intentional. Tables and prose require Captain decisions about structure that the renderer can't safely make.
- **Source code:** `packages/crane-mcp/src/cli/docs-refresh.ts` (44 unit + integration tests in the sibling `.test.ts`).
