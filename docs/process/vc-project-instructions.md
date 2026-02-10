# Venture Crane — Project Instructions

**Last Updated:** January 12, 2026

---

## 0) Project Identity

**Mission:** Build and operate a disciplined product factory that validates business ideas quickly, kills failures fast, and scales winners profitably.

**What Venture Crane Is:**

- A venture studio methodology (the Business Validation Machine)
- Shared infrastructure for multi-agent product development
- The operating system for SMDurgan LLC's product portfolio

**What Venture Crane Is Not:**

- Not a product itself (the methodology may become productized later)
- Not a services company (that's Silicon Crane)
- Not a holding company (that's SMDurgan LLC)

**The Test:** Every process, tool, or artifact must make building products faster, cheaper, or more reliable.

---

## 1) Core Methodology: Business Validation Machine (BVM)

### Product Lifecycle Stages

```
IDEATION → DESIGN → PROTOTYPE → MARKET TEST → PIVOT/KILL → SCALE → MAINTAIN
```

| Stage           | Gate Question              | Exit Artifacts                         |
| --------------- | -------------------------- | -------------------------------------- |
| **Ideation**    | Is this worth a prototype? | Hypothesis brief, kill criteria        |
| **Design**      | Can we build a test rig?   | Specs, wireframes, test plan           |
| **Prototype**   | Does it work at all?       | Working code/service, internal testing |
| **Market Test** | Will anyone pay?           | Metrics, user feedback, revenue signal |
| **Pivot/Kill**  | Continue, change, or stop? | Decision memo with evidence            |
| **Scale**       | Can we grow it profitably? | Growth plan, unit economics            |
| **Maintain**    | Is it still worth running? | Health metrics, support load           |

### Kill Discipline

Every venture has explicit kill criteria defined at Ideation. If criteria are met, the venture dies — no heroics, no "one more pivot."

---

## 2) Team Structure

### Multi-Agent Workflow

| Team         | Tool                  | Responsibility                                     |
| ------------ | --------------------- | -------------------------------------------------- |
| Dev Team     | Claude Code (Desktop) | Implementation, PRs, technical decisions           |
| PM Team      | Claude Desktop        | Requirements, prioritization, verification, merges |
| Auxiliary PM | ChatGPT Desktop       | Strategic input, second opinions                   |
| Advisor      | Gemini Web            | Operator perspective, risk assessment              |
| Captain      | Human                 | Routing, approvals, final decisions                |

### Key Principles

1. **GitHub is the single source of truth** — All work tracked in issues, all code in PRs
2. **Captain never touches GitHub** — PM Team uses relay, Dev Team has direct access
3. **Agents work at high velocity** — Don't artificially constrain scope
4. **"Code merged" ≠ "feature works"** — Require verified acceptance criteria

### Workflow Documents

- `TEAM_WORKFLOW_v1.6.md` — Full process specification
- `agent_persona_briefs_v2.md` — Role definitions and handoff protocols
- `DEV_DIRECTIVE_PR_WORKFLOW.md` — PR-based development rules

---

## 3) Shared Infrastructure

### Crane Relay

Central orchestration API for multi-agent workflows.

**Capabilities:**

- GitHub issue creation, labeling, commenting, closing
- V2 structured events with automatic label transitions
- Evidence upload to R2
- Rolling status comments

**Base URL:** `https://dfg-relay.automation-ab6.workers.dev`

See `DFG_RELAY_API.md` for full endpoint documentation.

### Command Center

Web dashboard for workflow monitoring.

**Location:** core.durganfieldguide.com (will migrate to venturecrane domain)

**Features:**

- 5 work queues (Triage, Ready, In Progress, QA, Blocked)
- Self-serve commands for agents (/handoff, /question, /merge)
- Cross-venture visibility (planned)

### Standard Tech Stack

| Layer          | Standard Choice                  | When to Deviate           |
| -------------- | -------------------------------- | ------------------------- |
| Frontend       | Next.js + Tailwind on Vercel     | Never (for now)           |
| Backend        | Cloudflare Workers               | Never (for now)           |
| Database       | D1 (SQLite)                      | If relational doesn't fit |
| Object Storage | R2                               | Never                     |
| Cache          | KV                               | Never                     |
| Auth           | Clerk (when needed)              | Never                     |
| Billing        | Stripe (when needed)             | Never                     |
| Repo Host      | GitHub                           | Never                     |
| Workflow       | Crane Relay + TEAM_WORKFLOW      | Never                     |
| CI/CD          | GitHub Actions + Vercel/Wrangler | Never                     |

### Resource Naming Conventions

| Resource Type | Pattern               | Example                  |
| ------------- | --------------------- | ------------------------ |
| D1 Database   | `{venture}-{purpose}` | `dfg-main`, `sc-clients` |
| R2 Bucket     | `{venture}-{purpose}` | `dfg-snapshots`          |
| KV Namespace  | `{venture}-{purpose}` | `dfg-cache`              |
| Worker        | `{venture}-{service}` | `dfg-scout`, `dfg-api`   |
| Shared/VC     | `crane-{purpose}`     | `crane-relay-events`     |

---

## 4) Current Ventures

| Venture                  | Stage                   | Project                 |
| ------------------------ | ----------------------- | ----------------------- |
| **Durgan Field Guide**   | Prototype → Market Test | Separate Claude project |
| **Silicon Crane (VaaS)** | Design → Prototype      | Separate Claude project |

---

## 5) Documentation Standards

### Every Venture Gets

- `README.md` — What is this, how to run it
- `CLAUDE.md` or `PROJECT_INSTRUCTIONS.md` — Context for AI agents
- `/docs/` — Architecture, decisions, specs
- Issue/PR templates from standard set

### Version Control for Process

Process docs (workflows, briefs, templates) are version controlled:

- Changes require review
- Breaking changes bump major version
- All ventures inherit from VC standards

---

## 6) Quality Gates

### Definition of Ready (DoR)

A story is READY for development when:

- [ ] GitHub Issue exists with complete template
- [ ] Acceptance Criteria are specific and testable
- [ ] Out of Scope is defined
- [ ] Agent Brief is filled out
- [ ] Priority and sprint labels assigned
- [ ] `status:ready` label applied

### Definition of Done (DoD)

A story is DONE when:

- [ ] PR merged to main
- [ ] All Acceptance Criteria verified
- [ ] No open P0/P1 bugs linked
- [ ] Issue closed with `status:done` label
- [ ] Deployed to production

---

## 7) What Belongs in This Project

### In Scope

- Workflow methodology and process improvements
- Agent role definitions and handoff protocols
- Crane Relay and Command Center development
- Cross-venture tooling and standards
- New venture setup playbooks
- Tech stack decisions affecting all ventures

### Out of Scope

- Individual venture product decisions (goes in venture project)
- Client engagement specifics (goes in Silicon Crane)
- Legal/financial entity matters (goes in SMDurgan LLC)
- Venture-specific technical implementation

---

## Appendix: Key Learnings

### Process

> Agents work at high velocity. Don't artificially constrain scope based on conventional sprint assumptions.

### Quality

> "Code merged" ≠ "feature works." Require explicit, verifiable acceptance criteria with evidence.

### Tooling

> The ~1000 subrequest limit per Cloudflare Worker shapes all data access patterns. Batch everything.

### Documentation

> If it's not in GitHub, it doesn't exist. Notion is for drafts; Git is for truth.
