# Remote Access Configuration - Final Setup
**Date:** 2026-01-21
**Status:** ✅ Complete and Tested

## Summary

Bulletproof remote access system configured for field work without MacBook. All devices can access Ubuntu server securely from anywhere using SSH keys and Tailscale.

---

## What Was Completed

### 1. Network Infrastructure
- ✅ **Tailscale installed** on all devices (Mac, Ubuntu, iPhone, iPad)
- ✅ **Mesh VPN** created - all devices can reach each other from anywhere
- ✅ **No port forwarding** needed - works behind any firewall/NAT

### 2. SSH Security
- ✅ **ED25519 SSH keys** generated on Mac
- ✅ **Public key** deployed to Ubuntu server
- ✅ **Password authentication disabled** - keys only (more secure)
- ✅ **SSH server enabled** on Mac for remote access

### 3. Application Setup
- ✅ **Termius** installed and configured on all devices
- ✅ **SSH keys synced** via Termius cloud (smdurgan@smdurgan.com account)
- ✅ **Hosts configured** for easy access

### 4. Security Hardening
- ✅ **Apache removed** from Ubuntu (unnecessary service)
- ✅ **PostgreSQL removed** from Mac (exposed database)
- ✅ **Firewall active** on Ubuntu (12,611+ packets dropped)
- ✅ **Root login secured** (SSH keys only, no password)

---

## Device Inventory

### Mac (mac23)
- **Local IP:** 10.0.4.108
- **Tailscale IP:** 100.115.75.103
- **SSH:** Enabled (port 22)
- **SSH Keys:** ~/.ssh/id_ed25519 (private), ~/.ssh/id_ed25519.pub (public)

