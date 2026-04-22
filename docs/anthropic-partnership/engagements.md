# CPN Engagements Inventory

**Last updated:** 2026-04-22
**Purpose:** Inventory of Claude-powered work across the Venture Crane portfolio. Used as evidence for Technology Partner and Services Partner track applications.

**Captain's canonical position (2026-04-22):** All VC venture products have Claude-powered features, shipping or in backlog. Distinguish "shipping" from "planned" on any specific claim. Do not overstate; do not understate.

---

## Technology Partner Candidates

### crane-mcp (`@venturecrane/crane-mcp`)

The MCP server that powers every agent session across the portfolio. Implements the Model Context Protocol via `@modelcontextprotocol/sdk`. Provides Claude Code with tools for session management, context validation, handoffs, VCMS notes, scheduling, issue creation, and fleet dispatch. The `crane` CLI launcher wraps `claude` with Infisical secret injection. Every agent session in the portfolio runs through crane-mcp.

**Claude usage:** Claude Code CLI is the primary client. All agent-to-infrastructure communication goes through MCP tools exposed by this package. **Shipping.**

**Repo:** venturecrane/crane-console (`packages/crane-mcp`)

---

### crane-context (`crane-context.automation-ab6.workers.dev`)

Cloudflare Worker providing structured session and handoff management for multi-agent workflows. Stores sessions, heartbeats, and typed handoffs in D1. Exposes HTTP API used by crane-mcp tools (`/sos`, `/eos`, `/update`, `/heartbeat`, `/active`, `/handoffs`).

**Claude usage:** Not a Claude API consumer - it is the persistence layer that Claude agents write to and read from. Enables multi-machine, multi-session agent continuity. **Shipping.**

**Repo:** venturecrane/crane-console (`workers/crane-context`)

---

### crane-mcp-remote (`crane-mcp-remote.automation-ab6.workers.dev`)

Cloudflare Worker (Durable Object) that serves the MCP protocol over Streamable HTTP for remote clients - claude.ai and Claude Code via `--transport http`. Authenticates via GitHub OAuth using the venturecrane-github App. Enables claude.ai web clients to connect to VC's MCP infrastructure.

**Claude usage:** Serves claude.ai as a remote MCP server. Claude connects to it over HTTP to access crane tools from the web interface. **Shipping.**

**Repo:** venturecrane/crane-console (`workers/crane-mcp-remote`)

---

### crane-watch

Cloudflare Worker GitHub webhook receiver. Receives GitHub App webhooks for CI/CD event forwarding, deploy heartbeat observation, and Vercel deployment failure notifications. Routes events into the crane-context system.

**Claude usage:** Indirect shipping usage - feeds events into crane-context which Claude agents consume. Current issue classification step uses Gemini Flash (cost optimization for high-volume classification). Claude-powered enrichment features planned for the roadmap. **Shipping: Gemini classification + Claude Code-agent development. Backlog: Claude-powered enrichment.**

**Repo:** venturecrane/crane-console (`workers/crane-watch`)

---

### SS (smd.services) | Lead Intelligence Pipelines

Four Cloudflare Worker cron jobs powering the SS new-business development pipeline:

- **review-mining** - Discovers Phoenix-area businesses via Google Places, fetches reviews via Outscraper, and scores them with Claude (claude-sonnet-4-6) for operational pain signals. Pain score >= 7 qualifies for the Lead Inbox. Weekly cron (Mondays). **Shipping.**
- **job-monitor** - Searches for Phoenix-area job postings signaling operational pain, qualifies them with Claude, writes qualified leads to D1. Daily cron at 6:00 AM MST. **Shipping.**
- **new-business** - Fetches commercial permits from Phoenix, Scottsdale, Mesa, and Tempe open data portals. Qualifies with Claude (Haiku, ~$0.001/permit). Daily cron at 7:00 AM MST. **Shipping.**
- **social-listening** - Monitors Reddit for business owner operational pain signals. No Claude qualification step in this pipeline (deliberate cost optimization; pure discovery + routing via Resend digest). **Shipping; non-Claude by design.**

