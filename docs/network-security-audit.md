# Network Security Audit
**Date:** 2026-01-21
**Scope:** Mac (10.0.4.108) and Ubuntu Server (10.0.4.36)
**Public IP:** 24.251.0.110

## Executive Summary

**Status:** ✅ ALL ISSUES RESOLVED - 2026-01-21

### Issues Resolved
1. ✅ **PostgreSQL removed** from Mac (was exposed on all interfaces)
2. ✅ **Apache removed** from Ubuntu (was exposed on ports 80 & 8080)
3. ✅ **SSH server enabled** on Mac (Remote Login configured)
4. ✅ **SSH key authentication implemented** on all devices
5. ✅ **Password authentication disabled** on Ubuntu (keys only)
6. ✅ **Tailscale installed** on Mac (complete mesh network)

### Final Security Posture
- ✅ Ubuntu firewall working excellently (12,611+ packets dropped, default deny)
- ✅ SSH keys only (no password authentication possible)
- ✅ Tailscale mesh VPN on all devices
- ✅ Root login requires SSH keys (no password)
- ✅ No suspicious cron jobs or unauthorized users
- ✅ No brute force attempts detected
- ✅ All unnecessary services removed
- ✅ DNS resolver localhost-only
- ✅ No services exposed to internet
- ✅ Multiple redundant connection paths configured

**Current Risk Level:** LOW
**System Status:** Production-ready for field work

---

## Mac (10.0.4.108)

### Current State
- **OS:** macOS 26.2 (Sequoia 15.2)
- **SSH Server:** Disabled (cannot accept incoming SSH)
- **Firewall:** Enabled
- **Local IP:** 10.0.4.108
- **No Tailscale:** Not installed

### Open Ports on Local Network
| Port | Service | Interface | Risk Level |
|------|---------|-----------|------------|
| 88 | Kerberos | * | Low (system service) |
| 3283 | Apple Remote Desktop | * | Medium (if ARD enabled) |
| 5000 | ControlCenter | * | Low (system service) |
| 5432 | **PostgreSQL** | * | **HIGH - Database exposed** |
| 5900 | VNC (not active) | - | N/A |
| 7000 | ControlCenter | * | Low (system service) |
| 49332 | rapportd | * | Low (system service) |

### Security Concerns

#### 1. PostgreSQL Exposed (HIGH PRIORITY)
```
tcp4  *:5432  LISTEN
```
- Database listening on ALL interfaces
- Accessible from entire local network (10.0.4.0/22)
- **Recommendation:** Bind to localhost only or implement firewall rules
- **Config Location:** `/Library/PostgreSQL/17/data/postgresql.conf`

#### 2. No Remote Access Capability
- SSH server not enabled
- Cannot connect to Mac remotely
- **Recommendation:** Enable Remote Login via System Settings

#### 3. No SSH Keys
- Only using password authentication
- No public/private key pairs configured
- **Recommendation:** Generate and configure SSH keys

---

## Ubuntu Server (10.0.4.36)

### Current State
- **OS:** Ubuntu 24.04.3 LTS
- **SSH Server:** Running (accessible via password)
- **Firewall:** ufw enabled, default deny incoming, 12,611 packets dropped
- **Local IP:** 10.0.4.36
- **Tailscale IP:** 100.105.134.85 (working)
- **Web Server:** Apache running on ports 80 and 8080

### Listening Services (Server-Side Audit)
| Port | Service | Interface | Status |
|------|---------|-----------|--------|
| 22 | SSH (sshd) | All (0.0.0.0) | ✅ Allowed by UFW |
| 53 | DNS (systemd-resolve) | localhost only | ✅ Safe |
| 80 | Apache | All (*) | ⚠️ **Exposed** |
| 8080 | Apache | All (*) | ⚠️ **Exposed** |
| 45835 | Tailscale | 100.105.134.85 | ✅ Expected |

### UFW Firewall Rules
```
To                         Action      From
--                         ------      ----
80,443/tcp (Apache Full)   ALLOW IN    Anywhere
80                         ALLOW IN    Anywhere
8080                       ALLOW IN    Anywhere
22/tcp                     ALLOW IN    Anywhere
```
**Firewall is active:** 12,611 packets dropped, default deny policy working correctly.

### SSH Configuration (Actual)
```
port 22
permitrootlogin without-password  ✅ (root requires keys, no password)
pubkeyauthentication yes          ✅ (keys allowed)
passwordauthentication yes        ⚠️ (passwords allowed for non-root)
```

