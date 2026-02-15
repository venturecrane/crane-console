# /code-review - Codebase Review

Deep codebase review with multi-model perspectives. Produces a graded scorecard stored in VCMS and a full report committed to the repo.

## Arguments

```
/code-review [focus] [--quick]
```

- `focus` - Optional path to scope the review (e.g., `workers/ke-api`, `app/src/components`). If omitted, reviews the entire codebase.
- `--quick` - Claude-only review. Skips Codex and Gemini. Faster and cheaper for routine reviews.

Parse `$ARGUMENTS`:

- If it contains `--quick`, set `QUICK_MODE = true` and strip the flag.
- Whatever remains (trimmed) is `FOCUS_PATH`. Empty string means full codebase.

## Execution

### Step 1: Detect Context

Identify the venture from cwd and `config/ventures.json`:

1. Determine REPO_ROOT: walk up from cwd until `.git` is found.
2. Derive repo name from REPO_ROOT directory name (e.g., `ke-console` -> `ke`).
3. Read `config/ventures.json` (from crane-console at `~/dev/crane-console/config/ventures.json` if not in crane-console itself).
4. Match venture code. Extract: `VENTURE_CODE`, `VENTURE_NAME`, `ORG`.
5. Determine Golden Path tier from `docs/standards/golden-path.md` compliance dashboard. Default to Tier 1 if not listed.

If venture cannot be determined, warn and ask the user to confirm before proceeding.

Display:

```
Codebase Review: {VENTURE_NAME} ({VENTURE_CODE})
Repo: {ORG}/{repo-name}
Focus: {FOCUS_PATH or "Full codebase"}
Mode: {QUICK_MODE ? "Quick (Claude-only)" : "Full (multi-model)"}
```

### Step 2: Build File Manifest

Scan the codebase (or `FOCUS_PATH` if set) to build a manifest:

1. Use Glob to count files by extension (`.ts`, `.tsx`, `.js`, `.json`, `.md`, `.yml`, `.sh`, etc.)
2. Estimate total line count using `wc -l` via Bash on matched files.
3. Identify key files: `package.json`, `tsconfig.json`, `wrangler.toml`, `CLAUDE.md`, `README.md`, `.eslintrc.*`, `.prettierrc.*`, CI workflows.
4. If full codebase exceeds 50K lines, note it: "Large codebase ({N} lines). Review will prioritize key files and patterns."

Store manifest as `FILE_MANIFEST` for use by review agents.

### Step 3: Claude Review

**Phase 1 (current):** A single Claude Task agent (`subagent_type: general-purpose`) works through all 7 review dimensions sequentially.

**Phase 2 (future):** Split into 3 parallel agents:

- **Architect** - Architecture + Code Quality
- **Security Analyst** - Security + Testing
- **Standards Auditor** - Dependencies + Documentation + Golden Path

For Phase 1, launch one Task agent with this prompt:

