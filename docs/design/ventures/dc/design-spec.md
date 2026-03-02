# Draft Crane Design Spec

> Design system reference for Draft Crane agents. Auto-synced to crane-context.
> Design Maturity: Enterprise-grade token system with 400+ variables. Full semantic color palette, motion system, and iPad-first responsive design.
> Last updated: 2026-03-02

## Identity

- **Venture:** Draft Crane
- **Code:** dc
- **Tagline:** Book-writing tool for experts
- **Audience:** Subject matter experts and professionals writing non-fiction books
- **Brand Voice:** Professional, focused, supportive. Dual-zone interaction model: Author zone (Blue/Primary) for content creation, Editor zone (Violet/Escalation) for AI-powered review and feedback.

## Tech Stack

- **Framework:** Next.js 16.1.6
- **CSS Methodology:** CSS custom properties with Tailwind v4 @theme inline mapping
- **Tailwind Version:** v4 with @tailwindcss/postcss
- **Hosting:** Vercel
- **Auth:** Clerk
- **Rich Text:** TipTap (ProseMirror)

## Component Patterns

### Naming Convention

- Components use semantic, accessible naming
- CSS classes follow BEM-like patterns where appropriate
- All interactive elements have accessible labels and ARIA attributes

### Key Components

- **Toolbar:** 48px height, touch-target compliant buttons
- **Toggle Controls:** 44px minimum height, 40px option height, 72px minimum width per option
- **Feedback Sheet:** Maximum 85vh height, 120px minimum textarea height
- **Onboarding Cards:** 300px width (max 100vw - 32px), with arrow indicators and dot navigation
- **Help Accordion:** Expandable sections with hover states
- **Editor Panel:** TipTap-based rich text editor with custom styling
- **Sources Panel:** Reference management interface

### ARIA Patterns

- All interactive zones use proper `role`, `aria-label`, and keyboard navigation
- Focus management for modals and overlays
- Screen reader announcements for state changes
- Skip links for keyboard navigation

## Dark/Light Mode

**Current State:** Light-only theme

**Implementation Approach:**

- All tokens defined in `:root`
- No dark mode variants currently implemented
- When dark mode is added, use `@media (prefers-color-scheme: dark)` or class-based toggle
- Token structure supports future dark mode (semantic naming allows value swaps)

## Accessibility

- **WCAG Target:** 2.1 AA
- **Focus Indicators:** Consistent 2px blue (`--dc-color-border-focus: #2563eb`) ring on all interactive elements
- **Motion:** All animations respect `prefers-reduced-motion`, maximum duration 300ms
- **Touch Targets:** Minimum 44px (Apple HIG / WCAG 2.5.8), AI buttons 48px, compact chips 36px
- **Testing:** No automated a11y tests currently configured

## Color Tokens

### Text Colors

| Token                         | Hex       | Purpose                          | Contrast (on white) |
| ----------------------------- | --------- | -------------------------------- | ------------------- |
| `--dc-color-text-primary`     | `#111827` | Headings, prominent labels       | 17.4:1              |
| `--dc-color-text-secondary`   | `#374151` | Body text, descriptions          | 10.7:1              |
| `--dc-color-text-muted`       | `#6b7280` | Captions, hints, idle labels     | 5.0:1               |
| `--dc-color-text-placeholder` | `#9ca3af` | Input placeholders               | ~3.3:1              |
| `--dc-color-text-inverse`     | `#ffffff` | Text on dark/colored backgrounds | N/A                 |

**Tailwind Utilities:** `text-dc-text-primary`, `text-dc-text-secondary`, `text-dc-text-muted`, `text-dc-text-placeholder`, `text-dc-text-inverse`

### Surface Colors

| Token                          | Hex                  | Purpose                              |
| ------------------------------ | -------------------- | ------------------------------------ |
| `--dc-color-surface-primary`   | `#ffffff`            | Panel backgrounds, toggle indicators |
| `--dc-color-surface-secondary` | `#f9fafb`            | Subtle background tint               |
| `--dc-color-surface-tertiary`  | `#f3f4f6`            | Toggle tracks, hover backgrounds     |
| `--dc-color-surface-overlay`   | `rgba(0, 0, 0, 0.5)` | Modal/dialog backdrops               |

**Tailwind Utilities:** `bg-dc-surface-primary`, `bg-dc-surface-secondary`, `bg-dc-surface-tertiary`, `bg-dc-surface-overlay`

### Border Colors

