# VS Code Remote-SSH Workflow Guide

Complete guide for using VS Code Remote-SSH to develop on remote servers from machine23.

## What You Have

✅ **VS Code** installed on machine23
✅ **Remote-SSH extension** installed (v0.122.0)
✅ **SSH config** with shortcuts to both servers
✅ **SSH keys** configured and working

## Quick Start

### Connect to Ubuntu Server

1. **Open VS Code** on machine23

2. **Open Command Palette:**
   - Press `Cmd+Shift+P`
   - Or: View → Command Palette

3. **Type:** `Remote-SSH: Connect to Host`

4. **Select:** `ubuntu` from the list

5. **New window opens:**
   - VS Code connects to Ubuntu server
   - Status bar shows: "SSH: ubuntu" (bottom left, green)

6. **Open folder:**
   - File → Open Folder
   - Navigate to: `/home/smdurgan/dev/crane-console`
   - Click OK

7. **Start coding!**
   - Full file explorer on left
   - Edit files normally
   - Integrated terminal at bottom

## First Connection

The first time you connect to a server, VS Code will:

1. Show connection progress in new window
2. Install VS Code Server on remote machine (automatic)
3. May ask to accept host fingerprint (type `yes`)
4. Takes 30-60 seconds first time

**This only happens once per server.**

After first connection, subsequent connections are fast (5-10 seconds).

## Connecting to machine23 (Optional)

You can also use Remote-SSH to connect to machine23 from another device:

1. On another Mac/PC with VS Code
2. Install Remote-SSH extension
3. Add this to SSH config:
   ```
   Host mac
       HostName 100.115.75.103
       User scottdurgan
       IdentityFile ~/.ssh/id_ed25519
   ```
4. Connect via `Remote-SSH: Connect to Host` → `mac`

**Most common use:** Develop on Ubuntu server from machine23.

## Full Workflow Example

### Morning: Start Development

1. **Open VS Code** on machine23

2. **Connect to Ubuntu:**
   - `Cmd+Shift+P` → `Remote-SSH: Connect to Host` → `ubuntu`

3. **Open project:**
   - File → Open Folder → `/home/smdurgan/dev/crane-console`