```
You are performing a deep codebase review for {VENTURE_NAME} ({VENTURE_CODE}).

## Codebase Context

Repository: {ORG}/{REPO_NAME}
Focus: {FOCUS_PATH or "Full codebase"}
Golden Path Tier: {TIER}

## File Manifest

{FILE_MANIFEST}

## Instructions

Review the codebase across all 7 dimensions listed below. For each dimension:

1. Read the relevant source files using the Read, Glob, and Grep tools.
2. Identify specific findings with file paths and line numbers where possible.
3. Classify each finding by severity: critical, high, medium, low.
4. Provide a concrete recommendation for each finding.

## Review Dimensions

### 1. Architecture
- File organization and directory structure
- Separation of concerns (routes vs services vs types vs utils)
- Domain boundaries and module coupling
- Monolith risk (files > 500 lines, god objects)
- API surface design

### 2. Security
- Authentication and authorization middleware
- Injection vulnerabilities (SQL, XSS, command injection)
- CORS configuration
- Secrets handling (no hardcoded secrets, proper env var usage)
- Rate limiting and input validation
- Sensitive data exposure in logs or responses

### 3. Code Quality
- TypeScript strictness (strict mode, no any abuse, proper typing)
- Error handling patterns (consistent, informative, no swallowed errors)
- Naming conventions (consistent casing, descriptive names)
- DRY violations (copy-pasted logic, duplicated patterns)
- Dead code and unused imports

### 4. Testing
- Test framework presence and configuration
- Coverage gaps (untested critical paths)
- Test quality (meaningful assertions, not just smoke tests)
- Mock patterns (proper isolation, not over-mocking)
- Integration vs unit test balance

### 5. Dependencies
- Run `npm audit` via Bash (if package.json exists) and report vulnerabilities
- Check for outdated major versions of key packages (typescript, hono, wrangler, eslint, prettier)
- Identify unused dependencies (declared but not imported)
- Evaluate dependency count relative to project complexity

### 6. Documentation
- CLAUDE.md completeness (commands, build instructions, architecture notes)
- README.md quality (setup instructions, purpose, tech stack)
- API documentation (endpoints, request/response formats)
- Inline comments on complex logic (not obvious code)
- Schema/database documentation

### 7. Golden Path Compliance
Review against Tier {TIER} requirements from the Golden Path standard:
- Tier 1: Source control, CLAUDE.md, TypeScript + ESLint, no hardcoded secrets
- Tier 2 (if applicable): Error monitoring, full CI/CD, branch protection, uptime monitoring, API docs
- Tier 3 (if applicable): Security audit, performance baseline, full documentation, compliance review

## Output Format

For each dimension, output:

### {N}. {Dimension Name}

**Findings:**
1. [{SEVERITY}] {FILE:LINE} - {Description}. Recommendation: {Fix}.
2. ...

**Summary:** {1-2 sentence assessment of this dimension}

After all 7 dimensions, output:

### Overall Assessment
{2-3 sentences summarizing the codebase health, biggest risks, and top priorities}
```

Wait for the agent to complete. Store its output as `CLAUDE_REVIEW`.

### Step 4: Codex Review (Phase 2, unless --quick)

Skip this step entirely if `QUICK_MODE` is true.

**Phase 1:** Skip this step. Display: "Codex review: skipped (Phase 1 - Claude-only)"

**Phase 2 implementation (when enabled):**

Run via Bash with a 5-minute timeout:

```bash
cd {REPO_ROOT} && codex exec \
  "You are reviewing this codebase. For each finding, output exactly: SEVERITY|FILE:LINE|DESCRIPTION|RECOMMENDATION (one per line). Severity is critical/high/medium/low. Review for: security vulnerabilities, architectural problems, code quality issues, test gaps. Focus: {FOCUS_PATH or 'entire codebase'}. Output only findings, no preamble." \
  -c 'sandbox_permissions=["disk-full-read-access"]' \
  2>&1 | tee /tmp/codex-review-{VENTURE_CODE}.txt
```

- Timeout: 300000ms (5 minutes)
- If the command fails (timeout, missing CLI, auth error), log the failure and continue: "Codex review: skipped ({reason})"
- If it succeeds, parse the pipe-delimited output into structured findings. Store as `CODEX_REVIEW`.

### Step 5: Gemini Structural Analysis (Phase 2, unless --quick)

Skip this step entirely if `QUICK_MODE` is true.

**Phase 1:** Skip this step. Display: "Gemini review: skipped (Phase 1 - Claude-only)"

**Phase 2 implementation (when enabled):**

1. Extract key source files into a digest (target ~30K tokens). Prioritize: entry points, route handlers, middleware, types, config files. Write digest to `/tmp/gemini-request-{VENTURE_CODE}.json`.

