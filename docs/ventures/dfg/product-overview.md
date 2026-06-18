---
sidebar:
  order: 0
---

# Durgan Field Guide

## What It Is

An AI-powered toolkit for buying and flipping physical goods at auction - helping operators make disciplined acquisition decisions and maximize flip margins.

## Target Market

**Primary:** Side-hustlers and small operators buying/flipping trailers, light equipment, and vehicles
**Secondary:** Small business owners making capital equipment decisions

## Value Proposition

Replace gut-feel bidding with structured evaluation:

- Conservative cost modeling (low/base/high ranges)
- Comp-based valuation with confidence ratings
- Deal-killer detection before wasting time
- Discipline enforcement: walk triggers, max bids, margin thresholds

## Core Capabilities

| Phase    | Tools                                          |
| -------- | ---------------------------------------------- |
| Scout    | Buy-box filtering, Scout Tuning                |
| Evaluate | Lot Analysis, Comp Sourcing, Transport Costing |
| Acquire  | Bidding Playbook                               |
| Inspect  | Inspection Runbook, Repair Bounds              |
| Sell     | Demand Test, Listing Kit                       |
| Learn    | Deal Postmortem                                |

## Revenue Model

| Stream        | Type      | Status  |
| ------------- | --------- | ------- |
| Flip profits  | Variable  | Active  |
| Subscriptions | Recurring | Planned |

## Current Stage

**Prototype**
Next Milestone: TBD

## Operator Model

### Captain's Domain

- Final bid decision on any acquisition (the Captain pulls the trigger)
- Buy-box criteria: what categories, geographies, and price ranges to target
- Kill decisions when a deal fails inspection
- Learning Ledger review: did the system give the right answer?

### Agent Execution

- Scout pipeline: filtering lots against buy-box criteria
- Evaluation: lot analysis, comp sourcing, transport costing, deal-killer detection
- Acquisition: bidding playbook execution within Captain-approved parameters
- Inspection runbook execution and repair bounds calculation
- Listing generation and demand testing
- Deal postmortem capture

### The System

The franchise prototype is the disciplined evaluation pipeline - Scout to Postmortem, documented and agent-executable. The Captain makes the go/no-go call on each deal; agents do the analysis and enforce the discipline. A new Captain inherits a methodology that prevents the cognitive biases (sunk cost, FOMO, optimism bias) that kill most flippers - not just a set of tools.

## Key Principles

1. Conservative by default - assume costs higher, values lower
2. Deal killers first - check fatal flaws before investing analysis time
3. Discipline over opportunity - pass on marginal, wait for strong
4. Demand proves value - test market before committing
5. Learn from every deal - win or lose, capture the lesson

## Recent Activity

<!-- docs-refresh:activity-shipped -->

- #293 landing + waitlist + Clerk migration (NextAuth removed) _(2026-04-24)_
- #329 adopt enriched canonical PR template (#775 follow-up) _(2026-05-01)_
- #328 adopt canonical AC-tick workflow callers (#775 cascade) _(2026-05-01)_
- #289 migrate @venturecrane/\* harness to GitHub Packages registry _(2026-04-20)_
- #320 add CI job + convert tests to vitest _(2026-04-27)_
<!-- /docs-refresh:activity-shipped -->
