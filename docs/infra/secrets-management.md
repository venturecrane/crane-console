# Secrets Management

All Venture Crane projects use **Infisical** for secrets management. This replaces manual Bitwarden lookups and provides seamless secret injection for agents and local development.

## Quick Reference

```bash
# Launch agents (fetches secrets, validates, spawns directly)
crane vc                                    # Venture Crane
crane ke                                    # Kid Expenses

# Run non-agent commands with secrets injected
infisical run --path /ke -- npm run dev     # Kid Expenses secrets
infisical run --path /sc -- npm run dev     # Silicon Crane secrets
infisical run --path /dfg -- npm run dev    # Durgan Field Guide secrets
infisical run --path /smd -- npm run dev    # SMD Ventures secrets
infisical run --path /dc -- npm run dev     # Draft Crane secrets
```

## Project Structure

All ventures share one Infisical project (`venture-crane`) with two environments:

```
venture-crane (project)
├── prod (environment) ← default for crane CLI
│   ├── /vc          - Venture Crane (shared infra + VC-specific)
│   │   └── /vault   - Storage-only secrets (not injected into agent env)
│   ├── /ke          - Kid Expenses
│   ├── /sc          - Silicon Crane
│   ├── /dfg         - Durgan Field Guide
│   ├── /smd         - SMD Ventures
│   └── /dc          - Draft Crane
└── dev (environment) ← for staging/development
    ├── /vc          - Venture Crane (shared infra + VC-specific)
    │   └── /staging - Staging-specific infrastructure keys
    ├── /ke          - Kid Expenses
    ├── /sc          - Silicon Crane
    ├── /dfg         - Durgan Field Guide
    ├── /smd         - SMD Ventures
    └── /dc          - Draft Crane
```

### When to Use Each Environment

| Environment | Use Case                                           | How to Select                           |
| ----------- | -------------------------------------------------- | --------------------------------------- |
| `prod`      | Agent sessions, production workers, day-to-day use | Default (no flag needed)                |
| `dev`       | Staging workers, agent staging sessions, testing   | `CRANE_ENV=dev crane vc` or `--env dev` |

## Shared Secrets

Some secrets are shared infrastructure - they must exist in every venture's Infisical path. These are declared in `config/ventures.json`:

```json
{
  "sharedSecrets": {
    "source": "/vc",
    "keys": [
      "CRANE_CONTEXT_KEY",
      "CRANE_ADMIN_KEY",
      "GH_TOKEN",
      "VERCEL_TOKEN",
      "CLOUDFLARE_API_TOKEN"
    ]
  }
}
```

The source of truth is `/vc`. All other venture paths receive copies.

### Audit and Sync

```bash
# Audit - check all ventures for missing shared secrets
bash scripts/sync-shared-secrets.sh

# Fix - propagate missing secrets from /vc
bash scripts/sync-shared-secrets.sh --fix

# Check a single venture
bash scripts/sync-shared-secrets.sh --venture dfg

# Target dev environment
bash scripts/sync-shared-secrets.sh --env dev
```

Or use the `crane` CLI shorthand:

```bash
crane --secrets-audit       # Audit mode
crane --secrets-audit --fix # Fix mode
```

### When Rotating Shared Secrets

1. Update the secret value in `/vc` (the source)
2. Run `bash scripts/sync-shared-secrets.sh --fix` to propagate to all ventures
3. Redeploy any workers that cache these values

### How Setup Automation Works

When `scripts/setup-new-venture.sh` runs, Step 10.5 automatically:

1. Creates the Infisical folder for the new venture (prod + dev)
2. Calls `sync-shared-secrets.sh --fix --venture <code>` to propagate shared secrets

This means new ventures get `CRANE_CONTEXT_KEY` and `CRANE_ADMIN_KEY` without manual intervention.

## Vault (Storage-Only Secrets)

Some secrets need to be stored and discoverable but should NOT be injected into agent environments at launch time. These live in a `/vault` sub-path under the venture's Infisical folder.

The `crane` launcher only fetches secrets from the exact venture path (e.g., `/vc`). Sub-paths like `/vc/vault` are never read during launch, so vault secrets stay out of the agent environment.

### When to Use Vault

- API keys you need to keep but don't use in every session (e.g., direct API keys when you normally authenticate via OAuth)
- Credentials for services not yet integrated
- Reference secrets that agents or workers may need to retrieve explicitly

### Storing a Secret in Vault

```bash
infisical secrets set MY_SECRET="value" --path /vc/vault --env prod
```

### Retrieving a Vault Secret

```bash
# Get a single value
infisical secrets get MY_SECRET --path /vc/vault --env prod --plain

# List all vault secrets for a venture
infisical secrets --path /vc/vault --env prod
```

### /vc/vault

| Secret            | Purpose                     | Notes                                                         |
| ----------------- | --------------------------- | ------------------------------------------------------------- |
| ANTHROPIC_API_KEY | Direct Anthropic API access | Use Console OAuth instead; stored for future agent/worker use |