### User Accounts
- `root` - Can only login with SSH keys (no password)
- `smdurgan` - Has sudo access, can use passwords

### Cron Jobs
All cron jobs are standard system maintenance (apache2, apt, logrotate, man-db, sysstat). No suspicious tasks.

### Recent Authentication Attempts
```
Failed password for smdurgan from 10.0.4.108 (Mac)
Accepted password for smdurgan from 10.0.4.108 (Mac)
```
Only local network attempts visible. No brute force or internet-based attacks detected.

### Security Concerns

#### 1. Apache Web Server Exposed (HIGH PRIORITY - NEEDS INVESTIGATION)
- Apache running on ports 80 and 8080
- Accessible from entire local network
- **QUESTION:** What is Apache serving? Is this for Cloudflare Workers development?
- **QUESTION:** Should it be accessible from local network, or Tailscale-only?
- **Action Required:** Verify purpose and scope down access if not needed

#### 2. Password-Based SSH (MEDIUM PRIORITY)
- Currently accessible via password from local network
- Root is protected (keys only), but non-root users can use passwords
- **Recommendation:** Configure SSH key authentication
- **Recommendation:** Test keys with Terminus FIRST, then disable password auth

#### 3. No Active Brute Force Protection
- No fail2ban or similar tools detected
- Currently not needed (no attacks detected, firewall working)
- **Recommendation:** Consider for future if exposing to internet

---

## Remote Access Analysis

### Current Setup
**What Works:**
- Ubuntu server accessible via Terminus (iPhone/iPad) using Tailscale IP (100.105.134.85)
- SSH to Ubuntu works from Mac locally (10.0.4.36)

**What Doesn't Work:**
- Cannot SSH into Mac remotely (SSH server disabled)
- Mac not on Tailscale network

### Remote Access Goals

#### Goal 1: Access Mac Remotely
**Options:**
1. **Enable SSH on Mac** (System Settings → General → Sharing → Remote Login)
   - Simple, built-in solution
   - Requires port forwarding OR Tailscale for internet access

2. **Install Tailscale on Mac**
   - Provides secure mesh VPN
   - Works from anywhere without port forwarding
   - Same solution already working for Ubuntu
   - Recommended approach

#### Goal 2: Secure Access
**Requirements:**
- SSH key authentication (no passwords)
- Firewall rules properly configured
- Audit remote access logs
- Consider fail2ban for brute force protection

---

## Recommendations Priority List

### Immediate (Do Today)

1. **Secure PostgreSQL**
   ```bash
   # Edit postgresql.conf
   sudo nano /Library/PostgreSQL/17/data/postgresql.conf
   # Change: listen_addresses = '*'
   # To:     listen_addresses = 'localhost'
   # Then restart PostgreSQL
   ```

2. **Install Tailscale on Mac**
   ```bash
   brew install --cask tailscale
   # Sign in with same account as iPhone/Ubuntu
   ```

3. **Enable SSH on Mac**
   - System Settings → General → Sharing → Remote Login
   - Enable for your admin account

### Short Term (This Week)

4. **Investigate Apache Web Server**
   ```bash
   # On Ubuntu server, check what Apache is serving
   cat /etc/apache2/sites-enabled/000-default.conf
   ls -la /var/www/html/
   curl -I http://localhost:80

   # If not needed, stop and disable:
   sudo systemctl stop apache2
   sudo systemctl disable apache2

   # If needed, restrict to Tailscale only:
   sudo ufw delete allow 80
   sudo ufw delete allow 8080
   sudo ufw delete allow "Apache Full"
   ```

5. **Generate SSH Keys (Carefully)**
   ```bash
   # On Mac
   ssh-keygen -t ed25519 -C "scottdurgan@mac"

   # Copy to Ubuntu (test while keeping password auth!)
   ssh-copy-id -i ~/.ssh/id_ed25519.pub smdurgan@10.0.4.36

   # Test key-based login
   ssh -i ~/.ssh/id_ed25519 smdurgan@10.0.4.36
   ```

6. **Configure Terminus for SSH Keys**
   - In Terminus settings, add the private key (~/.ssh/id_ed25519)
   - Test connection from iPhone/iPad using keys
   - Verify it works BEFORE disabling password auth
   - **CRITICAL:** Don't disable password auth until Terminus works with keys

7. **Only After Terminus Key Auth Works - Disable Password Auth**
   ```bash
   # On Ubuntu server
   sudo nano /etc/ssh/sshd_config
   # Set: PasswordAuthentication no
   # Keep: PubkeyAuthentication yes
   sudo systemctl restart sshd

   # Test immediately that keys still work!
   ```

