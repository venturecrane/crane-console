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

**Working with secrets?** Go straight to [Secrets Management](secrets-management.md) for Infisical setup, venture paths, and provisioning patterns.

Not finding what you need? Browse the full list below - these categories are starting points, not silos.

## How This Section Is Organized

- **[Crane Context MCP Server Spec](crane-context-mcp-spec.md)** - The architecture for SOD/EOD workflow via MCP tools instead of bash scripts
- **[Machine Inventory](machine-inventory.md)** - Development machine roster with Tailscale IPs, SSH aliases, and installed tooling
- **[Product Infrastructure Strategy](product-infrastructure-strategy.md)** - The entity structure, GitHub orgs, Cloudflare account model, and resource naming conventions
- **[Secrets Management](secrets-management.md)** - Infisical setup, venture folder structure, shared secrets, and safe provisioning patterns
- **[SSH Access via Tailscale](ssh-tailscale-access.md)** - Complete guide for SSH connections across the fleet using Tailscale network
