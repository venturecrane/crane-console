# Operating Principles

How the development lab operates.

## Core Philosophy

**Build the machine that builds products.**

Venture Crane is not a product - it's the methodology and infrastructure for creating, validating, and scaling products. Every venture (Durgan Field Guide, Silicon Crane, Kid Expenses, Draft Crane, and future ventures) runs on Venture Crane rails.

---

## Operating Principles

### 1. Demand is the Compass

Every decision starts with "does anyone want this?" - not "can we build this?" Technical capability without market demand is waste.

### 2. Cash Velocity Over Theoretical Upside

Prefer smaller, faster wins over bigger, slower bets. A $1K flip today beats a $10K opportunity that might close in 6 months.

### 3. Buy-Box Discipline First

Define what we will and won't do before opportunities appear. Discipline at intake prevents waste downstream.

### 4. Kill Fast

Don't prop up failing ventures with good-venture profits. Dead ideas should stay dead. Archive and move on.

### 5. Self-Funding Preferred

Ventures should fund themselves via operations. External capital is a last resort, not a first move.

### 6. Reusable Always

Every build must serve future products. No one-off solutions. Shared infrastructure amortizes across the portfolio.

### 7. Observable by Design

Every asset emits data. If we can't measure it, we can't improve it.

---

## Product Lifecycle

| Stage       | Description                  | Decision Gate                |
| ----------- | ---------------------------- | ---------------------------- |
| Idea        | Concept being explored       | Worth testing?               |
| Design      | Problem/solution defined     | Testable hypothesis?         |
| Prototype   | MVP in development           | Ready for real users?        |
| Market Test | Testing with real users      | Go / Kill / Pivot?           |
| Launch      | Live and acquiring customers | Sustainable unit economics?  |
| Growth      | Scaling operations           | Capital allocation priority? |
| Mature      | Optimizing profitability     | Continue / Sell / Sunset?    |
| Exit        | Winding down or selling      | Clean handoff?               |

---

## Resource Allocation

### Priority Order

1. Revenue-generating activities
2. Experiments that inform Go/Kill decisions
3. Infrastructure that serves multiple products
4. Speculative exploration (only if runway allows)

### Time Allocation

- Active products get the majority of time
- Paused products get zero time until reactivated
- New ideas earn time by passing initial validation

---

## Quality Standards

### Engineering

- Loose coupling, single responsibility
- Configuration over code
- Refactor in atomic commits (don't mix naming + logic + architecture)
- Worker hardening patterns for all Cloudflare Workers

### Analysis

- Explainable math only
- Conservative estimates
- Show inputs/outputs
- No hand-wavy claims

### Documentation

- Living documents over stale specs
- Decisions and rationale captured
- Next actions always clear
