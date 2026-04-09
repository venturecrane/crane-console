# Code Review: Venture Crane

**Date:** 2026-04-09
**Reviewer:** Codex (automated)
**Scope:** Full codebase
**Mode:** Quick
**Models Used:** Codex
**Golden Path Tier:** 1

## Summary

Overall grade: **C**.

The main risks are not package vulnerabilities or missing CI outright. They are validation drift in the session API, incomplete test gating for production workers, and security-critical test coverage that is currently red but never exercised by the root verify path.

## Scorecard

| Dimension     | Grade | Trend |
| ------------- | ----- | ----- |
| Architecture  | C     | n/a   |
| Security      | C     | n/a   |
| Code Quality  | C     | n/a   |
| Testing       | D     | n/a   |
| Dependencies  | B     | n/a   |
| Documentation | C     | n/a   |
| Golden Path   | C     | n/a   |

**Overall: C**

## Detailed Findings

### 1. Testing

1. [high] Root verification does not run the `crane-watch` test suite even though that worker ships a Vitest suite and is a production webhook entrypoint. `npm test` only covers `@venturecrane/crane-mcp`, `@venturecrane/crane-test-harness`, and `workers/crane-context`, and CI simply delegates to that script. Recommendation: add `npm run --prefix workers/crane-watch test` to the root `test` script or invoke it explicitly in [`verify.yml`](../../.github/workflows/verify.yml). Files: [`package.json`](../../package.json), [`workers/crane-watch/package.json`](../../workers/crane-watch/package.json), [`.github/workflows/verify.yml`](../../.github/workflows/verify.yml).
2. [medium] The `crane-watch` signature-validation tests are currently red because the suite calls `crypto.subtle.timingSafeEqual` without installing the workerd polyfill used elsewhere. That leaves the only direct tests of GitHub webhook authentication broken. Recommendation: install the workerd polyfill in the watch tests or use a shared timing-safe helper that falls back cleanly under Node. Files: [`workers/crane-watch/src/index.ts`](../../workers/crane-watch/src/index.ts), [`workers/crane-watch/test/pure-functions.test.ts`](../../workers/crane-watch/test/pure-functions.test.ts), [`packages/crane-test-harness/src/polyfills.ts`](../../packages/crane-test-harness/src/polyfills.ts).
3. [medium] Two critical `/sos` resume scenarios remain skipped in the legacy integration suite, and the harness replacement currently covers only idempotency. The stale-session and multi-active-session branches are exactly where session-corruption bugs tend to hide. Recommendation: port those scenarios into the harness suite with direct DB setup rather than leaving them as opt-in skipped tests. Files: [`workers/crane-context/test/integration/sos.test.ts`](../../workers/crane-context/test/integration/sos.test.ts), [`workers/crane-context/test/harness/sos-idempotency.test.ts`](../../workers/crane-context/test/harness/sos-idempotency.test.ts).

Grade: **D**

### 2. Security

1. [medium] The REST `/sos` handler accepts any non-empty `agent`, `venture`, and `repo` strings, even though the worker already defines and tests stricter validators and Ajv schemas. That means malformed identifiers can be persisted into the central session store and only fail later in downstream tooling. Recommendation: route `/sos`, `/eos`, `/update`, and `/heartbeat` through the shared schema validator or at minimum call the existing format validators before writing to D1. Files: [`workers/crane-context/src/endpoints/sessions.ts`](../../workers/crane-context/src/endpoints/sessions.ts), [`workers/crane-context/src/utils.ts`](../../workers/crane-context/src/utils.ts), [`workers/crane-context/src/validation.ts`](../../workers/crane-context/src/validation.ts).
2. [medium] The dormant Ajv schema already drifted from the venture source of truth. It only allows `vc`, `sc`, and `dfg`, while the utility validator accepts additional ventures such as `ke`, `smd`, and `dc`. Wiring the schema in later would break valid callers. Recommendation: generate or derive venture enums from one shared source before turning the schema layer on. Files: [`workers/crane-context/src/schemas.ts`](../../workers/crane-context/src/schemas.ts), [`workers/crane-context/src/utils.ts`](../../workers/crane-context/src/utils.ts).

