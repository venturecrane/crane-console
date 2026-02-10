# Crane Relay Deployment Guide

**For:** Dev Team  
**Time:** ~10 minutes  
**Priority:** P1 — Enables automated PM→Dev handoffs

---

## Prerequisites

- Cloudflare account access (same as other DFG workers)
- GitHub Personal Access Token with `repo` scope
- Wrangler CLI installed

---

## Step 1: Copy Files to Repo

Copy the `crane-relay` folder to `workers/crane-relay` in the dfg-console repo.

```bash
cd /path/to/dfg-console
mkdir -p workers/crane-relay
# Copy all files from this spec to workers/crane-relay
```

---

## Step 2: Install Dependencies

```bash
cd workers/crane-relay
npm install
```

---

## Step 3: Create GitHub Personal Access Token

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name: `crane-relay`
4. Scopes: Check `repo` (full control of private repositories)
5. Generate and copy the token

---

## Step 4: Generate Relay Token

Generate a random secret for PM Team auth:

```bash
openssl rand -hex 32
```

Save this — Captain will need it for PM Team configuration.

---

## Step 5: Set Secrets

```bash
cd workers/crane-relay

# GitHub token (paste when prompted)
wrangler secret put GITHUB_TOKEN

# Relay auth token (paste when prompted)
wrangler secret put RELAY_TOKEN
```

---

## Step 6: Deploy

```bash
wrangler deploy
```

Note the deployed URL (e.g., `https://crane-relay.your-subdomain.workers.dev`)

---

## Step 7: Test

```bash
# Health check
curl https://crane-relay.YOUR-SUBDOMAIN.workers.dev/health

# Create test issue (replace YOUR_RELAY_TOKEN)
curl -X POST https://crane-relay.YOUR-SUBDOMAIN.workers.dev/directive \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_RELAY_TOKEN" \
  -d '{
    "to": "dev",
    "title": "TEST: Relay connectivity test",
    "labels": ["type:tech-debt"],
    "body": "## Test\n\nThis is a test issue from crane-relay.\n\nDelete after verifying."
  }'
```

Expected response:

```json
{
  "success": true,
  "issue": 12,
  "url": "https://github.com/durganfieldguide/dfg-console/issues/12"
}
```

---

## Step 8: Report Back to Captain

Provide:

1. **Worker URL:** `https://crane-relay.______.workers.dev`
2. **RELAY_TOKEN:** (the random string from Step 4)

Captain will configure PM Team to use these.

---

## Verification Checklist

- [ ] Worker deployed successfully
- [ ] Health endpoint returns `{"status": "ok"}`
- [ ] Test issue created in GitHub
- [ ] Test issue has correct labels
- [ ] RELAY_TOKEN provided to Captain
- [ ] Delete test issue from GitHub

---

## Troubleshooting

**401 Unauthorized**

- Check RELAY_TOKEN matches between request and secret

**GitHub API 401**

- Check GITHUB_TOKEN is valid and has `repo` scope

**GitHub API 404**

- Check GITHUB_OWNER and GITHUB_REPO in wrangler.toml

---

## Files Deployed

```
workers/crane-relay/
├── README.md
├── DEPLOY.md (this file)
├── wrangler.toml
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```