| Token                       | Hex       | Purpose                            |
| --------------------------- | --------- | ---------------------------------- |
| `--dc-color-border-default` | `#e5e7eb` | Standard borders                   |
| `--dc-color-border-subtle`  | `#f3f4f6` | Dividers, separators               |
| `--dc-color-border-strong`  | `#d1d5db` | Emphasized borders, input outlines |
| `--dc-color-border-focus`   | `#2563eb` | Focus rings (consistent blue)      |

**Tailwind Utilities:** `border-dc-border-default`, `border-dc-border-subtle`, `border-dc-border-strong`, `ring-dc-border-focus`

### Interactive: Primary (Blue - Author Zone)

| Token                                      | Hex       | Purpose                         | Contrast           |
| ------------------------------------------ | --------- | ------------------------------- | ------------------ |
| `--dc-color-interactive-primary`           | `#2563eb` | Primary actions, links          | 4.6:1 on white     |
| `--dc-color-interactive-primary-subtle`    | `#eff6ff` | Light blue tint backgrounds     | N/A                |
| `--dc-color-interactive-primary-on-subtle` | `#1d4ed8` | Blue text on blue-subtle        | 5.9:1 on `#eff6ff` |
| `--dc-color-interactive-primary-hover`     | `#1d4ed8` | Hover state for primary buttons | N/A                |
| `--dc-color-interactive-primary-active`    | `#1e40af` | Active/pressed state            | N/A                |
| `--dc-color-interactive-primary-border`    | `#93c5fd` | Focus/selection borders         | N/A                |

**Tailwind Utilities:** `bg-dc-interactive-primary`, `hover:bg-dc-interactive-primary-hover`, `text-dc-interactive-primary-on-subtle`, etc.

### Interactive: Escalation (Violet - Editor Zone)

| Token                                      | Hex       | Purpose                            |
| ------------------------------------------ | --------- | ---------------------------------- |
| `--dc-color-interactive-escalation`        | `#7c3aed` | Editor actions, AI escalation      |
| `--dc-color-interactive-escalation-subtle` | `#f5f3ff` | Light violet tint backgrounds      |
| `--dc-color-interactive-escalation-hover`  | `#6d28d9` | Hover state for escalation buttons |
| `--dc-color-interactive-escalation-border` | `#c4b5fd` | Focus/selection borders            |

**Tailwind Utilities:** `bg-dc-interactive-escalation`, `hover:bg-dc-interactive-escalation-hover`, etc.

### Interactive: Destructive

| Token                                       | Hex       | Purpose                             |
| ------------------------------------------- | --------- | ----------------------------------- |
| `--dc-color-interactive-destructive`        | `#dc2626` | Delete buttons, destructive actions |
| `--dc-color-interactive-destructive-hover`  | `#b91c1c` | Hover on destructive actions        |
| `--dc-color-interactive-destructive-subtle` | `#fef2f2` | Light red tint backgrounds          |

**Tailwind Utilities:** `bg-dc-interactive-destructive`, `hover:bg-dc-interactive-destructive-hover`, etc.

### Status Colors

| Token                              | Hex       | Purpose                 |
| ---------------------------------- | --------- | ----------------------- |
| `--dc-color-status-error`          | `#dc2626` | Error states            |
| `--dc-color-error-bg`              | `#fef2f2` | Error background tint   |
| `--dc-color-status-success`        | `#059669` | Success states          |
| `--dc-color-success-bg`            | `#ecfdf5` | Success background tint |
| `--dc-color-status-success-subtle` | `#ecfdf5` | Alias for consistency   |
| `--dc-color-status-warning`        | `#d97706` | Warnings, cautions      |
| `--dc-color-status-warning-bg`     | `#fffbeb` | Warning background tint |

**Tailwind Utilities:** `text-dc-status-error`, `bg-dc-error-bg`, `text-dc-status-success`, etc.

### Feedback & Help Colors (Issues #344, #367)

| Token                                    | Purpose                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `--dc-color-feedback-surface`            | Feedback sheet background (`--dc-color-surface-primary`)           |
| `--dc-color-feedback-border`             | Feedback sheet border (`--dc-color-border-default`)                |
| `--dc-color-feedback-type-active-bg`     | Active feedback type background (`--dc-color-interactive-primary`) |
| `--dc-color-feedback-type-active-text`   | Active feedback type text (`#ffffff`)                              |
| `--dc-color-feedback-type-inactive-bg`   | Inactive feedback type background (`--dc-color-surface-secondary`) |
| `--dc-color-feedback-type-inactive-text` | Inactive feedback type text (`--dc-color-text-secondary`)          |
| `--dc-color-feedback-success-bg`         | Success state background (`--dc-color-status-success-subtle`)      |
| `--dc-color-feedback-success-icon`       | Success icon color (`--dc-color-status-success`)                   |
| `--dc-color-feedback-success-text`       | Success text color (`--dc-color-text-primary`)                     |

