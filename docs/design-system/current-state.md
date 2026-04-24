---
title: 'Current State Inventory'
sidebar:
  order: 45
---

# Current State Inventory

**Purpose.** Durable map of every venture's design-system assets against the [eight-layer framework](enterprise-scoping.md). Phase 2 deliverable of the enterprise design system initiative. Kept current as assets land; the authoritative answer to "what does X venture have for layer Y?"

**Layers** (abbreviated; see [scoping brief](enterprise-scoping.md) for full definitions):

1. Foundations — principles, voice, a11y baseline
2. Tokens — color, type, spacing, elevation, motion
3. Components — atoms, molecules, organisms
4. Patterns — recurring UX problem/solution pairs
5. Templates — page-level compositions
6. Guidelines — prose doctrine
7. Tooling — drift audits, linters, codemods, generators
8. Governance — authoring, review, versioning, deprecation

**Status key.** **C** = concrete (exists, documented, enforced). **P** = partial (some of the above). **A** = absent.

## Maturity Matrix

| Scope      | L1 Found | L2 Tokens | L3 Comp | L4 Patt | L5 Tmpl | L6 Guide | L7 Tool | L8 Gov |
| ---------- | -------- | --------- | ------- | ------- | ------- | -------- | ------- | ------ |
| Enterprise | C        | C         | A       | P       | A       | P        | C       | C      |
| VC         | C        | C         | C       | P       | A       | P        | C       | C      |
| KE         | C        | C         | C       | P       | A       | P        | C       | C      |
| DC         | C        | C         | C       | P       | A       | P        | C       | C      |
| SC         | P        | A         | A       | A       | A       | A        | P       | C      |
| DFG        | P        | P         | P       | A       | A       | A        | P       | C      |
| SMD        | A        | A         | A       | A       | A       | A        | A       | A      |
| SS         | A        | P         | C       | C       | A       | C        | P       | P      |

## Enterprise-Level Assets

**L1 Foundations — Concrete.** `docs/design-system/brand-architecture.md` defines shared visual identity, color philosophy, typography approach, crane motif, imagery, principles. `docs/design-system/overview.md` covers spec structure, maturity tiers, contribution process.

**L2 Tokens — Concrete.** `docs/design-system/token-taxonomy.md` defines `--{prefix}-{category}-{variant}` naming convention with categories: `color-`, `surface-`, `text-`, `border-`, `space-`, `font-`, `text-size-`, `radius-`, `shadow-`. No centralized token registry or JSON export despite brand-architecture principle 3 promising one.

**L3 Components — Absent.** No enterprise-wide component library. Components live per-venture.

**L4 Patterns — Partial.** `docs/design-system/index.md` navigates but delegates pattern definitions to ventures. SS has the only mature pattern-library in the portfolio and is operating outside the enterprise framework (see Cross-Cutting Findings).

**L5 Templates — Absent.**

**L6 Guidelines — Partial.** `docs/design-system/overview.md` covers contribution process and maturity tiers. No detailed usage guidelines.

**L7 Tooling — Concrete.** Skills: `nav-spec` (global, v3.0.0), `design-brief`, `product-design`, `ux-brief`. The `ui-drift-audit` skill is referenced from SS `docs/style/UI-PATTERNS.md` but its location has not been verified — it may live per-venture, inside `nav-spec`, or at enterprise scope.

**L8 Governance — Concrete.** Per-venture `docs/ventures/{code}/design-spec.md` files (6) auto-synced to crane-context. Design maturity tiers declared in `docs/design-system/overview.md`.

## Per-Venture Inventory

### VC (Venture Crane) — Tier 1 Enterprise

Home venture; design-system docs are authored here. Dark-only, Astro, system fonts.

