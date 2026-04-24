---
title: 'Spacing rhythm'
sidebar:
  order: 6
---

# Spacing rhythm

**Status.** Active · **Authored.** 2026-04-16 (SS) · **Promoted.** 2026-04-24

## Problem

Raw Tailwind spacing classes (`p-6`, `gap-3`, `py-8`) are unnamed. The drift is not "out of scale" — raw values live on a scale — it's "no rhythm names, so every card picks its own." The audit counted ~1,000 raw Tailwind spacing tokens across SS's codebase. None arbitrary, but all unnamed.

Without named rhythm tokens, `p-6` means "a generous padding" to one author and "probably the right default" to another. Neither reasoning produces consistency.

## Solution

Vertical gaps between sibling sections and padding on cards/surfaces resolve to four named rhythm tokens. Raw `gap-*`, `py-*`, `px-*` with arbitrary integers are banned in governed contexts.

| Token           | Value | Use                               |
| --------------- | ----- | --------------------------------- |
| `space-section` | 32px  | Gap between major page sections   |
| `space-card`    | 24px  | Card internal padding             |
| `space-row`     | 12px  | Gap between rows in a list        |
| `space-stack`   | 16px  | Vertical stack of sibling content |

**Do:** use semantic tokens (`p-card`, `gap-stack`, `mt-section`) where Tailwind utilities support them. Extend the scale when a clearly distinct rhythm emerges.

**Don't:** use raw `p-6` or `gap-4` in governed surfaces. The rule is about vocabulary, not numeric values.

## Enterprise-wide integration

SS's four tokens are the proposed enterprise spacing rhythm. Phase 5's `@venturecrane/tokens` package carries them as `--{prefix}-space-{name}` CSS custom properties. Per-venture overrides are allowed at the pixel-value level; the _names_ are shared.

## Examples

**Anti-pattern.** A card styled with `bg-white rounded-lg border p-6 gap-3` — works, but every other card on the surface does it slightly differently. No reader recognizes the pattern.

**Correct pattern.**

```astro
<div class="bg-[color:var(--color-surface)] rounded-card border p-card">
  <h2 class="text-heading">Overview</h2>
  <div class="mt-stack">...</div>
</div>
```

## Cited authority

- [IBM Carbon spacing](https://carbondesignsystem.com/guidelines/spacing/overview/)
- [Material 3 layout](https://m3.material.io/foundations/layout/understanding-layout/overview)

## Detection

`ui-drift-audit` Spacing (arbitrary / token) columns. Same enforcement shape as [Pattern 05](05-typography-scale.md).

## Provenance

Promoted from SS `docs/style/UI-PATTERNS.md` Rule 6 (closes #703 for this pattern).
