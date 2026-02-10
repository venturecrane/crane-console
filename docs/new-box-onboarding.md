# New Box Onboarding

**Purpose:** Add a new Ubuntu/Xubuntu machine to the development fleet.

**Time:** ~10 minutes with bootstrap script

---

## Quick Start

### On the new box (3 commands):

```bash
sudo apt install openssh-server
sudo ufw allow ssh
echo "$USER ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/$USER
```

### From your Mac (1 command):

```bash
cd ~/dev/crane-console && git pull
./scripts/bootstrap-new-box.sh <IP_ADDRESS> <USERNAME>
```

Example:

```bash
./scripts/bootstrap-new-box.sh 10.0.4.138 scottdurgan
```

---

## What the Script Does

1. **Copies SSH key** to target for passwordless access
2. **Installs dev tools:** git, node, npm, gh, wrangler, claude
3. **Installs Tailscale** for mesh networking (works from anywhere)
4. **Configures environment:** CRANE_CONTEXT_KEY, CLOUDFLARE_API_TOKEN
5. **Authenticates GitHub CLI** (token-based, no browser needed)
6. **Clones crane-console** repo
7. **Builds and links crane CLI + MCP server** (`crane` and `crane-mcp` on PATH)
8. **Configures server mode** (lid close = ignore for laptops)
9. **Updates your SSH config** so `ssh <hostname>` works

---

## Prerequisites on Control Machine

The script checks for these before running:

- `CRANE_CONTEXT_KEY` environment variable
- `CLOUDFLARE_API_TOKEN` environment variable
- `gh auth login` completed
- `tailscale` installed and connected

---

## After Bootstrap

### Add to SSH mesh

Add the new machine to the `MACHINES` array in `scripts/setup-ssh-mesh.sh`, then re-run from mac23:

```bash
./scripts/setup-ssh-mesh.sh
```

This establishes bidirectional SSH between the new machine and all existing fleet machines.

### Connect

Connect via Tailscale hostname (works from anywhere):

```bash
ssh think
```

Or via local IP (same network only):

```bash
ssh scottdurgan@10.0.4.138
```

Start coding:

```bash
ssh think
crane vc  # Launch Claude with Venture Crane
```

---

## Manual Steps (if script fails)

### Tailscale Authentication

If Tailscale auth times out, run on the new box:

```bash
sudo tailscale up --ssh
```

Copy the auth URL to a browser and authenticate.

### GitHub CLI Authentication

If gh auth fails, run on the new box:

```bash
gh auth login
```

Follow the prompts (GitHub.com → HTTPS → browser).

---

## Troubleshooting

### "No route to host" from Mac to new box

This is a network/WiFi isolation issue. The bootstrap script installs Tailscale to work around this. After Tailscale is configured, use the Tailscale hostname instead of IP.

### Environment variables not found

The script adds vars to both `~/.bashrc` and `~/.profile`. If commands still can't find them:

```bash
source ~/.profile
```

### Claude CLI not found

Ensure PATH includes npm global:

```bash
export PATH=$HOME/.npm-global/bin:$PATH
```

---

## Script Location

**In repo:** `scripts/bootstrap-new-box.sh`

**Direct download:**

```bash
curl -O https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/bootstrap-new-box.sh
```

---

## Fleet Status

Current machines on Tailscale:

- mac23 (Mac)
- mini (Linux)
- mbp27 (Linux)
- think (Linux) - added 2026-01-28

Check fleet status:

```bash
tailscale status
```

---

**Last Updated:** 2026-02-04
