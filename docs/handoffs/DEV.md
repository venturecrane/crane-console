# Dev Handoff

**Last Updated:** 2026-02-10
**Session:** m16 (Claude Opus 4.6)

## Summary

Ran macOS optimization and network hardening on m16 (field MacBook Air). Applied optimize-macos.sh and harden-mac.sh, verified all settings, and documented hardening status in machine inventory.

## Accomplished

- **Optimized and hardened m16** — ran `optimize-macos.sh` + `harden-mac.sh`
  - Firewall + stealth mode enabled
  - Reduce Transparency + Reduce Motion enabled (manual toggle — SIP-protected domain)
  - File descriptors: 524288 / 131072 (already set from earlier partial run)
  - Battery: Power Nap off, low power mode on
  - AirPlay Receiver disabled, AirDrop contacts-only
  - Tailscale DNS routing verified
  - Safari privacy defaults applied
- **Documented m16 hardening** in `docs/infra/machine-inventory.md` — `55db057`

## In Progress

None

## Blocked

None

## Next Session

- Test adding a new venture end-to-end using the documented process
- Consider wrangler update (3.114.17 → 4.64.0) flagged during deploy
- Set m16 Tailscale key expiry to "never" in admin console (noted as TBD in inventory)

---

## Quick Reference

| Command                    | When to Use             |
| -------------------------- | ----------------------- |
| `/sod`                     | Start of session        |
| `/handoff <issue>`         | PR ready for QA         |
| `/question <issue> <text>` | Need PM clarification   |
| `/merge <issue>`           | After `status:verified` |
| `/eod`                     | End of session          |

### Fleet Commands

```bash
bash scripts/fleet-health.sh           # Check all machines
bash scripts/machine-health.sh         # Check local machine
bash scripts/deploy-to-fleet.sh ORG REPO  # Deploy repo to fleet
bash scripts/bootstrap-infisical-ua.sh # Set up UA creds (new machine)
```
