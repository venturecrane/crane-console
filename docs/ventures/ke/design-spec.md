# Kid Expenses Design Spec

> Design system reference for Kid Expenses agents. Auto-synced to crane-context.
> Design Maturity: Tier 2 - Production-ready with token system, component library, semantic utilities. Active iteration on patterns.
> Last updated: 2026-03-02

## Identity

- **Venture:** Kid Expenses
- **Code:** ke
- **Tagline:** Expense tracking for co-parents
- **Audience:** Divorced or separated parents managing shared child expenses
- **Brand Voice:** Calm, neutral, respectful. Reduces conflict. Clear communication around money. No judgment, no taking sides.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **CSS Methodology:** Tailwind v4 with CSS custom properties, semantic token system
- **Tailwind Version:** 4.x
- **Hosting:** Vercel (planned)
- **Fonts:** Geist Sans (body), Geist Mono (code) - Next.js built-in, no external requests
- **Auth:** Clerk

## Component Patterns

- **ExpenseCard** - Individual expense display with status, amount, metadata
- **StatusBadge** - Color-coded expense status indicators
- **ExpenseForm** - Multi-step expense entry form
- **BottomNav** - Mobile-first bottom navigation bar
- **Sheet** - Modal drawer component (mobile-friendly)
- **QuestionThread** - Nested question/response UI for expense discussions

**Naming convention:** PascalCase component files, `.tsx` extension.

**Design rule:** No raw Tailwind color classes (e.g., `bg-indigo-600`, `text-slate-500`) in page code. Use semantic token classes (`bg-ke-surface`, `text-ke-primary`) or component primitives instead.

**ARIA patterns:** Semantic HTML, button roles for interactive elements, proper form labels, focus management in Sheet modals, status badges with aria-label for screen readers.

## Dark/Light Mode

Dual-theme system via `prefers-color-scheme`.

- **Light mode:** Default if no preference
- **Dark mode:** Activated by OS/browser preference
- **No manual toggle:** Respects system preference only

Implementation: CSS custom properties redefined within `@media (prefers-color-scheme: dark)` block.

## Accessibility

- **WCAG Target:** 2.1 AA
- **Focus Indicators:** Native browser focus with enhanced contrast
- **Motion:** Respects `prefers-reduced-motion`
- **Touch Targets:** 44x44px minimum (mobile-first design)
- **Color Independence:** Status conveyed through icons + text, not color alone
- **Testing:** Manual keyboard nav, Clerk components are WCAG compliant

## Color Tokens

### Light Mode (Root)

#### Background Surfaces

| Token              | Hex     | Purpose                         |
| ------------------ | ------- | ------------------------------- |
| `--ke-bg`          | #f8fafc | Page background                 |
| `--ke-surface`     | #ffffff | Card backgrounds, panels        |
| `--ke-elevated`    | #f1f5f9 | Elevated surfaces, hover states |
| `--ke-interactive` | #e2e8f0 | Interactive element backgrounds |

#### Text

| Token                 | Hex     | Purpose                     | Contrast (on bg) |
| --------------------- | ------- | --------------------------- | ---------------- |
| `--ke-text-primary`   | #0f172a | Primary body text           | 16.7:1 (AAA)     |
| `--ke-text-secondary` | #475569 | Secondary text, labels      | 7.3:1 (AA)       |
| `--ke-text-muted`     | #64748b | Tertiary text, placeholders | 4.7:1 (AA)       |
| `--ke-text-inverse`   | #ffffff | Text on dark backgrounds    | N/A              |

#### Borders

| Token                   | Hex     | Purpose                   |
| ----------------------- | ------- | ------------------------- |
| `--ke-border`           | #e2e8f0 | Default borders, dividers |
| `--ke-divider`          | #f1f5f9 | Subtle dividers           |
| `--ke-secondary-border` | #cbd5e1 | Secondary action borders  |

#### Accent Colors

