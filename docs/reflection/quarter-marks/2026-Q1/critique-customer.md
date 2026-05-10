# Customer Critique - Quarter Mark v1

**Posture:** I am a B2B services buyer evaluating SMD Services / Venture Crane after reading venturecrane.com, smd.services, and what is publicly visible in the GitHub org. I have a budget and a real problem (we want AI implementation help). I am skeptical, not hostile. Here is what would and would not move me.

## 1. What in the visible artifacts would build trust

There is real signal that this operator can ship. PR throughput across the portfolio is unusual for a one-person shop: 907 merged PRs across 13 repos in 16 weeks (`dossier-github.md`), with median time-to-merge under a day on most repos. The infrastructure articles show technical depth - "Building an MCP Server for Workflow Orchestration" (3,129 words), "How We Built an Agent Context Management System" (6,079 words), "Sessions as First-Class Citizens" (3,091 words). If I am buying AI implementation services, I want a vendor who has actually wired this up at scale, and the artifacts demonstrate that.

The kill discipline is also a trust signal. `dossier-decisions.md` lists ten features killed in window with named replacements - Stitch retired for `/product-design`, Figma MCP rejected on cost, soft-sunset lifecycle deleted four days after it shipped (PR #818). A vendor who deletes their own work when it stops earning its keep is rarer and more valuable than one who keeps everything.

The smd.services positioning is honest and grown-up: "Fixed-price engagements quoted after discovery. One price for the engagement. You see the total before you commit." That is what a small-business buyer wants to read.

## 2. What in the visible artifacts would alarm a buyer

Plenty. In rough order of how loudly the alarm rings:

**No clients. None. Anywhere.** `dossier-github.md` shows 907 merged PRs across thirteen repos and not a single one is a client engagement. Every repo is internal: crane-console, vc-web, ss-console (the consultancy front, still pre-launch per `dossier-decisions.md` 2026-05-05), and venture experiments (dc, ke, sc, dfg). `dossier-knowledge.md` shows 175 VCMS notes; `crane_notes(tag: "case-study")` is not even a category - 8 notes are tagged "executive-summary" but those are internal venture summaries, not customer wins. A buyer searching "client", "customer", "case study", or "testimonial" on smd.services finds nothing. My read: "These people have built a workshop. They have not yet sold anything from it."

**The publishing-to-shipping ratio is upside down.** 45 articles in 16 weeks (`dossier-articles.md`), 62% in methodology voice, only 2 of 45 in venture-update voice. By tag count: `infrastructure` 16, `agent-operations` 13, `agent-workflow` 10. Tags I would expect from a working consultancy - `client-work`, `engagement`, `outcome`, `case-study`, `migration` - do not appear. From a buyer view this looks like a prolific tools-and-process blog, not a firm. The honest summary I would write to my CTO: "They publish more about how they work than about what they have done for anyone."

**Self-merging at velocity.** `dossier-github.md` is explicit: "Virtually all PRs have zero formal reviews recorded in the API... the author merges directly." 907 PRs, two recorded human reviews (both on dc-console). When I am paying $X to ship into our codebase, I want to know there is a second pair of eyes on the work. The published response - "Multi-Model Code Review: Why One AI Isn't Enough" (2026-02-15) - says the second pair of eyes is a different model. That is a defensible position, but it is not what most buyers think of as code review, and I would expect to be told that explicitly before signing an SOW.

**Public hygiene that any buyer can see.** Right now, today, the venturecrane GitHub org has 44 open Dependabot PRs across the portfolio (`dossier-github.md`). `dossier-handoffs.md` records 81 unresolved CI/CD alerts and a Dependabot backlog that peaked at 47 open PRs on crane-console alone. If I am evaluating you to run my AI infrastructure, your own house should be tidier than mine. "47 stale dependency PRs and 81 CI alerts" is not the answer I want when I ask "show me your repo."

**150 SS handoff entries and SS is still pre-launch.** `dossier-handoffs.md` shows 150 sessions on the SS consultancy product over 16 weeks; `dossier-decisions.md` (2026-05-05) records the GBP-cadence kill on grounds "SS is pre-launch; no GBP substrate exists." A buyer asks the obvious question: if your own consulting front-end has had 150 working sessions across four months and is still not live, how long will my engagement take?

**The Anthropic Partner Network framing.** `docs/anthropic-partnership/` contains an entire program of pursuit: curriculum.md, qualification.md, the-ten.md, gap-ledger.md, outbound briefs. The article "Pursuing Partner Network Status as a Solo Operator with an AI Agent Team" (2026-04-22) and the MEMORY.md note "cleared initial review 2026-04-09" are public-adjacent. Pursuit is not membership. A buyer who reads this thinks: "They are leaning on a partnership they do not yet have. If they had it, they would say 'we are an Anthropic Solution Partner.' They are saying 'we are pursuing.'" The smd.services site does not currently claim partner status, which is good; the in-repo material reads as a sales aid in waiting and would alarm me if it surfaced in a pitch.

**"All content produced by AI agents" as a stance.** MEMORY.md is unambiguous: "Never attempt to present 'the voice of the founder.' The agents ARE the voice." For a methodology audience this is a feature. For a typical mid-market SaaS COO, it is a flag. They will ask: "Who is accountable when something goes wrong on my engagement? An agent? A model version?" The honest answer is "Scott Durgan, sole human." That answer should be on the website. It is not on smd.services.

## 3. What evidence of outcomes is missing

A buyer wants four things, and I see zero of three of them:

- **Named clients with permission to use the name.** None on smd.services. None in the repo. `crane_notes(tag: "case-study")` is not a tag that exists in `dossier-knowledge.md`'s top-8.
- **Before/after metrics on a real engagement.** None. Not "we shipped 907 PRs" - that is internal volume. I want "Acme Co. cut their X process from 4 hours to 20 minutes."
- **Testimonials.** None on either site.
- **Repeat business.** Cannot evaluate; no first business is visible.

What I see instead is internal velocity (PRs, articles, skills) and capability artifacts (MCP servers, fleet tooling, design system). Capability without an outcome is a workshop, not a firm.

## 4. Science fair vs working firm

This reads as science fair, not yet firm. The diagnostic is straightforward.

Working firms produce, in order: paid engagements, retained relationships, named references, methodology writeups derived from what they did for clients. The Venture Crane operation has produced the methodology writeups first - 28 methodology articles, 38 active skills (`dossier-tooling.md`), six fleet machines, an enterprise MCP, custom session-reflex hooks - while the engagement count visible in any artifact is zero. The handoff ledger has a Theme: "**SS Product Build** - 150 sessions" but the product being built is the consultancy itself, not work for someone who paid for it.

The strongest counter to this read is that the work is genuinely good, and the operator clearly knows what he is doing. That is necessary but not sufficient. A buyer is not buying capability; they are buying the demonstrated ability to deliver an outcome inside a contract. None of that demonstration is visible.

What would close the gap, in priority order: (1) one named client engagement on smd.services with a quoted before/after metric, (2) a revenue figure - any figure - that grounds the operation in commerce, (3) a case study with a named contact authorized to take a reference call, (4) explicit ownership and accountability statement on the buyer-facing site ("Scott Durgan, founder, is solely accountable for delivery"). Until those land, the rational read for a careful buyer is: "Talented team, impressive workshop, come back when you have shipped for someone."
