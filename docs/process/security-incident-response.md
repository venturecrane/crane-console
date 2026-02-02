# Security Incident Response Playbook

**Version:** 1.0
**Date:** February 2, 2026
**Purpose:** Procedures for handling security incidents including credential compromise

---

## Incident Classification

| Severity | Description | Response Time |
|----------|-------------|---------------|
| P0 | Active breach, data exfiltration, compromised production | Immediate |
| P1 | Credential exposed (GitHub, Cloudflare, etc.) | < 1 hour |
| P2 | Vulnerability discovered, not exploited | < 24 hours |
| P3 | Security improvement needed | Next sprint |

---

## Escalation Chain

### Primary Contact
**Captain (Scott Durgan)**
- Phone: Check Bitwarden "Emergency Contacts"
- Signal: Same number
- GitHub: @smdurgan

### Secondary (if Captain unavailable)
- Escalate to venture-specific contacts
- See venture CLAUDE.md files for backup contacts

### External Resources (if needed)
- Cloudflare Support: dashboard.cloudflare.com/support
- GitHub Security: security@github.com
- Anthropic (if AI-related): support@anthropic.com

---

## Incident Response Procedures

### Step 1: Contain

**Immediately upon discovery:**

1. **STOP** current work
2. **Document** what you observed (time, system, evidence)
3. **Do NOT** attempt to "fix" without containment
4. **Notify** Captain via fastest channel

**Containment actions by type:**

| Credential Type | Containment Action |
|-----------------|-------------------|
| GitHub PAT | Revoke at github.com/settings/tokens |
| Cloudflare API | Revoke at dash.cloudflare.com/profile/api-tokens |
| Bitwarden | Change master password, invalidate sessions |
| SSH Key | Remove from all authorized_keys |
| Relay Key | Rotate via Cloudflare Worker env |
| Database | Rotate D1 credentials if applicable |

### Step 2: Assess

**Determine scope:**

- What credential/system was compromised?
- When did exposure occur? (check git history)
- What access does this credential grant?
- What actions could have been taken?

**Audit logs to check:**

| System | Log Location |
|--------|--------------|
| GitHub | Settings > Security log |
| Cloudflare | Account > Audit Log |
| Workers | Cloudflare dashboard > Workers > Logs |
| D1 | Query recent writes if applicable |

### Step 3: Remediate

**Credential Rotation:**

```bash
# GitHub PAT
# 1. Go to github.com/settings/tokens
# 2. Revoke compromised token
# 3. Generate new token with same scopes
# 4. Update in Bitwarden
# 5. Update in all locations using it

# Cloudflare API Token
# 1. Go to dash.cloudflare.com/profile/api-tokens
# 2. Revoke compromised token
# 3. Create new token with same permissions
# 4. Update in Bitwarden
# 5. Update in all Worker environments

# Relay Key
wrangler secret put RELAY_KEY
# Enter new key, update all clients

# Environment Variables
wrangler secret put <SECRET_NAME>
# For each affected Worker
```

**Update all consumers:**

- [ ] Local .env files
- [ ] Bitwarden vault
- [ ] GitHub Actions secrets
- [ ] Worker environment variables
- [ ] Any other systems using the credential

### Step 4: Verify

**Confirm remediation:**

- [ ] Old credential no longer works
- [ ] New credential works in all systems
- [ ] No unauthorized changes in audit logs
- [ ] All affected systems back to normal

**Test commands:**

```bash
# Test GitHub PAT
gh auth status

# Test Cloudflare API
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CF_API_TOKEN"

# Test Relay
curl -s "https://crane-relay.automation-ab6.workers.dev/health" \
  -H "Authorization: Bearer $RELAY_KEY"
```

### Step 5: Document

**Create incident report:**

```markdown
## Security Incident Report

**Date:** YYYY-MM-DD
**Severity:** P0/P1/P2/P3
**Type:** Credential exposure / Vulnerability / etc.

### Timeline
- HH:MM - Discovery
- HH:MM - Containment started
- HH:MM - Assessment complete
- HH:MM - Remediation complete
- HH:MM - Verification complete

### Impact
- What was exposed
- Duration of exposure
- Actions taken with compromised credential (if any)

### Root Cause
- How did the exposure occur?

### Remediation
- Actions taken to contain
- Credentials rotated
- Systems updated

### Lessons Learned
- What could prevent this in the future?

### Action Items
- [ ] Item 1
- [ ] Item 2
```

---

## Specific Scenarios

### Credential Committed to Git

1. **DON'T** just delete and push (history remains)
2. **Revoke** the credential immediately
3. **Create** new credential
4. **Consider** git history rewrite if needed
5. **Update** all systems with new credential

```bash
# If you need to remove from history (use with caution):
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch path/to/file" \
  --prune-empty --tag-name-filter cat -- --all

# Force push (requires admin approval)
git push origin --force --all
```

### Suspicious Activity Detected

1. **Capture** evidence (screenshots, logs)
2. **Check** audit logs for unauthorized actions
3. **Rotate** affected credentials
4. **Review** recent changes for tampering
5. **Report** to Captain

### GitHub Secret Scanning Alert

1. **Navigate** to Security tab > Secret scanning alerts
2. **Review** the exposed secret
3. **Revoke** immediately
4. **Mark** alert as resolved
5. **Document** in incident report

---

## Prevention Measures

### Pre-Commit Hooks
- Secret detection enabled (see `.pre-commit-config.yaml`)
- Blocks commits containing credentials

### GitHub Features
- Secret scanning enabled
- Push protection enabled
- Dependabot alerts enabled

### Best Practices
- Never commit secrets to git
- Use environment variables
- Rotate credentials regularly (quarterly)
- Least-privilege access
- Document all credential usage in Bitwarden

---

## Credential Inventory

See `secrets-inventory.md` for complete list of:
- What credentials exist
- Where they're stored
- What they access
- Rotation schedule

---

## Post-Incident Review

Within 48 hours of P0/P1 incident:

1. **Schedule** review meeting
2. **Review** timeline and actions
3. **Identify** root cause
4. **Create** action items to prevent recurrence
5. **Update** this playbook if needed

### Review Questions

- Was detection timely?
- Was response appropriate?
- Were the right people notified?
- Did containment work?
- What could be automated?
- What documentation was missing?

---

## Related Documentation

- `secrets-inventory.md` - Complete credential inventory
- `secrets-rotation-runbook.md` - Rotation procedures
- `dev-box-setup.md` - Secure environment setup
