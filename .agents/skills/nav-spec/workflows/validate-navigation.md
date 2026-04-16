---
description: Post-generation validator. Parses Stitch-generated HTML and fails loud on nav-contract violations. Called automatically after every generation by the patched `stitch-design` pipeline.
---

# Validate navigation

Deterministic enforcement layer. The injection snippet is probabilistic; this is binary — generation passes or fails, with specific DOM selectors and suggested fixes.

## When this runs

Called by `stitch-design`'s pipeline immediately after `generate_screen_from_text` or `edit_screens` returns. Input: the HTML returned by Stitch (or pulled from `htmlCode.downloadUrl`) plus the `{surface-class, archetype}` classification. Output: a pass/fail verdict and a list of specific violations.

If `.stitch/NAVIGATION.md` does not exist: the validator is a no-op (graceful-degradation). It returns "skipped — no spec present."

## Violation rubric

Each rule has: **selector** (CSS or regex), **surface-class/archetype filter** (some rules apply only to some combinations), **severity** (cosmetic / semantic / structural), **suggested fix**.

### Rule 1 — Header must be sticky, not fixed

**Selector:** `<header>` element with a class list containing `fixed` but not `sticky`.
**Applies to:** all surface classes, all archetypes.
**Severity:** semantic.
**Fix:** replace `fixed top-0` with `sticky top-0`. Fixed removes the header from document flow and interacts badly with the viewport-constrained mobile layouts in Stitch's output.

### Rule 2 — Header has solid background, no backdrop-blur

**Selector:** `<header>` with class containing `backdrop-blur-`, `bg-*/`N where N is any opacity value, or `bg-[#*]` where the hex is not `#FFFFFF`.
**Applies to:** all surface classes except `public` (public marketing may use glassmorphism hero headers — see appendix).
**Severity:** cosmetic.
**Fix:** replace with solid `bg-white` (or venture-specific header bg per appendix).

### Rule 3 — Client name stands alone in header

**Selector:** `<header>` → first child div → contains a `<span class="material-symbols-*">` or an `<img>` or an `<svg>` before the client name text element.
**Applies to:** `session-auth-client`, `session-auth-admin`, `token-auth`.
**Severity:** cosmetic.
**Fix:** remove the decorative icon. Client name is Inter 500, 13/18, #475569, standing alone on the left.

### Rule 4 — Back affordance is not wrapped in a breadcrumb nav

**Selector:** `<nav aria-label="Breadcrumb">` containing exactly one `<a>` or `<button>` with a chevron icon.
**Applies to:** all surface classes where breadcrumbs are marked absent in the appendix (portal, most of admin — verify against spec).
**Severity:** semantic.
**Fix:** unwrap — the back button should be a single `<a>` or `<button>` with an appropriate `aria-label`, not wrapped in a `<nav>`.

### Rule 5 — Back href is a hardcoded canonical URL, never "#" or javascript:

**Selector:** The back-chevron `<a>` element has `href="#"`, `href="javascript:void(0)"`, or uses `history.back()` in an onclick.
**Applies to:** all detail archetypes.
**Severity:** semantic.
**Fix:** use the canonical index URL for this archetype's parent (e.g., `/portal/invoices` for an invoice detail, `/portal/home` for a proposal detail). The spec's appendix defines the parent for each archetype × surface-class combination.

### Rule 6 — No global navigation tabs in header

**Selector:** `<header>` contains `<nav>` or multiple `<a>` or `<button>` elements with visible text labels that look like nav items (more than 2 non-icon text children, or presence of `role="tablist"` / `role="tab"`).
**Applies to:** all surface classes.
**Severity:** structural.
**Fix:** remove. If a secondary nav is genuinely needed for a dashboard, it lives below the header as a section, not in the header.

### Rule 7 — No bottom-tab nav, no sticky-bottom action bar

**Selector:** Any element outside `<main>` with `fixed bottom-0` or `sticky bottom-0` classes.
**Applies to:** all surface classes.
**Severity:** structural.
**Fix:** remove. The primary action should be reachable above the fold via document-flow scrolling; duplicated stickied action bars are forbidden.

### Rule 8 — No footer on authenticated surfaces