**Claude usage:** Direct Anthropic API calls (`https://api.anthropic.com/v1/messages`) with `ANTHROPIC_API_KEY`. Models confirmed: `claude-sonnet-4-6` (review scoring), Haiku-class (permit qualification).

**Repo:** venturecrane/ss-console (`workers/review-mining`, `workers/job-monitor`, `workers/new-business`, `workers/social-listening`)

---

### DFG (durgan-field-guide) | Analyst Worker

`dfg-analyst` Cloudflare Worker providing AI-powered auction item analysis. Uses Claude to evaluate acquisition opportunities with cost modeling, comp-based valuation, deal-killer detection, and margin discipline enforcement.

**Claude usage:** Direct Anthropic API calls with `ANTHROPIC_API_KEY`. Model confirmed: `claude-sonnet-4-20250514` for both condition analysis and reasoning steps (two-model configuration: `CONDITION_MODEL` and `REASONING_MODEL`, both pointing to the same Sonnet 4 checkpoint). **Shipping. Additional Claude-powered features in backlog (field-compute companion flows).**

**Repo:** durganfieldguide/dfg-console (`workers/dfg-analyst`)

---

### DC (Draft Crane) | dc-api AI Routes

`dc-api` Cloudflare Worker with AI-assisted writing routes (`/api/ai`, `/api/ai-instructions`, `/api/research`). Provides streaming completions, research queries, and AI instruction management for the book-writing workflow.

**Claude usage:** Current production provider is a provider-agnostic AI interface with two tiers: Cloudflare Workers AI (Mistral Small 3.1 24B, edge tier) and OpenAI GPT-4o (frontier tier). **Current shipping AI provider for DC product routes is NOT Claude.** DC is Claude-assisted at the development layer (all code written by Claude Code agents). **Claude-powered product features are in backlog;** specific migration plans under operator review.

**Repo:** smdurgan-llc/dc-console (`workers/dc-api`)

---

### KE (Kid Expenses)

Expense tracking and co-parent settlement application. Next.js, Cloudflare Workers, D1.

**Claude usage:** Development layer | built by Claude Code agents. **No Claude API calls in current shipping product code. Claude-powered product features are in backlog.** Specific features and timeline under operator review.

**Repo:** venturecrane/ke-console

---

### SC (Silicon Crane)

Validation-as-a-Service platform. Structured 30-day sprints producing Go/Kill/Pivot decisions.

**Claude usage:** Development layer | built by Claude Code agents. **No Claude API calls in current shipping product code. Claude-powered product features in backlog** (validation sprint analysis, scoring, synthesis). Specific features and timeline under operator review.

**Repo:** venturecrane/sc-console

---

## Services Partner Candidates

### smd.services (SS venture)

SMD Services is the consulting arm - delivers fixed-price operational consulting to Phoenix-area small businesses ($750k-$5M revenue). The core positioning: enterprise operational discipline applied to businesses that have never had access to it, delivered at speed and pricing that works for their stage. Claude is the named AI platform.

Active Claude-powered work:

- Lead intelligence pipelines (see SS entries above) | Claude qualifies leads before human review. **Shipping.**
- Agent-assisted engagement delivery | all consulting document production, templates, SOW generation, and operational documentation runs through Claude Code agents. **Shipping.**

Current status: Prototype. Site live at smd.services. Service packaging and lead generation in progress. No closed clients confirmed at time of writing.

---

## Individual Architect

**Scott Durgan** - Pursuing Claude Certified Architect (Foundations) certification. Target sit date: May 20-22, 2026. Curriculum plan in `curriculum.md`.

---

## Notes for Updating This Document

- Add new engagements when Claude API usage is confirmed in shipping code.
- Update the "Last updated" date at the top when making changes.
- Always distinguish "shipping" from "backlog" on specific feature claims.
- Do not invent specific Claude features for ventures where the roadmap is not yet defined. "Claude-powered features in backlog" is the correct honest phrasing when specifics are under operator review.