**Tailwind Utilities:** `bg-dc-feedback-surface`, `border-dc-feedback-border`, etc.

### Onboarding Colors (Issue #344)

| Token                                | Purpose                                                   |
| ------------------------------------ | --------------------------------------------------------- |
| `--dc-color-onboarding-card-bg`      | Onboarding card background (`--dc-color-surface-primary`) |
| `--dc-color-onboarding-card-border`  | Onboarding card border (`--dc-color-border-default`)      |
| `--dc-color-onboarding-backdrop`     | Onboarding overlay backdrop (`rgba(0, 0, 0, 0.4)`)        |
| `--dc-color-onboarding-dot-active`   | Active pagination dot (`--dc-color-interactive-primary`)  |
| `--dc-color-onboarding-dot-inactive` | Inactive pagination dot (`#d1d5db`)                       |
| `--dc-color-onboarding-arrow`        | Arrow indicator color (`--dc-color-surface-primary`)      |

**Tailwind Utilities:** `bg-dc-onboarding-card-bg`, `bg-dc-onboarding-backdrop`, etc.

### Help Page Colors (Issue #344)

| Token                              | Purpose                                                |
| ---------------------------------- | ------------------------------------------------------ |
| `--dc-color-help-accordion-bg`     | Accordion background (`--dc-color-surface-primary`)    |
| `--dc-color-help-accordion-hover`  | Accordion hover state (`--dc-color-surface-secondary`) |
| `--dc-color-help-accordion-border` | Accordion border (`--dc-color-border-default`)         |
| `--dc-color-help-section-heading`  | Section heading color (`--dc-color-text-primary`)      |

**Tailwind Utilities:** `bg-dc-help-accordion-bg`, `hover:bg-dc-help-accordion-hover`, etc.

## Typography

### Font Stacks

| Token             | Stack                                                          |
| ----------------- | -------------------------------------------------------------- |
| `--dc-font-sans`  | `var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif` |
| `--dc-font-serif` | `var(--font-lora), ui-serif, Georgia, serif`                   |
| `--dc-font-mono`  | `var(--font-geist-mono), ui-monospace, monospace`              |

**Tailwind Utilities:** `font-sans`, `font-serif`, `font-mono`

**Implementation:** Geist Sans and Geist Mono are loaded via Next.js font optimization. Lora (serif) is used for long-form reading in the editor.

### Text Sizes

| Token            | Rem        | Pixels | Purpose                |
| ---------------- | ---------- | ------ | ---------------------- |
| `--dc-text-xs`   | `0.75rem`  | 12px   | Fine print, metadata   |
| `--dc-text-sm`   | `0.875rem` | 14px   | Captions, secondary UI |
| `--dc-text-base` | `1rem`     | 16px   | Body text (default)    |
| `--dc-text-lg`   | `1.125rem` | 18px   | Prominent body text    |
| `--dc-text-xl`   | `1.25rem`  | 20px   | Small headings         |
| `--dc-text-2xl`  | `1.5rem`   | 24px   | Medium headings        |
| `--dc-text-3xl`  | `1.875rem` | 30px   | Large headings         |

**Tailwind Utilities:** `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`

### Line Heights

| Token                  | Value   | Purpose           |
| ---------------------- | ------- | ----------------- |
| `--dc-leading-tight`   | `1.25`  | Headings          |
| `--dc-leading-snug`    | `1.375` | Subheadings       |
| `--dc-leading-normal`  | `1.5`   | Body text         |
| `--dc-leading-relaxed` | `1.625` | Long-form reading |
| `--dc-leading-loose`   | `1.75`  | Spacious reading  |

**Tailwind Utilities:** `leading-tight`, `leading-snug`, `leading-normal`, `leading-relaxed`, `leading-loose`

## Spacing

### Base System

**Base Unit:** 4px grid

