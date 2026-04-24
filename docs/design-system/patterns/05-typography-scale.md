---
title: 'Typography scale'
sidebar:
  order: 5
---

# Typography scale

**Status.** Active · **Authored.** 2026-04-16 (SS) · **Promoted.** 2026-04-24

## Problem

Every inline `text-[Npx]` is a declaration that this particular instance is outside the system. When a codebase accumulates dozens of arbitrary sizes across pages, there is no consistent scale — each screen picks its own typography.

SS's audit found 32 arbitrary sizes in one portal page and 27 in another. Aggregate effect: no pattern a reader can recognize.

## Solution

Every user-visible text node resolves to one of seven named scale tokens. Arbitrary `text-[Npx]` and raw Tailwind `text-xs/sm/base/lg/xl/...` are banned in governed contexts.

| Token          | Size / LH                                | Weight | Use                           |
| -------------- | ---------------------------------------- | ------ | ----------------------------- |
| `text-display` | 32px / 40px                              | 700    | Page hero                     |
| `text-title`   | 20px / 28px                              | 700    | Section heading, card title   |
| `text-heading` | 16px / 22px                              | 600    | Sub-section heading           |
| `text-body-lg` | 18px / 28px                              | 400    | Lead paragraph                |
| `text-body`    | 15px / 24px                              | 400    | Default body                  |
| `text-caption` | 13px / 18px                              | 500    | Metadata, dates, status prose |
| `text-label`   | 12px / 16px (uppercase, 0.08em tracking) | 600    | Eyebrow, section label        |

**Do:** use semantic tokens (`text-display`, `text-body`, `text-caption`) at every text node. When a new typographic need emerges, extend the scale — don't use arbitrary values as an escape hatch.

**Don't:** inline `text-[18px]` or `text-lg`. Both defeat the scale — the first is arbitrary, the second is a raw Tailwind token that doesn't carry semantic meaning.

## Enterprise-wide integration

SS's seven tokens are the proposed enterprise scale. Phase 5's `@venturecrane/tokens` package carries them as `--{prefix}-text-size-{name}` CSS custom properties, mapped to Tailwind `@theme` utilities. Per-venture overrides are allowed at the size/LH/weight level; the _names_ are shared.

## Examples

**Anti-pattern.**

`~/dev/ss-console/src/pages/portal/quotes/[id].astro:207-220` uses inline `text-[13px] leading-[18px]` and `text-[32px] sm:text-[42px] leading-tight` pervasively. 32 arbitrary sizes in one file.

**Correct pattern.**

```astro
<p class="text-label uppercase text-[color:var(--color-meta)]">Proposal</p>
<h1 class="mt-3 text-display font-bold text-[color:var(--color-text-primary)]">
  {engagementTitle}
</h1>
<p class="mt-5 text-body-lg text-[color:var(--color-text-secondary)] max-w-2xl">
  {engagementSubtitle}
</p>
```

## Cited authority

- [Material 3 type scale](https://m3.material.io/styles/typography/type-scale-tokens)
- [IBM Carbon typography](https://carbondesignsystem.com/guidelines/typography/overview/)

## Detection

`ui-drift-audit` Typography (arbitrary / token) columns. Arbitrary values are hard violations. Raw Tailwind tokens are pre-remediation informational; once a surface is converted, ESLint/grep bans inline `text-[...]` in that surface.

## Provenance

Promoted from SS `docs/style/UI-PATTERNS.md` Rule 5 (closes #703 for this pattern).
