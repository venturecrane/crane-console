---
title: '/design-brief output → DTCG token JSON'
sidebar:
  order: 52
---

# `/design-brief` extract-identity output → DTCG token JSON

Stream A9 verification memo. Confirms the `/design-brief --extract-identity` workflow output (`.design/DESIGN.md`) is shape-compatible with the W3C-DTCG token JSON consumed by `@venturecrane/tokens` (`packages/tokens/src/ventures/{code}.json`). Greenfield ventures (SC, DFG, SMD) translate identity → tokens manually following the per-table mapping below; an optional `/brief-to-tokens` shim could automate this and is sketched at the end of this memo for a future session.

## Why this matters

For brownfield ventures (VC, KE, DC, DCM, SS) the token JSON was extracted from existing `globals.css` directly. For greenfield ventures the source is a `/design-brief --extract-identity` run against `frontend-design` plugin output — the result lands at `<venture>/.design/DESIGN.md`, not in `globals.css`. Stream C migration for those ventures needs a clean translation path from that markdown spec to the venture's DTCG JSON file.

The original Stream A9 step in the rollout plan budgeted up to 3h depending on findings. The shape comparison done in this memo collapses A9 to a 30-minute verification: no skill enhancement needed.

## Output structure of `/design-brief --extract-identity`

