# Draft Crane - Stitch Design Spec

Design system definition for Google Stitch project import. Derived from the canonical
`design-spec.md` - when values conflict, design-spec.md wins.

## Design System Overview

- **Brand:** Draft Crane - Book-writing tool for experts
- **Audience:** Subject matter experts and professionals writing non-fiction books
- **Platform:** iPad-first web app (Next.js 16, Tailwind v4, Vercel)
- **Theme:** Light-only
- **Voice:** Professional, focused, supportive
- **Interaction Model:** Dual-zone - Author zone (Blue/Primary) for content creation, Editor zone (Violet/Escalation) for AI-powered review and feedback

## Color Palette

### Text

| Token                         | Hex       | Usage                            |
| ----------------------------- | --------- | -------------------------------- |
| `--dc-color-text-primary`     | `#111827` | Headings, prominent labels       |
| `--dc-color-text-secondary`   | `#374151` | Body text, descriptions          |
| `--dc-color-text-muted`       | `#6b7280` | Captions, hints, idle labels     |
| `--dc-color-text-placeholder` | `#9ca3af` | Input placeholders               |
| `--dc-color-text-inverse`     | `#ffffff` | Text on dark/colored backgrounds |

### Surfaces

| Token                          | Hex               | Usage                                |
| ------------------------------ | ----------------- | ------------------------------------ |
| `--dc-color-surface-primary`   | `#ffffff`         | Panel backgrounds, toggle indicators |
| `--dc-color-surface-secondary` | `#f9fafb`         | Subtle background tint               |
| `--dc-color-surface-tertiary`  | `#f3f4f6`         | Toggle tracks, hover backgrounds     |
| `--dc-color-surface-overlay`   | `rgba(0,0,0,0.5)` | Modal/dialog backdrops               |

### Borders

| Token                       | Hex       | Usage                              |
| --------------------------- | --------- | ---------------------------------- |
| `--dc-color-border-default` | `#e5e7eb` | Standard borders                   |
| `--dc-color-border-subtle`  | `#f3f4f6` | Dividers, separators               |
| `--dc-color-border-strong`  | `#d1d5db` | Emphasized borders, input outlines |
| `--dc-color-border-focus`   | `#2563eb` | Focus rings                        |

### Primary Interactive (Blue - Author Zone)

| Token                                      | Hex       | Usage                       |
| ------------------------------------------ | --------- | --------------------------- |
| `--dc-color-interactive-primary`           | `#2563eb` | Primary actions, links      |
| `--dc-color-interactive-primary-subtle`    | `#eff6ff` | Light blue tint backgrounds |
| `--dc-color-interactive-primary-on-subtle` | `#1d4ed8` | Blue text on blue-subtle    |
| `--dc-color-interactive-primary-hover`     | `#1d4ed8` | Hover state                 |
| `--dc-color-interactive-primary-active`    | `#1e40af` | Active/pressed state        |
| `--dc-color-interactive-primary-border`    | `#93c5fd` | Focus/selection borders     |

### Escalation Interactive (Violet - Editor Zone)

| Token                                      | Hex       | Usage                         |
| ------------------------------------------ | --------- | ----------------------------- |
| `--dc-color-interactive-escalation`        | `#7c3aed` | Editor actions, AI escalation |
| `--dc-color-interactive-escalation-subtle` | `#f5f3ff` | Light violet tint backgrounds |
| `--dc-color-interactive-escalation-hover`  | `#6d28d9` | Hover state                   |
| `--dc-color-interactive-escalation-border` | `#c4b5fd` | Focus/selection borders       |

### Destructive

| Token                                       | Hex       | Usage                               |
| ------------------------------------------- | --------- | ----------------------------------- |
| `--dc-color-interactive-destructive`        | `#dc2626` | Delete buttons, destructive actions |
| `--dc-color-interactive-destructive-hover`  | `#b91c1c` | Hover on destructive actions        |
| `--dc-color-interactive-destructive-subtle` | `#fef2f2` | Light red tint backgrounds          |

### Status

| Token                          | Hex       | Usage                   |
| ------------------------------ | --------- | ----------------------- |
| `--dc-color-status-error`      | `#dc2626` | Error states            |
| `--dc-color-error-bg`          | `#fef2f2` | Error background tint   |
| `--dc-color-status-success`    | `#059669` | Success states          |
| `--dc-color-success-bg`        | `#ecfdf5` | Success background tint |
| `--dc-color-status-warning`    | `#d97706` | Warnings, cautions      |
| `--dc-color-status-warning-bg` | `#fffbeb` | Warning background tint |

## Typography

### Font Stacks

| Role           | Stack                                                          |
| -------------- | -------------------------------------------------------------- |
| Sans (UI)      | `var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif` |
| Serif (Editor) | `var(--font-lora), ui-serif, Georgia, serif`                   |
| Mono (Code)    | `var(--font-geist-mono), ui-monospace, monospace`              |

Geist Sans and Geist Mono loaded via Next.js font optimization. Lora (serif) is used for long-form reading in the editor.

### Size Scale