4. **Open terminal:**
   - Terminal → New Terminal (or `` Ctrl+` ``)

5. **Start your day:**
   ```bash
   /sod
   ```

6. **Work normally:**
   - Edit files in editor
   - Run commands in terminal
   - Git operations work seamlessly

### During Development

#### Edit Files
- Click files in explorer to open
- All editing happens on remote server
- IntelliSense works (after extension host starts)
- Search across files: `Cmd+Shift+F`

#### Run Commands
```bash
# In integrated terminal
npm install
npm run build
wrangler deploy

# Terminal is running on Ubuntu server
pwd
# Shows: /home/smdurgan/dev/crane-console
```

#### Git Operations

**Use terminal (recommended):**
```bash
git status
git add .
git commit -m "feat: add new feature"
git push
```

**Or use VS Code UI:**
- Click Source Control icon (sidebar)
- Stage changes, write commit message
- Push/pull via UI

#### Multiple Terminals
- Click **+** in terminal panel for new terminal
- All terminals run on Ubuntu server
- Use for: build watching, dev servers, monitoring

### End of Day

```bash
# In terminal
/eod
```

Disconnect:
- File → Close Remote Connection
- Or just close VS Code window

## Key Features

### File Explorer

- **Left sidebar** shows remote file system
- Right-click for context menu (new file, delete, rename, etc.)
- Drag & drop files to move them
- Search files: `Cmd+P`

### Integrated Terminal

- **Open:** `` Ctrl+` `` or Terminal → New Terminal
- **Multiple terminals:** Click + icon
- **Split terminal:** Click split icon
- **All commands run on remote server**

### Extensions

Extensions install in two places:

1. **Local extensions** (run on machine23):
   - Themes, keybindings, UI customization

2. **Remote extensions** (run on Ubuntu):
   - Language servers (TypeScript, Python, etc.)
   - Linters, formatters
   - Debuggers

**Install remote extensions:**
- Extensions panel → Search → Install
- VS Code asks: "Install locally or remotely?"
- Choose "Install on SSH: ubuntu"

**Recommended remote extensions:**
- ESLint
- Prettier
- GitLens
- Any language-specific extensions

### Debugging

1. Open file you want to debug
2. Set breakpoints (click left of line numbers)
3. Press `F5` to start debugging
4. Debugger runs on remote server
5. View variables, call stack, etc. in VS Code

### Port Forwarding (Automatic)

If you run a dev server on Ubuntu:
```bash
npm run dev
# Listening on http://localhost:3000
```

VS Code automatically forwards the port to machine23.
Open browser on machine23: `http://localhost:3000`

**Manual port forwarding:**
- Ports panel (next to terminal)
- Add Port → Enter port number

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Command Palette | `Cmd+Shift+P` |
| Quick Open File | `Cmd+P` |
| New Terminal | `` Ctrl+` `` |
| Toggle Sidebar | `Cmd+B` |
| Find in Files | `Cmd+Shift+F` |
| Git: Commit | `Cmd+Enter` (in SCM) |
| Save File | `Cmd+S` |
| Close Tab | `Cmd+W` |

## Common Tasks

### Open Different Project

**Without disconnecting:**
1. File → Open Folder
2. Choose different folder on Ubuntu
3. VS Code reloads with new folder

**Or reconnect:**
1. File → Close Remote Connection
2. `Cmd+Shift+P` → Connect to Host → ubuntu
3. Open different folder

### Switch Between Repos

```bash
# In integrated terminal
cd ~/dev/sc-console
# Now terminal is in different repo

# To reload VS Code with new folder:
code .
```

Or use ccs script:
```bash
ccs
# Select different repo
# Opens in VS Code if available
```

### Deploy Workers

```bash
# In terminal
cd workers/crane-command
npm install
wrangler deploy
```

All output appears in terminal as if you were SSH'd in.

### Run Claude Code CLI

**Option 1: In VS Code terminal**
```bash
ccs
/sod
# Claude responds in terminal
```

**Option 2: Separate terminal session**
- Use Mac Terminal app → `ssh ubuntu` → `ccs`
- Keep VS Code for editing, terminal for Claude

**Hybrid approach (recommended):**
- VS Code: Heavy coding, multi-file edits
- Terminal app: Claude sessions
- Both connected to same server, same files

### Copy Files Between Local and Remote

**Upload to remote:**
- Drag file from Finder into VS Code explorer
- File uploads to Ubuntu

**Download from remote:**
- Right-click file in explorer → Download
- Saves to machine23

**Or use scp:**
```bash
# Upload
scp local-file.txt ubuntu:/home/smdurgan/dev/

# Download
scp ubuntu:/home/smdurgan/dev/remote-file.txt ~/Downloads/
```

## Troubleshooting

### "Could not establish connection to ubuntu"

**Check SSH works:**
```bash
# In machine23 terminal
ssh ubuntu "echo connected"
```

If SSH works but VS Code doesn't:
- `Cmd+Shift+P` → "Remote-SSH: Kill VS Code Server on Host"
- Try connecting again

### "VS Code Server failed to start"

1. Connect via regular SSH:
   ```bash
   ssh ubuntu
   ```

2. Remove VS Code Server:
   ```bash
   rm -rf ~/.vscode-server
   ```

3. Disconnect and reconnect in VS Code

### Extensions Not Working

**Check extension location:**
- Extensions panel → Search for extension
- Look for "Install on SSH: ubuntu" button
- Click to install remotely

**Reload window:**
- `Cmd+Shift+P` → "Developer: Reload Window"

### Slow Connection

**Check network:**
```bash
# On machine23
tailscale status
ping 100.105.134.85
```

**Try local network:**
1. Edit SSH config temporarily:
   ```
   Host ubuntu
       HostName 10.0.4.36  # Use local IP
   ```
2. Reconnect in VS Code

### Can't Save Files

**Check permissions:**
```bash
# Via SSH
ssh ubuntu
ls -la ~/dev/crane-console
# Should show smdurgan as owner
```

**Reload window:**
- `Cmd+Shift+P` → "Developer: Reload Window"

## Tips & Best Practices

### Multiple Projects

Open multiple VS Code windows for different projects:

1. Connect to ubuntu
2. Open first project: `/home/smdurgan/dev/crane-console`
3. File → New Window
4. In new window: Connect to ubuntu again
5. Open second project: `/home/smdurgan/dev/sc-console`

Each window is independent.

### Workspace Settings

Settings sync between local and remote automatically.

**Remote-specific settings:**
1. File → Preferences → Settings
2. Click "Remote [SSH: ubuntu]" tab
3. Changes only apply when connected to Ubuntu

### Terminal Shell

By default, VS Code uses bash on Ubuntu.

**Change shell:**
- Terminal panel → Click dropdown next to + → Select Default Profile
- Choose bash, zsh, sh, etc.

### Disconnect Safely

**Always save files first.**

Then:
- File → Close Remote Connection
- Or just close VS Code window

VS Code Server keeps running on Ubuntu for fast reconnection.

### Keep Sessions Separate

**Recommended workflow:**

**machine23 Terminal:**
- SSH sessions
- Claude Code CLI
- Quick commands

**VS Code Remote:**
- File editing
- Multi-file refactoring
- Visual git operations
- Debugging

Both access same files, but different interfaces.

## Advanced Features

### SSH Config Customization

Edit `~/.ssh/config` to customize connection:

```
Host ubuntu
    HostName 100.105.134.85
    User smdurgan
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3

    # Keep connection alive longer
    TCPKeepAlive yes

    # Faster connection reuse
    ControlMaster auto
    ControlPath /tmp/ssh-%r@%h:%p
    ControlPersist 10m
```

Restart VS Code to apply changes.

### VS Code Settings for Remote

Add to VS Code settings (JSON):

```json
{
  "remote.SSH.showLoginTerminal": true,
  "remote.SSH.remotePlatform": {
    "ubuntu": "linux"
  },
  "remote.SSH.connectTimeout": 30
}
```

### Extension Recommendations

Create `.vscode/extensions.json` in project:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "eamodio.gitlens"
  ]
}
```

VS Code prompts to install when opening project.

## Quick Reference

```bash
# Connect to Ubuntu server
Cmd+Shift+P → Remote-SSH: Connect to Host → ubuntu

# Open project folder
File → Open Folder → /home/smdurgan/dev/crane-console

# New terminal
Ctrl+`

# Run commands (in terminal)
npm install
npm run build
wrangler deploy
git status

# Disconnect
File → Close Remote Connection
```

## Comparison: VS Code vs Terminal

| Feature | VS Code Remote-SSH | Terminal SSH |
|---------|-------------------|--------------|
| File editing | Visual editor, IntelliSense | vim/nano |
| Multi-file edit | Easy, side-by-side | Harder |
| Git operations | Visual UI + terminal | Terminal only |
| Debugging | Full debugger | Console logs |
| File explorer | Visual tree | ls/cd |
| Search files | GUI search | grep/find |
| Best for | Heavy coding | Quick edits, Claude |

**Use both!** They complement each other.

## Summary

**VS Code Remote-SSH gives you:**
- Full IDE experience on remote Ubuntu server
- All files stay on server
- Integrated terminal, git, debugging
- IntelliSense and language servers
- Automatic port forwarding
- Extensions run remotely

**Perfect for:**
- Multi-file refactoring
- Complex code changes
- Visual debugging
- Git operations with UI
- Extended coding sessions

**Start developing:**
1. Open VS Code
2. `Cmd+Shift+P` → Remote-SSH: Connect to Host → ubuntu
3. Open Folder → `/home/smdurgan/dev/crane-console`
4. Code away!

**Status:** Ready to use right now.