| Token                   | Hex     | Purpose                 | Contrast (on bg) |
| ----------------------- | ------- | ----------------------- | ---------------- |
| `--ke-accent`           | #4f46e5 | Primary CTAs, links     | 5.1:1 (AA)       |
| `--ke-accent-hover`     | #4338ca | Accent hover state      | 5.8:1 (AA)       |
| `--ke-accent-soft`      | #e0e7ff | Soft accent backgrounds | N/A              |
| `--ke-accent-soft-text` | #4338ca | Text on soft accent bg  | 5.8:1 (AA)       |
| `--ke-focus`            | #6366f1 | Focus indicators        | 4.7:1 (AA)       |

#### Secondary Accents

| Token                  | Hex     | Purpose                |
| ---------------------- | ------- | ---------------------- |
| `--ke-secondary-text`  | #334155 | Secondary action text  |
| `--ke-secondary-hover` | #f8fafc | Secondary action hover |

#### Status Colors

| Token                         | Hex     | Purpose                       | Use Case                 |
| ----------------------------- | ------- | ----------------------------- | ------------------------ |
| `--ke-status-posted-bg`       | #d1fae5 | Posted expense background     | New expense submitted    |
| `--ke-status-posted-text`     | #047857 | Posted expense text           | Badge text               |
| `--ke-status-questioned-bg`   | #fef3c7 | Questioned expense background | Expense under discussion |
| `--ke-status-questioned-text` | #b45309 | Questioned expense text       | Badge text               |
| `--ke-status-resolved-bg`     | #e0e7ff | Resolved expense background   | Questions answered       |
| `--ke-status-resolved-text`   | #4338ca | Resolved expense text         | Badge text               |
| `--ke-status-settled-bg`      | #f1f5f9 | Settled expense background    | Payment completed        |
| `--ke-status-settled-text`    | #64748b | Settled expense text          | Badge text               |
| `--ke-status-closed-bg`       | #fee2e2 | Closed expense background     | Rejected or archived     |
| `--ke-status-closed-text`     | #dc2626 | Closed expense text           | Badge text               |

#### Attention/Alert

| Token                   | Hex     | Purpose                  |
| ----------------------- | ------- | ------------------------ |
| `--ke-attention-border` | #fbbf24 | Attention-needed borders |
| `--ke-attention-bg`     | #fffbeb | Attention backgrounds    |

#### Financial Values

| Token           | Hex     | Purpose                  |
| --------------- | ------- | ------------------------ |
| `--ke-positive` | #059669 | Positive balance, income |
| `--ke-negative` | #dc2626 | Negative balance, owed   |

### Dark Mode (prefers-color-scheme: dark)

#### Background Surfaces

| Token              | Hex     | Purpose                         |
| ------------------ | ------- | ------------------------------- |
| `--ke-bg`          | #020617 | Page background                 |
| `--ke-surface`     | #0f172a | Card backgrounds, panels        |
| `--ke-elevated`    | #1e293b | Elevated surfaces, hover states |
| `--ke-interactive` | #334155 | Interactive element backgrounds |

#### Text

| Token                 | Hex     | Purpose                     | Contrast (on bg) |
| --------------------- | ------- | --------------------------- | ---------------- |
| `--ke-text-primary`   | #f1f5f9 | Primary body text           | ~16:1 (AAA)      |
| `--ke-text-secondary` | #94a3b8 | Secondary text, labels      | ~6:1 (AA)        |
| `--ke-text-muted`     | #64748b | Tertiary text, placeholders | ~4.5:1 (AA)      |
| `--ke-text-inverse`   | #ffffff | Text on dark backgrounds    | N/A              |

#### Borders

| Token                   | Hex     | Purpose                   |
| ----------------------- | ------- | ------------------------- |
| `--ke-border`           | #1e293b | Default borders, dividers |
| `--ke-divider`          | #1e293b | Subtle dividers           |
| `--ke-secondary-border` | #334155 | Secondary action borders  |

#### Accent Colors

| Token                   | Hex                      | Purpose                 | Contrast (on bg) |
| ----------------------- | ------------------------ | ----------------------- | ---------------- |
| `--ke-accent`           | #6366f1                  | Primary CTAs, links     | ~4.8:1 (AA)      |
| `--ke-accent-hover`     | #4f46e5                  | Accent hover state      | ~5.5:1 (AA)      |
| `--ke-accent-soft`      | rgba(99, 102, 241, 0.15) | Soft accent backgrounds | N/A              |
| `--ke-accent-soft-text` | #a5b4fc                  | Text on soft accent bg  | ~7:1 (AA)        |
| `--ke-focus`            | #818cf8                  | Focus indicators        | ~5.8:1 (AA)      |

