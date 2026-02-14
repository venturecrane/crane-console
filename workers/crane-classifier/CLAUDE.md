# CLAUDE.md - Crane Classifier (Cloudflare Worker)

This file provides guidance for the Crane Classifier worker.

## About Crane Classifier

Crane Classifier is a single-purpose VC infrastructure service that:

- Receives GitHub App webhooks on `issues.opened`
- Calls Gemini Flash to grade issues (qa:0/1/2/3)
- Applies labels automatically

**Production URL:** https://crane-classifier.automation-ab6.workers.dev
**Staging URL:** https://crane-classifier-staging.automation-ab6.workers.dev

## Build Commands

```bash
# From workers/crane-classifier/
npm install             # Install dependencies
npx wrangler dev        # Local dev server
npx wrangler deploy     # Deploy to staging
npx wrangler deploy --env production  # Deploy to production
npx tsc --noEmit        # TypeScript validation
```

## Tech Stack

- Cloudflare Workers (JavaScript runtime)
- Cloudflare D1 (SQLite database) - crane-classifier-db
- GitHub App for cross-org authentication
- Gemini 2.0 Flash for classification

## Infrastructure

### D1 Database: crane-classifier-db

Tables:

- `classify_runs` - Classification audit log with idempotency

### GitHub App Integration

Uses the same Crane Relay GitHub App for authentication:

| Org              | Installation ID |
| ---------------- | --------------- |
| durganfieldguide | 103277966       |
| venturecrane     | 104223482       |
| siliconcrane     | 104223351       |
| kidexpenses      | 106532992       |

## API Endpoints

### GET /health

Health check endpoint.

### POST /webhooks/github

GitHub App webhook receiver. Expects:

- `X-Hub-Signature-256` header with HMAC signature
- `X-GitHub-Delivery` header with delivery ID
- JSON payload with `issues.opened` event

## QA Grades

- `qa:0` = Automated only (CI/tests cover it)
- `qa:1` = CLI/API verifiable (curl/gh commands)
- `qa:2` = Light visual (single page spot-check)
- `qa:3` = Full visual (multi-step UI walkthrough)

## Secrets Configuration

```bash
cd workers/crane-classifier

# Staging secrets (default, no --env flag)
wrangler secret put GEMINI_API_KEY
wrangler secret put GH_PRIVATE_KEY_PEM
wrangler secret put GH_WEBHOOK_SECRET

# Production secrets
wrangler secret put GEMINI_API_KEY --env production
wrangler secret put GH_PRIVATE_KEY_PEM --env production
wrangler secret put GH_WEBHOOK_SECRET --env production
```

## Database Setup

```bash
# Create D1 database
wrangler d1 create crane-classifier-db

# Update wrangler.toml with database_id

# Apply migrations
wrangler d1 migrations apply crane-classifier-db --remote
```

## Deployment

```bash
# Deploy to staging (default)
npx wrangler deploy

# Deploy to production
npx wrangler deploy --env production

# Check logs (staging)
npx wrangler tail --format pretty

# Check logs (production)
npx wrangler tail --format pretty --env production
```

## GitHub App Webhook Configuration

After deploying, configure the GitHub App webhook:

1. GitHub → Settings → Developer settings → GitHub Apps → Crane Relay
2. Under "Webhook":
   - URL: `https://crane-classifier.automation-ab6.workers.dev/webhooks/github`
   - Secret: (same as GH_WEBHOOK_SECRET)
   - Active: ✓
3. Under "Subscribe to events":
   - Check "Issues"
4. Save

## Security

- Validates GitHub webhook signatures
- Uses prepared statements for all SQL queries
- No external API access without authentication

## Differences from crane-relay

| crane-relay                      | crane-classifier            |
| -------------------------------- | --------------------------- |
| Triggers on `status:ready` label | Triggers on `issues.opened` |
| Complex V1+V2 routing            | Single purpose              |
| Shared DB with events            | Dedicated DB                |
| RELAY_SHARED_SECRET auth         | GH_WEBHOOK_SECRET only      |

## Common Issues

1. **Webhook not triggering** - Check GitHub App webhook is active
2. **Signature validation failing** - Verify GH_WEBHOOK_SECRET matches GitHub App
3. **Labels not applied** - Check GitHub App has write permissions
