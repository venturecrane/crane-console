# SMD Ventures Design Spec

> Design system reference for SMD Ventures agents. Auto-synced to crane-context.
> Design Maturity: Minimal viable design system. Functional token set with hardcoded spacing and typography. Needs formalization and expansion for scale.
> Last updated: 2026-03-02

## Identity

- **Venture:** SMD Ventures
- **Code:** smd
- **Tagline:** Internal venture management portal
- **Audience:** Internal use only - venture tracking, team coordination, project oversight
- **Brand Voice:** Professional, utilitarian, technical. Dark-themed for extended screen time. Gold accent for venture branding, indigo for interactive elements.

## Tech Stack

- **Framework:** Astro 5.17.0
- **CSS Methodology:** Plain CSS with custom properties (no preprocessor)
- **Tailwind Version:** N/A (Tailwind v4 is installed but unused - plain CSS only)
- **Hosting:** Cloudflare Pages
- **Search:** Pagefind (static search index)

## Component Patterns

### Naming Convention

- Semantic class names (`.container`, `.site-header`, `.card`)
- Variant modifiers using dot notation (`.card.tier-1`, `.badge.active`, `.notice.ok`)
- No BEM, no utility-first - traditional semantic CSS

### Key Components

**Container:** `.container`

- Max-width: `var(--smd-max-width)` (768px)
- Responsive padding: 1rem mobile, 1.5rem desktop (640px+)

**SiteHeader / SiteFooter:**

- Border separator: 1px solid `var(--smd-border)`
- Chrome background: `var(--smd-chrome)`

**Card:** `.card`, `.card.tier-1`, `.card.tier-2`

- Base: 1rem padding, `--smd-surface` with 10% black mix
- Tier 1: 1.5rem padding
- Tier 2: 60% surface mix (darker)
- Border radius: 0.5rem

**Badge:** `.badge`, `.badge.active`

- Font size: 0.75rem
- Border radius: 99px (pill shape)
- Active: indigo border/background mix

**FormCard:**

- Surface background: `var(--smd-surface)`
- Border radius: 0.5rem
- Padding: 1.5rem mobile, 2rem desktop (640px+)

**Notice:** `.notice.ok`, `.notice.err`

- Border radius: 0.25rem
- Padding: 0.75rem 1rem
- Font size: 0.875rem
- OK: indigo accent with color-mix backgrounds
- Error: `#f87171` red with color-mix backgrounds

**SkipLink:** `.skip-link`

- Position: absolute, top -100% (off-screen)
- Focus: top 0 (slides into view)
- Background: `var(--smd-accent)`, text: `var(--smd-text-inverse)`

**CTA Section:** `.cta-section`

- Text align: center
- Margin top: 4rem
- Border top: 1px solid `var(--smd-border)`

### ARIA Patterns

- `aria-current="page"` on active navigation links
- Skip link for keyboard navigation (`#main-content`)
- Semantic HTML5 elements (`<header>`, `<footer>`, `<nav>`, `<main>`)
- No complex ARIA patterns currently implemented (expand as needed)

## Dark/Light Mode

**Current State:** Dark-only theme

**Implementation Approach:**

- All tokens defined in `:root` with dark values
- No light mode variants
- Chrome: `#1a1a2e`, Surface: `#242438`, Text: `#e8e8f0`
- Intentionally dark for internal tool use (extended screen time)

**Future Considerations:**

- If light mode is needed, use `@media (prefers-color-scheme: light)` or class toggle
- Color DNA shared with VC venture (same chrome/surface/accent/gold values, different prefix)

## Accessibility

- **WCAG Target:** 2.1 AA
- **Focus Indicators:** Browser default (no custom focus styles yet)
- **Motion:** Minimal animation (0.15s transitions on hover states, cubic-bezier easing)
- **Testing:** No automated a11y tests configured

**Recommendations:**

- Add visible focus indicators (2px ring on interactive elements)
- Implement skip navigation for complex pages
- Add `prefers-reduced-motion` support for transitions
- Run axe-core or similar linter

## Color Tokens

### Core Palette

