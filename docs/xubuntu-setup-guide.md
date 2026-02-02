# Xubuntu Setup Guide for Mac Users

**Target Machine:** New Xubuntu desktop joining the team
**Goal:** Full dev environment + Mac-like UX
**Date:** January 22, 2026

---

## Quick Start

Copy this repo to your Xubuntu machine, then run both scripts in parallel:

```bash
# Terminal 1: Dev environment setup
bash scripts/xubuntu-dev-setup.sh

# Terminal 2: UX improvements
bash scripts/xubuntu-ux-setup.sh
```

**Total time:** ~15-20 minutes (dev script takes longer)

---

## What Gets Installed

### Dev Environment (`xubuntu-dev-setup.sh`)

**Core tools:**
- Git, curl, jq, build-essential
- GitHub CLI (`gh`) - For repo management
- Node.js v22 (via nvm) - JavaScript runtime
- npm (configured with global directory)
- Claude Code CLI - Your AI pair programmer
- Wrangler - Cloudflare Workers deployment

**Shell configuration:**
- `ccs` command - Repo selector that launches Claude
- `CRANE_CONTEXT_KEY` - API authentication for Crane Context
- SSH key generation and GitHub upload
- npm global bin in PATH

**Directory structure:**
```
~/dev/
  crane-console/
  sc-console/
  dfg-console/
  ... (auto-cloned via ccs command)
```

### UX Improvements (`xubuntu-ux-setup.sh`)

**Visual:**
- Arc Dark theme (modern, clean)
- Papirus Dark icons (crisp, consistent)
- Fira Code font (programming ligatures)
- Mac-style window buttons (left side)

**Applications:**
- Terminator terminal (Solarized Dark, better than xfce4-terminal)
- Ulauncher (Spotlight-like app launcher)
- Clipboard manager (Clipman)
- Screenshot tool (configured for Mac shortcuts)

**Keyboard shortcuts:**
| Shortcut | Action | Mac Equivalent |
|----------|--------|----------------|
| Super+Space | Launch apps | Cmd+Space |
| Super+T | Open terminal | Cmd+T |
| Super+Q | Quit application | Cmd+Q |
| Super+W | Close window/tab | Cmd+W |
| Super+Shift+3 | Screenshot (full) | Cmd+Shift+3 |
| Super+Shift+4 | Screenshot (area) | Cmd+Shift+4 |
| Super+Left/Right | Tile window | (Similar to Rectangle) |
| Super+Up | Maximize window | - |

**Shell aliases:**
```bash
open <file>        # Opens file (like macOS open)
pbcopy             # Copy to clipboard (like macOS)
pbpaste            # Paste from clipboard (like macOS)
chrome             # Launch Chrome
```

---

## Setup Workflow

### 1. Transfer Scripts to Xubuntu

**Option A: Clone the repo**
```bash
# On Xubuntu machine
git clone https://github.com/venturecrane/crane-console.git
cd crane-console
```

**Option B: Download scripts directly**
```bash
mkdir -p ~/setup && cd ~/setup
curl -O https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/xubuntu-dev-setup.sh
curl -O https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/xubuntu-ux-setup.sh
chmod +x *.sh
```

### 2. Run Dev Setup (Terminal 1)

```bash
bash scripts/xubuntu-dev-setup.sh
```