2. Build the Gemini API request with structured JSON output schema (reference pattern from `workers/crane-classifier/src/index.ts:410-445`):

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "{CODE_DIGEST}" }]
    }
  ],
  "systemInstruction": {
    "parts": [
      {
        "text": "You are a code reviewer focused on cross-file pattern consistency. Review for: naming convention violations, API surface inconsistencies, error handling mismatches across files, type safety gaps, and structural anti-patterns. Output findings as JSON."
      }
    ]
  },
  "generationConfig": {
    "temperature": 0.1,
    "responseMimeType": "application/json",
    "responseSchema": {
      "type": "OBJECT",
      "properties": {
        "findings": {
          "type": "ARRAY",
          "items": {
            "type": "OBJECT",
            "properties": {
              "severity": { "type": "STRING", "enum": ["critical", "high", "medium", "low"] },
              "file": { "type": "STRING" },
              "description": { "type": "STRING" },
              "recommendation": { "type": "STRING" }
            },
            "required": ["severity", "description", "recommendation"]
          }
        }
      },
      "required": ["findings"]
    }
  }
}
```

3. Invoke via Bash:

```bash
GEMINI_KEY=$(printenv GEMINI_API_KEY)
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent" \
  -H "Content-Type: application/json" \
  -H "x-goog-api-key: $GEMINI_KEY" \
  -d @/tmp/gemini-request-{VENTURE_CODE}.json \
  > /tmp/gemini-response-{VENTURE_CODE}.json
```

- Timeout: 30000ms (30 seconds)
- Parse the response JSON. Extract findings from `candidates[0].content.parts[0].text`.
- If the call fails, log and continue: "Gemini review: skipped ({reason})"
- Store as `GEMINI_REVIEW`.

### Step 6: Synthesize

The orchestrator (you, not the review agents) owns final grading. This ensures single-point consistency.

**6a. Deduplicate findings across models:**

If multiple model outputs exist, merge findings:

- Group by file and description similarity.
- If 2+ models flagged the same issue, note convergence: "Flagged by 2/3 models" or "Flagged by 3/3 models". Convergence increases confidence.
- Preserve unique findings from each model.

**6b. Apply grading rubric:**

Grade each of the 7 dimensions using the rubric below. The grade is based on the worst finding in that dimension, adjusted by count.

**6c. Compare against previous review:**

Search VCMS for the most recent `code-review` scorecard for this venture:

```
crane_notes tag="code-review" venture="{VENTURE_CODE}" limit=1
```

If a previous scorecard exists:

- Compare dimension grades. Note improvements and regressions.
- Calculate trend: improved, stable, or regressed.
- If the previous review created GitHub issues (label: `source:code-review`), query their status:
  ```bash
  gh issue list --repo {ORG}/{REPO_NAME} --label "source:code-review" --state all --json number,title,state
  ```
  Report: "{N} of {M} previous findings resolved."

**6d. Assign overall grade:**

The overall grade is the mode of dimension grades, pulled toward the worst grade if any dimension is D or F.

### Step 7: Store Artifacts

**7a. VCMS Scorecard**

Store a concise scorecard (under 500 words) in VCMS using `crane_note`:

- Action: `create`
- Tags: `["code-review"]`
- Venture: `{VENTURE_CODE}`
- Title: `Code Review: {VENTURE_NAME} - {YYYY-MM-DD}`

Content format:

```
## Code Review Scorecard

**Date:** {YYYY-MM-DD}
**Venture:** {VENTURE_NAME} ({VENTURE_CODE})
**Scope:** {FOCUS_PATH or "Full codebase"}
**Mode:** {Quick/Full}
**Models:** {Claude / Claude+Codex+Gemini}

### Grades

| Dimension | Grade | Trend |
|-----------|-------|-------|
| Architecture | {A-F} | {up/down/stable/new} |
| Security | {A-F} | {up/down/stable/new} |
| Code Quality | {A-F} | {up/down/stable/new} |
| Testing | {A-F} | {up/down/stable/new} |
| Dependencies | {A-F} | {up/down/stable/new} |
| Documentation | {A-F} | {up/down/stable/new} |
| Golden Path | {A-F} | {up/down/stable/new} |

**Overall: {GRADE}** {trend vs last review}

### Top Findings

1. [{severity}] {description} ({file})
2. ...
3. ...

### Previous Issue Resolution

{N}/{M} findings from last review resolved.
```

**7b. Full Report**

Write the complete report to `docs/reviews/code-review-{YYYY-MM-DD}.md` in the current repo.

Create the `docs/reviews/` directory if it doesn't exist (via Bash `mkdir -p`).

Full report format:

```markdown
# Code Review: {VENTURE_NAME}

