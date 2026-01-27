# Secrets Inventory

**Last Updated:** 2026-01-27
**Owner:** SMDurgan LLC
**Source of Truth:** Bitwarden Vault

---

## Overview

All infrastructure secrets are stored in Bitwarden. Dev machines fetch secrets at setup time via `setup-dev-box.sh`. No secrets are stored in git.

---

## Secret Catalog

### CLI Authentication

| Secret | Bitwarden Item | Env Var | Used By | Rotation Frequency |
|--------|----------------|---------|---------|-------------------|
| Anthropic API Key | `Anthropic API Key` | `ANTHROPIC_API_KEY` | Claude Code CLI | As needed |
| OpenAI API Key | `OpenAI API Key - Codex` | `OPENAI_API_KEY` | Codex CLI | As needed |
| Gemini API Key | `Gemini API Key - General` | `GEMINI_API_KEY` | Gemini CLI | As needed |

### Crane Infrastructure

| Secret | Bitwarden Item | Env Var | Used By | Rotation Frequency |
|--------|----------------|---------|---------|-------------------|
| Context Worker Key | `Crane Context Key` | `CRANE_CONTEXT_KEY` | /sod, /eod, all CLI agents | Quarterly |
| Context Admin Key | `Crane Admin Key` | `CRANE_ADMIN_KEY` | Doc uploads, admin ops | Quarterly |

### GitHub Integration

| Secret | Source | Env Var | Used By | Notes |
|--------|--------|---------|---------|-------|
| GitHub PAT | `gh auth token` | `GITHUB_MCP_PAT` | Gemini MCP | Auto-generated from gh CLI |

### Cloudflare (Deploy-time only)

| Secret | Bitwarden Item | Used By | Notes |
|--------|----------------|---------|-------|
| Cloudflare API Token | `Cloudflare API Token` | Worker deploys | Used in CI/CD, not on dev machines |

---

## Access Patterns

### New Dev Box Setup

```bash
bw login                              # First time only
export BW_SESSION=$(bw unlock --raw)
curl -sS https://raw.githubusercontent.com/venturecrane/crane-console/main/scripts/setup-dev-box.sh | bash
```

### Refresh After Key Rotation

```bash
export BW_SESSION=$(bw unlock --raw)
bash scripts/refresh-secrets.sh
bash scripts/preflight-check.sh       # Verify
```

### Manual Key Lookup

```bash
export BW_SESSION=$(bw unlock --raw)
bw get item "Anthropic API Key" | jq -r '.login.password // .notes // .fields[0].value'
```

---

## Key Rotation

See `secrets-rotation-runbook.md` for the rotation process.

**Rotation triggers:**
- Key compromised or suspected compromised
- Employee offboarding
- Quarterly rotation (recommended for infrastructure keys)
- Vendor-initiated rotation

---

## Security Notes

1. **Never commit secrets to git** - GitHub Push Protection is enabled
2. **Never share secrets in chat/email** - Use Bitwarden sharing
3. **Rotate immediately if exposed** - Follow rotation runbook
4. **Audit access** - Bitwarden logs all access to vault items

---

## Troubleshooting

### "Key not found in Bitwarden"

```bash
bw sync                               # Refresh local cache
bw list items --search "Anthropic"    # Search for item
```

### "Invalid API key" error

1. Check if key was rotated recently
2. Run `refresh-secrets.sh` to fetch latest
3. Run `preflight-check.sh` to validate

### "Bitwarden vault locked"

```bash
export BW_SESSION=$(bw unlock --raw)
```

---

## Related Documentation

- `dev-box-setup.md` - Bootstrap script documentation
- `secrets-rotation-runbook.md` - Key rotation process
- `team-workflow.md` - Escalation triggers for credential issues
