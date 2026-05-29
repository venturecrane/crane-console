#!/usr/bin/env python3
"""Prompt-contract guard for the aie-onboard skill.

The skill turns a client-interview transcript into a customer.yaml + onboarding
plan — all client-facing engagement config — so it must stay strictly extractive
(no fabricated content) and carry the guardrails the customer.yaml validator does
NOT enforce: trust-ceiling locking, the composio ban, and the hermes_ref fork-tag
ban.

Mirrors the ss-console enrichment-prompt-contract tests: source-level assertions on
the skill text, not runtime behavior. Stdlib unittest (matches the estimate skill's
test convention; no pytest dependency).

Run: python3 .agents/skills/aie-onboard/test_contract.py
"""

from __future__ import annotations

import unittest
from pathlib import Path

_DIR = Path(__file__).resolve().parent
SKILL = (_DIR / "SKILL.md").read_text(encoding="utf-8")
CONTRACT = (_DIR / "references" / "extraction-contract.md").read_text(encoding="utf-8")


class ExtractionContract(unittest.TestCase):
    def test_contract_is_evidence_bound(self) -> None:
        self.assertIn("Use only facts present in the supplied context.", CONTRACT)
        self.assertIn(
            "Do not infer management style, communication preference, personality, "
            "likely objections, or private business conditions.",
            CONTRACT,
        )
        self.assertIn(
            "When evidence is incomplete, label it as an open question instead of guessing.",
            CONTRACT,
        )

    def test_contract_has_no_inference_sections(self) -> None:
        for banned in (
            "## Management Style",
            "## Communication Preferences",
            "## Likely Objections",
            "## Talking Points",
        ):
            self.assertNotIn(banned, CONTRACT)


class SkillGuardrails(unittest.TestCase):
    def test_non_provisioning_non_committing(self) -> None:
        self.assertIn("NON-PROVISIONING", SKILL)
        self.assertIn("NON-COMMITTING", SKILL)
        self.assertIn("MUST NOT run `provision-customer.sh`", SKILL)
        self.assertIn("MUST NOT run `git add`, `git commit`, or `git push`", SKILL)

    def test_trust_ceiling_locking_enforced_in_skill(self) -> None:
        # The customer.yaml validator never emits TrustCeilingExceeded, so the lock
        # rule must live in the skill. Assert the mechanism, not a skill-name list.
        self.assertIn("trust_ceiling_locked", SKILL)
        self.assertIn("is forced to `draft_for_review`", SKILL)

    def test_bans_composio_and_hermes_fork_tags(self) -> None:
        self.assertIn("Never emit a `composio:`", SKILL)
        self.assertIn("v2026.5.16-smd.0", SKILL)


if __name__ == "__main__":
    unittest.main()