- **L1** `docs/ventures/vc/design-charter.md` — C
- **L2** `docs/ventures/vc/design-spec.md` (colors, surfaces, text, spacing) — C
- **L3** `docs/ventures/vc/design-brief.md` + inline component docs (ArticleCard, PortfolioCard, BuildLogEntry, Header, Footer, HeroSection, SkipLink, CodeBlock, TableWrapper) — C
- **L4** WCAG 2.1 AA, skip link, focus indicators, dark-only theme — P
- **L7** Astro, Tailwind v4, system fonts — C (stack documented in spec)

### KE (Kid Expenses) — Tier 1 Enterprise

Next.js 16 (App Router), Tailwind v4, Geist Sans/Mono, Clerk. Light/dark dual-theme via `prefers-color-scheme`.

- **L1** `~/dev/ke-console/docs/design/charter.md` — C
- **L2** `docs/ventures/ke/design-spec.md` (tokens, light/dark modes) — C
- **L3** Inline component docs (ExpenseCard, StatusBadge, ExpenseForm, BottomNav, Sheet, QuestionThread) — C
- **L4** Dual-theme, WCAG 2.1 AA, touch targets 44×44px, semantic tokens only — P
- **L6** Explicit rule: no raw Tailwind colors in page code — C

### DC (Draft Crane) — Tier 1 Enterprise

Next.js 16.1.6, Tailwind v4, CSS custom properties, TipTap (ProseMirror), Clerk. iPad-first responsive, light-only.

- **L1** `~/dev/dc-console/docs/design/charter.md` — C
- **L2** `~/dev/dc-console/docs/design/brief.md`; `docs/ventures/dc/design-spec.md` (400+ token variables, semantic palette, motion system) — C
- **L3** `~/dev/dc-console/docs/design/library-desk-spec.md`; `~/dev/dc-console/docs/design/voice-tone-help.md`; inline docs (Toolbar, Toggle Controls, Feedback Sheet, Onboarding Cards, Help Accordion, Editor Panel, Sources Panel) — C
- **L4** `~/dev/dc-console/docs/design/contributions/` (archived contributions) — P

### SC (Silicon Crane) — Tier 3 Greenfield

Identity and audience defined; no implementation yet.

- **L1** `docs/ventures/sc/design-spec.md` (identity, audience, brand voice) — P
- **L2** Spec declares "No tokens implemented yet. Starting values proposed." — A
- **L3** "No components defined yet." — A
- **L4** "Use standard HTML5 semantic elements. As patterns emerge during development, document them here." — A
- **L7** Astro (content), Next.js TBD (app), Tailwind v4 recommended but not yet implemented — P

### DFG (Durgan Field Guide) — Tier 3 Greenfield

Astro (content) + Next.js (dfg-core, dfg-app). Tailwind v3 (migration to v4 pending).

- **L1** `docs/ventures/dfg/design-spec.md` (identity, audience, brand voice) — P
- **L2** RGB-based tokens with media query dark/light toggle; motion support absent — P
- **L3** Minimal; lists gradient backgrounds, scrollbar styling, safe area handling — P
- **L4** Spec notes gaps: "No documented component library, no consistent card/panel pattern, no button variants, no form input system." — A

### SMD (SMD Ventures) — Status contested

`docs/ventures/smd/design-spec.md` **contains Silicon Crane spec content (file-copy error)**. `docs/design-system/overview.md` declares SMD Tier 2 (Established) but no verified spec exists. Tracked as a separate issue.

- **All layers** — A pending spec creation

### SS (ss-console) — Outside enterprise framework

Produces the most mature Layer 4 assets in the portfolio. Operating parallel to, not inside, the enterprise design system.

- **L3** `~/dev/ss-console/src/components/portal/` — `PortalListItem`, `StatusPill`, `MoneyDisplay` (referenced in UI-PATTERNS.md) — C
- **L4** `~/dev/ss-console/docs/style/UI-PATTERNS.md` (7 cited rules) + `~/dev/ss-console/docs/style/empty-state-pattern.md` — C
- **L6** Enforcement via `nav-spec/validate.py`, forbidden-strings.test.ts, merge-gate workflow — P
- **L2** Typography scale (7 tokens) + spacing rhythm (4 tokens) embedded in UI-PATTERNS rules 5 & 6; not cross-referenced to enterprise taxonomy — P

