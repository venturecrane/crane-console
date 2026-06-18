---
sidebar:
  order: 0
---

# SMD Services

**Tagline:** The operator slot in your business, filled by AI.

## The Venture

SMD Services builds and deploys AI operators for businesses that need a capable coordinator without the cost and risk of a full-time hire. The venture is run by a single Captain directing a fleet of AI agents. Every client engagement is delivered by an AI operator configured to run on that firm's expertise.

## The Problem

Owners of $750k-$5M revenue businesses are too big for one person and too small for a COO. The work that stalls them - client communication, intake, assessment, documentation, follow-through - requires a capable coordinator. They need a hire.

But a capable hire at that function runs $60-80k/yr plus benefits, takes months to onboard, and exits with everything they learned. Traditional consulting engagements add cost without continuity. Fractional operators commit them to ongoing retainers without bounded deliverables.

The problem is not strategy. It is throughput - someone who shows up every day, knows the firm, does the work.

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

## The Operator Thesis

The operator competes with a hire, not software. The comparison is not "is this better than Salesforce" but "is this better than bringing on a full-time coordinator at $65k/yr."

The operator wins on four dimensions:

1. **Memory that compounds.** Every engagement, every client interaction, every preference correction becomes part of the operator's working knowledge of the firm. A human hire starts over at offboarding. The operator does not.
2. **Configurable autonomy.** What the operator can do autonomously - initiate, send, act - is configured per action class. The owner sets the ceiling; the operator stays under it.
3. **No context-switching cost.** The operator handles throughput. The Captain handles decisions. The owner handles the business.
4. **Enterprise discipline at SMB price.** The harness, guide, and memory layers that power the operator represent operational discipline most $750k-$5M businesses have never had access to.

The spine of every client conversation: "It runs on your firm's expertise and gets better at your firm every week."

## The Operator Platform

The delivery mechanism is an always-on AI operator - configured to the client, connected to the client's communication stack, governed by the Captain and the client's defined authority ceiling.

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

### Knowledge Composition

The operator's working knowledge of a client combines three lanes:

| Lane     | Source                                               | Persistence        |
| -------- | ---------------------------------------------------- | ------------------ |
| Authored | `customer.yaml` - relationships, context, guardrails | Captain-set        |
| Learned  | Per-client preferences corrected across sessions     | Grows over time    |
| Inferred | Patterns derived from engagement history             | Deferred (Phase 2) |

All three lanes compose at runtime into a single legible surface. The operator reads from them; it cannot write to the authored lane or raise its own authority ceiling.

### Autonomy Ceilings

What the operator can do is governed by two independent axes:

- **Initiation:** does the operator act without being prompted?
- **Exposure:** does the action cross an external boundary (send email, book meeting)?

Each action class has a configured ceiling. The operator refuses actions above its ceiling. The operator cannot grant itself new capabilities. Draft-for-review is one configuration option for external sends, not the default.

## Client Engagement Workflow

A typical engagement moves through four stages:

1. **Assessment.** A voice-capable operator conducts the intake interview. The operator captures findings and drafts the assessment report. The Captain reads and closes - the report is the X-ray; the judgment belongs to the human.
2. **Scoping.** The Captain defines engagement parameters, timeline, and price. The operator does not scope or price engagements.
3. **Delivery.** The operator handles client communication, documents progress, and surfaces blockers. Analysis and deliverable drafting are executed by agents. The Captain reviews before anything client-facing is sent.
4. **Handoff.** The operator generates the handoff package. Retainer clients stay in the operator's working loop; the operator continues handling ongoing communication and optimization.

The operator handles volume. The Captain reviews and decides. The client gets a consistently responsive, never-distracted firm that improves with every engagement.

## Operator Model

### Captain's Domain

The Captain governs the operator through the control plane - the single surface for all authority, configuration, and lifecycle decisions.

- **Client acceptance.** The allow-list controls which inbound contacts reach the operator. The Captain sets who gets in.
- **Authority delegation.** Per-domain switches control what the operator can do for each client: configuration authoring, connector access, runtime operations, memory/skill development, and observability. All domains are off by default; the Captain enables them explicitly.
- **Scope and pricing.** All engagement scope and pricing decisions belong to the Captain.
- **Escalation resolution.** When the operator hits a decision it cannot make, it routes to the Captain with a clear summary of the situation and what decision is needed.
- **Go/Kill on active engagements.** The Captain authorizes continuation, pause, or termination.
- **Operator development.** New capabilities, vertical packs, skill additions, and platform direction are Captain decisions.

### Agent Execution

- Operator platform handles all inbound client communications - email, voice, chat - within configured autonomy ceilings
- Assessment interviews conducted by operator; Captain owns read and close
- Consulting analysis and deliverable drafting executed by agents; Captain reviews before client-facing send
- Fleet health monitoring runs autonomously on a 30-minute cadence; Captain notified on degradation
- Platform maintenance and deployment handled via PRs
- Learned preferences accumulate automatically from each engagement; Captain can dismiss any memory (dismissal = physical delete)

### The System

The franchise prototype is the operator platform itself - the harness, guide, and memory stack that makes this transferable.

**The harness** is the control plane: a configured environment where the operator lives. It governs what the operator can do, who it can contact, and what decisions require escalation. A new operator in a new vertical gets a fresh harness with sensible defaults and a clear authority map.

**The guide** is the per-client authored layer (`customer.yaml`): the relationships, guardrails, and context a Captain loads before the operator touches a client. It is the institutional knowledge that survives operator restarts, model upgrades, and platform migrations.

**The memory** is the learned layer: per-client preferences, working patterns, and correction history that compound with each session. This is what makes the operator more valuable to a firm over time - and what a human hire cannot replicate on exit.

A new Captain stepping into this system inherits a running operation, not a blank slate. The harness defines the governance boundary. The guide contains the client context. The memory carries the history. The Captain directs from day one.

## Positioning

"We / our team" throughout - never "I / the consultant." The engagement is delivered by a team that runs on the Captain's direction. The operator is the team's throughput. The Captain is the judgment layer.

Client-facing positioning: collaborative, objectives-first, enterprise discipline applied at SMB price and speed. AI & automation is a named capability, not a brand veneer - used when it is the right answer, stated plainly.

## Pricing Model

- **Internal rate ladder:** $175/hr at launch → $200/hr after first case study → $250/hr → $300/hr with volume.
- **Engagement range:** scoped per project. Smallest engagements (targeted automation scripts, AI pilots) start around $2,500. Largest engagements have no fixed ceiling.
- **Paid Assessment:** $250, applied toward engagement if they proceed. First 3 free.
- **Retainer (post-delivery):** $200-500/mo for ongoing support and optimization.
- **No dollar amounts published externally.**

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
- **Decision Stack:** `docs/adr/decision-stack.md` (49 locked decisions across 6 layers)
