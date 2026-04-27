---
sidebar:
  order: 0
---

# SMD Services

**Tagline:** Operations consulting for growing businesses, delivered at AI-native speed.

## What It Is

SMD Services is a solutions consulting venture under SMDurgan, LLC. We work alongside business owners to understand where they're trying to go, figure out what's slowing them down, and build the right solution together. Engagement length and pricing are scoped per project. This is a services business, not a SaaS product.

## The Problem It Solves

Owners of $750k-$5M revenue businesses are too big for one person and too small for a COO. They know their operations are broken but can't articulate the fix. Traditional consultancies start at $15-50k+ engagements with months-long timelines. Fractional CTOs/COOs commit them to ongoing cost without a bounded deliverable. EOS implementers force a single framework. Managed IT providers stop at the wire. Nobody else delivers assessment + implementation + handoff as bounded, scope-priced engagements.

## Solution Categories

Six categories cover the full delivery surface:

1. Process design
2. Custom internal tools
3. Systems integration
4. Operational visibility
5. Vendor/platform selection
6. AI & automation

A separate five-category observation taxonomy (`process_design`, `tool_systems`, `data_visibility`, `customer_pipeline`, `team_operations`) drives lead-gen signal extraction. The two layers are deliberately distinct — see [ADR 0001](https://github.com/venturecrane/ss-console/blob/main/docs/adr/0001-taxonomy-two-layer-model.md).

## Target Market

- **Geography:** Phoenix metro, in-person default for Phase 1 (first 5 clients). Remote-capable after.
- **Revenue band:** $750k-$5M, expanding to $10M.
- **Buyer:** the owner. Sometimes the office manager fields the call, but the owner writes the check.

## Positioning

The client is the hero, we are the guide. Collaborative, objectives-first. Enterprise operational discipline applied to businesses that have never had access to it, delivered at speed and pricing that works for their stage. AI & automation is a named capability, not a brand veneer — we do AI work when AI is the right answer and say so plainly.

## Pricing Model

- **Internal rate ladder:** $175/hr at launch → $200/hr after first case study → $250/hr → $300/hr with volume.
- **Engagement range:** scoped per project. Smallest engagements (targeted automation scripts, AI pilots) start around $2,500. Largest engagements have no fixed ceiling.
- **Paid Assessment:** $250, applied toward engagement if they proceed. First 3 free.
- **Retainer (post-delivery):** $200-500/mo for ongoing support and optimization.
- **No dollar amounts published externally.**

## Tech Stack

- **Site/app:** Astro SSR on Cloudflare Workers + Static Assets (single Worker `ss-web`, three subdomains: apex marketing, `admin.smd.services` admin console, `portal.smd.services` client portal).
- **Workflow Worker:** `ss-scan-workflow` — durable orchestration for the /scan diagnostic via Cloudflare Workflows.
- **Data layer:** D1.
- **Email:** Resend (transactional + outbound + inbound).
- **Auth:** session cookies per-host (admin/portal isolation).
- **Domain:** smd.services.

## Status

Pre-launch. Engine 1 (free AI diagnostic at /scan) shipped 2026-04-27, production-deployed but unverified happy-path pending Worker secret provisioning. No clients signed yet. First 5 in-person Phoenix engagements are the immediate goal.

## Links

- **Repo:** [venturecrane/ss-console](https://github.com/venturecrane/ss-console)
- **Site:** [smd.services](https://smd.services)
- **Decision Stack:** `docs/adr/decision-stack.md` (29 locked decisions across 6 layers)
