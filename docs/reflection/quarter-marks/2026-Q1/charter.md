# Charter: What This Operation Was Doing in 2026-Q1

This document establishes the context against which Quarter Mark v1 critiques should evaluate the operation. It is the lens v1 lacked. Every critique that follows reads against this charter, not against a generic firm or successor yardstick.

## Stage

The Venture Crane operation was in **Stage 1: Capability Building**, not Stage 2: Market Execution.

- **Stage 1 deliverable:** the capability itself. The ability for one person plus a fleet of Claude agents to operate sophisticated multi-tenant infrastructure, ship code at velocity across many repositories, maintain operational discipline across machines, and document the journey publicly as the journey unfolds.
- **Stage 2 deliverable** (out of scope this window): paid client engagements, named case studies, revenue, retained references.

These are sequential, not parallel. The capability has to exist before it can be sold. There is no operating-system-as-a-service this operation could have purchased; it had to be invented.

## What was unknown at window start (2026-01-13)

Four months ago, the answers to the following questions were not publicly known and had to be discovered through direct experiment:

- How does a solo human reliably orchestrate an AI agent fleet across multiple machines without context bleed?
- How do you keep parallel agent sessions from clobbering each other's git state?
- How do you maintain cross-session continuity (memory, handoffs, decisions) across machine boundaries?
- How do you give agents enough operational context to act without spoon-feeding every prompt?
- How do you bridge MCP to claude.ai over HTTP with OAuth?
- How do you operate a six-machine Tailscale fleet with one human?
- How do you produce publishable-quality content from agents at the rate the work generates it?
- How do you maintain kill discipline against your own scaffolding?

The 268 VC sessions in the handoff ledger (`dossier-handoffs.md`) are the cost of inventing answers to these questions. They were not "tooling overhead competing with venture investment." They were the act of building the conditions under which any venture investment could compound.

## Stage 1 capability checkpoints

The implicit success criteria for this window were:

1. **Session continuity** across single-machine sessions (handoffs in D1, /sos and /eos as deterministic primary path)
2. **Cross-machine memory** (auto-memory + enterprise memory with FTS5 recall and per-machine ingest)
3. **Parallel session isolation** (bare-repo + worktrees + hooks + doctor MCP)
4. **Cross-venture context** (agents that know which venture they are operating in)
5. **Content engine** (the public journal that documents the operation as it builds)
6. **Operational telemetry** (deploy heartbeats, fleet health, alert ledger)
7. **Security gates** (Semgrep CI rolled to all venture repos)
8. **Kill discipline** (deleting work that does not earn its keep, including the deletion mechanism itself)
9. **Skill governance** (schema, lint, audit, deprecation queue)
10. **Multi-machine fleet** (Tailscale-meshed, branch-protected, with reliability scoring)

## What success looks like at Stage 1 vs Stage 2

| Dimension | Stage 1 success | Stage 2 success |
| --- | --- | --- |
| Output | working capability | paid engagements |
| Volume measure | sessions, PRs, articles, skills | clients, retainers, references |
| Risk measure | brittleness, single points of failure | client churn, NPS |
| Public surface | journal of what was built and learned | case studies, named outcomes |
| Internal reflection | did the capability stack come together | did the capability stack convert |
| Revenue | not the metric | the metric |

A v1 critic anchored on Stage 2 metrics will mark the operation a failure. A v1 critic anchored on Stage 1 metrics asks the harder, more useful question: did the capability stack come together, and is it ready to enter Stage 2?

## What this charter does not excuse

The charter is not a free pass. Within the Stage 1 frame, the following remain valid critiques and should be raised by any honest critic:

- **Brittleness and single points of failure.** GitHub App on personal account, memory store on mac23, mac23 as the only fleet-provisioning machine, single Cloudflare account. These risks would still exist at Stage 10.
- **Cost blind spot.** Sixteen weeks without per-month spend visibility is a Stage 1 failure, not a stage-appropriate gap. Any operation should know its burn.
- **Findability of internal knowledge.** ~121 untagged VCMS notes is a Stage 1 problem because Stage 2 will rely on retrieval that does not work today.
- **Scaffolding vs capability.** Some of the 38 skills are genuine capability; some are personal cadence. Charter does not require keeping all of them. It requires deciding which is which.
- **Discovery loop discipline.** The pace at which lessons were captured (zero auto-memories before March, then 56 in April-May) suggests the early window did not have the reflective discipline the later window did. That gap matters.

## Frame for v2 critics

When evaluating this window, ask:

1. **Did Stage 1 capability come together?** (capability-by-capability assessment against the ten checkpoints)
2. **Is the operation ready for Stage 2?** (what gates open, what blocks)
3. **What was theater within the Stage 1 frame?** (separate from "no revenue", which is out of scope)
4. **What is brittle even at Stage 1?** (single points of failure, undocumented dependencies)
5. **What is genuinely novel here?** (peer-perspective: does this advance the public knowledge of how AI-agent operations work)

A critic that asks these and answers honestly produces a useful artifact. A critic that asks "where is the revenue" produces a category error.
