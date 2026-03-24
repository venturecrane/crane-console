---
title: 'Runbooks'
sidebar:
  order: 0
---

# Runbooks

Step-by-step procedures for infrastructure setup, operations, and troubleshooting. Runbooks are task-oriented - they assume you have a specific goal and walk you through the exact commands to achieve it.

These are not governance docs (see [Agent Directives](../instructions/index.md) for policy). Runbooks are executable checklists: bootstrap a new machine, configure an iPad for remote access, diagnose a TLS failure. They tell you what to do, not why the policy exists.

## Who This Is For

**Setting up a new machine?** Start with the setup runbook for your platform type, then verify the environment with the post-setup checklist.

**Operating from iPad or mobile?** Follow the Blink Shell guide to configure SSH and Mosh access to fleet machines.

**Debugging infrastructure issues?** Check the troubleshooting runbooks for known failure patterns and diagnostic commands.

## How This Section Is Organized

### Setup

- **[New Mac Setup](new-mac-setup.md)** - Bootstrap a macOS machine into the fleet: Tailscale, dev tools, SSH mesh, and security hardening.
- **[New Box Onboarding](new-box-onboarding.md)** - Add an Ubuntu/Xubuntu machine with automated bootstrap script and manual verification steps.
- **[New Environment Setup](new-environment-setup.md)** - General development environment checklist for any platform: tools, secrets, permissions, and validation tests.

### Operations

- **[Blink Shell Quick Start](blink-shell-quick-start.md)** - Configure iPad/iPhone SSH access using Blink Shell for remote fleet operations.

### Troubleshooting

- **[PM Container TLS Troubleshooting](pm-container-tls-troubleshooting.md)** - Diagnose and fix TLS certificate verification failures in Claude Desktop containers.
