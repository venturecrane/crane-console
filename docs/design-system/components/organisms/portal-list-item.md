---
title: 'Portal list item'
sidebar:
  order: 1
---

# Portal list item

**Classification.** Organism.

## Implementations

- **SS** — `~/dev/ss-console/src/components/portal/PortalListItem.astro`. The canonical implementation. `variant: 'status' | 'document'`. Renders row with title, meta caption, status pill or document icon, chevron. Consumes tokens from SS's design system.

## Consolidation status

**SS-only.** Non-shared by design. The component was extracted at SS to solve hand-rolled-list-row drift across Prospect / Invoice / Document list surfaces. Analog surfaces in other ventures (KE expense list, DC draft list) should extract equivalent primitives, not import SS's component directly — ventures have different row shapes (KE has mobile tap targets + amount prominence, DC has drag-handle affordances).

What IS shared: the **pattern** (see [07 — Shared primitives](../../patterns/07-shared-primitives.md)) — extract the first duplication, use variants for shape differences, never hand-roll per surface. SS's extraction is the worked example.

## Cross-references

- Pattern: [07 — Shared primitives](../../patterns/07-shared-primitives.md) — canonical case study
- Pattern: [01 — Status display by context](../../patterns/01-status-display-by-context.md) — list-row is the pill-legitimate context
- Pattern: [08 — Actions and menus](../../patterns/08-actions-and-menus.md) — row-action and overflow-menu placement

## Drift risks

- SS adding a third variant (`variant: 'compact'`, `variant: 'expanded'`) without splitting. Rule from Pattern 07: split when >5 conditionals key on variant or a third variant is needed.
- KE or DC hand-rolling list rows instead of extracting a venture-local primitive when the pattern appears twice. Enforcement via Phase 7 skill.
