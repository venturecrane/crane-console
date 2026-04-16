# Archetype catalog

Nine archetypes. Each defines the nav contract for a class of screens. Every generated or shipped page maps to exactly one archetype. When a new screen doesn't fit, either (a) widen an existing archetype, or (b) add a new one via `/nav-spec --revise --add-archetype`.

## Common contract (inherited by all)

- **Landmarks:** `<header role="banner">`, `<main role="main">`.
- **Skip link:** `<a href="#main" class="sr-only focus:not-sr-only ...">Skip to main content</a>` at top of body.
- **Focus rings:** 2px accent color, 2px offset, keyboard-focus only.
- **Icon-only buttons:** always have `aria-label`.
- **Tap targets:** 44×44px minimum on touch surfaces.
- **Header height:** 56px mobile, 64px desktop.
- **Header background:** solid (no `backdrop-blur-*`, no opacity modifiers).

## 1. `dashboard`

**Definition:** Landing surface of an authenticated surface class. The user's "home." Shows overview, pending actions, recent activity.

**Examples:** `/portal/home`, `/admin/home`.

**Chrome contract:**

- Header: client/workspace name on left, optional quick-action link on right (SMS, settings gear). No logo. No tabs.
- **No back button.** The user is already home.
- **No breadcrumbs.**
- Right rail on desktop: optional, used for quick actions or status summary.

**Allowed surface classes:** `session-auth-client`, `session-auth-admin`.

## 2. `list`

**Definition:** Index of items in a collection. Filterable, sortable, paginated.

**Examples:** `/portal/invoices`, `/admin/audit-log`, `/admin/clients`.

**Chrome contract:**

- Header: same minimal band as dashboard.
- **Back button:** to the parent surface (usually dashboard). Hardcoded URL.
- **No breadcrumbs** on portal; breadcrumbs **allowed** on admin (2 levels max).
- Filter/sort bar directly below header, before the list.

**Allowed surface classes:** `session-auth-client`, `session-auth-admin`.

## 3. `detail`

**Definition:** Single-item view. Invoice, proposal, client, audit event.

**Examples:** `/portal/invoices/[id]`, `/portal/proposals/[token]`, `/admin/clients/[id]`.

**Chrome contract:**

- Header: minimal band.
- **Back button:** to the parent list or (for token-auth deep-links) to a sensible landing. Hardcoded URL. Label carries the parent's name ("All invoices", "Home").
- **No breadcrumbs** on portal and token-auth; **allowed** on admin for 3+ level hierarchies.
- Right rail on desktop: consultant/contact block, status timeline, related items.
- Primary action (Pay, Accept, Sign) visible above fold on mobile.

**Allowed surface classes:** all four.

## 4. `form`

**Definition:** Surface for creating or editing an entity. Fields, validation, submit.

**Examples:** `/portal/profile/edit`, `/admin/clients/new`, `/admin/invoices/[id]/edit`.

**Chrome contract:**

- Header: minimal band.
- **Cancel + Save** actions — not a back button. Cancel returns to the canonical origin (the form's source). Save submits and navigates to the created/edited entity's detail view.
- **Dirty-state guard:** if fields have unsaved changes, Cancel triggers a confirm modal.
- **No breadcrumbs.**
- Keyboard: Cmd/Ctrl+S saves; Esc is interpreted as Cancel.

**Allowed surface classes:** `session-auth-client`, `session-auth-admin`.

## 5. `wizard`

**Definition:** Multi-step flow with forward/back progress. Onboarding, guided intake, multi-page checkout.

**Examples:** `/portal/onboarding`, `/admin/engagements/new`.

**Chrome contract:**

- Header: minimal band. **Progress indicator ("Step N of M")** centered or left-aligned within the header band, not below.
- **Previous + Next** buttons in a sticky or in-flow action block. Previous disabled on step 1; Next disabled until current step validates.
- **Cancel** at far-left of action block or in overflow menu. Triggers confirm modal.
- **No breadcrumbs.**
- **No back button in header** — the Previous button is the back affordance within the wizard.

**Allowed surface classes:** `session-auth-client`, `session-auth-admin`.

## 6. `empty`

**Definition:** Default view of a list or detail when there's nothing to show. First-time state.

**Examples:** "You have no invoices yet."

**Chrome contract:**

- Inherits from the parent archetype's header (list or detail).
- **Body:** centered illustration (solid shape, not real image), one-line message, single primary CTA (e.g., "Add your first client").
- **No marketing copy.** No testimonials, no feature tour.

**Allowed surface classes:** all four.

## 7. `error`

**Definition:** 404, 500, 401, validation-failure fallback screens.

**Examples:** `/404`, `/500`, session-expired redirect target.

**Chrome contract:**

- **Header:** minimal band; no back button (the user's state is broken — don't trust their history).
- **Body:** error type, short explanation, single primary action that returns to safety.
  - For authenticated surfaces: "Go to home" linking to the surface class's dashboard.
  - For public surfaces: "Go to home" linking to `/`.
  - For token-auth: "Contact Scott" link.
- **No support form embedded.** Link to a contact method, don't host the form on the error page.

**Allowed surface classes:** all four.

## 8. `modal`

**Definition:** Overlay for confirmations, pickers, short-form interactions. Focused on a single decision.

**Examples:** "Are you sure?" confirms, date pickers, file upload dialogs.

**Chrome contract:**

- `<dialog>` or `role="dialog"` with `aria-modal="true"` and a focused `aria-labelledby` title.
- Close affordances: **Esc, click-outside on scrim, and an X button in the top-right**. All three work.
- Focus returns to the triggering element on close.
- **No navigation inside a modal.** Not a nav tab bar, not a breadcrumb.
- Scrim: `bg-black/50` (50% opacity black).

**Allowed surface classes:** all four.

## 9. `drawer`

**Definition:** Side panel for secondary actions, filters, or in-context help. Slides in from the edge.

**Examples:** Filter panel on a list, notification panel on dashboard.

**Chrome contract:**

- Same open/close rules as modal (Esc, click-outside, X button).
- Slide direction: right-side on desktop, bottom-sheet on mobile.
- **Never contains primary navigation** (no "Dashboard | Billing | Docs" menu in a drawer — that's a disguised nav tab).
- Width on desktop: 400px standard, max 600px.
- Height on mobile: 80vh max; draggable header area.

**Allowed surface classes:** all four.

## Lookup table (machine-readable)

| Archetype | Back                | Breadcrumbs (portal) | Breadcrumbs (admin) | Right rail allowed |
| --------- | ------------------- | -------------------- | ------------------- | ------------------ |
| dashboard | no                  | no                   | no                  | yes (desktop)      |
| list      | yes                 | no                   | yes (2 levels)      | no                 |
| detail    | yes                 | no                   | yes (3 levels)      | yes (desktop)      |
| form      | cancel+save         | no                   | no                  | no                 |
| wizard    | prev/next           | no                   | no                  | no                 |
| empty     | inherit from parent | inherit              | inherit             | inherit            |
| error     | no                  | no                   | no                  | no                 |
| modal     | close button        | no                   | no                  | no                 |
| drawer    | close button        | no                   | no                  | no                 |

Anti-pattern shorthand: **breadcrumbs are never rendered on portal, period.** Admin breadcrumbs are for list and detail only, and capped at the item's hierarchical depth.
