# Memory Recall Eval Harness

Hand-curated `(query, expected_memory_id_substr)` pairs for `crane_memory(action: 'recall', query)`. Computes MRR@K against a configured staging worker; writes baseline.json on first run; fails CI if MRR drops below baseline minus tolerance.

## Run locally

```bash
CRANE_RELAY_KEY=<staging-relay-key> \
CRANE_CONTEXT_BASE=https://crane-context-staging.automation-ab6.workers.dev \
npm run eval:memory-recall
```

## Add a pair

Append to `eval/memory-recall.json`:

```json
{
  "query": "natural language query an agent might ask",
  "expected": "substring-of-memory-name-field"
}
```

The harness scans the top K recall results for the substring in either content or title. K defaults to 5 (configurable via the `k` field in the JSON file).

## Update the baseline

Delete `eval/baseline.json` and re-run. The next run will write a new baseline reflecting current MRR. Do this when:

- The corpus grows materially (e.g., +50 stable entries).
- The hybrid scoring formula changes intentionally (PR-reviewed).
- After PR 2 / PR 3 land and the curator promotes drafts to stable.

Do NOT update the baseline to mask a regression. If MRR drops, fix the cause first.

## Failure tolerance

Tolerance is `0.05` from the baseline. CI fails if `MRR@K < baseline.mrr_at_k - 0.05`.

## Initial target

At ~41 entries, MRR@5 ≥ 0.4 is acceptable. bm25 IDF is statistically weak below ~10K documents; the bar rises as the corpus grows. The conditional-vector trigger (corpus ≥80 stable OR sustained MRR <0.5) addresses the small-corpus ceiling.
