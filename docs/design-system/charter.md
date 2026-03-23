# Venture Crane Design Charter

> Governance document for the Venture Crane design system. Establishes how design decisions are made, enforced, and extended.
>
> Generated 2026-02-13. Companion to [Design Brief](brief.md) and [PRD](../pm/prd.md).

---

## 1. Design Principles (Normative)

These principles are ordered by priority. When principles conflict, higher-ranked principles win. Every design decision - token addition, component change, layout choice - must be justifiable against this list.

1. **Content Supremacy.** Every visual decision optimizes for reading.
2. **Earned Complexity.** Nothing appears unless it serves a function.
3. **Performance as Brand.** Sub-1s load, zero JS, < 50 KB gzipped.
4. **Contrast and Legibility First.** WCAG AA before aesthetics.
5. **Structural Honesty.** Visual hierarchy reflects information hierarchy.
6. **System Consistency.** Every value comes from the token system. No one-off values.
7. **Quiet Differentiation.** Differentiate through execution quality, not visual novelty.

**Enforcement:** Principles are cited by number in PR reviews and design issues. A change that violates a higher-ranked principle to satisfy a lower-ranked one is rejected. When disagreements arise, the principle ranking is the tiebreaker - not opinion.

---

## 2. Decision-Making Authority

### Who decides what

| Decision Type                                                     | Authority                                                   | Process                                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Brand identity** (accent color, wordmark, tagline, brand voice) | Founder                                                     | Founder reviews options, decides. Documented in design brief.                                            |
| **New design token**                                              | Any agent                                                   | Add token following naming convention. PR review verifies naming and necessity.                          |
| **New component**                                                 | Any agent                                                   | Must include Props interface, ARIA pattern, and all variants. PR review.                                 |
| **Token value change** (e.g., adjusting a hex value)              | Any agent if contrast-improving; Founder if brand-affecting | Contrast improvements are auto-approved with verification. Brand color changes require founder sign-off. |
| **Component API change** (adding/removing props)                  | Any agent                                                   | PR review. Must not break existing usage.                                                                |
| **New page/screen**                                               | Any agent                                                   | Must use existing tokens and components. No new one-off styles.                                          |
| **Accessibility exception**                                       | None                                                        | No exceptions to WCAG 2.1 AA. There is no authority to waive this.                                       |
| **Performance budget exception**                                  | Founder                                                     | Must provide measured justification. Temporary exceptions get a follow-up issue.                         |

### Escalation path

Agent disagrees with charter rule → cites specific rule and proposes amendment → Founder reviews → charter updated or proposal rejected.

---

## 3. Token Naming Conventions

### Namespace

All tokens use the `--vc-` prefix (Venture Crane). This prevents collisions if tokens are ever shared across the portfolio (KE, DFG, SC, DC each use their own prefix).

### Structure

```
--vc-{category}-{element}-{modifier}
```

| Segment      | Required | Description      | Examples                                                                                      |
| ------------ | -------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `--vc-`      | Yes      | Venture prefix   | -                                                                                             |
| `{category}` | Yes      | Token category   | `color`, `space`, `text`, `font`, `leading`, `weight`, `radius`, `shadow`, `duration`, `ease` |
| `{element}`  | Yes      | What it styles   | `chrome`, `surface`, `text`, `accent`, `body`, `mono`                                         |
| `{modifier}` | No       | Variant or state | `hover`, `muted`, `raised`, `light`, `subtle`                                                 |

### Examples

| Token                   | Breakdown                   |
| ----------------------- | --------------------------- |
| `--vc-color-chrome`     | color / chrome / -          |
| `--vc-color-text-muted` | color / text / muted        |
| `--vc-space-4`          | space / scale-step-4 / -    |
| `--vc-text-base`        | text (font-size) / base / - |
| `--vc-duration-fast`    | duration / fast / -         |

### Rules for adding tokens

