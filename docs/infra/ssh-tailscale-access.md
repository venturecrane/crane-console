# SSH Access via Tailscale

Complete guide for accessing your Ubuntu server and Mac using SSH over Tailscale network.

## Setup Summary

**Status:** ✅ Fully configured and tested

**SSH Key:** `~/.ssh/id_ed25519` (created 2026-01-21)
**Config File:** `~/.ssh/config` (already configured)

### Available Hosts

| Alias        | Machine | IP Address     | User        | Purpose                         |
| ------------ | ------- | -------------- | ----------- | ------------------------------- |
| `mini`       | mini    | 100.105.134.85 | smdurgan    | Ubuntu server via Tailscale     |
| `mini-local` | mini    | 10.0.4.36      | smdurgan    | Ubuntu server via local network |
| `mac23`      | mac23   | 100.115.75.103 | scottdurgan | mac23 via Tailscale             |
| `localhost`  | mac23   | localhost      | scottdurgan | mac23 locally                   |

## Using Terminal App

### Basic SSH Commands

**Connect to Ubuntu server:**

```bash
ssh mini
```

**Connect to mac23 from another device:**

```bash
ssh mac23
```

**Test local SSH:**

```bash
ssh localhost
```

### Quick Tips

- No password required (uses SSH key authentication)
- Connection stays alive with ServerAliveInterval
- Works from anywhere via Tailscale network
- Use `mini-local` if Tailscale has issues

### Example Session

```bash
# Connect to Ubuntu
ssh mini

# You're now on the Ubuntu server
smdurgan@mini:~$ pwd
/home/smdurgan

# Select a repo and start working
ccs

# Exit when done
exit
```

## Using VS Code

### Setup (One-Time)

1. **Install Remote - SSH extension:**
   - Open VS Code
   - Press `Cmd+Shift+X` to open Extensions
   - Search for "Remote - SSH"
   - Install the extension by Microsoft

2. **Verify configuration:**
   - VS Code automatically uses `~/.ssh/config`
   - No additional setup needed

### Connecting to Ubuntu Server

1. **Open Command Palette:**
   - Press `Cmd+Shift+P`
   - Type "Remote-SSH: Connect to Host"

2. **Select host:**
   - Choose `mini` from the list
   - VS Code will open a new window connected to the server

3. **Open folder:**
   - Click "Open Folder"
   - Navigate to `/home/smdurgan/dev/crane-console` (or any project)
   - Start coding!

### VS Code Remote Features

- Full terminal access in integrated terminal
- IntelliSense and extensions run on remote machine
- Git operations work seamlessly
- File explorer shows remote files
- Debug remotely as if local

### Quick Commands

| Action       | Command Palette                          |
| ------------ | ---------------------------------------- |
| Connect      | `Remote-SSH: Connect to Host`            |
| Disconnect   | `Remote-SSH: Close Remote Connection`    |
| Open folder  | `File: Open Folder` (after connected)    |
| New terminal | `` Ctrl+` `` or `Terminal: New Terminal` |

## Tailscale Network

### Current Network Status

```
100.115.75.103  mac23        (macOS workstation)
100.105.134.85  mini         (Ubuntu server)
```

Check status anytime:

```bash
tailscale status
```

### Why Tailscale?

- Encrypted peer-to-peer connections
- Works across networks (home, mobile, remote)
- No port forwarding needed
- Private IP addresses (100.x.x.x range)
- Always-on, automatic reconnection

## Troubleshooting

### Connection Refused

**Check Tailscale status:**

```bash
tailscale status
```

**Try local network fallback:**

```bash
ssh mini-local
```

### Permission Denied

**Check SSH key:**

```bash
ls -la ~/.ssh/id_ed25519
# Should show: -rw------- (600 permissions)
```

**Fix permissions if needed:**

```bash
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub
```

### Host Key Changed

If you see "REMOTE HOST IDENTIFICATION HAS CHANGED":

```bash
ssh-keygen -R mini
# Or for specific IP:
ssh-keygen -R 100.105.134.85
```

### VS Code Can't Find Config

VS Code should auto-detect `~/.ssh/config`. If not:

1. Open VS Code settings (`Cmd+,`)
2. Search for "remote.SSH.configFile"
3. Verify it points to `/Users/scottdurgan/.ssh/config`

### Test Connections

**Test Ubuntu server:**

```bash
ssh mini "echo 'Success!'; hostname"
```

**Test mac23 (from another device):**

```bash
ssh mac23 "echo 'Success!'; hostname"
```

## Security Notes

- SSH keys are Ed25519 (modern, secure algorithm)
- Private key never leaves this machine
- Tailscale provides encrypted network layer
- No password authentication (key-only)
- ServerAliveInterval prevents stale connections

## Next Steps

### Enable Remote Login on mac23

If you need to access mac23 from other devices:

1. Open System Settings
2. Go to General > Sharing
3. Turn on "Remote Login"
4. Add your user account if not already listed

### Add More Tailscale Devices

1. Install Tailscale on device
2. Login with same account
3. Device automatically appears in network
4. Add to `~/.ssh/config` if needed

## Summary

**Terminal Access:**

- `ssh mini` → Ubuntu server
- `ssh mac23` → mac23 from another device

**VS Code Access:**

1. Install Remote - SSH extension
2. `Cmd+Shift+P` → "Remote-SSH: Connect to Host"
3. Select `mini`
4. Open folder and start coding

**Everything is ready to use!**
