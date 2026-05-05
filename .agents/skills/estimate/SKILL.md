---
name: estimate
description: Produces a banded P50/P90 internal effort estimate for a free-text scope by querying a corpus of our own past work. Output is calibrated to actual cycle times across all venturecrane/ repos — never industry developer-day priors.
version: 0.1.0
scope: enterprise
owner: agent-team
status: draft
---

# /estimate - Reference-class effort forecasting

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "estimate")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.

Produces a banded P50/P90 internal effort estimate for a free-text scope by querying a corpus of our own past work. Output is calibrated to actual cycle times across all venturecrane/\* repos — never industry developer-day priors.

**Internal-only.** Use the output to inform pricing decisions and capacity planning. Client-facing SOWs use milestones, never hours.

## When to use

- Pricing a custom SS engagement (Mode B fixed-price): you need to know what the work actually costs before agreeing to a number.
- Sanity-checking your own estimate before stating it to the Captain. If you're about to type "this will take 3 days," run `/estimate` first — agents systematically over-estimate by anchoring on training-data developer-day priors.
- Deciding whether work fits in one session vs. needs to be split.

## When NOT to use

- Client SOWs and external commitments. The output is execution-time only and reflects our internal throughput. Calendar-time estimates for clients require milestone planning, which is a different skill.
- Work that has no analog in our corpus (e.g., a brand-new framework or vendor we've never used). The skill returns `NO_ANALOGS` — that's the honest answer.

## Arguments

```
/estimate <free-text scope description>
```

The more concrete the description, the better the bucket match and the tighter the band. Include vendor names (Stripe, Clerk, Vercel, Cloudflare) where relevant — they trigger risk multipliers.

## Execution

### 1. Verify corpus is fresh

The corpus refreshes manually on a weekly cadence. If `/estimate` reports the corpus is stale or has many unindexed issues, run a refresh first:

```bash
python3 .agents/skills/estimate/refresh.py
```

This rebuilds `corpus.json` and `corpus.meta.json` from gh data (closed issues + their closing PRs). Takes 1-3 minutes depending on activity volume.

### 2. Run the query

```bash
python3 .agents/skills/estimate/query.py "$ARGUMENTS"
```

The script:

1. Loads `corpus.json` + `corpus.meta.json` (with calibration block).
2. Refuses if corpus is missing or >90 days stale.
3. Opportunistically queries gh for issues closed since the corpus was generated (5s timeout, graceful fallback). Refuses if >20 unindexed issues; downgrades confidence if >5.
4. Classifies the scope via `taxonomy.py` (8 frozen buckets + uncategorized sentinel; three-tier classification).
5. Ranks top-K=10 analogs by bucket match, IDF-weighted similarity, and recency.
6. Splits blocked-external records (calendar tail >8× execution; excluded from percentile, listed separately).
7. Computes P50/P90 with risk multipliers:
   - `vendor_dependency` (1.25×) — query mentions Stripe, Clerk, Vercel, Cloudflare, etc.
   - `captain_decision_blocker` (1.25×) — query mentions copy, content, approval, sign-off
   - `multi_session_work` (1.25×) — top-K analog median commits ≥ 5
   - `low_taxonomy_confidence` (1.5×) — bucket = uncategorized
   - Multipliers compound, capped at 3.0×.
8. Applies calibrated confidence label from the Phase B backtest:
   - `high` — bucket MAE < corpus median MAE (best-calibrated buckets)
   - `moderate` — within 2× corpus median
   - `low` — beyond 2× corpus median, or n_analogs < 5, or title-similarity-only match

### 3. Return the output verbatim

Print the script's stdout. Do not paraphrase. Do not strip the `[INTERNAL ONLY]` footer.

## Output shape

```
Scope: <echoed verbatim>
Bucket: <name>  (taxonomy_match: label_match | keyword_match | title_similarity_only)
Analogs (n=10, blocked-excluded=2):
  #N <repo> "<title>"  exec=42m wall=1d 02h  PR #M  [score 14.2]
  ...
Execution-time band (P50/P90):
  P50: 1h 05m
  P90: 3h 20m
  base_p50: 52m  risk_multiplier: 1.25× (vendor_dependency)
Wallclock context:
  median analog wallclock: 1d 02h
Analogs that ran long for non-execution reasons (excluded from band):
  ...
Freshness:
  corpus_age: 4d   unindexed_issues: 2   freshness_check: ok
Risk flags: vendor_dependency
Confidence: high  (n_analogs=10, taxonomy=label_match, bucket_MAE_at_calibration=0.31×)

[INTERNAL ONLY — DO NOT INCLUDE IN CLIENT SOW. Client artifacts use milestones, not hours.]
```

## Failure modes

| Condition                                 | Behavior                                   | Exit |
| ----------------------------------------- | ------------------------------------------ | ---- |
| `corpus.json` missing                     | Print refresh instructions                 | 2    |
| corpus age > 90 days                      | Refuse                                     | 2    |
| corpus age 30-90 days                     | Warn + downgrade confidence one tier       | 0    |
| unindexed issues > 20                     | Refuse                                     | 2    |
| unindexed issues > 5                      | Downgrade confidence one tier              | 0    |
| gh unavailable / timeout                  | Skip freshness check; surface in output    | 0    |
| n_analogs == 0                            | Print `NO_ANALOGS`; never produce a number | 0    |
| n_analogs < 5                             | Refuse P90; return P50 with `tail_unknown` | 0    |
| bucket = uncategorized AND n_analogs < 10 | Same as no-analogs                         | 0    |

## Notes

- **Taxonomy is frozen for v1.** Eight buckets: `auth`, `data-migration`, `ui-component`, `ui-page`, `worker-endpoint`, `infra-config`, `content-edit`, `refactor-cleanup`, plus `uncategorized` sentinel. Bucket assignments live in `taxonomy.py` and are unit-tested.
- **Execution-time vs wallclock.** The corpus stores both. Estimates use execution-time only (PR-commit-span, per-issue, attribution-clean). Wallclock is shown as context for blocked-external records — those don't pollute the band.
- **The corpus is bisectable.** Every record traces to a real GitHub issue + PR. If an estimate aged badly, `git blame corpus.json` tells you why.
- **Refresh is manual + weekly by design.** Auto-refresh would CI-merge misclassified buckets into every future estimate. Misclassification is the failure mode that poisons future calibration; human eyes catch it on diff review.

## Reference files

- **Skill source:** `.agents/skills/estimate/`
  - `query.py` — runtime invoked by this skill
  - `refresh.py` — corpus rebuilder (manual, weekly)
  - `backtest.py` — leave-one-out calibration; gates Phase B of any taxonomy/scoring change
  - `taxonomy.py` + `test_taxonomy.py` — bucket classification
  - `scoring.py` + `test_scoring.py` — weighted percentile + risk multipliers + calibrated confidence
  - `corpus.json` + `corpus.meta.json` — committed corpus + calibration

- **Calibration discipline:** changes to `taxonomy.py` or `scoring.py` should re-run `backtest.py --write-meta` and pass the gate (≥6/8 buckets MAE <200%, no bucket >500%, corpus-wide median <100%) before merging.
