---
title: 'Expense card'
sidebar:
  order: 2
---

# Expense card

**Classification.** Organism.

## Implementations

- **KE** — `~/dev/ke-console/src/components/ExpenseCard.tsx`. Card displaying one expense entry: amount (money-display), category badge, date, description, optional receipt thumbnail. Tap-to-open row action; overflow menu with Edit / Re-categorize / Delete.

## Consolidation status

**KE-only.** Expenses are a KE-specific concept; other ventures don't have analog surfaces.

What IS generalizable from ExpenseCard: the **card organism shape** — title row + primary amount/value + supporting metadata + trailing action affordance. Similar shapes elsewhere:

- SS `PortalListItem` with `variant: 'document'` — same card shape, different payload
- DC timeline-entry cards in editor surfaces
- A future VC blog card (if VC adds dated article cards beyond the current index layout)

These analogs should be factored per venture, but follow the same landmark structure (title → primary value → metadata → action) documented in [Pattern 08](../../patterns/08-actions-and-menus.md).

## Cross-references

- Pattern: [07 — Shared primitives](../../patterns/07-shared-primitives.md) — the extract-first-duplication rule
- Pattern: [08 — Actions and menus](../../patterns/08-actions-and-menus.md) — row action + overflow placement
- Component: [Money display](../molecules/money-display.md) — the amount rendering
- Component: [Status pill](../molecules/status-pill.md) — the category/status affordance
- Token: KE surface + spacing tokens via [@venturecrane/tokens](https://github.com/venturecrane/crane-console/tree/main/packages/tokens)

## Drift risks

- Second KE surface needing similar card (e.g., category detail view) — extract a `ValueCard` or similar primitive before the shape is re-authored.
- Action placement diverging from Pattern 08 — inline "Delete" button anywhere is a violation.