1. **Check if an existing token covers the use case.** If `--vc-space-4` (16px) works, do not create `--vc-space-card-padding: 16px`.
2. **No aliases.** A token must represent a unique value. Two tokens with the same value are a bug unless they serve genuinely different semantic purposes (e.g., `--vc-color-chrome` and `--vc-color-text-inverse` are both `#1a1a2e` but serve different roles).
3. **No component-specific tokens.** Tokens are system-level. Use Tailwind classes or component-scoped styles for component-specific adjustments.
4. **Spacing uses scale steps, not pixel names.** `--vc-space-4` (not `--vc-space-16px`). The value may change across breakpoints; the name stays stable.
5. **New tokens require a PR.** Add to `global.css` `:root` block and the corresponding Tailwind config mapping. Both files must be updated in the same commit.

### Rules for changing token values

1. **Contrast check required.** Any color token change must include before/after WCAG contrast ratios for all foreground/background pairings where the token is used.
2. **No silent changes.** Token value changes must be in a dedicated commit with a clear message: `design: update --vc-color-accent from #5eead4 to #XXX (reason)`.
3. **Tailwind stays in sync.** The Tailwind config references CSS custom properties (`var(--vc-color-chrome)`), not hardcoded values. If you find a hardcoded hex in `tailwind.config.mjs`, that's a bug.

---

## 4. Component Contribution Guidelines

### Required for every new component

| Requirement           | Description                                                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Props interface**   | TypeScript-style interface in a comment block at the top of the `.astro` file. All props typed. Optional props marked with `?`.     |
| **ARIA pattern**      | Landmark role, widget role, or explicit "no role needed" with justification.                                                        |
| **Variants**          | All variants listed. Each variant must be demonstrable.                                                                             |
| **Empty state**       | If the component displays data, it must handle the empty case (hidden, placeholder text, or intentional blank).                     |
| **Keyboard behavior** | Document what happens on Tab, Enter, Space, Escape, Arrow keys - or state "no interactive elements."                                |
| **Token usage only**  | All colors, spacing, font sizes, radii, and shadows must reference `--vc-*` tokens or their Tailwind mappings. No hardcoded values. |

### Naming

- **Files:** PascalCase. `ArticleCard.astro`, not `article-card.astro`.
- **CSS classes (if any):** Prefixed with `vc-`. Only used for prose styling and complex selectors. `vc-prose`, not `prose` or `article-prose`.
- **Slots:** Default slot preferred. Named slots only when a component has multiple content insertion points.

### Component modification rules

1. **Additive changes are preferred.** Add a new variant rather than changing existing variant behavior.
2. **Prop removal is a breaking change.** Requires updating all call sites in the same PR.
3. **No wrapper components.** If `ArticleCard` needs a link, the link goes inside `ArticleCard` - do not create `LinkedArticleCard`.

---

## 5. Accessibility Standards

### Baseline: WCAG 2.1 AA

This is not a target - it is a floor. There are no exceptions and no authority to grant exceptions.

### Color contrast

| Context                              | Minimum Ratio               | Standard |
| ------------------------------------ | --------------------------- | -------- |
| Normal text (< 18px or < 14px bold)  | 4.5:1                       | AA       |
| Large text (>= 18px or >= 14px bold) | 3:1                         | AA       |
| UI components and graphical objects  | 3:1                         | AA       |
| Focus indicators                     | 3:1 against adjacent colors | AA       |

**Enforcement:** Every PR that adds or changes a color value must include the contrast ratio in the PR description. Omitting the ratio is grounds for rejection.

### Keyboard navigation

- Every interactive element reachable via Tab.
- `<details>/<summary>` natively keyboard accessible (Enter/Space to toggle).
- Scrollable regions (`CodeBlock`, `TableWrapper`) get `tabindex="0"` for keyboard scroll.
- `SkipLink` is the first focusable element on every page.
- No keyboard traps. Escape closes any overlay (though MVP has none).

### Focus indicators

