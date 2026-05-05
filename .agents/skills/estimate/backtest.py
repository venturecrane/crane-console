#!/usr/bin/env python3
"""
Leave-one-out backtest for the /estimate corpus.

For each measured record, holds it out, uses the rest of the corpus to
predict its execution_minutes via banded_estimate, and compares to actual.

Reports per-bucket median absolute error (MAE, expressed as a multiplier
on actual) and corpus-wide median. Used to:

1. Gate Phase B — fail the build if calibration thresholds aren't met.
2. Calibrate confidence labels — the corpus-median MAE becomes the
   `high`/`moderate` boundary written into corpus.meta.json for query.py
   to read.

Usage:
    python3 .agents/skills/estimate/backtest.py [--corpus PATH] [--write-meta]

    --write-meta   When all gates pass, write the calibration table into
                   corpus.meta.json so query.py can use calibrated labels.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from statistics import median
from typing import Any

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from scoring import CorpusRecord, banded_estimate  # noqa: E402
from taxonomy import classify  # noqa: E402

DEFAULT_CORPUS = _HERE / "corpus.json"
DEFAULT_META = _HERE / "corpus.meta.json"


def load_corpus(path: Path) -> list[CorpusRecord]:
    raw = json.loads(path.read_text())
    return [CorpusRecord(**r) for r in raw]


def relative_error(predicted: float, actual: float) -> float:
    """|predicted - actual| / max(actual, 1) — i.e., expressed as a fraction
    of actual. Floor at 1 minute to avoid division by zero on zero-minute
    records (which exist in the corpus — fast same-day fixes).
    """
    return abs(predicted - actual) / max(actual, 1.0)


def loo_backtest(records: list[CorpusRecord]) -> dict[str, Any]:
    """
    Run leave-one-out across records with execution_quality='measured'.
    Skip blocked_external records (they are not what we're trying to
    predict — they're in the corpus as informational analogs only).

    Returns a dict with per-bucket and overall stats.
    """
    measured = [
        r for r in records if r.execution_quality == "measured" and not r.blocked_external
    ]

    bucket_errors: dict[str, list[float]] = defaultdict(list)
    skipped = 0

    for i, target in enumerate(measured):
        held_out = [r for j, r in enumerate(measured) if j != i] + [
            r for r in records if r.execution_quality != "measured"
        ]
        # Use the target's actual classification (don't re-derive from its
        # title — that would test the taxonomy, not the estimator).
        classification = classify(title=target.title, labels=target.labels)
        band = banded_estimate(
            query_text=target.title,
            query_bucket=target.bucket,
            match_quality=classification.match_quality,
            records=held_out,
        )
        if band.p50_minutes is None:
            skipped += 1
            continue
        err = relative_error(band.p50_minutes, target.execution_minutes)
        bucket_errors[target.bucket].append(err)

    # Aggregate
    per_bucket: dict[str, dict[str, float]] = {}
    for bucket, errors in bucket_errors.items():
        if not errors:
            continue
        per_bucket[bucket] = {
            "n": len(errors),
            "median_relative_error": median(errors),
            "max_relative_error": max(errors),
            "p90_relative_error": sorted(errors)[int(len(errors) * 0.9)] if len(errors) > 1 else errors[0],
        }

    all_errors = [e for errs in bucket_errors.values() for e in errs]
    overall = {
        "n": len(all_errors),
        "median_relative_error": median(all_errors) if all_errors else None,
        "p90_relative_error": (
            sorted(all_errors)[int(len(all_errors) * 0.9)] if len(all_errors) > 1 else None
        ),
        "skipped": skipped,
    }

    return {"per_bucket": per_bucket, "overall": overall}


def evaluate_gate(stats: dict[str, Any]) -> tuple[bool, list[str]]:
    """
    Acceptance gate from the plan:
      - At least 6 of 8 buckets have MAE < 200%
      - No bucket has MAE > 500%
      - Corpus-wide median MAE < 100%

    Buckets with n < 5 are excluded from the count (insufficient data —
    confidence will be 'low' regardless of MAE).
    """
    failures: list[str] = []

    overall_median = stats["overall"]["median_relative_error"]
    if overall_median is None:
        failures.append("no measured records produced predictions; corpus may be empty")
        return False, failures
    if overall_median >= 1.0:
        failures.append(
            f"corpus-wide median MAE {overall_median:.2f}× >= 1.00× threshold"
        )

    buckets_with_n_ge_5 = {
        b: s for b, s in stats["per_bucket"].items() if s["n"] >= 5
    }
    buckets_under_2x = sum(
        1 for s in buckets_with_n_ge_5.values() if s["median_relative_error"] < 2.0
    )
    if buckets_under_2x < 6:
        failures.append(
            f"only {buckets_under_2x} of {len(buckets_with_n_ge_5)} eligible buckets "
            f"have MAE < 200% (need ≥6)"
        )

    blown_buckets = [
        b for b, s in buckets_with_n_ge_5.items() if s["median_relative_error"] >= 5.0
    ]
    if blown_buckets:
        failures.append(
            f"buckets with MAE >= 500%: {', '.join(blown_buckets)}"
        )

    return not failures, failures


def calibration_payload(stats: dict[str, Any]) -> dict[str, Any]:
    """
    Build the calibration block to embed in corpus.meta.json so query.py
    can read calibrated confidence thresholds.
    """
    overall_median = stats["overall"]["median_relative_error"]
    return {
        "corpus_median_mae": overall_median,
        "bucket_mae": {
            b: s["median_relative_error"] for b, s in stats["per_bucket"].items()
        },
        "n_predictions": stats["overall"]["n"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus", default=str(DEFAULT_CORPUS))
    parser.add_argument("--meta", default=str(DEFAULT_META))
    parser.add_argument(
        "--write-meta",
        action="store_true",
        help="write the calibration block into corpus.meta.json on success",
    )
    args = parser.parse_args()

    records = load_corpus(Path(args.corpus))
    print(f"corpus: {len(records)} records", file=sys.stderr)

    stats = loo_backtest(records)

    print("\nPer-bucket MAE (median absolute error, expressed as multiplier of actual):")
    print(f'{"bucket":20s} {"n":>4s} {"median":>10s} {"p90":>10s} {"max":>10s}')
    for bucket in sorted(stats["per_bucket"].keys()):
        s = stats["per_bucket"][bucket]
        marker = ""
        if s["n"] >= 5 and s["median_relative_error"] >= 2.0:
            marker = "  ⚠ over 200%"
        if s["n"] >= 5 and s["median_relative_error"] >= 5.0:
            marker = "  ✗ FAILS gate (>= 500%)"
        print(
            f'{bucket:20s} {s["n"]:>4d} '
            f'{s["median_relative_error"]:>9.2f}x '
            f'{s["p90_relative_error"]:>9.2f}x '
            f'{s["max_relative_error"]:>9.2f}x{marker}'
        )

    overall = stats["overall"]
    print(
        f'\nCorpus-wide: n={overall["n"]}, '
        f'median MAE={overall["median_relative_error"]:.2f}x, '
        f'p90 MAE={overall["p90_relative_error"]:.2f}x, '
        f'skipped={overall["skipped"]}'
    )

    passed, failures = evaluate_gate(stats)
    if passed:
        print("\n✓ All gates pass.")
    else:
        print("\n✗ Gate failures:")
        for f in failures:
            print(f"  - {f}")

    if args.write_meta and passed:
        meta_path = Path(args.meta)
        meta = json.loads(meta_path.read_text())
        meta["calibration"] = calibration_payload(stats)
        meta_path.write_text(json.dumps(meta, indent=2) + "\n")
        print(f"\nwrote calibration block to {meta_path}", file=sys.stderr)

    return 0 if passed else 3


if __name__ == "__main__":
    sys.exit(main())
