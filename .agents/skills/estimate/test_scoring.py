#!/usr/bin/env python3
"""Unit tests for scoring.* — pure-function coverage."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from scoring import (
    Calibration,
    CorpusRecord,
    apply_risk_multiplier,
    banded_estimate,
    build_idf,
    confidence_label,
    detect_risk_flags,
    query_similarity,
    rank_analogs,
    recency_score,
    split_blocked,
    weighted_quantile,
)


def _record(
    *,
    issue_number: int = 1,
    repo: str = "venturecrane/test-repo",
    title: str = "test issue",
    bucket: str = "ui-component",
    execution_minutes: int = 60,
    wallclock_minutes: int = 60,
    n_commits: int = 3,
    blocked_external: bool = False,
    execution_quality: str = "measured",
    closed_at: str = "2026-05-01T12:00:00Z",
    opened_at: str = "2026-05-01T11:00:00Z",
    closing_pr_number: int | None = 99,
) -> CorpusRecord:
    return CorpusRecord(
        issue_number=issue_number,
        repo=repo,
        title=title,
        bucket=bucket,  # type: ignore[arg-type]
        closed_at=closed_at,
        opened_at=opened_at,
        wallclock_minutes=wallclock_minutes,
        execution_minutes=execution_minutes,
        execution_quality=execution_quality,
        closing_pr_number=closing_pr_number,
        n_commits=n_commits,
        blocked_external=blocked_external,
        labels=[],
    )


class TestWeightedQuantile(unittest.TestCase):
    def test_uniform_weights_p50(self) -> None:
        result = weighted_quantile([1, 2, 3, 4, 5], [1, 1, 1, 1, 1], 0.5)
        self.assertIsNotNone(result)
        assert result is not None
        self.assertAlmostEqual(result, 3.0, delta=0.5)

    def test_uniform_weights_p90(self) -> None:
        result = weighted_quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [1] * 10, 0.9)
        self.assertIsNotNone(result)
        assert result is not None
        self.assertAlmostEqual(result, 9.0, delta=1.0)

    def test_skewed_weights_pull_toward_heavy(self) -> None:
        result = weighted_quantile([10, 100], [1, 100], 0.5)
        self.assertIsNotNone(result)
        assert result is not None
        self.assertGreater(result, 50)  # heavy weight on 100 dominates

    def test_empty_returns_none(self) -> None:
        self.assertIsNone(weighted_quantile([], [], 0.5))

    def test_zero_weights_returns_none(self) -> None:
        self.assertIsNone(weighted_quantile([1, 2, 3], [0, 0, 0], 0.5))

    def test_q_zero_returns_min(self) -> None:
        result = weighted_quantile([5, 1, 3], [1, 1, 1], 0.0)
        self.assertEqual(result, 1.0)

    def test_q_one_returns_max(self) -> None:
        result = weighted_quantile([5, 1, 3], [1, 1, 1], 1.0)
        self.assertEqual(result, 5.0)


class TestSimilarity(unittest.TestCase):
    def test_identical_titles(self) -> None:
        idf = build_idf(["add clerk auth", "add navbar component", "fix bug"])
        score = query_similarity("add clerk auth", "add clerk auth", idf)
        self.assertAlmostEqual(score, 1.0, places=4)

    def test_no_overlap(self) -> None:
        idf = build_idf(["add clerk auth", "fix bug"])
        score = query_similarity("xyz unrelated", "fix bug", idf)
        self.assertLessEqual(score, 0.0)

    def test_partial_overlap(self) -> None:
        idf = build_idf(["add clerk auth", "fix bug", "build clerk auth flow", "add navbar"])
        score = query_similarity("clerk integration", "build clerk auth flow", idf)
        self.assertGreater(score, 0.0)
        self.assertLess(score, 1.0)

    def test_empty_inputs(self) -> None:
        idf = build_idf(["abc"])
        self.assertEqual(query_similarity("", "abc", idf), 0.0)
        self.assertEqual(query_similarity("abc", "", idf), 0.0)


class TestRecency(unittest.TestCase):
    def test_today_is_zero(self) -> None:
        now = datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc)
        self.assertEqual(recency_score("2026-05-05T12:00:00Z", now=now), 0.0)

    def test_90_days_ago_is_minus_one(self) -> None:
        now = datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc)
        score = recency_score("2026-02-04T12:00:00Z", now=now)
        self.assertAlmostEqual(score, -1.0, delta=0.05)

    def test_caps_at_minus_ten(self) -> None:
        now = datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc)
        score = recency_score("2010-01-01T12:00:00Z", now=now)
        self.assertEqual(score, -10.0)

    def test_z_suffix_handled(self) -> None:
        now = datetime(2026, 5, 5, 12, 0, tzinfo=timezone.utc)
        # No exception, returns valid float
        self.assertIsInstance(recency_score("2026-05-04T00:00:00Z", now=now), float)


class TestRanking(unittest.TestCase):
    def test_bucket_match_outranks_better_similarity(self) -> None:
        # Same-bucket record beats a closer-titled different-bucket record.
        records = [
            _record(issue_number=1, title="off-topic refactor", bucket="ui-component", execution_minutes=60),
            _record(issue_number=2, title="add stripe webhook", bucket="auth", execution_minutes=120),
        ]
        ranked = rank_analogs(
            query_text="add stripe webhook",
            query_bucket="ui-component",
            records=records,
            k=2,
        )
        self.assertEqual(ranked[0].record.issue_number, 1)  # bucket match wins

    def test_uncategorized_query_no_bucket_bonus(self) -> None:
        records = [
            _record(issue_number=1, title="auth thing", bucket="uncategorized", execution_minutes=60),
            _record(issue_number=2, title="auth thing", bucket="auth", execution_minutes=60),
        ]
        ranked = rank_analogs(
            query_text="auth thing",
            query_bucket="uncategorized",
            records=records,
            k=2,
        )
        # No bucket bonus applies when query is uncategorized; both score
        # equally on similarity, so order is stable but neither gets +10
        for analog in ranked:
            self.assertFalse(analog.bucket_match)

    def test_estimated_quality_halves_score(self) -> None:
        records = [
            _record(issue_number=1, title="add clerk auth", execution_quality="measured", execution_minutes=60, bucket="auth"),
            _record(issue_number=2, title="add clerk auth", execution_quality="estimated_from_wallclock", execution_minutes=60, bucket="auth"),
        ]
        ranked = rank_analogs("add clerk auth", "auth", records, k=2)
        # Measured record should rank above estimated record at equal everything else
        self.assertEqual(ranked[0].record.issue_number, 1)
        self.assertGreater(ranked[0].score, ranked[1].score)


class TestSplitBlocked(unittest.TestCase):
    def test_partition(self) -> None:
        from scoring import ScoredAnalog
        records = [
            ScoredAnalog(record=_record(issue_number=1, blocked_external=False), score=1.0, bucket_match=True),
            ScoredAnalog(record=_record(issue_number=2, blocked_external=True), score=0.5, bucket_match=True),
            ScoredAnalog(record=_record(issue_number=3, blocked_external=False), score=0.3, bucket_match=False),
        ]
        active, blocked = split_blocked(records)
        self.assertEqual(len(active), 2)
        self.assertEqual(len(blocked), 1)
        self.assertEqual(blocked[0].record.issue_number, 2)


class TestRiskFlags(unittest.TestCase):
    def test_vendor_flag(self) -> None:
        flags, mult = detect_risk_flags("integrate Stripe webhook", [], "worker-endpoint")
        self.assertIn("vendor_dependency", flags)
        self.assertAlmostEqual(mult, 1.25)

    def test_captain_blocker_flag(self) -> None:
        flags, mult = detect_risk_flags("update copy on landing page", [], "ui-page")
        self.assertIn("captain_decision_blocker", flags)
        self.assertAlmostEqual(mult, 1.25)

    def test_uncategorized_widens(self) -> None:
        flags, mult = detect_risk_flags("xyz unknown work", [], "uncategorized")
        self.assertIn("low_taxonomy_confidence", flags)
        self.assertAlmostEqual(mult, 1.5)

    def test_capped_at_3x(self) -> None:
        # Vendor + captain + uncategorized + (faked) multi_session = 1.25*1.25*1.5*1.25 ≈ 2.93
        # Add a fake high-commit analog to trigger multi_session
        from scoring import ScoredAnalog
        analogs = [
            ScoredAnalog(record=_record(n_commits=10), score=1.0, bucket_match=True),
        ]
        flags, mult = detect_risk_flags(
            "stripe copy review", analogs, "uncategorized"
        )
        self.assertLessEqual(mult, 3.0)
        self.assertGreater(mult, 2.0)


class TestApplyRiskMultiplier(unittest.TestCase):
    def test_none_passes_through(self) -> None:
        self.assertIsNone(apply_risk_multiplier(None, 1.5))

    def test_scales(self) -> None:
        self.assertEqual(apply_risk_multiplier(60.0, 1.5), 90.0)


class TestConfidence(unittest.TestCase):
    def test_n_below_5_is_low(self) -> None:
        self.assertEqual(
            confidence_label(3, "label_match", "auth", calibration=None), "low"
        )

    def test_title_similarity_is_low(self) -> None:
        self.assertEqual(
            confidence_label(20, "title_similarity_only", "uncategorized", calibration=None),
            "low",
        )

    def test_label_match_with_n_8_is_high_default(self) -> None:
        self.assertEqual(
            confidence_label(8, "label_match", "auth", calibration=None), "high"
        )

    def test_keyword_match_is_moderate_default(self) -> None:
        self.assertEqual(
            confidence_label(8, "keyword_match", "auth", calibration=None), "moderate"
        )

    def test_calibration_overrides(self) -> None:
        cal = Calibration(
            bucket_mae={"auth": 0.5, "ui-component": 1.5, "data-migration": 3.0},  # type: ignore[dict-item]
            corpus_median_mae=1.0,
        )
        # auth: mae 0.5 < median 1.0 → high
        self.assertEqual(confidence_label(10, "label_match", "auth", calibration=cal), "high")
        # ui-component: mae 1.5 ≥ median, < 2× median (2.0) → moderate
        self.assertEqual(
            confidence_label(10, "label_match", "ui-component", calibration=cal), "moderate"
        )
        # data-migration: mae 3.0 ≥ 2× median → low
        self.assertEqual(
            confidence_label(10, "label_match", "data-migration", calibration=cal), "low"
        )


class TestBandedEstimate(unittest.TestCase):
    def test_no_analogs_returns_none_band(self) -> None:
        band = banded_estimate(
            query_text="kubernetes operator in rust",
            query_bucket="uncategorized",
            match_quality="title_similarity_only",
            records=[],
        )
        self.assertIsNone(band.p50_minutes)
        self.assertIsNone(band.p90_minutes)
        self.assertEqual(band.n_analogs, 0)
        self.assertTrue(band.tail_unknown)
        self.assertEqual(band.confidence, "low")

    def test_uncategorized_with_lt_10_refuses(self) -> None:
        # 5 records, all uncategorized — should refuse because <10 in bucket.
        records = [
            _record(issue_number=i, title=f"misc work #{i}", bucket="uncategorized", execution_minutes=30)
            for i in range(5)
        ]
        band = banded_estimate("misc work", "uncategorized", "title_similarity_only", records)
        self.assertIsNone(band.p50_minutes)
        self.assertIsNone(band.p90_minutes)
        self.assertEqual(band.confidence, "low")
        # n_analogs reflects the analogs found (informational), not zero
        self.assertGreater(band.n_analogs, 0)

    def test_uncategorized_with_ge_10_produces_estimate(self) -> None:
        # 12 uncategorized records — passes the >=10 floor.
        records = [
            _record(issue_number=i, title=f"misc work #{i}", bucket="uncategorized", execution_minutes=30 + i)
            for i in range(12)
        ]
        band = banded_estimate("misc work", "uncategorized", "title_similarity_only", records)
        self.assertIsNotNone(band.p50_minutes)

    def test_n_lt_5_no_p90(self) -> None:
        records = [
            _record(issue_number=i, title=f"add clerk auth #{i}", bucket="auth", execution_minutes=60 + i * 5)
            for i in range(3)
        ]
        band = banded_estimate("add clerk auth", "auth", "label_match", records)
        self.assertIsNotNone(band.p50_minutes)
        self.assertIsNone(band.p90_minutes)
        self.assertTrue(band.tail_unknown)

    def test_p50_p90_with_full_corpus(self) -> None:
        records = [
            _record(issue_number=i, title=f"add clerk auth #{i}", bucket="auth", execution_minutes=60 + i * 5)
            for i in range(10)
        ]
        band = banded_estimate("add clerk auth", "auth", "label_match", records)
        self.assertIsNotNone(band.p50_minutes)
        self.assertIsNotNone(band.p90_minutes)
        assert band.p50_minutes is not None and band.p90_minutes is not None
        self.assertGreater(band.p90_minutes, band.p50_minutes)

    def test_blocked_excluded_from_band(self) -> None:
        # 5 active records all at 60 min; 1 blocked at 5000 min
        records = [
            _record(issue_number=i, title=f"add clerk auth #{i}", bucket="auth", execution_minutes=60)
            for i in range(5)
        ]
        records.append(
            _record(
                issue_number=99,
                title="add clerk auth blocked",
                bucket="auth",
                execution_minutes=5000,
                wallclock_minutes=50000,
                blocked_external=True,
            )
        )
        band = banded_estimate("add clerk auth", "auth", "label_match", records)
        # P50 should be 60 (all active records), not pulled by the 5000 outlier
        assert band.p50_minutes is not None
        self.assertLess(band.p50_minutes, 100)
        self.assertEqual(band.n_blocked_excluded, 1)

    def test_risk_multiplier_inflates_band(self) -> None:
        records = [
            _record(issue_number=i, title=f"add stripe webhook #{i}", bucket="worker-endpoint", execution_minutes=60)
            for i in range(10)
        ]
        band = banded_estimate(
            "add stripe webhook for premium plan",
            "worker-endpoint",
            "label_match",
            records,
        )
        self.assertIn("vendor_dependency", band.risk_flags)
        assert band.p50_minutes is not None and band.base_p50_minutes is not None
        self.assertGreater(band.p50_minutes, band.base_p50_minutes)
        self.assertAlmostEqual(band.risk_multiplier, 1.25, places=2)


if __name__ == "__main__":
    unittest.main()
