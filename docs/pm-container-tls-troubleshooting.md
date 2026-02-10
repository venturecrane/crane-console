# PM Container TLS Troubleshooting Guide

**Issue:** TLS certificate verification failures when calling Cloudflare Workers from PM Team container (Claude Desktop).

**Error:** `CERTIFICATE_VERIFY_FAILED:verify cert failed: verify SAN list`

## Quick Diagnosis

Run these commands from the PM container to identify the issue:

### 1. Check CA Certificates

```bash
# Verify CA bundle exists
ls -la /etc/ssl/certs/ca-certificates.crt

# Check CA bundle age
stat /etc/ssl/certs/ca-certificates.crt

# Update CA certs (requires root)
apt-get update && apt-get install -y ca-certificates
update-ca-certificates
```

### 2. Check for Proxy Interference

```bash
# Look for proxy env vars
env | grep -i proxy

# Check if proxy is intercepting TLS
curl -v https://crane-context.automation-ab6.workers.dev/health 2>&1 | grep -i "issuer\|subject"

# Expected: Cloudflare Inc certificate
# Problem: If you see a corporate proxy cert (e.g., Zscaler, Netskope)
```

### 3. Check Clock Skew

```bash
# Compare container time to actual time
date
# Certs will fail if clock is significantly off
```

### 4. Test with Different Options

```bash
# Test with verbose output
curl -v https://crane-context.automation-ab6.workers.dev/health

# Test with explicit TLS version
curl --tlsv1.2 https://crane-context.automation-ab6.workers.dev/health

# Test ignoring cert (NOT for production - just diagnosis)
curl -k https://crane-context.automation-ab6.workers.dev/health

# Test DNS resolution
nslookup crane-context.automation-ab6.workers.dev
```

## Likely Causes & Fixes

### Cause 1: Outdated CA Bundle (Most Common)

Cloudflare uses certificates signed by modern CAs. Old CA bundles may not include them.

**Fix:**

```bash
# Update CA certificates
apt-get update && apt-get install -y ca-certificates
update-ca-certificates

# Or download fresh bundle
curl -o /etc/ssl/certs/ca-certificates.crt https://curl.se/ca/cacert.pem
```

### Cause 2: Proxy Intercepting TLS

Some corporate environments use TLS-intercepting proxies (Zscaler, Netskope, etc.) that replace certificates.

**Symptoms:**

- Certificate issuer shows proxy CA, not Cloudflare
- Works with `-k` flag but fails otherwise
- Inconsistent behavior (some endpoints work, others don't)

**Fix:**

- Import proxy's CA certificate into container's trust store
- Or contact IT to whitelist Cloudflare domains

### Cause 3: Container Network Isolation

The container may be using a custom DNS or network configuration that breaks certificate validation.

**Fix:**

- Use Google DNS: `--dns 8.8.8.8` in docker run
- Or ensure container can reach public DNS

### Cause 4: Anthropic Platform Issue

If this is Claude Desktop on Anthropic infrastructure, the issue may be platform-level.

**Escalation:**

1. Document exact error message
2. Note which endpoints fail vs succeed
3. Include `curl -v` output
4. Contact Anthropic support

## Workaround Options

### Option A: Use Dev Team as Proxy

Route API calls through Dev Team when TLS fails:

1. Dev Team makes the API call
2. Returns result to PM Team
3. Document which calls were proxied

### Option B: Downgrade to HTTP (NOT RECOMMENDED)

If endpoints supported HTTP (they don't), this would bypass TLS.
**Do not use this for production.**

### Option C: WebFetch via Claude

If direct curl fails, Claude's WebFetch tool may use different network path:

```
Use WebFetch to call https://crane-context.automation-ab6.workers.dev/health
```

## Verification

After applying fixes, verify all endpoints work:

```bash
# Health checks
curl https://crane-context.automation-ab6.workers.dev/health
curl https://crane-relay.automation-ab6.workers.dev/health

# Authenticated endpoint (requires key)
curl -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
  https://crane-context.automation-ab6.workers.dev/docs
```

## Related

- Issue #66: TECH: TLS cert errors block PM Team container access
- Cloudflare certificate info: https://developers.cloudflare.com/ssl/