The workflow at [`.agents/skills/design-brief/workflows/extract-identity.md`](https://github.com/venturecrane/crane-console/blob/main/.agents/skills/design-brief/workflows/extract-identity.md) emits `.design/DESIGN.md` with the following sections:

| Section      | Shape                                                                                |
| ------------ | ------------------------------------------------------------------------------------ |
| Identity     | `**Identity direction:** {one-line statement}`                                       |
| Color        | Markdown table: `Role / Hex / Usage`                                                 |
| Typography   | Markdown table: `Role / Family / Weight / Size+Line-height / Letter-spacing / Notes` |
| Spacing      | Markdown table: `Token / Value / Usage`                                              |
| Radius       | Markdown table: `Token / Value / Usage`                                              |
| Shadow/Depth | Markdown table or `(none — flat aesthetic)`                                          |
| Motion       | Markdown table: `Token / Duration / Easing / Usage`                                  |

A real example: `~/dev/ss-console/.design/DESIGN.md` (referenced from `~/dev/ss-console/src/styles/global.css`'s top comment) was the source the SS pre-stage PR (#722) extracted into `packages/tokens/src/ventures/ss.json`.

## DTCG schema in `packages/tokens/src/ventures/{code}.json`

Style Dictionary v4 reads each venture's JSON merged with `packages/tokens/src/base/{motion,spacing,typography}.json`. Every leaf is a DTCG token: `{ "$value": "...", "$type": "...", "$description": "..." }`. The current schema (matched by `vc.json` and `ss.json`) groups leaves under these top-level keys:

```jsonc
{
  "color": { "<role>": { "$value": "#hex", "$type": "color", "$description": "..." } },
  "font": { "<role>": { "$value": "stack", "$type": "fontFamily", ... } },
  "text-size": { "<scale-name>": { "$value": "<rem|px>", "$type": "dimension" } },
  "text-line-height": { "<scale-name>": { "$value": "<rem|px>", "$type": "dimension" } },
  "text-weight": { "<scale-name>": { "$value": "400", "$type": "fontWeight" } },
  "text-letter-spacing": { "<scale-name>": { "$value": "<em>", "$type": "dimension" } },
  "space": { "<token>": { "$value": "<rem|px>", "$type": "dimension" } },
  "radius": { "<token>": { "$value": "<rem|px>", "$type": "dimension" } },
}
```

Per-venture overrides can also extend `motion-duration` and `motion-easing` (DTCG `$type: "duration"` and `$type: "cubicBezier"` respectively) — see `packages/tokens/src/base/motion.json`.

## Per-table mapping

The translation is mechanical. Every `.design/DESIGN.md` row produces exactly one DTCG leaf.

### Color table

```
| Role         | Hex      | Usage                  |
| ------------ | -------- | ---------------------- |
| primary      | #c5501e  | Primary brand color    |
| primary-hover| #a84318  | Hover state            |
```

Becomes:

```jsonc
{
  "color": {
    "primary": { "$value": "#c5501e", "$type": "color", "$description": "Primary brand color" },
    "primary-hover": { "$value": "#a84318", "$type": "color", "$description": "Hover state" },
  },
}
```

**Conversions:**

- `rgba(r, g, b, a)` → 8-digit hex `#rrggbbaa` (Style Dictionary's CSS color transform handles 6 and 8 digit hex; `rgba()` strings can be passed through as-is but 8-digit hex is canonical in this repo). See `ss.json`'s `border` and `border-subtle` entries for the worked example.
- `oklch()` / `hsl()` — pass through as the `$value` string. Modern browsers parse them; if base CSS-only consumers need wide compatibility, convert to hex during translation.

### Typography table

The single-row layout collapses size + line-height + weight + letter-spacing into one cell each. The DTCG schema splits these into four parallel objects (`text-size`, `text-line-height`, `text-weight`, `text-letter-spacing`), keyed by the same scale name.

```
| Role | Family    | Weight | Size / Line-height | Letter-spacing | Notes |
| ---- | --------- | ------ | ------------------ | -------------- | ----- |
| hero | 'Archivo' | 900    | 4.5rem / 4.14rem   | -0.03em        | H1    |
```

Becomes (4 separate insertions):

```jsonc
{
  "font": {
    "display": {
      "$value": "'Archivo', system-ui, sans-serif",
      "$type": "fontFamily",
      "$description": "...",
    },
  },
  "text-size": {
    "hero": { "$value": "4.5rem", "$type": "dimension", "$description": "H1" },
  },
  "text-line-height": { "hero": { "$value": "4.14rem", "$type": "dimension" } },
  "text-weight": { "hero": { "$value": "900", "$type": "fontWeight" } },
  "text-letter-spacing": { "hero": { "$value": "-0.03em", "$type": "dimension" } },
}
```

Font families consolidate into `font.{role}` (`display`, `body`, `accent-label`, `mono`). Each `text-*` family carries the same scale name as the source row's Role column.

### Spacing / Radius / Motion tables

```
| Token   | Value | Usage                            |
| ------- | ----- | -------------------------------- |
| section | 3rem  | Gap between major page sections  |
```

Becomes:

```jsonc
{
  "space": {
    "section": {
      "$value": "3rem",
      "$type": "dimension",
      "$description": "Gap between major page sections",
    },
  },
}
```

Same pattern for `radius` (with `$type: "dimension"`) and `motion-duration` / `motion-easing` (with `$type: "duration"` and `$type: "cubicBezier"` respectively).

## Greenfield migration recipe (SC, DFG, SMD)

For each greenfield venture, the SC/DFG/SMD migration is gated on a Captain `/design-brief` block (~4.5h batched). After the brief produces `<venture>/.design/DESIGN.md`:

1. **Open `<venture>/.design/DESIGN.md`** as the source of truth.
2. **Author `packages/tokens/src/ventures/{code}.json`** following the per-table mapping above. Use `vc.json` (light brownfield baseline) or `ss.json` (rich Plainspoken surface) as a structural template.
3. **Add `./{code}.css` to `packages/tokens/package.json` `exports`.**
4. **Run `npm run build -w @venturecrane/tokens`** locally to verify `dist/{code}.css` emits with the correct `--{code}-*` prefix. The Style Dictionary `prefix: code` setting in `packages/tokens/build.js` derives the prefix from the JSON filename; no extra config needed per venture.
5. **Open the pre-stage PR** with the source `.design/DESIGN.md` excerpt and the resulting `dist/{code}.css` excerpt in the PR body — same pattern as #720 / #722 / #723 / #725.
6. **Continue with the [adoption-runbook](../adoption-runbook.md) Step 2** (Playwright baseline) and onward.

## Optional follow-up: `/design-brief --emit-tokens` shim

Not built. Sketched here so a future session can pick it up if greenfield throughput becomes a bottleneck.

A thin shim could be added to the `extract-identity` workflow that, after writing `.design/DESIGN.md`, also emits the DTCG JSON skeleton:

- Parse the `Color | Hex | Usage` table → `color.{role}` entries.
- Parse the typography table → 4 parallel `font` / `text-size` / `text-line-height` / `text-weight` (and `text-letter-spacing` where present) blocks.
- Parse spacing / radius / motion tables identically.
- Emit `<venture>/packages/tokens/src/ventures/{code}.json` (or print to stdout for the operator to drop in).

The translation is fully deterministic — the shim could be a 100-line Python or Node script. Captain still reviews the final JSON before the pre-stage PR opens; the shim only removes the mechanical line-by-line transcription cost.

For now, the per-table mapping above is the runbook. Three greenfield ventures × ~30 min mechanical translation = ~1.5h total. Below the threshold where automation pays off.

## Verification artifacts

- Brownfield round-trip test: `~/dev/ss-console/src/styles/global.css` (referenced as `Migrated from ... .design/DESIGN.md`) → `packages/tokens/src/ventures/ss.json` (PR #722) → `dist/ss.css` (88 `--ss-*` properties, all matching source values, including 8-digit hex conversion of two `rgba()` borders).
- Schema source: [`docs/design-system/governance.md`](../governance.md), `packages/tokens/src/ventures/vc.json`, `packages/tokens/src/ventures/ss.json`.
- Workflow source: [`.agents/skills/design-brief/workflows/extract-identity.md`](https://github.com/venturecrane/crane-console/blob/main/.agents/skills/design-brief/workflows/extract-identity.md).
