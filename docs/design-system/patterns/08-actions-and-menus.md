---
title: 'Actions and menus'
sidebar:
  order: 8
---

# Actions and menus

**Status.** Active · **Authored.** 2026-04-24 (enterprise, Phase 4 pilot)

## Problem

A surface with a list of entities — prospects, invoices, expenses, documents — needs to expose actions on those entities: open, edit, archive, duplicate, delete, mark-as-X. When every surface invents its own approach, users get:

- **Row-level actions scattered inconsistently** — one surface puts "Edit" as an inline button, another puts it in a kebab menu, another hides it in a hover-reveal.
- **Primary + secondary + destructive jumbled** — "Delete" rendered next to "Open" with the same visual weight, inviting misclicks.
- **Bulk actions missing or unreachable** — users learn a surface supports multi-select only by trial.

The SS session on 2026-04-24 that triggered this initiative asked: "what's the doctrine for row actions on the Prospect-view?" No doctrine existed. This pattern is the answer.

AI generators compound the problem — each surface generated independently picks a plausible approach. Without a cross-venture pattern, every new venture's list surface drifts further.

## Solution

**Three zones for actions, chosen by context:**

| Zone              | Location                        | Holds                                                                             |
| ----------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| **Row action**    | Inline at row end               | The single most likely action per row (e.g., "Open" / "View"). At most one.       |
| **Overflow menu** | Kebab (`⋯`) at row end          | All secondary per-row actions (Edit, Duplicate, Archive) + destructive (Delete).  |
| **Page toolbar**  | Above the list, top of the page | Bulk actions on selected rows; list-level actions (New, Filter, Export, Refresh). |

### Row action — the one obvious next step

**Do:** render one primary action per row when there's an obvious default (Open a row, View a detail page). Use a tertiary ("ghost") button or a chevron indicator per [Pattern 03](03-button-hierarchy.md). The whole row should also be clickable to that default.

**Don't:** render two or three inline actions on each row (Open + Edit + Archive). That's what the overflow menu is for.

**Don't:** render the row-level action with primary visual weight (`bg-primary`). The page's one primary action lives in the page toolbar (e.g., "New prospect"). Rows are navigation; the toolbar is command.

### Overflow menu — everything else per-row

**Do:** render a kebab (`⋯`) icon at row end. Menu items follow a consistent order across ventures: **View** → **Edit** → **Duplicate** → **Archive** → (separator) → **Delete**. Destructive items (Delete, Remove access) always last, separated, and rendered in error color.

**Don't:** hide the overflow menu behind hover. Users on touch devices can't discover it. Always visible, low visual weight.

**Don't:** put the primary row action inside the overflow menu. That's a click trap — users expect the default action inline.

### Page toolbar — list-level and bulk

**Do:** render list-level actions (**New**, **Filter**, **Search**, **Export**, **Refresh**) in a persistent toolbar above the list. **New** uses primary visual weight (one primary per view — see [Pattern 03](03-button-hierarchy.md)).

**Do:** when any rows are selected, reveal bulk-action controls contextually — typically by replacing the default toolbar content with a selection-count label and the applicable bulk actions (**Archive all**, **Delete all**, **Assign to...**). Shopify Polaris calls this the "[bulk actions banner](https://polaris-react.shopify.com/patterns/common-actions)."

**Don't:** show bulk controls when nothing is selected — they're noise until needed.

**Don't:** duplicate per-row actions in the page toolbar when only one row is selected. A single-row selection can just use the row's overflow menu.

## Examples

**Correct pattern — SS Prospect-view (reference implementation).**

The originating surface. Under this doctrine, the Prospect-view list renders:

- Row click → Open prospect detail (default nav; no inline "Open" button needed since the row IS the affordance).
- Kebab at row end → **View details** (explicit, for users who want certainty) → **Edit** → **Duplicate as template** → **Archive** → (separator) → **Delete**.
- Page toolbar: **New prospect** (primary, left), **Search**, **Filter by status**, **Refresh** (right).
- When rows are selected: toolbar swaps to "N selected · Archive · Delete · Assign to consultant · Cancel."

**Correct pattern — KE ExpenseCard with inline action.**

