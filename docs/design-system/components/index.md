---
title: 'Components'
sidebar:
  order: 0
---

# Design System Components

Cross-venture component catalog. Each file documents one component family, lists per-venture implementations, and records consolidation status. **The catalog is a map, not a library** — ventures continue to maintain their own source code. This layer surfaces duplicates, establishes shared vocabulary, and gives patterns concrete artifacts to reference.

Layer 3 of the [eight-layer design system](../enterprise-scoping.md).

## Vocabulary

We use [Brad Frost's Atomic Design](https://atomicdesign.bradfrost.com/chapter-2/) taxonomy — as vocabulary, not as enforced file layout:

- **Atoms** — primitive UI elements: button, input, icon.
- **Molecules** — single-responsibility composites: status-pill, money-display, skip-link.
- **Organisms** — region-level compositions: list-row, page-header, card-layout.

We do not include Atomic Design's "templates" or "pages" tiers — those are the L5 Templates layer and individual venture code, respectively.

## How catalog entries work

Each component file has:

1. **Classification** (atom / molecule / organism).
2. **Implementations** — per-venture source paths with a one-line shape note.
3. **Consolidation status** — "non-shared" / "shared in package X" / "candidate for consolidation."
4. **Cross-references** — related patterns and tokens.

No implementation spec. Source code is the spec. The catalog just points at it.

## Contributing a component entry

When a new component lands in a venture and has (or will have) analogs elsewhere:

1. Add `docs/design-system/components/{atoms|molecules|organisms}/{name}.md`.
2. Record each existing implementation with its file path.
3. State consolidation status honestly — "non-shared" is a valid state, not a failure.
4. Link relevant patterns and tokens.

This is a **small contribution** per the [governance model](../governance.md) — PR with passing tests, no pre-discussion required.

## Seeded entries

Phase 6 lands the first six entries — representative across atoms, molecules, organisms. More land per phase as duplicates are discovered by the enforcement skill or manually noticed.

### Atoms

- [Button](atoms/button.md)
- [Icon](atoms/icon.md)

### Molecules

- [Status pill](molecules/status-pill.md)
- [Money display](molecules/money-display.md)

### Organisms

- [Portal list item](organisms/portal-list-item.md)
- [Expense card](organisms/expense-card.md)
