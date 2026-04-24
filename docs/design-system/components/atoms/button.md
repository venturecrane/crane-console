---
title: 'Button'
sidebar:
  order: 1
---

# Button

**Classification.** Atom.

## Implementations

- **VC** — Astro button classes in `src/styles/global.css`, applied inline. No shared `Button.astro` component. Tailwind utilities with `bg-vc-accent` / `border-vc-border`.
- **KE** — `~/dev/ke-console/src/components/ui/button.tsx` (shadcn/ui base with venture token mapping). Variants: default, outline, ghost, destructive.
- **DC** — `~/dev/dc-console/src/components/ui/button.tsx`. Same shadcn/ui base as KE; DC-scoped Tailwind tokens.
- **SS** — Inline button classes in portal and marketing pages; no shared primitive yet.

## Consolidation status

Non-shared. Each venture implements its own. Not a candidate for consolidation — visual identity per venture is a design requirement, and shadcn/ui is already the de-facto substrate for Next.js ventures (KE, DC).

What IS shared enterprise-wide: the **hierarchy rule** (see [Pattern 03](../../patterns/03-button-hierarchy.md)) — one primary per view, destructive actions visually distinct.

## Cross-references

- Pattern: [03 — Button hierarchy](../../patterns/03-button-hierarchy.md)
- Pattern: [08 — Actions and menus](../../patterns/08-actions-and-menus.md) (row actions, toolbars, overflow menus)
- Token: Accent color (`--{prefix}-color-accent` in [@venturecrane/tokens](https://github.com/venturecrane/crane-console/tree/main/packages/tokens))

## Drift risks

- Inline button classes in VC and SS — if variants multiply, extract into a venture-local `Button` primitive before patterns get restated per-surface.
- shadcn/ui upstream changes — KE and DC independently upgrade; version drift between them is expected and acceptable.