**Date:** {YYYY-MM-DD}
**Reviewer:** Claude Code (automated)
**Scope:** {FOCUS_PATH or "Full codebase"}
**Mode:** {Quick/Full}
**Models Used:** {list}
**Golden Path Tier:** {TIER}

## Summary

{Overall grade and 2-3 sentence summary}

## Scorecard

{Same grades table as VCMS scorecard}

## Detailed Findings

### 1. Architecture

{All findings with severity, file:line, description, recommendation}

Grade: {GRADE}
Rationale: {Why this grade per the rubric}

### 2. Security

{...}

### 3. Code Quality

{...}

### 4. Testing

{...}

### 5. Dependencies

{...}

### 6. Documentation

{...}

### 7. Golden Path Compliance

{...}

## Model Convergence

{If multi-model: which findings were flagged by multiple models}

## Trend Analysis

{Comparison with previous review, if available}

## File Manifest

{Summary: file count, line count, languages}

## Raw Model Outputs

### Claude Review

{CLAUDE_REVIEW}

### Codex Review

{CODEX_REVIEW or "Skipped"}

### Gemini Review

{GEMINI_REVIEW or "Skipped"}
```

### Step 8: Create GitHub Issues (Optional)

If there are any critical or high severity findings, ask the Captain:

**"Found {N} critical/high findings. Create GitHub issues for tracking?"**

Options:

- **"Yes, create issues"** - Create one issue per finding
- **"No, report only"** - Skip issue creation

If approved, for each critical/high finding, create a GitHub issue:

```bash
gh issue create --repo {ORG}/{REPO_NAME} \
  --title "[Code Review] {brief description}" \
  --body "{detailed finding with file, line, recommendation}" \
  --label "source:code-review,type:tech-debt,severity:{severity}"
```

On subsequent reviews, before creating new issues, query for existing `source:code-review` issues to avoid duplicates:

```bash
gh issue list --repo {ORG}/{REPO_NAME} --label "source:code-review" --state open --json number,title
```

If an existing open issue covers the same finding, skip creation and note it in the report.

### Step 9: Done

Display a summary:

```
Review complete.

Overall Grade: {GRADE} {trend}
VCMS Scorecard: stored (tag: code-review)
Full Report: docs/reviews/code-review-{date}.md
Issues Created: {N} (or "none")