**What to expect:**
1. System update (~2-3 min)
2. Package installations (~3-5 min)
3. Node.js installation via nvm (~2 min)
4. Prompts for:
   - Crane Context API key (paste it in)
   - SSH key upload to GitHub (copy-paste to https://github.com/settings/keys)
5. Final steps: `gh auth login` and `wrangler login`

**Time:** ~10-15 minutes

### 3. Run UX Setup (Terminal 2)

```bash
bash scripts/xubuntu-ux-setup.sh
```

**What to expect:**
1. Package installations (~3-5 min)
2. Theme and font configuration (~1 min)
3. Two manual steps (pauses for you):
   - Panel configuration (drag to bottom, set size)
   - Add Clipman to panel
4. Prompts to restart at end

**Time:** ~5-10 minutes

### 4. Post-Setup

**Reload shell:**
```bash
source ~/.bashrc
```

**Authenticate services:**
```bash
# GitHub CLI
gh auth login
# Follow prompts, choose: GitHub.com, HTTPS, login via browser

# Cloudflare Wrangler
wrangler login
# Opens browser for authentication
```

**Test the setup:**
```bash
# Test ccs command
ccs
# Should show list of repos from durganfieldguide, venturecrane, siliconcrane

# Select crane-console, then in Claude:
/sod
# Should load session, show work queue
```

**Restart (to apply all UX changes):**
```bash
sudo reboot
```

---

## First Development Session

After reboot:

1. **Launch terminal** (Super+T or click Terminator)

2. **Select repo and start Claude:**
   ```bash
   ccs
   ```
   - Pick `venturecrane/crane-console` (or auto-clone if needed)
   - Claude launches in that directory

3. **Start your day:**
   ```bash
   /sod
   ```
   - Loads session context
   - Shows last handoff
   - Displays GitHub issues (P0, ready, blocked, etc.)

4. **Do your work** (code, test, commit, deploy)

5. **End your day:**
   ```bash
   /eod
   ```
   - Creates handoff note for next session
   - Logs active sessions
   - Saves context

---

## Differences from Ubuntu Server Setup

| Aspect | Ubuntu Server | Xubuntu Desktop |
|--------|---------------|-----------------|
| **Interface** | SSH-only, terminal-based | Full desktop GUI + terminal |
| **Terminal** | Default bash | Terminator (better features) |
| **Access** | Remote SSH from Mac/iPad | Direct desktop use + SSH |
| **App Launcher** | N/A | Ulauncher (Super+Space) |
| **Theme** | N/A | Arc Dark + Papirus icons |
| **Workflow** | SSH → ccs → Claude | Local terminal → ccs → Claude |

---

## Troubleshooting

**"ccs: command not found"**
```bash
source ~/.bashrc
```

**"CRANE_CONTEXT_KEY not set"**
```bash
# Re-run the dev setup or manually add:
echo 'export CRANE_CONTEXT_KEY="your-key-here"' >> ~/.bashrc
source ~/.bashrc
```

**GitHub authentication issues**
```bash
gh auth status
# If not authenticated:
gh auth login
```

**Ulauncher not responding to Super+Space**
```bash
# Restart Ulauncher:
killall ulauncher
ulauncher --hide-window &
```

**Panel looks wrong after UX script**
- Right-click panel → Panel → Panel Preferences
- Adjust size, position, and auto-hide settings
- May need to log out and back in

**Node/npm not found after dev setup**
```bash
# Reload shell to apply nvm changes:
source ~/.bashrc
# Verify:
node --version  # Should show v22.x.x
```

---

## What's Different from Mac

### Things That Work the Same
- Super+Space for app launcher (like Cmd+Space)
- Super+T for terminal (like Cmd+T)
- Super+W to close windows (like Cmd+W)
- `open` command to open files
- `pbcopy`/`pbpaste` for clipboard
- `ccs` workflow is identical
- `/sod` and `/eod` commands work the same

### Things That Are Different
- Super key instead of Cmd key (but mapped similarly)
- Window management is tiling (Super+Left/Right), not macOS's native behavior
- No native gesture support (trackpad swipes)
- File browser is Thunar, not Finder
- Terminal is Terminator, not Terminal.app

### Tips for Mac Users
1. **Super key** = Your new Cmd key (Windows/Meta key on keyboard)
2. **Ctrl+C/V** in most apps (not Super+C/V), but terminal uses Super
3. **Middle-click paste** = Quick paste in Linux (takes getting used to)
4. **Double-click titlebar** = Maximize (not minimize like Mac)
5. **Alt+Tab** = Switch apps (same as Mac)

---

## Next Steps After Setup

1. **Clone your repos:**
   ```bash
   ccs
   # Select each repo you'll work on, let it clone
   ```

2. **Deploy workers (if needed):**
   ```bash
   cd ~/dev/crane-console/workers/crane-context
   npm install
   wrangler deploy
   ```

3. **Customize Terminator:**
   - Right-click → Preferences
   - Adjust font size, colors, keybindings

4. **Add favorite apps to panel:**
   - Right-click panel → Add New Items
   - Add: File Manager, Web Browser, etc.

5. **Configure git:**
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your@email.com"
   ```

---

## Reference: Original Ubuntu Server Setup

These scripts are based on the Ubuntu server setup from January 20, 2026:
- `docs/ubuntu-server-setup-complete.md` - Original server documentation
- `scripts/ubuntu-server-setup.sh` - Original server script

Key differences:
- Server setup: Minimal, SSH-only, no GUI
- Desktop setup: Full GUI, Mac-like UX, local + remote access

---

## Getting Help

**In Claude Code CLI:**
```bash
/help
```

**GitHub Issues:**
https://github.com/anthropics/claude-code/issues

**Venture Crane Team:**
- Check `docs/process/` for workflow documentation
- Use `/sod` to see current priorities
- Use `/eod` to hand off to next session

---

## Summary

You now have:
- ✅ Full dev environment (Node, Claude, Wrangler, gh)
- ✅ Mac-like UX (theme, shortcuts, app launcher)
- ✅ `ccs` command for repo selection
- ✅ Slash commands for session management
- ✅ SSH keys for GitHub
- ✅ Ready to develop on any venture

**Start coding:**
```bash
ccs → /sod → [build something awesome] → /eod
```
