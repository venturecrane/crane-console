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

## The Operator Platform

The delivery mechanism is an AI operator - an always-on agent that handles inbound client communications, executes consulting work, and routes to the Captain only when a decision is required.

### Delivery Channels

| Channel                 | Mechanism                              | Status |
| ----------------------- | -------------------------------------- | ------ |
| Inbound email           | `crane@smd.services`, allow-list gated | Live   |
| Outbound email          | Gmail push notifications, event-driven | Live   |
| Voice                   | Synthesis backend, transform hook      | Live   |
| Conversational sessions | MCP channel, Clerk auth, multi-turn    | Live   |

### Intelligence Layer

| Capability              | Description                                                            |
| ----------------------- | ---------------------------------------------------------------------- |
| Two-tier model          | Default Sonnet for routine work, Opus escalation for complex reasoning |
| Learned preferences     | Per-client preferences stored and applied across sessions              |
| Fleet health monitoring | 30-minute cron checks platform liveness, alerts Captain on degradation |
| Overlay drift detection | Admin lane surfaces machines running stale overlay versions            |

The operator handles volume. The Captain handles decisions. Clients get a consistently responsive, never-distracted consultant that improves with every engagement.

## Operator Model

### Captain's Domain

- Engagement acceptance (allow-list controls who reaches the operator)
- Scope and pricing decisions on new engagements
- Escalated decisions when the operator routes up
- Go/Kill on active engagements
- Platform direction and capability additions

### Agent Execution

- Operator platform handles all inbound client communications (email, voice, chat)
- Consulting analysis and deliverable drafting executed by agents
- Fleet health monitoring runs autonomously on a 30-minute cadence
- Platform maintenance and deployment handled via PRs

### The System

The franchise prototype is the operator platform itself - a documented, deployable AI operator that any new Captain can step into and direct. The Captain sets client criteria and engagement guardrails; the operator handles throughput. A new Captain inherits a running operation, not a blank slate.

## Tech Stack

- **Site/app:** Astro SSR on Cloudflare Workers + Static Assets (single Worker `ss-web`, three subdomains: apex marketing, `admin.smd.services` admin console, `portal.smd.services` client portal).
- **Workflow Worker:** `ss-scan-workflow` - durable orchestration for the /scan diagnostic via Cloudflare Workflows.
- **Data layer:** D1.
- **Email:** Resend (transactional + outbound + inbound) + Gmail push notifications.
- **Auth:** session cookies per-host (admin/portal isolation), Clerk for MCP channel.
- **Domain:** smd.services.

## Status

Pre-launch. Engine 1 (free AI diagnostic at /scan) shipped 2026-04-27, production-deployed but unverified happy-path pending Worker secret provisioning. No clients signed yet. First 5 in-person Phoenix engagements are the immediate goal.

## Links

- **Repo:** [venturecrane/ss-console](https://github.com/venturecrane/ss-console)
- **Site:** [smd.services](https://smd.services)
- **Decision Stack:** `docs/adr/decision-stack.md` (29 locked decisions across 6 layers)