#### Secondary Accents

| Token                  | Hex     | Purpose                |
| ---------------------- | ------- | ---------------------- |
| `--ke-secondary-text`  | #cbd5e1 | Secondary action text  |
| `--ke-secondary-hover` | #1e293b | Secondary action hover |

#### Status Colors

| Token                         | Hex/RGBA                 | Purpose                       | Use Case                 |
| ----------------------------- | ------------------------ | ----------------------------- | ------------------------ |
| `--ke-status-posted-bg`       | rgba(16, 185, 129, 0.15) | Posted expense background     | New expense submitted    |
| `--ke-status-posted-text`     | #34d399                  | Posted expense text           | Badge text               |
| `--ke-status-questioned-bg`   | rgba(245, 158, 11, 0.15) | Questioned expense background | Expense under discussion |
| `--ke-status-questioned-text` | #fbbf24                  | Questioned expense text       | Badge text               |
| `--ke-status-resolved-bg`     | rgba(99, 102, 241, 0.15) | Resolved expense background   | Questions answered       |
| `--ke-status-resolved-text`   | #a5b4fc                  | Resolved expense text         | Badge text               |
| `--ke-status-settled-bg`      | #1e293b                  | Settled expense background    | Payment completed        |
| `--ke-status-settled-text`    | #94a3b8                  | Settled expense text          | Badge text               |
| `--ke-status-closed-bg`       | rgba(239, 68, 68, 0.15)  | Closed expense background     | Rejected or archived     |
| `--ke-status-closed-text`     | #f87171                  | Closed expense text           | Badge text               |

#### Attention/Alert

| Token                   | Hex/RGBA                 | Purpose                  |
| ----------------------- | ------------------------ | ------------------------ |
| `--ke-attention-border` | #f59e0b                  | Attention-needed borders |
| `--ke-attention-bg`     | rgba(245, 158, 11, 0.08) | Attention backgrounds    |

#### Financial Values

| Token           | Hex     | Purpose                  |
| --------------- | ------- | ------------------------ |
| `--ke-positive` | #34d399 | Positive balance, income |
| `--ke-negative` | #f87171 | Negative balance, owed   |

## Typography

### Font Stacks

```css
--ke-font-body: var(--font-geist-sans);
--ke-font-mono: var(--font-geist-mono);
```

Next.js provides Geist fonts via `next/font/geist`. No external font requests.

### Type Scale (semantic roles)

KE uses 7 semantic typography tokens — map per role, not per size. Each token bundles size + line-height + font-weight; emitted by `@venturecrane/tokens/ke.css` and exposed as Tailwind v4 utilities via `@theme inline`.

| Token                    | Utility           | Size | Line height | Weight | Use                                           |
| ------------------------ | ----------------- | ---- | ----------- | ------ | --------------------------------------------- |
| `--ke-text-size-display` | `text-ke-display` | 32px | 40px        | 700    | Hero amounts, marketing h2, large page titles |
| `--ke-text-size-title`   | `text-ke-title`   | 20px | 28px        | 700    | App page h1, section title                    |
| `--ke-text-size-heading` | `text-ke-heading` | 16px | 22px        | 600    | Sub-section h2/h3                             |
| `--ke-text-size-body-lg` | `text-ke-body-lg` | 18px | 28px        | 400    | Prominent body, intro paragraphs              |
| `--ke-text-size-body`    | `text-ke-body`    | 15px | 24px        | 400    | Default body content                          |
| `--ke-text-size-caption` | `text-ke-caption` | 13px | 18px        | 500    | Metadata, helper text, secondary              |
| `--ke-text-size-label`   | `text-ke-label`   | 12px | 16px        | 600    | Chips, status pills, fine labels              |

Raw Tailwind size classes (`text-sm`, `text-base`, etc.) and arbitrary sizes (`text-[Npx]`) are not allowed in page code.