| Token            | Size            | Usage                  |
| ---------------- | --------------- | ---------------------- |
| `--dc-text-xs`   | 0.75rem (12px)  | Fine print, metadata   |
| `--dc-text-sm`   | 0.875rem (14px) | Captions, secondary UI |
| `--dc-text-base` | 1rem (16px)     | Body text (default)    |
| `--dc-text-lg`   | 1.125rem (18px) | Prominent body text    |
| `--dc-text-xl`   | 1.25rem (20px)  | Small headings         |
| `--dc-text-2xl`  | 1.5rem (24px)   | Medium headings        |
| `--dc-text-3xl`  | 1.875rem (30px) | Large headings         |

### Line Heights

| Token                  | Value | Usage             |
| ---------------------- | ----- | ----------------- |
| `--dc-leading-tight`   | 1.25  | Headings          |
| `--dc-leading-snug`    | 1.375 | Subheadings       |
| `--dc-leading-normal`  | 1.5   | Body text         |
| `--dc-leading-relaxed` | 1.625 | Long-form reading |
| `--dc-leading-loose`   | 1.75  | Spacious reading  |

### Font Weights

- Regular (400): Body text, descriptions
- Medium (500): Labels, UI elements
- Semibold (600): Headings, emphasis
- Bold (700): Strong emphasis, primary CTAs

## Spacing

**Base Unit:** 4px grid

| Token              | Value | Usage                     |
| ------------------ | ----- | ------------------------- |
| `--dc-spacing-xs`  | 4px   | Minimal gaps              |
| `--dc-spacing-sm`  | 8px   | Small gaps, tight padding |
| `--dc-spacing-md`  | 12px  | Medium gaps               |
| `--dc-spacing-lg`  | 16px  | Standard padding, gaps    |
| `--dc-spacing-xl`  | 24px  | Section spacing           |
| `--dc-spacing-2xl` | 32px  | Large section spacing     |
| `--dc-spacing-3xl` | 48px  | Major section breaks      |

### Border Radius

| Token              | Value  | Usage                   |
| ------------------ | ------ | ----------------------- |
| `--dc-radius-sm`   | 4px    | Small elements, chips   |
| `--dc-radius-md`   | 8px    | Buttons, inputs, cards  |
| `--dc-radius-lg`   | 12px   | Panels, modals          |
| `--dc-radius-xl`   | 16px   | Large panels            |
| `--dc-radius-full` | 9999px | Pills, circular avatars |

## Component Patterns

### Toolbar

- Height: 48px (`--dc-toolbar-height`)
- Horizontal padding: 16px
- Item gap: 8px
- Touch-target compliant buttons

### Toggle Controls

- Height: 44px (`--dc-toggle-height`)
- Option height: 40px
- Minimum option width: 72px
- Background: surface-tertiary, active indicator: surface-primary

### Feedback Sheet

- Max height: 85vh
- Textarea minimum height: 120px
- Background: surface-primary with border-default

### Onboarding Cards

- Width: 300px (max: calc(100vw - 32px))
- Arrow indicators (8px) and dot navigation
- Shadow: `0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)`

### Editor Panel

- TipTap (ProseMirror) rich text editor
- Serif font (Lora) for content, sans for UI chrome
- Full-width content area with structured toolbar

### Touch Targets

- Minimum: 44px (Apple HIG / WCAG 2.5.8)
- AI action buttons: 48px
- Compact suggestion chips: 36px

### ARIA Patterns

- All interactive zones use proper `role`, `aria-label`, and keyboard navigation
- Focus management for modals and overlays
- Screen reader announcements for state changes
- Consistent 2px focus ring in `#2563eb`

## Layout Rules

### Responsive Design

- iPad-first responsive layout
- Safe area support for iPad notch/status bar and home indicator
- Safe area tokens: `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, etc.
- Virtual keyboard offset managed via `--keyboard-height` CSS variable

### Z-Index Scale

| Layer                     | Value |
| ------------------------- | ----- |
| Base                      | 0     |
| Sidebar pills             | 40    |
| Dropdowns/Overlays/Modals | 50    |
| Onboarding                | 100   |
| Toasts                    | 9999  |

### Shadows

| Level   | Value                                                               |
| ------- | ------------------------------------------------------------------- |
| Small   | `0 1px 2px rgba(0,0,0,0.05)`                                        |
| Medium  | `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)`    |
| Large   | `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)`  |
| XL      | `0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)` |
| Tooltip | `0 4px 12px rgba(0,0,0,0.15)`                                       |

## Motion

Maximum duration: 300ms across all animations. All animations respect `prefers-reduced-motion`.

| Token                 | Duration | Usage                              |
| --------------------- | -------- | ---------------------------------- |
| `--dc-motion-instant` | 100ms    | Immediate feedback (hover, active) |
| `--dc-motion-fast`    | 150ms    | Quick transitions                  |
| `--dc-motion-normal`  | 200ms    | Standard transitions               |
| `--dc-motion-slow`    | 300ms    | Deliberate, emphasized transitions |

Easing: `ease-in-out` for state changes, `ease-out` for entrances, `ease-in` for exits, `cubic-bezier(0.34, 1.56, 0.64, 1)` for playful micro-interactions.

## Interaction Model

### Author Zone (Blue/Primary)

- All content creation actions use the primary blue palette
- `--dc-color-interactive-primary` (#2563eb) as the base
- Applied to: write, edit, save, format, navigate

### Editor Zone (Violet/Escalation)

- All AI-powered review and feedback actions use the violet palette
- `--dc-color-interactive-escalation` (#7c3aed) as the base
- Applied to: AI suggestions, editor feedback, review panels, escalation controls
