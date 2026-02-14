# Design Technologist Contribution -- Design Brief Round 1

**Author:** Design Technologist
**Date:** 2026-02-13
**Design Maturity:** Greenfield
**PRD Reference:** venturecrane.com Product Requirements Document (Synthesized 2026-02-13)

---

## Component Inventory

Every UI component required for the Phase 0 MVP. All components are Astro (`.astro`) files -- server-rendered at build time, zero client-side JavaScript.

### Component Summary Table

| #   | Component       | Purpose                                                                         | Variants                                                   | ARIA Role / Pattern                                                | Status |
| --- | --------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ | ------ |
| 1   | `Header`        | Site-wide header with wordmark and primary navigation                           | `default`                                                  | `banner` landmark, `navigation` landmark                           | New    |
| 2   | `MobileNav`     | CSS-only collapsed navigation for viewports <= 640px                            | `default`                                                  | `navigation` landmark, `disclosure` pattern (`details/summary`)    | New    |
| 3   | `Footer`        | Site-wide footer with venture links, social links, recent articles, legal links | `default`                                                  | `contentinfo` landmark                                             | New    |
| 4   | `ArticleCard`   | Preview card for articles in listings and homepage                              | `default`, `compact`                                       | `article` landmark                                                 | New    |
| 5   | `LogEntry`      | Preview card for build log entries in listings and homepage                     | `default`                                                  | `article` landmark                                                 | New    |
| 6   | `PortfolioCard` | Venture card with status badge and conditional external link                    | `live`, `prelaunch`                                        | `article` landmark                                                 | New    |
| 7   | `ArticleMeta`   | Date, reading time, updated date, and tags display                              | `full` (article pages), `compact` (listings)               | No role -- inline metadata presentation                            | New    |
| 8   | `AIDisclosure`  | Standardized AI authorship disclosure at article footer                         | `default` (with author name), `anonymous` (default author) | `note` role                                                        | New    |
| 9   | `SkipLink`      | Skip-to-content keyboard accessibility link                                     | `default`                                                  | Skip navigation pattern                                            | New    |
| 10  | `StatusBadge`   | Venture status indicator (Launched, Active, In Development, Lab)                | `launched`, `active`, `in-development`, `lab`              | `status` role, text label (no color-only semantics)                | New    |
| 11  | `ExternalLink`  | Link that opens in a new tab with visual indicator                              | `default`                                                  | `link` role with accessible name including "opens in new tab"      | New    |
| 12  | `CodeBlock`     | Wrapper for Shiki-rendered code blocks with horizontal scroll                   | `default`                                                  | `region` with accessible label, `tabindex="0"` for keyboard scroll | New    |
| 13  | `TableWrapper`  | Responsive wrapper for markdown-generated tables with scroll indicator          | `default`                                                  | `region` with `aria-label`, `tabindex="0"` for keyboard scroll     | New    |
| 14  | `PageHead`      | Centralized `<head>` management: meta, OG tags, canonical URL, CSP              | `default`                                                  | N/A (document metadata)                                            | New    |

### Component Props Interfaces

```typescript
// Header.astro
interface Props {
  currentPath: string // Active route for aria-current="page"
}

// MobileNav.astro
interface Props {
  currentPath: string
}

// Footer.astro
interface Props {
  recentArticles: Array<{
    title: string
    slug: string
  }>
}

// ArticleCard.astro
interface Props {
  title: string
  date: Date
  description: string
  slug: string
  readingTime: number // minutes
  variant?: 'default' | 'compact'
}

// LogEntry.astro
interface Props {
  title: string
  date: Date
  slug: string
  preview?: string // First 1-2 sentences extracted from body
  tags?: string[]
}

// PortfolioCard.astro
interface Props {
  name: string
  description: string
  status: 'launched' | 'active' | 'in-development' | 'lab'
  url?: string // Present only for live ventures
  techStack: string[]
}

// ArticleMeta.astro
interface Props {
  date: Date
  readingTime?: number // Omitted for build logs
  updatedDate?: Date
  author?: string
  tags?: string[]
  variant?: 'full' | 'compact'
}

// AIDisclosure.astro
interface Props {
  author?: string // Defaults to undefined = generic disclosure
  methodologyUrl?: string // Defaults to '/methodology'
}

// SkipLink.astro
interface Props {
  targetId?: string // Defaults to 'main-content'
}

// StatusBadge.astro
interface Props {
  status: 'launched' | 'active' | 'in-development' | 'lab'
}

// ExternalLink.astro
interface Props {
  href: string
  label?: string // Visible text; children also accepted via slot
}

// CodeBlock.astro
// Wraps Shiki output; no custom props -- receives rendered HTML via slot
interface Props {
  language?: string // For aria-label: "Code block: TypeScript"
}

// TableWrapper.astro
// Wraps markdown-rendered tables; receives table HTML via slot
interface Props {
  caption?: string // For aria-label
}

// PageHead.astro
interface Props {
  title: string
  description: string
  canonicalUrl: string
  ogImage?: string // Defaults to /og-default.png
  ogType?: 'website' | 'article'
  publishedDate?: Date
  updatedDate?: Date
}
```

---

## Design Token Architecture

### Naming Convention

All tokens use the `--vc-` venture prefix. This prevents collisions if token definitions are ever shared across the portfolio (KE, DFG, SC, DC) and establishes a clear namespace for the Venture Crane design system.

Structure: `--vc-{category}-{element}-{modifier}`

Examples:

- `--vc-color-chrome` (category: color, element: chrome)
- `--vc-color-text-muted` (category: color, element: text, modifier: muted)
- `--vc-space-4` (category: spacing, element: scale step 4)
- `--vc-font-body` (category: font, element: body)

### Token Categories

#### Color Tokens