**Selector:** `<footer>` element present.
**Applies to:** `session-auth-client`, `session-auth-admin`, `token-auth`.
**Severity:** structural.
**Fix:** remove the footer. Authenticated surfaces do not carry legal/copyright rows.

### Rule 9 — No real-face photo placeholders

**Selector:** `<img>` with `src` containing `googleusercontent.com/aida/`, `unsplash.com`, or `pexels.com`. Also any `src` ending in `.jpg`, `.jpeg` where the `data-alt` includes "headshot", "portrait", "professional", "person".
**Applies to:** all surface classes.
**Severity:** structural.
**Fix:** replace with a solid-color circle containing initials (e.g., `<div class="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-white font-semibold">SD</div>`). Never a real face.

### Rule 10 — No marketing CTAs on authenticated surfaces

**Selector:** Buttons or links with text matching `/\b(schedule|book)\s+(a\s+)?(call|demo|meeting|consultation)\b/i`, `/subscribe/i`, `/get\s+started/i`, `/learn\s+more/i`, unless specifically whitelisted in the page prompt.
**Applies to:** `session-auth-client`, `session-auth-admin`, `token-auth`.
**Severity:** structural.
**Fix:** remove. Authenticated surfaces do not carry marketing CTAs. The user is already a customer.

### Rule 11 — Header height matches surface class and viewport

**Selector:** `<header>` with class containing `h-*` where the value does not match 56px (mobile) / 64px (desktop).
**Applies to:** all; values may be overridden per appendix.
**Severity:** cosmetic.
**Fix:** adjust to `h-14` (56px) or `h-16` (64px) — or `h-[56px]` / `h-[64px]` for explicit values.

### Rule 12 — Tap targets ≥ 44×44px

**Selector:** `<button>` or `<a>` elements used as icon-only buttons (text content is empty or only whitespace) with computed dimensions below 44×44. Approximation: class contains `w-*` or `h-*` where the value resolves to < 44px (e.g., `w-8`, `h-8`, `p-1`).
**Applies to:** all.
**Severity:** semantic.
**Fix:** adjust to `w-11 h-11` (44×44) minimum, or use `p-3` with icon size smaller.

### Rule 13 — aria-label on icon-only buttons

**Selector:** `<button>` or `<a>` where the only child is a `<span class="material-symbols-*">`, without an `aria-label` attribute.
**Applies to:** all.
**Severity:** semantic.
**Fix:** add `aria-label="<action description>"`.

### Rule 14 — Landmarks present

**Selector:** missing `<header role="banner">`, `<main role="main">`, or `<nav role="navigation">` where nav is present.
**Applies to:** all.
**Severity:** semantic.
**Fix:** add the missing landmark roles (or rely on the semantic element which implicitly carries the role — modern parsers accept both).

### Rule 15 — Skip-to-main link on every page

**Selector:** no `<a>` element at the top of `<body>` (before `<header>`) with class `sr-only` (or equivalent screen-reader-only) linking to `#main` or `#content`.
**Applies to:** all.
**Severity:** semantic.
**Fix:** prepend `<a href="#main" class="sr-only focus:not-sr-only ...">Skip to main content</a>`.

## Implementation hint

The validator is a bash + Python script. Input: path to HTML file + classification tags. Output: JSON violation report.

Rough implementation skeleton (place at `~/.agents/skills/nav-spec/validate.py` when building):

```python
# validate.py — input: --file <html> --surface <class> --archetype <arch>
# Uses beautifulsoup4 if available; falls back to regex if not.
# Emits JSON: { "pass": bool, "violations": [ { "rule": "R1", "selector": "...", "severity": "...", "fix": "..." } ] }
```

The patched `stitch-design` pipeline shells out to `python3 ~/.agents/skills/nav-spec/validate.py --file ... --surface ... --archetype ...` after each generation. Exit code 1 (with JSON on stdout) triggers a retry-with-feedback in the pipeline. Exit code 0 means pass.

## When the validator reports violations

`stitch-design` can:

1. Automatically retry once with the violation report appended to the prompt ("The previous output violated these rules: ... please regenerate").
2. On second failure, surface to the user: "Validator flagged N violations. Accept anyway, regenerate, or adjust the spec?"

Do not loop indefinitely — one retry, then human decision.
