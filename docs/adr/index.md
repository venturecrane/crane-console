---
title: 'Decisions'
sidebar:
  order: 0
---

# Architecture Decision Records

ADRs are immutable records of significant technical decisions. They capture the context, alternatives considered, and consequences of architectural choices that shape Venture Crane infrastructure.

## Current Records

- **[025: Crane Context Worker](025-crane-context-worker.md)** - Structured session tracking and typed handoffs via Cloudflare Worker + D1
- **[026: Environment Strategy](026-environment-strategy.md)** - Staging/production split using Cloudflare native environments

## What ADRs Are

Architecture Decision Records document decisions that are hard to reverse and affect multiple ventures or the core platform. They provide historical context for why systems are designed the way they are.

Each ADR includes:

- The context and problem being solved
- The decision and its rationale
- Alternatives considered and why they were rejected
- Consequences (positive, negative, and neutral)

## Proposing New ADRs

When facing a significant architectural choice:

1. Draft the ADR following the format of existing records
2. Include context, alternatives, and trade-offs
3. Get review from the Captain and relevant stakeholders
4. Merge as committed once approved

ADRs are numbered sequentially (025, 026, etc.) and stored in this directory.
