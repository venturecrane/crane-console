# API Structure Template

**Version:** 1.0
**Last Updated:** 2026-01-31
**Purpose:** Standard directory structure for Hono-based Cloudflare Workers APIs

---

## Overview

All venture APIs using Hono on Cloudflare Workers should follow this structure. This enables:

- Easier onboarding for new contributors
- Testable domain modules
- Consistent patterns across ventures

---

## Directory Structure

```
workers/{venture}-api/
├── src/
│   ├── index.ts           # App entry - route mounting only
│   ├── middleware/
│   │   ├── auth.ts        # Authentication/authorization
│   │   ├── cors.ts        # CORS configuration
│   │   └── logging.ts     # Request logging
│   ├── routes/
│   │   ├── health.ts      # Health check endpoints
│   │   ├── {domain}.ts    # Domain-specific routes (e.g., expenses.ts)
│   │   └── index.ts       # Route aggregation
│   ├── services/
│   │   └── {domain}.ts    # Business logic (e.g., expenses.service.ts)
│   ├── types/
│   │   ├── index.ts       # Shared types
│   │   └── {domain}.ts    # Domain-specific types
│   └── utils/
│       └── index.ts       # Shared utilities
├── test/
│   ├── routes/
│   │   └── {domain}.test.ts
│   ├── services/
│   │   └── {domain}.test.ts
│   └── utils.test.ts
├── migrations/
│   └── *.sql
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── wrangler.toml
```

---

## File Templates

### src/index.ts (Entry Point)

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authMiddleware } from './middleware/auth'
import { loggingMiddleware } from './middleware/logging'
import { healthRoutes } from './routes/health'
import { expensesRoutes } from './routes/expenses'
// Import other domain routes

type Bindings = {
  DB: D1Database
  // Add other bindings
}

const app = new Hono<{ Bindings: Bindings }>()

// Global middleware
app.use('*', loggingMiddleware)
app.use(
  '*',
  cors({
    origin: ['https://your-frontend.vercel.app'],
    credentials: true,
  })
)

// Mount routes
app.route('/', healthRoutes)
app.route('/expenses', expensesRoutes)
// Mount other domain routes

export default app
```

### src/middleware/auth.ts

```typescript
import { Context, Next } from 'hono'

type AuthContext = {
  userId: string
}

/**
 * Authentication middleware
 * Validates user identity from Clerk JWT or header
 */
export async function authMiddleware(c: Context, next: Next) {
  const userId = c.req.header('X-User-Id')

  if (!userId) {
    return c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
  }

  // TODO: Verify Clerk JWT server-side for production
  // const token = c.req.header('Authorization')?.replace('Bearer ', '');
  // const verified = await verifyClerkToken(token);

  c.set('userId', userId)
  await next()
}

/**
 * Resource authorization helper
 * Verifies user has access to a specific resource
 */
export function requireFamilyMember(
  userId: string,
  family: { parent_a_id: string; parent_b_id: string | null }
): boolean {
  return family.parent_a_id === userId || family.parent_b_id === userId
}
```

### src/routes/{domain}.ts

```typescript
import { Hono } from 'hono'
import { authMiddleware, requireFamilyMember } from '../middleware/auth'
import { ExpensesService } from '../services/expenses'

type Bindings = {
  DB: D1Database
}

export const expensesRoutes = new Hono<{ Bindings: Bindings }>()

// Apply auth to all routes in this domain
expensesRoutes.use('*', authMiddleware)

// GET /expenses
expensesRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const service = new ExpensesService(c.env.DB)

  const expenses = await service.listForUser(userId)
  return c.json({ expenses })
})

// POST /expenses
expensesRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json()
  const service = new ExpensesService(c.env.DB)

  const expense = await service.create(userId, body)
  return c.json({ success: true, expense })
})
```

### src/services/{domain}.ts

```typescript
/**
 * Expenses Service
 * Business logic for expense operations
 */
export class ExpensesService {
  constructor(private db: D1Database) {}

  async listForUser(userId: string) {
    const result = await this.db
      .prepare(`
        SELECT e.* FROM expenses e
        JOIN families f ON e.family_id = f.id
        WHERE f.parent_a_id = ? OR f.parent_b_id = ?
        ORDER BY e.expense_date DESC
      `)
      .bind(userId, userId)
      .all();

    return result.results;
  }

  async create(userId: string, data: CreateExpenseInput) {
    // Validation
    if (data.amount_cents <= 0) {
      throw new Error('Amount must be positive');
    }

    // Business logic
    const id = generateId();
    await this.db
      .prepare(`INSERT INTO expenses (...) VALUES (...)`)
      .bind(...)
      .run();

    return { id, ...data };
  }
}
```

---

## Migration Path

For existing monolithic APIs (like ke-api's 2,600-line index.ts):

### Step 1: Extract Types

Move type definitions to `src/types/`

### Step 2: Extract Middleware

Create `src/middleware/auth.ts` with the repeated authorization pattern

### Step 3: Extract Services

Move business logic to `src/services/{domain}.ts`

### Step 4: Extract Routes

Create route files that use services, mount in index.ts

### Step 5: Add Tests

Write tests for services (easiest to test in isolation)

---

## Testing Pattern

```typescript
// test/services/expenses.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ExpensesService } from '../../src/services/expenses';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let mockDb: D1Database;

  beforeEach(() => {
    // Create mock D1 database
    mockDb = createMockD1();
    service = new ExpensesService(mockDb);
  });

  describe('create', () => {
    it('rejects negative amounts', async () => {
      await expect(
        service.create('user_1', { amount_cents: -100, ... })
      ).rejects.toThrow('Amount must be positive');
    });

    it('creates expense with generated ID', async () => {
      const result = await service.create('user_1', { amount_cents: 5000, ... });
      expect(result.id).toMatch(/^exp_/);
    });
  });
});
```

---

## Checklist for New APIs

- [ ] Created directory structure per template
- [ ] Entry point only mounts routes (no business logic)
- [ ] Auth middleware extracts and validates user
- [ ] Each domain has its own route file
- [ ] Business logic in services, not routes
- [ ] Types in dedicated files
- [ ] Tests for services

---

## Related Standards

- `ci-workflow-template.yml` - CI pipeline for testing
- `nfr-assessment-template.md` - Quality review checklist

---

_Last updated: 2026-01-31_
