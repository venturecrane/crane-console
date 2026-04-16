---
description: Run just the drift audit (Phase 2 of author). Produces a standalone drift report without drafting or modifying NAVIGATION.md. Useful for quarterly reviews and to answer "has drift crept back in?"
---

# Audit navigation drift

Standalone workflow. Phases 1–2 of `author.md`, plus save to disk.

## Steps

1. Intake (same as author Phase 1 — abbreviated version is fine if a NAVIGATION.md already exists and we only need its `spec-version` for comparison).
2. Scan live code and generated artifacts (same as author Phase 2).
3. Emit the two matrices and the drift-summary bullets.
4. If `.stitch/NAVIGATION.md` exists, add a third matrix: **Spec compliance** — does the live code match the spec? For each deviation, note whether it's a code-refactor follow-up or a spec-revision follow-up.
5. Save to `.stitch/drift-audit-<YYYY-MM-DD>.md`.

## Output template

```markdown
# Drift audit — <venture> — <YYYY-MM-DD>

spec-version checked against: <N or "no spec">

## Live code matrix

<table>

## Generated artifact matrix

<table>

## Spec compliance matrix (if NAVIGATION.md exists)

| File | Rule violated | Severity (cosmetic/semantic/structural) | Action (code/spec) |

## Drift summary (4-6 bullets)

<the inconsistencies that matter>

## Follow-ups

<numbered list of actions, each with an owner and scope>
```

## When to run

- **Quarterly** — catch slow drift.
- **After a major surface addition** — new top-level area may need a new appendix.
- **Before releasing a new design token set** — token changes cascade into state conventions.
- **When a PR touches `src/layouts/*` or `src/components/**/_{Nav,Header}_`\*\* — gatekeep nav refactors.
