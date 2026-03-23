# Roadmap

**Current Stage:** Prototype
**Next Milestone:** Privacy policy + accessibility fixes (P0/P1 sweep)

## Current Focus

- Privacy policy and terms of service (#123, P0)
- Accessibility: pinch-zoom (#115), input labels (#116), aria attributes (#118)
- Security: CSPRNG for invite codes (#113), amount constraint (#114)

## Near-Term

- Rate limiting middleware (#121)
- Consolidate dual API clients (#119)
- Move dispute timeouts to background job (#117)
- Expense filtering: category, status, date, child (#106)
- Balance audit trail / period breakdown (#107)

## Future

- Leave family flow (#108)
- User profile settings (#109)
- Voice-to-expense entry via Workers AI (#124)
- Multi-family support architecture (#145)

## Completed (Recent)

- PWA support: manifest, service worker, iOS meta (2026-02-18)
- Code review sweep: CORS hardening, API path fixes, ESLint, integration tests (2026-02-17)
- Classifier integration after org consolidation (2026-02-11)

## Dependencies

| Item           | Blocks       | Notes                                |
| -------------- | ------------ | ------------------------------------ |
| Privacy policy | Beta launch  | P0 — required for user-facing app    |
| Clerk auth     | Multi-family | Current auth scoped to single family |
