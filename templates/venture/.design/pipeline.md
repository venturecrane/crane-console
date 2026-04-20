# {VENTURE_NAME} — Design Pipeline State

Tracks progress through the design skill stack for this venture. Agents update the checkboxes as they complete each step; humans use the table to know where to pick up.

## Stack overview

| Step | Skill                                     | Scope                                                          | Output                                               |
| ---- | ----------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| 1    | `/design-brief`                           | Product-level (PRD → charter)                                  | `docs/design/brief.md`, `docs/design/design-spec.md` |
| 2    | `/frontend-design`                        | Identity exploration (Anthropic plugin)                        | Generated UI (pixels we extract tokens from)         |
| 3    | `/design-brief --extract-identity <path>` | Tokens from step 2 → `.design/DESIGN.md` + `.design/theme.css` | Concrete token spec                                  |
| 4    | `/nav-spec`                               | IA + patterns + chrome                                         | `.design/NAVIGATION.md` v3+                          |
| 5    | `/ux-brief <area>`                        | Per-surface-area brief                                         | `.design/<area>-ux-brief.md`                         |
| 6    | `/product-design --set <area>`            | Realization (revise-aware)                                     | Components in `src/components/<area>/`               |

Steps 1–4 run once per product. Steps 5–6 run once per surface area (portal, admin, marketing, etc.).

## Product-level

- [ ] **Step 1 — `/design-brief`**
      Output: `docs/design/brief.md`
      Date: _(not started)_

- [ ] **Step 2 — `/frontend-design`** (Anthropic plugin)
      Identity direction chosen: _(not started)_
      Date: _(not started)_

- [ ] **Step 3 — `/design-brief --extract-identity <path>`**
      Output: `.design/DESIGN.md` + `.design/theme.css`
      Date: _(not started)_

- [ ] **Step 4 — `/nav-spec`**
      Output: `.design/NAVIGATION.md`
      Version: _(not started)_
      Date: _(not started)_

## Per-surface-area

### portal

- [ ] **Step 5 — `/ux-brief portal`**
      Output: `.design/portal-ux-brief.md`
      Date: _(not started)_

- [ ] **Step 6 — `/product-design --set portal`**
      Components: `src/components/portal/`
      Preview: `/design-preview/portal-*`
      Date: _(not started)_

### admin

- [ ] **Step 5 — `/ux-brief admin`**
      Output: `.design/admin-ux-brief.md`
      Date: _(not started)_

- [ ] **Step 6 — `/product-design --set admin`**
      Components: `src/components/admin/`
      Preview: `/design-preview/admin-*`
      Date: _(not started)_

### marketing

- [ ] **Step 5 — `/ux-brief marketing`**
      Output: `.design/marketing-ux-brief.md`
      Date: _(not started)_

- [ ] **Step 6 — `/product-design --set marketing`**
      Components: `src/components/` (or venture-specific path)
      Preview: `/design-preview/marketing-*`
      Date: _(not started)_

## Notes

- **Identity reset on an existing venture:** restart from step 2 (`/frontend-design`), extract via step 3, then re-run step 6 (`/product-design --set <area>`) on each surface area. Step 6 is revise-aware — existing shipped components are loaded as prior-version context automatically.
- **`ux-brief` updates:** if identity changes materially, step 5 per area needs a refresh (run `/ux-brief <area> --revise`) before step 6 reruns.
- **`nav-spec` usually survives identity resets.** Structural rules (IA, patterns, chrome correctness) are orthogonal to aesthetic direction. Only revise step 4 if the new identity introduces new surface classes or pattern needs.

## Rename or add surface areas

Add more surface-area blocks as the product grows (e.g., `### onboarding`, `### settings`). Each block mirrors the portal/admin/marketing shape above.
