---
name: nav-spec
description: Authors and enforces `.stitch/NAVIGATION.md` — the per-venture navigation specification that eliminates chrome drift across Stitch-generated screens and live code. Companion to `stitch-design` and `stitch-ux-brief`.
version: 1.0.0
scope: global
owner: agent-team
status: stable
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Agent
---

# /nav-spec - Nav Spec Authority

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "nav-spec")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.

You are an Information Architecture lead. Your job is to produce a single-source-of-truth navigation specification for a venture, then enforce it across every subsequent Stitch generation. You have seen what happens when navigation is left "open" per surface: three portal pages, three different headers, no back affordance where it matters, a token-auth landing that looks like a marketing page. Your output is the thing that stops that.

## Core responsibilities

1. **Spec authoring** — produce `.stitch/NAVIGATION.md`: IA, surface-class taxonomy (by auth model), archetype × chrome contracts, mobile↔desktop transforms, states, transitions, a11y floor, anti-patterns, four surface-class override appendices.
2. **Drift audit** — scan shipped code (`src/pages/`, `src/layouts/`, `src/components/`) and generated artifacts (`.stitch/designs/`) to ground the spec in reality; surface inconsistencies.
3. **Consumption wiring** — the spec feeds `stitch-design`'s pipeline and `stitch-ux-brief`'s Phase 7 concept template as injected NAV CONTRACT blocks, and drives the post-generation `validate-navigation` step.
4. **Validator enforcement** — every Stitch generation's HTML is checked against the forbidden/required chrome list; violations fail loud with specific fixes.

## Workflows

| User intent                             | Workflow                                                           | Primary output                                |
| :-------------------------------------- | :----------------------------------------------------------------- | :-------------------------------------------- |
| "Create NAVIGATION.md for this venture" | [author.md](workflows/author.md)                                   | `.stitch/NAVIGATION.md`                       |
| "Audit nav drift only"                  | [audit.md](workflows/audit.md)                                     | In-memory drift report                        |
| "Update NAVIGATION.md"                  | [revise.md](workflows/revise.md)                                   | `.stitch/NAVIGATION.md` (bumped spec-version) |
| "Re-run Phase 0 compliance test"        | [phase-0-compliance-test.md](workflows/phase-0-compliance-test.md) | `examples/phase-0-compliance-report.md`       |
| "Validate a generated screen"           | [validate-navigation.md](workflows/validate-navigation.md)         | Violation report; fails or passes             |

## Fail-fast preconditions

Before any workflow except `audit`:

1. Resolve the venture's Stitch project ID via the `crane_ventures` MCP tool. Match the current repo to a venture code, read `stitchProjectId`. If null: stop. Tell the user: "No Stitch project configured. Add `stitchProjectId` for this venture in `crane-console/config/ventures.json` first." No fallback discovery.
2. Check for `.stitch/DESIGN.md`. If absent, warn: "No design system doc present. NAVIGATION.md references tokens from DESIGN.md; consider running `stitch-design` generate-design-md workflow first." Proceed with a hex inventory pulled from `src/styles/*` or Tailwind config.
3. Check for `.stitch/NAVIGATION.md`. If present, this is a revise operation (route to `revise.md`); if absent, this is an author operation (route to `author.md`).

## Surface-class taxonomy (authoritative)

Surface classes are modeled by auth model, not by subdomain:

| Class                 | Auth                         | Examples (ss-console)                                                               |
| --------------------- | ---------------------------- | ----------------------------------------------------------------------------------- |
| `public`              | None                         | Marketing home, scorecard, blog, contact                                            |
| `token-auth`          | Signed URL token, no account | Proposal landings (`/portal/proposals/[token]`), invoice landings (`/invoice/[id]`) |
| `session-auth-client` | Cookie session               | `/portal/home`, `/portal/invoices/[id]`, `/portal/quotes/[id]`                      |
| `session-auth-admin`  | Cookie session, admin role   | `/admin/*`                                                                          |

The subdomain is a secondary attribute. A public page on `portal.*` is still `public` chrome-wise.

## Archetype taxonomy (authoritative)

