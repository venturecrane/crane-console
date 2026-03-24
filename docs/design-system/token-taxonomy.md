# Token Taxonomy

All ventures use a shared naming convention for CSS custom properties. This ensures consistency across the portfolio while allowing each venture its own visual identity.

## Naming Pattern

```
--{prefix}-{category}-{variant}
```

- **prefix** — venture code (`vc`, `ke`, `dc`, `smd`, `sc`, `dfg`). Prevents collisions across ventures.
- **category** — what type of value the token represents (color, space, font, etc.)
- **variant** — optional modifier for state or specificity (`hover`, `muted`, `raised`)

## Categories

The following categories are the cross-venture minimum. Individual ventures may add categories as needed (e.g., DC adds `motion-`, `z-`, `safe-area-`).

| Category     | Purpose          | Examples                                     |
| ------------ | ---------------- | -------------------------------------------- |
| `color-`     | Semantic colors  | `--vc-color-accent`, `--ke-color-error`      |
| `surface-`   | Background tiers | `--vc-surface-chrome`, `--dc-surface-raised` |
| `text-`      | Text colors      | `--vc-text-primary`, `--ke-text-muted`       |
| `border-`    | Border colors    | `--vc-border-default`                        |
| `space-`     | Spacing scale    | `--vc-space-4`, `--ke-space-8`               |
| `font-`      | Font families    | `--vc-font-body`, `--dc-font-mono`           |
| `text-size-` | Font sizes       | `--vc-text-size-base`, `--ke-text-size-lg`   |
| `radius-`    | Border radius    | `--vc-radius-md`                             |
| `shadow-`    | Box shadows      | `--dc-shadow-card`                           |

## Token Discipline

These rules apply to all ventures:

- **Always use venture-prefixed tokens.** Write `var(--vc-surface)`, `var(--ke-accent)` — never hardcode hex values.
- **No raw Tailwind color classes** in ventures that have semantic tokens. Use `bg-ke-bg` not `bg-slate-50`.
- **Check the spec's Tailwind @theme mapping** to find the correct utility class name for each token.
- **Respect design maturity.** Tier 1 ventures (VC, KE, DC) have complete systems — use what exists. Tier 3 ventures (SC, DFG) have proposed tokens — confirm they're implemented before using.
- **Spacing uses scale steps, not pixel names.** `--vc-space-4` not `--vc-space-16px`. The value may change across breakpoints; the name stays stable.

## Adding Tokens

1. Check if an existing token covers the use case. Don't create `--vc-space-card-padding: 16px` when `--vc-space-4` (16px) exists.
2. No aliases — two tokens with the same value are a bug unless they serve genuinely different semantic purposes.
3. No component-specific tokens — tokens are system-level. Use Tailwind classes or component-scoped styles for component-specific adjustments.
4. New tokens require a PR — add to `globals.css` `:root` block and the Tailwind config mapping in the same commit.
5. Include WCAG contrast ratio for any new color token.

## Versioning

Design specs track HEAD. If working on an old branch with outdated design tokens, update the spec or rebase — do not implement against stale tokens.
