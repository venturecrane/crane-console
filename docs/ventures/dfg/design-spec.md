# Durgan Field Guide Design Spec

> Design system reference for Durgan Field Guide agents. Auto-synced to crane-context.
> Design Maturity: Early (minimal foundation exists)
> Last updated: 2026-03-02

## Identity

- **Venture:** Durgan Field Guide
- **Code:** dfg
- **Tagline:** Auction intelligence for resellers
- **Audience:** Solo resellers, auction buyers, flippers
- **Brand Voice:** Practical, data-driven, no-nonsense. Tool for professionals, not hobbyists. Prioritizes speed and clarity over polish.

## Product Concept

Solo resellers spend hours scanning auction listings by hand, missing good deals and overpaying on bad ones. Durgan Field Guide automates the scouting - scraping auction platforms, running AI-powered profit analysis, and surfacing buy-or-pass recommendations.

## Tech Stack

- **Framework:** Astro (content), Next.js (apps: dfg-core, dfg-app)
- **CSS Methodology:** Tailwind v3 (standard `@tailwind` directives)
- **Tailwind Version:** v3 (recommend migrating to v4 with `@theme`)
- **Hosting:** Cloudflare Pages / Vercel

## Component Patterns

**Status:** Minimal. Next.js apps use standard React patterns.

**Current patterns:**

- Gradient backgrounds (body)
- Custom scrollbar styling (webkit)
- Mobile overflow prevention (dfg-app)
- iOS Safari safe area handling (dfg-app with `.pb-safe`, `.pt-safe`)

**Gaps:**

- No documented component library
- No consistent card/panel pattern
- No button component variants
- No form input system

## Dark/Light Mode

**Status:** Implemented via `prefers-color-scheme`.

**Current approach:**

- RGB-based tokens for foreground/background
- Media query toggles values at system preference
- No manual toggle (system-driven only)

**Implementation:** CSS custom properties with media query override.

## Accessibility

- **WCAG Target:** 2.1 AA
- **Focus Indicators:** 2px solid `#3b82f6` (blue-500), 2px offset
- **Motion:** Not yet implemented (add `prefers-reduced-motion` support)
- **Testing:** No automated testing configured yet

**Gaps:**

- No keyboard navigation testing
- No screen reader optimization
- No ARIA patterns documented

## Color Tokens

### Current (Raw, No Prefix)

These tokens exist in `globals.css` but are NOT prefixed with `--dfg-*`:

```css
/* Light mode defaults */
--foreground-rgb: 0, 0, 0;
--background-start-rgb: 249, 250, 251;
--background-end-rgb: 255, 255, 255;

/* Dark mode (prefers-color-scheme: dark) */
--foreground-rgb: 255, 255, 255;
--background-start-rgb: 17, 24, 39; /* gray-900 */
--background-end-rgb: 31, 41, 55; /* gray-800 */
```

**Usage:**

```css
color: rgb(var(--foreground-rgb));
background: linear-gradient(
  to bottom,
  rgb(var(--background-start-rgb)),
  rgb(var(--background-end-rgb))
);
```

**Hard-coded values:**

- Focus outline: `#3b82f6` (blue-500)
- Scrollbar thumb: `#cbd5e1` (slate-300) / hover: `#94a3b8` (slate-400)

### Proposed Migration to `--dfg-*` Tokens

Replace raw tokens with venture-prefixed system. Light mode primary, dark mode override:

#### Backgrounds

```css
--dfg-bg: #f9fafb; /* gray-50 - app background */
--dfg-surface: #ffffff; /* white - cards, panels */
--dfg-surface-raised: #f3f4f6; /* gray-100 - elevated elements */

@media (prefers-color-scheme: dark) {
  --dfg-bg: #111827; /* gray-900 */
  --dfg-surface: #1f2937; /* gray-800 */
  --dfg-surface-raised: #374151; /* gray-700 */
}
```

#### Text

```css
--dfg-text-primary: #111827; /* gray-900 - primary text */
--dfg-text-secondary: #4b5563; /* gray-600 - secondary text */
--dfg-text-muted: #6b7280; /* gray-500 - labels, captions */

@media (prefers-color-scheme: dark) {
  --dfg-text-primary: #f9fafb; /* gray-50 */
  --dfg-text-secondary: #9ca3af; /* gray-400 */
  --dfg-text-muted: #6b7280; /* gray-500 - same in both modes */
}
```

#### Accent & Interactive

```css
--dfg-accent: #3b82f6; /* blue-500 - primary actions */
--dfg-accent-hover: #2563eb; /* blue-600 - hover state */
--dfg-accent-active: #1d4ed8; /* blue-700 - active/pressed */

/* No dark mode override - blue works in both modes */
```

**Rationale:** Blue from existing focus color. Neutral, professional, data-focused.

#### Borders

```css
--dfg-border: #e5e7eb; /* gray-200 - subtle borders */
--dfg-border-strong: #d1d5db; /* gray-300 - emphasized borders */

@media (prefers-color-scheme: dark) {
  --dfg-border: #374151; /* gray-700 */
  --dfg-border-strong: #4b5563; /* gray-600 */
}
```

#### Semantic Colors

```css
--dfg-success: #059669; /* emerald-600 - good deal, profit */
--dfg-warning: #d97706; /* amber-600 - proceed with caution */
--dfg-error: #dc2626; /* red-600 - bad deal, loss */

/* No dark mode override - semantic colors maintain meaning */
```

**Usage:**

- Success: Profitable deal, margin confirmed, buy signal
- Warning: Thin margin, missing data, needs verification
- Error: Loss, overpriced, pass signal

### Migration Strategy

