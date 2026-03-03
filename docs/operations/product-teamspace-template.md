# Product Teamspace Template

Standard structure for each product venture's documentation.

## When to Create a Product Teamspace

- Product graduates from Market Test with a Go decision
- Needs dedicated documentation separate from Venture Crane experiments
- Approaching first paying customer
- Complexity warrants separation from the development lab

## Standard Structure

Each product venture contains:

### 1. Product Overview

- What it is
- Target market
- Value proposition
- Revenue model
- Current stage and next milestone

### 2. Roadmap

- Current sprint / focus
- Near-term priorities
- Future vision
- Completed milestones
- Dependencies on other entities

### 3. Metrics & KPIs

- North star metric
- Leading indicators
- Financial metrics
- Tracking cadence

### 4. Customer Feedback

- Feedback log
- Feature requests
- User interview notes

### 5. Documentation

- User-facing docs
- Technical docs
- Internal docs (decisions, experiments, lessons)

---

## Lifecycle Events

### New Product Spin-up

1. Create venture directory under `docs/ventures/{code}/`
2. Create standard markdown files using this template
3. Link from `crane_doc('global', 'product-portfolio.md')`

### Archive (Kill Decision)

1. Update status to ARCHIVED in Product Overview
2. Document lessons in Venture Crane experiments
3. Remove venture directory from `docs/ventures/`
4. Remove from Product Portfolio active list

### Sale/Handoff

1. Export/transfer critical documents
2. Update ownership in Product Portfolio
3. Archive after transition complete

---

## Naming Conventions

- Repos: `{venture-code}-console` (e.g., `dfg-console`, `sc-console`)
- Workers: `crane-{function}` for shared, `{venture-code}-{function}` for venture-specific
- Domains: Product-specific TLDs
