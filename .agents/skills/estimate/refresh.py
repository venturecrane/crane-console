#!/usr/bin/env python3
"""
Corpus refresh for /estimate.

Iterates the active repos in `config/ventures.json`, fetches closed issues
within a date window, joins each issue with its closing PR's commit
timestamps, classifies via taxonomy.py, and writes a derivative corpus to
`.agents/skills/estimate/corpus.json` (+ a sibling `corpus.meta.json`).

Usage:
    python3 .agents/skills/estimate/refresh.py [options]

Options:
    --days N             Window in days. Default: 90.
    --repos R1,R2        Comma-separated explicit repo list (e.g.
                         'venturecrane/crane-console,venturecrane/sc-console').
                         Default: every active repo in config/ventures.json.
    --limit-per-repo N   Cap issues fetched per repo (testing). Default:
                         no cap (gh's own --limit 1000).
    --out PATH           Override output corpus.json path.
    --dry-run            Print what would be written; don't write.

The corpus is derivative — every record is reconstructable from GitHub
data. Stale-detection happens at query time via corpus.meta.json.

Refresh is manual + weekly by design. Auto-refresh would CI-merge
misclassified buckets into every future estimate.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import os
import re
import subprocess
import sys
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

# Ensure sibling modules are importable when invoked from repo root.
_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from scoring import CorpusRecord  # noqa: E402
from taxonomy import classify  # noqa: E402

REPO_ROOT = _HERE.parent.parent.parent  # .agents/skills/estimate -> repo root
DEFAULT_OUT = _HERE / "corpus.json"
DEFAULT_META = _HERE / "corpus.meta.json"
DEFAULT_DAYS = 90


# ---------------------------------------------------------------------------
# gh CLI helpers
# ---------------------------------------------------------------------------


def _run(cmd: list[str], *, check: bool = True) -> str:
    """Run a subprocess, return stdout. Surfaces stderr in exceptions."""
    result = subprocess.run(cmd, capture_output=True, text=True)
    if check and result.returncode != 0:
        raise RuntimeError(
            f"command failed: {' '.join(cmd)}\nstderr: {result.stderr.strip()}"
        )
    return result.stdout


def fetch_closed_issues(repo: str, since: datetime, limit: int | None) -> list[dict[str, Any]]:
    """
    Fetch closed issues from `repo` closed since `since`. Excludes PRs via
    `is:issue` in the search query.
    """
    since_iso = since.strftime("%Y-%m-%d")
    search = f"is:issue is:closed closed:>={since_iso}"
    cmd = [
        "gh",
        "issue",
        "list",
        "--repo",
        repo,
        "--search",
        search,
        "--limit",
        str(limit if limit is not None else 1000),
        "--json",
        "number,title,createdAt,closedAt,labels,closedByPullRequestsReferences,state",
    ]
    raw = _run(cmd)
    try:
        data = json.loads(raw or "[]")
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"failed to parse gh output for {repo}: {exc}") from exc
    return [issue for issue in data if issue.get("state") == "CLOSED"]


def fetch_pr_commits(repo: str, pr_number: int) -> dict[str, Any] | None:
    """
    Fetch a PR's merge timestamp and commit timestamps. Returns None on
    failure (we'd rather skip a record than crash the run).
    """
    cmd = [
        "gh",
        "pr",
        "view",
        str(pr_number),
        "--repo",
        repo,
        "--json",
        "mergedAt,commits,number",
    ]
    try:
        raw = _run(cmd, check=False)
        if not raw:
            return None
        return json.loads(raw)
    except (RuntimeError, json.JSONDecodeError):
        return None


# ---------------------------------------------------------------------------
# Time math
# ---------------------------------------------------------------------------


def _parse(ts: str) -> datetime:
    if ts.endswith("Z"):
        ts = ts[:-1] + "+00:00"
    return datetime.fromisoformat(ts).astimezone(timezone.utc)


def _minutes_between(a: str, b: str) -> int:
    """Whole minutes between two ISO timestamps (a <= b assumed; clamped to 0)."""
    delta = _parse(b) - _parse(a)
    return max(0, int(delta.total_seconds() // 60))


def derive_execution_minutes(
    issue: dict[str, Any],
    pr_data: dict[str, Any] | None,
) -> tuple[int, str, int | None, int]:
    """
    Returns (execution_minutes, execution_quality, closing_pr_number, n_commits).

    Preferred signal: PR-commit-span. execution_minutes =
        merged_at - max(first_commit_at, issue_opened_at)
    capped at wallclock duration.

    Falls back to wallclock when no closing PR is available.
    """
    opened_at = issue["createdAt"]
    closed_at = issue["closedAt"]
    wallclock = _minutes_between(opened_at, closed_at)

    # Cap wallclock-only fallbacks at 480 minutes (8 hours). Without PR
    # data we have no signal for execution time other than calendar time;
    # a 15-hour open-to-close span almost always means the work was a few
    # minutes and the issue sat open. Capping is honest about the lack of
    # measurement rather than letting wallclock outliers poison the
    # percentile.
    WALLCLOCK_FALLBACK_CAP = 480

    if not pr_data:
        return min(wallclock, WALLCLOCK_FALLBACK_CAP), "estimated_from_wallclock", None, 0

    merged_at = pr_data.get("mergedAt")
    commits = pr_data.get("commits") or []
    if not merged_at or not commits:
        return (
            min(wallclock, WALLCLOCK_FALLBACK_CAP),
            "estimated_from_wallclock",
            pr_data.get("number"),
            0,
        )

    # First commit timestamp on the PR.
    commit_dates = []
    for c in commits:
        ts = c.get("committedDate") or c.get("authoredDate")
        if ts:
            commit_dates.append(ts)
    if not commit_dates:
        return wallclock, "estimated_from_wallclock", pr_data.get("number"), len(commits)

    first_commit_at = min(commit_dates, key=_parse)
    start = max(_parse(first_commit_at), _parse(opened_at))
    end = _parse(merged_at)
    execution = max(0, int((end - start).total_seconds() // 60))
    # Cap at wallclock — defensive for PRs that started before the issue
    # was opened on a long-running branch.
    execution = min(execution, wallclock) if wallclock > 0 else execution

    return execution, "measured", pr_data.get("number"), len(commits)


def is_blocked_external(wallclock: int, execution: int) -> bool:
    """
    Long calendar tail with sparse execution = blocked on external work.
    Threshold: wallclock/execution > 8.
    """
    return execution > 0 and (wallclock / execution) > 8


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def load_active_repos() -> list[str]:
    """Read config/ventures.json and return all repos with non-empty `repos`."""
    config_path = REPO_ROOT / "config" / "ventures.json"
    config = json.loads(config_path.read_text())
    repos: list[str] = []
    for venture in config.get("ventures", []):
        org = venture.get("org", "venturecrane")
        for repo in venture.get("repos", []):
            repos.append(f"{org}/{repo}")
    return repos


def build_record(
    issue: dict[str, Any],
    repo: str,
    pr_data: dict[str, Any] | None,
) -> CorpusRecord:
    title = issue.get("title", "") or ""
    label_names = [
        label.get("name", "")
        for label in issue.get("labels", [])
        if isinstance(label, dict)
    ]
    classification = classify(title=title, labels=label_names)

    execution, quality, pr_number, n_commits = derive_execution_minutes(issue, pr_data)
    wallclock = _minutes_between(issue["createdAt"], issue["closedAt"])

    return CorpusRecord(
        issue_number=int(issue["number"]),
        repo=repo,
        title=title,
        bucket=classification.bucket,
        closed_at=issue["closedAt"],
        opened_at=issue["createdAt"],
        wallclock_minutes=wallclock,
        execution_minutes=execution,
        execution_quality=quality,
        closing_pr_number=pr_number,
        n_commits=n_commits,
        blocked_external=is_blocked_external(wallclock, execution),
        labels=label_names,
    )


def build_corpus(
    repos: list[str],
    days: int,
    limit_per_repo: int | None,
    *,
    progress: bool = True,
) -> tuple[list[CorpusRecord], dict[str, Any]]:
    """Build the corpus from gh data. Returns (records, meta)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    records: list[CorpusRecord] = []
    issues_by_repo: dict[str, int] = {}
    skipped_no_pr = 0

    for i, repo in enumerate(repos, start=1):
        if progress:
            print(f"[{i}/{len(repos)}] {repo}: fetching closed issues...", file=sys.stderr)
        try:
            issues = fetch_closed_issues(repo, since=cutoff, limit=limit_per_repo)
        except RuntimeError as exc:
            print(f"  skipped (gh failed): {exc}", file=sys.stderr)
            issues = []

        issues_by_repo[repo] = len(issues)
        if progress and issues:
            print(f"  {len(issues)} issues; resolving closing PRs...", file=sys.stderr)

        for j, issue in enumerate(issues):
            pr_refs = issue.get("closedByPullRequestsReferences") or []
            pr_data = None
            if pr_refs:
                pr_number = pr_refs[0].get("number")
                if pr_number:
                    pr_data = fetch_pr_commits(repo, pr_number)
            else:
                skipped_no_pr += 1
            try:
                record = build_record(issue, repo, pr_data)
                records.append(record)
            except (KeyError, ValueError) as exc:
                print(f"  skipped #{issue.get('number')} ({exc})", file=sys.stderr)
            if progress and (j + 1) % 25 == 0:
                print(f"    ... {j + 1}/{len(issues)}", file=sys.stderr)

    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "n_records": len(records),
        "source_repos": repos,
        "source_window_days": days,
        "issues_by_repo": issues_by_repo,
        "issues_without_closing_pr": skipped_no_pr,
        "schema_version": 1,
    }
    return records, meta


