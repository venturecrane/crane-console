---
name: verify-audit
description: Weekly audit over the verify_ledger. Surfaces coverage gaps, override frequency, integrity samples, truncation drift, source distribution, and recurring-command memory candidates. Read-only by default; --apply drafts memory lessons.
version: 1.0.1
scope: enterprise
owner: captain
status: stable
depends_on:
  mcp_tools:
    - crane_verify_audit
    - crane_memory
    - crane_schedule
---

# /verify-audit - Weekly Verify-Ledger Audit

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "verify-audit")`. This is non-blocking — if the call fails, log the warning and continue.

Invoke the `crane_verify_audit` MCP tool and walk through the report.

## How to run

```
/verify-audit
```

Defaults to a 7-day window, read-only (no memory drafts created), uses the cached snapshot when fresh.

## What it checks

Eight sections drawn from `verify_ledger`, `verify_files`, and `handoffs`:

| Section                          | What it surfaces                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Coverage gap (windowed)**      | Surface-class files touched in the audit window with no `verify_ledger` row in the same window.                               |
| **Unverified surface files**     | Surface-class files with **zero** `verify_files` rows in the entire ledger history — long-lived gaps.                         |
| **Override audit (Layer 4b/4c)** | Count of handoffs marked `done` whose payload includes `override_pr_merge_gate=true` or `override_verify_coverage_gate=true`. |
| **Integrity samples**            | N random rows from the window with structural checks (scrubber consistency, truncation marker presence).                      |
| **Truncation drift**             | Rows where `output_truncation != 'none'` AND `output_redacted = 1` — potential evidence loss.                                 |
| **Source distribution**          | Manual / tool / hook breakdown. A 0 in `hook` while surfaces were touched suggests the PreToolUse hook isn't firing.          |
| **Memory candidates**            | Recurring `(command_hash, repo)` tuples appearing ≥3× in window with `method: fresh_process`. Nominees for memory promotion.  |

## Options

```
/verify-audit --apply               # draft memory lessons from candidates (status=draft, captain_approved=false)
/verify-audit --window 14           # 14-day window (max 90)
/verify-audit --max 10              # raise the candidate cap (server enforces ≤20)
/verify-audit --fresh               # bypass the 8h cached snapshot and recompute
```

Combine flags as needed: `/verify-audit --apply --window 14 --fresh`.

## Memory promotion path (--apply)

When `--apply` is set:

1. Each `memory_candidate` becomes a draft memory note via `crane_memory.save`:
   - `name`: `recurring-command-<command_hash[0:8]>-<repo-slug>-<YYYYMMDD>` (deterministic; idempotent on re-run)
   - `kind`: `lesson`
   - `scope`: `enterprise`
   - `owner`: `agent-team`
   - `status`: `draft`
   - `captain_approved`: `false`
   - `evidence_verify_ids`: `[verify_ids…]` (Prong 3 frontmatter field; rendered inline in `/memory-audit`)
   - `applies_when.files`: union of `files_touched` across the recurrences
2. Drafts surface in the next `/memory-audit` run under **Pending Captain Approval** with the verify-ledger lineage shown.
3. Captain approves via `crane_memory(action: "update", id: <id>, captain_approved: true)` to make the memory eligible for SOS injection.

Skipped instead of created when:

- A draft with the same name already exists (idempotent)
- The body fails the three memoryability checks (Actionable / Non-obvious / General)

## Cadence semantics

Result is `warning` when any section is non-empty (something to review), `success` when all sections are clean. Mirrors `/skill-audit` and `/memory-audit` — divergence from `/docs-audit`, which is `success` regardless of drift count.

## What's NOT in this audit

- **Skip-label PR audit** (`skip-eos-gate`, `skip-verify-gate`). Those labels live on GitHub PRs, not in this DB. Per-repo manual probe:
  ```
  gh pr list --search "label:skip-eos-gate is:merged" --repo venturecrane/<repo> --limit 10
  gh pr list --search "label:skip-verify-gate is:merged" --repo venturecrane/<repo> --limit 10
  ```
- **Re-running stored `command` for output integrity**. Out of scope — re-executing arbitrary stored commands is unsafe to automate.
- **Fuzzy claim-text similarity**. v1 uses `(command_hash, repo)` exact-match grouping. Add fuzzy matching when a real corpus shows it's missing recurrences this misses.

## Full workflow

See `.agents/skills/verify-audit/SKILL.md` for the full step-by-step workflow.
