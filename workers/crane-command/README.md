# Crane Command Center

Internal development tooling for Venture Crane - a multi-venture work queue dashboard.

## Overview

The Command Center provides a unified view of work across all Venture Crane ventures:
- **Venture Crane** (venturecrane/*)
- **Silicon Crane** (siliconcrane/*)
- **Durgan Field Guide** (durganfieldguide/*)

## Features

- **Work Queue Dashboard**: View issues/PRs across multiple ventures filtered by status
- **Context-Aware Actions**: One-click copy of role-specific prompts (QA, PM, Dev, Merge)
- **Auto-Refresh**: Updates every 60 seconds
- **Multi-Venture Filter**: Toggle between ventures or view all

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **UI**: React 18, Tailwind CSS, Lucide Icons
- **API**: GitHub REST API (via Next.js API routes)

## Development

```bash
# Install dependencies
npm install

# Run dev server (port 3001)
npm run dev

# Build for production
npm run build

# Type check
npm run type-check

# Lint
npm run lint
```

## Environment Variables

Create `.env.local`:

```bash
# GitHub API
GITHUB_TOKEN=ghp_...

# Auth (simple password protection)
COMMAND_CENTER_PASSWORD=your-password
```

## Deployment

Deploy to Vercel:

```bash
vercel --prod
```

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Main dashboard
│   ├── api/github/
│   │   └── route.ts          # GitHub API proxy
│   └── api/auth/
│       └── login/route.ts    # Simple auth
├── components/
│   ├── features/
│   │   └── work-queue-section.tsx
│   └── ui/
│       └── Button.tsx
├── lib/
│   ├── github-api.ts         # Client-side API calls
│   └── prompt-templates.ts   # Role-specific prompts
└── types/
    └── github.ts             # TypeScript types
```

## Work Queues

1. **Needs QA** - PRs ready for QA testing (`needs:qa`)
2. **Needs PM** - Issues requiring PM input (`needs:pm`)
3. **Dev Queue** - Ready for development (`status:ready`, `needs:dev`)
4. **Ready to Merge** - QA verified, ready to merge (`status:verified`)
5. **In Flight** - Currently in progress (`status:in-progress`)

## License

Private - Venture Crane internal tooling
