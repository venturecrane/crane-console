# Venture Crane Design Spec

> Design system reference for Venture Crane agents. Auto-synced to crane-context.
> Design Maturity: Tier 1 - Established system with documented tokens, component patterns, and accessibility compliance.
> Last updated: 2026-03-02

## Identity

- **Venture:** Venture Crane
- **Code:** vc
- **Tagline:** AI-powered venture studio building profitable micro-SaaS products
- **Audience:** Technical founders, AI developers, indie hackers
- **Brand Voice:** Confident, technical, transparent. Agent-authored content presented as agent work. No apologies, no hiding. Proof that AI agents in structured environments produce quality work.

## Tech Stack

- **Framework:** Astro
- **CSS Methodology:** Tailwind v4 with CSS custom properties, semantic design tokens
- **Tailwind Version:** 4.x
- **Hosting:** Cloudflare Pages
- **Fonts:** System font stacks (no external font loading)

## Component Patterns

- **ArticleCard** - Featured article display with metadata
- **PortfolioCard** - Venture showcase cards
- **BuildLogEntry** - Chronological build updates
- **Header** - Site navigation, logo, venture switcher
- **Footer** - Links, copyright, attribution
- **HeroSection** - Landing page hero
- **SkipLink** - Keyboard navigation accessibility
- **CodeBlock** - Syntax-highlighted code samples
- **TableWrapper** - Responsive table container

**Naming convention:** PascalCase component files, `.astro` extension.

**ARIA patterns:** Semantic HTML first, ARIA labels on interactive elements, skip link for keyboard users, focus management on navigation.

## Dark/Light Mode

Dark-only theme. No light mode variant.

Rationale: Content-focused technical publication. Dark theme reduces eye strain for code-heavy reading, establishes brand differentiation. Light mode adds maintenance burden without user demand.

## Accessibility

- **WCAG Target:** 2.1 AA
- **Focus Indicators:** 2px solid `--vc-accent` (#818cf8), 2px offset
- **Skip Link:** Absolute positioned, visually hidden until focused, keyboard-accessible
- **Motion:** Respects `prefers-reduced-motion`
- **Testing:** Manual keyboard navigation, axe DevTools

## Color Tokens

### Background Surfaces

| Token                 | Hex     | Purpose                            | Notes                           |
| --------------------- | ------- | ---------------------------------- | ------------------------------- |
| `--vc-chrome`         | #1a1a2e | Primary background, header, footer | Darkest surface                 |
| `--vc-chrome-light`   | #1e1e36 | Chrome hover states                | +4 lightness from chrome        |
| `--vc-surface`        | #242438 | Content card backgrounds           | Primary elevated surface        |
| `--vc-surface-raised` | #2a2a42 | Elevated cards, modals             | Secondary elevation             |
| `--vc-code-bg`        | #14142a | Code block backgrounds             | Darker than chrome for contrast |

### Text

| Token               | Hex     | Purpose                   | Contrast (on chrome) |
| ------------------- | ------- | ------------------------- | -------------------- |
| `--vc-text`         | #e8e8f0 | Primary body text         | 11.7:1 (AAA)         |
| `--vc-text-muted`   | #a0a0b8 | Secondary text, metadata  | 6.3:1 (AA)           |
| `--vc-text-inverse` | #1a1a2e | Text on light backgrounds | N/A                  |

### Accent Colors

| Token               | Hex     | Purpose                       | Contrast (on chrome) |
| ------------------- | ------- | ----------------------------- | -------------------- |
| `--vc-accent`       | #818cf8 | Links, CTAs, focus indicators | 5.8:1 (AA)           |
| `--vc-accent-hover` | #a5b4fc | Hover states for accent       | 7.1:1 (AA)           |
| `--vc-gold`         | #dbb05c | Premium features, highlights  | 7.9:1 (AA)           |
| `--vc-gold-hover`   | #e8c474 | Gold hover states             | 9.2:1 (AAA)          |
| `--vc-gold-muted`   | #a08040 | Muted gold accents            | 4.8:1 (AA)           |

### Borders

| Token         | Hex     | Purpose                |
| ------------- | ------- | ---------------------- |
| `--vc-border` | #2e2e4a | Dividers, card borders |

## Typography

### Font Stacks

```css
--vc-font-body:
  -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell,
  'Helvetica Neue', sans-serif;
--vc-font-mono:
  ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
```

### Type Scale

| Level | Size             | Line Height | Token                                   | Usage                    |
| ----- | ---------------- | ----------- | --------------------------------------- | ------------------------ |
| H1    | 2rem (32px)      | 1.2         | `--vc-text-h1`, `--vc-leading-h1`       | Page titles              |
| H2    | 1.5rem (24px)    | 1.3         | `--vc-text-h2`, `--vc-leading-h2`       | Section headers          |
| H3    | 1.25rem (20px)   | 1.4         | `--vc-text-h3`, `--vc-leading-h3`       | Subsections              |
| Body  | 1rem (16px)      | 1.6         | `--vc-text-body`, `--vc-leading-body`   | Body copy                |
| Small | 0.875rem (14px)  | 1.5         | `--vc-text-small`, `--vc-leading-small` | Metadata, captions       |
| Code  | 0.8125rem (13px) | 1.4         | `--vc-text-code`, `--vc-leading-code`   | Inline code, code blocks |

### Weights

System fonts use OS defaults. No custom font weights loaded.

## Spacing

Base unit: 0.25rem (4px)

Scale: Tailwind's default spacing scale (0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24).

Content width: `--vc-content-width: 768px`

## Surface Hierarchy

1. **Base (--vc-chrome)**: Page background, header, footer
2. **Elevated (--vc-surface)**: Article cards, content panels
3. **Raised (--vc-surface-raised)**: Hover states, modals, tooltips
4. **Inset (--vc-code-bg)**: Code blocks, input fields (darker than base)

## Tailwind @theme Mappings

Agents can use these utility classes (mapped from CSS tokens):

- `bg-chrome`, `bg-chrome-light`
- `bg-surface`, `bg-surface-raised`
- `bg-code-bg`
- `text-vc-text`, `text-muted`, `text-inverse`
- `text-accent`, `hover:text-accent-hover`
- `text-gold`, `hover:text-gold-hover`, `text-gold-muted`
- `border-border`
- `font-body`, `font-mono`

## Design Principles (from charter)

1. **Content Supremacy** - Typography and readability first. Design serves content.
2. **Earned Complexity** - Start minimal. Add features only when justified by user need.
3. **Performance as Brand** - Fast load times are a feature. No heavy frameworks on client.
4. **Contrast/Legibility First** - WCAG AA minimum. Prefer AAA where possible.
5. **Structural Honesty** - HTML semantics reflect content structure. No div soup.
6. **System Consistency** - Design tokens enforce consistency across components.
7. **Quiet Differentiation** - Stand out through quality and focus, not gimmicks.

## Prose Styling

Class: `.vc-prose`

Applied to article bodies. Styles headings, paragraphs, lists, blockquotes, code blocks with VC design tokens.

## Mobile Considerations

- Responsive breakpoints: sm (640px), md (768px), lg (1024px)
- Touch targets: minimum 44x44px
- Navigation: Hamburger menu on mobile, horizontal nav on desktop
- Code blocks: Horizontal scroll with `overflow-x: auto`

## Known Issues

- None currently documented

## Future Enhancements

- Component library extraction for reuse across ventures
- Storybook or similar component documentation
- Automated accessibility testing in CI
