---
title: 'Design System Proposal'
sidebar:
  order: 48
---

# Design System Proposal

**Purpose.** Defines the target shape of Venture Crane's enterprise design system: what documents exist, where they live, how they're authored and reviewed, and how they evolve. Phase 3 deliverable. Derived from the [scoping brief](enterprise-scoping.md) (direction), the [Phase 1 research](../research/enterprise-design-system-survey.md) (what to adopt from established systems), and the [current-state inventory](current-state.md) (what we have to build on).

**Sizing principle.** The proposal is sized for one operator with AI teammates, not a 50-designer org. Every heavy-process primitive from the surveyed systems (federated design councils, RFC cycles, dedicated system teams) has been reduced to its smallest functional equivalent.

## Target Architecture

Eight layers. For each, one or two concrete artifacts. Each artifact has a file path, a format, and a change cadence.

| #   | Layer       | Artifact(s)                                                    | Location                              | Format                                       | Cadence               |
| --- | ----------- | -------------------------------------------------------------- | ------------------------------------- | -------------------------------------------- | --------------------- |
| 1   | Foundations | `brand-architecture.md`, `overview.md`                         | `docs/design-system/` (existing)      | Prose                                        | Annual review         |
| 2   | Tokens      | `@venturecrane/tokens` package + `token-taxonomy.md`           | package: repo TBD; doc: existing      | W3C-DTCG JSON → Style Dictionary → CSS       | Semver on package     |
| 3   | Components  | `docs/design-system/components/` catalog; per-venture source   | catalog: crane-console; src: venture  | Markdown catalog entries                     | Dated, not versioned  |
| 4   | Patterns    | `docs/design-system/patterns/` library                         | crane-console                         | Problem / Solution / Examples (Polaris)      | Dated, not versioned  |
| 5   | Templates   | `docs/design-system/templates/` (future; empty until Phase 5+) | crane-console                         | Page-level composition docs                  | Dated, not versioned  |
| 6   | Guidelines  | Absorbed into L1/L3/L4 entries; `governance.md` covers process | crane-console                         | Inline prose                                 | With parent artifact  |
| 7   | Tooling     | `ui-drift-audit` skill (or replacement) + CI gate              | `.agents/skills/` (location TBD #704) | Skill spec + CI workflow                     | Bug-fix as discovered |
| 8   | Governance  | `docs/design-system/governance.md`                             | crane-console                         | Prose: contributions + deprecation lifecycle | As process evolves    |

### Why no separate L6 Guidelines artifact

Enterprise systems typically ship a Guidelines layer as prose (writing, IA, a11y). Our foundations, component catalog, and patterns are prose-first and carry their own guidelines inline — a separate file would duplicate. The `governance.md` doc handles process-level prose that doesn't fit elsewhere.

## Artifact Details

### L2 — `@venturecrane/tokens` package

**What.** Single source of truth for every design token across every venture. W3C-DTCG JSON in one tree; Style Dictionary v4 compiles to per-venture CSS variable sets.

**Source structure (sketch):**

```
packages/tokens/src/
  base/
    color.json      # neutral ramps, shared semantic colors
    typography.json # families, weights, scale
    spacing.json    # base unit, scale
    motion.json     # durations, easings
  ventures/
    vc.json         # overrides for vc prefix
    ke.json
    dc.json
    smd.json
    sc.json
    dfg.json
```

**Build output (per venture):**

```
packages/tokens/dist/
  vc.css      # --vc-color-accent, --vc-surface-chrome, ...
  ke.css
  ...
```

**Publish target.** Decide during Phase 3 execution: npm under `@venturecrane/tokens` or consumable via path from crane-console. Default: npm, so each venture consumes a versioned dependency and drift is visible in `package.json`.

**Migration from current state.** Each venture's existing `--{prefix}-*` tokens move from `globals.css` into the JSON tree as overrides of base tokens where possible, or as leaf values where not. Expected coverage after migration: VC, KE, DC at 90%+ (tokens already systematic); SC, DFG build from base tokens; SMD defined as part of its spec fix (#702).

**Validator.** Lives in the enforcement skill (L7). Fails builds on raw hex/rgb values, un-tokenized spacing, raw Tailwind color classes.

### L3 — `docs/design-system/components/`

**What.** Markdown catalog of existing components across ventures, classified by [Atomic Design](https://atomicdesign.bradfrost.com/chapter-2/) vocabulary. **The catalog does not ship components** — ventures continue to maintain their own source. The catalog surfaces duplicates, enables deduplication decisions, and gives Phase 4+ patterns a vocabulary.

**Structure:**

```
docs/design-system/components/
  atoms/
    button.md      # list of per-venture implementations + cross-refs
    input.md
    icon.md
  molecules/
    status-pill.md
    money-display.md
  organisms/
    portal-list-item.md
    expense-card.md
```

**Per-component entry template:**

```markdown
# Button

**Classification.** Atom.

## Implementations

- VC: `src/components/Button.astro`
- KE: `src/components/ui/Button.tsx`
- DC: `src/components/ui/Button.tsx`
- SS: `src/components/portal/Button.tsx`

## Consolidation status

Non-shared; each venture implements its own. Patterns enforce hierarchy (see `../patterns/button-hierarchy.md`).

## Cross-references

- Pattern: `../patterns/button-hierarchy.md`
```

No "implementation spec." Source code is the spec.

### L4 — `docs/design-system/patterns/`

**What.** The pattern library. Each file documents one recurring UX problem / solution pair in [Polaris's format](https://polaris-react.shopify.com/patterns). Seeded from SS's seven rules (via #703), extended per phase.

**Structure:**

```
docs/design-system/patterns/
  01-status-display-by-context.md
  02-redundancy-ban.md
  03-button-hierarchy.md
  04-heading-skip-ban.md
  05-typography-scale.md
  06-spacing-rhythm.md
  07-shared-primitives.md
  08-actions-and-menus.md  # Phase 4 pilot
```

**Per-pattern template:**

```markdown
# Actions and Menus

**Status.** Active · **Authored.** YYYY-MM-DD · **Last revised.** YYYY-MM-DD

## Problem

Short framing: what UX problem recurs, where it shows up, why ad-hoc solutions fail.

## Solution

Named recommendation. Specific. Dos and don'ts.

## Examples

1. Real implementation in venture X: file path.
2. Real implementation in venture Y: file path.
3. Anti-example (optional): what drift looks like.

## Cited authority

Links to the external pattern(s) this adapts (Polaris, Material 3, NN/g, etc).
```

### L7 — Enforcement skill

**What.** A skill (either an extended `ui-drift-audit` or a replacement — pending #704) that runs against any venture's source tree and reports:

- Raw hex / rgb / hsl values in places that should use tokens
- Raw Tailwind color classes in places where semantic tokens exist
- Spacing numbers outside the token scale
- Components that duplicate catalog entries (potential consolidation candidates)

**CI integration.** A GitHub Action wraps the skill, runs on PR, comments on violations, blocks merge above a threshold. Threshold calibrated per-venture: Tier 1 = zero tolerance; Tier 2 = warn only; Tier 3 = count and report.

### L8 — `docs/design-system/governance.md`

**What.** Two things:

1. **Contribution model (tiered).** Based on Curtis's [contribution vs participation](https://medium.com/eightshapes-llc/defining-design-system-contributions-eb48e00e8898) framing.
   - **Small contributions** — token value changes within an existing category, bug fixes, catalog entries for existing components, pattern example additions. PR + passing tests + maintainer review from any agent. No pre-discussion required.
   - **Large contributions** — new token categories, new patterns, breaking token changes, deprecations. GitHub issue first with proposal, then PR referencing the issue. At least one human review before merge.

2. **Deprecation lifecycle.** Copied from [Atlassian's token lifecycle](https://developer.atlassian.com/platform/forge/design-tokens-and-theming/), compressed.
   - **Deprecated.** Token/component/pattern is kept but flagged in source with a deprecation comment linking to the replacement. Stays in this state for at least one minor version.
   - **Hidden.** Removed from catalog and documentation surface. Source remains for consumers on old versions. At least one minor version.
   - **Removed.** Deleted entirely. Minor version bump. Consumers on older versions can pin.

## Authoring and Review Loop

Not a separate doc — lives in `governance.md`. Here's the shape:

```
Small contribution
  → branch from main
  → edit
  → PR
  → any agent reviews
  → merge when green

Large contribution
  → open issue with proposal (problem, proposed artifact, layer(s) affected)
  → discussion (async)
  → approval
  → branch from main
  → PR referencing issue
  → human review
  → merge
```

**Tiered means different defaults.** Agents can ship small contributions without human review; large contributions gate on Captain's eye. The skill-review / skill-audit precedent already works this way and is the functional analog.

## Adoption Coverage Metrics

The current-state inventory's maturity matrix is the primary tracking tool — when a cell moves from A to P or C, the matrix updates, and the change is dated in the per-venture section.

**Leading indicator** (tracked per venture): fraction of CSS hex/rgb/hsl values replaced by token references. Computed by the enforcement skill. Goal: Tier 1 ventures at ≥95%; Tier 2 at ≥80%; Tier 3 growing over time.

**Trailing indicator** (tracked enterprise-wide): enforcement skill violations per 1k lines of CSS/TSX. Goal: monotonically decreasing; investigate any quarter-over-quarter increase.

No dashboards, no separate tracking system. The matrix and the enforcement-skill output are the dashboard.

## Phase Roadmap

The numbered artifacts above map to implementation phases:

- **Phase 3** (this doc) — proposal; no artifacts shipped.
- **Phase 4** — pilot pattern: actions & menus (`docs/design-system/patterns/08-actions-and-menus.md`). Prerequisites: SS rules promoted (#703). First pattern authored under this process; proves the Polaris Problem/Solution/Examples format fits VC.
- **Phase 5** — `@venturecrane/tokens` package. Migration from per-venture CSS to compiled output. Prerequisites: resolve SMD (#702), clarify `ui-drift-audit` location (#704).
- **Phase 6** — `docs/design-system/components/` catalog. Walks every venture, classifies what exists, surfaces duplicates. No consolidation decisions yet — just mapping.
- **Phase 7** — `governance.md` + enforcement skill. Closes the loop so subsequent contributions flow through the process this doc describes.

Each phase is one session. Each phase produces one PR. Each phase's merge commit updates `current-state.md`'s matrix.

## What This Proposal Does Not Do

- **Does not mandate a component library.** Ventures keep their own source. The catalog is a map, not a substitute.
- **Does not centralize design decisions.** Foundations + tokens are shared; patterns are shared; visual identity per venture remains that venture's call.
- **Does not add a design council or RFC process.** The tiered contribution model is the entire process. If it proves too permissive, we revisit.
- **Does not version components or patterns.** Only tokens carry a semver. Components and patterns are dated. Breaking changes happen through deprecation cycles, not version pins.
- **Does not target 100% coverage on day one.** Coverage grows per-phase. Tier 3 ventures (SC, DFG) are expected to carry A / P cells in the matrix for months; that's the correct state, not a failure.

## Open Decisions (Resolve in Phase 4+)

Not blocking Phase 3 approval.

- `@venturecrane/tokens` — npm package or path-consumed from crane-console? Phase 5 decides, after seeing the migration cost.
- Token-enforcement strictness per tier — "warn only" for Tier 2/3 is default, but Phase 4 may find a tighter setting works for patterns adoption.
- Whether to add L5 Templates as an empty directory during Phase 3 or wait until first template lands. Currently planned for whenever Phase 5+ has its first real template.
