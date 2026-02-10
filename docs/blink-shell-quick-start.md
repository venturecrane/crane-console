# Blink Shell Quick Start Guide

Complete setup guide for using Blink Shell on iPad/iPhone to access your servers.

## Installation

1. Open **App Store** on your iPad/iPhone
2. Search for **"Blink Shell"**
3. Install **Blink Shell, Build & Code** by Blink Shell LLC
4. Launch the app

**Cost:** 2-week free trial, then $19.99/year

## Initial Setup

### Option 1: Import SSH Key via iCloud (Easiest)

If your SSH keys are in iCloud (usually they are):

1. In Blink Shell, tap **Settings** (gear icon)
2. Tap **Keys**
3. Tap **Import**
4. Select **From iCloud** or **From Files**
5. Navigate to your `.ssh` folder
6. Select `id_ed25519` (your private key)
7. Enter a name: `main-key`
8. Save

### Option 2: Copy SSH Key Manually

**On mac23:**

```bash
# Display your private key
cat ~/.ssh/id_ed25519

# Copy the entire output including:
# -----BEGIN OPENSSH PRIVATE KEY-----
# ... (all the content)
# -----END OPENSSH PRIVATE KEY-----
```

**In Blink Shell:**

1. Tap **Settings** → **Keys**
2. Tap **+** (top right)
3. Tap **Paste Key**
4. Paste the entire private key
5. Name it `main-key`
6. Save

### Option 3: Generate New Key in Blink (Not Recommended)

Only use if you want a separate key for mobile:

1. Settings → Keys → + → Generate
2. Choose Ed25519
3. Copy the public key
4. Add to `~/.ssh/authorized_keys` on both servers

**Recommendation:** Use Option 1 or 2 to keep one key across all devices.

## Import SSH Config

Blink Shell can read your SSH config file for all your shortcuts.

**On mac23:**

```bash
# Display your SSH config
cat ~/.ssh/config
```

**In Blink Shell:**

1. Tap **Settings** → **Hosts**
2. Tap **Import**
3. Paste your SSH config
4. Blink will create all your host shortcuts automatically

**OR add hosts manually:**

### Add Ubuntu Server

1. Tap **Settings** → **Hosts** → **+**
2. Enter details:
   - **Host:** mini
   - **Hostname:** 100.105.134.85
   - **User:** smdurgan
   - **Key:** main-key
3. Tap **Save**

### Add mac23

1. Tap **Settings** → **Hosts** → **+**
2. Enter details:
   - **Host:** mac23
   - **Hostname:** 100.115.75.103
   - **User:** scottdurgan
   - **Key:** main-key
3. Tap **Save**

## First Connection

### Connect to Ubuntu Server

1. In Blink Shell, type:
   ```bash
   ssh mini
   ```
2. First time: Accept the host key (type `yes`)
3. You should see:
   ```
   smdurgan@mini:~$
   ```

### Test the Connection

```bash
# You're now on the Ubuntu server
hostname
# Should show: mini

whoami
# Should show: smdurgan

pwd
# Should show: /home/smdurgan
```

### Start Working

```bash
# Select a repo and launch Claude
ccs

# Start your day
/sod

# Work with Claude...

# End your day
/eod
```

## Connect to mac23

```bash
ssh mac23
```

You should see:

```
scottdurgan@mac23:~$
```

## Key Blink Shell Features

### Multiple Sessions

- Swipe right to see all open sessions
- Tap **+** to open new session
- Each session stays alive even when switching apps

### Mosh (Connection Resilience)

Mosh keeps your connection alive when switching networks (WiFi to cellular, etc.)

**To use Mosh instead of SSH:**

```bash
mosh mini
# or
mosh mac23
```

**Setup Mosh on Ubuntu (one-time):**

```bash
ssh mini
sudo apt install mosh
exit
```

Now `mosh mini` will maintain connection even when your network changes.

### Split Screen (iPad)

- Swipe down from top edge to split screen
- Use two Blink sessions side-by-side
- Or Blink + Safari for documentation

### Keyboard Shortcuts

- **Cmd+T**: New tab
- **Cmd+W**: Close tab
- **Cmd+1-9**: Switch between tabs
- **Cmd+K**: Clear screen
- **Cmd+D**: Split pane

### External Keyboard

Blink Shell works perfectly with:

