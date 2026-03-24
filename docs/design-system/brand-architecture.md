---
title: 'Brand Architecture'
sidebar:
  order: 30
---

# Brand Architecture

Brand architecture defines how a portfolio of products relates visually. In a multi-venture operation, the challenge is balance: ventures need enough shared DNA to feel like they belong together, but enough distinction that users don't confuse one product for another. This page documents the visual family, shared elements, and principles that hold the portfolio together.

## The Venture Family

| Brand              | Purpose                      | Tagline                              | Domain               |
| ------------------ | ---------------------------- | ------------------------------------ | -------------------- |
| Venture Crane      | Development lab, methodology | Build what matters, measure the rest | venturecrane.com     |
| Durgan Field Guide | Auction intelligence         | Navigate auctions with confidence    | durganfieldguide.com |
| Silicon Crane      | VaaS product                 | Venture-as-a-Service                 | siliconcrane.com     |
| Kid Expenses       | Expense tracking             | Teach money by tracking it           | TBD                  |
| Draft Crane        | Book-writing tool            | From draft to done                   | TBD                  |

## Shared Elements

### Color System

Each venture defines its own color tokens through a design spec (`crane_doc('{code}', 'design-spec.md')`), but the palette philosophy is shared: high-contrast, accessibility-first, and built for dark interfaces. The portfolio leans toward deep indigo backgrounds with amber and gold accents - a visual signature that connects ventures without making them identical.

### Typography

All ventures use system font stacks for headlines and body text. This is a deliberate performance choice: system fonts load instantly, render consistently across platforms, and eliminate the layout shift that web fonts cause. The trade-off (less typographic personality) is acceptable because the ventures' identity comes from color, spacing, and layout - not from a custom typeface.

Individual ventures may layer on specific fonts where justified. Kid Expenses uses Geist for its app interface; Draft Crane may adopt a serif for long-form reading. These are venture-level decisions, not portfolio-level.

### Imagery

- **Crane bird motif** across all brands - the unifying visual element
- **Golden orb/blueprint symbolism** - represents precision and methodology
- **Deep indigo backgrounds with amber/gold highlights** - the portfolio's color signature
- **Photography: minimal** - the ventures are tool-focused, not lifestyle brands

## Design Principles

1. **Tokens over magic numbers** - Named variables that communicate intent. `var(--vc-color-accent)` tells the next developer what that color means; `#f59e0b` tells them nothing.
2. **Performance first** - Every visual choice considers load time. System fonts over web fonts. CSS custom properties over runtime theming. No decorative assets that don't earn their bytes.
3. **Portable identity** - Designs export as JSON and CSS tokens, not as framework-specific components. A venture's visual identity works in Astro, Next.js, or anything that reads CSS custom properties.
4. **Family, not clones** - Ventures share DNA (color philosophy, typography approach, spacing scale) but express distinct personalities. Kid Expenses is bright and approachable. Venture Crane is dark and technical. The system enables both without either breaking the family resemblance.