KE's `~/dev/ke-console/src/components/ExpenseCard.tsx` uses a tap-to-open row action. Overflow menu on the right edge holds **Edit amount** / **Re-categorize** / **Delete**. Page-level actions (**Add expense**, **Filter by month**) live in a bottom tab bar on mobile — the mobile-native equivalent of the page toolbar.

**Anti-pattern — inline action cluster.**

A list where every row shows "Open · Edit · Archive · Delete" as four inline buttons. Readers have to re-decide which action is intended on every row. Dense surfaces become impossible to scan. Fix: one inline action (if any), rest in overflow.

**Anti-pattern — hover-reveal kebab.**

A kebab menu that only appears on row hover. Fails on touch devices, fails for keyboard users, fails for screen-reader navigation. Fix: always visible, just low contrast until interaction.

## Cited authority

- [Shopify Polaris — Common actions pattern](https://polaris-react.shopify.com/patterns/common-actions) — the canonical Problem/Solution/Examples articulation for row + bulk + page-level actions.
- [Shopify Polaris — Resource Index pattern](https://polaris-react.shopify.com/patterns/resource-index) — bulk-actions banner + selection model.
- [Material 3 — Menus](https://m3.material.io/components/menus/guidelines) — overflow/context-menu ordering and behavior.
- [Material 3 — Lists](https://m3.material.io/components/lists/guidelines) — list-row action placement.
- [Apple HIG — Menus](https://developer.apple.com/design/human-interface-guidelines/menus) — destructive actions separated and labeled as destructive.
- [NN/g — Hover Gestures Can Cause Usability Problems](https://www.nngroup.com/articles/hover-gestures/) — why hover-reveal breaks on touch and for keyboard navigation.
- [Atlassian — Dropdown menu](https://atlassian.design/components/dropdown-menu/usage) — menu-item ordering and destructive separation.

## Relationship to other patterns

- **[Pattern 03 — Button hierarchy](03-button-hierarchy.md)** — page toolbar's **New** is the one primary per view. Row actions are tertiary or navigational.
- **[Pattern 01 — Status display by context](01-status-display-by-context.md)** — in a list row with an action cluster, status uses pill treatment (list-row context). The kebab doesn't change that.
- **[Pattern 07 — Shared primitives](07-shared-primitives.md)** — the row + kebab + toolbar is a shared primitive per venture. Extract `PortalListItem` / `ExpenseCard` / equivalents the first time the pattern appears twice; don't hand-roll per surface.

## Per-venture adoption

This pattern applies across every venture with a list surface (VC, KE, DC, SC, DFG, SS, and future ventures). Implementations differ in technology (Astro vs React) and styling (Tailwind tokens per venture) but the zones and ordering are shared.

**Adoption checklist** when implementing or reviewing a list surface:

- [ ] Row has at most one inline action; if zero, the row itself is clickable to the default action.
- [ ] Overflow menu always visible at row end (no hover-reveal).
- [ ] Menu ordering: View → Edit → Duplicate → Archive → (separator) → Delete.
- [ ] Destructive items separated and rendered in error color.
- [ ] Page toolbar exists above the list with list-level actions.
- [ ] "New" (or equivalent primary action) is the page's one primary per [Pattern 03](03-button-hierarchy.md).
- [ ] Bulk actions appear contextually when rows are selected; hidden otherwise.
- [ ] No per-row action duplicated in the page toolbar when a single row is selected.

## Detection

Phase 7's extended `ui-drift-audit` will include an Actions-and-menus column covering:

- Row count of inline action buttons (violation: ≥2).
- Hover-class detection on kebab / overflow-menu containers (violation: any `hover:*` that toggles opacity/visibility).
- Missing kebab on list-index pages that render entity rows with edit/delete capability (violation: list page with mutations but no overflow surface).

Until Phase 7 extends the skill, review is manual via the adoption checklist above.

## Provenance

Authored 2026-04-24 under the enterprise design-system process defined by [the Phase 3 proposal](../proposal.md). First pattern not promoted from a venture — authored directly in enterprise scope. Seeds Phase 4 of the [enterprise design system initiative](../enterprise-scoping.md). Closes the SS Prospect-view row-action question that originated this work.
