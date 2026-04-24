---
title: 'Enterprise UI/UX Design System — Scoping Brief'
sidebar:
  order: 40
---

# Enterprise UI/UX Design System — Scoping Brief

**Status.** Scoping. Phase 1 (research brief) is the first deliverable.
**Owner.** SMDurgan (Captain).
**Origin.** 2026-04-24.

## Origination

Raised 2026-04-24 during ss-console entity-lifecycle work. An asserted row-action menu pattern was challenged; investigation found no such doctrine exists — neither in SS nor enterprise-wide. The real finding: individual ventures have good pieces (`nav-spec` skill, `ui-drift-audit` skill, SS `docs/style/UI-PATTERNS.md`), but the enterprise has no unified design system, no shared vocabulary, and no governance for evolving one. Work pivoted from "fix one view" to "establish the system." The SS Prospect-view redesign is paused pending the pilot pattern under this new process.

## Problem

SMDurgan runs multiple software ventures on shared capacity. UI decisions are made ad-hoc per venture. Solved problems get re-solved. Cross-venture UX drifts. Enterprise-scope skills exist (`nav-spec`, `ui-drift-audit`, `design-brief`, `ux-brief`, `product-design`) but are not unified under a single design-system doctrine.

## Scope

Establish an enterprise UI/UX design system covering the standard eight layers, plus the governance process for authoring and evolving it. Each venture inherits; venture-specific extensions feed back.

## Shared Vocabulary

Stop overloading "pattern" and "rule." The eight layers:

1. **Foundations** — principles, voice, a11y baseline
2. **Design tokens** — color / type / spacing / elevation / motion / radii (W3C Design Tokens CG format)
3. **Components** — primitives (atoms) + composites (organisms)
4. **Patterns** — recurring UX problem/solution pairs: navigation, actions & menus, data display, forms, feedback, empty states
5. **Templates** — page-level compositions
6. **Guidelines** — prose doctrine (content, IA, interaction, a11y)
7. **Tooling** — drift audits, linters, codemods, generators
8. **Governance** — authoring, review, versioning, deprecation, ownership

Reference frames: Brad Frost _Atomic Design_ for components; Nathan Curtis / EightShapes for governance.

## Strategic Approach: Adopt + Adapt

We cannot build Polaris. Reference open systems as cited authorities (Polaris, Carbon, Material 3, Atlassian, HIG — already the anchor set in SS `docs/style/UI-PATTERNS.md`). Use Radix / Shadcn as component substrate. Use W3C-DTCG for the token layer. Add a thin enterprise layer on top: foundations doc, token set, pattern library, governance process.

## Existing Assets to Build On

- **`nav-spec` skill** (global, v3.0.0) — the cleanest example of a cited, validated, agent-discoverable pattern spec. Use as the template for other pattern specs.
- **`ui-drift-audit` skill** (enterprise) — source-level drift detection.
- **`design-brief`, `ux-brief`, `product-design` skills** — authoring loop.
- **`skill-review`, `skill-audit`** — governance primitives already applied to skills; reuse shape for design-system governance.
- **SS per-venture:** `docs/style/UI-PATTERNS.md` (7 visual rules, cited, with validator gates), `docs/style/empty-state-pattern.md`, portal component registry (`PortalListItem`, `StatusPill`, etc.).
- **Crane-console:** `docs/design-system/` already covers foundations, token taxonomy, and brand architecture. Per-venture `design-spec.md` files exist for vc, ke, dc, smd, sc, dfg.

## Phased Plan

1. **Research brief** (~3h). Survey 4-5 enterprise systems (GitHub Primer, Shopify Polaris, Atlassian, IBM Carbon, Adobe Spectrum or WorkOS), W3C-DTCG spec, EightShapes governance models. Include enterprise inspection of current venture repos. **Deliverable:** 1-page summary — what to adopt, adapt, skip.
2. **Current-state inventory.** Formal map of each venture's assets against the 8-layer stack. Empty slots, duplicates, inconsistencies.
3. **Design system proposal.** Scaffold: what documents exist, where they live (crane-console vs venture repos), what shape each takes, what the authoring/review loop is. Sized for SMDurgan, not Shopify.
4. **Pilot pattern: actions & menus.** Covers row actions, overflow, bulk selection. First pattern authored under the new process, proving it end-to-end. Closes the SS Prospect-view loop that originated this.

## First Deliverable

**Phase 1 research brief.** Tracked in GitHub. See the open issue on `venturecrane/crane-console` with label `design-system`.

## Open Questions (Defer to Phase 3)

- Single doctrine doc vs federated per-category specs?
- How much automation (validators, codemods) vs prose?
- Versioning scheme for tokens / components / patterns?
- Coverage metric per venture — can we measure adoption?

## Cross-Session Continuity

This initiative originated in `ss-console`. The SS-side work is parked as SS Task #12 pending completion of Phase 4 (pilot pattern: actions & menus), at which point the SS Prospect-view redesign resumes under the new doctrine.
