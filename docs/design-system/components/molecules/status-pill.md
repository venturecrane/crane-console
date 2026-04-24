---
title: 'Status pill'
sidebar:
  order: 1
---

# Status pill

**Classification.** Molecule.

## Implementations

- **SS** — `~/dev/ss-console/src/components/portal/StatusPill.astro`. Tone-based pill; consumes `Tone` type from `src/lib/portal/status.ts`. Variants include `Signed`, `Paid`, `Pending`, `Draft`, etc.
- **KE** — `~/dev/ke-console/src/components/StatusBadge.tsx`. Status of expense entries (Pending review, Approved, Rejected). Uses KE accent + error tokens.
- **VC** — No pill primitive. Article tags use tagged-text styling, not pill.
- **DC** — Inline pill markup in toolbar/status areas; no shared primitive.

## Consolidation status

**SS's StatusPill is the reference implementation** of the shape. Not suitable for direct extraction into a cross-venture package — each venture has different status vocabularies, tone mappings, and brand color overrides. What's shareable is the _shape contract_:

- One visual treatment (rounded-full with tinted background and foreground)
- Tone driven by status vocabulary (no hardcoded color map in the component — tone resolves via a `resolveTone(status)` function in a per-venture lib)
- Small size; used in list-row context per [Pattern 01](../../patterns/01-status-display-by-context.md)

When KE's StatusBadge and DC's inline pills drift further from this shape, consolidation becomes harder. Keep the shape aligned even while venture vocabularies diverge.

## Cross-references

- Pattern: [01 — Status display by context](../../patterns/01-status-display-by-context.md)
- Pattern: [02 — Redundancy ban](../../patterns/02-redundancy-ban.md) — don't render a pill next to prose restating the same fact
- Pattern: [07 — Shared primitives](../../patterns/07-shared-primitives.md) — SS's extraction is the case study

## Drift risks

- Inline pill markup proliferating in DC and SS non-portal surfaces. Extract before the same pattern exists in ≥3 files.
- Tone color differences across ventures (SS uses `--color-complete` for "paid"; KE uses `--ke-success`). That's acceptable per-venture; the shape shouldn't diverge.