- 2px solid `--vc-color-accent-hover` (`#99f6e4`) outline, 2px offset.
- Must be visible on both chrome and surface backgrounds.
- Transition: `--vc-duration-instant` (100ms).
- Never remove `:focus-visible` outlines. If a design "looks better" without them, the design is wrong.

### Reduced motion

All `--vc-duration-*` tokens collapse to `0ms` under `prefers-reduced-motion: reduce`. This is handled at the token level - no component-level checks needed.

### Screen reader support

- `<time>` elements with `datetime` attribute for all dates.
- External links announce "(opens in new tab)" via `aria-label` or visually hidden text.
- Single `<h1>` per page, no skipped heading levels.
- `aria-current="page"` on active navigation links.
- Live regions for dynamic content (none at MVP, but the pattern is established for future use).

### Image and media

- All `<img>` tags require `alt` text. Decorative images get `alt=""` and `aria-hidden="true"`.
- No autoplaying media.
- No content conveyed solely through color (status badges use text labels).

---

## 6. CSS Architecture Rules

### Three layers, strict boundaries

| Layer                      | File                   | Responsibility    | When to use                                           |
| -------------------------- | ---------------------- | ----------------- | ----------------------------------------------------- |
| 1. Custom properties       | `global.css` `:root`   | Token definitions | Always - source of truth                              |
| 2. Tailwind utilities      | Component markup       | Primary styling   | Default for all component styling                     |
| 3. Component-scoped styles | Astro `<style>` blocks | Complex selectors | Only for `.vc-prose`, Shiki output, `details/summary` |

### Rules

1. **No `@apply`.** Inline Tailwind classes in markup are clearer for 14 components. The `.vc-prose` class is the sole exception pattern (element-targeted selectors for markdown output).
2. **No hardcoded values in markup.** `bg-chrome` (Tailwind token mapping) not `bg-[#1a1a2e]`. Arbitrary values in brackets indicate a missing token - add the token instead.
3. **No `!important`.** If specificity is a problem, the architecture is wrong.
4. **No CSS-in-JS.** Zero JavaScript means zero runtime styling.
5. **Tailwind references custom properties.** The Tailwind config maps to `var(--vc-*)` values, not hex codes. This keeps CSS custom properties as the single source of truth.

---

## 7. Performance Budget

| Metric                      | Target                                           | Enforcement                           |
| --------------------------- | ------------------------------------------------ | ------------------------------------- |
| FCP                         | < 800ms (simulated 3G)                           | Lighthouse CI in pipeline             |
| LCP                         | < 1000ms (simulated 3G)                          | Lighthouse CI in pipeline             |
| CLS                         | < 0.05                                           | Lighthouse CI in pipeline             |
| TBT                         | 0ms                                              | Zero JavaScript policy (binary check) |
| CSS (entire site)           | < 12 KB gzipped                                  | Build output check                    |
| Total homepage              | < 50 KB gzipped                                  | Build output check                    |
| JavaScript                  | 0 KB (Cloudflare Analytics is platform-injected) | Build output check                    |
| Lighthouse (all categories) | >= 95, SEO = 100                                 | Lighthouse CI threshold               |

**Enforcement:** Performance budget violations block merge. A PR that causes any metric to exceed its target is rejected until the regression is resolved. No "we'll fix it later" exceptions - budget violations compound.

---

## 8. Dark Mode Policy

Single dark theme at MVP. No light mode, no toggle. The dark theme is brand identity, not a user preference.

### Surface hierarchy (strict)

| Surface | Token                       | Hex       | Usage                                         |
| ------- | --------------------------- | --------- | --------------------------------------------- |
| Chrome  | `--vc-color-chrome`         | `#1a1a2e` | Header, footer, homepage, portfolio, 404      |
| Surface | `--vc-color-surface`        | `#242438` | Article reading area, methodology, build logs |
| Raised  | `--vc-color-surface-raised` | `#2a2a42` | Cards, blockquotes                            |
| Code    | `--vc-color-code-bg`        | `#14142a` | Code blocks (recessed, darker than chrome)    |

