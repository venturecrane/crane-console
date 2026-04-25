---
name: enterprise-review
description: Cross-Venture Codebase Audit
version: 1.1.0
scope: enterprise
owner: captain
status: stable
depends_on:
  mcp_tools:
    - crane_skill_invoked
    - crane_note
    - crane_notes
    - crane_schedule
  files:
    - crane-console:config/ventures.json
    - crane-console:docs/design-system/patterns/index.md
    - crane-console:docs/design-system/components/index.md
    - crane-console:docs/design-system/adoption-runbook.md
  commands:
    - jq
    - grep
    - find
---

# /enterprise-review - Cross-Venture Codebase Audit

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "enterprise-review")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.

Detects configuration drift, structural drift, and practice drift across all venture repos. Produces a consistency report stored in VCMS.

**Must run from crane-console.** This command is not synced to venture repos.

## Arguments

```
/enterprise-review [--venture codes]
```

- `--venture` - Comma-separated venture codes to audit (e.g., `--venture ke,dfg`). If omitted, audits all ventures with repos.

Parse `$ARGUMENTS`:

- If it contains `--venture`, extract the comma-separated codes into `TARGET_VENTURES`.
- If empty, set `TARGET_VENTURES` to all ventures from `config/ventures.json` that have a repo (codes with a corresponding `~/dev/{code}-console` directory).

## Execution

### Step 1: Verify Context

1. Confirm cwd is within crane-console (check for `config/ventures.json` in repo root).
2. If not in crane-console, stop: "This command must run from crane-console. It audits cross-venture consistency."
3. Parse `TARGET_VENTURES`. For each code, verify `~/dev/{code}-console` exists and is a git repo. Skip missing repos with a warning.

Display:

```
Enterprise Codebase Audit
Ventures: {list of venture codes being audited}
```

### Step 2: Bash Data Collection

Run a single Bash command that collects structural snapshots from all target venture repos. This is parsing JSON/YAML, not understanding code semantics - no agents needed.

For each repo at `~/dev/{code}-console`:

```bash
for CODE in {TARGET_VENTURES}; do
  REPO="$HOME/dev/${CODE}-console"
  [ -d "$REPO/.git" ] || continue

  echo "=== $CODE ==="

  # Key dependency versions from package.json (root or first found)
  echo "-- dependencies --"
  PKGJSON=$(find "$REPO" -maxdepth 3 -name "package.json" -not -path "*/node_modules/*" | head -1)
  if [ -n "$PKGJSON" ]; then
    for dep in typescript hono wrangler eslint prettier vitest; do
      VER=$(jq -r ".dependencies[\"$dep\"] // .devDependencies[\"$dep\"] // \"not found\"" "$PKGJSON" 2>/dev/null)
      echo "$dep=$VER"
    done
  fi

  # TypeScript config
  echo "-- tsconfig --"
  TSCONFIG=$(find "$REPO" -maxdepth 2 -name "tsconfig.json" -not -path "*/node_modules/*" | head -1)
  if [ -n "$TSCONFIG" ]; then
    jq '{strict: .compilerOptions.strict, target: .compilerOptions.target, module: .compilerOptions.module}' "$TSCONFIG" 2>/dev/null
  fi

  # ESLint config
  echo "-- eslint --"
  ls "$REPO"/.eslintrc* "$REPO"/eslint.config.* 2>/dev/null || echo "none"

  # Prettier config
  echo "-- prettier --"
  ls "$REPO"/.prettierrc* "$REPO"/prettier.config.* 2>/dev/null || echo "none"

  # CI workflows
  echo "-- ci --"
  ls "$REPO"/.github/workflows/*.yml 2>/dev/null || echo "none"

  # Claude commands present
  echo "-- commands --"
  ls "$REPO"/.claude/commands/*.md 2>/dev/null | xargs -I{} basename {} | sort

  # Design-system adoption signals (Stream D1)
  echo "-- design-system --"
  TOKENS_DEP=N
  CSS_IMPORT=N
  CLAUDE_MD=N
  AUDIT_YML=N

  # 1. token-package consumed: package.json includes @venturecrane/tokens
  if [ -n "$PKGJSON" ] && grep -q '"@venturecrane/tokens"' "$PKGJSON" 2>/dev/null; then
    TOKENS_DEP=Y
  fi

  # 2. CSS imports the package: any *.css under common src roots imports @venturecrane/tokens/
  for SRCDIR in "$REPO/src" "$REPO/app/src" "$REPO/web/src" "$REPO/app" "$REPO"; do
    [ -d "$SRCDIR" ] || continue
    if grep -rEl "@import\s+['\"]@venturecrane/tokens/" "$SRCDIR" --include='*.css' 2>/dev/null | head -1 | grep -q .; then
      CSS_IMPORT=Y
      break
    fi
  done

  # 3. CLAUDE.md references design-system/patterns
  if [ -f "$REPO/CLAUDE.md" ] && grep -q 'design-system/patterns' "$REPO/CLAUDE.md" 2>/dev/null; then
    CLAUDE_MD=Y
  fi

  # 4. audit workflow wired
  if [ -f "$REPO/.github/workflows/ui-drift-audit.yml" ]; then
    AUDIT_YML=Y
  fi

  echo "[design-system] tokens-dep=$TOKENS_DEP import=$CSS_IMPORT claude-md=$CLAUDE_MD audit-yml=$AUDIT_YML"

  echo ""
done
```

