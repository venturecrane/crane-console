# New Mac Setup

Add a new macOS machine to the Crane dev fleet in ~30 minutes.

## Prerequisites (on the new Mac)

These 3 steps require physical access to the new Mac:

1. **Enable Remote Login:** System Settings > General > Sharing > Remote Login > ON
2. **Install Tailscale:** App Store > Tailscale > Install > Sign in to tailnet
3. **Enable passwordless sudo:**
   ```bash
   echo "$USER ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/$USER
   ```

## Run Bootstrap (from any fleet machine)

```bash
# From mac23 or any machine with CRANE_CONTEXT_KEY
infisical run --path /vc -- ./scripts/bootstrap-new-mac.sh <tailscale-ip> <username> <alias>

# Example:
infisical run --path /vc -- ./scripts/bootstrap-new-mac.sh 100.119.24.42 scottdurgan m16
```

## What Gets Installed

| Category | Tools |
|----------|-------|
| Runtime | Node.js 20, npm |
| Dev tools | GitHub CLI, Wrangler, Claude Code, uv |
| Infrastructure | Tailscale CLI wrapper, Infisical CLI, tmux |
| Crane-specific | crane-console repo, Crane MCP server, Apple Notes MCP |
| Security | Firewall + stealth mode, AirDrop restricted, AirPlay disabled |
| Performance | Reduced visual effects, increased file descriptor limits, Spotlight exclusions |

## Post-Bootstrap Manual Steps

SSH into the new machine and complete:

```bash
# 1. Login to Infisical
infisical login

# 2. Login to Claude
claude login

# 3. Update SSH mesh on all machines (from any fleet machine)
./scripts/setup-ssh-mesh.sh

# 4. Start a session
infisical run --path /vc -- crane vc
```

## Resume After Failure

The script checkpoints progress on the target (`~/.bootstrap-state`). If it fails:

1. Fix the issue (read the error message)
2. Re-run the same command — completed steps are skipped

## Troubleshooting

| Issue | Fix |
|-------|-----|
| SSH connection refused | Verify Remote Login is ON in System Settings |
| `tailscale: command not found` | Install Tailscale from App Store, sign in |
| `sudo: a password is required` | Run the passwordless sudo step from prerequisites |
| Homebrew install hangs | Xcode Command Line Tools prompt — accept on the target |
| `gh auth` fails | Ensure `gh auth login` works on the control machine first |
| Node not found after install | Check `~/.zshrc` has brew shellenv eval |