### Font Weights

Each semantic role bundles its own weight (table above); the values match the four-level brand-voice palette:

- **Regular (400):** body, body-lg
- **Medium (500):** caption — emphasis at small size for legibility
- **Semibold (600):** heading, label
- **Bold (700):** display, title

## Spacing

Base unit: 0.25rem (4px). Tailwind's default scale (`p-2`, `gap-3`, etc.) remains valid for finer-grain layout.

KE additionally publishes 4 semantic spacing roles for layout intent — emitted by `@venturecrane/tokens/ke.css` and exposed as Tailwind v4 utilities via `@utility`:

| Token                | Utility family                                      | Px   | Use                               |
| -------------------- | --------------------------------------------------- | ---- | --------------------------------- |
| `--ke-space-section` | `p-ke-section`, `py-ke-section`, `mb-ke-section`, … | 32px | Gap between major page sections   |
| `--ke-space-card`    | `p-ke-card`, `px-ke-card`, …                        | 24px | Card internal padding             |
| `--ke-space-row`     | `gap-ke-row`, `gap-x-ke-row`, …                     | 12px | Gap between rows in a list        |
| `--ke-space-stack`   | `gap-ke-stack`, `gap-x-ke-stack`, …                 | 16px | Vertical stack of sibling content |

Available directional variants: `p / pt / pb / pl / pr / px / py / m / mt / mb / ml / mr / mx / my / gap / gap-x / gap-y` × `ke-{section|card|row|stack}`. Other Tailwind spacing utilities continue to work for layout that doesn't fit the four semantic roles.

Arbitrary spacing values (`p-[Npx]`, `gap-[N]`) are not allowed; for offsets that don't fit the scale, use a flex/grid layout with a sized spacer div (see `settings/children` edit-mode for the pattern).

Container max-width: 1280px (lg breakpoint)

## Surface Hierarchy

1. **Base (--ke-bg)**: Page background
2. **Surface (--ke-surface)**: Card backgrounds, main content panels
3. **Elevated (--ke-elevated)**: Hover states, dropdowns, secondary surfaces
4. **Interactive (--ke-interactive)**: Button backgrounds, input fields

Dark mode uses same hierarchy with adjusted token values.

## Tailwind Utility Mappings

Agents can use these semantic utility classes (mapped from CSS tokens via @theme):

### Backgrounds

- `bg-ke-bg`, `bg-ke-surface`, `bg-ke-elevated`, `bg-ke-interactive`

### Text

- `text-ke-primary`, `text-ke-secondary`, `text-ke-muted`, `text-ke-inverse`

### Borders

- `border-ke-border`, `border-ke-divider`, `border-ke-secondary-border`

### Accents

- `bg-ke-accent`, `hover:bg-ke-accent-hover`
- `bg-ke-accent-soft`, `text-ke-accent-soft-text`
- `ring-ke-focus`

### Status Badges

- `bg-ke-status-posted-bg`, `text-ke-status-posted-text`
- `bg-ke-status-questioned-bg`, `text-ke-status-questioned-text`
- `bg-ke-status-resolved-bg`, `text-ke-status-resolved-text`
- `bg-ke-status-settled-bg`, `text-ke-status-settled-text`
- `bg-ke-status-closed-bg`, `text-ke-status-closed-text`

### Financial Values

- `text-ke-positive`, `text-ke-negative`

## Mobile Considerations

- **Mobile-first design:** Base styles target mobile, enhanced with responsive classes
- **Bottom navigation:** Primary nav pattern on mobile
- **Sheet modals:** Full-screen modals on mobile, drawer on desktop
- **Touch targets:** 44x44px minimum
- **Breakpoints:** sm (640px), md (768px), lg (1024px), xl (1280px)

## Known Issues

- Mobile dropdown positioning may conflict with flex containers (see MEMORY.md CSS notes)
- Clerk components override some token styles (requires `!important` in places)

## Future Enhancements

- Dark mode toggle (manual override of system preference)
- Receipt image upload with preview
- Push notifications for new expenses
- Offline support with service worker
- Expense analytics dashboard