| Token              | Value  | Purpose                   |
| ------------------ | ------ | ------------------------- |
| `--dc-spacing-xs`  | `4px`  | Minimal gaps              |
| `--dc-spacing-sm`  | `8px`  | Small gaps, tight padding |
| `--dc-spacing-md`  | `12px` | Medium gaps               |
| `--dc-spacing-lg`  | `16px` | Standard padding, gaps    |
| `--dc-spacing-xl`  | `24px` | Section spacing           |
| `--dc-spacing-2xl` | `32px` | Large section spacing     |
| `--dc-spacing-3xl` | `48px` | Major section breaks      |

**Tailwind Utilities:** `p-dc-xs`, `gap-dc-md`, `m-dc-xl`, etc.

### Safe Areas (iPad)

| Token                   | Value                              | Purpose               |
| ----------------------- | ---------------------------------- | --------------------- |
| `--dc-safe-area-top`    | `env(safe-area-inset-top, 0px)`    | iPad notch/status bar |
| `--dc-safe-area-bottom` | `env(safe-area-inset-bottom, 0px)` | iPad home indicator   |
| `--dc-safe-area-left`   | `env(safe-area-inset-left, 0px)`   | Left edge inset       |
| `--dc-safe-area-right`  | `env(safe-area-inset-right, 0px)`  | Right edge inset      |

**Usage:** Add to padding values for iPad-first design: `padding-bottom: calc(16px + var(--dc-safe-area-bottom))`

## Border Radius

| Token              | Value    | Purpose                 |
| ------------------ | -------- | ----------------------- |
| `--dc-radius-sm`   | `4px`    | Small elements, chips   |
| `--dc-radius-md`   | `8px`    | Buttons, inputs, cards  |
| `--dc-radius-lg`   | `12px`   | Panels, modals          |
| `--dc-radius-xl`   | `16px`   | Large panels            |
| `--dc-radius-full` | `9999px` | Pills, circular avatars |

**Tailwind Utilities:** `rounded-dc-sm`, `rounded-dc-md`, `rounded-dc-lg`, `rounded-dc-xl`, `rounded-dc-full`

## Shadows

| Token                         | Value                                                                     | Purpose            |
| ----------------------------- | ------------------------------------------------------------------------- | ------------------ |
| `--dc-shadow-sm`              | `0 1px 2px rgba(0, 0, 0, 0.05)`                                           | Subtle elevation   |
| `--dc-shadow-md`              | `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)`    | Standard cards     |
| `--dc-shadow-lg`              | `0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)`  | Elevated panels    |
| `--dc-shadow-xl`              | `0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)` | Floating elements  |
| `--dc-shadow-tooltip`         | `0 4px 12px rgba(0, 0, 0, 0.15)`                                          | Tooltips, popovers |
| `--dc-shadow-onboarding-card` | `0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)`           | Onboarding cards   |

**Tailwind Utilities:** `shadow-dc-sm`, `shadow-dc-md`, `shadow-dc-lg`, `shadow-dc-xl`, `shadow-dc-tooltip`, `shadow-dc-onboarding-card`

## Motion Tokens

**Maximum Duration:** 300ms across all animations

| Token                 | Value   | Purpose                            |
| --------------------- | ------- | ---------------------------------- |
| `--dc-motion-instant` | `100ms` | Immediate feedback (hover, active) |
| `--dc-motion-fast`    | `150ms` | Quick transitions                  |
| `--dc-motion-normal`  | `200ms` | Standard transitions               |
| `--dc-motion-slow`    | `300ms` | Deliberate, emphasized transitions |

### Easing Functions

