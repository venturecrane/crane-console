---
title: 'Redundancy ban: one signal per fact'
sidebar:
  order: 2
---

# Redundancy ban: one signal per fact

**Status.** Active · **Authored.** 2026-04-16 (SS) · **Promoted.** 2026-04-24

## Problem

A single fact — "this invoice is paid" — gets rendered two, three, or four times on the same surface. A pill says "Paid," a caption says "Paid in full," a subtitle says "Paid {date}." The fact is one; the renderings are noise. Cognitive load goes up without adding information.

AI-generated surfaces are particularly prone to this — each generation pass adds another rendering, the earlier passes don't get removed.

## Solution

A single fact gets exactly one rendering. Pick the richest one.

**Do:** render state in the most informative form the surface allows. A prose confirmation with a date is better than a pill, a tinted date line, and a bordered block all saying "Signed."

**Don't:** place a pill next to text that states the same status in words. Don't stack confirmations.

When multiple treatments are visible, apply the [context rule from Pattern 01](01-status-display-by-context.md): list rows earn pills; detail pages earn prose; don't mix within one region.

## Examples

**Anti-pattern — triple redundancy in invoice detail card.**

`~/dev/ss-console/src/pages/portal/invoices/[id].astro:450-461` renders a "Paid" pill, a "Paid in full" caption under the amount, AND a "Paid {date}" confirmation paragraph.

**Correct pattern.**

```astro
<MoneyDisplay amountCents={amountCents} size="display" />
<p class="mt-2 text-[color:var(--color-complete)] text-caption">Paid {paidShortDate}.</p>
```

Pill removed. "Paid in full" removed (amount display carries it). Single prose confirmation with the date. The complete-tone color carries semantic, not a bordered shape.

**Anti-pattern — pill over confirmation block.**

`~/dev/ss-console/src/pages/portal/quotes/[id].astro:458-497` renders a "Signed" pill above a richer "Signed {date}" confirmation block. The confirmation is more informative; the pill is redundant. Fix: drop the pill when the signed state is active.

## Cited authority

- Shopify Polaris — ["Don't use badges as a substitute for normal text."](https://polaris.shopify.com/components/feedback-indicators/badge)
- Atlassian on lozenges — ["Lozenges are not labels for generic metadata."](https://atlassian.design/components/lozenge/usage)
- NN/g on redundancy — ["Repetition of the same status in multiple visual treatments increases cognitive load without adding information."](https://www.nngroup.com/articles/ui-copy/)

## Detection

`ui-drift-audit` Redundancy column — tinted pill whose status-keyword content is echoed in ±10 lines of surrounding prose.

## Provenance

Promoted from SS `docs/style/UI-PATTERNS.md` Rule 2 (closes #703 for this pattern).
