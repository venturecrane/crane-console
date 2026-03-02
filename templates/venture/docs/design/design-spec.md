# {VENTURE_NAME} Design Spec

> Design system reference for {VENTURE_NAME} agents. Auto-synced to crane-context.
> Design Maturity: Greenfield
> Last updated: {DATE}

## Identity

- **Venture:** {VENTURE_NAME}
- **Code:** {CODE}
- **Tagline:** {TAGLINE}
- **Audience:** {TARGET_AUDIENCE}
- **Brand Voice:** {BRAND_VOICE_DESCRIPTION}

## Tech Stack

- **Framework:** {FRAMEWORK}
- **CSS Methodology:** {CSS_APPROACH}
- **Tailwind Version:** {TAILWIND_VERSION_OR_NA}
- **Hosting:** Cloudflare Pages

## Component Patterns

No components defined yet. Use standard HTML5 semantic elements.

When creating components:

- Use PascalCase naming (e.g., `ExpenseCard`, `StatusBadge`)
- Include ARIA roles and keyboard navigation
- Support all states: default, loading, empty, error
- Use venture-prefixed tokens for all visual properties

## Dark/Light Mode

{DESCRIBE_CURRENT_STATE}

Implementation: CSS custom properties in `:root` with `@media (prefers-color-scheme: dark)` override.

## Accessibility

- **WCAG Target:** 2.1 AA
- **Focus Indicators:** 2px solid `var(--{CODE}-accent)`, offset 2px
- **Motion:** Respect `prefers-reduced-motion` - disable animations, use crossfade fallbacks
- **Contrast:** All text/background pairings must pass 4.5:1 (normal text) or 3:1 (large text)
- **Touch Targets:** Minimum 44px per Apple HIG / WCAG 2.5.8

## Color Tokens

All tokens use the `--{CODE}-` prefix.

### Core Palette

| Token                     | Value   | Purpose                               |
| ------------------------- | ------- | ------------------------------------- |
| `--{CODE}-chrome`         | `{HEX}` | Site chrome (header, footer, page bg) |
| `--{CODE}-surface`        | `{HEX}` | Content area background               |
| `--{CODE}-surface-raised` | `{HEX}` | Elevated surface (cards, modals)      |
| `--{CODE}-text`           | `{HEX}` | Primary text                          |
| `--{CODE}-text-muted`     | `{HEX}` | Secondary/muted text                  |
| `--{CODE}-text-inverse`   | `{HEX}` | Text on accent backgrounds            |
| `--{CODE}-accent`         | `{HEX}` | Primary accent (links, buttons)       |
| `--{CODE}-accent-hover`   | `{HEX}` | Accent hover state                    |
| `--{CODE}-border`         | `{HEX}` | Default border color                  |

### Status Colors

| Token              | Value   | Purpose       |
| ------------------ | ------- | ------------- |
| `--{CODE}-success` | `{HEX}` | Success state |
| `--{CODE}-warning` | `{HEX}` | Warning state |
| `--{CODE}-error`   | `{HEX}` | Error state   |

## Typography

| Property        | Value                                                                           |
| --------------- | ------------------------------------------------------------------------------- |
| **Body font**   | System stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif |
| **Mono font**   | ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace              |
| **Base size**   | 1rem (16px)                                                                     |
| **Line height** | 1.6                                                                             |
| **H1**          | 2rem / 1.2 / 700                                                                |
| **H2**          | 1.5rem / 1.3 / 600                                                              |
| **H3**          | 1.25rem / 1.4 / 600                                                             |
| **Small**       | 0.875rem / 1.5                                                                  |

## Spacing

Base unit: 4px. Scale: 4, 8, 12, 16, 24, 32, 48, 64.

| Token               | Value |
| ------------------- | ----- |
| `--{CODE}-space-1`  | 4px   |
| `--{CODE}-space-2`  | 8px   |
| `--{CODE}-space-3`  | 12px  |
| `--{CODE}-space-4`  | 16px  |
| `--{CODE}-space-6`  | 24px  |
| `--{CODE}-space-8`  | 32px  |
| `--{CODE}-space-12` | 48px  |
| `--{CODE}-space-16` | 64px  |

## Surface Hierarchy

| Tier    | Token                     | Purpose                          |
| ------- | ------------------------- | -------------------------------- |
| Base    | `--{CODE}-chrome`         | Page background, header, footer  |
| Content | `--{CODE}-surface`        | Main content area                |
| Raised  | `--{CODE}-surface-raised` | Cards, modals, elevated elements |

## Design Maturity Roadmap

1. **Foundation** - Define core tokens (colors, typography, spacing). This template.
2. **Components** - Build first 5 components using tokens. Document in this spec.
3. **Patterns** - Establish interaction patterns (forms, navigation, feedback). Document here.
4. **Polish** - Contrast audit, animation tokens, performance budget. Graduate to Tier 2.

Run `/design-brief` for a full multi-agent design definition process.
