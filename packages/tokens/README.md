# @venturecrane/tokens

Enterprise design tokens for Venture Crane ventures. W3C-DTCG source compiled to per-venture CSS via [Style Dictionary v4](https://styledictionary.com/).

Phase 5 of the [enterprise design system initiative](../../docs/design-system/enterprise-scoping.md). See also the [Phase 3 proposal](../../docs/design-system/proposal.md) for target architecture and the [current-state inventory](../../docs/design-system/current-state.md) for where this fits.

## Structure

```
packages/tokens/
  src/
    base/
      color.json        # (seeded as needed)
      typography.json   # Pattern 05 scale (7 tokens)
      spacing.json      # Pattern 06 rhythm (4 tokens)
      motion.json       # Durations + easings
    ventures/
      vc.json           # VC-specific color overrides; seed for remaining ventures
  build.js              # Style Dictionary orchestration
  dist/                 # Generated CSS (gitignored)
```

Sources are [W3C Design Tokens Community Group](https://tr.designtokens.org/format/) format — `$value`, `$type`, `$description`. The spec reached [first stable version on 2025-10-28](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/). Style Dictionary v4 reads DTCG natively.

## Build

```bash
npm install
npm run build
```

Output: `dist/vc.css` with `--vc-*` CSS custom properties.

## Consumption

From a venture's CSS:

```css
@import '@venturecrane/tokens/vc.css';
```

This exposes the entire token surface as `--vc-color-accent`, `--vc-text-size-display`, `--vc-space-card`, etc. Ventures reference tokens through the [shared taxonomy](../../docs/design-system/token-taxonomy.md).

## Per-venture additions

1. Add `src/ventures/{code}.json` with the venture's DTCG tokens (overrides of base + leaf values where needed).
2. Run `npm run build`.
3. `dist/{code}.css` appears automatically — the build script walks `src/ventures/*.json`.

Per [Phase 5](../../docs/design-system/proposal.md#phase-roadmap), additional ventures (KE, DC, SMD, SC, DFG) wire in one at a time, starting from their existing `globals.css` token values.

## Status

**Scaffold landed; VC is the first proof.** KE, DC, SMD, SC, DFG token files come in follow-up PRs as each venture's existing tokens are migrated into DTCG format. SMD is blocked on #702 (design-spec fix).

## Format notes

- All DTCG types used here: `dimension`, `fontWeight`, `color`, `duration`, `cubicBezier`.
- Token names map directly to CSS variable names (with the venture prefix added at build time).
- `outputReferences: true` preserves `{reference.chain}` in output CSS — enables one venture to re-map another's tokens without duplication.