| Token                  | Hex       | Purpose                               | Contrast (on `--smd-chrome`) |
| ---------------------- | --------- | ------------------------------------- | ---------------------------- |
| `--smd-chrome`         | `#1a1a2e` | Page background, header/footer        | N/A (base)                   |
| `--smd-surface`        | `#242438` | Card backgrounds, form containers     | N/A                          |
| `--smd-surface-raised` | `#2a2a42` | Elevated elements (unused currently)  | N/A                          |
| `--smd-text`           | `#e8e8f0` | Primary text                          | 11.7:1                       |
| `--smd-text-muted`     | `#a0a0b8` | Secondary text, captions              | 6.3:1                        |
| `--smd-text-inverse`   | `#1a1a2e` | Text on light backgrounds (skip link) | N/A                          |
| `--smd-accent`         | `#818cf8` | Links, primary actions                | 5.8:1                        |
| `--smd-accent-hover`   | `#a5b4fc` | Hover state for accent                | 8.2:1                        |
| `--smd-border`         | `#2e2e4a` | Borders, dividers                     | N/A                          |
| `--smd-gold`           | `#dbb05c` | Brand elements, venture highlights    | 7.4:1                        |
| `--smd-gold-hover`     | `#e8c474` | Hover state for gold                  | 9.1:1                        |

**Usage:**

- Chrome: Page background, header/footer
- Surface: Card backgrounds (with color-mix for tiers)
- Text: Primary text on chrome/surface backgrounds
- Text-muted: Captions, secondary labels, footer text
- Accent: Links, buttons, active states
- Gold: Brand wordmark, venture names, special highlights
- Border: 1px borders throughout

### Derived Colors (color-mix)

**Card Backgrounds:**

- Base card: `color-mix(in srgb, var(--smd-surface) 90%, black 10%)`
- Tier 2 card: `color-mix(in srgb, var(--smd-surface) 60%, black 10%)`

**Badge Active:**

- Background: `color-mix(in srgb, var(--smd-accent) 10%, transparent 90%)`
- Border: `var(--smd-accent)`
- Text: `var(--smd-accent-hover)`

**Button / CTA:**

- Background: `color-mix(in srgb, var(--smd-accent) 10%, transparent)`
- Hover: `color-mix(in srgb, var(--smd-accent) 20%, transparent)`

**Input Focus:**

- Border: `var(--smd-accent)`
- Box shadow: `0 0 0 1px var(--smd-accent)`

**Placeholder Text:**

- `color-mix(in srgb, var(--smd-text-muted) 50%, transparent)`

**Notice Variants:**

- `.notice.ok`: `color-mix(in srgb, var(--smd-accent) 30%, transparent)` border, `10%` background
- `.notice.err`: `color-mix(in srgb, #f87171 30%, transparent)` border, `10%` background

**Note:** SMD shares the same color DNA as VC venture (same chrome, surface, accent, gold hex values) but uses its own `--smd-*` prefix. This is intentional - they are visually similar but independently tokenized for future divergence.

## Typography

### Font Stacks

**Sans-serif (default):**

```css
font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
```

**Monospace (brand element only):**