```css
:root {
  /* Chrome -- site structure (header, footer, homepage bg) */
  --vc-color-chrome: #1a1a2e;
  --vc-color-chrome-light: #1e1e36;

  /* Surface -- content reading areas */
  --vc-color-surface: #242438;
  --vc-color-surface-raised: #2a2a42;

  /* Code -- distinct from article surface */
  --vc-color-code-bg: #1e1e30;
  --vc-color-code-border: #2e2e48;

  /* Text */
  --vc-color-text: #e8e8f0;
  --vc-color-text-muted: #a0a0b8;
  --vc-color-text-inverse: #1a1a2e;

  /* Accent -- placeholder, pending OD-005 brand decision */
  --vc-color-accent: #6366f1;
  --vc-color-accent-hover: #818cf8;
  --vc-color-accent-subtle: rgba(99, 102, 241, 0.15);

  /* Status badges */
  --vc-color-status-launched: #34d399;
  --vc-color-status-active: #60a5fa;
  --vc-color-status-in-dev: #fbbf24;
  --vc-color-status-lab: #a78bfa;

  /* Semantic */
  --vc-color-border: #2e2e48;
  --vc-color-border-subtle: #262640;
  --vc-color-focus-ring: #818cf8;
  --vc-color-scrollbar-thumb: #3a3a56;
  --vc-color-scrollbar-track: transparent;
}
```

**Contrast verification required before implementation:**

