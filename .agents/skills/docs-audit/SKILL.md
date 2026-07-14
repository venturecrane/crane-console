---
name: docs-audit
description: Monthly docs site drift report. Walks site-published docs/ directories for broken references, deprecated entity mentions, structural drift, and git staleness.
version: 1.0.1
scope: enterprise
owner: captain
status: stable
depends_on:
  mcp_tools:
    - crane_docs_drift_audit
    - crane_schedule
---

# /docs-audit - Monthly Docs Site Drift Report

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "docs-audit")`. This is non-blocking — if the call fails, log the warning and continue.

Run a drift audit across the site-published `docs/` directories that ship to the crane-command Starlight site. Surfaces broken internal references, references to deprecated entities, sidebar drift, and stale narrative content. Complements `/docs-refresh` (structural — TBDs, line counts) and `/context-refresh` (D1 sync, exec summaries) by catching semantic decay.

## Usage

```
/docs-audit
```

No arguments required. The audit walks every site-published directory under `docs/`.

## What it checks

| Check                         | Severity | What it surfaces                                                                                                 |
| ----------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| **Dead internal links**       | ERROR    | Markdown links `[x](path.md)` whose target doesn't exist (AST-parsed, skips code blocks)                         |
| **Broken `crane_doc()` refs** | ERROR    | `crane_doc('scope', 'name')` calls in CLAUDE.md, skills, commands, and docs whose target file is missing on disk |
| **Deprecated skill mentions** | WARN     | Slash-form references like `/old-skill` to skills with `status: deprecated`                                      |
| **Stale-by-git**              | INFO     | Site-published files untouched in git for > 180 days                                                             |
| **Sidebar drift**             | INFO     | `astro.config.mjs` `autogenerate` directories that don't exist or are empty on disk                              |
| **Captain-review candidates** | INFO     | Subset of stale-by-git: narrative content (no TBD/auto-gen markers) the audit can't verify                       |

Self-diagnostic ERROR: if `astro.config.mjs` extraction returns zero `autogenerate` entries, the tool emits an `audit-tool-broken` ERROR rather than silently producing a clean report.

## Workflow

### Step 1: Run the audit

Call the MCP tool:

```
crane_docs_drift_audit()
```

Default parameters:

- `stale_threshold_days`: 180
- `severity_filter`: all
- `scope`: undefined (walks every site-published subdir)

Narrow the scope to a single directory if iterating on a specific area:

```
crane_docs_drift_audit(scope: "runbooks")
crane_docs_drift_audit(scope: "ventures/vc")
```

### Step 2: Interpret the report

**Errors** — block site truth. Each entry shows the file, line, and the broken reference. Fix in a PR; do not record completion until cleared (or accepted as known and tracked elsewhere).

**Warnings** — deprecated-skill mentions. Either update the doc to reference the replacement skill, or — if the deprecated skill is being kept around — note the exception. Open a PR with the fixes.

**Info findings** — read for signal, no immediate action required.

- _Stale-by-git_: a file hasn't been touched in 180+ days. May still be accurate; the audit can't tell.
- _Captain-review candidates_: a Captain-only check. The audit flags narrative content untouched > threshold for human verification of accuracy.
- _Sidebar drift_: `astro.config.mjs` references a directory that's missing or empty. Either fix the config or restore the directory.

If you see `audit-tool-broken`, treat the report as incomplete. Fix the self-diagnostic before trusting other findings.

### Step 3: Record completion

```
crane_schedule(
  action: "complete",
  name: "docs-audit",
  result: "<success | failure>",
  summary: "<N docs audited, X errors / Y warns / Z infos>"
)
```

**Result mapping** (diverges from `/skill-audit` and `/memory-audit`):

- `success` — the audit ran cleanly and produced a valid report. **Drift count does not affect the result.**
- `failure` — only on tool error or `audit-tool-broken` self-diagnostic.

This is intentional: conflating "audit ran" with "drift exists" trains operators to either ignore failures or rush to clear them. Drift counts go in the `summary` field where they belong.

## Cadence

Monthly cadence (`schedule_items` name: `docs-audit`). Surfaces in the `/sos` briefing when due.

## Notes

- **Scope**: `docs/` in this repo only. Venture-repo READMEs and `.design/` files are out of scope (they have different decay modes; cross-repo audit is a separate concern).
- **No auto-fix in v1**. The tool is report-only. Auto-fixing dead links is brittle (rename vs. delete is non-obvious); deprecated-mention rewriting risks losing context.
- **Markdown parsing** uses the `remark` AST. Code blocks, inline code spans, and reference-style links are handled correctly.
- **`astro.config.mjs` parsing** evaluates the config in a Node subprocess (`import()` ESM), not regex. Robust against config refactors.
- **Git mtime** is collected via a single `git log` pass for the whole `docs/` tree, not per-file subprocesses.