Store output as `RAW_DATA`.

This should complete in under 30 seconds for all repos. No parallel agents needed.

### Step 3: Claude Analysis Pass

The orchestrator itself (you, not spawned agents) parses `RAW_DATA` and builds the drift report. This is comparison and table-building, not deep code analysis.

Build these sections:

**3a. Version Alignment Table**

Compare key dependency versions across all ventures:

```
| Dependency | {vc} | {ke} | {dfg} | {sc} | {dc} | Drift? |
|------------|------|------|-------|------|------|--------|
| typescript | 5.x  | 5.x  | 5.x   | 5.x  | -    | No     |
| hono       | 4.x  | 4.x  | -     | -    | -    | No     |
| wrangler   | 3.x  | 3.x  | 3.x   | 3.x  | -    | No     |
| eslint     | 9.x  | 8.x  | 9.x   | -    | -    | YES    |
```

Flag any version where ventures differ by 1+ major version.

**3b. Commands Sync Status**

List which enterprise commands are present/missing per venture:

```
| Command | {vc} | {ke} | {dfg} | {sc} | {dc} |
|---------|------|------|-------|------|------|
| sos.md  |  Y   |  Y   |  Y    |  Y   |  Y   |
| eos.md  |  Y   |  Y   |  Y    |  N   |  N   |
```

Flag missing commands. Note: some commands are enterprise-only (like `enterprise-review.md`) and should not be synced.

**3c. Golden Path Compliance**

Pass/fail per venture with tier context:

```
| Venture | Tier | Failures | Warnings | Status |
|---------|------|----------|----------|--------|
| ke      | 1    | 0        | 2        | PASS   |
| dfg     | 1    | 1        | 3        | FAIL   |
```

**3d. Drift Hotspots**

Cross-cutting issues that affect multiple ventures or represent enterprise-wide concerns:

- Configuration drift (e.g., "dfg is 2 ESLint majors behind ke")
- Missing enterprise standards (e.g., "3/5 repos missing security.yml workflow")
- Practice drift (e.g., "only 2/5 repos have pre-commit hooks configured")

**3e. Design System Compliance**

Parse the `[design-system]` line emitted by Step 2 for each venture and build a 4-point compliance matrix. The four checks correspond to the [adoption runbook](../../../docs/design-system/adoption-runbook.md) "what 'compliant' means" definition:

1. **Tokens-dep** — venture's `package.json` declares `@venturecrane/tokens` as a dependency (any version).
2. **CSS-import** — at least one `*.css` file in the venture imports `@venturecrane/tokens/{code}.css` (or any path under that scope).
3. **CLAUDE.md** — the venture's root `CLAUDE.md` references `design-system/patterns` (the canonical snippet block).
4. **Audit-yml** — `.github/workflows/ui-drift-audit.yml` exists.

Render a per-venture row with the four columns plus a total `N/4` and a tier-aware status:

| Venture | Tokens-dep | CSS-import | CLAUDE.md | Audit-yml | Compliance  |
| ------- | ---------- | ---------- | --------- | --------- | ----------- |
| ss      | ✓          | ✓          | ✓         | ✓         | 4/4 ✓       |
| dc      | ✓          | ✓          | ✓         | ✓         | 4/4 ✓       |
| ke      | ✓          | ✓          | ✓         | ✓         | 4/4 ✓       |
| vc      | ✗          | ✗          | ✗         | ✗         | 0/4 PENDING |
| sc      | ✗          | ✗          | ✗         | ✗         | 0/4 PENDING |
| dfg     | ✗          | ✗          | ✗         | ✗         | 0/4 PENDING |
| dcm     | ✗          | ✗          | ✗         | ✗         | 0/4 PENDING |
| smd     | ✗          | ✗          | ✗         | ✗         | 0/4 PENDING |