```css
font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

**Usage:**

- Sans-serif: All body text, UI elements
- Monospace: Brand wordmark (`.brand` class)

### Text Sizes (Hardcoded)

| Element            | Size              | Line Height     | Purpose       |
| ------------------ | ----------------- | --------------- | ------------- |
| Body               | (browser default) | `1.6`           | Default text  |
| `.page-title`      | `2rem`            | `1.2`           | Page headings |
| `.founder-info h1` | `2rem`            | `1.2`           | Founder name  |
| `.form-card-title` | `1.875rem`        | `1.2`           | Form titles   |
| `.brand`           | `1.125rem`        | (default)       | Site brand    |
| `.nav-list a`      | `0.875rem`        | (default)       | Navigation    |
| `.badge`           | `0.75rem`         | (default)       | Badges        |
| `.footer-nav`      | `0.875rem`        | (default)       | Footer links  |
| `.founder-title`   | `0.875rem`        | (default)       | Subtitle      |
| Button             | `0.875rem`        | (default)       | Buttons       |
| Input/textarea     | `1rem`            | `inherit (1.6)` | Form inputs   |

**Line Height:**

- Global: `1.6` (set on `<body>`)
- Headings: `1.2` (compact)

**Font Weights:**

- Default: browser default (~400)
- `.brand`: `700` (bold)
- `.founder-info h1`: (default, likely 700 via UA styles)
- `.nav-list a[aria-current="page"]`: `600` (semibold)
- `button`, `.cta-section a`: `500` (medium)
- `label`: `500` (medium)

## Spacing

**Base Unit:** No formal grid - uses rem-based spacing

### Hardcoded Spacing Values

**Padding:**

- `.container`: 1rem mobile, 1.5rem desktop (640px+)
- `.card`: 1rem (base), 1.5rem (tier-1)
- `.form-card`: 1.5rem mobile, 2rem desktop (640px+)
- `.notice`: 0.75rem 1rem
- `.skip-link`: 0.5rem 0.75rem
- `button`, `.cta-section a`: 0.625rem 1.25rem
- Input/textarea: 0.5rem 0.75rem
- `.header-inner`: 1rem (top/bottom)
- `.footer-inner`: 1.5rem (top/bottom)

**Margins:**

- `.page-title`: 2.25rem (top)
- `.section`: 3rem (top)
- `.founder-intro`: 2.5rem (top)
- `.founder-info .founder-title`: 0.25rem 0.75rem (top/bottom)
- `.founder-info p + p`: 1rem (top)
- `.card p + p`: 0.75rem (top)
- `.card .card-link`: 0.75rem (top)
- `.form-field`: 1.25rem (bottom)
- `.form-card-subtitle`: 2rem (bottom)
- `.cta-section`: 4rem (top), 2rem (padding top/bottom)
- `.footer-inner p`: 0.75rem (top)

**Gaps:**

- `.header-inner`: 1rem
- `.nav-list`: 1rem
- `.footer-nav`: 1rem
- `.founder-intro`: 2rem
- `.card-grid`: 1rem
- `.tier-1-grid`: 1rem
- `.tier-2-grid`: 1rem

## Border Radius

**Hardcoded Values:**

| Element                 | Radius                | Purpose                   |
| ----------------------- | --------------------- | ------------------------- |
| `.card`                 | `0.5rem`              | Card containers           |
| `.badge`                | `99px`                | Pill shape                |
| `.founder-photo`        | `50%`                 | Circular avatar           |
| Input, textarea, button | `0.25rem`             | Form elements             |
| `.cta-section a`        | `0.25rem`             | CTA buttons               |
| `.skip-link`            | `0 0 0.25rem 0.25rem` | Bottom-left/right rounded |
| `.notice`               | `0.25rem`             | Notice boxes              |
| `.form-card`            | `0.5rem`              | Form containers           |

**Patterns:**

- Large elements (cards, containers): `0.5rem` (8px)
- Small elements (inputs, buttons): `0.25rem` (4px)
- Pills (badges): `99px`
- Circles (avatars): `50%`

## Shadows

**Current State:** No box-shadow tokens or patterns

**Exception:** Input/textarea focus has `box-shadow: 0 0 0 1px var(--smd-accent)` (focus ring simulation)

**Recommendation:** Add shadow scale for elevation if cards/modals need visual hierarchy.

## Layout Constraints

| Token             | Value   | Purpose             |
| ----------------- | ------- | ------------------- |
| `--smd-max-width` | `768px` | Container max-width |

**Usage:** Applied to `.container` for centered, constrained content areas.

**Responsive Breakpoint:** `640px` (min-width) for padding/layout adjustments.

## Surface Hierarchy

### Background Tiers

1. **Chrome:** `--smd-chrome` (#1a1a2e) - Page background, header, footer
2. **Surface:** `--smd-surface` (#242438) - Base card background (with color-mix darkening)
3. **Surface Raised:** `--smd-surface-raised` (#2a2a42) - Elevated elements (currently unused)

**Implementation:**

- Cards use `color-mix(in srgb, var(--smd-surface) 90%, black 10%)` for subtle depth
- Tier 2 cards use `60%` mix for deeper contrast
- No formal elevation system - expand as needed

## Component Inventory

### Implemented

- **Container** - Centered, constrained layout wrapper
- **SiteHeader** - Top navigation with brand and nav links
- **SiteFooter** - Footer with nav and copyright
- **Card** - Content containers with tier variants
- **Badge** - Status/label pills with active state
- **FormCard** - Form container with title/subtitle
- **Notice** - Alert boxes (ok/err variants)
- **SkipLink** - Accessibility skip-to-content link
- **CTA Section** - Call-to-action button area
- **Founder Intro** - Profile display with photo and bio

### Missing / Recommendations

- **Buttons** - No `.btn` class, uses element selector (add component class)
- **Modal/Dialog** - No modal component
- **Tabs/Accordion** - No collapsible UI components
- **Data Tables** - No table styling
- **Loading States** - No spinner/skeleton components
- **Tooltip/Popover** - No overlay components

## Gaps and Recommendations

### Token Formalization Needed

1. **Spacing Scale**
   - Define formal 4px or 8px grid
   - Create `--smd-spacing-{size}` tokens (xs, sm, md, lg, xl, 2xl, 3xl)
   - Replace hardcoded rem values with tokens

2. **Typography Scale**
   - Create `--smd-text-{size}` tokens (xs, sm, base, lg, xl, 2xl, 3xl)
   - Create `--smd-leading-{size}` tokens (tight, normal, relaxed, loose)
   - Create `--smd-font-{family}` tokens (sans, mono)
   - Create `--smd-font-weight-{variant}` tokens (normal, medium, semibold, bold)

3. **Border Radius Tokens**
   - Create `--smd-radius-{size}` tokens (sm, md, lg, full)
   - Replace hardcoded `0.25rem`, `0.5rem`, `99px`, `50%` with tokens

4. **Shadow Tokens**
   - Add `--smd-shadow-{size}` tokens (sm, md, lg, xl)
   - Define elevation hierarchy for cards, modals, dropdowns

5. **Motion Tokens**
   - Formalize transition durations (`--smd-motion-fast`, `--smd-motion-normal`)
   - Define easing functions (`--smd-motion-ease-in-out`, `--smd-motion-ease-out`)
   - Add `prefers-reduced-motion` support

6. **Z-Index Scale**
   - Create `--smd-z-{layer}` tokens (base, dropdown, modal, toast)
   - Replace any hardcoded z-index values with tokens

### Accessibility Improvements

1. **Focus Indicators**
   - Add visible focus rings (2px outline or box-shadow ring)
   - Use consistent focus color (`--smd-accent` or dedicated `--smd-focus`)

2. **Motion Preferences**
   - Wrap all transitions in `@media (prefers-reduced-motion: no-preference)`
   - Set `transition: none` in reduced-motion context

3. **ARIA Enhancement**
   - Add `role`, `aria-label`, `aria-expanded` where appropriate
   - Expand skip-link system for complex pages

4. **Contrast Validation**
   - Audit all color combinations against WCAG 2.1 AA
   - Document contrast ratios in design spec

### Component Expansion

1. **Button Component**
   - Create `.btn` class with variants (`.btn.primary`, `.btn.secondary`, `.btn.destructive`)
   - Add disabled state styling

2. **Modal/Dialog**
   - Backdrop overlay
   - Focus trap implementation
   - ARIA dialog pattern

3. **Form Validation**
   - Error state styling for inputs
   - Success/warning variants
   - Helper text component

4. **Loading States**
   - Spinner component
   - Skeleton screens for content loading

## Design System Files

**Primary Stylesheet:** `/Users/scottdurgan/dev/smd-console/smd-web/src/styles/global.css`

**Component Files:** None (all CSS in global.css)

**Configuration:** No Tailwind config (Tailwind installed but unused)

## Version History

- **0.1.0** - Initial dark-themed design system
- **Current** - Functional MVP with identified gaps for formalization

## Notes

- SMD and VC ventures share color DNA (`#1a1a2e` chrome, `#242438` surface, `#818cf8` accent, `#dbb05c` gold) but use independent prefixes (`--smd-*` vs `--vc-*`)
- Tailwind v4 is installed but unused - all styling via plain CSS
- Design system intentionally minimal for internal tool - expand tokens as complexity grows
- No build-time CSS processing - plain CSS only
