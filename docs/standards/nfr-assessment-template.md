# NFR Assessment Template

**Version:** 1.0
**Last Updated:** 2026-01-31
**Purpose:** Standard template for Non-Functional Requirements code review

---

## Overview

Use this template to assess code quality and NFRs for any venture codebase. This ensures consistent quality standards across the portfolio and identifies standardization opportunities.

---

## Assessment Header

```markdown
---
Code Quality & NFR Assessment: {venture}-console

Prepared for: Venture Crane - Technology Governance
Venture: {Venture Name} ({venture-code})
Repository: {org}/{repo}
Date: YYYY-MM-DD
Reference: GitHub Issue #{number}
---
```

---

## Assessment Checklist

### 1. Testing Infrastructure

| Item                         | Status | Notes               |
| ---------------------------- | ------ | ------------------- |
| Test framework configured    |        | vitest, jest, etc.  |
| Unit tests exist             |        | Count, coverage %   |
| Integration tests exist      |        | API, database       |
| E2E tests exist              |        | Playwright, Cypress |
| Test scripts in package.json |        | `npm test` works    |
| CI runs tests                |        | GitHub Actions      |

**Risk Level:** HIGH / MEDIUM / LOW

**Findings:**

```
-
```

**Recommendations:**

```
-
```

---

### 2. Authorization & Security

| Item                           | Status | Notes                     |
| ------------------------------ | ------ | ------------------------- |
| Auth middleware exists         |        | Centralized vs repeated   |
| Token verification server-side |        | Not just trusting headers |
| SQL injection protection       |        | Parameterized queries     |
| Rate limiting                  |        | Per-user, per-IP          |
| CORS policy restrictive        |        | Not `origin: '*'`         |
| Sensitive data handling        |        | No secrets in code        |
| Audit logging                  |        | Auth failures logged      |

**Risk Level:** HIGH / MEDIUM / LOW

**Findings:**

```
-
```

**Recommendations:**

```
-
```

---

### 3. Accessibility (a11y)

| Item                 | Status | Notes                     |
| -------------------- | ------ | ------------------------- |
| Semantic HTML        |        | landmarks, headings       |
| Form labels          |        | htmlFor associations      |
| ARIA attributes      |        | describedby, live regions |
| Keyboard navigation  |        | Focus management          |
| Skip links           |        | Skip to main content      |
| Color contrast       |        | WCAG AA/AAA               |
| Screen reader tested |        | VoiceOver, NVDA           |

**Risk Level:** HIGH / MEDIUM / LOW

**Findings:**

```
-
```

**Recommendations:**

```
-
```

---

### 4. Code Consistency

| Item                   | Status | Notes                |
| ---------------------- | ------ | -------------------- |
| ESLint configured      |        | Rules applied        |
| Prettier configured    |        | Formatting standard  |
| TypeScript strict mode |        | `strict: true`       |
| Pre-commit hooks       |        | husky, lint-staged   |
| CI enforces linting    |        | Fails on lint errors |
| Consistent naming      |        | camelCase, etc.      |

**Risk Level:** HIGH / MEDIUM / LOW

**Findings:**

```
-
```

**Recommendations:**

```
-
```

---

### 5. API Architecture

| Item                | Status | Notes                   |
| ------------------- | ------ | ----------------------- |
| Route organization  |        | Modular vs monolithic   |
| Largest file LOC    |        | >500 is a smell         |
| Domain separation   |        | Routes, services, types |
| Error handling      |        | Consistent format       |
| API documentation   |        | OpenAPI, markdown       |
| Versioning strategy |        | /v1/, headers           |

**Risk Level:** HIGH / MEDIUM / LOW

**Findings:**

```
-
```

**Recommendations:**

```
-
```

---

### 6. CI/CD Pipeline

| Item                  | Status | Notes                    |
| --------------------- | ------ | ------------------------ |
| GitHub Actions exists |        | .github/workflows/       |
| PR checks             |        | lint, typecheck, test    |
| Preview deploys       |        | Per-PR environments      |
| Production deploy     |        | Protected main branch    |
| Dependency updates    |        | Renovate, Dependabot     |
| Secrets management    |        | GitHub Secrets, not code |

**Risk Level:** HIGH / MEDIUM / LOW

**Findings:**

```
-
```

**Recommendations:**

```
-
```

---

### 7. Documentation

| Item                 | Status | Notes                  |
| -------------------- | ------ | ---------------------- |
| README.md            |        | Setup instructions     |
| CLAUDE.md            |        | Agent context          |
| API reference        |        | Endpoint docs          |
| Schema documentation |        | Database tables        |
| ADRs                 |        | Architecture decisions |
| Contributing guide   |        | PR process             |

**Risk Level:** HIGH / MEDIUM / LOW

**Findings:**

```
-
```

**Recommendations:**

```
-
```

---

## Summary Table

| Area             | Automated Finding | Independent Assessment | Standardization Candidate |
| ---------------- | ----------------- | ---------------------- | ------------------------- |
| Testing          |                   |                        | Yes/No                    |
| Authorization    |                   |                        | Yes/No                    |
| Accessibility    |                   |                        | Yes/No                    |
| Code Consistency |                   |                        | Yes/No                    |
| API Architecture |                   |                        | Yes/No                    |
| CI/CD            |                   |                        | Yes/No                    |
| Documentation    |                   |                        | Yes/No                    |

---

## Recommendations

### Immediate (This Venture)

1.
2.
3.

### Portfolio-Wide (Standardization)

| Standard | Type             | Priority        | Effort          |
| -------- | ---------------- | --------------- | --------------- |
|          | Template/Package | High/Medium/Low | High/Medium/Low |

---

## Files Reviewed

**Frontend:**

```
-
```

**Backend:**

```
-
```

**Infrastructure:**

```
-
```

---

## Appendix: Automated Review Output

If an automated tool (Gemini, CodeRabbit, etc.) was used, include its raw output here for reference.

```
<paste automated review output>
```

---

_Assessment completed by: {name/agent}_
_Date: YYYY-MM-DD_
