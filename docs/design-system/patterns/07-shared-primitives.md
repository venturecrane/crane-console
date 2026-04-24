---
title: 'Shared primitives for repeated patterns'
sidebar:
  order: 7
---

# Shared primitives for repeated patterns

**Status.** Active · **Authored.** 2026-04-16 (SS) · **Promoted.** 2026-04-24

## Problem

AI generators produce each screen in isolation. Tokens unify colors and spacing; nothing unifies element _shape_. Without a shared primitive, list-row markup diverges on every regeneration — different status pills, date formats, CTA positions — even when every surface "uses the design system."

Class-reorder evasion means a "no forbidden markup string" test cannot defend against drift. The only durable contract is a named component that every surface must import.

## Solution

When the same visual element appears on multiple surfaces, it renders through a shared component. The component is the enforcement; prose rules about "use tokens" and "match the design system" do not survive multiple generations of AI-authored screens without a code contract behind them.

**Do:** extract the first duplication into a shared component. Import it everywhere the pattern repeats. Use variants (`variant: 'status' | 'document'`) for shape differences within the same underlying primitive.

**Don't:** hand-roll the markup on each new surface "for consistency" with some other screen. Tokens are necessary but not sufficient — the primitive must be a component.

**Escape hatch.** An explicit allowlist of file paths that truly cannot use the primitive (e.g., "milestone rail is a vertical timeline, not a list row"). Cap: **≤3 allowlist entries per primitive globally**. Exceeding the cap means the primitive is wrong — extend its variants or split, don't allowlist around.

**When to split.** A single primitive with variants is the default. Split into separate primitives only when more than ~5 conditionals key on `variant`, or when a third variant is needed. Don't pre-split.

## Examples

**Anti-pattern — hand-rolled list rows across portal surfaces.**

```tsx
<a href={...} class="block bg-white rounded-lg border border-slate-200 p-stack ...">
  <div class="flex items-center justify-between gap-stack">
    <span class={`inline-block px-2.5 py-0.5 rounded-full text-xs ${statusColorMap[status]}`}>
      {statusLabelMap[status]}
    </span>
    {/* ... */}
  </div>
</a>
```

Each portal surface (quotes, invoices, documents) authored this independently. Different class orderings, pill tints, date formats, CTAs. A grep-based test cannot catch the divergence.

**Correct pattern.**

```tsx
import PortalListItem from '../../../components/portal/PortalListItem.astro'
import { resolveInvoiceTone, resolveInvoiceLabel } from '../../../lib/portal/status'

{
  invoices.map((inv) => (
    <PortalListItem
      variant="status"
      href={`/portal/invoices/${inv.id}`}
      tone={resolveInvoiceTone(inv.status)}
      toneLabel={resolveInvoiceLabel(inv.status)}
      title={typeLabel[inv.type]}
      amountCents={Math.round(inv.amount * 100)}
      metaCaption={resolveMetaCaption(inv)}
    />
  ))
}
```

**SS-registered primitives (portal).**

- [`src/components/portal/PortalListItem.astro`](https://github.com/venturecrane/ss-console/blob/main/src/components/portal/PortalListItem.astro) — card-shell list row; `variant: 'status' | 'document'`.
- [`src/components/portal/StatusPill.astro`](https://github.com/venturecrane/ss-console/blob/main/src/components/portal/StatusPill.astro) — tone-based pill; consumes `Tone` from `status.ts`.
- [`src/components/portal/MoneyDisplay.astro`](https://github.com/venturecrane/ss-console/blob/main/src/components/portal/MoneyDisplay.astro) — dollar-figure renderer.

## Cited authority

- [Shopify Polaris](https://polaris.shopify.com/) — component system as the source of truth
- [IBM Carbon](https://carbondesignsystem.com/) — components, not tokens, are the contract
- [Atlassian Design System](https://atlassian.design/) — named components over "match the design"

## Detection

**Presence test.** Every list-index page (except detail surfaces) that iterates via `.map(` must render through the shared primitive. Defeats class-reorder evasion because _presence_ is required, not absence.

**No local helper redefinition.** No `const formatDate`, `const formatCurrency`, `const statusColorMap`, `const statusLabelMap`, or `const typeLabels` in governed index files. Helpers live in the shared library.

Both tests auto-enroll new files. Exceptions go in an explicit allowlist with inline rationale. See SS's [`tests/forbidden-strings.test.ts`](https://github.com/venturecrane/ss-console/blob/main/tests/forbidden-strings.test.ts) for the canonical implementation.

## Enterprise-wide integration

Phase 6's components catalog (`docs/design-system/components/`) maps every venture's primitives. Phase 7's enforcement skill extends `ui-drift-audit` with shared-primitive detection across all ventures (Rule 7 is the 7th rule currently missing from the v1.0.0 skill).

## Provenance

Promoted from SS `docs/style/UI-PATTERNS.md` Rule 7 (closes #703 for this pattern).
