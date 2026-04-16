---
description: Produce `.stitch/NAVIGATION.md` from scratch for a venture. Eight phases plus a final write-back to consuming skills.
---

# Author NAVIGATION.md

Full-fidelity authoring workflow. Run this once per venture; thereafter use [revise.md](revise.md) for updates and [audit.md](audit.md) for drift checks.

## Phase 1 — Intake

Gather context before drafting:

1. Resolve venture code from the current repo via `crane_ventures`. Read `stitchProjectId`. If null, stop — see SKILL.md fail-fast.
2. Scan `src/pages/` to detect surface classes present in this venture. Record the path inventory (e.g., `/portal/*` → session-auth-client, `/portal/proposals/[token]` → token-auth, `/admin/*` → session-auth-admin, `/` + other top-level `.astro` → public).
3. Check `.stitch/DESIGN.md`. If absent, warn; pull token inventory from `src/styles/*` or `tailwind.config.*` instead. Capture: primary hex, default text hex, bold text hex, border hex, focus hex, disabled hex, family names, rounding scale.
4. Load the venture's `CLAUDE.md` for voice and anti-pattern rules relevant to chrome (e.g., "no marketing chrome on authenticated surfaces").
5. Reference Phase 0 compliance report if present at `examples/phase-0-compliance-report.md`. If not, the user should run `phase-0-compliance-test.md` before proceeding. This informs which residual violations the validator must catch.

Display an **Intake Summary** table:

| Field                     | Value                                    |
| ------------------------- | ---------------------------------------- |
| Venture                   | _code + name_                            |
| Stitch project            | _ID_                                     |
| Surface classes present   | _list_                                   |
| Tokens source             | _path_                                   |
| DESIGN.md status          | _present / absent_                       |
| Phase 0 compliance        | _% strict / % categorical, or "not run"_ |
| Shipped chrome components | _list paths_                             |

Ask: **"Does this capture the intake? Anything to correct before I audit?"** Wait for confirmation.

## Phase 2 — Drift audit

Run a comprehensive scan to ground the spec in reality. Emit an in-memory `drift-report.md` (not saved unless `audit` workflow was invoked standalone). Target paths:

- `src/layouts/*.astro` — every layout file; record header structure, footer, any nav.
- `src/components/**/*{Nav,Header,Footer,Sidebar,Layout}*.astro` — shared chrome components.
- `src/pages/**/*.astro` — spot-check; note pages that bypass the layout and render their own chrome.
- `.stitch/designs/**/*.html` — prior Stitch output; record chrome per file.

Output two matrices:

**Live code matrix:**
| File | Primary chrome | Back/breadcrumb | Auth level | Mobile pattern | Uses shared layout? |

**Generated artifact matrix:**
| File | Primary chrome | Back/breadcrumb | Auth level implied | Mobile pattern |

Then a 4–6 bullet **Drift summary** — the specific inconsistencies that will inform spec decisions. This is ammunition, not comprehensiveness.

## Phase 3 — Draft v1

Write `.stitch/NAVIGATION.md`. Use the canonical structure:

