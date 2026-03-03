# Shared Infrastructure

Technical backbone shared across all Venture Crane ventures.

## Worker Infrastructure

| Worker        | Purpose                                                   | Status |
| ------------- | --------------------------------------------------------- | ------ |
| crane-watch   | GitHub webhook processor (Cloudflare Worker)              | Active |
| crane-context | Session & handoff management API (Cloudflare Worker + D1) | Active |
| crane-mcp     | Local MCP server for agent tooling                        | Active |

## Analytics

| System | Purpose                          | Status |
| ------ | -------------------------------- | ------ |
| GA4    | Unified analytics (G-T7J4T1STFH) | Active |
| GTM    | Tag management per site          | Active |

### Cross-Domain Tracking

All Crane sites share the same GA4 property with cross-domain tracking enabled:

- venturecrane.com
- siliconcrane.com
- durganfieldguide.com

## Cloudflare Stack

| Service | Use Case                         |
| ------- | -------------------------------- |
| Workers | Edge compute, API endpoints      |
| D1      | Structured data storage          |
| R2      | Object storage (images, exports) |
| KV      | Fast lookups, session state      |
| Pages   | Static site hosting              |

## Naming Conventions

### Venture Repos

`{venture-code}-console` (e.g., `dfg-console`, `sc-console`, `ke-console`, `dc-console`)

### Shared Infrastructure

`crane-{function}` (e.g., `crane-watch`, `crane-context`, `crane-mcp`)