| Foreground                        | Background                     | Calculated Ratio | Target            | Status            |
| --------------------------------- | ------------------------------ | ---------------- | ----------------- | ----------------- |
| `--vc-color-text` (#e8e8f0)       | `--vc-color-chrome` (#1a1a2e)  | ~12.5:1          | 4.5:1 (AA normal) | Passes            |
| `--vc-color-text` (#e8e8f0)       | `--vc-color-surface` (#242438) | ~10.2:1          | 4.5:1 (AA normal) | Passes            |
| `--vc-color-text-muted` (#a0a0b8) | `--vc-color-chrome` (#1a1a2e)  | ~5.8:1           | 4.5:1 (AA normal) | Passes            |
| `--vc-color-text-muted` (#a0a0b8) | `--vc-color-surface` (#242438) | ~4.8:1           | 4.5:1 (AA normal) | Passes (marginal) |
| `--vc-color-accent` (#6366f1)     | `--vc-color-chrome` (#1a1a2e)  | ~4.6:1           | 4.5:1 (AA normal) | Passes (marginal) |
| `--vc-color-accent` (#6366f1)     | `--vc-color-surface` (#242438) | ~3.8:1           | 3:1 (AA large)    | Passes large only |

**Critical finding:** The placeholder accent color `#6366f1` does not pass AA normal text contrast against `--vc-color-surface`. For body-text-sized links on article surfaces, the accent color must be lightened to at least `#818cf8` (~5.4:1 against surface), or an alternative accent must be chosen during the OD-005 brand decision. Recommendation: use `--vc-color-accent-hover` (#818cf8) as the base link color on article surfaces, reserving `--vc-color-accent` (#6366f1) for use on chrome backgrounds or for large text and UI components where 3:1 suffices.

#### Spacing Tokens

An 8px base grid with a 4px half-step for fine adjustments. Named by scale step, not by pixel value (values may shift across breakpoints).

```css
:root {
  --vc-space-0: 0;
  --vc-space-1: 0.25rem; /* 4px */
  --vc-space-2: 0.5rem; /* 8px */
  --vc-space-3: 0.75rem; /* 12px */
  --vc-space-4: 1rem; /* 16px */
  --vc-space-5: 1.5rem; /* 24px */
  --vc-space-6: 2rem; /* 32px */
  --vc-space-8: 3rem; /* 48px */
  --vc-space-10: 4rem; /* 64px */
  --vc-space-12: 6rem; /* 96px */
  --vc-space-16: 8rem; /* 128px */
}
```

#### Typography Tokens

```css
:root {
  /* Font families */
  --vc-font-body:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen-Sans, Ubuntu, Cantarell,
    'Helvetica Neue', sans-serif;
  --vc-font-mono:
    ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;

  /* Font sizes */
  --vc-text-xs: 0.75rem; /* 12px */
  --vc-text-sm: 0.875rem; /* 14px */
  --vc-text-base: 1.125rem; /* 18px -- body desktop */
  --vc-text-code: 0.9375rem; /* 15px */
  --vc-text-lg: 1.375rem; /* 22px -- h3 */
  --vc-text-xl: 1.75rem; /* 28px -- h2 */
  --vc-text-2xl: 2.25rem; /* 36px -- h1 */

  /* Line heights */
  --vc-leading-tight: 1.2; /* h1 */
  --vc-leading-snug: 1.3; /* h2 */
  --vc-leading-normal: 1.4; /* h3 */
  --vc-leading-relaxed: 1.5; /* meta */
  --vc-leading-loose: 1.6; /* code blocks, mobile body */
  --vc-leading-prose: 1.7; /* body text desktop */

  /* Font weights */
  --vc-weight-normal: 400;
  --vc-weight-medium: 500;
  --vc-weight-semibold: 600;
  --vc-weight-bold: 700;

  /* Content width */
  --vc-content-width: 42.5rem; /* 680px */
  --vc-content-width-wide: 52rem; /* 832px -- for code blocks that benefit from extra width */
}

/* Mobile overrides */
@media (max-width: 639px) {
  :root {
    --vc-text-base: 1rem; /* 16px -- body mobile */
    --vc-leading-prose: 1.6; /* mobile body line height */
    --vc-text-2xl: 1.75rem; /* 28px -- h1 mobile */
    --vc-text-xl: 1.5rem; /* 24px -- h2 mobile */
    --vc-text-lg: 1.25rem; /* 20px -- h3 mobile */
  }
}
```

#### Radius Tokens

```css
:root {
  --vc-radius-sm: 0.25rem; /* 4px -- small elements, badges */
  --vc-radius-md: 0.5rem; /* 8px -- cards, code blocks */
  --vc-radius-lg: 0.75rem; /* 12px -- larger containers if needed */
  --vc-radius-full: 9999px; /* pills */
}
```

#### Shadow Tokens

Shadows are minimal on a dark theme. Used primarily for elevation cues on raised surfaces and scroll indicators.

```css
:root {
  --vc-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --vc-shadow-md: 0 4px 8px rgba(0, 0, 0, 0.3);
  --vc-shadow-scroll-right: inset -16px 0 16px -16px rgba(0, 0, 0, 0.4);
  --vc-shadow-scroll-left: inset 16px 0 16px -16px rgba(0, 0, 0, 0.4);
}
```

#### Motion Tokens

```css
:root {
  --vc-duration-instant: 100ms; /* micro-interactions: focus, active states */
  --vc-duration-fast: 150ms; /* hover states, badge transitions */
  --vc-duration-normal: 250ms; /* menu open/close, content reveal */
  --vc-duration-slow: 400ms; /* page-level transitions (if any) */

  --vc-ease-default: cubic-bezier(0.4, 0, 0.2, 1); /* standard ease */
  --vc-ease-in: cubic-bezier(0.4, 0, 1, 1); /* accelerate */
  --vc-ease-out: cubic-bezier(0, 0, 0.2, 1); /* decelerate */
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --vc-duration-instant: 0ms;
    --vc-duration-fast: 0ms;
    --vc-duration-normal: 0ms;
    --vc-duration-slow: 0ms;
  }
}
```

### Tailwind Config Mapping

The Tailwind theme extends (not replaces) the default theme, mapping to CSS custom property values so they stay synchronized.

```javascript
// tailwind.config.mjs
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        chrome: {
          DEFAULT: 'var(--vc-color-chrome)',
          light: 'var(--vc-color-chrome-light)',
        },
        surface: {
          DEFAULT: 'var(--vc-color-surface)',
          raised: 'var(--vc-color-surface-raised)',
        },
        text: {
          DEFAULT: 'var(--vc-color-text)',
          muted: 'var(--vc-color-text-muted)',
          inverse: 'var(--vc-color-text-inverse)',
        },
        accent: {
          DEFAULT: 'var(--vc-color-accent)',
          hover: 'var(--vc-color-accent-hover)',
          subtle: 'var(--vc-color-accent-subtle)',
        },
        code: {
          bg: 'var(--vc-color-code-bg)',
          border: 'var(--vc-color-code-border)',
        },
        border: {
          DEFAULT: 'var(--vc-color-border)',
          subtle: 'var(--vc-color-border-subtle)',
        },
        status: {
          launched: 'var(--vc-color-status-launched)',
          active: 'var(--vc-color-status-active)',
          'in-dev': 'var(--vc-color-status-in-dev)',
          lab: 'var(--vc-color-status-lab)',
        },
      },
      fontFamily: {
        body: 'var(--vc-font-body)',
        mono: 'var(--vc-font-mono)',
      },
      fontSize: {
        xs: ['var(--vc-text-xs)', { lineHeight: 'var(--vc-leading-relaxed)' }],
        sm: ['var(--vc-text-sm)', { lineHeight: 'var(--vc-leading-relaxed)' }],
        base: ['var(--vc-text-base)', { lineHeight: 'var(--vc-leading-prose)' }],
        code: ['var(--vc-text-code)', { lineHeight: 'var(--vc-leading-loose)' }],
        lg: ['var(--vc-text-lg)', { lineHeight: 'var(--vc-leading-normal)' }],
        xl: ['var(--vc-text-xl)', { lineHeight: 'var(--vc-leading-snug)' }],
        '2xl': ['var(--vc-text-2xl)', { lineHeight: 'var(--vc-leading-tight)' }],
      },
      spacing: {
        content: 'var(--vc-content-width)',
        'content-wide': 'var(--vc-content-width-wide)',
      },
      maxWidth: {
        content: 'var(--vc-content-width)',
        'content-wide': 'var(--vc-content-width-wide)',
      },
      borderRadius: {
        sm: 'var(--vc-radius-sm)',
        md: 'var(--vc-radius-md)',
        lg: 'var(--vc-radius-lg)',
        full: 'var(--vc-radius-full)',
      },
      boxShadow: {
        sm: 'var(--vc-shadow-sm)',
        md: 'var(--vc-shadow-md)',
        'scroll-right': 'var(--vc-shadow-scroll-right)',
        'scroll-left': 'var(--vc-shadow-scroll-left)',
      },
      transitionDuration: {
        instant: 'var(--vc-duration-instant)',
        fast: 'var(--vc-duration-fast)',
        normal: 'var(--vc-duration-normal)',
        slow: 'var(--vc-duration-slow)',
      },
      transitionTimingFunction: {
        default: 'var(--vc-ease-default)',
        in: 'var(--vc-ease-in)',
        out: 'var(--vc-ease-out)',
      },
    },
  },
  plugins: [],
}
```

---

## CSS Strategy

### Methodology: Utility-First with Token-Backed Theming

The CSS architecture uses three layers with clear responsibilities:

1. **CSS custom properties (global.css):** Source of truth for all design tokens. Defined in `:root`, overridden by media queries for responsive adjustments. This layer owns the theme -- changing a token value propagates everywhere.

2. **Tailwind utility classes (component markup):** The primary styling mechanism. Components use Tailwind classes that reference the custom property-backed theme values. Purged at build time -- only used classes ship.

3. **Component-scoped styles (Astro `<style>` blocks):** Used only when utility classes are insufficient -- complex selectors for markdown-rendered content (prose styling), Shiki output customization, and the `details/summary` mobile nav pattern. Scoped by default in Astro.

### Global Stylesheet Structure

```
src/styles/global.css
  @tailwind base;        -- Tailwind reset + base styles
  @tailwind components;  -- (unused at MVP -- no @apply abstractions)
  @tailwind utilities;   -- Utility class generation

  /* Custom properties -- all --vc-* tokens */
  :root { ... }

  /* Base element styles */
  html { ... }
  body { ... }
  a { ... }

  /* Prose styles for markdown-rendered content */
  .vc-prose { ... }
  .vc-prose h2 { ... }
  .vc-prose h3 { ... }
  .vc-prose p { ... }
  .vc-prose ul, .vc-prose ol { ... }
  .vc-prose blockquote { ... }
  .vc-prose table { ... }
  .vc-prose pre { ... }
  .vc-prose code { ... }
  .vc-prose img { ... }

  /* Reduced motion override */
  @media (prefers-reduced-motion: reduce) { ... }
```

### Why Not `@apply`

The `@apply` directive creates a maintenance burden by scattering style definitions across two locations (the config and the component). For a small component library (14 components), inline Tailwind classes in markup are clearer and more maintainable. The `.vc-prose` class is the sole exception -- markdown-rendered content requires element-targeted selectors that cannot be expressed as utility classes applied to authored markup.

### Prose Styling Specification

The `.vc-prose` class applies to all markdown-rendered content bodies (articles, build logs, methodology page). It handles the typographic rhythm for elements the content author does not directly control.

```css
.vc-prose {
  font-family: var(--vc-font-body);
  font-size: var(--vc-text-base);
  line-height: var(--vc-leading-prose);
  color: var(--vc-color-text);
  max-width: var(--vc-content-width);
}

.vc-prose > * + * {
  margin-top: var(--vc-space-5); /* 24px default paragraph spacing */
}

.vc-prose h2 {
  font-size: var(--vc-text-xl);
  font-weight: var(--vc-weight-semibold);
  line-height: var(--vc-leading-snug);
  margin-top: var(--vc-space-10); /* 64px before h2 */
  margin-bottom: var(--vc-space-4); /* 16px after h2 */
  color: var(--vc-color-text);
}

.vc-prose h3 {
  font-size: var(--vc-text-lg);
  font-weight: var(--vc-weight-semibold);
  line-height: var(--vc-leading-normal);
  margin-top: var(--vc-space-8); /* 48px before h3 */
  margin-bottom: var(--vc-space-3); /* 12px after h3 */
  color: var(--vc-color-text);
}

.vc-prose a {
  color: var(--vc-color-accent-hover); /* #818cf8 for AA compliance on surface bg */
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
  transition: color var(--vc-duration-fast) var(--vc-ease-default);
}

.vc-prose a:hover {
  color: var(--vc-color-text);
}

.vc-prose blockquote {
  border-left: 3px solid var(--vc-color-accent);
  padding-left: var(--vc-space-5);
  color: var(--vc-color-text-muted);
  font-style: italic;
}

.vc-prose ul,
.vc-prose ol {
  padding-left: var(--vc-space-5);
}

.vc-prose li + li {
  margin-top: var(--vc-space-2);
}

.vc-prose code:not(pre code) {
  font-family: var(--vc-font-mono);
  font-size: var(--vc-text-code);
  background: var(--vc-color-code-bg);
  border: 1px solid var(--vc-color-code-border);
  border-radius: var(--vc-radius-sm);
  padding: 0.1em 0.35em;
}

.vc-prose pre {
  font-family: var(--vc-font-mono);
  font-size: var(--vc-text-code);
  line-height: var(--vc-leading-loose);
  background: var(--vc-color-code-bg);
  border: 1px solid var(--vc-color-code-border);
  border-radius: var(--vc-radius-md);
  padding: var(--vc-space-5);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  tab-size: 2;
}

.vc-prose img {
  max-width: 100%;
  height: auto;
  border-radius: var(--vc-radius-md);
}

.vc-prose hr {
  border: none;
  border-top: 1px solid var(--vc-color-border);
  margin: var(--vc-space-10) 0;
}

.vc-prose table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--vc-text-sm);
}

.vc-prose th {
  text-align: left;
  font-weight: var(--vc-weight-semibold);
  padding: var(--vc-space-3) var(--vc-space-4);
  border-bottom: 2px solid var(--vc-color-border);
  color: var(--vc-color-text);
}

.vc-prose td {
  padding: var(--vc-space-3) var(--vc-space-4);
  border-bottom: 1px solid var(--vc-color-border-subtle);
}

.vc-prose tr:last-child td {
  border-bottom: none;
}
```

---

## Dark Mode Implementation

### Strategy: Hybrid Dark Theme (Single Theme, No Toggle at MVP)

The site ships with a single dark theme -- no light mode, no toggle, no `prefers-color-scheme` detection at Phase 0. This is a deliberate decision: the dark theme is the brand identity, not a user preference accommodation. A light theme enters scope at Phase 1 (Section 18 of PRD).

### Surface Hierarchy

The hybrid approach uses two distinct surface levels to create visual depth and optimize reading comfort:

```
+-----------------------------------------+
|  CHROME: #1a1a2e                        |  <- Header
+-----------------------------------------+
|                                         |
|  CHROME: #1a1a2e (homepage, portfolio)  |  <- Page-level backgrounds
|                                         |
|  +-----------------------------------+  |
|  | SURFACE: #242438                   |  |  <- Article reading area
|  |                                    |  |
|  |  +-----------------------------+  |  |
|  |  | RAISED: #2a2a42             |  |  |  <- Code blocks, callouts
|  |  +-----------------------------+  |  |
|  |                                    |  |
|  +-----------------------------------+  |
|                                         |
+-----------------------------------------+
|  CHROME: #1a1a2e                        |  <- Footer
+-----------------------------------------+
```

### Implementation Rules

1. **Header and footer:** Always `--vc-color-chrome`.
2. **Homepage, portfolio page, 404 page:** Full `--vc-color-chrome` background. These are chrome-dominant pages.
3. **Article pages, build log pages, methodology page:** `--vc-color-chrome` for the outer frame (header/footer); `--vc-color-surface` for the content reading area. The transition is a hard edge -- no gradient.
4. **Code blocks within articles:** `--vc-color-code-bg` (#1e1e30). This is darker than the article surface but distinct from the page chrome, creating clear visual separation.
5. **Cards (portfolio, article):** `--vc-color-surface-raised` background on chrome pages. On article surfaces (if cards appear), use `--vc-color-surface-raised` as well.
6. **Borders:** `--vc-color-border` for visible structural borders (card edges, table rules). `--vc-color-border-subtle` for decorative separation.

### Future Light Theme Preparation

Because all colors reference CSS custom properties, adding a light theme requires only:

1. Define a second set of `--vc-*` values under a `[data-theme="light"]` or `@media (prefers-color-scheme: light)` selector.
2. Add a toggle button component (client-side JS -- breaks zero-JS at MVP, so deferred).
3. Store preference in `localStorage`.

No structural CSS changes, no Tailwind config changes, no component refactoring.

---

## Responsive Implementation

### Breakpoint Strategy

Two breakpoints, matching Tailwind defaults:

| Token | Value  | Name                    | Layout Change                                  |
| ----- | ------ | ----------------------- | ---------------------------------------------- |
| `sm`  | 640px  | Mobile/tablet boundary  | Nav collapses, type scale adjusts, cards stack |
| `lg`  | 1024px | Tablet/desktop boundary | Generous side margins appear                   |

The site is designed mobile-first. Base styles are the mobile layout; `sm:` and `lg:` prefixes add complexity upward.

### Media Queries Over Container Queries

Container queries are not used at MVP. Rationale:

1. The layout is page-level, not component-level. Components do not appear in varying container widths -- they are always in the single content column or the full-width chrome.
2. Container query support is sufficient (Chrome 105+, Safari 16+, Firefox 110+) but adds conceptual overhead for a 14-component system with no complex layout nesting.
3. If portfolio cards or article cards are later placed in a sidebar or grid, container queries can be adopted per-component without a system-wide migration.

### Fluid Typography

The type scale uses a stepped approach (not `clamp()`) because the PRD specifies exact values at two breakpoints. Mobile values are set in `:root` via the `@media (max-width: 639px)` override on typography tokens. This is intentionally not fluid -- the jump between 16px and 18px body text is small enough that a hard transition at 640px is imperceptible.

### Responsive Spacing

Vertical spacing between page sections uses responsive utility classes:

```
py-8 sm:py-12 lg:py-16   -- page sections
gap-6 sm:gap-8            -- card grids
px-4 sm:px-6 lg:px-8      -- horizontal padding
```

The content column is centered with `max-w-content mx-auto` and uses horizontal padding on smaller viewports.

### Responsive Component Behavior

| Component     | < 640px                                | 640px - 1024px                       | > 1024px                                        |
| ------------- | -------------------------------------- | ------------------------------------ | ----------------------------------------------- |
| Header        | Wordmark + MobileNav (details/summary) | Wordmark + inline nav links          | Same as tablet                                  |
| Footer        | Stacked sections, full width           | 2-3 column grid                      | 3-4 column grid                                 |
| ArticleCard   | Full width, stacked                    | Full width, stacked                  | Full width, stacked (content column constrains) |
| PortfolioCard | Full width, stacked                    | 2-column grid                        | 2-column grid                                   |
| Code blocks   | Full-width with horizontal scroll      | Content-width with horizontal scroll | Content-wide width, horizontal scroll if needed |
| Tables        | Wrapped in scrollable container        | Same                                 | Same                                            |
| Article body  | 100% of viewport minus padding         | Centered, max 680px                  | Centered, max 680px                             |

---

## Accessibility

### Focus Management Strategy

Every interactive element must have a visible focus indicator that is distinguishable on both chrome (`#1a1a2e`) and surface (`#242438`) backgrounds.

```css
/* Global focus style */
:focus-visible {
  outline: 2px solid var(--vc-color-focus-ring);
  outline-offset: 2px;
  border-radius: var(--vc-radius-sm);
}

/* Remove default outline for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}
```

The focus ring color `#818cf8` provides:

- ~6.0:1 contrast against `--vc-color-chrome` (#1a1a2e)
- ~4.9:1 contrast against `--vc-color-surface` (#242438)

Both exceed the 3:1 minimum for non-text contrast (WCAG 2.1 SC 1.4.11).

### Keyboard Navigation Patterns

**Tab order:** Natural DOM order. No `tabindex` values other than `0` (for scrollable regions) and `-1` (for programmatic focus targets).

**Skip navigation:**

```html
<a href="#main-content" class="vc-skip-link">Skip to content</a>
<!-- ... header ... -->
<main id="main-content" tabindex="-1"></main>
```

```css
.vc-skip-link {
  position: absolute;
  left: -9999px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
  z-index: 100;
}

.vc-skip-link:focus {
  position: fixed;
  top: var(--vc-space-4);
  left: var(--vc-space-4);
  width: auto;
  height: auto;
  padding: var(--vc-space-3) var(--vc-space-5);
  background: var(--vc-color-accent);
  color: var(--vc-color-text);
  font-weight: var(--vc-weight-semibold);
  border-radius: var(--vc-radius-md);
  z-index: 100;
}
```

**Mobile navigation (details/summary):**

- The `<summary>` element is natively keyboard-focusable and togglable via Enter/Space.
- No additional ARIA is needed -- the `<details>` element has built-in expanded/collapsed semantics.
- The navigation links within the expanded `<details>` are standard `<a>` elements.

**Scrollable code blocks and tables:**

- `tabindex="0"` on the scrollable container so keyboard users can scroll with arrow keys.
- `role="region"` with `aria-label` to announce the scrollable area.

### ARIA Patterns for Components

| Component     | Pattern               | ARIA Attributes                                                                |
| ------------- | --------------------- | ------------------------------------------------------------------------------ |
| Header        | Banner landmark       | `<header role="banner">` (implicit in `<header>`)                              |
| Nav           | Navigation landmark   | `<nav aria-label="Main navigation">`                                           |
| MobileNav     | Disclosure            | `<details>` / `<summary>` (native semantics)                                   |
| Footer        | Content info landmark | `<footer role="contentinfo">` (implicit in `<footer>`)                         |
| ArticleCard   | Article landmark      | `<article>` with heading                                                       |
| PortfolioCard | Article landmark      | `<article>` with heading                                                       |
| StatusBadge   | Status indicator      | `<span role="status">` with text label                                         |
| AIDisclosure  | Note                  | `<aside role="note" aria-label="AI authorship disclosure">`                    |
| SkipLink      | Skip navigation       | `<a href="#main-content">`                                                     |
| ExternalLink  | Link with context     | `<a>` with `aria-label` including "(opens in new tab)" or visually hidden text |
| CodeBlock     | Scrollable region     | `<div role="region" aria-label="Code example" tabindex="0">`                   |
| TableWrapper  | Scrollable region     | `<div role="region" aria-label="Data table" tabindex="0">`                     |
| Main content  | Main landmark         | `<main id="main-content">`                                                     |

### Reduced-Motion Handling

All motion tokens collapse to `0ms` under `prefers-reduced-motion: reduce`. This affects:

- Link hover color transitions
- Card hover transitions (if any)
- Mobile nav open/close
- Focus ring transitions

Since the site has zero client-side JavaScript, there are no JavaScript-driven animations to handle. All motion is CSS `transition` properties, fully controlled by the motion tokens.

### Screen Reader Considerations

1. **Heading hierarchy:** Single `<h1>` per page. No skipped heading levels. The `<h1>` is the page title (article title, "Portfolio", "Methodology", etc.).
2. **Image alt text:** Required on all content images via Astro content validation. Decorative images (if any) use `alt=""`.
3. **External links:** Announce destination context. Either `aria-label="Visit Durgan Field Guide (opens in new tab)"` or append visually hidden text `<span class="sr-only">(opens in new tab)</span>`.
4. **Status badges:** Use text labels ("Launched", "Active", "In Development", "Lab") -- not color alone. Color is a supplementary cue.
5. **Reading time:** Presented as text ("5 min read"), not a visual-only indicator.
6. **Date formatting:** Use `<time datetime="2026-02-13">February 13, 2026</time>` for machine-readable dates.

### Color Independence

No information is conveyed by color alone:

- **Status badges:** Each has a unique text label. Color distinguishes them visually but is not the sole differentiator.
- **Links:** Underlined by default. Color change on hover is supplementary.
- **Code syntax highlighting:** Token meaning comes from Shiki's semantic markup, not color. Colorblind users still see the structural highlighting via font weight and style.

---

## Performance Budget

### Core Web Vitals Targets

| Metric                         | Target                   | Rationale                                                                                |
| ------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------- |
| First Contentful Paint (FCP)   | < 800ms on simulated 3G  | System fonts + static HTML = no blocking resources                                       |
| Largest Contentful Paint (LCP) | < 1000ms on simulated 3G | PRD specifies sub-1s TTFMP. LCP is the modern equivalent.                                |
| Cumulative Layout Shift (CLS)  | < 0.05                   | PRD target. System fonts eliminate FOUT layout shift. No lazy-loaded above-fold content. |
| Time to Interactive (TTI)      | < 1000ms on simulated 3G | Zero client-side JS = TTI equals FCP                                                     |
| Total Blocking Time (TBT)      | 0ms                      | Zero JavaScript = zero blocking time                                                     |

### Bundle Size Budget

| Asset              | Target (gzipped) | Rationale                                                                  |
| ------------------ | ---------------- | -------------------------------------------------------------------------- |
| HTML per page      | < 15 KB          | Static content, no framework runtime                                       |
| CSS (entire site)  | < 12 KB          | Tailwind purging. Dark theme + prose styles + utilities.                   |
| JavaScript         | 0 KB             | PRD requirement. CF Analytics beacon is injected by platform, not bundled. |
| Total homepage     | < 50 KB          | PRD target. HTML + CSS + any inline images.                                |
| OG image           | < 100 KB         | Optimized PNG at 1200x630.                                                 |
| Total article page | < 60 KB          | HTML + CSS + article content. Images are additional.                       |

### Font Loading Strategy

No font loading. System fonts render immediately from the OS font cache. This eliminates:

- Font file network requests (0 bytes)
- FOIT (Flash of Invisible Text)
- FOUT (Flash of Unstyled Text)
- CLS from font swap

The system font stack renders a visually consistent experience across platforms:

- macOS/iOS: San Francisco
- Windows: Segoe UI
- Android: Roboto
- Linux: Ubuntu or system default

### Image Strategy

All content images are processed at build time by Astro's `<Image />` component:

- Automatic WebP conversion
- Responsive `srcset` generation
- Explicit `width` and `height` attributes (prevents CLS)
- Lazy loading for below-fold images (`loading="lazy"`)
- Eager loading for above-fold images (`loading="eager"`)

### Lighthouse CI Enforcement

```yaml
# lighthouserc.json
{
  'ci':
    {
      'assert':
        {
          'preset': 'lighthouse:recommended',
          'assertions':
            {
              'categories:performance': ['error', { 'minScore': 0.95 }],
              'categories:accessibility': ['error', { 'minScore': 0.95 }],
              'categories:best-practices': ['error', { 'minScore': 0.95 }],
              'categories:seo': ['error', { 'minScore': 1.0 }],
              'cumulative-layout-shift': ['error', { 'maxNumericValue': 0.05 }],
              'first-contentful-paint': ['warn', { 'maxNumericValue': 800 }],
              'largest-contentful-paint': ['warn', { 'maxNumericValue': 1000 }],
              'total-blocking-time': ['error', { 'maxNumericValue': 0 }],
            },
        },
    },
}
```

---

## Animation & Motion

### Philosophy

Motion on this site is minimal and functional. The site is a reading environment -- motion should never distract from content. Nothing animates on page load. Nothing bounces, pulses, or slides in. Motion exists only as feedback for user-initiated interactions.

### What Animates

| Interaction                            | Property                              | Duration                        | Easing              | Reduced Motion         |
| -------------------------------------- | ------------------------------------- | ------------------------------- | ------------------- | ---------------------- |
| Link hover                             | `color`                               | `--vc-duration-fast` (150ms)    | `--vc-ease-default` | Instant                |
| Card hover (portfolio live cards only) | `border-color`, `box-shadow`          | `--vc-duration-fast` (150ms)    | `--vc-ease-default` | Instant                |
| Focus ring appearance                  | `outline`                             | `--vc-duration-instant` (100ms) | `--vc-ease-default` | Instant                |
| Mobile nav open/close                  | `height` (via details/summary native) | Browser default                 | Browser default     | Instant (no animation) |
| External link icon hover               | `opacity`                             | `--vc-duration-fast` (150ms)    | `--vc-ease-default` | Instant                |

### What Does Not Animate

- Page transitions (no client-side routing)
- Content appearance on scroll (no intersection observer, no JS)
- Card entrance (no stagger, no fade-in)
- Hero section (no typewriter, no animation)
- Any loading state (static site = nothing loads dynamically)
- Status badges (static text, no pulse or glow)
- Code block appearance (rendered at build time)
- Table scroll indicators (CSS shadows, always present when scrollable)

### Easing Curves

| Name    | Value                          | Use Case                                               |
| ------- | ------------------------------ | ------------------------------------------------------ |
| Default | `cubic-bezier(0.4, 0, 0.2, 1)` | All hover and focus transitions. Natural deceleration. |
| In      | `cubic-bezier(0.4, 0, 1, 1)`   | Reserved for exit animations (none at MVP).            |
| Out     | `cubic-bezier(0, 0, 0.2, 1)`   | Reserved for entrance animations (none at MVP).        |

### Duration Scale

| Name    | Value | Use Case                                                   |
| ------- | ----- | ---------------------------------------------------------- |
| Instant | 100ms | Focus ring, active/pressed states                          |
| Fast    | 150ms | Hover states, color changes, small element transitions     |
| Normal  | 250ms | Menu toggle (if CSS-animated), content reveal (future)     |
| Slow    | 400ms | Page-level transitions (future, with View Transitions API) |

All durations collapse to `0ms` under `prefers-reduced-motion: reduce`.

---

## Mobile Navigation: CSS-Only Implementation

The PRD specifies a `<details>/<summary>` pattern for the mobile nav. Here is the structural specification.

### HTML Structure

```html
<nav aria-label="Main navigation">
  <!-- Desktop nav (hidden below 640px) -->
  <ul class="hidden sm:flex gap-6">
    <li><a href="/" aria-current="page">Home</a></li>
    <li><a href="/portfolio">Portfolio</a></li>
    <li><a href="/methodology">Methodology</a></li>
    <li><a href="/articles">Articles</a></li>
  </ul>

  <!-- Mobile nav (hidden above 640px) -->
  <details class="sm:hidden">
    <summary aria-label="Toggle navigation menu">
      <!-- Hamburger icon (CSS-drawn or inline SVG) -->
      <span class="vc-hamburger" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </span>
    </summary>
    <ul>
      <li><a href="/" aria-current="page">Home</a></li>
      <li><a href="/portfolio">Portfolio</a></li>
      <li><a href="/methodology">Methodology</a></li>
      <li><a href="/articles">Articles</a></li>
    </ul>
  </details>
</nav>
```

### CSS for Hamburger Icon

```css
.vc-hamburger {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 44px; /* minimum touch target */
  height: 44px; /* minimum touch target */
  gap: 5px;
  cursor: pointer;
}

.vc-hamburger span {
  display: block;
  width: 20px;
  height: 2px;
  background: var(--vc-color-text);
  border-radius: 1px;
  transition:
    transform var(--vc-duration-fast) var(--vc-ease-default),
    opacity var(--vc-duration-fast) var(--vc-ease-default);
}

/* When details is open, transform hamburger to X */
details[open] .vc-hamburger span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

details[open] .vc-hamburger span:nth-child(2) {
  opacity: 0;
}

details[open] .vc-hamburger span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* Remove default details marker */
details summary {
  list-style: none;
}

details summary::-webkit-details-marker {
  display: none;
}
```

### Mobile Nav Panel

```css
details[open] > ul {
  position: absolute;
  top: 100%; /* below the header */
  left: 0;
  right: 0;
  background: var(--vc-color-chrome-light);
  border-top: 1px solid var(--vc-color-border);
  padding: var(--vc-space-4) 0;
  z-index: 50;
}

details[open] > ul > li > a {
  display: block;
  padding: var(--vc-space-3) var(--vc-space-5);
  color: var(--vc-color-text);
  min-height: 44px; /* touch target */
  display: flex;
  align-items: center;
}

details[open] > ul > li > a[aria-current='page'] {
  color: var(--vc-color-accent-hover);
}
```

---

## Shiki Syntax Highlighting

### Theme Selection Guidance

The PRD identifies `github-dark` and `tokyo-night` as candidates (OD-006). The selection depends on the final brand palette (OD-005), but here are the evaluation criteria:

| Criterion                                                 | Requirement                   |
| --------------------------------------------------------- | ----------------------------- |
| All token types pass 4.5:1 contrast against code block bg | Mandatory (WCAG AA)           |
| Visual harmony with site chrome and surface colors        | Strong preference             |
| Distinction between token types at a glance               | Required for readability      |
| Keyword, string, comment, type, function differentiation  | All must be visually distinct |

### Code Block Background

The code block background (`--vc-color-code-bg: #1e1e30`) is distinct from both:

- Chrome (#1a1a2e) -- slightly lighter/more purple to not merge with header/footer
- Surface (#242438) -- noticeably darker to create a recessed panel effect

The Shiki theme's own background color should be overridden to use `--vc-color-code-bg` for consistency across all code blocks.

### Code Block Overflow

Long lines must scroll horizontally within the code block container, not wrap. The code block has `overflow-x: auto` and a visible scrollbar (styled via `scrollbar-color` CSS property where supported).

```css
.vc-prose pre::-webkit-scrollbar {
  height: 6px;
}

.vc-prose pre::-webkit-scrollbar-track {
  background: var(--vc-color-scrollbar-track);
}

.vc-prose pre::-webkit-scrollbar-thumb {
  background: var(--vc-color-scrollbar-thumb);
  border-radius: 3px;
}

/* Firefox */
.vc-prose pre {
  scrollbar-width: thin;
  scrollbar-color: var(--vc-color-scrollbar-thumb) var(--vc-color-scrollbar-track);
}
```

---

## Table Responsiveness

Tables rendered from markdown must not cause page-level horizontal scroll on mobile.

### Implementation

```html
<!-- TableWrapper component wraps markdown tables -->
<div class="vc-table-wrapper" role="region" aria-label="Data table" tabindex="0">
  <table>
    <!-- Astro-rendered markdown table content -->
  </table>
</div>
```

```css
.vc-table-wrapper {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  margin: var(--vc-space-5) 0;
  position: relative;
}

/* Scroll shadow indicator on right edge */
.vc-table-wrapper::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 16px;
  background: linear-gradient(to right, transparent, var(--vc-color-surface));
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--vc-duration-fast) var(--vc-ease-default);
}

/* Show shadow only when scrollable (requires JS -- defer to Phase 1) */
/* At MVP, the shadow is always visible as a static visual cue when table overflows */
```

Note: Detecting whether a table is scrollable requires JavaScript. At MVP, the table simply scrolls without a dynamic shadow indicator. The right-edge fade is a Phase 1 enhancement. Users discover scrollability via native scrollbar visibility (always visible on mobile, hover-visible on desktop).

---

## Open Questions for Design Lead / Visual Designer

The following items fall outside the Design Technologist scope and require input from the visual design perspective before implementation:

1. **Brand accent color (OD-005):** The placeholder `#6366f1` fails AA normal text contrast on article surfaces. The brand decision must produce an accent that passes 4.5:1 against `#242438`, or two accent tones must be specified (one for chrome contexts, one for surface contexts).

2. **Wordmark treatment:** Text-only wordmark is specified. Font weight, letter-spacing, case treatment (title case? all caps? lowercase?), and any subtle typographic differentiation from body text need definition.

3. **Status badge visual design:** The token architecture provides four status colors. The visual designer should confirm whether badges use filled backgrounds with inverse text, outlined borders with colored text, or another treatment. All treatments must pass contrast requirements.

4. **Portfolio card hover state:** Live venture cards have a hover state per PRD. The specific visual treatment (border color change, shadow lift, background shift) needs design specification. Pre-launch cards have no hover change and default cursor.

5. **Article page surface transition:** The boundary between chrome background and article surface is specified as a hard edge. The visual designer should confirm whether any visual device (a subtle horizontal rule, a shadow, a 1px border) marks this transition, or whether the color change alone is sufficient.

6. **Footer layout:** The footer contains five content groups (venture links, social links, recent articles, legal links, RSS link). The grid arrangement and visual hierarchy need design specification.

---

## Implementation Notes

### Astro-Specific Considerations

1. **Content Collections:** Zod schemas in `src/content/config.ts` validate frontmatter at build time. Invalid data fails the build -- this is intentional and correct.

2. **Remark/Rehype plugins:** Tables rendered from markdown may lack `scope` attributes on `<th>` elements. A rehype plugin should be added to inject `scope="col"` on table headers automatically. Verify Astro's default rendering before adding the plugin.

3. **Reading time calculation:** Use a remark plugin (e.g., `remark-reading-time`) to inject reading time into frontmatter during the build. Average English reading speed: 200 words per minute. Round to nearest minute.

4. **Shiki integration:** Astro includes Shiki by default. Override the theme's background color with `--vc-color-code-bg` in the Astro config or via CSS.

5. **RSS feed:** Use `@astrojs/rss`. Merge articles and logs collections, sort by date, output full content. The feed URL (`/feed.xml`) should be referenced in the `<head>` via `<link rel="alternate" type="application/rss+xml">`.

6. **Sitemap:** Use `@astrojs/sitemap`. Exclude draft content.

### Build Verification Checklist

Before every deployment, the CI pipeline should verify:

- [ ] TypeScript compilation passes (`astro check`)
- [ ] All content frontmatter validates against Zod schemas
- [ ] No `.js` files in `dist/` output (except CF analytics)
- [ ] Total CSS output < 12 KB gzipped
- [ ] Homepage HTML + CSS < 50 KB gzipped
- [ ] Lighthouse scores >= 95 all categories
- [ ] All `<img>` elements have `alt` attributes
- [ ] All pages have exactly one `<h1>`
- [ ] `lang="en"` present on `<html>`
- [ ] CSP header present in `_headers`