```markdown
---
spec-version: 1
design-md-sha: <SHA of DESIGN.md, or "absent">
stitch-project-id: <ID>
phase-0-compliance: { strict: '%', categorical: '%', date: 'YYYY-MM-DD' }
---

# <Venture> — Navigation Specification

## 1. Information architecture

### Sitemap

<paths grouped by surface class>

### Auth boundary table

| Surface class | Auth model | Base URL | Session cookie | Redirect on logout |

### Deep-link inventory

<every URL that can be reached from outside the app: tokens, emails, SMS>

## 2. Surface-class taxonomy

<the four classes with one-sentence definitions and ss-console examples>

## 3. Screen archetype taxonomy

<9 archetypes — one-sentence definition + which surface classes can produce one>

## 4. Chrome component contracts

### Header band

<DOM structure, Tailwind class template, state behavior, explicit "sticky not fixed" rule>

### Back affordance

<a single `<a>` or `<button>`, never wrapped in `<nav>`, hardcoded href, 44x44px tap target>

### Breadcrumbs

<allowed only on admin detail pages, format, active-state rule>

### Mobile nav / skip link

<no bottom-tab nav anywhere; skip-to-main on every surface>

### Footer

<allowed only on public; structure; legal link format>

## 5. Mobile ↔ desktop transforms (per surface class)

<explicit breakpoint: 768px. Height transforms: 56 → 64. Right-rail placement on detail at desktop.>

## 6. State conventions

Active: #<hex> | Default: #<hex> | Hover: #<hex> | Focus: 2px #<hex> @ 2px offset | Disabled: #<hex> | Tap target: 44x44px minimum

## 7. Transition contracts

<back-target is canonical absolute URL; modal Esc + click-outside; cross-auth-boundary = full page reload>

## 8. Anti-patterns (forbidden chrome)

<one bulleted list per surface class of what is forbidden and why>

## 9. Accessibility floor

<landmarks: banner/main/nav; skip-to-main; aria-current; focus rings with hex; semantic headings>

## 10. Content rules

<label style — sentence case or Title Case; truncation at 24ch on mobile breadcrumbs; icon+label pairing>

## Appendix A — public

## Appendix B — token-auth

## Appendix C — session-auth-client

## Appendix D — session-auth-admin
```

Each appendix restates only the deltas from the parent spec: chrome allowed/forbidden deltas, mobile transform deltas, state color deltas (if the surface class uses a different palette).

Save the draft. Show a diff-summary of what was generated.

## Phase 4 — Parallel three-reviewer pass

Spawn three agents in a single message via the Task tool using `subagent_type: general-purpose`. Each reviewer gets the draft v1 plus the drift report plus the venture's CLAUDE.md.

### IA architect reviewer

> You are a senior IA architect who has designed navigation systems at Figma, Linear, and Stripe. You are reviewing a venture's navigation spec for completeness and rigor.