1. Add `--dfg-*` tokens alongside existing raw tokens
2. Update components one at a time to use new tokens
3. Remove raw tokens once migration complete
4. Consider Tailwind v4 migration at same time (custom properties native)

## Typography

**Status:** System defaults only. No custom fonts.

**Current:**

```css
font-family:
  system-ui,
  -apple-system,
  'Segoe UI',
  sans-serif;
```

**Proposed scale (Tailwind defaults):**

- xs: 0.75rem (12px) - table data, timestamps
- sm: 0.875rem (14px) - secondary text
- base: 1rem (16px) - body text
- lg: 1.125rem (18px) - section headings
- xl: 1.25rem (20px) - page headings
- 2xl: 1.5rem (24px) - dashboard headings

**Recommendation:** Keep system fonts. Speed matters more than brand typography for this audience.

## Spacing

**Status:** Using Tailwind default spacing scale (4px base unit).

**Common patterns observed:**

- Mobile padding: `p-4` (16px)
- Card padding: `p-6` (24px)
- Section gaps: `gap-4` to `gap-8` (16px-32px)

**Recommendation:** Continue using Tailwind utilities. No custom spacing scale needed.

## Surface Hierarchy

**Status:** Implemented via gradient backgrounds, but not systematized.

**Current approach:**

- Body: Linear gradient from `background-start-rgb` to `background-end-rgb`
- Components: No consistent surface elevation system

**Proposed hierarchy:**

1. **Background** (`--dfg-bg`): App shell
2. **Surface** (`--dfg-surface`): Cards, panels, content containers
3. **Raised** (`--dfg-surface-raised`): Modals, popovers, elevated elements

**Recommendation:**

- Remove gradient background (adds visual noise, no functional purpose)
- Use flat surfaces with subtle borders
- Reserve raised surfaces for truly elevated elements (modals, tooltips)

## Current Issues & Technical Debt

### Mobile Overflow Prevention (dfg-app)

The `globals.css` in `dfg-app` has extensive mobile overflow fixes:

```css
@media (max-width: 767px) {
  *,
  *::before,
  *::after {
    max-width: 100vw;
  }
  /* ... more overflow constraints */
}
```

**Root cause:** Positioning bugs in container chain, NOT a universal problem requiring global `max-width: 100vw` on all elements.

**Recommendation:** Diagnose and fix specific components causing overflow. Remove global constraint once fixed. (See MEMORY.md CSS section for methodology.)

### iOS Safari Fixes (dfg-app)

Multiple iOS-specific workarounds:

- `dvh` fallback for viewport height
- Hardware acceleration (`-webkit-transform: translateZ(0)`)
- Safe area utilities (`.pb-safe`, `.pt-safe`)

**Status:** These are legitimate iOS Safari fixes. Keep them.

### Tailwind v3 Directives

Current CSS uses Tailwind v3 style:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Recommendation:** Migrate to Tailwind v4 `@theme` when design system stabilizes. Tailwind v4 uses CSS custom properties natively, which aligns with the proposed `--dfg-*` token system.

## Design Maturity Roadmap

### Phase 1: Token Migration (Next)

- [ ] Add `--dfg-*` tokens to `globals.css`
- [ ] Update dfg-core and dfg-app to use new tokens
- [ ] Remove raw RGB tokens
- [ ] Document token usage in component library

### Phase 2: Component Patterns

- [ ] Audit existing components for patterns
- [ ] Document card/panel component
- [ ] Create button component variants
- [ ] Build form input system
- [ ] Extract layout patterns

### Phase 3: Mobile & Accessibility

- [ ] Fix root cause of mobile overflow (remove global constraints)
- [ ] Add `prefers-reduced-motion` support
- [ ] Implement keyboard navigation patterns
- [ ] Add ARIA patterns to interactive components
- [ ] Run axe DevTools audit

### Phase 4: Tailwind v4 Migration

- [ ] Upgrade to Tailwind v4
- [ ] Migrate to `@theme` directive
- [ ] Leverage native custom property support
- [ ] Remove gradient background (or make it intentional)
- [ ] Clean up technical debt

## Migration Notes

### From Raw Tokens to `--dfg-*`

**Before:**

```css
color: rgb(var(--foreground-rgb));
background: rgb(var(--background-start-rgb));
```

**After:**

```css
color: var(--dfg-text-primary);
background: var(--dfg-bg);
```

### From Hard-coded to Tokens

**Before:**

```css
outline: 2px solid #3b82f6;
```

**After:**

```css
outline: 2px solid var(--dfg-accent);
```

### Gradient Background Removal

**Current:**

```css
background: linear-gradient(
  to bottom,
  rgb(var(--background-start-rgb)),
  rgb(var(--background-end-rgb))
);
```

**Proposed:**

```css
background: var(--dfg-bg);
```

**Rationale:** Gradient adds visual complexity with no functional benefit. Flat background is faster, cleaner, more professional for a data-focused tool.

## Notes for Agents

- **Raw tokens still in use.** Do not assume `--dfg-*` tokens exist. Check `globals.css` first.
- **Two apps, two `globals.css` files.** Changes must be applied to both `dfg-core` and `dfg-app`.
- **Mobile overflow fixes are band-aids.** Diagnose root cause before adding more constraints.
- **iOS Safari fixes are intentional.** Do not remove `.pb-safe`, `dvh`, or hardware acceleration.
- **Tailwind v3 still in use.** Do not use Tailwind v4 syntax until migration is complete.
- **No design system exists yet.** Build components as needed, document patterns as they emerge.
- **Speed over polish.** This is a tool for professionals. Prioritize clarity, performance, and data density over visual polish.
