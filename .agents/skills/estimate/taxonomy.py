#!/usr/bin/env python3
"""
Taxonomy for /estimate corpus — assigns one of 8 frozen buckets (plus an
'uncategorized' sentinel) to each closed issue.

Three-tier classification, longest-match wins:

  Tier 1 — label families. GitHub labels like 'area:auth', 'component:auth',
           'type:bug' + 'auth' tokens. Mapping: LABEL_MAP.
  Tier 2 — title keyword extraction. Regexes per bucket. Mapping: KEYWORD_RULES.
  Tier 3 — uncategorized sentinel. Falls back to TF-IDF cosine over titles
           within the uncategorized sub-corpus at query time (handled by
           scoring.py, not here).

Pure functions. No I/O. No network. Deterministic given the same labels and
title.

Buckets are deliberately coarse for v1. Fine-grained taxonomies fragment
small samples and inflate variance. Eight buckets + uncategorized is the
calibrated minimum for our corpus.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Literal

Bucket = Literal[
    "auth",
    "data-migration",
    "ui-component",
    "ui-page",
    "worker-endpoint",
    "infra-config",
    "content-edit",
    "refactor-cleanup",
    "uncategorized",
]

MatchQuality = Literal["label_match", "keyword_match", "title_similarity_only"]


@dataclass(frozen=True)
class Classification:
    bucket: Bucket
    match_quality: MatchQuality
    matched_signal: str  # the label or keyword that triggered the match


# Tier 1: label-family rules. Each rule is (predicate_on_labels, bucket).
# Predicates are tested in order; first match wins. Predicates take a
# normalized set of label names (lowercased) and return bool.
def _has(labels: set[str], *needles: str) -> bool:
    """True if any label in `labels` contains any of the needles as a substring."""
    return any(needle in label for label in labels for needle in needles)


LABEL_RULES: list[tuple[str, Bucket]] = [
    # bucket: keyword fragments matched against label names (substring, lowercased)
    ("auth|clerk|signin|login|session", "auth"),
    ("migration|schema|database|d1", "data-migration"),
    ("component:design|design system", "ui-component"),
    ("area:design", "ui-component"),
    ("area:vc-web|venture crane website", "ui-page"),
    ("component:crane-context|component:crane-mcp|component:crane-relay|component:crane-command", "worker-endpoint"),
    ("component:infrastructure|area:infra|infrastructure", "infra-config"),
    ("area:docs|documentation|content", "content-edit"),
    ("type:tech-debt|tech-debt|refactor|cleanup", "refactor-cleanup"),
]


# Tier 2: title keyword regexes. Order matters — checked top-to-bottom; first
# match wins. Patterns are case-insensitive, word-boundary-respecting where
# practical. Rationale per pattern is in inline comments.
KEYWORD_RULES: list[tuple[re.Pattern[str], Bucket]] = [
    # auth — clerk + classic auth verbs. Note: 'session' is deliberately
    # excluded because it's overloaded — 'session-history', 'work session',
    # 'GA session' are not auth concerns. The remaining tokens are specific
    # enough that false positives are rare.
    (re.compile(r"\b(auth|clerk|login|signin|sign-in|oauth|jwt|sso)\b", re.I), "auth"),
    # data-migration — schema/db work and numbered migration files
    (re.compile(r"\b(migration|schema|d1|sqlite|alter\s+table|drop\s+(table|column))\b", re.I), "data-migration"),
    (re.compile(r"\b00\d{2}_", re.I), "data-migration"),
    # ui-page — top-level page or route work
    (re.compile(r"\b(wireframe|scaffold|new\s+page|new\s+route|landing\s+page|page\s+for)\b", re.I), "ui-page"),
    # worker-endpoint — MCP/worker routes & endpoints (checked BEFORE
    # ui-component so 'route' lands here, not the component bucket)
    (re.compile(r"\b(endpoint|worker|api\s+route|http\s+route|webhook)\b", re.I), "worker-endpoint"),
    # ui-component — design-system and component-shaped work
    (re.compile(r"\b(component|card|pill|badge|nav|navbar|header|footer|sidebar|button|modal|drawer)\b", re.I), "ui-component"),
    # refactor-cleanup
    (re.compile(r"\b(refactor|cleanup|clean-up|dedupe|rename|extract|consolidate|de-duplicate)\b", re.I), "refactor-cleanup"),
    # content-edit
    (re.compile(r"\b(copy|content|docs|readme|build\s+log|article|blog\s+post|edit\s+log)\b", re.I), "content-edit"),
    # infra-config — wrangler, secrets, env, deploy hooks, CI/CD, fleet ops,
    # tokens packaging, skill plumbing, security/rulesets. Broad on purpose:
    # this is the "ops/tooling work" bucket and lots of crane work falls
    # under it. Plural-tolerant ('packages', 'tokens', 'secrets', 'rulesets').
    (re.compile(r"\b(wrangler|env\s+var|environment\s+variable|secrets?|vercel|deploy|cloudflare|infisical|tailscale|gh\s+app|github\s+app|ci|workflow|hook|fleet|tokens?|tarball|publish|packages?|/eos|/sos|/heartbeat|handoff|crane_|sessionstart|rulesets?|security|status[- ]check|pat|provision)\b", re.I), "infra-config"),
]


def _normalize_labels(labels: Iterable[str]) -> set[str]:
    return {label.lower() for label in labels if label}


def classify_by_labels(labels: Iterable[str]) -> Classification | None:
    """Tier 1 — label-family classification. Returns None if no rule matches."""
    norm = _normalize_labels(labels)
    if not norm:
        return None
    for needles_pattern, bucket in LABEL_RULES:
        for needle in needles_pattern.split("|"):
            if needle and any(needle in label for label in norm):
                return Classification(
                    bucket=bucket,
                    match_quality="label_match",
                    matched_signal=f"label:{needle}",
                )
    return None


def classify_by_title(title: str) -> Classification | None:
    """Tier 2 — title keyword classification. Returns None if no rule matches."""
    if not title:
        return None
    for pattern, bucket in KEYWORD_RULES:
        match = pattern.search(title)
        if match:
            return Classification(
                bucket=bucket,
                match_quality="keyword_match",
                matched_signal=f"keyword:{match.group(0).lower()}",
            )
    return None


def classify(title: str, labels: Iterable[str]) -> Classification:
    """
    Classify a closed issue into one of the 8 buckets, or 'uncategorized'.

    Tries label-family rules first, then title keywords. If both miss,
    returns 'uncategorized' — query time falls back to TF-IDF cosine.
    """
    by_label = classify_by_labels(labels)
    if by_label is not None:
        return by_label
    by_title = classify_by_title(title)
    if by_title is not None:
        return by_title
    return Classification(
        bucket="uncategorized",
        match_quality="title_similarity_only",
        matched_signal="none",
    )


# Public list — useful for downstream tools that need to enumerate buckets.
ALL_BUCKETS: tuple[Bucket, ...] = (
    "auth",
    "data-migration",
    "ui-component",
    "ui-page",
    "worker-endpoint",
    "infra-config",
    "content-edit",
    "refactor-cleanup",
    "uncategorized",
)
