---
title: 'Heading skip ban'
sidebar:
  order: 4
---

# Heading skip ban

**Status.** Active · **Authored.** 2026-04-16 (SS) · **Promoted.** 2026-04-24

## Problem

Screen readers and scanning both rely on an unbroken heading hierarchy to convey document structure. `h1 → h3` skips a level; the reader loses the logical outline. WCAG 2.2 SC 1.3.1 flags this as a violation of Info-and-Relationships.

Visual size is not heading level. Designers size headings by aesthetic; if `h2` looks too big, the temptation is to use `h3` — and now the `h2` is missing from the document.

## Solution

Heading levels descend in steps. `h1` → `h2` → `h3`. No `h1` → `h3`. No `h2` → `h4`. Eyebrows are NOT headings (even if they look like ones). Visual size does not imply heading level — that's what typography tokens are for (see [Pattern 05](05-typography-scale.md)).

**Do:** use `h1` for the page identity, `h2` for major sections, `h3` for sub-sections. If the page has no natural `h2`, either it truly has only one section (rare), or you're missing a section label.

**Don't:** skip levels because visual hierarchy suggests it. If `h2` is too big, change the `h2` styling. Don't demote to `h3`.

**Eyebrows are not headings.** A small-caps label above a title is an eyebrow (typography `text-label`), not an `h3`. Eyebrows render as `<p>` or `<span>`, not as heading elements.

## Examples

**Correct pattern — marketing components.**

SS marketing components (`Hero`, `About`, `CaseStudies`, `HowItWorks`, `Pricing`, `ProblemCards`, `WhatYouGet`, `WhoWeHelp`, `FinalCta`): `Hero` emits `h1`; all other sections emit `h2` then `h3` where nested. No skip within any component, no skip in `~/dev/ss-console/src/pages/index.astro` where they compose together.

**Composed-component caveat.** Portal components (`PortalHeader`, `PortalTabs`, `ActionCard`, `ArtifactChip`, `ConsultantBlock`, `MoneyDisplay`, `TimelineEntry`) don't render headings internally, so portal page hierarchy is entirely file-local. This is verified manually whenever a new component that emits headings is added.

## Cited authority

- WCAG 2.2 SC 1.3.1 (Info and Relationships, Level A) — [headings must convey document structure](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html).
- NN/g on heading hierarchy — ["Screen readers and scanning both rely on ordered heading levels to convey structure."](https://www.nngroup.com/articles/html-headings/)

## Detection

`ui-drift-audit` H-skips column — document-order `h{N}` → `h{N+2+}` jumps within a single file. Composed-component hierarchy requires manual verification when a component that emits headings is added.

## Provenance

Promoted from SS `docs/style/UI-PATTERNS.md` Rule 4 (closes #703 for this pattern).
