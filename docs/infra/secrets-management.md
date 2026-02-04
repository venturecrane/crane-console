# Secrets Management

All Venture Crane projects use **Infisical** for secrets management. This replaces manual Bitwarden lookups and provides seamless secret injection for agents and local development.

## Quick Reference

```bash
# Inject secrets for a venture and run a command
infisical run --path /vc -- claude          # Venture Crane secrets
infisical run --path /ke -- npm run dev     # Kid Expenses secrets
infisical run --path /sc -- npm run dev     # Silicon Crane secrets
infisical run --path /dfg -- npm run dev    # Durgan Field Guide secrets
```

## Project Structure

All ventures share one Infisical project (`venture-crane`) with folder-based organization:

```
venture-crane (project)
└── dev (environment)
    ├── /vc   - Venture Crane (shared infra + VC-specific)
    ├── /ke   - Kid Expenses
    ├── /sc   - Silicon Crane
    └── /dfg  - Durgan Field Guide
```

## Common Secrets by Venture

### /vc (Venture Crane - Shared Infrastructure)
| Secret | Purpose |
|--------|---------|
| CRANE_ADMIN_KEY | Admin access to crane-context API |
| CRANE_CONTEXT_KEY | Standard access to crane-context API |
| GEMINI_API_KEY | AI classification (crane-classifier) |
| OPENAI_API_KEY | Codex CLI |
| CLOUDFLARE_API_TOKEN | Worker deployments |
| GITHUB_MCP_PAT | GitHub MCP server authentication |
| GH_WEBHOOK_SECRET_CLASSIFIER | Webhook secret for crane-classifier |

> **Note:** GITHUB_TOKEN was removed from /vc. GitHub API access now uses `gh` CLI keyring auth (via `gh auth login`). This is preferred because keyring auth is managed per-machine and doesn't require Infisical secret rotation.

### /ke (Kid Expenses)
| Secret | Purpose |
|--------|---------|
| CLERK_SECRET_KEY | Clerk auth (dev) |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Clerk auth (dev) |
| GOOGLE_CLIENT_ID | Google OAuth |
| GOOGLE_CLIENT_SECRET | Google OAuth |

### /sc (Silicon Crane)
| Secret | Purpose |
|--------|---------|
| RESEND_API_KEY | Email sending |

### /dfg (Durgan Field Guide)
| Secret | Purpose |
|--------|---------|
| NEXTAUTH_SECRET | NextAuth.js |
| AUTH_SECRET | Auth configuration |
| OPS_TOKEN | Operations API |

## Usage Patterns

### Running Claude Code with Secrets
```bash
cd ~/dev/crane-console
infisical run --path /vc -- claude
```

### Running Local Development
```bash
cd ~/dev/ke-console
infisical run --path /ke -- npm run dev
```

### Running Multiple Services
```bash
# Terminal 1: API worker
infisical run --path /ke -- npm run dev:api

# Terminal 2: Frontend
infisical run --path /ke -- npm run dev:web
```

### Accessing a Specific Secret
```bash
# Get a single secret value
infisical secrets get CLERK_SECRET_KEY --path /ke --env dev --plain
```

## Machine Setup

### First-Time Setup (Per Machine)

1. **Install Infisical CLI:**
   ```bash
   # macOS
   brew install infisical/get-cli/infisical

   # Ubuntu/Debian
   curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
   sudo apt-get update && sudo apt-get install -y infisical
   ```

2. **Login (opens browser):**
   ```bash
   infisical login
   ```

3. **Link project in each repo:**
   ```bash
   cd ~/dev/crane-console
   infisical init
   # Select: SMDurgan LLC → venture-crane
   ```

   **Alternative (non-interactive):** If `infisical init` doesn't work (e.g., over SSH), create the file directly:
   ```bash
   cat > .infisical.json << 'EOF'
   {
       "workspaceId": "2da2895e-aba2-4faf-a65a-b86e1a7aa2cb",
       "defaultEnvironment": "",
       "gitBranchToEnvironmentMapping": null
   }
   EOF
   ```

### After Cloning a Repo

When you clone a venture repo on a new machine, the `.infisical.json` file won't exist (it's gitignored). You must create it:

```bash
# Option 1: Interactive
cd ~/dev/{repo}
infisical init

# Option 2: Copy from another machine or use the workspace ID above
```

### Installed Machines

See `docs/infra/machine-inventory.md` for current installation status.

## Adding New Secrets

```bash
# Add to a venture folder
infisical secrets set NEW_API_KEY="value" --path /ke --env dev

# Add multiple secrets
infisical secrets set \
  API_KEY="value1" \
  API_SECRET="value2" \
  --path /ke --env dev
```

## Adding a New Venture

When creating a new venture, add its folder to Infisical:

```bash
# Create the folder
infisical secrets folders create --name {venture-code} --env dev

# Add secrets
infisical secrets set \
  SECRET_ONE="value" \
  SECRET_TWO="value" \
  --path /{venture-code} --env dev
```

## Troubleshooting

### "Not logged in" or "No token found"
```bash
infisical login
```

### "Project not linked"
```bash
cd /path/to/repo
infisical init
```

### "Secret not found"
Check you're using the right path and environment:
```bash
infisical secrets --path /vc --env dev
```

### View all secrets for a venture
```bash
infisical secrets --path /ke --env dev
```

## Security Notes

- Secrets are fetched at runtime, not stored in files
- `.infisical.json` contains only the project ID (safe to gitignore)
- Login tokens are stored in `~/.infisical/`
- Tokens expire and require periodic re-login

## Shared Folder Limitations

Infisical supports "shared folders" that import secrets from one path into another. **Imported secrets are read-only from CLI** - they can only be modified via the web UI or from the source folder.

### Implications for Agents

| Operation | Native Secrets | Imported Secrets |
|-----------|----------------|------------------|
| Read | ✅ CLI | ✅ CLI |
| Create | ✅ CLI | ❌ Web UI only |
| Update | ✅ CLI | ❌ Web UI only |
| Delete | ✅ CLI | ❌ Web UI only |

This affects agent-driven workflows where Claude needs to rotate or update secrets.

### Recommendation

Reserve shared imports for **stable, rarely-changed secrets** (infrastructure API keys). Keep secrets that may need agent-driven updates as native secrets in each venture folder.

### GitHub Authentication

GitHub API access uses `gh` CLI keyring auth instead of a GITHUB_TOKEN environment variable:

- **gh CLI auth** - Managed via `gh auth login`, stored in system keyring, works across all repos
- Keyring auth is preferred because it's managed per-machine and auto-refreshes

```bash
# Check auth status
gh auth status

# Login if needed
gh auth login
```

The crane-mcp tools (`crane_sod`, `crane_status`) use `gh api` commands which require keyring auth to be configured.

## Related Documentation

- `docs/infra/machine-inventory.md` - Machine setup status
- `docs/process/new-venture-setup-checklist.md` - New venture setup (includes Infisical)

## Last Updated

2026-02-04
