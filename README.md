# Crane Console

**Venture Crane infrastructure console** — Factory tooling for product development at SMDurgan LLC.

## Overview

Crane Console is the central repository for all Venture Crane infrastructure components. It provides the automation, tooling, and workflows that support product development for Durgan Field Guide (DFG), Silicon Crane (SC), and future products.

## Architecture

This repository follows a **monorepo pattern** with multiple Cloudflare Workers:

```
crane-console/
├── workers/
│   ├── crane-relay/      # Coda-to-GitHub issue routing
│   └── crane-command/    # Command center for approvals
├── docs/                 # Documentation
└── .github/              # Templates and workflows
```

## Workers

### crane-relay
Routes issues from Coda tables to appropriate GitHub repositories across multiple organizations. Supports multi-org GitHub App authentication.

### crane-command
Command center interface for managing approval queues and workflow orchestration.

## Development

### Prerequisites
- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- GitHub CLI (`gh`) for authentication

### Local Development
```bash
# Install dependencies
npm install

# Run crane-relay locally
cd workers/crane-relay
wrangler dev

# Run crane-command locally
cd workers/crane-command
wrangler dev
```

### Deployment
```bash
# Deploy crane-relay
cd workers/crane-relay
wrangler deploy

# Deploy crane-command
cd workers/crane-command
wrangler deploy
```

## Contributing

See individual worker directories for specific contribution guidelines.

## License

Proprietary - SMDurgan LLC
