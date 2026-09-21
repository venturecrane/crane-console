---
sidebar:
  order: 0
---

# SMD Services

**Tagline:** Operations consulting for growing businesses, delivered by an AI-native team.

> Refreshed 2026-09-21. Source of truth for everything below is the venture handbook in
> `venturecrane/ss-console` (`docs/handbook/`, rendered at admin.smd.services/admin/playbook)
> and the Decision Stack (`docs/adr/decision-stack.md`). When they disagree with this page,
> they win.

## What It Is

SMD Services is a solutions consulting venture under SMDurgan, LLC. We work alongside owners of established, owner-led businesses to understand where they are trying to go, figure out what is in the way, and build the right solution together. It is a services business, not a SaaS product. A single Captain directs a fleet of AI agents that carry the throughput.

## Three Front Doors, One Firm

1. **Scope-based consulting.** Bounded engagements priced per project: assessment, solution design, implementation, training, handoff. Scope sets how heavy each phase is, never whether it happens.
2. **The Operator.** A productized flat-rate monthly retainer (ADR 0004, ADR 0063): a governed AI employee that works inside the client's real systems at coordinator-grade throughput. It competes with a hire, not with software. **Live in production with its first client, a personal-injury law firm** (Smokeball practice management, Microsoft 365 mail). The paid Service started 2026-09-15, after a pilot.
3. **The Hosted Agent.** A self-serve monthly subscription for an always-on personal Hermes agent on the Operator substrate (ADR 0067, Decision #51). The only SKU with a published price and self-serve checkout (`/agent`); provisioning stays concierge.

## Solution Categories (delivery taxonomy)

1. Process design
2. Custom internal tools
3. Systems integration
4. Operational visibility
5. Vendor/platform selection
6. AI & automation

The separate five-category observation taxonomy in `src/portal/assessments/extraction-schema.ts` is a different layer (ADR 0001). Do not change one when editing the other.

## Target Market

- **Buyer:** the owner of an established, owner-led business with real operational load and the ability to pay. Too big for one person to hold, too small for a COO.
- **No revenue-band gate.** The old "$750k-$5M" filter was retired (ADR 0003; Decision #2 superseded). Qualification happens in conversation.
- **Geography:** Phoenix metro, in-person default for the first engagements; remote-capable.
- **Verticals:** home services, professional services (law is the lead vertical pack), contractor/trades; any business with qualifying signals is eligible.

## Positioning

The client is the hero, we are the guide. Objectives first, collaborative, enterprise operational discipline at a price and speed that fits the stage. AI & automation is a named capability, never a brand veneer. No dollar amounts on any public surface except the Hosted Agent page (page-scoped exemption). No fixed timeframes in marketing copy.

## Pricing Posture (internal)

- Consulting: internal rate ladder, quoted to the client as a fixed project price, never an hourly breakdown. Paid assessment applied toward the engagement.
- Operator: flat monthly retainer plus a one-time stand-up fee, priced against the salary of the coordinator it replaces. Figures live in the private `venturecrane/engagements` repo, never here. Change requests follow service agreement section 2.7: trial, measure, then propose terms in writing.
- Hosted Agent: published on `/agent`.

## Tech Stack

- **Web app:** Astro SSR on Cloudflare Workers, single Worker `ss-web`, three hosts: `smd.services` (marketing), `admin.smd.services` (admin console), `portal.smd.services` (client portal). D1 for data; Clerk-primary auth.
- **Operator runtime:** Hermes on Fly Machines, one seat per client, with the SMD overlay (`venturecrane/hermes-smd-overlay`) carrying the trust plugin, gates, and connectors. Governed by an authored routine grid and autonomy ceilings, an independent oversight plane (ADR 0074), work-liveness and connector-outage alerting (ADR 0079, 0080), and a cost plane with a kill criterion (ADR 0062).
- **Client work:** client material lives in the private `venturecrane/engagements` repo (ADR 0081).

## Status

Launched. One live Operator client, with production Smokeball integration approved by the vendor on 2026-09-21 (UTC). First public case study on the site (`/case-studies/personal-injury-law-firm`). Automated lead generation was retired (ADR 0060); acquisition runs through referral cultivation and a guarded paid-acquisition round (ADR 0066).

## Links

- **Repo:** [venturecrane/ss-console](https://github.com/venturecrane/ss-console)
- **Overlay:** [venturecrane/hermes-smd-overlay](https://github.com/venturecrane/hermes-smd-overlay)
- **Site:** [smd.services](https://smd.services)
- **Decision Stack:** `docs/adr/decision-stack.md` (38 active decisions, numbered through #56)
- **Handbook:** `docs/handbook/`
