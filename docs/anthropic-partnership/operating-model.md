# Venture Crane | Operating Model

Venture Crane is a one-operator enterprise powered by an AI agent workforce.

---

## The Shape

**The operator.** Scott Durgan holds strategy, architecture-of-record, and the Captain's chair. Customer relationships, decisions carrying reputational or legal weight, and final architectural calls belong to the operator. Scott directs; the agents produce.

**The agent workforce.** Engineering, content production, delivery, analysis, and operations are handled by AI agents across all ventures and all engagements. This is not humans using AI tools - the agents are the workforce, structured through session-based operation, memory persistence, multi-agent orchestration, and handoff protocols that ensure continuity across sessions and machines. Every pull request, every pipeline, every client document: produced by the agent team under operator direction.

**How engagements get staffed.** For a client engagement under smd.services, agent roles are assigned with defined accountabilities - project lead, delivery, QA, review. The operator provides oversight at decision boundaries: scope calls, client-facing commitments, anything requiring the accountable human. Between those boundaries, the agent team runs the work. Scale means more agent instances, not more human hires.

---

## Why This Shape

The thesis is that AI agents are the workforce, not a force multiplier on top of a human workforce. Quality comes from the operating environment - structured sessions, memory persistence, multi-agent orchestration, editorial review pipelines, automated verification (type checking, linting, test suites). The rigor is in the architecture of the operating environment. This is a different model from "AI-assisted human work."

---

## Anchored to Anthropic's Own Direction

At Code with Claude (San Francisco, May 2025), Dario Amodei assigned 70-80% probability to the arrival of the first one-person billion-dollar company powered by AI agents by 2026. Venture Crane is building toward that thesis - not requesting an exception to any rule. We are an existence proof of what Anthropic's own CEO described.

Coverage: Inc. Magazine - https://www.inc.com/ben-sherry/anthropic-ceo-dario-amodei-predicts-the-first-billion-dollar-solopreneur-by-2026/91193609

---

## What We Bring to the Claude Partner Network

**Services track - smd.services.** Fixed-price operational consulting for Phoenix-area small businesses. Delivery is AI-agent-executed: documentation, SOW production, analysis, and templates are produced by the agent team. Claude powers the delivery engine. Current status: prototype and active lead generation; no closed clients confirmed at this writing.

**Technology track - Claude-powered product footprint.**

- _SS pipelines._ Three active cron workers calling the Anthropic API directly: review-mining (Claude Sonnet 4 scores Google reviews for operational pain signals), job-monitor (Claude qualifies job postings as lead signals, daily), new-business (Claude Haiku qualifies commercial permit data from four Phoenix metro municipalities, daily).
- _DFG analyst._ Worker using Claude Sonnet 4 for auction item analysis - condition scoring, comp valuation, deal-killer detection.
- _crane-mcp._ MCP server powering every agent session in the portfolio. Gives Claude Code agents tools for session management, handoffs, memory, and fleet dispatch.
- _crane-mcp-remote._ Cloudflare Durable Object serving MCP over Streamable HTTP to claude.ai and Claude Code remote clients.

Note: DC, KE, and SC are built by Claude Code agents at the development layer but do not call the Claude API in their product code at this time. Scope stated accurately.

**Individual credential.** Scott Durgan pursuing Claude Certified Architect - Foundations. Target sit date: May 20-22, 2026.

---

## What We Need from the Program

Enrollment that recognizes the operator-plus-agent-workforce model. The "ten of your people through training" framing fits a GSI onboarding template - appropriate for Accenture, not appropriate for the operating model Dario described at Code with Claude. We propose training enrollment that admits agent-identity workforces alongside human teams, and partner engagement patterns for non-traditional shapes.

Venture Crane is a forward signal, not an edge case. The program benefits from having the reference example in the room.
