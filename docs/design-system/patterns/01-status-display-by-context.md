---
title: 'Status display by context'
sidebar:
  order: 1
---

# Status display by context

**Status.** Active · **Authored.** 2026-04-16 (SS) · **Promoted.** 2026-04-24

## Problem

Product surfaces display state in many places: list rows, detail pages, dashboard cards, above titles as categories. When every state uses the same visual treatment — a pill, usually — the pill loses its meaning. "Proposal" (a document category that never changes) ends up looking identical to "Signed" (a state that does change). The user can't tell which labels are actionable.

Ad-hoc surfaces reinvent this rule differently on every screen. Fixing them individually doesn't compound.

## Solution

A status signal uses one of four treatments, chosen by **context**, not preference. Never interchanged.

| Context                        | Treatment                     | Purpose                                    |
| ------------------------------ | ----------------------------- | ------------------------------------------ |
| **List row, dense repeating**  | Pill                          | Scan-time discrimination across many items |
| **Category label above title** | Eyebrow (small-caps, muted)   | Document category or section kind          |
| **Single-item dashboard card** | Dot + label OR prose          | Glanceable state without visual weight     |
| **Detail-page headline**       | Prose in headline or subtitle | State IS the page identity                 |

**Do:** pick the treatment by the row-vs-detail-vs-category distinction. A detail page about a signed document displays "Signed" in prose, not as a chip.

**Don't:** reuse the pill for both "Proposal" (a non-state category) and "Signed" (an actual state) in the same surface. If pills are in play for state, eyebrows must carry the categories.

## Examples

**Anti-pattern — category eyebrow misused as pill.**

`~/dev/ss-console/src/pages/portal/quotes/[id].astro:207-210` wraps the word "Proposal" (a document category that never changes) in a rounded-full tinted chip. The same file uses a pill for actual status 250 lines later. From the user's view, both look identical.

**Correct pattern.**

```astro
<p class="text-[color:var(--color-meta)] text-label uppercase">Proposal</p>
<h1 class="mt-3 text-display font-bold text-[color:var(--color-text-primary)]">
  {engagementTitle}
</h1>
```

Eyebrow for category, pill reserved for state. `text-label` is the typography token from [Pattern 05](05-typography-scale.md).

## Cited authority

- Material 3 — ["Chips help people enter information … don't use chips as decoration."](https://m3.material.io/components/chips/guidelines)
- Shopify Polaris on badges — ["Use badges to indicate the status of an object. Don't use badges as a substitute for normal text."](https://polaris.shopify.com/components/feedback-indicators/badge)
- NN/g — ["Labels and tags are scan-time affordances, not decorative categorization."](https://www.nngroup.com/articles/ui-labels/)

## Detection

`ui-drift-audit` Pills column cross-referenced with page archetype (list vs detail). See [tooling L7](../current-state.md#enterprise-level-assets).

## Provenance

Promoted from SS `docs/style/UI-PATTERNS.md` Rule 1 (closes #703 for this pattern).
