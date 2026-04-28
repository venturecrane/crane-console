---
name: ui-drift-audit
description: Source-level UI drift audit. Counts visual-design anti-patterns (pills, typography, spacing, headings, primary CTAs, redundancy, token-compliance) across .astro/.tsx/.jsx files and emits a markdown matrix or JSON.
version: 2.2.1
scope: enterprise
owner: agent-team
status: stable
depends_on:
  mcp_tools:
    - crane_skill_invoked
  commands:
    - python3
---

# /ui-drift-audit - Visual drift audit

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "ui-drift-audit")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.

Runs a source-level scan of a venture's UI code and emits a surfaces × rules matrix with violation counts. Use to seed pattern-spec citations, size remediation PRs, and gate token-compliance in CI.

This is a heuristic, not a verifier. Counts approximate drift scale; inspect hot-spots before writing rule citations. Rendered-DOM checks via Playwright are deliberately out of scope — they earn in only for rules that grep demonstrably can't catch.

## When to run

- **Before authoring or revising a venture's pattern spec** (e.g., `docs/style/UI-PATTERNS.md`) — the matrix tells you which rules bite hardest and on which surfaces.
- **Before sizing a Rule-class remediation PR** — violation counts set the PR scope; >30 per tier splits by component family.
- **Monthly as a drift watchdog** — new violations in surfaces previously clean indicate spec erosion or escape-hatch abuse.
- **In CI on every PR** — token-compliance columns gate merges via `--format json` + threshold checks.

## How to run

```bash
# Markdown report (default)
python3 .agents/skills/ui-drift-audit/audit.py
# writes .design/audits/ui-drift-{YYYY-MM-DD}.md

# JSON report
python3 .agents/skills/ui-drift-audit/audit.py --format json --out audit.json

# Override status words for redundancy detection
python3 .agents/skills/ui-drift-audit/audit.py --status-words "Pending,Approved,Draft"

# Use venture's .ui-drift.json config
# (auto-loaded from <repo-root>/.ui-drift.json)
```

Optional flags:

- `--out PATH` — override output path.
- `--format {markdown,json}` — output format. Default `markdown`.
- `--status-words "Word1,Word2,..."` — comma-separated list of pill status keywords for the redundancy check. Overrides `.ui-drift.json` and built-in defaults.
- `--src DIR` — repeatable. Source directories to scan. Defaults to `src/pages` + `src/components`. Override for venture layouts that use different roots.
- `--config PATH` — explicit `.ui-drift.json` config file. Default: auto-discover at repo root.

No external dependencies — pure Python stdlib. Walks the configured source directories for files ending `.astro`, `.tsx`, `.jsx`.

## Per-venture configuration: `.ui-drift.json`

Each venture may drop a `.ui-drift.json` at repo root to set defaults:

```json
{
  "status_words": ["Pending", "Approved", "Draft", "Rejected"],
  "src_dirs": ["src/pages", "src/components", "app"],
  "thresholds": {
    "raw_hex_rgb_in_jsx_max": 0,
    "raw_hex_rgb_in_inline_style_max": 0,
    "raw_tailwind_color_classes_max": 5
  }
}
```

Precedence (highest to lowest): CLI flag > `.ui-drift.json` > built-in default.

## What it counts (rule mapping)

The detector covers **7 of 7 patterns** (Rules 1-7 in `docs/style/UI-PATTERNS.md`).

