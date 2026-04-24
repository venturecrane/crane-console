---
title: 'Governance'
sidebar:
  order: 60
---

# Design System Governance

How the enterprise design system evolves. Layer 8 of the [eight-layer framework](enterprise-scoping.md). Defines who authors what, how changes flow through review, and how obsolete things retire without breaking consumers.

**Sizing principle.** This is written for one operator and AI teammates, not a 50-designer org. Every heavy-process primitive from surveyed systems (federated design councils, RFC cycles, dedicated system teams) has been compressed to its smallest functional equivalent. If a process step is here, it's earning its place.

## Contribution Model — Tiered

Two tiers. Every proposed change lands in one or the other. Based on [Curtis's contribution-vs-participation framing](https://medium.com/eightshapes-llc/defining-design-system-contributions-eb48e00e8898) from EightShapes.

### Small contribution

**What qualifies:**

- Token value changes within an existing category (adjusting a `--vc-color-accent` hex, tweaking `--ke-space-card` pixel value)
- Bug fixes in the enforcement skill
- Catalog entries for existing components (new `docs/design-system/components/*.md` entries documenting already-shipped code)
- Pattern example additions (adding a real implementation to an existing pattern file)
- New per-venture token file in `@venturecrane/tokens/src/ventures/` following the existing shape
- Cross-reference link fixes

**Process:**

1. Branch from `main`.
2. Edit.
3. PR. Passing tests + format + lint.
4. Any agent or human reviewer can merge.
5. No pre-discussion required.

**Why small tier exists:** most design-system changes are routine. Making every tweak go through ceremony would grind the system. Small tier lets AI teammates ship routine drift-fixes without human intervention.

### Large contribution

**What qualifies:**

- New token categories (adding `--{prefix}-elevation-*` or `--{prefix}-radius-*` when none existed)
- New patterns (files under `docs/design-system/patterns/`)
- Breaking token changes (renaming or removing existing tokens; changing the semantic meaning of a token)
- Deprecations of any kind
- Extensions to the enforcement skill (new rules, new detection heuristics)
- Changes to the 8-layer framework itself (this doc, `enterprise-scoping.md`, `proposal.md`)

**Process:**

1. Open a GitHub issue with the proposal. Include: the problem, the proposed artifact, which layers it affects, which ventures benefit.
2. Discussion (async). No time limit; but if the issue stalls 14 days without comment, the author may proceed and note in the PR that silence = tacit approval.
3. Branch from `main`.
4. PR referencing the issue number.
5. **At least one human review before merge.** Captain (SMDurgan) or a designated human reviewer. AI teammates can comment but cannot self-approve large contributions.
6. Merge.

**Why large tier exists:** some changes reshape the system. A new token category becomes a commitment across all ventures; a new pattern will be cited by future surfaces for years. These need deliberation.

## Deprecation Lifecycle

Adapted from [Atlassian's token lifecycle](https://developer.atlassian.com/platform/forge/design-tokens-and-theming/). Three stages, compressed for our scale.

### Stage 1 — Deprecated

- Token/component/pattern is kept in place
- Source flagged with a deprecation comment linking to the replacement
- Catalog/pattern docs marked as deprecated at the top of the file, with replacement link
- Enforcement skill warns on new uses (one level above info)
- Stays in this state **at least one minor version** of the affected package, or two weeks minimum if not versioned

### Stage 2 — Hidden

- Removed from catalog and documentation surface (no longer in sidebars, no longer in `components/index.md`)
- Source remains so consumers on old versions don't break
- Enforcement skill errors on new uses (blocking, not warning)
- Stays in this state **at least one additional minor version**, or two more weeks

### Stage 3 — Removed

- Source deleted
- Version bumped (minor for tokens package; major if breaking downstream APIs)
- Consumers on older versions can still pin

**Versioning scope.** Semver applies to `@venturecrane/tokens`. Components and patterns are dated, not versioned. Breaking changes to patterns (rewording a Do/Don't rule) happen through minor revisions dated in the pattern file; breaking changes to the pattern _identity_ (renaming or splitting) go through the deprecation lifecycle.

## Review and Change Log

**No separate change log.** Git history is the change log. Every merged PR is the record.

**Annual review.** Once a year (roughly — no strict calendar), Captain walks `docs/design-system/current-state.md`'s matrix and the patterns/components catalogs and asks:

- Are any cells that were Partial a year ago still Partial? Why?
- Are any patterns cited less than 3 times in catalog entries? Candidate for deprecation.
- Is the enforcement skill surface still covering what ships? Any new rule bypasses?

The review output is a GitHub issue with findings, not a separate document.

## Skill Governance Alignment

The skill governance model (see [`docs/skills/governance.md`](../skills/governance.md)) uses the same tiered shape (small / large contributions). Aligning with it is deliberate — the DS governance has the same scale problem as the skills governance, and the established skills model already works in practice. When either evolves, the other should follow.

## Open Questions — Not Resolved Here

- Annual review cadence feels right but isn't calibrated. If findings pile up quicker than annually, this needs tightening.
- Coverage metric goals per tier (Tier 1 = 95% token adoption, Tier 2 = 80%, Tier 3 = growing) are aspirational until the enforcement skill's token-compliance check lands (Phase 7 follow-up).
- Whether to add a "stewardship rotation" — a month-long rotating role for one agent or human to actively groom the catalog, prune stale entries, watch drift trends. Defer until the catalog has >20 entries.

## Relationship to Other Documents

- [`enterprise-scoping.md`](enterprise-scoping.md) — initiative framing and 8-layer definitions
- [`proposal.md`](proposal.md) — target architecture; this doc implements the L8 section
- [`current-state.md`](current-state.md) — ground-truth inventory; governance keeps it current
- [`patterns/`](patterns/) — L4 artifacts; governed under this doc's tiered model
- [`components/`](components/) — L3 catalog; governed under this doc's tiered model
- [`packages/tokens`](https://github.com/venturecrane/crane-console/tree/main/packages/tokens) — L2 source; versioned under semver per this doc's deprecation lifecycle
