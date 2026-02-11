# Deprecated — Executive Summaries Moved to VCMS Notes

The markdown files in this directory are **kept for git history only**.

The canonical source for executive summaries is now the VCMS notes table
(D1), tagged with `executive-summary`. Agents receive them automatically
via the `/sod` flow.

To view or update an executive summary:

```
crane_notes(tag: "executive-summary")           # list all
crane_note(action: "update", id: "...", ...)    # update one
```

Migrated: 2026-02-11
