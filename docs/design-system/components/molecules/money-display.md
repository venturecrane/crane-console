---
title: 'Money display'
sidebar:
  order: 2
---

# Money display

**Classification.** Molecule.

## Implementations

- **SS** — `~/dev/ss-console/src/components/portal/MoneyDisplay.astro`. Renders currency amounts in cents. Variants: `display` (hero size), `default`, `caption`. Handles locale formatting via `formatCentsToCurrency` in `src/lib/portal/formatters.ts`.
- **KE** — Inline currency formatting in `ExpenseCard.tsx`, using `Intl.NumberFormat` directly. No shared primitive.
- **DC** — No currency concept; billing is upstream in a different surface.
- **VC** — No currency concept.

## Consolidation status

SS has a shared primitive; KE inline. **Candidate for consolidation** within KE (whenever ExpenseCard-like surfaces multiply). Not cross-venture — SS's dollar-figures are B2B revenue amounts; KE's are small personal expenses. Formatting needs differ at the edges (SS always shows cents; KE rounds under $1).

What's shareable is the **treatment per context**:

- Hero-size (`text-display` token) when the amount IS the page's primary fact
- Default-size for card listings (`text-body-lg` or `text-title`)
- Caption-size when the amount is secondary metadata (`text-caption`)

This mirrors [Pattern 01](../../patterns/01-status-display-by-context.md)'s treatment-by-context logic.

## Cross-references

- Pattern: [01 — Status display by context](../../patterns/01-status-display-by-context.md) — same "treatment by context" shape, applied to currency instead of status
- Pattern: [05 — Typography scale](../../patterns/05-typography-scale.md) — size tokens drive the variant

## Drift risks

- Inline currency formatting proliferating in KE. Extract to a `MoneyDisplay` primitive when the second screen needs the same variants.
- Locale/currency handling inconsistency — SS uses `Intl.NumberFormat('en-US', { currency: 'USD' })`; KE should do the same until a non-USD use case emerges.
