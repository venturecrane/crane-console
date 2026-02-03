# Product Stack Standard

**Version:** 1.0
**Last Updated:** 2026-02-03
**Purpose:** Define the standard infrastructure and services for all Venture Crane products

---

## Overview

All ventures with user-facing products MUST implement this standard stack. This ensures consistency, reduces operational overhead, and enables portfolio-wide tooling.

---

## Required Infrastructure

### Error Monitoring: Sentry

**Service:** [sentry.io](https://sentry.io)
**Account:** SMDurgan LLC organization

| Component | Sentry Integration | Priority |
|-----------|-------------------|----------|
| Frontend (React/Next.js) | `@sentry/nextjs` or `@sentry/react` | **Required** |
| Cloudflare Workers | `toucan-js` | Recommended |
| Backend APIs | `@sentry/node` | Recommended |

**Setup Checklist:**
- [ ] Create project in Sentry under SMDurgan LLC org
- [ ] Configure DSN in environment variables (not hardcoded)
- [ ] Set up source maps for frontend builds
- [ ] Configure release tracking
- [ ] Set up alert rules for new errors
- [ ] Add team members to project notifications

**Environment Variables:**
```bash
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ORG=smdurgan-llc
SENTRY_PROJECT={venture}-{component}
```

**Naming Convention:** `{venture}-{component}`
- `dfg-app` (frontend)
- `dfg-api` (backend)
- `ke-app` (frontend)

---

### Hosting: Cloudflare

**Services Used:**
| Service | Use Case |
|---------|----------|
| Workers | API backends, serverless functions |
| Pages | Frontend hosting (React/Next.js) |
| D1 | SQLite database |
| R2 | Object storage (images, files) |
| KV | Key-value cache |

**Setup Checklist:**
- [ ] Create project in Cloudflare account
- [ ] Configure custom domain
- [ ] Set up wrangler.toml
- [ ] Configure secrets via `wrangler secret put`
- [ ] Enable analytics

---

### CI/CD: GitHub Actions

**Required Workflows:**

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | PR, push to main | Lint, typecheck, test |
| `security.yml` | PR, push, schedule | npm audit, secret detection |
| `deploy.yml` | push to main | Production deployment |

**Template:** See `docs/standards/ci-workflow-template.yml`

---

### Source Control: GitHub

**Organization:** Venture-specific org or venturecrane
**Branch Protection:**
- Require PR reviews
- Require status checks to pass
- No direct push to main

---

### Secrets Management

| Environment | Solution |
|-------------|----------|
| Local development | `.env.local` (gitignored) |
| CI/CD | GitHub Secrets |
| Production | Cloudflare Secrets / Wrangler |
| Shared secrets | Bitwarden (SMDurgan LLC vault) |

**Never commit secrets to source control.**

---

### Logging & Observability

| Component | Solution |
|-----------|----------|
| Workers | `wrangler tail`, Cloudflare dashboard |
| Frontend errors | Sentry |
| Business events | D1 audit tables |
| Uptime monitoring | TBD (consider Checkly, UptimeRobot) |

---

## Recommended (Not Required)

### Analytics
- Cloudflare Web Analytics (privacy-friendly, free)
- Plausible or Fathom for detailed analytics

### Performance Monitoring
- Sentry Performance (included with Sentry)
- Cloudflare Workers Analytics

### Feature Flags
- Consider LaunchDarkly or Flagsmith if needed
- Simple use cases: environment variables

---

## New Venture Checklist

When creating a new venture product:

```markdown
## Infrastructure Setup

### Day 1 - Foundation
- [ ] Create GitHub repository
- [ ] Set up branch protection
- [ ] Add CI workflow from template
- [ ] Add security workflow from template

### Day 1 - Hosting
- [ ] Create Cloudflare project
- [ ] Configure custom domain
- [ ] Set up D1 database (if needed)
- [ ] Configure production secrets

### Day 1 - Monitoring
- [ ] Create Sentry project
- [ ] Integrate Sentry SDK in frontend
- [ ] Configure error alerts
- [ ] Add team to notifications

### Week 1 - Documentation
- [ ] Add CLAUDE.md with project context
- [ ] Document API endpoints
- [ ] Document database schema
- [ ] Add deployment instructions
```

---

## Compliance Matrix

Use this table to track which ventures have implemented the standard:

| Venture | Sentry | Cloudflare | CI/CD | Secrets | Status |
|---------|--------|------------|-------|---------|--------|
| DFG | Partial | Yes | Yes | Yes | Needs Sentry frontend |
| KE | No | Yes | TBD | TBD | In progress |
| SC | TBD | TBD | TBD | TBD | Not started |
| VC | N/A | Yes | Yes | Yes | Infrastructure only |

---

## Costs

| Service | Tier | Monthly Cost | Notes |
|---------|------|--------------|-------|
| Sentry | Team | $26/mo | 100k errors, 1M transactions |
| Cloudflare | Pro | $20/mo | Per domain |
| Cloudflare Workers | Paid | $5/mo | 10M requests |
| GitHub | Team | $4/user/mo | If needed |

**Estimated per-venture cost:** ~$25-50/mo for standard stack

---

## Exceptions

If a venture cannot implement part of this standard, document the exception in the venture's CLAUDE.md with:
- What is not implemented
- Why (technical or business reason)
- Planned resolution date (if any)

---

*Standard maintained by: Venture Crane*
*Last review: 2026-02-03*