def serialize_records(records: list[CorpusRecord]) -> list[dict[str, Any]]:
    return [asdict(r) for r in records]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS)
    parser.add_argument("--repos", default="", help="comma-separated org/repo list")
    parser.add_argument("--limit-per-repo", type=int, default=None)
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--meta-out", default=str(DEFAULT_META))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.repos.strip():
        repos = [r.strip() for r in args.repos.split(",") if r.strip()]
    else:
        repos = load_active_repos()

    if not repos:
        print("no repos to scan", file=sys.stderr)
        return 2

    print(f"scanning {len(repos)} repo(s) over {args.days} days...", file=sys.stderr)
    records, meta = build_corpus(
        repos=repos,
        days=args.days,
        limit_per_repo=args.limit_per_repo,
    )
    print(
        f"corpus: {len(records)} records "
        f"({meta['issues_without_closing_pr']} without closing PR)",
        file=sys.stderr,
    )

    if args.dry_run:
        # Print summary, don't write
        from collections import Counter

        bucket_counts = Counter(r.bucket for r in records)
        print("\nbucket distribution:")
        for bucket, count in sorted(bucket_counts.items(), key=lambda kv: -kv[1]):
            print(f"  {bucket:20s} {count}")
        print(f"\nwould write {args.out} and {args.meta_out}")
        return 0

    out_path = Path(args.out)
    meta_path = Path(args.meta_out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(serialize_records(records), indent=2) + "\n")
    meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    print(f"wrote {out_path}", file=sys.stderr)
    print(f"wrote {meta_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