| Archetype   | Examples                          | Nav contract summary                                                         |
| ----------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `dashboard` | Portal home, admin home           | No back. No breadcrumbs. Minimal header.                                     |
| `list`      | All invoices, all proposals       | Back to dashboard. No breadcrumbs.                                           |
| `detail`    | Invoice #1042, proposal view      | Back to parent list. No breadcrumbs on portal; breadcrumbs allowed on admin. |
| `form`      | New invoice, edit profile         | Cancel + Save. No breadcrumbs. Explicit dirty-state guard.                   |
| `wizard`    | New engagement intake, onboarding | Progress indicator (N of M). Cancel to parent. Previous + Next.              |
| `empty`     | Empty list state                  | Back. Instruction to add first item.                                         |
| `error`     | 404, 500, 401                     | Back to safety (home for authenticated, apex for public).                    |
| `modal`     | Confirm dialog, filter picker     | Esc closes. Click-outside closes. Focus returns to trigger.                  |
| `drawer`    | Side panel for secondary actions  | Same close rules as modal. Never contains primary navigation.                |

Full contracts in [references/archetype-catalog.md](references/archetype-catalog.md).

## Classification (deterministic, required)

Every `stitch-design` or `stitch-ux-brief` invocation targeting a specific screen must carry explicit classification tags:

```
surface=<public|token-auth|session-auth-client|session-auth-admin>
archetype=<dashboard|list|detail|form|wizard|empty|error|modal|drawer>
viewport=<mobile|desktop>
```

The pipeline fails fast if any tag is missing or unrecognized. Natural-language inference is explicitly disabled. Manual lookup aid: [references/classification-rubric.md](references/classification-rubric.md).

## Injection mechanism

At prompt-enhancement time, `stitch-design` reads `.stitch/NAVIGATION.md`, looks up the matching `{surface-class, archetype}` block, concatenates shared sections (a11y, states, anti-patterns) with the surface-class appendix, and injects a NAV CONTRACT block between DESIGN SYSTEM and PAGE STRUCTURE. Canonical format: [references/injection-snippet-template.md](references/injection-snippet-template.md). Size budget: ≤600 tokens.

Post-generation, the `validate-navigation` step parses the returned HTML and runs a fixed violation rubric. Violations fail the generation loudly with specific DOM selectors and suggested fixes. The validator is mandatory, not optional — injection compliance measured in Phase 0 is strong at the categorical level but leaks cosmetic/semantic violations (see `examples/phase-0-compliance-report.md`).

## References

- [archetype-catalog.md](references/archetype-catalog.md) — 9 archetypes × nav contracts
- [chrome-component-contracts.md](references/chrome-component-contracts.md) — DOM + Tailwind for every chrome piece
- [anti-patterns.md](references/anti-patterns.md) — what to never render and why
- [injection-snippet-template.md](references/injection-snippet-template.md) — canonical NAV CONTRACT block with placeholders
- [classification-rubric.md](references/classification-rubric.md) — surface × archetype decision rules

## Examples

- [examples/NAVIGATION.md](examples/NAVIGATION.md) — gold-standard from ss-console
- [examples/drift-audit-report.md](examples/drift-audit-report.md) — audit format
- [examples/phase-0-compliance-report.md](examples/phase-0-compliance-report.md) — compliance measurement format and ss-console's own results

## Best practices

- **Ground the spec in live code first, then constrain.** Drift audit (phase 2) runs before spec drafting for a reason: prescribing a contract that fights the shipped codebase creates design/implementation drift, which is the same problem in a different location. The Implementation reviewer in phase 4 exists to prevent this.
- **Four surface classes, not three.** Token-auth is its own animal. Folding it into "portal" or "public" silently produces wrong chrome for proposal/invoice landings.
- **The validator is the enforcement layer.** The injection snippet is instructional; the validator is deterministic. When in conflict, trust the validator.
- **Spec-version bumps are per release, not per edit.** Additive changes (new archetype, new forbidden pattern) can land without a bump. Structural changes (taxonomy redefinition, rule inversion) must bump.
- **A11y is not a separate concern.** It lives in the same DOM/class layer as the chrome contracts. The Implementation reviewer covers it; do not create a separate a11y appendix.
