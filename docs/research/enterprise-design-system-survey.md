---
title: 'Enterprise Design System Survey'
sidebar:
  order: 50
---

# Enterprise Design System Survey — Phase 1 Research Brief

**Initiative.** [`docs/design-system/enterprise-scoping.md`](../design-system/enterprise-scoping.md) · [Issue #690](https://github.com/venturecrane/crane-console/issues/690)
**Date.** 2026-04-24
**Scope.** What to adopt, adapt, or skip from 5 mature design systems, 3 standards/governance bodies, and our own current state, in service of expanding VC's 2-layer design system to all 8 layers.

## TL;DR — Named Primitives to Pull Forward

1. **Tokens: adopt W3C-DTCG + Style Dictionary v4.** The DTCG spec hit [first stable version on 2025-10-28](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/). Adobe Spectrum, GitHub Primer, Atlassian, Salesforce, Shopify, and Figma/Sketch/Google/Microsoft have all converged on it. Our existing `--{prefix}-{category}-{variant}` scheme maps cleanly to DTCG's `$value` / `$type` / alias syntax. Phase 3 should publish a single `@venturecrane/tokens` package compiled via Style Dictionary to per-venture CSS variable sets.
2. **Patterns: adopt Polaris's Problem → Solution → Examples format.** Shopify's [pattern library](https://polaris-react.shopify.com/patterns) is the gold standard for Layer 4. Each pattern is structured as merchant goal → recommended layout → real implementation. SS `docs/style/UI-PATTERNS.md` already cites Polaris as an anchor, so adoption is partial. Phase 4's actions-and-menus pilot should use this exact shape.
3. **Governance: adapt EightShapes' tiered contribution model, skip federated team structure.** Nathan Curtis's [solitary / centralized / federated](https://medium.com/eightshapes-llc/team-models-for-scaling-a-design-system-2cf9d03be6a0) trichotomy maps to staffing levels VC doesn't have. Run **solitary** shape (SMDurgan + AI teammates own the system and ship with it) with Curtis's small-vs-large [contribution distinction](https://medium.com/eightshapes-llc/defining-design-system-contributions-eb48e00e8898) for gating.
4. **Components: use Atomic Design as shared vocabulary, not taxonomy.** Atoms / molecules / organisms / templates is [Frost's explicit "mental model, not dogma"](https://atomicdesign.bradfrost.com/chapter-2/). Adopt the terms (so `PortalListItem` is an organism, `StatusPill` is a molecule) without restructuring files.
5. **Tooling: adopt Atlassian's enforcement posture** — ESLint + Stylelint plugins that fail the build on hardcoded hex values and un-tokenized spacing. KE's design spec already mandates "no raw Tailwind color classes"; a plugin makes the rule enforceable, not aspirational.

**Skip entirely:** Polaris's monorepo tooling, Carbon's four-theme switcher, Spectrum's cross-platform token pipeline, any "design council" governance. These exist to solve team-scale coordination problems VC doesn't have.

## Methodology

Seven parallel research agents surveyed: GitHub Primer, Shopify Polaris, IBM Carbon, Atlassian Design System, Adobe Spectrum, and three standards/governance bodies (W3C-DTCG, EightShapes, Atomic Design). A seventh agent inspected the current state of 7 venture repos (vc, ke, dc, smd, sc, dfg, ss) plus enterprise-level assets in crane-console. Each web-survey agent returned an adopt/adapt/skip verdict per layer with named primitives; the inspection agent named concrete files and maturity per venture. Raw agent outputs preserved in `/tmp/claude-501/.../tasks/*.output`.

## Five Enterprise Design Systems

| System                                                | Layers covered       | Standout primitive                                                                                                                                                            | Verdict on core primitive        |
| ----------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| [GitHub Primer](https://primer.style/)                | 1, 2, 3, partial 6-7 | [Style Dictionary + W3C-DTCG in `primer/primitives`](https://github.com/primer/primitives) — multi-format token compilation from one source                                   | **ADOPT** token pipeline         |
| [Shopify Polaris](https://polaris-react.shopify.com/) | 1-4, 6-8             | [Pattern format](https://polaris-react.shopify.com/patterns): Problem / Solution / Examples                                                                                   | **ADOPT** pattern format         |
| [IBM Carbon](https://carbondesignsystem.com/)         | 1-4, 6-8             | [v11 layered themes](https://github.com/carbon-design-system/carbon/blob/main/docs/migration/v11.md) — component-level tokens that theme-switch via CSS class                 | **ADAPT** for per-venture themes |
| [Atlassian](https://atlassian.design/)                | 1-4, 6-8             | [Compiled CSS + token deprecation lifecycle](https://developer.atlassian.com/platform/forge/design-tokens-and-theming/) — build-time enforcement, explicit deprecation stages | **ADOPT** enforcement posture    |
| [Adobe Spectrum](https://spectrum.adobe.com/)         | 1-4, 6-7             | [`@spectrum-css/tokens`](https://www.npmjs.com/package/@spectrum-css/tokens) — tokens shipped as standalone W3C-DTCG package                                                  | **ADOPT** package shape          |

### Shape summaries

**Primer.** Three-layer bottom-up: tokens ship independently to npm, components build on those tokens, GitHub's product builds on components. Strongest at the token compilation pipeline (Style Dictionary + DTCG + Figma sync via `$extensions`). Skip the 80+ React components — we need naming discipline, not the library.

**Polaris.** Merchant-centric. Seven patterns ([Settings, Resource Details, Resource Index, Common Actions, Date Picking, Cards, New Features](https://polaris-react.shopify.com/patterns)) structured as problem/solution/examples. This is the archetype for what VC's pattern library should look like. Monorepo tooling (pnpm + Turbo) is Shopify-scale overkill.

**Carbon.** Enterprise/B2B-heavy. Carbon v11's novel move: tokens like `interactive-01`, `layer-01` are mapped to usage roles, not hex values, and themes (White / G10 / G90 / G100) switch via CSS class (`cds--g10`) without touching component code. For VC's 6 ventures with per-venture brand voices, this pattern adapts: define venture token packages, inherit shared components, override only token values.

**Atlassian.** Multi-product coherence across Jira / Confluence / Bitbucket / Trello — the closest real-world analog to VC's shape. Distinctive: Compiled CSS at build time transforms `token('space.200')` into `var(--ds-space-200, 1rem)`, plus [ESLint/Stylelint plugins](https://developer.atlassian.com/platform/forge/design-tokens-and-theming/) that warn on cross-product violations, plus a strict deprecated → soft-deleted → removed token lifecycle. This is the enforcement stack VC should copy.

**Spectrum.** Adobe's cross-platform system for 130+ products. Proof point: the token layer can be a standalone npm package in W3C-DTCG format ([`adobe/spectrum-tokens`](https://github.com/adobe/spectrum-tokens), widely cited as a reference implementation). Skip the cross-platform machinery — VC is web-first.

## Standards and Governance

### W3C-DTCG — ADOPT

The [Design Tokens Community Group format](https://tr.designtokens.org/format/) standardizes token interchange via JSON with `$value`, `$type`, composite types (shadow, border, typography, gradient, transition), and alias syntax `{group.token}`. [First stable release 2025-10-28](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/). Production adoption: Adobe, Google, Microsoft, Figma, Sketch, Salesforce, Shopify, Atlassian. [Style Dictionary v4 has first-class DTCG support](https://styledictionary.com/info/dtcg/). VC's migration cost is moderate — the existing `--{prefix}-{category}-{variant}` hierarchy maps to DTCG nested groups.

### EightShapes / Nathan Curtis — ADAPT (tiered contribution), SKIP (federated governance)

Curtis frames [design systems as products](https://medium.com/eightshapes-llc/starting-a-design-system-6b909a578325), not projects. His [three team models](https://medium.com/eightshapes-llc/team-models-for-scaling-a-design-system-2cf9d03be6a0):

- **Solitary** — one team owns system + their own product. Works only if the system serves all.
- **Centralized** — dedicated system team produces components without shipping products. Loses context.
- **Federated** — designers across product teams collaborate. Broad legitimacy, requires coordination overhead.

For SMDurgan + AI teammates: **solitary** is the only viable shape. AI teammates substitute for what would otherwise require dedicated staff. Adopt Curtis's [contribution-vs-participation distinction](https://medium.com/eightshapes-llc/defining-design-system-contributions-eb48e00e8898) and his tiered workflow (small contributions = fast + autonomous, large contributions = proposal + review).

### Atomic Design — ADOPT (as vocabulary)

[Frost's taxonomy](https://atomicdesign.bradfrost.com/chapter-2/) — atoms / molecules / organisms / templates / pages — is explicitly a mental model, not an enforced file layout. Adopt the terms to align VC's existing component naming. Atoms = primitives (Button, Input, Icon), molecules = single-responsibility composites (StatusPill, MoneyDisplay), organisms = region-level compositions (PortalListItem, Header). No restructuring required.

## Current-State Inventory

**Enterprise-level (crane-console).** Layer 1 (foundations) and Layer 2 (token taxonomy) are concrete at `docs/design-system/overview.md`, `token-taxonomy.md`, `brand-architecture.md`. Layer 7 (tooling) is partial — skills exist for `nav-spec`, `design-brief`, `product-design`, `ux-brief`. Layers 3, 4, 5, 6, 8 are absent or partial at enterprise level; they live scattered per-venture.

**Maturity matrix** (Concrete = C, Partial = P, Absent = A):

| Venture    | L1 Found | L2 Tokens | L3 Comp | L4 Patt | L5 Tmpl | L6 Guide | L7 Tool | L8 Gov |
| ---------- | -------- | --------- | ------- | ------- | ------- | -------- | ------- | ------ |
| Enterprise | C        | C         | A       | P       | A       | P        | C       | C      |
| VC         | C        | C         | C       | P       | A       | P        | C       | C      |
| KE         | C        | C         | C       | P       | A       | P        | C       | C      |
| DC         | C        | C         | C       | P       | A       | P        | C       | C      |
| SC         | P        | A         | A       | A       | A       | A        | P       | C      |
| DFG        | P        | P         | P       | A       | A       | A        | P       | C      |
| SMD        | A        | A         | A       | A       | A       | A        | A       | A      |
| SS         | A        | P         | C       | C       | A       | C        | P       | P      |

### Urgent findings

- **`docs/ventures/smd/design-spec.md` contains Silicon Crane content.** File-copy error. Fix in Phase 3 or sooner — either restore the intended SMD spec or correct the file name. Flagged as a P3 task separately from the initiative.
- **SS has the most mature pattern governance of any venture and operates outside the enterprise framework.** `docs/style/UI-PATTERNS.md` has 7 rules with public-source citations (Material 3, Polaris, Atlassian, Carbon, NN/g, HIG, WCAG), a typography scale with 7 named tokens, a 4-token spacing rhythm, and a merge-gate workflow. When Phase 4 authors the first enterprise pattern, SS's existing rules should be promoted to Layer 4 at enterprise scope — not parallel-authored.
- **`ui-drift-audit` skill is referenced in SS UI-PATTERNS.md but location was not verified in this scan.** Phase 2 must confirm where it lives (venture-local vs enterprise) before wiring enforcement.
- **No JSON token export exists despite being promised.** Brand Architecture principle 3 states tokens export as JSON and CSS. CSS custom properties exist in each venture's globals.css, but no JSON export pipeline is in place. This is the concrete gap the W3C-DTCG adoption closes.

## Recommendation — Phase 3 Scaffold

When Phase 3 drafts the design-system proposal, it should produce these concrete artifacts:

1. **`@venturecrane/tokens` package** (in crane-console or separate repo) publishing W3C-DTCG JSON as source of truth. Style Dictionary v4 compiles to per-venture CSS variable sets (`vc.css`, `ke.css`, ...) preserving the existing `--{prefix}-{category}-{variant}` surface.
2. **`docs/design-system/patterns/` directory** with one file per pattern, each following Polaris's Problem → Solution → Examples structure. Seed with the SS rules (promoted from `ss-console/docs/style/UI-PATTERNS.md`) as patterns 1-7. Phase 4 adds the actions-and-menus pattern as #8.
3. **`docs/design-system/components/` directory** using Atomic Design vocabulary (atoms / molecules / organisms) to document the cross-venture component inventory. Start by cataloging what already exists (Button, StatusPill, PortalListItem, ExpenseCard, etc.) — don't build new components yet.
4. **Token enforcement skill** (new `ui-drift-audit` or extension of the referenced one) that grep/AST-checks for hardcoded hex/rgb values, un-tokenized spacing numbers, and raw Tailwind color classes. Runs as a merge gate.
5. **`docs/design-system/governance.md`** — tiered contribution model (small = auto-merge with tests passing, large = issue + spec update + review) and explicit deprecation lifecycle (deprecated → hidden → removed, minimum 2 minor versions between stages).

Estimated Phase 3 effort: 1 planning session + 3 execution sessions.

## Open Questions Deferred to Phase 3

- Single doctrine doc vs federated per-category specs — **leaning federated** given that each of the 8 layers has distinct cadence and audience.
- How much automation vs prose — **automation for tokens** (Layer 2 is mechanically enforceable), **prose for patterns** (Layer 4 is judgment-driven).
- Versioning scheme — **leaning semver on `@venturecrane/tokens`**; components and patterns unversioned but dated.
- Coverage metric per venture — **leaning** "fraction of hex/rgb values replaced by tokens" as the leading indicator, "drift-audit violations per 1k LOC" as the trailing indicator.

These aren't settled here. They're the questions the Phase 3 proposal has to answer.

## Sources

**Enterprise systems.** [Primer](https://primer.style/) · [`primer/primitives`](https://github.com/primer/primitives) · [Polaris](https://polaris-react.shopify.com/) · [Polaris patterns](https://polaris-react.shopify.com/patterns) · [Carbon](https://carbondesignsystem.com/) · [Carbon v11 migration](https://github.com/carbon-design-system/carbon/blob/main/docs/migration/v11.md) · [Atlassian Design System](https://atlassian.design/) · [Atlassian design tokens docs](https://developer.atlassian.com/platform/forge/design-tokens-and-theming/) · [Spectrum](https://spectrum.adobe.com/) · [`adobe/spectrum-tokens`](https://github.com/adobe/spectrum-tokens) · [`@spectrum-css/tokens`](https://www.npmjs.com/package/@spectrum-css/tokens)

**Standards and governance.** [W3C-DTCG format spec](https://tr.designtokens.org/format/) · [DTCG stable release announcement](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/) · [Style Dictionary DTCG support](https://styledictionary.com/info/dtcg/) · [Curtis — Starting a Design System](https://medium.com/eightshapes-llc/starting-a-design-system-6b909a578325) · [Curtis — Team Models](https://medium.com/eightshapes-llc/team-models-for-scaling-a-design-system-2cf9d03be6a0) · [Curtis — Defining Contributions](https://medium.com/eightshapes-llc/defining-design-system-contributions-eb48e00e8898) · [Frost — Atomic Design Ch. 2](https://atomicdesign.bradfrost.com/chapter-2/)

**Internal references.** `docs/design-system/overview.md` · `docs/design-system/token-taxonomy.md` · `docs/design-system/brand-architecture.md` · `docs/design-system/enterprise-scoping.md` · `docs/ventures/{vc,ke,dc,sc,dfg,smd}/design-spec.md` · `~/dev/ss-console/docs/style/UI-PATTERNS.md` · `~/dev/ss-console/docs/style/empty-state-pattern.md`
