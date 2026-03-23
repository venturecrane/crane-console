# Product Infrastructure Strategy

**Version:** 1.0
**Date:** January 27, 2026
**Status:** APPROVED

---

## Overview

SMDurgan LLC operates a product factory model through Venture Crane. This document defines how infrastructure is organized across products.

## Entity Structure

```
SMDurgan LLC (legal entity)
└── Venture Crane (product factory)
    ├── Shared Infrastructure (vc-*)
    │   ├── crane-relay - GitHub integration for all products
    │   ├── crane-context - Session/handoff management
    │   └── crane-command - Command center
    │
    ├── Durgan Field Guide (dfg-*)
    │   ├── dfg-api, dfg-scout, dfg-analyst
    │   ├── dfg-scout-db (D1)
    │   └── dfg-evidence (R2)
    │
    ├── Silicon Crane (sc-*)
    │   ├── sc-api
    │   ├── sc-db (D1)
    │   └── sc-assets (R2)
    │
    └── Future Products...
```

## GitHub Organizations

| Org                | Purpose                       | Repos                |
| ------------------ | ----------------------------- | -------------------- |
| `venturecrane`     | Product factory, shared infra | crane-console        |
| `durganfieldguide` | DFG product                   | dfg-console, dfg-app |
| `siliconcrane`     | SC product                    | sc-console           |

## Cloudflare Strategy

### Single Account Model

All products share one Cloudflare account:

- **Account:** `ab6cc9362f7e51ba9a610aec1fc3a833`
- **Isolation:** Prefix naming (`dfg-*`, `sc-*`, `vc-*`)

### Naming Conventions

| Resource Type | Pattern                | Examples                           |
| ------------- | ---------------------- | ---------------------------------- |
| Workers       | `{product}-{function}` | `dfg-api`, `sc-api`, `crane-relay` |
| D1 Databases  | `{product}-{purpose}`  | `dfg-scout-db`, `sc-db`            |
| R2 Buckets    | `{product}-{purpose}`  | `dfg-evidence`, `sc-assets`        |
| KV Namespaces | `{PRODUCT}_{PURPOSE}`  | `SCOUT_KV`                         |

### Why Single Account?

1. **Simplicity** - One bill, one API token, one dashboard
2. **Agent access** - All agents can manage all products
3. **Low overhead** - No multi-account complexity for experiments
4. **Defer complexity** - Create dedicated accounts only when needed

### When to Create Dedicated Account

Create a separate Cloudflare account when:

- Product is being sold/spun off
- Product needs independent billing
- Product team needs isolated access
- Rate limits require separation

## Product Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  INCUBATE   │ ──► │    TEST     │ ──► │   DECIDE    │
│             │     │             │     │             │
│ Build in    │     │ Validate    │     │ Kill/Pivot/ │
│ shared acct │     │ product-    │     │ Launch      │
│ with prefix │     │ market fit  │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    ▼                         ▼                         ▼
             ┌─────────────┐           ┌─────────────┐           ┌─────────────┐
             │    KILL     │           │    PIVOT    │           │   LAUNCH    │
             │             │           │             │           │             │
             │ Delete all  │           │ Rename/     │           │ Graduate to │
             │ {prefix}-*  │           │ repurpose   │           │ own account │
             │ resources   │           │ resources   │           │ (if needed) │
             └─────────────┘           └─────────────┘           └─────────────┘
```

## Current Products

| Product            | Code | Status    | GitHub Org       | Infrastructure            |
| ------------------ | ---- | --------- | ---------------- | ------------------------- |
| Durgan Field Guide | DFG  | Launched  | durganfieldguide | `dfg-*` in shared account |
| Silicon Crane      | SC   | Migrating | siliconcrane     | `sc-*` in shared account  |

## Resource Inventory

### Workers (6)

- `crane-context` - VC shared
- `crane-relay` - VC shared
- `dfg-api` - DFG
- `dfg-analyst` - DFG
- `dfg-scout` - DFG
- `sc-api` - SC

### D1 Databases (5)

- `crane-context-db-prod` - VC
- `crane-context-db-local` - VC (dev)
- `dfg-relay` - VC (crane-relay data)
- `dfg-scout-db` - DFG
- `sc-db` - SC

### R2 Buckets (2)

- `dfg-evidence` - DFG
- `sc-assets` - SC

### KV Namespaces (1)

- `SCOUT_KV` - DFG

## Agent Instructions

When creating new product infrastructure:

1. **Use correct prefix** - `{product}-{function}`
2. **Stay in shared account** - Don't create new Cloudflare accounts
3. **Follow patterns** - Match existing products (DFG is the reference)
4. **Document bindings** - Update this doc when adding resources
5. **Clean up experiments** - Delete failed product resources promptly

## Related Documents

- `docs/cloudflare-token-inventory.md` - API tokens and access
- `workers/*/wrangler.toml` - Individual worker configurations