## Common Secrets by Venture

### /vc (Venture Crane - Shared Infrastructure)

| Secret                       | Purpose                              |
| ---------------------------- | ------------------------------------ |
| CRANE_ADMIN_KEY              | Admin access to crane-context API    |
| CRANE_CONTEXT_KEY            | Standard access to crane-context API |
| GEMINI_API_KEY               | AI classification (crane-classifier) |
| OPENAI_API_KEY               | Codex CLI                            |
| CLOUDFLARE_API_TOKEN         | Worker deployments                   |
| GITHUB_MCP_PAT               | GitHub MCP server authentication     |
| GH_WEBHOOK_SECRET_CLASSIFIER | Webhook secret for crane-classifier  |
| VERCEL_TOKEN                 | Vercel CLI programmatic access       |

> **Note:** GITHUB_TOKEN was removed from /vc. GitHub API access now uses `gh` CLI keyring auth (via `gh auth login`). This is preferred because keyring auth is managed per-machine and doesn't require Infisical secret rotation.

### /vc/staging (Staging Infrastructure)

Staging workers use distinct infrastructure keys but share external service credentials with production. Agent secrets are also present so that `CRANE_ENV=dev` agent sessions have a complete environment.

| Secret                | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| CRANE_CONTEXT_KEY     | Staging access to crane-context-staging         |
| CRANE_ADMIN_KEY       | Staging admin access to crane-context-staging   |
| CLOUDFLARE_API_TOKEN  | Worker deployments (shared with production)     |
| CLOUDFLARE_ACCOUNT_ID | Cloudflare account (shared with production)     |
| GEMINI_API_KEY        | AI classification (shared with production)      |
| GH_PRIVATE_KEY_PEM    | GitHub App private key (shared with production) |
| GH_WEBHOOK_SECRET     | Webhook secret (shared with production)         |
| OPENAI_API_KEY        | Codex CLI (shared with production)              |

### /ke (Kid Expenses)

| Secret                            | Purpose          |
| --------------------------------- | ---------------- |
| CLERK_SECRET_KEY                  | Clerk auth (dev) |
| NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY | Clerk auth (dev) |
| GOOGLE_CLIENT_ID                  | Google OAuth     |
| GOOGLE_CLIENT_SECRET              | Google OAuth     |

### /sc (Silicon Crane)

| Secret         | Purpose       |
| -------------- | ------------- |
| RESEND_API_KEY | Email sending |

### /dc (Draft Crane)

| Secret                | Purpose                              |
| --------------------- | ------------------------------------ |
| CLERK_PUBLISHABLE_KEY | Clerk auth (frontend)                |
| CLERK_SECRET_KEY      | Clerk auth (backend)                 |
| CLERK_WEBHOOK_SECRET  | Clerk webhook signature              |
| CLERK_ISSUER_URL      | Clerk JWT issuer for auth validation |
| OPENAI_API_KEY        | AI rewrite (via AIProvider)          |
| GOOGLE_CLIENT_ID      | Drive API OAuth                      |
| GOOGLE_CLIENT_SECRET  | Drive API OAuth                      |
| GOOGLE_REDIRECT_URI   | Drive OAuth callback                 |
| ENCRYPTION_KEY        | AES-256-GCM token encryption         |

### /dfg (Durgan Field Guide)

| Secret          | Purpose            |
| --------------- | ------------------ |
| NEXTAUTH_SECRET | NextAuth.js        |
| AUTH_SECRET     | Auth configuration |
| OPS_TOKEN       | Operations API     |

## Usage Patterns

### Running Claude Code with Secrets

```bash
crane vc
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
# Get a single secret value (defaults to prod)
infisical secrets get CLERK_SECRET_KEY --path /ke --env prod --plain

# From dev environment
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
# Add to a venture folder (prod - the default for agents)
infisical secrets set NEW_API_KEY="value" --path /ke --env prod

# Add multiple secrets
infisical secrets set \
  API_KEY="value1" \
  API_SECRET="value2" \
  --path /ke --env prod

# Add to dev environment (for staging/development)
infisical secrets set NEW_API_KEY="value" --path /ke --env dev
```

## Adding a New Venture

When creating a new venture, add its folder to both Infisical environments:

```bash
# Create the folder in both environments
infisical secrets folders create --name {venture-code} --env prod
infisical secrets folders create --name {venture-code} --env dev

# Add secrets to prod (used by agents)
infisical secrets set \
  SECRET_ONE="value" \
  SECRET_TWO="value" \
  --path /{venture-code} --env prod

# Mirror to dev if needed for staging/development
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
infisical secrets --path /vc --env prod
```

### View all secrets for a venture