**Focus:** sitemap coverage, auth boundary table correctness, archetype taxonomy completeness (any missing surfaces in src/pages/ that don't map to an archetype?), deep-link inventory completeness, back-target canonicalness, cross-auth-boundary rule clarity, versioning protocol sanity. Flag anywhere the spec hand-waves a cross-surface decision. Flag any archetype that has no nav contract assigned.

### Mobile specialist reviewer

> You are a senior mobile UX specialist. You care about thumb zones, tap targets, no-hover rules, and breakpoint consistency. You've shipped mobile design systems that scaled.

**Focus:** mobile → desktop transform rules, breakpoint value ("768px" vs "md:" vs "lg:" — is the spec's break-point the same as the code?), tap target 44x44px enforcement, no-hover rule for touch, viewport-specific chrome differences (e.g., does the back button move? Does the Text Scott link appear on desktop?), sticky-vs-fixed resolution. Flag any spec that assumes responsive-by-magic.

### Implementation reviewer

> You are a senior Astro+Tailwind engineer reviewing a proposed chrome contract against the venture's existing component shapes. You think about class lists, semantic HTML, keyboard traversal, and whether a contract can be implemented without refactoring working components.

**Focus:** diff the proposed chrome contracts against `Nav.astro`, `PortalHeader.astro`, `AdminLayout.astro` (or venture equivalents). For each contract, answer: "Can this be implemented in the existing component? If not, what's the refactor scope?" Fold a11y into this review — check landmarks (`<header role="banner">`, `<main role="main">`), focus ring class lists, skip-to-main presence, icon-only button labels. Flag any contract that would require a component rewrite — the user may choose to align the spec instead.

### Output format (all three)

```
## Overall assessment
[2-3 sentences, not diplomatic]

## Critical issues (ranked)
1. <issue + why it matters + specific fix>
2. ...

## Suggested wording
<concrete paragraphs to drop into the spec>

## Decisions needed from user
<items requiring human judgment>
```

**IMPORTANT:** launch all three in a single message to run in parallel.

## Phase 5 — Decision checkpoints

Surface the Decisions-needed items from the reviewers. Filter to the ones that actually change the spec — don't dump all 10; pick the 3–5 that matter. Present each as a short numbered list with your recommendation and rationale. Wait for the user's answers.

Typical decisions:

- "Admin spec says sidebar nav; live `AdminLayout.astro` uses top-nav tabs. Align spec to code, or flag code refactor?"
- "Token-auth proposal landing: client-name in header or page title?"
- "Portal detail pages: breadcrumbs or bare back button? (Plan says absent.)"
- "Breakpoint: spec says 768px; live code uses both `md:` (768px) and `lg:` (1024px) inconsistently. Normalize to 768?"

## Phase 6 — Final spec saved

Apply reviewer fixes and user decisions. Save `.stitch/NAVIGATION.md`. Bump `spec-version` to 1 (first author). Show the user a summary of what shifted from v1 draft.

## Phase 7 — Integration-check regeneration

Pick a single existing surface (recommended: `portal-v1/home-mobile`). Regenerate it with the new injection snippet live. Diff the resulting chrome against the spec.

- Extract HTML download URL from Stitch response
- Download HTML
- Run the validator (see [validate-navigation.md](validate-navigation.md))
- Pass = validator reports zero violations against the home-mobile spec. Fail = do not proceed; tune the spec and repeat.

This proves the spec is **self-consistent**. Phase 8 proves the spec **prevents drift**.

## Phase 8 — Adversarial verification

Pick three prompts the spec author has NOT seen during authoring. Good defaults (pick three, or customize):

- `target=portal-settings surface=session-auth-client archetype=form viewport=mobile`
- `target=admin-audit-log-detail surface=session-auth-admin archetype=detail viewport=desktop`
- `target=marketing-blog-post surface=public archetype=detail viewport=desktop` (if the venture has blog pages)

Generate each with injection. Run validator on each. Pass = validator reports zero violations against the spec's predicted chrome for each combo. Fail = taxonomy has a gap; return to Phase 4 with a focused reviewer on the gap.

If the validator reports violations that reflect genuine ambiguity in the spec (not Stitch drift), the spec is incomplete — this is the right failure mode; fix the spec, not the generation.

## Phase 9 — Write-back to consuming skills

Only run this if the venture is the first to adopt `nav-spec` globally, i.e., the edits to `stitch-design` and `stitch-ux-brief` have not yet been shipped. Otherwise skip.

This write-back is a **separate PR** from the skill authoring. Bounded-blast-radius rule: skill rollout and consumer-skill edits never land together.

Edits required:

- `~/.agents/skills/stitch-design/SKILL.md` — add pipeline step 1a (freshness check for NAVIGATION.md alongside DESIGN.md; if absent, warn and continue — graceful-degradation); step 1b (fail-fast check for `surface=`, `archetype=`, `viewport=` tags in the prompt); step 3 (injection of NAV CONTRACT block between DESIGN SYSTEM and PAGE STRUCTURE). All guarded by `hasNavigationMd` — if absent, skills behave as today.
- `~/.agents/skills/stitch-design/workflows/text-to-design.md` and `workflows/edit-design.md` — reference the classification step.
- `~/.agents/skills/stitch-design/examples/enhanced-prompt.md` — add a second example showing NAV CONTRACT injected.
- `.agents/skills/stitch-ux-brief/SKILL.md` (per-venture; target the installed one for the venture in use) — Phase 1 soft check for NAVIGATION.md (warn if absent; do not fail — briefs still have value without a nav spec); Phase 7 concept-prompt template injects NAV CONTRACT; Phase 11 strip directive's "REMOVE IF PRESENT" list is generated from the spec's chrome-forbidden list; Phase 12 RUN-LOG.md records `spec-version`.

Produce a PR with these edits on a separate branch. Title: `feat(stitch): integrate nav-spec — graceful degradation when NAVIGATION.md absent`.

## Final output

Tell the user:

- Where `.stitch/NAVIGATION.md` lives
- `spec-version` assigned
- Integration-check and adversarial verification results
- Whether the write-back PR was produced (or skipped because already landed)
- Next step: run `/stitch-design` or `/stitch-ux-brief` — NAV CONTRACT is now injected automatically for any prompt carrying surface/archetype/viewport tags
