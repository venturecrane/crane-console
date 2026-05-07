# Architecture Decisions

**Last updated:** 2026-05-06
**Maintained by:** Venture Crane lead

This doc records architectural conventions for the `crane-console` codebase, with particular emphasis on the **>500 LOC residual budget** that determines whether `/code-review` grades Architecture as B or C.

The grading rubric (`.claude/commands/code-review.md`):

> **B:** Minor organizational inconsistencies (1-2 files slightly large, one unclear boundary).
> **C:** 3+ files exceeding 500 lines OR unclear domain boundaries OR mixed concerns in route handlers.

The mechanical gate that decides grade is:

```bash
find packages workers -name '*.ts' \
  -not -path '*/node_modules/*' \
  -not -path '*/dist/*' \
  -not -path '*/.claude/*' \
  -not -name '*.test.ts' \
  -not -name '*.spec.ts' \
  | xargs wc -l \
  | awk '$1 > 500 && $2 != "total" { print }'
```

Output must contain **≤2 files** to hit B. Each file must be a documented justified residual.

## Justified residuals (≤2 budget)

The two source files allowed over the 500-LOC threshold are:

### 1. `packages/crane-mcp/src/lib/crane-api.ts` — 577 LOC

**Justification:** Single-purpose REST client class composing 11 domain sub-clients. Zero type or interface declarations (all types live in `crane-api-types.ts`, `crane-api-extended-types.ts`). Pure method bodies that delegate to the appropriate sub-client.

The class is the public surface for 17 importing files. Splitting further would either:
- (a) Worsen the import contract by forcing 17 importers to pick the right sub-client per call, or
- (b) Add a thin facade that just re-exports the same methods — introducing indirection without cohesion benefit.

**Sub-clients already extracted** (each <500 LOC):
- `crane-api-base.ts` (486 LOC) — base class with `request` + venture cache + venture/session/docs/notes methods
- `crane-api-schedule.ts` (159 LOC) — schedule + planned-events methods
- `crane-api-types.ts` (433 LOC) — session, handoff, notes types
- `crane-api-extended-types.ts` (469 LOC) — skill telemetry, memory telemetry, notifications, verify, deploy, fleet types

The remaining `crane-api.ts` (577 LOC) extends `CraneApiSchedule` with handoff/telemetry/notify/verify/deploy/fleet methods. Single-concern.

### 2. `workers/crane-context/src/router.ts` — 546 LOC

**Justification:** Pure HTTP dispatch table. Already decomposed into 7 exported domain routing functions (`routePublic`, `routeSessions`, `routeQueries`, `routeNotifications`, `routeContent`, `routeDeployHeartbeats`, `routeInfra`, `routeAdmin`) plus 2 shared private helpers (`dispatchExact`, `dispatchPattern`). Each function is 20–70 LOC — well within the 75-LOC function ceiling.

The 546 LOC is structural surface area from many route groups, not from a mixed-concern monolith. Splitting into per-domain files would require each to import the shared dispatch helpers and re-export types, adding boilerplate with zero cohesion gain.

Single concern throughout: HTTP dispatch tables.

## Refactor patterns

