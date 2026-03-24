---
sidebar:
  order: 4
---

# Roadmap

**Current Stage:** Operating
**Focus:** Platform reliability and cross-venture visibility

## Current Focus

- Notifications pipeline (CI/CD events from GitHub and Vercel)
- Fleet dispatch validation at scale
- VCMS quality and curation
- Enterprise documentation site (this site)

## Near-Term

| Initiative                | Status      | Notes                               |
| ------------------------- | ----------- | ----------------------------------- |
| Notifications pipeline    | In progress | GitHub + Vercel webhook processing  |
| Fleet reliability scoring | In progress | Dispatch decision framework         |
| Enterprise docs site      | In progress | Content population and automation   |
| Calendar integration      | PR open     | Session tracking in Google Calendar |

## Completed (Recent)

| Initiative                  | Completed | Notes                                   |
| --------------------------- | --------- | --------------------------------------- |
| Notion → Markdown migration | 2026-03   | PR #300, eliminated Notion dependency   |
| Staging environment         | 2026-02   | Full staging pipeline for crane-context |
| Design system specs         | 2026-03   | Per-venture design tokens and specs     |

## Infrastructure Principles

- Shared infrastructure amortizes across the portfolio
- Every build must serve future products - no one-off solutions
- Observable by design - every asset emits data
