---
title: 'Design System Overview'
sidebar:
  order: 10
---

# Design System Overview

Running six ventures means six codebases, six sets of UI decisions, and six opportunities for visual drift. Without guardrails, every new feature becomes an ad hoc design exercise - agents pick colors by gut, spacing by eyeball, and typography by whatever the last commit used. Multiply that across a portfolio and you get products that feel disconnected from each other and inconsistent within themselves.

The Venture Crane design system solves this with a token-based approach. Each venture maintains its own design spec - a single document defining that venture's visual identity through CSS custom properties. The specs share a common naming taxonomy (`--{prefix}-{category}-{variant}`) and contribution process, but the actual values are venture-specific. The result: agents always have a clear, authoritative source for every visual decision, and ventures look like members of the same family without looking identical.

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

Not all ventures are at the same stage. A Tier 1 venture like Kid Expenses has a complete token system with documented components - agents can build confidently. A Tier 3 venture like Silicon Crane has proposed tokens that may not be implemented yet. The tier determines how agents approach design work:

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
