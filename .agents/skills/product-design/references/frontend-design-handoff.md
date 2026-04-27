# Frontend-design handoff

How the `/product-design` workflow invokes the Anthropic `frontend-design:frontend-design` plugin on greenfield surfaces, and what constraints govern its output.

## When this fires

Step 2.5 of [../workflows/generate-single-surface.md](../workflows/generate-single-surface.md). Only on greenfield invocations:

- Target component path does not yet exist, AND
- `--revise` was not passed

Existing files and explicit revisions skip this step entirely. Cost: one frontend-design call per net-new surface.

## What frontend-design produces (calibration result)

Verified against existing output on disk at `ss-console/.design/frontend-design-output/exploration-v2/` (three HTML files, 410 lines each, generated 2026-04-19):

- **Self-contained HTML files.** No `.astro`, no `.tsx`. A single `<html>` document with inline `<style>` blocks defining their own `:root` CSS variables.
- **Raw hex values in CSS.** ~9 raw `#hexcode` values per file inside the `<style>` block. Zero Tailwind classes. Zero `--{venture}-*` token references. Zero `@theme` blocks.
- **Composition over framework.** The plugin produces aesthetic exploration HTML you can iterate on visually, not framework-bound components you can drop into a build.

This is intentional plugin behavior. It is why the handoff treats frontend-design output as a **reference**, not as the final component.

## The seed prompt

Built from a subset of the prompt-assembly blocks. The new prompt is sent to `frontend-design:frontend-design` via the Skill tool:

```
You are producing a composition exploration for a single surface within an existing,
locked design language. This is NOT an identity exploration. The colors, fonts, and
spacing below are the venture's authoritative design tokens — use them, do not
substitute.

## Surface

{venture-name} — {surface-name} ({archetype}, {viewport})

## Locked design language (do not introduce new tokens)

{verbatim paste of .design/DESIGN.md, or the extracted @theme block}

## Surface intent (from UX brief)

{the section of .design/<target>-ux-brief.md covering this surface only}

## Nav contract

{the surface-class appendix from NAVIGATION.md, plus shared a11y / states /
anti-patterns. Same content the in-loop generator receives.}

## Your task

Produce a single HTML file showing a distinctive composition for this specific
surface, using ONLY the colors, fonts, and spacing from the locked design language
above. Express your "BOLD aesthetic direction" through composition, hierarchy,
density, layout asymmetry, motion, and surprise — not through new typography or
new color families.

Save the output. Do NOT introduce:

- New display or body fonts. Use the venture's declared families verbatim.
- New color families or accent hues. The palette is closed.
- Spacing values outside the declared scale.

The HTML will be used as a composition reference, not as a final component.
```

The seed deliberately reframes frontend-design's "BOLD aesthetic direction" guidance toward composition rather than identity. This narrows its trained creative pressure to the dimensions where the venture pipeline still has degrees of freedom.

## Output handling

1. Capture the full HTML response to `/tmp/pd-fdref-<surface>.html`.
2. Run a drift check (grep) against the captured HTML:

   ```
   # Color drift
   grep -oE '#[0-9a-fA-F]{6}' /tmp/pd-fdref-<surface>.html | sort -u
   ```

   Compare against the venture's declared palette (DESIGN.md or `@theme`). Any value not in the declared palette is drift.

   ```
   # Font drift
   grep -oE 'font-family:\s*[^;]+' /tmp/pd-fdref-<surface>.html | sort -u
   ```

   Compare against declared families. Any new family is drift.

3. **If drift is detected**, regenerate once with the specific contradiction explicit in the seed prompt (e.g., "The previous run introduced `Space Grotesk`. The venture uses `Crimson Pro` for display and `Public Sans` for body. Use only these.").
4. **If the second attempt also drifts**, drop the reference entirely and proceed to step 3 of the workflow with normal blocks 1–8 only. Never let frontend-design override the venture's identity. Log the drop in the report to the Captain.

## How the reference flows into the in-loop generator

The captured HTML is appended to the prompt-assembly as **block 7-bis**, between block 7 (existing component source) and block 8 (revision context, which is empty for greenfield anyway).

The in-loop generator's instructions for block 7-bis are explicit: this is a composition reference, NOT a copy target. The generator translates layout, hierarchy, density, and visual rhythm into Astro using the venture's tokens. It does not lift raw values from the reference.

## Retry policy (greenfield, all paths)

Total budget: 2 calls (unchanged from non-greenfield).

| Failure type                         | Retry against                       | Reasoning                                                                                              |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Build check fails                    | In-loop generator                   | The build error is about Astro / TypeScript / imports — frontend-design's HTML output cannot fix that. |
| Validator fails                      | In-loop generator                   | Validator violations are NAVIGATION-spec contracts; frontend-design has no knowledge of them.          |
| Drift check fails (block 7-bis only) | Frontend-design                     | Targeted regeneration of the reference with the contradiction made explicit.                           |
| Drift check fails twice              | Drop reference, continue without it | Better to ship a tokens-clean component than fight the plugin.                                         |
| Both build + validator fail          | Stop, report to Captain             | Same as today. No third call.                                                                          |

## Why composition-only, not identity exploration

The venture's design language was already extracted from frontend-design output once via `/design-brief --extract-identity`. DESIGN.md is the codified identity. Running frontend-design again at the per-surface level for _identity_ exploration would re-open a closed decision and invite drift across surfaces (each surface getting a slightly different "interpretation" of the brand).

What's still useful per-surface is the plugin's training on **distinctive composition**: unexpected layouts, asymmetry, density choices, motion ideas, hover surprises. The seed prompt narrows it to that. The in-loop generator then materializes those ideas in the venture's locked design language.

This is the truthful interpretation of "wire frontend-design into the greenfield run" given what the plugin actually produces. Path A (output is the component) and Path B (rewrite raw values) are both incompatible with frontend-design's HTML-only output shape.

## Cost

One frontend-design call per net-new surface. Existing surfaces and revisions are unaffected. Routine ship work — refining shipped surfaces, fixing bugs, iterating on layout — pays zero additional API cost.

## See also

- [../workflows/generate-single-surface.md](../workflows/generate-single-surface.md) — the workflow that calls this handoff
- [prompt-assembly.md](prompt-assembly.md) — block ordering, including block 7-bis
- [../adapters/astro-component.md](../adapters/astro-component.md) — output shape constraints the in-loop generator enforces
