# Adding a New Venture

This document describes how to add a new venture to the Crane ecosystem.

## Quick Steps

1. **Edit `config/ventures.json`** - Add your venture entry
2. **Deploy crane-context** - `cd workers/crane-context && npm run deploy`
3. **(Optional)** Run `/new-venture` slash command for full setup

## Configuration File

All ventures are defined in `config/ventures.json`:

```json
{
  "ventures": [
    {
      "code": "vc",
      "name": "Venture Crane",
      "org": "venturecrane",
      "capabilities": ["has_api", "has_database"]
    }
  ]
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `code` | Yes | Short code (2-4 chars) used in commands and paths |
| `name` | Yes | Human-readable name |
| `org` | Yes | GitHub organization name |
| `capabilities` | Yes | Array of capability flags (can be empty) |

### Capability Flags

- `has_api` - Venture has API endpoints (enables API documentation audit)
- `has_database` - Venture has a database (enables schema documentation audit)

## What Gets Updated

When you deploy crane-context with a new venture:

1. **API** - `/ventures` endpoint returns the new venture
2. **TypeScript** - `VENTURE_CONFIG` and `VENTURES` include the new venture
3. **Bash scripts** - Scripts fetch the updated list from the API (with caching)

### Bash Script Behavior

Scripts like `ccs.sh`, `ubuntu-bashrc`, and `bootstrap-new-box.sh` use this priority:

1. Fetch from crane-context API (with 5s timeout)
2. Use cached response from `/tmp/crane-ventures.json` (24h TTL)
3. Fall back to embedded list

This means new ventures are automatically available after deploy without updating local scripts.

## Full Setup with /new-venture

For a complete venture setup including:
- GitHub organization creation
- Repository scaffolding
- Infisical secrets path
- Documentation templates

Run the `/new-venture` slash command in Claude Code.

## Example: Adding a New Venture

```json
{
  "code": "nv",
  "name": "New Venture",
  "org": "newventure",
  "capabilities": ["has_api", "has_database"]
}
```

Then deploy:

```bash
cd workers/crane-context
npm run deploy
```

Verify:

```bash
curl https://crane-context.automation-ab6.workers.dev/ventures | jq
```