Grade: **C**

### 3. Architecture

1. [medium] Core orchestration logic is concentrated in a handful of very large files, including `launch-lib.ts`, `crane-api.ts`, `tools/sos.ts`, `sessions.ts`, and `notifications.ts`. Those files are large enough that validation, state management, and formatting responsibilities are interleaved, which makes safe refactoring harder and increases review blind spots. Recommendation: split transport, validation, rendering, and persistence concerns into smaller modules around stable interfaces. Files: [`packages/crane-mcp/src/cli/launch-lib.ts`](../../packages/crane-mcp/src/cli/launch-lib.ts), [`packages/crane-mcp/src/lib/crane-api.ts`](../../packages/crane-mcp/src/lib/crane-api.ts), [`packages/crane-mcp/src/tools/sos.ts`](../../packages/crane-mcp/src/tools/sos.ts), [`workers/crane-context/src/sessions.ts`](../../workers/crane-context/src/sessions.ts), [`workers/crane-context/src/notifications.ts`](../../workers/crane-context/src/notifications.ts).

Grade: **C**

### 4. Code Quality

1. [medium] The worker has two parallel validation systems - ad hoc checks in handlers and shared Ajv schemas - and neither is the single enforced path. That has already produced real drift between accepted input and documented input. Recommendation: collapse onto one validation entrypoint and delete the unused path. Files: [`workers/crane-context/src/endpoints/sessions.ts`](../../workers/crane-context/src/endpoints/sessions.ts), [`workers/crane-context/src/validation.ts`](../../workers/crane-context/src/validation.ts), [`workers/crane-context/src/schemas.ts`](../../workers/crane-context/src/schemas.ts).

Grade: **C**

### 5. Dependencies

1. [low] `npm audit --workspaces --json` is clean, which is the right baseline.
2. [low] A few developer dependencies are behind current wanted/latest versions, including `vitest`, `@vitest/coverage-v8`, `@types/node`, `@cloudflare/workers-types`, `typescript`, and `zod`. None surfaced as immediate blockers in this review, but the validation stack is already drifting, so major upgrades should be planned rather than deferred indefinitely.

Grade: **B**

### 6. Documentation

1. [medium] The top-level README still says Node.js 18+ while the repo and packages require Node 22+, with `.nvmrc` pinned to `22.13.0`. That will send new contributors into failing installs and test runs. Recommendation: update all setup docs to the actual supported Node floor and reference `.nvmrc` directly. Files: [`README.md`](../../README.md), [`package.json`](../../package.json), [`.nvmrc`](../../.nvmrc).
2. [low] The legacy integration README tells users to run `npm run test:integration`, but the package exposes `test:legacy` instead. Recommendation: align the documentation with the current script name or add a compat alias. Files: [`workers/crane-context/test/integration/README.md`](../../workers/crane-context/test/integration/README.md), [`workers/crane-context/package.json`](../../workers/crane-context/package.json).

Grade: **C**

### 7. Golden Path Compliance

1. [medium] The repo has CI, typechecking, tests, and no audit findings, but the production `crane-watch` worker is outside the root verification path. That weakens the "verify before merge" guarantee enough to matter. Recommendation: make the root verify path exhaustive for every shipped service. Files: [`package.json`](../../package.json), [`.github/workflows/verify.yml`](../../.github/workflows/verify.yml), [`workers/crane-watch/package.json`](../../workers/crane-watch/package.json).

Grade: **C**

## Verification

- `npm audit --workspaces --json` -> no vulnerabilities
- `npm test` -> failed locally under Node `v20.20.0` because `@venturecrane/crane-test-harness` requires `node:sqlite` and the repo pins Node `22.13.0`
- `npm run --prefix workers/crane-watch test` -> failed with 6 signature-validation test failures due missing `crypto.subtle.timingSafeEqual` polyfill in the test runtime

## Top Action Items

1. Put `workers/crane-watch` under the root/CI test gate.
2. Replace the ad hoc session-body checks with the shared validator and remove the drift.
3. Port the skipped `/sos` stale-session and multi-session scenarios into the harness suite.
