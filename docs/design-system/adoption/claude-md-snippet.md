---
title: 'CLAUDE.md Snippet'
sidebar:
  order: 51
---

# Canonical CLAUDE.md Snippet

The block below is the canonical instruction every venture's `CLAUDE.md` carries after design-system adoption. Step 5 of the [adoption runbook](../adoption-runbook.md) wires this in.

The snippet tells venture agents **when** to load the cross-venture pattern + component catalog and **how** to fetch each surface via `crane_doc`. It supplements the venture's own `design-spec.md` reference (kept in place); it does not replace it.

## Scope

Add this block under the existing "Instruction Modules" section in the venture's `CLAUDE.md`, alongside the row that already references the venture's design spec. Do not delete the per-venture design-spec row — both layers are needed: the catalog is the cross-venture vocabulary, the spec is the venture's specific palette and tone.

## What goes in CLAUDE.md

```markdown
## Design System

Load the enterprise pattern + component catalog before any UI work — design briefs, wireframes, component generation, design-related PR review:

- Patterns (cross-venture UX problem/solution pairs): `crane_doc('global', 'design-system/patterns/index.md')`
- Components (per-venture catalog of atoms, molecules, organisms): `crane_doc('global', 'design-system/components/index.md')`

Then load this venture's spec for palette and tone: `crane_doc('{code}', 'design-spec.md')`.

The catalog is the shared vocabulary across all eight ventures — eight named patterns (status display by context, redundancy ban, button hierarchy, heading skip ban, typography scale, spacing rhythm, shared primitives, actions and menus) plus the components map (atoms / molecules / organisms with per-venture implementations). The catalog is a map, not a library — each venture maintains its own source. Cite a pattern by its file slug (`patterns/03-button-hierarchy.md`, etc.) when referencing it in PRs and skill output.
```

## Pattern set reference

The catalog ships eight patterns at the time this runbook was authored. Quick reference:

| File                                    | Topic                     |
| --------------------------------------- | ------------------------- |
| `patterns/01-status-display-by-context` | Status display by context |
| `patterns/02-redundancy-ban`            | Redundancy ban            |
| `patterns/03-button-hierarchy`          | Button hierarchy          |
| `patterns/04-heading-skip-ban`          | Heading-skip ban          |
| `patterns/05-typography-scale`          | Typography scale          |
| `patterns/06-spacing-rhythm`            | Spacing rhythm            |
| `patterns/07-shared-primitives`         | Shared primitives         |
| `patterns/08-actions-and-menus`         | Actions and menus         |

The components catalog is organized by Atomic Design vocabulary — `components/atoms/*`, `components/molecules/*`, `components/organisms/*`. Component entries are not implementation specs; they map per-venture source files so duplicates surface and shared vocabulary holds across ventures.

## Three-line elevator version

If the venture's `CLAUDE.md` is tight on real estate, use the abbreviated form:

```markdown
**Design system.** Before UI work, load patterns: `crane_doc('global', 'design-system/patterns/index.md')` and components: `crane_doc('global', 'design-system/components/index.md')`. Then load this venture's spec: `crane_doc('{code}', 'design-spec.md')`.
```

The abbreviated form is acceptable when the venture's `CLAUDE.md` already references the design spec elsewhere; otherwise prefer the full block above.

## Why both layers

The catalog gives agents the cross-venture invariants (status pills always derive from a venture-prefixed token; one primary action per view; menu vs. inline-action affordance rules). The venture spec gives the venture-specific values (the actual hex for `--ke-color-accent`, KE's heading scale, KE's empty-state voice). An agent loading only one layer ships generic patterns or invents tokens; loading both gives consistent UX with venture-specific tone.

## Ownership

This snippet is enterprise-scoped and propagates by copy. When the catalog adds a pattern or the snippet wording changes materially, the change lands here first; ventures pick it up by re-copying on their next adoption-runbook revisit (or as a small contribution per [governance](../governance.md)).
