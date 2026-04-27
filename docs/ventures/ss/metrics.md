---
sidebar:
  order: 2
---

# SMD Services - Metrics

## Stage

**Pre-revenue, Phase 1A.** Lead-gen and Engine 1 just shipped. No clients signed. Metrics below are the instrumentation targets and operating thresholds — not historical performance.

## Phase 1A Exit Gate

| Metric                              | Target                      |
| ----------------------------------- | --------------------------- |
| Monthly run-rate                    | $10k/mo sustained 2+ months |
| Equivalent at launch rate ($175/hr) | ~57 billable hours/month    |
| Equivalent at next-tier ($200/hr)   | ~75 billable hours/month    |

Hitting the gate triggers Phase 1B: rate ladder advances, premium tooling stack unlocks, case study → outbound loop.

## Pipeline Funnel (instrumented, awaiting volume)

| Stage         | Metric                                               | Source                                                     |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| Top of funnel | /scan submissions/week                               | `scan_requests` table                                      |
|               | Outbound emails sent/week                            | `outreach_events`                                          |
| Engagement    | /scan completion rate (submitted → report delivered) | `scan_requests.workflow_run_id` non-null + email delivered |
|               | Magic-link click-through rate                        | scan_requests verification join                            |
|               | Reply rate on cold outbound                          | reply parser (blocked)                                     |
| Conversion    | Assessment-call booking rate                         | meetings DAL                                               |
|               | Assessment → engagement signed                       | quotes/SOW pipeline                                        |
|               | First-3-free vs paid assessment ratio                | quotes payment status                                      |
| Delivery      | Engagements active                                   | engagements DAL                                            |
|               | Avg engagement size ($)                              | quote totals                                               |
|               | Avg engagement duration (signed → handoff)           | engagement timestamps                                      |
| Retention     | Retainer attach rate                                 | post-delivery retainer signups                             |
|               | Retainer MRR                                         | retainer billing                                           |

## Engine 1 Diagnostic Health (instrumented)

| Metric                              | Threshold                         |
| ----------------------------------- | --------------------------------- |
| Cost per scan (median)              | ≤ $0.14                           |
| Cost per scan (P95)                 | ≤ $0.27                           |
| Workflow success rate               | ≥ 95%                             |
| Render quality issues per 100 scans | 0 (anti-fabrication is hard rule) |

## Lead-Gen Conversion Reference

From `docs/strategy/lead-gen-pipeline-math-2026-04-25.md`:

| Channel                                         | Conversion Multiplier vs Cold |
| ----------------------------------------------- | ----------------------------- |
| Cold outbound                                   | 1× (baseline)                 |
| Warm referral (steady-state, with social proof) | ~54×                          |

The warm multiplier is the strategic driver of Engine 3 (referral-partner cultivation) — the math says it's worth the slower ramp.

## Operating Cost Ceiling

| Phase                | Monthly Cap | Notes                                                                     |
| -------------------- | ----------- | ------------------------------------------------------------------------- |
| Phase 1A             | ~$20/mo     | Resend free tier, Cloudflare Workers paid plan, D1, Anthropic API metered |
| Phase 1B (post-gate) | ~$200/mo    | Premium tooling unlocked once $10k/mo run-rate clears                     |

## Health Signals (qualitative, weekly review)

- Are inbound /scan submissions trending up week-over-week?
- Is the assessment-booking rate from /scan above outbound-cold baseline?
- Is at least one referral-partner conversation happening per week?
- Are render quality issues at zero? (Hard pass/fail — any anti-fab violation is P0.)