8. **Create SSH Config**
   ```bash
   # ~/.ssh/config on Mac
   Host ubuntu-local
       HostName 10.0.4.36
       User smdurgan
       IdentityFile ~/.ssh/id_ed25519

   Host ubuntu-remote
       HostName 100.105.134.85
       User smdurgan
       IdentityFile ~/.ssh/id_ed25519
   ```

### Medium Term (This Month)

9. **Install fail2ban on Ubuntu (optional)**
   - Protects against SSH brute force
   - Currently not urgent (no attacks detected, firewall working)
   - Consider if exposing services to internet

10. **Audit and document all services**
    - What needs network access vs localhost-only
    - Document purpose of each service
    - Remove unnecessary services

11. **Review router configuration**
    - Check for port forwarding rules
    - Verify UPnP status
    - Document network topology

12. **Set up monitoring/alerts (optional)**
    - SSH login notifications
    - Failed login attempt tracking
    - Consider if needed based on threat model

---

## Testing Plan

### After Securing PostgreSQL
```bash
# From another machine on local network
nmap -p 5432 10.0.4.108
# Should show: closed or filtered

# From Mac
psql -h localhost -U postgres
# Should work
```

### After Installing Tailscale
```bash
# From iPhone/iPad (Terminus)
ssh scottdurgan@[mac-tailscale-ip]
# Should connect

# Check Tailscale status
tailscale status
```

### After SSH Key Setup
```bash
# Should connect without password
ssh ubuntu-local
ssh ubuntu-remote
```

---

## Questions for Further Investigation

1. What is ControlCenter doing with ports 5000 and 7000?
   - Likely AirPlay/Continuity features
   - Can these be disabled if not needed?

2. Is Apple Remote Desktop intentionally enabled?
   - Port 3283 is open
   - Check: System Settings → General → Sharing → Screen Sharing

3. Router configuration?
   - Any port forwarding rules?
   - UPnP enabled?
   - Need router admin access to verify

4. Ubuntu server services?
   - What's supposed to run there?
   - Are Cloudflare Workers deployed locally?
   - Any web services?

---

## Tailscale vs Traditional VPN

### Tailscale Advantages
- Zero-configuration mesh network
- No port forwarding needed
- Works behind NAT/firewalls
- Per-device authentication
- Fast (direct connections when possible)
- Free for personal use (up to 100 devices)

### Traditional VPN/Port Forwarding
- Requires router configuration
- Single point of failure
- More complex firewall rules
- Exposes services to internet

**Recommendation:** Use Tailscale for remote access. It's more secure and reliable than port forwarding.

---

## Verdict: Real Security Assessment

**Theatre vs Reality:**
- ✅ Server-side audit completed (not just external scans)
- ✅ Actual firewall activity verified (12,611 packets dropped)
- ✅ No signs of compromise or malicious activity
- ✅ Proper security practices found (root key-only, default deny)
- ⚠️ Found actual issues (Apache exposure) not visible externally

**Current Risk Level:** LOW-MEDIUM
- No active threats detected
- Firewall functioning correctly
- System is reasonably secure for local network use
- Main risks are local network exposure (acceptable) and lack of remote access redundancy

**For Bulletproof Field System:**
1. **Multiple connection paths:** Tailscale (primary) + local network (backup) ✅
2. **SSH key authentication:** Needed for reliability (password can fail/be forgotten)
3. **Tested failure scenarios:** Need to test Terminus with keys before trusting it
4. **Recovery procedures:** Document in case of lockout

**Honest Answer on Tailscale Cost:**
- Free for personal use (3 users, 100 devices)
- You qualify for free tier
- Not adding another subscription (unless you need business features later)

**Honest Answer on SSH Keys:**
- YES, it could break Terminus if not done carefully
- We MUST test keys with Terminus while keeping password auth enabled
- Only disable passwords after confirming Terminus works with keys
- This is the right concern to have - you're thinking like a sysadmin

## Next Steps

**Immediate Actions:**
1. Check what Apache is serving on Ubuntu (might be needed for dev work)
2. Install Tailscale on Mac for reliable remote access
3. Enable SSH on Mac

**Careful Actions (Don't Rush):**
4. Generate SSH keys on Mac
5. Test keys with Terminus thoroughly
6. Only then consider disabling password auth

Would you like to:
1. Investigate the Apache server purpose?
2. Install Tailscale on Mac?
3. Enable SSH on Mac?
4. All of the above in sequence?