| Token                     | Value                               | Purpose                          |
| ------------------------- | ----------------------------------- | -------------------------------- |
| `--dc-motion-ease-in-out` | `ease-in-out`                       | State changes (toggle, hover)    |
| `--dc-motion-ease-out`    | `ease-out`                          | Entrances (decelerate into rest) |
| `--dc-motion-ease-in`     | `ease-in`                           | Exits (accelerate out of view)   |
| `--dc-motion-ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful micro-interactions       |

**Accessibility:** All animations must respect `@media (prefers-reduced-motion: reduce)`. Use `transition: none` or `animation: none` in reduced-motion contexts.

## Touch Targets

**Reference:** Apple HIG / WCAG 2.5.8

| Token                    | Value  | Purpose                               |
| ------------------------ | ------ | ------------------------------------- |
| `--dc-touch-target-min`  | `44px` | Minimum per Apple HIG / WCAG 2.5.8    |
| `--dc-touch-target-ai`   | `48px` | AI action buttons, suggestion chips   |
| `--dc-touch-target-chip` | `36px` | Compact suggestion chips (Issue #365) |

**Implementation:** Ensure all interactive elements meet minimum touch target sizes. Use padding or min-width/min-height to expand clickable area if visual element is smaller.

## Z-Index Scale

**Purpose:** Centralized z-index scale prevents stacking conflicts

| Token                 | Value  | Layer                 |
| --------------------- | ------ | --------------------- |
| `--dc-z-base`         | `0`    | Default document flow |
| `--dc-z-sidebar-pill` | `40`   | Sidebar toggle pills  |
| `--dc-z-dropdown`     | `50`   | Dropdown menus        |
| `--dc-z-overlay`      | `50`   | Modal overlays        |
| `--dc-z-modal`        | `50`   | Modal dialogs         |
| `--dc-z-onboarding`   | `100`  | Onboarding flow       |
| `--dc-z-toast`        | `9999` | Toast notifications   |

**Usage:** Always use tokens for z-index values. Never use arbitrary z-index numbers.

## Layout Tokens (Issue #395)

### Toolbar

| Token                    | Value  | Purpose                    |
| ------------------------ | ------ | -------------------------- |
| `--dc-toolbar-height`    | `48px` | Standard toolbar height    |
| `--dc-toolbar-padding-x` | `16px` | Horizontal toolbar padding |
| `--dc-toolbar-gap`       | `8px`  | Gap between toolbar items  |

### Toggle Controls

| Token                          | Value  | Purpose                         |
| ------------------------------ | ------ | ------------------------------- |
| `--dc-toggle-height`           | `44px` | Toggle control height           |
| `--dc-toggle-option-height`    | `40px` | Individual toggle option height |
| `--dc-toggle-option-min-width` | `72px` | Minimum width per toggle option |
| `--dc-panel-toggle-height`     | `44px` | Panel toggle height             |

### Feedback Sheet

| Token                               | Value   | Purpose                       |
| ----------------------------------- | ------- | ----------------------------- |
| `--dc-feedback-sheet-max-height`    | `85vh`  | Maximum feedback sheet height |
| `--dc-feedback-textarea-min-height` | `120px` | Minimum textarea height       |

### Onboarding

| Token                            | Value                | Purpose               |
| -------------------------------- | -------------------- | --------------------- |
| `--dc-onboarding-card-width`     | `300px`              | Onboarding card width |
| `--dc-onboarding-card-max-width` | `calc(100vw - 32px)` | Responsive max width  |
| `--dc-onboarding-arrow-size`     | `8px`                | Arrow indicator size  |

### Help Page

| Token                         | Value   | Purpose                    |
| ----------------------------- | ------- | -------------------------- |
| `--dc-help-content-max-width` | `640px` | Maximum help content width |

## Surface Hierarchy

### Background Tiers

1. **Base:** `--dc-color-surface-primary` (#ffffff) - Main content areas, cards, panels
2. **Subtle:** `--dc-color-surface-secondary` (#f9fafb) - Alternate backgrounds, subtle differentiation
3. **Tertiary:** `--dc-color-surface-tertiary` (#f3f4f6) - Toggle tracks, hover states, disabled backgrounds
4. **Overlay:** `--dc-color-surface-overlay` (rgba(0, 0, 0, 0.5)) - Modal backdrops

**Implementation:** Use higher contrast borders (`--dc-color-border-strong`) when surface and background are too similar.

## Virtual Keyboard Support

**Token:** `--keyboard-height: 0px`

**Purpose:** JavaScript-managed token for iPad Safari virtual keyboard offset. Updated dynamically when keyboard appears/disappears.

**Usage:** Applied to fixed-position elements that need to shift when keyboard appears.

## Design System Files

**Primary Token File:** `/Users/scottdurgan/dev/dc-console/web/src/app/globals.css`

**Additional Stylesheets:**

- `/Users/scottdurgan/dev/dc-console/web/src/app/styles/editor.css` - TipTap editor styling
- `/Users/scottdurgan/dev/dc-console/web/src/app/styles/sources.css` - Source panel styling
- `/Users/scottdurgan/dev/dc-console/web/src/app/styles/editor-panel.css` - Editor panel layout
- `/Users/scottdurgan/dev/dc-console/web/src/app/styles/components.css` - Shared components
- `/Users/scottdurgan/dev/dc-console/web/src/app/styles/workspace.css` - Workspace layout

**Tailwind Configuration:** Inline via `@theme` block in `globals.css` - no separate `tailwind.config.js`