**Rule:** Hard edge between chrome and surface. No gradient. No transparency blending. The transition is a clean break.

**Future light theme:** Requires only redefining `--vc-*` values under a new selector. No structural CSS changes. This is why tokens are the source of truth - the theme layer is swappable.

---

## 9. How This Charter Is Enforced

This charter has no automated test suite that verifies every rule. Enforcement operates at three levels:

### Level 1: Automated (CI/CD)

These rules are enforced by tooling and block merge on failure:

- **Performance budget** - Lighthouse CI runs on every PR. Thresholds are configured in the pipeline. A score below target fails the build.
- **Zero JavaScript** - Build output is checked for `.js` files. Any JavaScript (beyond platform-injected Cloudflare Analytics) fails the build.
- **CSS bundle size** - Build output gzipped size is measured. Exceeding 12 KB fails.
- **Linting/formatting** - Prettier and ESLint run via pre-commit hooks. Malformed code never reaches review.
- **TypeScript** - Type checking catches prop interface violations at build time.

### Level 2: Agent self-governance (PR authoring)

AI agents are the primary contributors to this codebase. They enforce the charter by following it during implementation:

- **Token usage** - Agents use `--vc-*` tokens and Tailwind mappings. They do not introduce hardcoded hex values, magic pixel numbers, or one-off spacing. If an agent needs a value that doesn't exist as a token, it adds the token first (following naming conventions in Section 3), then uses it.
- **Contrast verification** - When an agent adds or changes a color, it calculates and documents the WCAG contrast ratio in the PR description. This is a charter requirement, not optional documentation.
- **Component completeness** - Agents do not ship components without Props interfaces, ARIA patterns, and variant documentation. The checklist in Section 4 is the minimum.
- **Principle citation** - When a design tradeoff occurs, agents cite the relevant principle by number. "Rejected web font per Principle 3 (Performance as Brand)" is the expected format.

This level works because agents receive the charter as context. The charter is referenced in `CLAUDE.md` and is part of the design documentation that agents read during `/sod`. An agent that violates the charter is not being malicious - it's missing context. The fix is ensuring the charter is in the agent's context window, not adding more automation.

### Level 3: Founder review (final authority)

The founder reviews PRs and has final authority on all design decisions. The charter supports this by making decisions legible:

- **PR descriptions cite charter sections.** A PR that adds a component should reference Section 4 requirements. A PR that changes a color should include contrast ratios per Section 5.
- **Disagreements reference principles.** If an agent proposes something the founder questions, the conversation is grounded in the principle hierarchy, not subjective preference.
- **Charter amendments go through the founder.** Agents can propose changes to this charter via PR. The founder approves or rejects. The charter evolves, but deliberately.

### What happens when a rule is violated

1. **Automated rule (Level 1):** PR is blocked. Fix the violation. No override path except Founder exception for performance budget (see Section 2).
2. **Agent governance rule (Level 2):** PR reviewer (founder or another agent) requests changes citing the specific charter section. The author fixes the violation. Repeated violations of the same rule suggest the charter is not in the agent's context - fix the context, not the agent.
3. **Ambiguous case:** If the charter doesn't clearly cover a situation, the agent makes a judgment call, documents the reasoning in the PR, and the founder sets precedent. If the precedent is worth codifying, the charter is updated.

### What this charter does NOT do

- It does not replace taste. The charter catches systematic errors (wrong token, missing ARIA role, contrast failure). It does not prevent ugly designs - that requires human judgment.
- It does not prevent all mistakes. An agent can follow every rule and still produce a bad layout. The charter reduces the error surface; it does not eliminate it.
- It does not auto-update. When the design system evolves (light theme, new components, new token categories), this charter must be updated to match. A stale charter is worse than no charter - it creates false confidence.

---

_Companion documents: [Design Brief](brief.md) | [PRD](../pm/prd.md) | [Contributions](contributions/)_
