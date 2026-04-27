---
sidebar:
  order: 1
---

# SMD Services - Roadmap

## Current Milestone

**Phase 1A: launch the venture and reach $10k/mo run-rate sustained 2+ months.** That gate triggers Phase 1B: rate ladder advances to $200/hr, premium tooling stack unlocks (~$200/mo), and the first case study turns into outbound social proof.

## Active Engines

| Engine | Status | Notes |
|---|---|---|
| 1 — Free AI diagnostic at smd.services/scan | **Production-deployed, unverified** | `ss-scan-workflow` Worker live. Awaiting secret provisioning + first real-prospect smoke test. |
| 2 — Cold volume on free stack (~$20/mo) | Building | Resend outbound wired; reply parser blocked on Resend Inbound DNS. |
| 3 — Phoenix referral-partner cultivation | Manual | Vistage, EO Arizona, fractional CFOs, BNI/chamber, accountants/bookkeepers, commercial insurance, SBA/SCORE. Captain TODO. |

## Planned Work

**Phase 1A engineering punch list (in flight):**
- Send-booking-link admin action (P0 — fixes "Book Assessment" lie)
- Outbound send queue
- Reply parser (blocked on Resend Inbound DNS)
- Programmatic SEO for AI search
- Partner-nurture cadence decision

**Phase 1A go-to-market:**
- Domain warm-up clock running (~14d from 2026-04-27)
- Partner cultivation conversations
- Pipeline math sustaining profitability at chosen volume
- First 5 in-person Phoenix clients

**Phase 1A delivery readiness:**
- Tool and solution matrix across all 6 solution categories
- SOP templates (reusable frameworks, filled per client)
- Client onboarding checklist
- Quality checklist templates

**Phase 1B (post-$10k/mo gate):**
- Premium tooling stack provisioned
- First case study published (unblocks rate advance to $200/hr)
- Outbound social proof loop
- Recurring retainer model details ($200-500/mo)

## Recent Completions

- **2026-04-27** Engine 1 shipped: durable Workflow orchestration via separate `ss-scan-workflow` Worker, magic-link diagnostic, strict Places domain-match guard, render quality fixes
- **2026-04-27** ADR 0001 — taxonomy two-layer model locked (5-cat observation + 6-cat delivery)
- **2026-04-27** Lead-gen strategy authored: 5 docs in `docs/strategy/`, 8 strategic decisions locked, 16 issues closed in single session
- **2026-04-25** Three-subdomain architecture live: `smd.services` (marketing), `admin.smd.services`, `portal.smd.services`
- **Earlier** Cloudflare Workers + Static Assets migration (off Pages); Decision Stack 29 locked decisions; SignWell SOW pipeline; quote/portal flow

## Constraints

- **Anti-fabrication is P0.** No invented client-facing content, ever. Pattern A (committed template sentences implying uncontracted commitments) and Pattern B (runtime fabrication from non-authoritative fields) are merge-gated.
- **No fixed timeframes in external marketing content.** Internal estimates fine; signed SOWs fine; marketing copy never.
- **No dollar amounts published externally.**
- **Phase 1A budget cap: ~$20/mo.** Premium tooling deferred until Phase 1B gate clears.
