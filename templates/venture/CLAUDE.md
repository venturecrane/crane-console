# CLAUDE.md - {Venture Name}

This file provides guidance for Claude Code agents working in this repository.

## About This Repository

{Brief description of the product/venture}

## Build Commands

```bash
npm install             # Install dependencies
npm run dev             # Local dev server
npm run build           # Production build
npm run test            # Run tests
npm run lint            # Run linter
npm run typecheck       # TypeScript validation
```

## Development Workflow

| Command             | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `npm run verify`    | Full local verification (typecheck + format + lint + test) |
| `npm run format`    | Format all files with Prettier                             |
| `npm run lint`      | Run ESLint on all files                                    |
| `npm run typecheck` | Check TypeScript                                           |
| `npm test`          | Run tests                                                  |

### Pre-commit Hooks

Automatically run on staged files:

- Prettier formatting
- ESLint fixes

### Pre-push Hooks

Full verification runs before push:

- TypeScript compilation check
- Prettier format check
- ESLint check
- Test suite

### CI Must Pass

- Never merge with red CI
- Fix root cause, not symptoms
- Run `npm run verify` locally before pushing

## Tech Stack

- Framework: {Next.js / React / etc.}
- Hosting: Cloudflare Pages / Workers
- Database: Cloudflare D1
- Language: TypeScript

## Code Patterns

{Document key patterns, conventions, and architectural decisions here}

## Session Management

```bash
/sod                    # Start of day - load context
/eod                    # End of day - create handoff
/update                 # Update session context mid-session
/heartbeat              # Keep session alive
```

## Related Documentation

- `docs/api/` - API documentation
- `docs/adr/` - Architecture Decision Records

---

_Update this file as the project evolves. This is the primary context for AI agents._
