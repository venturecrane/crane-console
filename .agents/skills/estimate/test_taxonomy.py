#!/usr/bin/env python3
"""Unit tests for taxonomy.classify — table-driven."""

from __future__ import annotations

import unittest

from taxonomy import (
    ALL_BUCKETS,
    classify,
    classify_by_labels,
    classify_by_title,
)


class TestLabelClassification(unittest.TestCase):
    def test_auth_label_family(self) -> None:
        result = classify_by_labels(["area:auth", "type:feature"])
        assert result is not None
        self.assertEqual(result.bucket, "auth")
        self.assertEqual(result.match_quality, "label_match")

    def test_data_migration_via_database_label(self) -> None:
        result = classify_by_labels(["component:database", "prio:P1"])
        assert result is not None
        self.assertEqual(result.bucket, "data-migration")

    def test_design_label_to_ui_component(self) -> None:
        result = classify_by_labels(["area:design"])
        assert result is not None
        self.assertEqual(result.bucket, "ui-component")

    def test_vc_web_to_ui_page(self) -> None:
        result = classify_by_labels(["area:vc-web"])
        assert result is not None
        self.assertEqual(result.bucket, "ui-page")

    def test_infra_label(self) -> None:
        result = classify_by_labels(["component:infrastructure"])
        assert result is not None
        self.assertEqual(result.bucket, "infra-config")

    def test_tech_debt_label(self) -> None:
        result = classify_by_labels(["type:tech-debt"])
        assert result is not None
        self.assertEqual(result.bucket, "refactor-cleanup")

    def test_docs_label(self) -> None:
        result = classify_by_labels(["area:docs"])
        assert result is not None
        self.assertEqual(result.bucket, "content-edit")

    def test_unknown_labels_return_none(self) -> None:
        self.assertIsNone(classify_by_labels(["random-label", "another"]))

    def test_empty_labels_return_none(self) -> None:
        self.assertIsNone(classify_by_labels([]))


class TestTitleClassification(unittest.TestCase):
    def test_auth_keyword(self) -> None:
        result = classify_by_title("Add Clerk auth to ss-console")
        assert result is not None
        self.assertEqual(result.bucket, "auth")
        self.assertEqual(result.match_quality, "keyword_match")

    def test_migration_keyword(self) -> None:
        result = classify_by_title("Add 0044_corpus migration for effort_estimates table")
        assert result is not None
        self.assertEqual(result.bucket, "data-migration")

    def test_schema_keyword(self) -> None:
        result = classify_by_title("Update D1 schema for sessions table")
        assert result is not None
        self.assertEqual(result.bucket, "data-migration")

    def test_endpoint_before_component(self) -> None:
        # 'route' should land in worker-endpoint, not ui-component, due to
        # rule ordering.
        result = classify_by_title("Add worker route for /sessions/history")
        assert result is not None
        self.assertEqual(result.bucket, "worker-endpoint")

    def test_component_keyword(self) -> None:
        result = classify_by_title("Build NavBar component for ss-console")
        assert result is not None
        self.assertEqual(result.bucket, "ui-component")

    def test_wireframe_to_page(self) -> None:
        result = classify_by_title("Wireframe for new pricing page")
        assert result is not None
        self.assertEqual(result.bucket, "ui-page")

    def test_refactor_keyword(self) -> None:
        result = classify_by_title("Refactor session-history endpoint to dedupe queries")
        # 'refactor' wins over 'endpoint' due to alphabetical placement?
        # No — keyword rules are checked in declaration order. endpoint is
        # before refactor in our list, so endpoint wins. This is intentional:
        # the work is fundamentally adding/changing an endpoint.
        assert result is not None
        self.assertEqual(result.bucket, "worker-endpoint")

    def test_pure_refactor(self) -> None:
        result = classify_by_title("Cleanup duplicate utility functions")
        assert result is not None
        self.assertEqual(result.bucket, "refactor-cleanup")

    def test_content_edit(self) -> None:
        result = classify_by_title("Edit build log entry for 2026-04-30")
        assert result is not None
        self.assertEqual(result.bucket, "content-edit")

    def test_infra_wrangler(self) -> None:
        result = classify_by_title("Configure wrangler secrets for crane-context")
        assert result is not None
        self.assertEqual(result.bucket, "infra-config")

    def test_no_match_returns_none(self) -> None:
        self.assertIsNone(
            classify_by_title("Investigate XYZ behavior in production")
        )

    def test_empty_title_returns_none(self) -> None:
        self.assertIsNone(classify_by_title(""))


class TestEndToEnd(unittest.TestCase):
    def test_label_wins_over_title_when_both_match(self) -> None:
        # Title says 'refactor', label says auth. Label wins.
        result = classify(
            title="Refactor auth helper functions",
            labels=["area:auth"],
        )
        self.assertEqual(result.bucket, "auth")
        self.assertEqual(result.match_quality, "label_match")

    def test_title_used_when_label_doesnt_match(self) -> None:
        result = classify(
            title="Add Clerk integration",
            labels=["random-label", "prio:P2"],
        )
        self.assertEqual(result.bucket, "auth")
        self.assertEqual(result.match_quality, "keyword_match")

    def test_uncategorized_when_neither_matches(self) -> None:
        result = classify(
            title="Investigate strange behavior",
            labels=[],
        )
        self.assertEqual(result.bucket, "uncategorized")
        self.assertEqual(result.match_quality, "title_similarity_only")

    def test_all_buckets_covered(self) -> None:
        # Sanity: ALL_BUCKETS exposed and contains the sentinel.
        self.assertIn("uncategorized", ALL_BUCKETS)
        self.assertEqual(len(ALL_BUCKETS), 9)


if __name__ == "__main__":
    unittest.main()
