---
title: 'Button hierarchy: one primary per view'
sidebar:
  order: 3
---

# Button hierarchy: one primary per view

**Status.** Active · **Authored.** 2026-04-16 (SS) · **Promoted.** 2026-04-24

## Problem

A screen with two visually-primary actions is a screen showing two tasks. The user has to decide which is the real next step. Decision fatigue, misclicks, abandoned flows.

AI generators emit buttons liberally — every CTA gets `bg-primary` by default. Without a hierarchy rule, every surface becomes a festival of primary buttons.

## Solution

Exactly one primary action is visible at a time. Secondary, tertiary, and destructive actions have distinct visual treatments. A screen that genuinely needs two primaries is showing two tasks and should be split into two screens (or two states of one screen).

| Level                | Visual                                               | Usage                                          |
| -------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| **Primary**          | Solid `bg-[color:var(--color-primary)]` + white text | The one action                                 |
| **Secondary**        | Border + primary text color                          | Alternative actions                            |
| **Tertiary (ghost)** | Text-only primary color                              | Low-stakes inline actions (links, "view more") |
| **Destructive**      | Solid `bg-[color:var(--color-error)]` + white text   | Irreversible or data-loss actions              |

**Do:** render one primary at a time. If the page has multiple states (Start / Continue / Submit), the SAME button slot renders different labels per state. That's one primary visible, not several.

**Don't:** render two `bg-primary` CTAs co-rendered in the same top-level block without a state-branch conditional.

**Legitimate exception.** State-branch conditional CTAs (the same slot rendering Start / Continue / Submit depending on state) are compliant. Only co-rendered primaries on the same screen are violations.

## Examples

**Correct pattern — state-branch primaries.**

`~/dev/ss-console/src/pages/scorecard.astro` has four `bg-primary` occurrences (Start / Start-summary / Next / Submit). Only one renders per assessment phase. Compliant.

**Violation pattern.** Two `bg-primary` buttons rendered simultaneously in the same top-level block with no `{condition ? <a/> : <b/>}` wrapping. The audit flags count-≥2 files; manual review determines whether the high count is a state branch (legitimate) or co-rendered primaries (violation).

## Cited authority

- Material 3 actions — ["Ensure there is only one primary button on each screen."](https://m3.material.io/components/all-buttons)
- Apple HIG — ["Prefer one default action. Additional actions should be clearly subordinate."](https://developer.apple.com/design/human-interface-guidelines/buttons)

## Detection

`ui-drift-audit` Primary CTAs column counts `bg-primary` per file; manual review triages files with count ≥ 2.

## Provenance

Promoted from SS `docs/style/UI-PATTERNS.md` Rule 3 (closes #703 for this pattern).
