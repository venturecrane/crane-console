---
description: Update an existing `.stitch/NAVIGATION.md`. Versioning-aware. Runs a reduced reviewer pass focused on the delta, not the whole spec.
---

# Revise NAVIGATION.md

Use when the venture introduces a new surface class, a new archetype, a chrome pattern change, or when a drift audit surfaces code-spec mismatch that should resolve in the spec's favor.

## Arguments

```
/nav-spec --revise [--add-surface-class X] [--add-archetype Y] [--align-to-code <path>]
```

## Steps

1. **Load current spec.** Read `.stitch/NAVIGATION.md`. Note `spec-version`.
2. **Classify the change.**
   - **Additive** (new archetype, new forbidden pattern, new appendix entry): no spec-version bump required; may skip reviewer pass if the addition is obvious and low-risk.
   - **Structural** (taxonomy redefinition, rule inversion, surface-class reshape, chrome contract change for an existing archetype): bump `spec-version`. Required reviewer pass.
   - **Corrective** (aligning spec to shipped code, fixing a wrong contract): bump `spec-version`. Required reviewer pass focused on the Implementation angle.
3. **Run drift audit** on the affected surface(s) only — scoped version of `audit.md`.
4. **Draft the delta** as a focused edit to the spec. Do not rewrite sections that aren't changing.
5. **Focused reviewer pass** (if required per classification): IA + Implementation only (skip Mobile unless the change affects viewport transforms). Single message, parallel. Same output format as `author.md` Phase 4.
6. **Decision round** (if reviewers surfaced any).
7. **Apply edits.** Bump `spec-version` appropriately. Update front matter with new `design-md-sha` if DESIGN.md changed.
8. **Version-impact check.** For each existing screen under `.stitch/designs/**/*.html`, compute whether it still complies under the new spec. If not, mark for regeneration in a follow-up. Do not auto-regenerate.
9. **Integration-check regeneration** on one affected surface (if the change is structural or corrective). Same as `author.md` Phase 7.
10. **Save and report.** Write new version. Summarize for the user: what changed, `spec-version` N → M, how many existing designs now non-compliant, next steps.

## Spec-version bump guidance

- **1.0 → 1.1:** additive change (new archetype, new anti-pattern). RUN-LOG entries for spec-version 1.0 generations stay valid.
- **1.x → 2.0:** structural/corrective change. Existing generations are at-risk; flag for review.

## When NOT to revise

Don't run `revise` to silence a Stitch drift. First ask: "Is this drift a Stitch failure, or a spec gap?" If Stitch drifted against a clear spec rule, the validator should have caught it — fix the validator. If the spec rule was ambiguous, revise the spec with the clarification.