Status interpretation:

- **4/4 ✓ COMPLIANT** — venture has fully adopted the enterprise design system.
- **N/4 PARTIAL** — adoption is in progress; the missing column(s) name the next step (e.g., `3/4 PARTIAL — missing CLAUDE.md snippet`).
- **0/4 PENDING_MIGRATION** — no signals present; venture has not started Stream C migration.

A brownfield venture that has shipped its migration PR but only scores 3/4 is the highest-value drift signal — flag it loudly in 3d (Drift Hotspots) so the gap closes in the next session.

### Step 4: Store and Report

**4a. VCMS Report**

Store concise report in VCMS using `crane_note`:

- Action: `create`
- Tags: `["code-review", "enterprise"]`
- Venture: (omit - this is cross-venture)
- Title: `Enterprise Review - {YYYY-MM-DD}`

Content (under 500 words): date, ventures audited, version alignment summary, top 3-5 drift hotspots, **design-system compliance summary** (count of ventures at 4/4 vs partial vs 0/4, plus the names of any partial ventures and their missing columns), overall consistency assessment.

**4b. Compare with Previous Review**

Search for the most recent enterprise review:

```
crane_notes tag="code-review" q="Enterprise Review"
```

If found, compare:

- Which drift items were flagged before and are now resolved?
- Which are new?
- Which are persistent (flagged again)?

Note trend in the report.

**4c. Display to User**

Present the full report inline (this is the primary output - no separate file since it lives in VCMS and is only relevant to crane-console).

```
## Enterprise Codebase Audit - {YYYY-MM-DD}

### Version Alignment
{table}

### Commands Sync Status
{table}

### Design System Compliance
{4-point matrix from 3e}

### Drift Hotspots
{numbered list}

### Trend
{comparison with previous review}

### Recommendation
{1-3 actionable next steps}
```

### Step 5: Done

After displaying the report, suggest next steps:

- If commands are out of sync: "Run `sync-commands.sh` to distribute missing commands."
- If version drift detected: "Consider creating issues to align dependency versions."
- If any venture is at a partial design-system compliance score (1/4, 2/4, or 3/4): name the venture and the missing column(s) (e.g., "ke is 3/4 — missing CLAUDE.md snippet; copy the canonical block from `docs/design-system/adoption/claude-md-snippet.md`"). For ventures at 0/4, point at the [adoption runbook](../../../docs/design-system/adoption-runbook.md) without flagging — those are pending migration, not drift.

Do NOT automatically take any action. Wait for the Captain.

After displaying the report, record the completion in the Cadence Engine:

```
crane_schedule(action: "complete", name: "enterprise-review", result: "success", summary: "{N} ventures audited, {findings}", completed_by: "crane-mcp")
```

---

## Drift Categories

### Configuration Drift

- TypeScript version and tsconfig settings (strict mode, target, module)
- ESLint version and config format (flat config vs legacy)
- Prettier version and settings
- Wrangler version
- Hono version (for API ventures)

### Structural Drift

- API file structure (routes/, services/, types/ conventions)
- Claude commands synced vs missing
- CI workflow files present and consistent
- CLAUDE.md format and completeness

### Practice Drift

- Pre-commit hooks configured (husky/lint-staged)
- Branch protection enabled
- Security workflow present
- Secret scanning configured (.gitleaks.toml)
- Test framework configured

### Design System Compliance

The 4-point compliance matrix (Step 3e) measures Stream C migration status per venture:

- `@venturecrane/tokens` package consumed (`package.json` dependency)
- CSS imports the package (`@import '@venturecrane/tokens/{code}.css'`)
- `CLAUDE.md` references `design-system/patterns` (canonical snippet wired)
- `.github/workflows/ui-drift-audit.yml` workflow exists

Per [adoption-runbook.md](../../../docs/design-system/adoption-runbook.md), a venture is COMPLIANT at 4/4. Brownfield ventures with shipped migration PRs scoring less than 4/4 are the highest-value drift signal — they shipped a migration but missed a step.

---

## Notes

- **Claude-only.** No Codex or Gemini. This is structural comparison, not code analysis.
- **Not synced.** This command stays in crane-console only. It reads from venture repos but doesn't modify them.
- **VCMS tags:** `code-review` + `enterprise`. The `code-review` tag groups all review artifacts; the `enterprise` tag distinguishes cross-venture reports from per-venture scorecards.
- **Speed:** The bash collection step should complete in under 30 seconds. The analysis step is a single Claude pass with no spawned agents.
- **Prerequisite:** Venture repos must be cloned locally at `~/dev/{code}-console`. Missing repos are skipped with a warning.
