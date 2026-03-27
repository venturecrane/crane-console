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

### Step 2: Update Infisical

```bash
# Set the new value in Infisical
infisical secrets set ANTHROPIC_API_KEY="new-value" --path /vc --env prod

# Verify the update
infisical secrets get ANTHROPIC_API_KEY --path /vc --env prod
```

Or use the Infisical web dashboard:

1. Log into app.infisical.com
2. Navigate to the project and environment
3. Update the secret value
4. Save

### Step 3: Refresh Dev Machines

Restart any active `crane` sessions to pick up the new secret values. Secrets are frozen at launch time, so a session restart is required after rotation.

```bash
# Verify the new value is available
crane vc
# Inside the session:
# The rotated key should now reflect the updated value
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

### Gemini API Key

- Used by: Gemini CLI
- Impact if invalid: CLI prompts for manual auth
- Validation: Manual test with `gemini` command

### Crane Context Key

- Used by: All CLIs via /sos and /eos
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
3. Update Infisical
4. Restart active crane sessions
5. Verify
6. Audit: Check for unauthorized usage in service console

```bash
# Update the secret in Infisical
infisical secrets set KEY="new-value" --path /vc --env prod

# Restart all active crane sessions to pick up new values
```

---

## Rotation Schedule

| Secret            | Rotation Frequency | Next Rotation |
| ----------------- | ------------------ | ------------- |
| Anthropic API Key | As needed          | -             |
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
- [ ] Infisical updated
- [ ] Active crane sessions restarted
- [ ] New value verified in session
- [ ] Old key revoked
- [ ] Rotation logged
```

---

## Related Documentation

- `docs/infra/secrets-management.md` - Infisical secrets usage
- `dev-box-setup.md` - Initial machine setup
- `team-workflow.md` - Escalation triggers