Top action items:
1. {Most important finding}
2. {Second most important}
3. {Third most important}
```

Do NOT automatically commit the full report. The user may want to review it first.

After displaying the summary, record the completion in the Cadence Engine:

```
crane_schedule(action: "complete", name: "code-review-{VENTURE_CODE}", result: "success", summary: "Grade: {GRADE}, {N} issues created", completed_by: "crane-mcp")
```

---

## Grading Rubric

Concrete thresholds per dimension. The grade is determined by the most severe finding, adjusted by count.

### Architecture

- **A:** Clean module boundaries, consistent file organization, no files > 500 lines, clear separation of concerns.
- **B:** Minor organizational inconsistencies (1-2 files slightly large, one unclear boundary).
- **C:** 3+ files exceeding 500 lines OR unclear domain boundaries OR mixed concerns in route handlers.
- **D:** Monolithic structure with significant coupling OR god objects OR no discernible architecture.
- **F:** Single-file application at scale OR circular dependencies OR architecture prevents safe modification.

### Security

- **A:** All checklist items pass, no findings.
- **B:** 1-2 low-severity findings only (e.g., overly permissive CORS in dev, missing rate limiting on non-sensitive endpoint).
- **C:** Any medium-severity finding OR 3+ low-severity (e.g., missing input validation on user-facing endpoint, no rate limiting).
- **D:** Any high-severity finding (e.g., SQL injection possible, auth bypass on non-critical path, secrets in non-production config).
- **F:** Any critical finding (exposed secrets in code, SQL injection on production endpoint, missing auth on sensitive endpoints, XSS in user-facing output).

### Code Quality

- **A:** Strict TypeScript, consistent error handling, clean naming, no DRY violations, no dead code.
- **B:** 1-2 minor issues (occasional `any` type, one duplicated pattern).
- **C:** `strict: false` in tsconfig OR 3+ `any` usages OR inconsistent error handling patterns OR notable DRY violations.
- **D:** Pervasive `any` usage OR swallowed errors OR significant dead code OR no consistent patterns.
- **F:** No TypeScript strictness, errors silently swallowed throughout, fundamentally inconsistent codebase.

### Testing

- **A:** Test framework configured, meaningful tests covering critical paths, good assertion quality, proper mocking.
- **B:** Tests exist but minor gaps (1-2 untested important paths, slightly weak assertions).
- **C:** Test framework present but significant gaps OR tests are mostly smoke tests OR critical paths untested.
- **D:** Minimal tests (< 5 test cases for a non-trivial codebase) OR tests that don't meaningfully verify behavior.
- **F:** No test framework configured OR no tests at all.

### Dependencies

- **A:** No audit vulnerabilities, all major versions current (within 1 major), no unused dependencies.
- **B:** Low-severity audit findings only OR 1 major version behind on a key dependency.
- **C:** Medium-severity audit findings OR 2+ major versions behind OR 3+ unused dependencies.
- **D:** High-severity audit findings OR severely outdated dependencies (3+ major versions behind).
- **F:** Critical audit vulnerabilities OR dependencies with known exploits in use.

### Documentation

- **A:** Complete CLAUDE.md with commands + build instructions, README with setup guide, API docs present, schema documented.
- **B:** CLAUDE.md and README exist and are useful but missing 1-2 sections (e.g., no API docs but README covers basics).
- **C:** CLAUDE.md exists but incomplete OR README is a stub OR no API documentation for a project with API endpoints.
- **D:** CLAUDE.md is a template/stub OR no README OR documentation significantly out of date.
- **F:** No CLAUDE.md OR no documentation at all.

### Golden Path Compliance

- **A:** All tier-appropriate requirements met. No exceptions.
- **B:** All critical requirements met, 1-2 non-critical items missing (e.g., missing `.gitleaks.toml` at Tier 1).
- **C:** 1 critical Tier requirement missing OR 3+ non-critical items missing.
- **D:** Multiple critical Tier requirements missing (e.g., no CI at Tier 1, no error monitoring at Tier 2).
- **F:** Fundamental Golden Path requirements absent (no source control standards, no TypeScript, hardcoded secrets).

---

## Error Handling

Graceful degradation is the core principle. A review always produces output even if external models fail.

- **Codex fails:** Log reason, continue with Claude + Gemini. Note in report: "Codex: unavailable ({reason})."
- **Gemini fails:** Log reason, continue with Claude + Codex. Note in report: "Gemini: unavailable ({reason})."
- **Both fail:** Claude-only review still produces a full report with all 7 dimensions graded. Note in report: "Single-model review (Claude only)."
- **VCMS unavailable:** Write full report to disk. Warn: "VCMS scorecard could not be stored. Report saved to disk only."
- **GitHub CLI unavailable:** Skip issue creation and resolution tracking. Warn in report.

Every external call has a timeout and skip-on-failure path. No external failure blocks the review.

---

## Notes

- **Phase 1** ships with a single Claude agent, Claude-only. This validates the grading rubric, VCMS format, and report structure before adding multi-model complexity.
- **Phase 2** adds 3 parallel agents and Codex/Gemini integration. The `--quick` flag provides an escape hatch for when multi-model cost isn't justified.
- **Codex cost warning:** Codex exec is an agentic loop with unpredictable cost ($2-8 per run). The `--quick` flag exists for routine reviews.
- **VCMS tag:** `code-review`. Scorecards are venture-scoped.
- **Report location:** `docs/reviews/code-review-{YYYY-MM-DD}.md` in the reviewed repo.
- **Issue labels:** `source:code-review`, `type:tech-debt`, `severity:{level}`.
- The 7 review dimensions are purpose-built for automated review. They differ from the manual NFR assessment template - a11y requires browser testing (not automatable here), CI/CD is covered by the golden-path-audit.sh script.
- The `sync-commands.sh` script distributes this command to all venture repos. `/enterprise-review` stays in crane-console only.
