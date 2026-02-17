# Fleet Operations

## SSH & Fleet Bootstrap

- **bootstrap-machine.sh** must add the local machine's OWN pubkey to `~/.ssh/authorized_keys`, not just fleet keys. Without it, no one can SSH in.
- When bootstrapping a new machine, follow the phases IN ORDER: Tailscale -> CLI wrapper -> bootstrap -> optimize -> mesh. Don't skip to mesh.
- The `tailscale` CLI on macOS App Store installs needs a shell wrapper script (not a symlink - symlinks crash with bundle ID error). Use `scripts/fix-tailscale-cli.sh`.
- `tailscale ssh` checks host keys against Tailscale coordination server, not local `known_hosts`. Doesn't bypass SSH key auth unless Tailscale SSH server is enabled on target.
- mac23 runs `setup-ssh-mesh.sh` (has hostname check). Other machines can't run it.

## Remote Git Conflict Patterns

- mac23 often has an active CC session pushing commits. Always `git pull --rebase` before pushing. Expect conflicts on machine-inventory.md.

## macOS Hardening

- `optimize-macos.sh` replaces old `optimize-mba.sh`. Generalized for any fleet Mac.
- Safari defaults keys guarded with `2>/dev/null || true` - may differ across macOS versions.
- Firewall signed app allowance covers Tailscale.app. Verify `tailscale ping` after enabling.

## Pending Fleet Items

- **think**: offline during fleet sync. Needs `cd ~/dev/sc-console && git pull` when it comes back online. All other repos on think will self-update on next `git pull`.

## Related Documentation

- `docs/infra/ssh-tailscale-access.md` - SSH and Tailscale setup
- `docs/infra/machine-inventory.md` - Dev machine inventory
