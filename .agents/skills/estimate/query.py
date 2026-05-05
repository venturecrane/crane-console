#!/usr/bin/env python3
"""
Runtime for the /estimate skill.

Reads the committed corpus + calibration, classifies the input scope,
ranks analogs, and prints a banded estimate with citations and risk
flags. Internal-only output — never include in client-facing SOWs.

Usage:
    python3 .agents/skills/estimate/query.py "<free-text scope>"

Exit codes:
    0  estimate produced (may include warnings for stale corpus, low
       confidence, or insufficient analogs)
    2  refusal — corpus missing, >90 days stale, >20 unindexed issues,
       or zero analogs
    3  unexpected runtime error
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from scoring import (  # noqa: E402
    Band,
    Calibration,
    CorpusRecord,
    banded_estimate,
)
from taxonomy import classify  # noqa: E402

DEFAULT_CORPUS = _HERE / "corpus.json"
DEFAULT_META = _HERE / "corpus.meta.json"

STALE_WARN_DAYS = 30
STALE_REFUSE_DAYS = 90
UNINDEXED_DOWNGRADE = 5
UNINDEXED_REFUSE = 20
GH_TIMEOUT_SECONDS = 5


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------


class CorpusLoadError(Exception):
    """Surfaced to main to produce a non-zero exit with a clear message."""


def load_corpus(corpus_path: Path) -> list[CorpusRecord]:
    if not corpus_path.exists():
        raise CorpusLoadError(
            f"corpus not found: {corpus_path}\n"
            f"run `python3 {_HERE}/refresh.py` to build it"
        )
    raw = json.loads(corpus_path.read_text())
    return [CorpusRecord(**r) for r in raw]


def load_meta(meta_path: Path) -> dict[str, Any]:
    if not meta_path.exists():
        raise CorpusLoadError(
            f"corpus.meta.json not found: {meta_path}\n"
            f"run `python3 {_HERE}/refresh.py` to build it"
        )
    return json.loads(meta_path.read_text())


def calibration_from_meta(meta: dict[str, Any]) -> Calibration | None:
    cal = meta.get("calibration")
    if not cal:
        return None
    return Calibration(
        bucket_mae=cal.get("bucket_mae", {}),
        corpus_median_mae=float(cal.get("corpus_median_mae", 1.0)),
    )


def _parse_iso(ts: str) -> datetime:
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    return datetime.fromisoformat(ts).astimezone(timezone.utc)


# ---------------------------------------------------------------------------
# Freshness check
# ---------------------------------------------------------------------------


def count_unindexed_issues(repos: list[str], since: datetime) -> int | None:
    """
    Opportunistic gh query for issues closed since the corpus was generated.
    5-second timeout. Returns None on failure (caller treats as
    'freshness check skipped').
    """
    since_iso = since.strftime("%Y-%m-%d")
    total = 0
    for repo in repos:
        cmd = [
            "gh",
            "issue",
            "list",
            "--repo",
            repo,
            "--search",
            f"is:issue is:closed closed:>={since_iso}",
            "--limit",
            "100",
            "--json",
            "number",
        ]
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=GH_TIMEOUT_SECONDS,
            )
            if result.returncode != 0:
                return None
            data = json.loads(result.stdout or "[]")
            total += len(data)
        except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
            return None
    return total


# ---------------------------------------------------------------------------
# Output formatting
# ---------------------------------------------------------------------------


def fmt_minutes(m: float | None) -> str:
    if m is None:
        return "—"
    m_int = int(round(m))
    if m_int < 60:
        return f"{m_int}m"
    hours, mins = divmod(m_int, 60)
    if hours < 24:
        return f"{hours}h {mins:02d}m"
    days, h = divmod(hours, 24)
    return f"{days}d {h:02d}h"


def format_output(
    scope: str,
    band: Band,
    ranked_analogs: list[Any],
    blocked_analogs: list[Any],
    *,
    corpus_age_days: int,
    unindexed_count: int | None,
    freshness_status: str,
    stale_warning: str | None,
) -> str:
    lines: list[str] = []
    if stale_warning:
        lines.append(f"!! {stale_warning}\n")

    lines.append(f"Scope: {scope}")
    lines.append(
        f"Bucket: {band.bucket}  (taxonomy_match: {band.taxonomy_match_quality})"
    )

    n_active = len(ranked_analogs)
    n_blocked = len(blocked_analogs)
    if n_active == 0:
        lines.append("\n** NO_ANALOGS — corpus does not contain comparable work.")
        lines.append("   Estimate manually or expand scope description with concrete tokens")
        lines.append("   (e.g., framework names, vendor names, layer keywords).")
        return "\n".join(lines)

    lines.append(f"Analogs (n={n_active}, blocked-excluded={n_blocked}):")
    for a in ranked_analogs:
        r = a.record
        pr_part = f"PR #{r.closing_pr_number}" if r.closing_pr_number else "no PR"
        quality = "" if r.execution_quality == "measured" else " (est.)"
        lines.append(
            f"  #{r.issue_number} {r.repo} \"{r.title[:60]}\" "
            f"exec={fmt_minutes(r.execution_minutes)}{quality} "
            f"wall={fmt_minutes(r.wallclock_minutes)} "
            f"{pr_part}  [score {a.score:.2f}]"
        )

    lines.append("\nExecution-time band (P50/P90):")
    lines.append(f"  P50: {fmt_minutes(band.p50_minutes)}")
    if band.tail_unknown:
        lines.append(f"  P90: — (tail_unknown — n_analogs < 5)")
    else:
        lines.append(f"  P90: {fmt_minutes(band.p90_minutes)}")

    if band.risk_multiplier > 1.0 and band.base_p50_minutes is not None:
        flags_str = ", ".join(band.risk_flags) if band.risk_flags else "none"
        lines.append(
            f"  base_p50: {fmt_minutes(band.base_p50_minutes)}  "
            f"risk_multiplier: {band.risk_multiplier:.2f}× ({flags_str})"
        )

    # Wallclock context (median of active analogs)
    wallclocks = sorted(a.record.wallclock_minutes for a in ranked_analogs)
    if wallclocks:
        median_wc = wallclocks[len(wallclocks) // 2]
        lines.append("\nWallclock context:")
        lines.append(f"  median analog wallclock: {fmt_minutes(median_wc)}")

    if blocked_analogs:
        lines.append("\nAnalogs that ran long for non-execution reasons (excluded from band):")
        for a in blocked_analogs[:3]:
            r = a.record
            lines.append(
                f"  #{r.issue_number} {r.repo} \"{r.title[:60]}\" "
                f"wall={fmt_minutes(r.wallclock_minutes)}"
            )

    lines.append("\nFreshness:")
    if unindexed_count is not None:
        lines.append(
            f"  corpus_age: {corpus_age_days}d   "
            f"unindexed_issues: {unindexed_count}   "
            f"freshness_check: {freshness_status}"
        )
    else:
        lines.append(
            f"  corpus_age: {corpus_age_days}d   "
            f"freshness_check: skipped (gh unavailable or timed out)"
        )

    if band.risk_flags:
        lines.append(f"\nRisk flags: {', '.join(band.risk_flags)}")
    else:
        lines.append("\nRisk flags: none")

    confidence_detail = (
        f"n_analogs={band.n_analogs}, taxonomy={band.taxonomy_match_quality}"
    )
    if band.bucket_mae_at_calibration is not None:
        confidence_detail += (
            f", bucket_MAE_at_calibration={band.bucket_mae_at_calibration:.2f}×"
        )
    lines.append(f"Confidence: {band.confidence}  ({confidence_detail})")

    lines.append("")
    lines.append("[INTERNAL ONLY — DO NOT INCLUDE IN CLIENT SOW. Client artifacts use milestones, not hours.]")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scope", help="free-text scope description")
    parser.add_argument("--corpus", default=str(DEFAULT_CORPUS))
    parser.add_argument("--meta", default=str(DEFAULT_META))
    parser.add_argument(
        "--no-freshness-check",
        action="store_true",
        help="skip the gh-based unindexed-issue count (testing only)",
    )
    args = parser.parse_args(argv)

    try:
        records = load_corpus(Path(args.corpus))
        meta = load_meta(Path(args.meta))
    except CorpusLoadError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    generated_at = _parse_iso(meta["generated_at"])
    now = datetime.now(timezone.utc)
    corpus_age_days = max(0, (now - generated_at).days)

    if corpus_age_days > STALE_REFUSE_DAYS:
        print(
            f"STALE_CORPUS — corpus is {corpus_age_days} days old (refuse threshold: "
            f"{STALE_REFUSE_DAYS} days). Run `python3 {_HERE}/refresh.py`.",
            file=sys.stderr,
        )
        return 2

    stale_warning: str | None = None
    if corpus_age_days > STALE_WARN_DAYS:
        stale_warning = (
            f"STALE_CORPUS_WARN — corpus is {corpus_age_days} days old. "
            f"Confidence downgraded one tier. Run `python3 {_HERE}/refresh.py`."
        )

    # Freshness via unindexed-issue count
    unindexed: int | None = None
    freshness_status = "skipped"
    if not args.no_freshness_check:
        unindexed = count_unindexed_issues(meta.get("source_repos", []), generated_at)
        if unindexed is None:
            freshness_status = "skipped"
        else:
            freshness_status = "ok"
            if unindexed > UNINDEXED_REFUSE:
                print(
                    f"STALE_CORPUS — {unindexed} issues closed since corpus refresh "
                    f"(refuse threshold: {UNINDEXED_REFUSE}). Run "
                    f"`python3 {_HERE}/refresh.py`.",
                    file=sys.stderr,
                )
                return 2

    # Classify the scope
    classification = classify(title=args.scope, labels=[])
    calibration = calibration_from_meta(meta)

    # Apply downgrades from staleness/freshness signals by bumping bucket MAE
    # one tier (only when calibration is available)
    downgrade_one_tier = False
    if stale_warning:
        downgrade_one_tier = True
    if unindexed is not None and unindexed > UNINDEXED_DOWNGRADE:
        downgrade_one_tier = True

    band = banded_estimate(
        query_text=args.scope,
        query_bucket=classification.bucket,
        match_quality=classification.match_quality,
        records=records,
        calibration=calibration,
    )

    if downgrade_one_tier and band.confidence == "high":
        band = _replace_confidence(band, "moderate")
    elif downgrade_one_tier and band.confidence == "moderate":
        band = _replace_confidence(band, "low")

    # We need ranked analogs for citation — re-rank to get the analog list
    # (banded_estimate doesn't return them; minor refactor opportunity).
    from scoring import rank_analogs, split_blocked

    if classification.bucket != "uncategorized":
        candidates = [r for r in records if r.bucket == classification.bucket]
        if len(candidates) < 5:
            candidates = list(records)
    else:
        candidates = list(records)
    ranked = rank_analogs(args.scope, classification.bucket, candidates, k=10)
    active, blocked = split_blocked(ranked)

    output = format_output(
        scope=args.scope,
        band=band,
        ranked_analogs=active,
        blocked_analogs=blocked,
        corpus_age_days=corpus_age_days,
        unindexed_count=unindexed,
        freshness_status=freshness_status,
        stale_warning=stale_warning,
    )
    print(output)
    return 0


def _replace_confidence(band: Band, new_confidence: str) -> Band:
    """Return a copy of `band` with confidence overridden."""
    from dataclasses import replace

    return replace(band, confidence=new_confidence)


if __name__ == "__main__":
    sys.exit(main())
