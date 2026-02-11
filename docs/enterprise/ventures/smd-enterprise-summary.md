# SMDurgan, LLC — Enterprise Summary

## Overview

SMDurgan, LLC is a solo-founder venture studio that builds, validates, and operates software products. The studio follows a disciplined product factory model — validate fast, kill failures early, scale winners profitably.

## Portfolio

| Venture            | Code | Stage       | Description                                                               |
| ------------------ | ---- | ----------- | ------------------------------------------------------------------------- |
| Venture Crane      | vc   | Operating   | Shared infrastructure and methodology for multi-agent product development |
| Kid Expenses       | ke   | Beta        | Co-parent expense tracking application                                    |
| Silicon Crane      | sc   | Design      | Validation-as-a-service for client engagements                            |
| Durgan Field Guide | dfg  | Market Test | Auction intelligence platform                                             |
| Draft Crane        | dc   | Ideation    | Early-stage venture (database provisioned)                                |

## Infrastructure Model

All ventures share a single Cloudflare account with resources prefixed by venture code (`dfg-api`, `sc-db`, `ke-assets`, etc.). Common stack:

- **Frontend:** Next.js + Tailwind on Vercel
- **Backend:** Cloudflare Workers
- **Database:** D1 (SQLite)
- **Object Storage:** R2
- **Cache:** KV
- **Auth:** Clerk (when needed)
- **Billing:** Stripe (when needed)
- **Secrets:** Infisical (per-venture paths)

## Development Model

- **Multi-agent:** Dev Team (Claude Code CLI) + PM Team (Claude Desktop) + Captain (human founder)
- **5 machines** in fleet across macOS (mac23, mba) and other platforms
- **GitHub** is single source of truth — all work tracked in issues, PRs, and docs
- **Venture Crane** provides shared tooling: crane-relay (GitHub integration), crane-context (session/handoff management), crane-command (dashboard)

## Methodology

Business Validation Machine with 7 stages:

IDEATION → DESIGN → PROTOTYPE → MARKET TEST → PIVOT/KILL → SCALE → MAINTAIN

Kill discipline: explicit kill criteria defined at ideation. No zombie ventures.

## Organization

- **GitHub org:** `venturecrane` (all ventures consolidated under single org)
- **Legal entity:** SMDurgan, LLC
- **Infisical project:** `venture-crane` with per-venture secret paths (`/vc`, `/ke`, `/sc`, `/dfg`)
