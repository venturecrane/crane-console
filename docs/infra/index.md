---
title: 'Infrastructure'
sidebar:
  order: 0
---

# Infrastructure

Infrastructure is how we provision machines, manage secrets, connect services, and operate the fleet. These documents cover the platform architecture, the development machine fleet, and security foundations.

## Who This Is For

**Managing the fleet?** Start with [Machine Inventory](machine-inventory.md) for the current machine roster and [SSH Access via Tailscale](ssh-tailscale-access.md) for connectivity setup.

**Understanding the platform?** Read [Product Infrastructure Strategy](product-infrastructure-strategy.md) for the entity structure and Cloudflare naming conventions, then [Crane Context MCP Server Spec](crane-context-mcp-spec.md) for the session management architecture.

**Working with secrets?** Start with [Token Registry](token-registry.md) if you need to understand blast radius or rotation impact, then use [Token Rotation Runbook](token-rotation-runbook.md) for the exact procedure and [Secrets Management](secrets-management.md) for Infisical structure.

Not finding what you need? Browse the full list below - these categories are starting points, not silos.

## How This Section Is Organized

- **[Crane Context MCP Server Spec](crane-context-mcp-spec.md)** - The architecture for SOD/EOD workflow via MCP tools instead of bash scripts
- **[Machine Inventory](machine-inventory.md)** - Development machine roster with Tailscale IPs, SSH aliases, and installed tooling
- **[Product Infrastructure Strategy](product-infrastructure-strategy.md)** - The entity structure, GitHub orgs, Cloudflare account model, and resource naming conventions
- **[Secrets Management](secrets-management.md)** - Infisical setup, venture folder structure, shared secrets, and safe provisioning patterns
- **[Token Registry](token-registry.md)** - Shared token inventory: ownership, status, consumers, blast radius, and delete candidates
- **[Token Rotation Runbook](token-rotation-runbook.md)** - Exact no-break rotation procedures for shared PATs, OAuth app secrets, and deploy tokens
- **[SSH Access via Tailscale](ssh-tailscale-access.md)** - Complete guide for SSH connections across the fleet using Tailscale network
