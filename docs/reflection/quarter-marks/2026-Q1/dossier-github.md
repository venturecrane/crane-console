# Dossier: GitHub History

Window: 2026-01-13 to 2026-05-09 (~16 weeks)

## Per-Repo Summary

| Repo              | PRs merged | Median TTM (d) | p90 TTM (d) | Issues opened | Issues closed | Dependabot open today |
| ----------------- | ---------- | -------------- | ----------- | ------------- | ------------- | --------------------- |
| crane-console     | 198        | 0.00           | 13.91       | 378           | 307           | 10                    |
| crane-foundations | 0          | —              | —           | 0             | 0             | 0                     |
| smd-console       | 17         | 0.01           | 11.63       | 4             | 3             | 3                     |
| sc-console        | 49         | 0.04           | 13.41       | 64            | 26            | 6                     |
| vc-web            | 92         | 0.00           | 0.36        | 31            | 21            | 5                     |
| dc-console        | 200        | 0.00           | 0.07        | 281           | 261           | 9                     |
| ke-console        | 101        | 0.00           | 13.68       | 120           | 73            | 1                     |
| ss-console        | 197        | 0.00           | 0.03        | 321           | 243           | 0                     |
| crane-mcp         | 0          | —              | —           | 1             | 1             | 10                    |
| dfg-console       | 51         | 0.01           | 0.24        | 67            | 38            | 0                     |
| dc-marketing      | 2          | 0.00           | 0.00        | 1             | 0             | 0                     |
| venture-template  | 0          | —              | —           | 0             | 0             | 0                     |
| crane-relay       | 0          | —              | —           | 0             | 0             | 0                     |

## Top Reviewers

| Repo              | #1 reviewer / count | #2 / count | #3 / count |
| ----------------- | ------------------- | ---------- | ---------- |
| crane-console     | —                   | —          | —          |
| crane-foundations | —                   | —          | —          |
| smd-console       | —                   | —          | —          |
| sc-console        | —                   | —          | —          |
| vc-web            | —                   | —          | —          |
| dc-console        | SMDurgan / 2        | —          | —          |
| ke-console        | —                   | —          | —          |
| ss-console        | —                   | —          | —          |
| crane-mcp         | —                   | —          | —          |
| dfg-console       | —                   | —          | —          |
| dc-marketing      | —                   | —          | —          |
| venture-template  | —                   | —          | —          |
| crane-relay       | —                   | —          | —          |

Note: Virtually all PRs have zero formal reviews recorded in the API. This is consistent with an AI-agent-driven operation where the author merges directly. The sole exception is dc-console with 2 SMDurgan reviews.

## Top 5 Largest PRs by File Count

| Repo          | PR # | Title                                                                                           | Files changed | Merged date |
| ------------- | ---- | ----------------------------------------------------------------------------------------------- | ------------- | ----------- |
| dc-console    | #433 | chore: standardize Prettier configuration to enterprise standard                                | 256           | 2026-03-03  |
| ss-console    | #722 | feat(eslint): adopt Venture Crane portfolio coding standard                                     | 190           | 2026-05-07  |
| crane-console | #868 | feat(eslint): adopt portfolio coding standard in crane-console + refactor structural violations | 171           | 2026-05-07  |
| ke-console    | #246 | chore: gitignore launcher-mirrored skill triplet                                                | 127           | 2026-05-06  |
| ss-console    | #453 | feat(design): retire Stitch; rename .stitch to .design                                          | 102           | 2026-04-18  |

## Aggregate Totals

- Total PRs merged across portfolio: 907
- Total issues opened: 1,268
- Total issues closed: 973
- Open Dependabot PRs across portfolio: 44

## Data Sources Used

- `gh repo list venturecrane --json name --limit 30 --jq '.[].name'` for repo enumeration
- `gh pr list --repo <org>/<repo> --state merged --limit 200 --json number,title,mergedAt,createdAt,changedFiles,author,reviews` for per-repo PR data; TTM computed as `(mergedAt - createdAt)` in days; filtered to window 2026-01-13 to 2026-05-09
- `gh api repos/<org>/<repo>/issues?state=all&since=2026-01-13T00:00:00Z&per_page=100 --paginate` for issue counts; PRs excluded by presence of `pull_request` field; opened/closed counted against window timestamps
- `gh pr list --repo <org>/<repo> --state open --author app/dependabot --limit 100 --json number` for open Dependabot PR counts as of today
- dfg-console fetched from `durganfieldguide` org; all others from `venturecrane` org
- No rate-limit errors encountered. crane-relay, venture-template, crane-mcp, and crane-foundations had no merged PR activity in window.