### SS's Seven UI-Pattern Rules

All cite public authority (Material 3, Polaris, Atlassian, Carbon, NN/g, HIG, WCAG):

1. Status display by context — pill vs eyebrow vs dot vs prose
2. Redundancy ban — one signal per fact
3. Button hierarchy — one primary per view
4. Heading skip ban — h1 → h2 → h3 descending
5. Typography scale — `text-display`, `text-title`, `text-heading`, `text-body-lg`, `text-body`, `text-caption`, `text-label`
6. Spacing rhythm — `space-section`, `space-card`, `space-row`, `space-stack`
7. Shared primitives — repeated elements rendered through components, not hand-rolled

## Cross-Cutting Findings

### Empty slots affecting every venture

- **No centralized component library.** Components exist per-venture, none cross-venture.
- **No JSON token export.** `brand-architecture.md` principle 3 states "Designs export as JSON and CSS tokens" — only CSS exists. W3C-DTCG adoption (Phase 3) closes this.
- **No L5 Templates layer.** No venture has page-level composition docs.
- **No automated token compliance.** Taxonomy is documented but enforcement is manual; KE's "no raw Tailwind colors" rule has no merge gate.

### Duplicates and inconsistencies

- **SMD/SC spec collision.** `docs/ventures/smd/design-spec.md` is a copy of SC content.
- **SS typography/spacing tokens not mapped to enterprise taxonomy.** Is SS's `text-label` = `--{prefix}-text-size-label`? Unresolved.
- **Dark/light divergence.** VC dark-only; KE, DFG dual via `prefers-color-scheme`; DC light-only. No enterprise decision.
- **Component naming conventions vary.** VC PascalCase `.astro`; KE PascalCase `.tsx`; DC semantic + BEM-like. No enforced convention.

### Tooling gaps

- `ui-drift-audit` skill location unverified in this scan.
- No AST/grep rules enforce naming conventions across ventures.
- No CI check prevents color drift (hardcoded hex instead of token).

## What Phase 3 Must Address

Derived from the inventory above, ranked by impact:

1. **Build `@venturecrane/tokens`** — W3C-DTCG JSON source compiled via Style Dictionary to per-venture CSS variable sets. Closes the "no JSON export" gap and the "no centralized token registry" gap in one artifact.
2. **Scaffold `docs/design-system/patterns/`** — one file per pattern in Polaris's Problem / Solution / Examples format. Seed from SS's seven rules (promoted from `ss-console` — see Issue below).
3. **Scaffold `docs/design-system/components/`** — Atomic Design vocabulary (atoms / molecules / organisms). Start by cataloging what already exists per venture, not building new.
4. **Token enforcement skill** — grep/AST rules for hardcoded hex/rgb/Tailwind color classes. Runs as merge gate. Either extends `ui-drift-audit` or replaces it (depends on where the current skill lives).
5. **`docs/design-system/governance.md`** — tiered contribution model + explicit deprecation lifecycle (deprecated → hidden → removed, minimum 2 minor versions).

## Open Issues (Filed Separately)

- **SMD design-spec file-copy error.** Restore or rewrite to actual SMD content.
- **Promote SS UI-PATTERNS.md to enterprise scope.** Adopts SS's seven rules as enterprise patterns 1-7; required before Phase 4 pilot pattern (actions & menus) so it sits in the right directory.
- **Verify `ui-drift-audit` skill location.** Where does it live, who owns it, does it run cross-venture today?

## Refresh Cadence

This doc is refreshed at the start of each design-system phase and whenever a venture lands significant new design assets. Matrix cells change state only on verified file-level evidence. When a cell moves from A to P or C, note the commit or PR that promoted it in the per-venture section.
