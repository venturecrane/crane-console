---
sidebar:
  order: 2
---

# SMD Services - Metrics

> Refreshed 2026-09-21. Figures that are client-specific or internal pricing live in the private
> `venturecrane/engagements` repo and in D1; this page names what is measured and where.

## Stage

**Launched, first client.** One paid Operator client (Service started 2026-09-15). The measures that matter now are whether the Operator delivers reliably, what each routine costs to run, and whether proof turns into the next client.

## Business

| Metric                                               | Where it lives                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| Operator MRR and stand-up fees                       | Stripe + portal billing ledger (D1 `invoices`, subscriptions)      |
| Active Operator seats                                | `operator/customers/*/customer.yaml` (non-template, non-SMD seats) |
| Consulting engagements active / signed               | quotes + SignWell SOW pipeline                                     |
| Hosted Agent subscriptions                           | Stripe (founding-seat coupon capped at 25 redemptions)             |
| Pipeline: assessments booked, proposals sent, closes | admin console (leads, meetings, quotes)                            |

## Operator Economics (ADR 0062)

| Metric                                                         | Threshold                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Seat COGS as a share of MRR                                    | Kill criterion: above 40% for two consecutive months                                |
| Metered routine cost (e.g. chronology pages per billing cycle) | Against the client's authored allowance; overruns quoted before they start          |
| Change-request cost per instance                               | Measured during the trial before terms are proposed (service agreement section 2.7) |

## Operator Reliability

| Signal                                | Source                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------- |
| Seat liveness and stuck work          | Work-liveness monitoring (ADR 0079), `fleet_alert_state`                  |
| Connector outages                     | Connector-outage alerting (ADR 0080)                                      |
| Sticky-stop state (OK / HARD_STOP)    | Seat heartbeat; pager fires within minutes of a stop                      |
| Vendor tool-surface drift             | Seat sweep of registered vs classified MCP tools                          |
| Unaudited sends, terminal-state drift | Automated reconcilers (issues filed are alerts, not backlog)              |
| Open client obligations               | Obligation register (ADR 0088): `.claude/bin/register list`. Target: zero |

## Health Signals (weekly)

- Did every client request the Operator received get a delivered result or a stated refusal?
- Is any seat HARD_STOPPED, and for how long?
- Is seat COGS trending toward the 40% line?
- Are any obligations aging without a date?
- Is at least one referral or prospect conversation moving toward a second client?
- Render and send quality: any fabricated client-facing content is a P0.
