# Secrets Rotation Runbook

**Last Updated:** 2026-01-27

---

## When to Rotate

| Trigger                 | Action                     | Urgency |
| ----------------------- | -------------------------- | ------- |
| Key compromised/exposed | Rotate immediately         | P0      |
| Suspected compromise    | Rotate within 24h          | P1      |
| Employee offboarding    | Rotate shared keys         | P1      |
| Quarterly schedule      | Rotate infrastructure keys | P2      |
| Vendor notification     | Follow vendor timeline     | Varies  |

---

## Standard Rotation Process

### Step 1: Generate New Key

| Service    | Console URL                                    |
| ---------- | ---------------------------------------------- |
| Anthropic  | https://console.anthropic.com/settings/keys    |
| OpenAI     | https://platform.openai.com/api-keys           |
| Google AI  | https://aistudio.google.com/app/apikey         |
| Cloudflare | https://dash.cloudflare.com/profile/api-tokens |

1. Log into the respective console
2. Create a new key (don't delete the old one yet)
3. Copy the new key value

### Step 2: Update Bitwarden

```bash
# Unlock vault
export BW_SESSION=$(bw unlock --raw)

# Find the item
bw list items --search "Anthropic API Key"

# Update via CLI or web vault
# Web vault is easier for editing
```

Or use Bitwarden web vault:

1. Log into vault.bitwarden.com
2. Find the item
3. Update the password/value field
4. Save

### Step 3: Refresh Dev Machines

Run on **each** dev machine:

```bash
# mac23 (local)
export BW_SESSION=$(bw unlock --raw)
bash scripts/refresh-secrets.sh
source ~/.zshrc
bash scripts/preflight-check.sh

# mbp27 (remote)
ssh mbp27 'export BW_SESSION=$(bw unlock --raw) && cd ~/dev/crane-console && bash scripts/refresh-secrets.sh && source ~/.zshrc && bash scripts/preflight-check.sh'

# mini (remote)
ssh mini 'export BW_SESSION=$(bw unlock --raw) && cd ~/dev/crane-console && bash scripts/refresh-secrets.sh && source ~/.bashrc && bash scripts/preflight-check.sh'
```

### Step 4: Verify

Run preflight check on each machine:

```bash
bash scripts/preflight-check.sh
```

Expected output:

```
✓ ANTHROPIC_API_KEY set (sk-ant-...)
✓ Anthropic API key valid
```

### Step 5: Revoke Old Key

Only after all machines are verified:

1. Return to the service console
2. Delete/revoke the old key
3. Confirm old key no longer works

---

## Service-Specific Notes

### Anthropic API Key

- Used by: Claude Code CLI
- Impact if invalid: CLI falls back to browser auth (degraded experience)
- Validation: `preflight-check.sh` makes test API call

### OpenAI API Key

- Used by: Codex CLI
- Impact if invalid: CLI prompts for manual auth
- Validation: Manual test with `codex` command

### Gemini API Key

- Used by: Gemini CLI
- Impact if invalid: CLI prompts for manual auth
- Validation: Manual test with `gemini` command

### Crane Context Key

- Used by: All CLIs via /sod and /eod
- Impact if invalid: Session management broken, no handoffs
- Validation: `preflight-check.sh` tests /health endpoint

### Crane Admin Key

- Used by: Doc uploads to crane-context
- Impact if invalid: Can't update operational docs
- Validation: Test doc upload

---

## Emergency Rotation (Compromised Key)

If a key is compromised:

1. **Immediately revoke** the compromised key in the service console
2. Generate new key
3. Update Bitwarden
4. Refresh all machines (parallel if possible)
5. Verify
6. Audit: Check for unauthorized usage in service console

```bash
# Parallel refresh (run from mac23)
ssh mbp27 'cd ~/dev/crane-console && bash scripts/refresh-secrets.sh' &
ssh mini 'cd ~/dev/crane-console && bash scripts/refresh-secrets.sh' &
bash scripts/refresh-secrets.sh
wait
echo "All machines refreshed"
```

---

## Rotation Schedule

| Secret            | Rotation Frequency | Next Rotation |
| ----------------- | ------------------ | ------------- |
| Anthropic API Key | As needed          | -             |
| OpenAI API Key    | As needed          | -             |
| Gemini API Key    | As needed          | -             |
| Crane Context Key | Quarterly          | Q2 2026       |
| Crane Admin Key   | Quarterly          | Q2 2026       |

---

## Checklist Template

Copy this for each rotation:

```markdown
## Key Rotation: [Key Name] - [Date]

- [ ] New key generated in console
- [ ] Old key NOT deleted yet
- [ ] Bitwarden updated
- [ ] mac23 refreshed and verified
- [ ] mbp27 refreshed and verified
- [ ] mini refreshed and verified
- [ ] All preflight checks pass
- [ ] Old key revoked
- [ ] Rotation logged
```

---

## Related Documentation

- `secrets-inventory.md` - Complete list of secrets
- `dev-box-setup.md` - Initial machine setup
- `team-workflow.md` - Escalation triggers
