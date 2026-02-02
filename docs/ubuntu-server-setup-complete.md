# Ubuntu Server Setup - Complete Summary

**Server:** smdmacmini (10.0.4.36)
**User:** smdurgan
**Date:** 2026-01-20

## ✅ What's Installed and Configured

### Core Tools
- ✅ **Git** - Version control
- ✅ **jq** - JSON parsing for scripts
- ✅ **curl** - HTTP requests
- ✅ **GitHub CLI (gh)** - Authenticated as smdurgan-llc
- ✅ **Node.js** - v22.22.0
- ✅ **npm** - v10.9.4
- ✅ **Wrangler CLI** - v4.59.3 (Cloudflare Workers deployment)
- ✅ **Claude Code CLI** - Installed at ~/.npm-global/bin/claude

### Environment Configuration
- ✅ **CRANE_CONTEXT_KEY** - Set in ~/.bashrc for API authentication
- ✅ **ccs command** - Shell function in ~/.bashrc for repo selection
- ✅ **SSH keys** - GitHub key generated and uploaded

### Repositories Cloned
- ✅ **crane-console** - ~/dev/crane-console
- ✅ **sc-console** - ~/dev/sc-console

## 🎯 Development Workflow

### Starting a Session

1. **SSH into the server** (from Mac, iPad, or iPhone via Terminus):
   ```bash
   ssh smdurgan@10.0.4.36
   ```

2. **Select a repo and launch Claude**:
   ```bash
   ccs
   ```
   - Select from list (durganfieldguide, venturecrane, siliconcrane repos)
   - Auto-clones if not present
   - Launches Claude Code CLI

3. **Start your day**:
   ```bash
   /sod
   ```
   - Loads session context from Crane Context API
   - Shows last handoff
   - Displays GitHub issues (P0, ready, in-progress, blocked)
   - Caches documentation to /tmp/crane-context/docs

### During Development

Available slash commands in Claude Code CLI:
- `/sod` - Start of day (load context, show work queue)
- `/eod` - End of day (create handoff for next session)
- `/update` - Update session context
- `/heartbeat` - Keep session alive during long tasks

### Deploying Workers

For Cloudflare Workers (crane-command, crane-context, crane-relay):

```bash
cd ~/dev/[repo]/workers/[worker-name]
npm install
wrangler deploy
```

**Note:** Make sure you're authenticated with Cloudflare first:
```bash
wrangler whoami  # Check auth status
wrangler login   # Login if needed
```

## 📋 Verification Checklist

Run these to verify everything works:

```bash
# 1. Verify environment
echo $CRANE_CONTEXT_KEY  # Should show your API key
type ccs                 # Should show ccs function definition

# 2. Verify CLI tools
gh auth status           # Should show authenticated as smdurgan-llc
node --version           # Should show v22.22.0
npm --version            # Should show v10.9.4
wrangler --version       # Should show v4.59.3
claude --version         # Should show Claude Code version

# 3. Test workflow
ccs                      # Should list all repos
# Select a repo, then in Claude:
/sod                     # Should load session successfully
```

## 🔐 Security Notes

- **CRANE_CONTEXT_KEY** - Stored in ~/.bashrc, authenticates with Crane Context API
- **GitHub SSH Key** - Stored at ~/.ssh/id_ed25519, uploaded to GitHub
- **Wrangler Auth** - Cloudflare credentials stored by wrangler login
- **gh Auth** - GitHub CLI credentials stored locally

## 📱 Access Methods

This setup works identically from:
- **Direct SSH** - From any machine
- **Terminus (iOS/iPadOS)** - Full terminal access on phone/tablet
- **Web SSH** - Any SSH client

The terminal-based interface is the same regardless of how you connect.

## 🚀 Ready for Development

You can now:
- ✅ Develop on **sc-console** (Silicon Crane)
- ✅ Develop on **dfg-console** (Durgan Field Guide) - clone when needed
- ✅ Develop on **vc-console** (Venture Crane) - clone when needed
- ✅ Deploy Cloudflare Workers with wrangler
- ✅ Use slash commands for session management
- ✅ Create GitHub issues and PRs with gh CLI
- ✅ Access from Mac, iPad, or iPhone

## 🆘 Troubleshooting

**"ccs: command not found"**
```bash
source ~/.bashrc
```

**"CRANE_CONTEXT_KEY not set"**
```bash
echo 'export CRANE_CONTEXT_KEY="your-key-here"' >> ~/.bashrc
source ~/.bashrc
```

**"Permission denied" when cloning repos**
```bash
gh auth status
# If not authenticated:
gh auth login
```

**"wrangler not authenticated"**
```bash
wrangler login
```

## 📝 Next Steps

To clone additional repos:
1. Run `ccs`
2. Select a repo marked "[not cloned]"
3. Confirm clone when prompted
4. Claude will launch in that repo

Or manually:
```bash
cd ~/dev
git clone git@github.com:durganfieldguide/dfg-console.git
# or
git clone git@github.com:venturecrane/vc-console.git
```

## 🎉 Complete!

Your Ubuntu server is now a fully functional development environment with the same capabilities as your Mac setup.
