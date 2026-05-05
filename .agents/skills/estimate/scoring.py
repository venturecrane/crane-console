#!/usr/bin/env python3
"""
Scoring for /estimate — analog ranking, weighted percentiles, blocked-time
detection, risk multipliers, and confidence labeling.

Pure stdlib. No I/O. No network. All functions are deterministic given
their inputs.

Public API used by query.py and refresh.py:
    CorpusRecord            — dataclass for one closed-issue record
    ScoredAnalog            — dataclass: record + score + bucket_match
    Band                    — dataclass: P50/P90 + risk + confidence
    Calibration             — dataclass: per-bucket MAE thresholds (set in Phase B)
    weighted_quantile()     — unbiased weighted percentile (linear interp)
    build_idf()             — IDF over a list of titles
    query_similarity()      — cosine similarity (TF-IDF) between query and title
    recency_score()         — -1 per 90 days since closed_at
    rank_analogs()          — top-K analogs by combined score
    split_blocked()         — partition into measured vs blocked_external
    detect_risk_flags()     — risk flags from query text + analog stats
    apply_risk_multiplier() — combine risk-flag multipliers, capped at 3×
    confidence_label()      — calibrated confidence tier
    banded_estimate()       — top-level: returns a Band

Vocabulary:
    'measured' execution_minutes — derived from PR commit span (preferred)
    'estimated_from_wallclock'   — fallback when no closing PR; weighted 0.5×
    'blocked_external'           — wallclock/execution > 8 (excluded from
                                   percentile math; surfaced separately in
                                   output)
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Sequence

from taxonomy import Bucket, MatchQuality

# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------


@dataclass
class CorpusRecord:
    issue_number: int
    repo: str
    title: str
    bucket: Bucket
    closed_at: str  # ISO 8601
    opened_at: str  # ISO 8601
    wallclock_minutes: int
    execution_minutes: int
    execution_quality: str  # 'measured' | 'estimated_from_wallclock'
    closing_pr_number: int | None
    n_commits: int
    blocked_external: bool
    labels: list[str] = field(default_factory=list)


@dataclass
class ScoredAnalog:
    record: CorpusRecord
    score: float
    bucket_match: bool


@dataclass
class Band:
    p50_minutes: float | None
    p90_minutes: float | None
    base_p50_minutes: float | None  # before risk multipliers
    risk_multiplier: float
    risk_flags: list[str]
    confidence: str  # 'high' | 'moderate' | 'low'
    n_analogs: int
    n_blocked_excluded: int
    tail_unknown: bool
    taxonomy_match_quality: MatchQuality
    bucket: Bucket
    bucket_mae_at_calibration: float | None


@dataclass
class Calibration:
    """
    Per-bucket median absolute error from Phase B backtest.

    Confidence label thresholds:
        high     — bucket_mae < corpus_median_mae
        moderate — corpus_median_mae ≤ bucket_mae < 2 × corpus_median_mae
        low      — bucket_mae ≥ 2 × corpus_median_mae OR n_analogs < 5

    Set to None when no calibration has been run; query.py downgrades to
    moderate/low based on n_analogs and match_quality alone.
    """

    bucket_mae: dict[Bucket, float]
    corpus_median_mae: float

    def tier_for_bucket(self, bucket: Bucket) -> str:
        mae = self.bucket_mae.get(bucket)
        if mae is None:
            return "low"
        if mae < self.corpus_median_mae:
            return "high"
        if mae < 2.0 * self.corpus_median_mae:
            return "moderate"
        return "low"


# ---------------------------------------------------------------------------
# Weighted percentile
# ---------------------------------------------------------------------------


def weighted_quantile(
    values: Sequence[float],
    weights: Sequence[float],
    q: float,
) -> float | None:
    """
    Unbiased weighted percentile via linear interpolation across sorted
    cumulative weights.

    Returns None if values is empty or all weights are zero. q in [0, 1].
    """
    if not values:
        return None
    if len(values) != len(weights):
        raise ValueError("values and weights must be the same length")
    if not (0.0 <= q <= 1.0):
        raise ValueError("q must be in [0, 1]")

    pairs = sorted(zip(values, weights), key=lambda p: p[0])
    total_weight = sum(w for _, w in pairs)
    if total_weight <= 0:
        return None

    target = q * total_weight
    cumulative = 0.0
    prev_value: float | None = None
    prev_cumulative = 0.0
    for value, weight in pairs:
        if weight <= 0:
            continue
        cumulative += weight
        if cumulative >= target:
            if prev_value is None or weight == 0:
                return float(value)
            # Linear interpolation between prev_value and value
            span = cumulative - prev_cumulative
            frac = (target - prev_cumulative) / span if span > 0 else 0.0
            return float(prev_value + frac * (value - prev_value))
        prev_value = float(value)
        prev_cumulative = cumulative
    return float(pairs[-1][0])


# ---------------------------------------------------------------------------
# Similarity
# ---------------------------------------------------------------------------

_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def build_idf(titles: Iterable[str]) -> dict[str, float]:
    """Inverse document frequency over the corpus titles. Smoothed."""
    docs = [set(_tokenize(t)) for t in titles]
    n = len(docs) or 1
    df: dict[str, int] = {}
    for tokens in docs:
        for token in tokens:
            df[token] = df.get(token, 0) + 1
    return {token: math.log((n + 1) / (count + 1)) + 1.0 for token, count in df.items()}


def query_similarity(query: str, target: str, idf: dict[str, float]) -> float:
    """
    Cosine similarity between query and target, IDF-weighted. Returns 0.0
    when there is no overlap or either side is empty.
    """
    q_tokens = _tokenize(query)
    t_tokens = _tokenize(target)
    if not q_tokens or not t_tokens:
        return 0.0

    def _vec(tokens: list[str]) -> dict[str, float]:
        v: dict[str, float] = {}
        for token in tokens:
            weight = idf.get(token, 1.0)
            v[token] = v.get(token, 0.0) + weight
        return v

    qv = _vec(q_tokens)
    tv = _vec(t_tokens)
    overlap = set(qv) & set(tv)
    if not overlap:
        return 0.0
    dot = sum(qv[t] * tv[t] for t in overlap)
    qnorm = math.sqrt(sum(v * v for v in qv.values()))
    tnorm = math.sqrt(sum(v * v for v in tv.values()))
    if qnorm == 0 or tnorm == 0:
        return 0.0
    return dot / (qnorm * tnorm)


# ---------------------------------------------------------------------------
# Recency
# ---------------------------------------------------------------------------


def _parse_iso(ts: str) -> datetime:
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    return datetime.fromisoformat(ts).astimezone(timezone.utc)


def recency_score(closed_at: str, now: datetime | None = None) -> float:
    """
    -1 per 90 days since the issue closed. Returns 0 for issues closed
    today. Capped at -10 (no infinite penalty for ancient records).
    """
    now = now or datetime.now(timezone.utc)
    closed = _parse_iso(closed_at)
    age_days = max(0, (now - closed).total_seconds() / 86400)
    score = -(age_days / 90.0)
    return max(score, -10.0)


# ---------------------------------------------------------------------------
# Ranking
# ---------------------------------------------------------------------------


def rank_analogs(
    query_text: str,
    query_bucket: Bucket,
    records: Sequence[CorpusRecord],
    k: int = 10,
    now: datetime | None = None,
) -> list[ScoredAnalog]:
    """
    Top-K analogs by combined score:
        +10 if record bucket matches query bucket (and query bucket is not
             'uncategorized' — uncategorized doesn't earn the bonus)
        + (similarity ∈ [0, 1]) × 5
        + recency_score (negative, ~-1 per 90 days)
        × 0.5 if record execution_quality is 'estimated_from_wallclock'
    """
    if not records:
        return []
    idf = build_idf([r.title for r in records])
    scored: list[ScoredAnalog] = []
    for record in records:
        bucket_match = (
            record.bucket == query_bucket and query_bucket != "uncategorized"
        )
        bucket_bonus = 10.0 if bucket_match else 0.0
        sim = query_similarity(query_text, record.title, idf)
        rec = recency_score(record.closed_at, now=now)
        score = bucket_bonus + (sim * 5.0) + rec
        if record.execution_quality == "estimated_from_wallclock":
            score *= 0.5
        scored.append(ScoredAnalog(record=record, score=score, bucket_match=bucket_match))
    scored.sort(key=lambda s: s.score, reverse=True)
    return scored[:k]


def split_blocked(
    analogs: Iterable[ScoredAnalog],
) -> tuple[list[ScoredAnalog], list[ScoredAnalog]]:
    """Partition into (active, blocked_external)."""
    active: list[ScoredAnalog] = []
    blocked: list[ScoredAnalog] = []
    for a in analogs:
        if a.record.blocked_external:
            blocked.append(a)
        else:
            active.append(a)
    return active, blocked


# ---------------------------------------------------------------------------
# Risk flags
# ---------------------------------------------------------------------------

_VENDOR_RE = re.compile(r"\b(stripe|clerk|vercel|cloudflare|infisical|tailscale)\b", re.I)
_CAPTAIN_RE = re.compile(r"\b(copy|content|approval|sign[- ]?off|review)\b", re.I)


def detect_risk_flags(
    query_text: str,
    analogs: Sequence[ScoredAnalog],
    bucket: Bucket,
) -> tuple[list[str], float]:
    """
    Returns (flag_names, multiplier). Multiplier is the product of per-flag
    multipliers, capped at 3.0×.
    """
    flags: list[str] = []
    multiplier = 1.0

    if _VENDOR_RE.search(query_text):
        flags.append("vendor_dependency")
        multiplier *= 1.25
    if _CAPTAIN_RE.search(query_text):
        flags.append("captain_decision_blocker")
        multiplier *= 1.25

    # multi_session_work proxy: median n_commits ≥ 5 across active analogs
    if analogs:
        commits = sorted(a.record.n_commits for a in analogs)
        median_commits = commits[len(commits) // 2]
        if median_commits >= 5:
            flags.append("multi_session_work")
            multiplier *= 1.25

    if bucket == "uncategorized":
        flags.append("low_taxonomy_confidence")
        multiplier *= 1.5

    return flags, min(multiplier, 3.0)


def apply_risk_multiplier(base: float | None, multiplier: float) -> float | None:
    if base is None:
        return None
    return base * multiplier


# ---------------------------------------------------------------------------
# Confidence
# ---------------------------------------------------------------------------


def confidence_label(
    n_analogs: int,
    match_quality: MatchQuality,
    bucket: Bucket,
    calibration: Calibration | None = None,
) -> str:
    """
    Calibrated confidence tier when calibration is provided; otherwise a
    safe default based only on n_analogs and match_quality.
    """
    if n_analogs < 5:
        return "low"
    if match_quality == "title_similarity_only":
        return "low"
    if calibration is not None:
        return calibration.tier_for_bucket(bucket)
    # No calibration — conservative default.
    if n_analogs >= 8 and match_quality == "label_match":
        return "high"
    if match_quality == "keyword_match" or n_analogs < 8:
        return "moderate"
    return "moderate"


# ---------------------------------------------------------------------------
# Top-level: banded_estimate
# ---------------------------------------------------------------------------


def banded_estimate(
    query_text: str,
    query_bucket: Bucket,
    match_quality: MatchQuality,
    records: Sequence[CorpusRecord],
    k: int = 10,
    calibration: Calibration | None = None,
    now: datetime | None = None,
) -> Band:
    """
    End-to-end banding. Filters records to the query bucket (if not
    uncategorized), ranks, splits blocked, computes percentile, applies
    risk multipliers, returns a Band.
    """
    # When the query bucket is concrete, restrict candidates to that bucket.
    # When uncategorized, search the full corpus and rely on similarity.
    if query_bucket != "uncategorized":
        candidates = [r for r in records if r.bucket == query_bucket]
        if len(candidates) < 5:
            # Not enough in-bucket records — broaden to full corpus and
            # downgrade match quality. Bucket bonus still applies in
            # ranking, so true matches still float to the top.
            candidates = list(records)
    else:
        candidates = list(records)

    ranked = rank_analogs(query_text, query_bucket, candidates, k=k, now=now)
    active, blocked = split_blocked(ranked)

    n_active = len(active)
    n_blocked = len(blocked)

    risk_flags, multiplier = detect_risk_flags(query_text, active, query_bucket)

    # Refuse to produce a number when:
    #   (a) zero active analogs, OR
    #   (b) bucket is 'uncategorized' AND fewer than 10 active analogs.
    # Per the plan, uncategorized matches lean on TF-IDF similarity over a
    # small sub-corpus and we will not stand up a confident-looking number
    # on <10 records of unverified taxonomy.
    refuse_low_n_uncategorized = (
        query_bucket == "uncategorized" and n_active < 10
    )
    if n_active == 0 or refuse_low_n_uncategorized:
        return Band(
            p50_minutes=None,
            p90_minutes=None,
            base_p50_minutes=None,
            risk_multiplier=multiplier,
            risk_flags=risk_flags,
            confidence="low",
            n_analogs=n_active,
            n_blocked_excluded=n_blocked,
            tail_unknown=True,
            taxonomy_match_quality=match_quality,
            bucket=query_bucket,
            bucket_mae_at_calibration=(
                calibration.bucket_mae.get(query_bucket) if calibration else None
            ),
        )

    # Per plan: when the bucket has ≥5 measured records, exclude
    # estimated_from_wallclock records from the percentile values. They
    # still appear in the ranked analog list (informational), but their
    # uncertain execution_minutes don't pollute the band.
    measured = [a for a in active if a.record.execution_quality == "measured"]
    if len(measured) >= 5:
        for_percentile = measured
    else:
        for_percentile = active

    values = [float(a.record.execution_minutes) for a in for_percentile]
    weights = [max(0.001, a.score) for a in for_percentile]  # floor weights to avoid zero division on negative scores
    base_p50 = weighted_quantile(values, weights, 0.5)
    base_p90 = weighted_quantile(values, weights, 0.9) if len(for_percentile) >= 5 else None

    p50 = apply_risk_multiplier(base_p50, multiplier)
    p90 = apply_risk_multiplier(base_p90, multiplier) if base_p90 is not None else None

    return Band(
        p50_minutes=p50,
        p90_minutes=p90,
        base_p50_minutes=base_p50,
        risk_multiplier=multiplier,
        risk_flags=risk_flags,
        confidence=confidence_label(n_active, match_quality, query_bucket, calibration),
        n_analogs=n_active,
        n_blocked_excluded=n_blocked,
        tail_unknown=p90 is None,
        taxonomy_match_quality=match_quality,
        bucket=query_bucket,
        bucket_mae_at_calibration=(
            calibration.bucket_mae.get(query_bucket) if calibration else None
        ),
    )
