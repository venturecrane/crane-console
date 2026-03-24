---
sidebar:
  order: 3
---

# Metrics & KPIs

## North Star Metric

Ventures supported without session initialization failures.

## Operational Metrics

| Metric                  | Current | Target | Notes                        |
| ----------------------- | ------- | ------ | ---------------------------- |
| Ventures supported      | 5       | —      | vc, ke, sc, dfg, dc          |
| Fleet machines          | 5       | —      | 2 macOS, 3 Linux             |
| Agent sessions (weekly) | —       | —      | Tracked in crane-context D1  |
| Handoff success rate    | —       | 100%   | Session → handoff completion |
| API uptime              | —       | 99.9%  | crane-context worker         |

## Infrastructure Cost

| Category   | Monthly   | Notes                         |
| ---------- | --------- | ----------------------------- |
| Cloudflare | $0        | Free tier (Workers, D1, R2)   |
| Vercel     | $0        | Hobby tier                    |
| Infisical  | $0        | Free tier                     |
| GitHub     | $0        | Free org                      |
| Tailscale  | $0        | Personal plan                 |
| AI APIs    | ~$200     | Claude, Gemini, OpenAI        |
| **Total**  | **~$200** | Amortized across all ventures |
