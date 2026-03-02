# Wireframe Guidelines

Guidelines for generating and using wireframes in the Venture Crane workflow.

## When to Wireframe

**Decision rule:** Does this story change what a user sees in a browser or app?

- **Yes** (new page, layout change, new component, UI redesign) - wireframe required
- **No** (API endpoint, background job, config change, pure backend logic) - skip, mark "N/A" in Agent Brief

Bug fixes skip wireframes unless the fix changes layout.

## What PM Generates

An interactive HTML/CSS prototype - a single self-contained HTML file with inline CSS and JS. No external dependencies.

### Prompt Template for Claude Desktop

Feed Claude Desktop the acceptance criteria and this prompt pattern:

> Generate an interactive HTML wireframe for this feature:
>
> [Paste acceptance criteria here]
>
> Requirements:
>
> - Single self-contained HTML file (inline CSS and JS, no external dependencies)
> - Mobile-first responsive layout with breakpoints at 640px (sm), 768px (md), 1024px (lg)
> - Semantic HTML5 (nav, main, aside, footer - not div soup)
> - Plain CSS (no frameworks)
> - Show key states: default, empty, loading, error (where applicable)
> - Interactive elements should be clickable/demonstrable where possible
> - Use realistic content structure from the acceptance criteria (not Lorem Ipsum)
> - Include accessibility landmarks

Iterate from there: "move X above Y", "add empty state", "make the CTA more prominent", "show the error state for invalid input."

### Wireframe MUST Show

- Component placement and hierarchy
- Responsive behavior (mobile, tablet, desktop)
- Key interaction states (empty, loading, error, success - where applicable)
- Content structure (headings, body text, metadata, CTAs)

### Wireframe Does NOT Need

- Exact colors (use semantic names: primary, secondary, danger)
- Exact spacing values (use visual consistency, not pixel measurements)
- Icon artwork (use text labels or placeholders)
- Animations (describe in a comment, don't implement)
- Production data (use realistic examples from the ACs)
- Brand typography (use system fonts)

## File Conventions

- **Path:** `/docs/wireframes/{issue-number}/`
- **Main file:** `index.html`
- **Additional states (optional):** `empty-state.html`, `error-state.html`, `mobile-detail.html`
- **Self-contained:** All CSS and JS inline. No CDN links, no npm packages, no build step.

## Conflict Resolution

Wireframe is a visual interpretation of the acceptance criteria. **AC always wins** if there's ambiguity.

If Dev finds a conflict between wireframe and AC:

1. Dev applies `needs:pm` label immediately
2. PM updates EITHER wireframe OR AC to resolve (Dev does not decide)
3. PM documents change in issue comment and removes `needs:pm`
4. Dev resumes from updated source of truth

## Freeze Rule

Once Dev marks issue `status:in-progress`, the wireframe is frozen. Any PM changes after that point require Captain approval.

## What Wireframes Are NOT

- Not final designs (no brand colors, exact typography, or pixel-perfect asset placement)
- Not a Figma replacement for design-heavy products
- Not required for non-UI work
- Not a separate source of truth (ACs are canonical)
