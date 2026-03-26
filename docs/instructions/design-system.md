# Design System

Enterprise design system instructions for all Venture Crane agents.

## When to Load Design Context

Load the venture's design spec before:

- **Wireframe generation** - tokens, surfaces, and component patterns inform the prototype
- **UI implementation** - use venture-prefixed tokens, never hardcoded values
- **Design-related PR review** - verify new code uses the token system correctly

## How to Load

```
crane_doc('{venture_code}', 'design-spec.md')
```

Replace `{venture_code}` with the active venture: `vc`, `ke`, `dc`, `smd`, `sc`, `dfg`.

For Venture Crane's governance document (VC-specific):

```
crane_doc('vc', 'design-charter.md')
```

## What You Get

Each design spec contains two types of sections:

**Prose sections** (stable, hand-written):

1. **Identity** - venture name, tagline, audience, brand voice
2. **Tech Stack** - framework, CSS methodology, Tailwind version
3. **Component Patterns** - existing components, naming conventions, ARIA patterns
4. **Dark/Light Mode** - current state, implementation approach
5. **Accessibility** - WCAG target, focus indicators, motion preferences

**Token sections** (extractable from CSS, refreshable):

6. **Color Tokens** - all `--{prefix}-*` color custom properties with hex values and contrast ratios
7. **Typography** - font stacks, size scale, weights, line heights
8. **Spacing** - base unit, scale
9. **Surface Hierarchy** - background tiers with tokens

## Token Naming Conventions

All ventures use a common taxonomy: `--{prefix}-{category}-{variant}`

| Category     | Purpose          | Examples                                     |
| ------------ | ---------------- | -------------------------------------------- |
| `color-`     | Semantic colors  | `--vc-color-accent`, `--ke-color-error`      |
| `surface-`   | Background tiers | `--vc-surface-chrome`, `--dc-surface-raised` |
| `text-`      | Text colors      | `--vc-text-primary`, `--ke-text-muted`       |
| `border-`    | Border colors    | `--vc-border-default`                        |
| `space-`     | Spacing scale    | `--vc-space-4`, `--ke-space-8`               |
| `font-`      | Font families    | `--vc-font-body`, `--dc-font-mono`           |
| `text-size-` | Font sizes       | `--vc-text-size-base`, `--ke-text-size-lg`   |
| `radius-`    | Border radius    | `--vc-radius-md`                             |
| `shadow-`    | Box shadows      | `--dc-shadow-card`                           |

Some ventures have additional categories (DC has `motion-`, `z-`, `safe-area-`). The categories above are the minimum.

## Token Standards

- **Always use venture-prefixed tokens** (`var(--vc-surface)`, `var(--ke-accent)`). Never hardcode hex values.
- **No raw Tailwind color classes** in ventures that have semantic tokens. Use `bg-ke-bg` not `bg-slate-50`.
- **Check the spec's Tailwind @theme mapping** to find the correct utility class name.
- **Respect design maturity.** Tier 1 ventures (vc, ke, dc) have complete systems - use what exists. Tier 3 ventures (sc, dfg) have proposed tokens - confirm they're implemented before using.

## Contributing to the Design System

When adding new tokens during implementation:

1. Follow the naming convention: `--{prefix}-{category}-{variant}`
2. Add the token to the venture's `:root` block in `globals.css`
3. Add the Tailwind @theme mapping if applicable
4. Update the design spec (`docs/design/ventures/{code}/design-spec.md`) in the same PR
5. Include WCAG contrast ratio for any new color token

## Design Maturity Tiers

| Tier            | Ventures   | State                                         | Agent Approach                                                         |
| --------------- | ---------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| 1 - Enterprise  | vc, ke, dc | Complete token systems, documented components | Use what exists. Extend, don't replace.                                |
| 2 - Established | smd        | Basic tokens, needs formalization             | Use existing tokens. Document gaps in PR.                              |
| 3 - Greenfield  | sc, dfg    | Proposed tokens or minimal foundation         | Confirm tokens are implemented before using. Propose new tokens in PR. |

## New Venture Design Definition

- **Quick start:** Copy `templates/venture/docs/design/design-spec.md`, substitute `--{code}-` prefix
- **Full process:** Run `/design-brief` for a multi-agent design brief, then generate the design spec from its output

## Stitch DESIGN.md Files

For ventures using Google Stitch for UI generation, a `DESIGN.md` file provides Stitch with design system context. These are derivative of the canonical `design-spec.md` - formatted for Stitch project import.

**Location:** `docs/design/ventures/{code}/DESIGN.md`

**Relationship to design-spec.md:** `design-spec.md` is the canonical source of truth. `DESIGN.md` is a Stitch-compatible derivative. When they conflict, `design-spec.md` wins. Update `DESIGN.md` when `design-spec.md` changes.

| Venture        | Code | DESIGN.md                           | Status            |
| -------------- | ---- | ----------------------------------- | ----------------- |
| Draft Crane    | `dc` | `docs/design/ventures/dc/DESIGN.md` | Available         |
| Other ventures | -    | -                                   | Created on demand |

## Versioning

Design specs track HEAD. If working on an old branch with outdated design tokens, update the spec or rebase - do not implement against stale tokens.

## Venture Design Specs

| Venture            | Code  | Spec                                 | Maturity                                     |
| ------------------ | ----- | ------------------------------------ | -------------------------------------------- |
| Venture Crane      | `vc`  | `crane_doc('vc', 'design-spec.md')`  | Enterprise (dark-only, Astro, system fonts)  |
| Kid Expenses       | `ke`  | `crane_doc('ke', 'design-spec.md')`  | Enterprise (light/dark, Next.js, Geist)      |
| Draft Crane        | `dc`  | `crane_doc('dc', 'design-spec.md')`  | Enterprise (light-only, iPad-first, Next.js) |
| SMD Ventures       | `smd` | `crane_doc('smd', 'design-spec.md')` | Established (dark-only, Astro, plain CSS)    |
| Silicon Crane      | `sc`  | `crane_doc('sc', 'design-spec.md')`  | Greenfield (proposed tokens only)            |
| Durgan Field Guide | `dfg` | `crane_doc('dfg', 'design-spec.md')` | Early (minimal tokens, migration planned)    |