```bash
infisical secrets --path /ke --env prod
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
| --------- | -------------- | ---------------- |
| Read      | ✅ CLI         | ✅ CLI           |
| Create    | ✅ CLI         | ❌ Web UI only   |
| Update    | ✅ CLI         | ❌ Web UI only   |
| Delete    | ✅ CLI         | ❌ Web UI only   |

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

## SSH Session Authentication

When SSH'ing into a machine (e.g., `ssh mac23` from mbp27 or Blink Shell), the macOS Keychain is locked. This breaks both Infisical (which stores its login token in the keychain) and Claude Code (which stores OAuth tokens there).

The `crane` launcher handles this automatically. When an SSH session is detected:

1. **Infisical** uses a Machine Identity (Universal Auth) instead of keychain-based user login
2. **Claude Code** prompts you to unlock the macOS keychain once per SSH session

Local (non-SSH) sessions are completely unaffected.

### One-Time Machine Setup

Each machine that will be accessed via SSH needs Machine Identity credentials:

1. **Create Machine Identity** (done once, in Infisical web UI):
   - Go to app.infisical.com > Organization Settings > Machine Identities
   - Create identity named `crane-fleet`
   - Add Universal Auth method (TTL: 2592000 = 30 days)
   - Grant Developer access to the `venture-crane` project
   - Create a Client Secret

2. **Bootstrap the machine** (run once per machine):
   ```bash
   bash scripts/bootstrap-infisical-ua.sh
   ```
   This prompts for Client ID and Client Secret, writes `~/.infisical-ua` (chmod 600), and verifies the credentials.

### How It Works

When `crane vc` detects an SSH session (`SSH_CLIENT`/`SSH_TTY`/`SSH_CONNECTION` env vars):

1. Reads credentials from `~/.infisical-ua`
2. Runs `infisical login --method=universal-auth` to get a JWT token
3. Passes the token via `INFISICAL_TOKEN` env var (not a CLI flag, to avoid `ps` leaks)
4. Adds `--projectId` to the `infisical export` command (required for token-based auth)
5. On macOS, checks if the keychain is locked and prompts `security unlock-keychain` if needed

### `~/.infisical-ua` File Format

```
# Infisical Universal Auth credentials for SSH sessions
INFISICAL_UA_CLIENT_ID=your-client-id-here
INFISICAL_UA_CLIENT_SECRET=your-client-secret-here
```

Must be `chmod 600`. The launcher warns if permissions are too open.

### Troubleshooting

#### "~/.infisical-ua not found"

Run the bootstrap script on the machine:

```bash
bash scripts/bootstrap-infisical-ua.sh
```

#### "Universal Auth login failed"

Credentials may be expired or revoked. Re-run the bootstrap script or check the Machine Identity in Infisical web UI.

#### "Failed to unlock macOS keychain"

You can unlock it manually:

```bash
security unlock-keychain
```

Then retry `crane vc`.

#### Token expiry

Universal Auth tokens have a TTL (default 30 days). If the Machine Identity's client secret expires, create a new one in the Infisical web UI and re-run the bootstrap script.

## Safe Provisioning

**Rule:** Never echo, display, or pass secret values as inline arguments in agent sessions or scripts. CLI transcripts persist in ~/.claude/ and are sent to the API provider.

### Correct Patterns

**Bulk push to Cloudflare Workers (all secrets for a venture):**

```bash
infisical export --format=json --path /{venture} --env prod | npx wrangler secret bulk
```

**Single secret update:** Use the Infisical web UI (app.infisical.com) or Cloudflare dashboard directly.

**Verify a secret works:** Test the integration (make an API call, check auth flow), not the value itself.

### Incorrect Patterns

```bash
# BAD - value appears in CLI transcript
echo "sk-abc123..." | npx wrangler secret put OPENAI_API_KEY

# BAD - value visible in process list and transcript
npx wrangler secret put OPENAI_API_KEY --value "sk-abc123..."

# BAD - value in shell history and transcript
infisical secrets get MY_KEY --plain | pbcopy
```

## Shared Credentials

Some credentials are used across multiple ventures. Rotating these requires updating ALL consuming ventures.

| Credential       | Source | Also used by | Rotation impact |
| ---------------- | ------ | ------------ | --------------- |
| (none currently) |        |              |                 |

> **Note:** DC and KE both use Google OAuth but have separate GCP OAuth clients.
> KE's Google credentials are unpopulated placeholders as of 2026-02-16.

## Revocation Behavior by Type

Different credential types behave differently when rotated. This affects go-live sequencing.

| Type                            | Behavior on rotation                                 |
| ------------------------------- | ---------------------------------------------------- |
| API keys (OpenAI, Stripe, etc.) | Old key may remain valid - revoke in service console |
| GitHub App PEM                  | Old key valid until deleted in App settings          |
| OAuth client secrets            | Immediate - old secret stops working                 |
| Self-generated (HMAC, enc key)  | No source revocation - rotation IS the control       |

## Related Documentation

- `docs/infra/machine-inventory.md` - Machine setup status
- `docs/process/new-venture-setup-checklist.md` - New venture setup (includes Infisical)

## Last Updated

2026-02-16
