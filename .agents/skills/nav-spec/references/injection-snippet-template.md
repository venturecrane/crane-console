# Injection snippet template

Canonical NAV CONTRACT block pasted between DESIGN SYSTEM and PAGE STRUCTURE in every `stitch-design` prompt. Token budget: ≤600 tokens (measured: ~450 in the ss-console ref implementation).

## Template

Placeholders in `<angle brackets>` are substituted at prompt-enhancement time from the classification tags and the appendix lookup.

```
NAV CONTRACT (REQUIRED — do not invent beyond this block):

Surface class: <surface-class> (<one-line description from spec>).
Archetype: <archetype>.
Viewport: <viewport description, e.g., "mobile 390x844" or "desktop 1280px">.

Chrome allowed (inclusive list; render nothing outside this list):
<Chrome-allowed list for this {surface-class, archetype, viewport} combination, from the appendix>

Chrome FORBIDDEN (do not render any of these, under any interpretation of PAGE STRUCTURE):
<Chrome-forbidden list from anti-patterns, filtered to this surface class>

State colors (exact hex, do not approximate):
- Active link: <hex> | Default: <hex> | Hover: <hex>
- Focus ring: 2px <hex> at 2px offset, keyboard-focus only
- Disabled: <hex> | Tap target minimum: 44x44px
- aria-current="page" on active nav item if nav is rendered

Transition contract:
<Back target URL (if archetype is detail/list/form/wizard/empty/error — hardcoded canonical URL, not "#" or history.back()).>
<Modal close rules (if archetype is modal/drawer — Esc + click-outside close; focus returns to trigger).>

A11y floor:
- <header role="banner">, <main role="main">
- Skip-to-main link sr-only until focused, at top of body
- Keyboard order matches visual order
- aria-label on every icon-only button
- Focus rings on keyboard focus only; no always-on rings

Semantic precision (observed drift targets from Phase 0):
- Header is `sticky top-0`, NOT `fixed top-0`. Fixed breaks mobile document flow.
- Header background is solid `bg-white`. No `backdrop-blur-*`, no translucent overlays.
- Client name stands alone. No preceding icon, emoji, SVG, or material symbol.
- Back affordance is a single `<a>` or `<button>`. Do NOT wrap in `<nav>`. Do NOT use `aria-label="Breadcrumb"`.
- Back button `href` is a hardcoded canonical URL string. Never `#`, `javascript:`, or `history.back()`.

If any element of the above conflicts with PAGE STRUCTURE below, THIS BLOCK WINS. PAGE STRUCTURE describes content; NAV CONTRACT describes chrome. When in doubt, remove chrome rather than add it.
```

## Substitution rules at prompt-enhancement time

`stitch-design`'s patched pipeline does these lookups:

1. Read classification tags from the user prompt: `surface=X archetype=Y viewport=Z`.
2. Open `.stitch/NAVIGATION.md`.
3. Extract:
   - Surface-class one-line description → `<surface-class description>`
   - Chrome-allowed list: start from parent section 4, filter/override with the matching appendix's `chrome-allowed` delta, filter again by archetype
   - Chrome-forbidden list: start from section 8 (anti-patterns for all classes), filter with appendix deltas
   - State hex values: section 6
   - Transition contract: section 7, filtered by archetype
4. Assemble the NAV CONTRACT block by filling in placeholders.
5. Inject between DESIGN SYSTEM and PAGE STRUCTURE in the final prompt.

Concatenation, not templating. Keep the assembly logic simple.

## Size budget tracking

For each `{surface-class} × {archetype} × {viewport}` combo, measure the assembled block size. Record in the NAVIGATION.md front matter or in a companion file. If any combo exceeds 600 tokens, shorten the surface-class appendix rather than the semantic-precision section — the latter is load-bearing per Phase 0 measurements.

## Versioning and compatibility

The semantic-precision section is the most volatile — as Stitch's model evolves, new drift targets appear and old ones become unnecessary. Bump the spec-version when this section materially changes. The rest of the template is stable.

## Reference implementation

The 2026-04-15 ss-console run used a ~450-token version of this template for Phase 0. See `/tmp/phase0-injection-snippet.txt` (archived to `examples/phase-0-compliance-report.md`). The major delta between that version and this template is the addition of the "Semantic precision (observed drift targets)" section — added directly in response to the Phase 0 strict-compliance violations.
