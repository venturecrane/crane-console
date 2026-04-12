# Silicon Crane Design Spec

> Design system reference for Silicon Crane agents. Auto-synced to crane-context.
> Design Maturity: Greenfield
> Last updated: 2026-03-02

## Identity

- **Venture:** Silicon Crane
- **Code:** sc
- **Tagline:** Product validation for founders and teams
- **Audience:** Indie founders, product managers, startup teams
- **Brand Voice:** Structured, encouraging, evidence-driven. Making validation accessible, not intimidating. We help teams move from assumptions to evidence without the overhead of premature building.

## Product Concept

Most product ideas fail because teams build before validating. Silicon Crane helps founders and product teams test assumptions through structured experiments - landing pages, user interviews, and prototypes - before committing to a full build.

## Tech Stack

- **Framework:** Astro (content site), potential Next.js (app)
- **CSS Methodology:** To be determined (recommend Tailwind v4)
- **Tailwind Version:** Not yet implemented
- **Hosting:** Cloudflare Pages

## Component Patterns

**Status:** No components defined yet.

Use standard HTML5 semantic elements. As patterns emerge during development, document them here.

Recommended approach:

- Start with semantic HTML (`<article>`, `<section>`, `<nav>`, etc.)
- Build composable Astro components for repeated patterns
- Use Tailwind utilities for styling
- Extract component classes only when patterns stabilize

## Dark/Light Mode

**Status:** Not yet implemented.

**Proposed approach:** Dark mode primary, with light mode support via `prefers-color-scheme`.

Rationale: Product validation work often happens in low-light environments (late nights, coffee shops). Dark mode reduces eye strain and signals "serious tool" positioning vs consumer-friendly light themes.

## Accessibility

- **WCAG Target:** 2.1 AA
- **Focus Indicators:** 2px solid accent color, 2px offset
- **Motion:** Respect `prefers-reduced-motion`
- **Color Contrast:** All text meets 4.5:1 minimum (7:1 target for body text)
- **Testing:** Use axe DevTools, manual keyboard navigation testing

## Color Tokens (Proposed)

**Status:** No tokens implemented yet. These are starting values for initial implementation.

### Chrome & Surfaces

```css
--sc-chrome: #0f172a; /* slate-900 - dark chrome for dark mode */
--sc-surface: #1e293b; /* slate-800 - primary surface */
--sc-surface-raised: #334155; /* slate-700 - elevated cards, modals */
--sc-border: #334155; /* slate-700 - subtle borders */
```

### Text

```css
--sc-text: #f1f5f9; /* slate-100 - primary text */
--sc-text-muted: #94a3b8; /* slate-400 - secondary text, labels */
--sc-text-inverse: #0f172a; /* slate-900 - text on light backgrounds */
```

### Accent & Interactive

```css
--sc-accent: #06b6d4; /* cyan-500 - primary actions, progress */
--sc-accent-hover: #22d3ee; /* cyan-400 - hover state */
```

**Rationale:** Cyan conveys validation, progress, clarity. Less aggressive than blue, more energetic than gray. Suggests measurement and data.

### Semantic Colors

```css
--sc-success: #10b981; /* emerald-500 - validated hypothesis */
--sc-warning: #f59e0b; /* amber-500 - needs attention, inconclusive */
--sc-error: #ef4444; /* red-500 - invalidated hypothesis */
```

**Usage:**

- Success: Hypothesis validated, experiment successful, clear signal
- Warning: Inconclusive results, needs more data, proceed with caution
- Error: Hypothesis invalidated, experiment failed, pivot signal

### Implementation Notes

Before implementing these tokens:

1. Run `/design-brief` to generate full design definition
2. Consider venture-specific use cases (experiment tracking, hypothesis states)
3. Validate color choices against WCAG AA contrast requirements
4. Test in actual product context before committing

These are proposed starting values, not final implementation.

## Typography (Proposed)

**Status:** Not yet implemented.

**Recommendation:**

```css
--sc-font-sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
--sc-font-mono: 'SF Mono', Monaco, 'Cascadia Code', monospace;
```

**Scale (Tailwind-based):**

- xs: 0.75rem (12px) - labels, captions
- sm: 0.875rem (14px) - secondary text
- base: 1rem (16px) - body text
- lg: 1.125rem (18px) - prominent body text
- xl: 1.25rem (20px) - section headings
- 2xl: 1.5rem (24px) - page headings
- 3xl: 1.875rem (30px) - hero headings

**Line Height:**

- Tight (1.25): Headings
- Normal (1.5): Body text
- Relaxed (1.75): Long-form content

## Spacing (Proposed)

**Status:** Not yet implemented.

**Base unit:** 4px (0.25rem)

**Scale:** Follow Tailwind default spacing scale (4px increments)

- 1 = 4px
- 2 = 8px
- 3 = 12px
- 4 = 16px
- 6 = 24px
- 8 = 32px
- 12 = 48px
- 16 = 64px

**Common patterns:**

- Card padding: 6 (24px)
- Section spacing: 12 (48px)
- Component gap: 4 (16px)
- Button padding: x=4, y=2 (16px horizontal, 8px vertical)

## Surface Hierarchy

**Status:** Proposed.

1. **Chrome** (`--sc-chrome`): App shell, main background
2. **Surface** (`--sc-surface`): Content containers, panels
3. **Raised** (`--sc-surface-raised`): Cards, elevated elements, modals

**Depth signaling:**

- Use subtle borders (`--sc-border`) between same-level surfaces
- Use raised backgrounds for elevated/interactive elements
- Avoid drop shadows (keep interface flat and data-focused)

## Design Maturity Roadmap

### Phase 1: Foundation (Current)

- [ ] Run `/design-brief` to generate full design definition
- [ ] Implement base color tokens
- [ ] Set up Tailwind v4 configuration
- [ ] Create base layout component

### Phase 2: Core Patterns

- [ ] Design and build experiment card component
- [ ] Design hypothesis states UI (draft/active/validated/invalidated)
- [ ] Build navigation pattern
- [ ] Create form input components

### Phase 3: Refinement

- [ ] Establish typography scale in actual product context
- [ ] Document component patterns
- [ ] Build design system reference page
- [ ] Add light mode support

### Phase 4: Polish

- [ ] Custom focus styles for experiment interactions
- [ ] Loading states, skeleton screens
- [ ] Empty states, error states
- [ ] Animation system (if needed, respecting `prefers-reduced-motion`)

## Migration Path

This is a greenfield venture. No migration required.

Start with Tailwind v4 from day one. Use CSS custom properties for color tokens. Build components as patterns emerge from actual product needs, not from abstract design system requirements.

## Notes for Agents

- **Everything is proposed.** Do not reference these tokens as if they exist. Check the codebase first.
- **Run design brief before implementing.** Use `/design-brief` to generate full design definition before building UI.
- **Start minimal.** Build only what the product needs. Avoid premature design system abstraction.
- **Dark mode first.** Light mode is secondary. Optimize for the primary use case.
- **Data-focused UI.** This is a tool for validation work, not a consumer app. Prioritize clarity and information density over visual flourish.
