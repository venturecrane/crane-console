# CLAUDE.md - Crane Watch (Cloudflare Worker)

This file provides guidance for the Crane Watch worker.

## About Crane Watch

Crane Watch is the webhook gateway for Venture Crane. It handles:

- **CI/CD event forwarding**: Receives GitHub App webhooks for CI events (`workflow_run`, `check_suite`, `check_run`) and forwards them to crane-context for notification tracking
- **Deploy heartbeat forwarding**: Observes `push` and `workflow_run` events to power the cold-pipeline (commit-without-deploy) detector
- **Vercel deployment forwarding**: Receives Vercel webhooks for deployment failures and forwards them to crane-context

**Production URL:** https://crane-watch.automation-ab6.workers.dev
**Staging URL:** https://crane-watch-staging.automation-ab6.workers.dev

## Build Commands

```bash
# From workers/crane-watch/
npm install             # Install dependencies
npx wrangler dev        # Local dev server
npx wrangler deploy     # Deploy to staging
npx wrangler deploy --env production  # Deploy to production
npx tsc --noEmit        # TypeScript validation
```

## Tech Stack

- Cloudflare Workers (JavaScript runtime)
- Service binding to crane-context for event forwarding

## API Endpoints

### GET /health

Health check endpoint.

### GET /version

Build info and deployment metadata.

### POST /webhooks/github

GitHub App webhook receiver. Expects:

- `X-Hub-Signature-256` header with HMAC signature
- `X-GitHub-Delivery` header with delivery ID
- JSON payload with GitHub event

Behavior by event type:

- `workflow_run`, `check_suite`, `check_run` - Forwards to crane-context `/notifications/ingest`
- `workflow_run` - Also forwards to `/deploy-heartbeats/observe-github-workflow-run`
- `push` - Forwards to `/deploy-heartbeats/observe-github-push`
- All other events - Returns 200 OK (acknowledged, not processed)

### POST /webhooks/vercel

Vercel webhook receiver. Expects:

- `x-vercel-signature` header with HMAC-SHA1 signature
- JSON payload with Vercel deployment event

Forwards `deployment.error` and `deployment.canceled` events to crane-context for notification tracking.

## Secrets Configuration

```bash
cd workers/crane-watch

# Staging secrets (default, no --env flag)
wrangler secret put GH_WEBHOOK_SECRET
wrangler secret put CONTEXT_RELAY_KEY
wrangler secret put VERCEL_WEBHOOK_SECRET

# Production secrets
wrangler secret put GH_WEBHOOK_SECRET --env production
wrangler secret put CONTEXT_RELAY_KEY --env production
wrangler secret put VERCEL_WEBHOOK_SECRET --env production
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

## Common Issues

1. **Webhook not triggering** - Check GitHub App webhook is active
2. **Signature validation failing** - Verify GH_WEBHOOK_SECRET matches GitHub App
3. **CI notifications not forwarding** - Check CONTEXT_RELAY_KEY and CRANE_CONTEXT_URL are set
4. **Vercel webhook failing** - Check VERCEL_WEBHOOK_SECRET is set and matches Vercel dashboard
