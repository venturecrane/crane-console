# Design System Overview

The Venture Crane design system is a multi-venture, token-based approach to visual design. Each venture maintains its own design spec with venture-prefixed CSS custom properties, while sharing a common taxonomy, contribution process, and maturity model.

## How It Works

Every venture gets a **design spec** — a single document that defines the venture's visual identity, token system, component patterns, and accessibility standards. Design specs live alongside each venture's product documentation.

Each spec contains:

**Prose sections** (stable, hand-written):

1. **Identity** — venture name, tagline, audience, brand voice
2. **Tech Stack** — framework, CSS methodology, Tailwind version
3. **Component Patterns** — existing components, naming conventions, ARIA patterns
4. **Dark/Light Mode** — current state, implementation approach
5. **Accessibility** — WCAG target, focus indicators, motion preferences

**Token sections** (extractable from CSS, refreshable):

6. **Color Tokens** — all `--{prefix}-*` color custom properties with hex values and contrast ratios
7. **Typography** — font stacks, size scale, weights, line heights
8. **Spacing** — base unit, scale
9. **Surface Hierarchy** — background tiers with tokens

## Design Maturity Tiers

Not all ventures are at the same level of design maturity. The tier determines how agents approach design work:

| Tier            | Ventures   | State                                         | Approach                                                               |
| --------------- | ---------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| 1 - Enterprise  | VC, KE, DC | Complete token systems, documented components | Use what exists. Extend, don't replace.                                |
| 2 - Established | SMD        | Basic tokens, needs formalization             | Use existing tokens. Document gaps in PR.                              |
| 3 - Greenfield  | SC, DFG    | Proposed tokens or minimal foundation         | Confirm tokens are implemented before using. Propose new tokens in PR. |

## Venture Design Specs

| Venture            | Code  | Stack               | Theme      | Maturity    |
| ------------------ | ----- | ------------------- | ---------- | ----------- |
| Venture Crane      | `vc`  | Astro, system fonts | Dark-only  | Enterprise  |
| Kid Expenses       | `ke`  | Next.js, Geist      | Light/dark | Enterprise  |
| Draft Crane        | `dc`  | Next.js, TipTap     | Light-only | Enterprise  |
| SMD Ventures       | `smd` | Astro, plain CSS    | Dark-only  | Established |
| Silicon Crane      | `sc`  | Astro               | TBD        | Greenfield  |
| Durgan Field Guide | `dfg` | Astro/Next.js       | TBD        | Greenfield  |

Each venture's design spec is available in that venture's documentation section.

## Contributing New Tokens

When adding tokens during implementation:

1. Follow the naming convention: `--{prefix}-{category}-{variant}` (see [Token Taxonomy](token-taxonomy.md))
2. Add the token to the venture's `:root` block in `globals.css`
3. Add the Tailwind `@theme` mapping if applicable
4. Update the venture's design spec in the same PR
5. Include WCAG contrast ratio for any new color token

## New Venture Design Setup

- **Quick start:** Copy the design spec template, substitute the `--{code}-` prefix
- **Full process:** Run `/design-brief` for a multi-agent design brief, then generate the design spec from its output

## Related Documents

- [Token Taxonomy](token-taxonomy.md) — naming conventions and category reference
- [Brand Architecture](brand-architecture.md) — shared visual identity across ventures
