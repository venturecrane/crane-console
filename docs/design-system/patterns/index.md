---
title: 'Patterns'
sidebar:
  order: 0
---

# Design System Patterns

Cross-venture UX problem / solution pairs. Each pattern documents one recurring design decision — the shape the answer takes, the reason, and real implementations. Patterns are the Layer 4 artifact in the [eight-layer design system](../enterprise-scoping.md).

## Format

Every pattern follows [Shopify Polaris's structure](https://polaris-react.shopify.com/patterns): **Problem → Solution → Examples**, plus **Cited authority** (public URLs, no invented "best practices") and **Provenance** (which venture's working code seeded the pattern).

## Current patterns

Patterns 1-7 were promoted from [SS `docs/style/UI-PATTERNS.md`](https://github.com/venturecrane/ss-console/blob/main/docs/style/UI-PATTERNS.md) where they were authored, cited, and enforced by `ui-drift-audit`. Promotion moves them into enterprise scope; SS continues to enforce locally but now points to these as canonical.

- [01 — Status display by context](01-status-display-by-context.md)
- [02 — Redundancy ban: one signal per fact](02-redundancy-ban.md)
- [03 — Button hierarchy: one primary per view](03-button-hierarchy.md)
- [04 — Heading skip ban](04-heading-skip-ban.md)
- [05 — Typography scale](05-typography-scale.md)
- [06 — Spacing rhythm](06-spacing-rhythm.md)
- [07 — Shared primitives for repeated patterns](07-shared-primitives.md)

Pattern 8 is the first authored directly in enterprise scope (not promoted). Authored under the process defined in the [Phase 3 proposal](../proposal.md) to answer the SS Prospect-view row-action question that originated this initiative.

- [08 — Actions and menus](08-actions-and-menus.md)

## Contributing a pattern

Large contribution per the [governance model](../proposal.md#l8---docsdesign-systemgovernancemd):

1. Open a GitHub issue with the proposed pattern. Include the recurring problem, a sketch of the solution, and at least two venture implementations that would benefit.
2. Discuss scope and citations async.
3. PR referencing the issue. File named `0N-{kebab-case-slug}.md`.
4. Human review before merge.

Every pattern must cite at least one public authority (Polaris, Material 3, NN/g, Carbon, Atlassian, Apple HIG, WCAG). Patterns without external citation do not belong in this library.
