# Golden Path

**Version:** 2.0
**Last Updated:** 2026-02-03
**Purpose:** The supported way to build Venture Crane products

---

## Philosophy

**Enablement over enforcement.** The Golden Path is the easy way to build products correctly - not a mandate that slows you down. Products that follow it get faster setup, shared tooling, easier handoffs, and better positioning for scale or exit.

Heavy governance kills velocity on products that might get killed anyway. Instead: **make the right thing the easy thing.**

---

## Tiered Compliance Model

Products move through stages. Requirements scale with proven value.

### Tier 1: Validation

**When:** Pre-market test, proving the concept
**Goal:** Ship fast, learn fast

| Requirement | Details |
|-------------|---------|
| Source Control | GitHub repo with basic CI |
| Documentation | CLAUDE.md with project context |
| Code Quality | TypeScript, ESLint configured |
| Secrets | Not hardcoded (env vars at minimum) |

**Not required yet:** Full monitoring, comprehensive CI/CD, branch protection

### Tier 2: Growth

**When:** Post-validation, product proved value, investing in quality
**Trigger:** Decision to continue after market test

| Requirement | Details |
|-------------|---------|
| Everything in Tier 1 | Plus... |
| Error Monitoring | Sentry integrated (frontend required, backend recommended) |
| CI/CD | Full pipeline (lint, typecheck, test, security scan, deploy) |
| Branch Protection | PR reviews required, status checks enforced |
| Uptime Monitoring | Health endpoint + external monitoring |
| Documentation | API docs, schema docs, deployment runbook |

### Tier 3: Scale / Exit

**When:** Preparing for acquisition, major scale, or external investment
**Trigger:** Active exit discussions or significant growth

| Requirement | Details |
|-------------|---------|
| Everything in Tier 2 | Plus... |
| Security Audit | Third-party or thorough internal review |
| Performance Baseline | Load testing, documented benchmarks |
| Full Documentation | Architecture docs, ADRs, operational runbooks |
| Compliance | GDPR/privacy review if applicable |
| Code Quality | Technical debt addressed, test coverage targets met |

---

## Golden Path Components

### Error Monitoring: Sentry

**Service:** [sentry.io](https://sentry.io)
**Account:** SMDurgan LLC organization
**Required at:** Tier 2+

| Component | Integration | Notes |
|-----------|-------------|-------|
| Frontend (React/Next.js) | `@sentry/nextjs` or `@sentry/react` | Required at Tier 2 |
| Cloudflare Workers | `toucan-js` | Recommended |
| Backend APIs | `@sentry/node` | Recommended |

**Naming Convention:** `{venture}-{component}`
- `dfg-app` (frontend)
- `dfg-api` (backend)
- `ke-app` (frontend)

**Environment Variables:**
```bash
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_ORG=smdurgan-llc
SENTRY_PROJECT={venture}-{component}
```

---

### Hosting: Cloudflare

**Required at:** Tier 1+ (this is the default platform)

| Service | Use Case |
|---------|----------|
| Workers | API backends, serverless functions |
| Pages | Frontend hosting (React/Next.js) |
| D1 | SQLite database |
| R2 | Object storage (images, files) |
| KV | Key-value cache |

---

### CI/CD: GitHub Actions

**Required at:** Tier 1 (basic), Tier 2 (full)

| Workflow | Tier 1 | Tier 2+ | Purpose |
|----------|--------|---------|---------|
| `ci.yml` | Typecheck only | Lint, typecheck, test | Code quality |
| `security.yml` | - | Required | npm audit, secret detection |
| `deploy.yml` | Manual | Automated | Production deployment |

**Template:** Use `venturecrane/venture-template` or copy from `docs/standards/ci-workflow-template.yml`

---

### Source Control: GitHub

**Required at:** Tier 1+

| Setting | Tier 1 | Tier 2+ |
|---------|--------|---------|
| Branch protection | Optional | Required |
| PR reviews | Optional | Required |
| Status checks | Optional | Required |

---

### Secrets Management

**Required at:** Tier 1+

| Environment | Solution |
|-------------|----------|
| Local development | `.env.local` (gitignored) |
| CI/CD | GitHub Secrets |
| Production | Cloudflare Secrets / Wrangler |
| Shared secrets | Bitwarden (SMDurgan LLC vault) |

**Never commit secrets to source control.**

---

### Documentation

| Document | Tier 1 | Tier 2 | Tier 3 |
|----------|--------|--------|--------|
| CLAUDE.md | Required | Required | Required |
| README.md | Basic | Complete | Complete |
| API docs | - | Required | Required |
| Schema docs | - | Required | Required |
| ADRs | - | - | Required |
| Runbooks | - | - | Required |

---

## Template Repository

New ventures should start from the template: `venturecrane/venture-template`

**Included in template:**
```
venture-template/
├── .claude/
│   └── commands/
│       ├── sod.md
│       ├── eod.md
│       ├── heartbeat.md
│       └── update.md
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   └── feature.md
│   └── workflows/
│       ├── ci.yml
│       └── security.yml
├── docs/
│   ├── adr/
│   └── api/
├── scripts/
│   └── sod-universal.sh
├── src/
├── CLAUDE.md
├── README.md
├── package.json
└── tsconfig.json
```

**To create a new venture:**
```bash
# 1. Create repo from template
gh repo create {org}/{venture}-console --template venturecrane/venture-template --private

# 2. Clone and customize
gh repo clone {org}/{venture}-console
cd {venture}-console

# 3. Update CLAUDE.md with venture context
# 4. Configure secrets
# 5. Ship
```

---

## Compliance Dashboard

Track where each product stands:

| Venture | Stage | Tier | Sentry | CI/CD | Monitoring | Docs | Next Action |
|---------|-------|------|--------|-------|------------|------|-------------|
| DFG | Growth | 2 | Partial | Yes | Partial | Yes | Add Sentry to frontend |
| KE | Validation | 1 | No | Basic | No | Basic | Complete validation, then Tier 2 |
| SC | Validation | 1 | No | TBD | No | TBD | Continue validation |
| VC | N/A | - | N/A | Yes | Yes | Yes | Infrastructure only |

**Review cadence:** Update quarterly or at stage transitions

---

## Costs

| Service | Tier | Monthly Cost | Notes |
|---------|------|--------------|-------|
| Sentry | Team | $26/mo | 100k errors, 1M transactions |
| Cloudflare | Pro | $20/mo | Per domain |
| Cloudflare Workers | Paid | $5/mo | 10M requests |
| GitHub | Free | $0 | Public or private repos |

**Estimated per-venture cost at Tier 2:** ~$25-50/mo

---

## When to Level Up

| Trigger | Action |
|---------|--------|
| Product passes market validation | Move to Tier 2 |
| Active acquisition discussions | Move to Tier 3 |
| Significant user growth | Move to Tier 3 |
| Security incident | Immediate Tier 2+ remediation |

**Products that fail validation:** Archive at Tier 1. Don't invest in Tier 2 infrastructure for products that won't continue.

---

## Exceptions

If a product intentionally deviates from the Golden Path:

1. Document in the venture's CLAUDE.md
2. Include: What, Why, and When (if ever) it will be addressed
3. Flag in compliance dashboard

Exceptions are fine - undocumented exceptions are not.

---

## Maintenance

The Golden Path is maintained in `crane-console`. When we learn something:
1. Update this document
2. Update the template repo
3. Propagate fixes to active ventures as needed

**Owner:** Venture Crane infrastructure team
**Last review:** 2026-02-03