| Column                          | Rule                                          | Signal                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pills**                       | Rule 1 (status display) + Rule 2 (redundancy) | `rounded-full` + tint bg pattern; avatars excluded (base bg).                                                                                                           |
| **Typo (arb / token)**          | Rule 5 (typography scale)                     | Arbitrary: `text-[Npx]`. Token: `text-xs/sm/base/lg/xl/...`. Both flag post-Rule-5 tokens.                                                                              |
| **Spacing (arb / token)**       | Rule 6 (spacing rhythm)                       | Arbitrary: `p-[N]`, `gap-[N]`. Token: raw `p-N`, `gap-N`.                                                                                                               |
| **H-skips**                     | Rule 4 (heading skip ban)                     | Document-order `h{N}` → `h{N+2+}` jumps within a single file.                                                                                                           |
| **Primary CTAs**                | Rule 3 (one primary per view)                 | Count of `bg-primary` or `bg-[color:var(--color-primary)]` per file. Violation = count > 1.                                                                             |
| **Redundancy**                  | Rule 2                                        | Tinted pill whose status-keyword content is echoed in ±10 lines of prose.                                                                                               |
| **Shared primitives**           | Rule 7 (shared primitives)                    | Hand-rolled `StatusPill`/`MoneyDisplay`/`PortalListItem` shape in files that don't import the primitive. Per-primitive breakdown in JSON `shared_primitives_breakdown`. |
| **raw_hex_rgb_in_jsx**          | Token compliance                              | Raw `#abc` / `#aabbcc` / `rgba(...)` literals anywhere in `.tsx`/`.jsx` files.                                                                                          |
| **raw_hex_rgb_in_inline_style** | Token compliance                              | Same regex but only inside `style={{...}}` JSX expressions.                                                                                                             |
| **raw_tailwind_color_classes**  | Token compliance                              | Tailwind palette colors (`bg-blue-500`, `text-red-300`, ...) — semantic-token replacement candidates.                                                                   |

### Pattern 7 (shared primitives) detection notes

The Pattern 7 detector deliberately trades recall for precision so the
column is trustworthy in CI:

- **Status pill** matches inline `<span>`/`<div>` combining `rounded-full`
  with `text-xs` (or arbitrary tiny size) AND `uppercase` or `tracking-`.
  Avatars (`w-N h-N rounded-full`), progress bars (`h-N rounded-full`),
  and unstyled `text-xs rounded-full` filter chips are intentionally
  excluded — they're not the StatusPill shape.
- **Money display** matches lines containing `tabular-nums` only when a
  currency-formatter signal (`Intl.NumberFormat(... 'currency')`,
  `style: 'currency'`, `formatCentsToCurrency`) appears within ±1 line.
  `tabular-nums` used for dates, phones, or progress numbers is excluded.
- **List row** is scoped to portal `index.astro` files that iterate via
  `.map(` and emit `flex` + `justify-between` layout without importing
  `PortalListItem`. Detail pages (`engagement/index.astro` and
  `[id].astro`) are excluded.
- Files that ARE the canonical primitive (`StatusPill.astro`,
  `MoneyDisplay.astro`, `PortalListItem.astro`) are skipped entirely.

If a violation is real but the file legitimately can't use the primitive,
the escape hatch is the same as for other rules: see Rule 7 in
`docs/style/UI-PATTERNS.md` for the `LIST_INDEX_ALLOWLIST` mechanism.

## Known limits (shipped as v2)

- **Source-level only.** Component-rendered headings (e.g., `<PortalHeader>` emits `<h1>` internally) are invisible to the file-local heading-skip scan.
- **Redundancy uses a curated status-keyword list.** Override per venture via `.ui-drift.json` or `--status-words`. The built-in default covers common SaaS billing / contracting states.
- **Primary CTA count > 1 is a suggestion, not a verdict.** A page with multi-state branches can legitimately declare multiple primaries as long as only one renders per state.
- **Tier classification is heuristic.** Defaults to path-prefix mapping; ventures with different IA can customize via `--src` to scope the audit.

## Output formats

### Markdown (default)

Markdown document at `.design/audits/ui-drift-{YYYY-MM-DD}.md`:

1. **Tier totals** — aggregated counts per tier.
2. **Per-file matrix** — every file's column counts, sorted within tier by total violations.
3. **Redundancy detail** — pill-line + echoed-word per hit; seeds Rule 2 anti-pattern citations.
4. **Heading-skip detail** — skip pairs per file; seeds Rule 4 citations.
5. **Token compliance summary** — per-file counts of the 3 token-compliance columns.

### JSON (`--format json`)

Stable schema documented in `audit.py` module docstring. Designed for CI threshold gating and tooling integration.

## Relationship to other skills

- **Upstream of venture pattern specs.** The audit produces the anti-pattern roster; the venture's spec codifies the rules.
- **Not overlapping `nav-spec`.** Nav spec governs IA + chrome + navigation patterns. This audit governs visual/component semantics.
- **Not overlapping `design-brief` or `ux-brief`.** Those are upstream authoring pipelines (PRD → brief → `product-design`). This is a post-hoc audit of what shipped.