### Ubuntu Server (mini)
- **Local IP:** 10.0.4.36
- **Tailscale IP:** 100.105.134.85
- **SSH:** Enabled, key-only authentication
- **Authorized Keys:** ~/.ssh/authorized_keys (contains Mac's public key)

### iPhone (iphone182)
- **Tailscale IP:** 100.121.244.23
- **Termius:** Configured with SSH keys

### iPad (ipad-mini-6th-gen-wifi)
- **Tailscale IP:** 100.104.214.18
- **Termius:** Configured with SSH keys

---

## How to Connect

### From Mac Terminal (Quick Commands)

```bash
# Connect to Ubuntu via Tailscale (works from anywhere)
ssh mini

# Connect to Ubuntu via local network (when on same WiFi)
ssh mini-local

# Connect to Mac remotely via Tailscale
ssh mac23
```

### From iPhone/iPad (Termius)

1. Open Termius app
2. Tap on **100.105.134.85** or **Ubuntu (Tailscale)** host
3. Connects automatically using SSH keys (no password)

### From Mac (Termius)

1. Open Termius app
2. Click on **Ubuntu (Tailscale)** host
3. Connects automatically using SSH keys

---

## Connection Methods

### Method 1: Tailscale (Recommended - Works Everywhere)

**Pros:**
- Works from anywhere (coffee shop, travel, cellular)
- No configuration needed
- Encrypted automatically
- Survives network changes

**Cons:**
- Requires internet connection
- Slightly higher latency (~200ms)

**When to use:** Default choice for remote work

### Method 2: Local Network

**Pros:**
- Faster (low latency)
- No internet required

**Cons:**
- Only works when on same local network
- Less reliable (we experienced the post-reboot delay issue)

**When to use:** When on home network and speed matters

---

## SSH Configuration Files

### Mac: ~/.ssh/config
```
Host mini
    HostName 100.105.134.85
    User smdurgan
    IdentityFile ~/.ssh/id_ed25519

Host mini-local
    HostName 10.0.4.36
    User smdurgan
    IdentityFile ~/.ssh/id_ed25519

Host mac23
    HostName 100.115.75.103
    User scottdurgan
    IdentityFile ~/.ssh/id_ed25519
```

### Ubuntu: /etc/ssh/sshd_config
Key settings:
```
Port 22
PermitRootLogin without-password
PubkeyAuthentication yes
PasswordAuthentication no  # DISABLED for security
```

---

## Recovery Procedures

### If You Can't Connect to Ubuntu

**Scenario 1: "Permission denied (publickey)"**
- Cause: SSH key not found or not authorized
- Solution: Use existing password-based connection to re-add key
- **IMPORTANT:** Password auth is disabled, so you MUST have physical access or another user account

**Scenario 2: "No route to host" (local network)**
- Cause: Network initialization delay or connectivity issue
- Solution: Wait 30 minutes after Mac reboot, OR use Tailscale IP instead

**Scenario 3: Tailscale not working**
- Check if Tailscale app is running (menu bar icon on Mac)
- Run: `tailscale status` to verify connection
- Restart Tailscale if needed

### If You Lost Your SSH Keys

**Prevention (do this now):**
```bash
# Backup your private key to secure location
cp ~/.ssh/id_ed25519 ~/Documents/backup-ssh-key-2026-01-21.key
chmod 600 ~/Documents/backup-ssh-key-2026-01-21.key
```

**If keys are lost:**
1. Physical access to Ubuntu server required
2. Generate new keys: `ssh-keygen -t ed25519`
3. Copy new public key to server
4. Update Termius with new key

### Emergency Access to Ubuntu

**If SSH completely fails:**
- You need **physical access** to the Ubuntu machine
- Connect keyboard/monitor directly
- Login with password at console
- Fix SSH configuration from there

**Important:** Keep one backup authentication method (USB key with public key, or know the root password)

---

## Maintenance

### Monthly Tasks

1. **Update Tailscale** (if prompted)
2. **Check SSH logs** for suspicious activity:
   ```bash
   sudo tail -50 /var/log/auth.log | grep -E "Failed|Accepted"
   ```
3. **Verify backups** of SSH keys

### After Adding New Device

1. Install Tailscale on new device
2. Sign in to Tailscale with smdurgan@smdurgan.com
3. Install Termius (if mobile/tablet)
4. Sign in to Termius with smdurgan@smdurgan.com
5. Keys and hosts will sync automatically

---

## Security Posture

### What's Secure ✅

- SSH keys only (no password guessing possible)
- Tailscale encrypted mesh network
- Firewall active and dropping unwanted traffic
- No unnecessary services running
- Root login requires SSH keys

### Current Risk Level: LOW

- No active threats detected
- No services exposed to internet
- Strong authentication in place
- Multiple connection paths for redundancy

### Remaining Considerations

1. **SSH Key Backup:** Store encrypted backup of private key in secure location
2. **Emergency Access:** Consider documenting a recovery method if keys are lost
3. **Monitoring:** Could add fail2ban for extra protection (not urgent)

---

## Testing Results

All tests passed:

| Test | Result | Date |
|------|--------|------|
| Mac → Ubuntu via Tailscale (SSH keys) | ✅ Pass | 2026-01-21 |
| Mac → Ubuntu via Termius | ✅ Pass | 2026-01-21 |
| iPhone → Ubuntu via Termius | ✅ Pass | 2026-01-21 |
| iPad → Ubuntu via Termius | ✅ Pass | 2026-01-21 |
| Password authentication disabled | ✅ Pass | 2026-01-21 |
| SSH config shortcuts working | ✅ Pass | 2026-01-21 |

---

## Quick Reference Commands

### Check Tailscale Status
```bash
tailscale status
```

### Test SSH Connection
```bash
ssh mini "echo 'Connection test' && hostname"
```

### View SSH Keys
```bash
ls -la ~/.ssh/id_ed25519*
```

### Check Ubuntu SSH Service
```bash
ssh mini "sudo systemctl status sshd"
```

### View Ubuntu Firewall
```bash
ssh mini "sudo ufw status verbose"
```

---

## Troubleshooting

### Termius Sync Not Working

**Problem:** Keys or hosts not appearing on other devices

**Solution:**
1. Verify same account (smdurgan@smdurgan.com) on all devices
2. Force sync: Settings → Account → Sync now (on Mac)
3. Pull to refresh on mobile devices
4. Wait 5 minutes for cloud sync

### Can't Connect After macOS Update

**Problem:** "No route to host" on local network after Mac reboot

**Solution:**
- Wait 30 minutes for network stack to initialize, OR
- Use Tailscale IP instead: `ssh mini` (configured for Tailscale)

### Tailscale IP Changed

**Problem:** Tailscale assigns different IP addresses

**Solution:** Tailscale IPs are stable but can change. Update SSH config if needed:
```bash
# Check current Tailscale IPs
tailscale status

# Update ~/.ssh/config with new IP if changed
```

---

## Success Criteria Met ✅

- ✅ Multiple connection paths (Tailscale + local network)
- ✅ SSH key authentication working from all devices
- ✅ Tested with Termius on iPhone/iPad
- ✅ Password authentication disabled
- ✅ No lockouts (keys tested before disabling passwords)
- ✅ Documented recovery procedures
- ✅ Easy-to-use shortcuts configured

**System is ready for field work without MacBook!**