These patterns codify decisions made during the 2026-05-06 architecture refactor wave (PR #872 through PR #881).

### Pattern 1 — Barrel-residual splits

When a file ≥500 LOC has clean sub-module seams, split into focused files and keep the original file as a barrel re-exporter (~10–50 LOC). All importers continue working unchanged.

Examples shipped:
- `workers/crane-context/src/types.ts` 625 → 1 LOC barrel + 10 domain type files (PR #872)
- `workers/crane-context/src/constants.ts` 506 → 1 LOC barrel + 8 domain constant files (PR #874)
- `workers/crane-context/src/sessions.ts` 580 → 129 orchestrator + sessions-crud + sessions-queries (PR #877)

### Pattern 2 — Per-agent extracts

When a launcher/setup file mixes per-agent paths, extract one file per agent and keep a thin dispatcher.

Examples shipped:
- `cli/launch-lib/mcp-setup.ts` 578 → 67 dispatcher + mcp-setup-claude (Claude-specific) + mcp-setup-agents (Gemini/Codex/Hermes) (PR #878)
- `cli/launch-lib/agent-launch.ts` 531 → 372 venture launcher + engagement-launch.ts (SS engagement) (PR #879)

### Pattern 3 — Pipeline-stage extracts

When a tool runs sequential stages (load → audit → generate → format), extract each stage into its own file and keep the orchestrator + types in the residual file.

Examples shipped:
- `tools/docs-drift-audit.ts` 1031 → 308 orchestrator + drift-markdown-parse + drift-fs-helpers + drift-checks + drift-astro-sidebar (PR #873)
- `tools/sos.ts` 1782 → 146 orchestrator + 10 sub-modules (PR #868, prior session)
- `cli/skill-review.ts` 815 → 259 orchestrator + frontmatter-parser + checks + report (PR #881)

### Pattern 4 — Pure-function helper extracts

When a file's "helpers" are pure functions with no inter-tool surface but the file itself is just over 500 LOC, extract the pure helpers into a co-located helpers module. Single-consumer is acceptable when the helpers are pure functions.

### Pattern 5 — Cohesive single-purpose files >500 are residual candidates

If a file's contents are a single concern with no clean seam, leaving it >500 LOC is acceptable IF it fits within the ≤2 residual budget AND is documented in this file. Force-splitting cohesive files introduces accidental coupling and is worse than the residual.

## Anti-patterns

- **Extracting "helpers" into a parallel module that has no other consumer** when the file is well below threshold. The cure is worse than the disease.
- **Splitting class-based REST clients into many small classes** when callers want one unified interface. Use composition (sub-clients exposed as `public readonly`) instead of mass inheritance or method-by-method dispersal.
- **Forcing pipeline files to split** when each stage cannot run independently. The orchestrator's job is to encode the order; extracting stages doesn't change that.

## Mechanical gate (run before merging any architecture-touching PR)

```bash
find packages workers -name '*.ts' \
  -not -path '*/node_modules/*' \
  -not -path '*/dist/*' \
  -not -path '*/.claude/*' \
  -not -name '*.test.ts' \
  -not -name '*.spec.ts' \
  | xargs wc -l \
  | awk '$1 > 500 && $2 != "total" { print }' \
  | tee /tmp/oversized.txt
test "$(wc -l < /tmp/oversized.txt)" -le 2
```

If the count exceeds 2, either:
- Split the offending file (prefer pattern 1/2/3 above), or
- Document a new residual in the §Justified residuals section above with cohesion justification.

## Rubric edge cases

The rubric's threshold is **>500**, exclusive. A file at exactly 500 LOC passes.

The rubric counts source files only — `.test.ts`, `.spec.ts`, generated files, scripts in `packages/*/src/scripts/` (one-off backfills), and `.claude/`/`node_modules`/`dist` are excluded.

## Refactor wave summary (2026-05-06)

The session that produced this doc landed 8 architecture PRs:

| PR | File | Before | After | Pattern |
|----|------|--------|-------|---------|
| #872 | workers types.ts | 625 | barrel | 1 |
| #873 | docs-drift-audit.ts | 1031 | 308 | 3 |
| #874 | workers constants.ts | 506 | barrel | 1 |
| #876 | crane-mcp-remote tools.ts | 513 | 9 LOC barrel | 1 |
| #877 | workers sessions.ts (DAL) | 580 | 129 | 1 |
| #878 | cli mcp-setup.ts | 578 | 67 dispatcher | 2 |
| #879 | cli agent-launch.ts | 531 | 372 | 2 |
| #881 | cli skill-review.ts | 815 | 259 | 3 |
| #882 | tools skill-audit.ts | 502 | 355 | 4 |

**Net effect:** Architecture grade C → B. Mechanical gate verified passing — final source files >500 LOC:

```
577 packages/crane-mcp/src/lib/crane-api.ts
546 workers/crane-context/src/router.ts
```

Exactly 2 files, both documented in §Justified residuals. Verified against `origin/main` at `6fd47fe` (post-PR-#882 merge).

Closes:
- #676 (split launch-lib + crane-api god-objects) — launch-lib closed by PR #868 (prior session) and the cli/launch-lib/* sub-extracts; crane-api decomposed into base/schedule/types/extended-types modules + the residual unified class.

## Maintenance

Update this doc when:
1. Any new file crosses 500 LOC. Either split immediately or document as a new residual with justification (and remove an existing residual to stay within the ≤2 budget).
2. A residual file's cohesion changes (new responsibility added). Re-evaluate whether it still belongs in the residual list.
3. A refactor pattern proves out a new approach. Add it to §Refactor patterns.
