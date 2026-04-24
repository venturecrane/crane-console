---
title: 'Icon'
sidebar:
  order: 2
---

# Icon

**Classification.** Atom.

## Implementations

- **VC** — No icon system in use; marketing site uses minimal iconography (crane motif in brand architecture).
- **KE** — `lucide-react` package (tree-shakeable React SVG icons). Imported per-use.
- **DC** — `lucide-react` (same as KE) plus custom SVG for toolbar glyphs.
- **SS** — `lucide-astro` for Astro components; a few custom SVG inline.

## Consolidation status

**Lucide is the de-facto enterprise icon standard.** KE, DC, SS all use it. VC could adopt when marketing adds iconography. No shared enterprise wrapper — Lucide's per-venture usage is tree-shakeable, so no DRY benefit from wrapping.

Custom SVG (DC toolbar, SS inline one-offs) is acceptable as long as:

- The SVG has `aria-hidden="true"` or an accessible label
- Color uses token (`currentColor` preferred) not hardcoded hex

## Cross-references

- Token: any color token from [@venturecrane/tokens](https://github.com/venturecrane/crane-console/tree/main/packages/tokens) — icons inherit text color via `currentColor`

## Drift risks

- Venture adopting a different icon package (e.g., Heroicons) for convenience — resist unless Lucide lacks a specific glyph. Call it out in review.
- Hardcoded SVG color values — caught by [Phase 7 enforcement skill](../../proposal.md#l7---enforcement-skill).