- Apple Magic Keyboard for iPad
- Any Bluetooth keyboard
- Smart Keyboard Folio

All standard terminal shortcuts work (Ctrl+C, Ctrl+Z, etc.)

## Terminal Scrolling Configuration

For smooth scrolling in Blink Shell with all AI CLI tools, the following settings are pre-configured on all machines:

### Gemini CLI

Setting in `~/.gemini/settings.json`:

```json
{
  "ui": {
    "useAlternateBuffer": false
  }
}
```

Or configure via `/settings` in Gemini CLI → "Use Alternate Screen Buffer" → false

**Requires restart** - exit and relaunch Gemini for changes to take effect.

### Codex CLI

Setting in `~/.codex/config.toml`:

```toml
[tui]
alternate_screen = false
```

### Claude Code CLI

Works with default settings - no configuration needed.

### Why This Matters

When alternate screen buffer is enabled:

- Native terminal scrolling doesn't work
- Must use Shift+Up/Down or Page Up/Down
- Text selection requires special modes

With alternate screen disabled:

- Normal finger/trackpad scrolling works
- Standard text selection works
- Scrollback history preserved

**Sources:**

- [Gemini CLI Alternate Buffer Discussion](https://github.com/google-gemini/gemini-cli/discussions/13633)
- [Codex CLI Alt-Screen Issue](https://github.com/openai/codex/issues/2836)

## Working with Claude Code CLI

### Start a Session

```bash
ssh mini
ccs
# Select repo
/sod
```

### During Development

- Claude responds in the terminal
- Can run commands, edit files, create PRs
- All via text interface

### Keep Session Alive

If working on long task:

```bash
/heartbeat
```

### End Session

```bash
/eod
# Creates handoff for next session
```

## Troubleshooting

### "Permission denied (publickey)"

**Check key is loaded:**

1. Blink Shell → Settings → Keys
2. Verify `main-key` is listed
3. Try reconnecting

**Verify key matches:**

```bash
# On mac23
cat ~/.ssh/id_ed25519.pub

# Compare with what's in Blink Shell Settings → Keys
```

### "Connection refused"

**Check Tailscale:**

```bash
# On mac23
tailscale status
```

Verify both machines show as online.

**Try local network:**

```bash
ssh mini-local
```

### Host Key Changed

If you see "REMOTE HOST IDENTIFICATION HAS CHANGED":

In Blink Shell:

```bash
ssh-keygen -R mini
# Or
ssh-keygen -R 100.105.134.85
```

### Can't Import SSH Config

Manually add hosts as shown in "Add Ubuntu Server" section above.

## Tips & Best Practices

### Save Your Layout

- Blink remembers your sessions
- Force-quit and relaunch: sessions restore
- Great for quick context switching

### Use Mosh for Mobility

If you move between locations:

```bash
mosh mini
```

Connection survives network changes seamlessly.

### iCloud Sync

Blink can sync settings via iCloud:

- Settings → iCloud → Enable
- Hosts and keys sync across all iOS devices

### Clipboard

- Copy/paste works normally
- Long press for system copy/paste menu
- Cmd+C/Cmd+V with external keyboard

### Screen Capture

- Regular iOS screenshot works (Cmd+Shift+3 with keyboard)
- Share screenshots in Claude conversations
- Great for showing errors/UI

## Quick Reference

```bash
# Connect to Ubuntu server
ssh mini

# Connect to mac23
ssh mac23

# Use Mosh (survives network changes)
mosh mini

# Start development session
ccs
/sod

# Update session context
/update

# Keep session alive
/heartbeat

# End session with handoff
/eod
```

## Next Steps

1. Install Blink Shell
2. Import SSH key
3. Import SSH config (or add hosts manually)
4. Connect to Ubuntu: `ssh mini`
5. Start working: `ccs` → `/sod`

## Support

- **Blink Shell Docs**: https://docs.blink.sh/
- **SSH Config Location**: `~/.ssh/config` (on mac23)
- **Server Status**: `tailscale status`

## Summary

**Blink Shell gives you:**

- Professional terminal on iPad/iPhone
- SSH access to both servers using your existing keys
- Mosh for connection resilience
- Full Claude Code CLI experience on mobile
- Split screen, multiple sessions, keyboard shortcuts

**You can now code from anywhere.**
