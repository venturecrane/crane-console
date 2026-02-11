# Enterprise Venture Summaries

Executive summaries for every venture in the SMDurgan, LLC portfolio. These are the canonical source of enterprise context — synced to D1 and served to agents via the `/sod` API.

## Portfolio

| Venture                                        | Stage       | Summary                                               |
| ---------------------------------------------- | ----------- | ----------------------------------------------------- |
| [SMDurgan, LLC](smd-enterprise-summary.md)     | —           | Portfolio overview, infrastructure model, methodology |
| [Venture Crane](vc-executive-summary.md)       | Operating   | Shared infrastructure and multi-agent orchestration   |
| [Kid Expenses](ke-executive-summary.md)        | Beta        | Co-parent expense tracking                            |
| [Silicon Crane](sc-executive-summary.md)       | Design      | Validation-as-a-service                               |
| [Durgan Field Guide](dfg-executive-summary.md) | Market Test | Auction intelligence                                  |
| [Draft Crane](dc-executive-summary.md)         | Design      | Nonfiction book writing with AI assistance            |

## Updating

Edit the markdown file and push to `main`. The GitHub Actions workflow automatically syncs changes to D1. Agents pick up updates on their next `/sod`.

## Staleness

Doc audit flags summaries older than 90 days. These are hand-written (`auto_generate: false`) — review quarterly.
