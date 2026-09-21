---
sidebar:
  order: 1
---

# SMD Services - Roadmap

> Refreshed 2026-09-21. The venture handbook (`venturecrane/ss-console` `docs/handbook/roadmap.md`)
> and the Decision Stack are the source of truth; this page mirrors them for cross-venture context.

## Current Milestone

**Launched; prove the Operator on its first client and convert that proof into the next clients.** The first Operator client (a personal-injury law firm) started its paid Service on 2026-09-15, and Smokeball approved SMD's production integration on 2026-09-21 (UTC). The objective remains profitability.

## Active Work

| Track                                 | State                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Operator delivery on the first client | Live. Routines run on request by the client's authored intent (nothing on a timer). Medical-chronology routine metered in pages against a billing-cycle allowance. |
| Change requests                       | Handled under service agreement section 2.7: trial, measure cost, then propose written terms. First batch (drafted legal documents) in its measurement phase.      |
| Production Smokeball scopes           | Newly approved scopes need to be confirmed as reaching the client's existing production grant.                                                                     |
| Operator hardening                    | Oversight plane, work-liveness and connector-outage alerting, vendor tool-surface drift detection, sticky-stop, obligation register (ADR 0088).                    |
| Acquisition                           | Referral cultivation in the Phoenix network plus a guarded paid-acquisition round (ADR 0066). Automated lead-gen machine retired (ADR 0060).                       |
| Hosted Agent SKU                      | Self-serve subscription published at `/agent` (ADR 0067).                                                                                                          |

## Planned Work

- Turn the law-firm engagement into the repeatable law vertical pack and a second Operator client.
- Price the first change request from the firm's measured historical volume, not from three requests.
- Close every open client obligation in the register (standing target: zero).
- Scope-based consulting engagements alongside the Operator.

## Recent Completions (2026-07 to 2026-09)

- **2026-09-21** Smokeball production integration approved by the vendor.
- **2026-09-17** Obligation register: every piece of work owed to a client, imported from the systems that already know (ADR 0088).
- **2026-09-15** First Operator client's paid Service started in the portal.
- **2026-09-14** Real proof on the marketing site: first case study, PI-led law pack, truthful pricing line.
- **2026-09-10** Operator retainer collected on a per-client authored payment rail (card carries its fee line).
- **2026-09-09** Portal billing rebuilt as a ledger with its own Operator subscription page and start door.
- **2026-08-29 to 09-17** Medical-chronology pipeline brought on-seat: in-process stages, enforced gates, rehearsal mode, email request path for administrators, covered-record deliveries.
- **2026-07** Operator launch pricing locked (ADR 0063), cost plane (ADR 0062), service commitments and offboarding (ADR 0064, 0065), engagements-repo split for client material (ADR 0081).

## Constraints

- **Anti-fabrication is P0.** No invented client-facing content; Pattern A / Pattern B are merge-gated.
- **No dollar amounts published externally**, except the Hosted Agent page (page-scoped exemption).
- **No fixed timeframes in marketing copy.** Signed contracts keep their authored terms.
- **Client material stays private** in `venturecrane/engagements`; ss-console and crane-console are public.
- **Done means the client can do it:** a feature is complete when a real client performs the act on their deployment, proven by observation of the running system.
