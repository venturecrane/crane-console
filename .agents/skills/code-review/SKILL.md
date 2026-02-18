---
name: code-review
description: Deep codebase review producing a graded scorecard
---

# Code Review

Deep codebase review producing a graded scorecard stored in VCMS and a full report committed to the repo.

## Arguments

```
code-review [focus] [--quick]
```

- `focus` - Optional path to scope the review (e.g., `workers/ke-api`, `app/src/components`). If omitted, reviews the entire codebase.
- `--quick` - Single-pass review. Faster and cheaper for routine reviews.

Parse the arguments provided by the user:

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
Mode: {QUICK_MODE ? "Quick" : "Full"}
```

### Step 2: Build File Manifest

Scan the codebase (or `FOCUS_PATH` if set):

1. Search for files by extension (`.ts`, `.tsx`, `.js`, `.json`, `.md`, `.yml`, `.sh`, etc.) and count them.
2. Estimate total line count via bash `wc -l`.
3. Identify key files: `package.json`, `tsconfig.json`, `wrangler.toml`, `CLAUDE.md`, `README.md`, ESLint config, Prettier config, CI workflows.
4. If full codebase exceeds 50K lines, note: "Large codebase ({N} lines). Review will prioritize key files and patterns."

Store as `FILE_MANIFEST`.

### Step 3: Review

Work through all 7 review dimensions sequentially. For each dimension:

1. Read the relevant source files.
2. Identify specific findings with file paths and line numbers where possible.
3. Classify each finding by severity: critical, high, medium, low.
4. Provide a concrete recommendation for each finding.

#### Review Dimensions

**1. Architecture**

- File organization and directory structure
- Separation of concerns (routes vs services vs types vs utils)
- Domain boundaries and module coupling
- Monolith risk (files > 500 lines, god objects)
- API surface design

**2. Security**

- Authentication and authorization middleware
- Injection vulnerabilities (SQL, XSS, command injection)
- CORS configuration
- Secrets handling (no hardcoded secrets, proper env var usage)
- Rate limiting and input validation
- Sensitive data exposure in logs or responses

**3. Code Quality**

- TypeScript strictness (strict mode, no any abuse, proper typing)
- Error handling patterns (consistent, informative, no swallowed errors)
- Naming conventions (consistent casing, descriptive names)
- DRY violations (copy-pasted logic, duplicated patterns)
- Dead code and unused imports

**4. Testing**

- Test framework presence and configuration
- Coverage gaps (untested critical paths)
- Test quality (meaningful assertions, not just smoke tests)
- Mock patterns (proper isolation, not over-mocking)
- Integration vs unit test balance

**5. Dependencies**

- Run `npm audit` via bash (if package.json exists) and report vulnerabilities
- Check for outdated major versions of key packages
- Identify unused dependencies
- Evaluate dependency count relative to project complexity

**6. Documentation**

- CLAUDE.md completeness (commands, build instructions, architecture notes)
- README.md quality (setup instructions, purpose, tech stack)
- API documentation (endpoints, request/response formats)
- Inline comments on complex logic
- Schema/database documentation

**7. Golden Path Compliance**
Review against Tier requirements from the Golden Path standard:

- Tier 1: Source control, CLAUDE.md, TypeScript + ESLint, no hardcoded secrets
- Tier 2 (if applicable): Error monitoring, full CI/CD, branch protection, uptime monitoring, API docs
- Tier 3 (if applicable): Security audit, performance baseline, full documentation, compliance review

For each dimension, output:

```
### {N}. {Dimension Name}

**Findings:**
1. [{SEVERITY}] {FILE:LINE} - {Description}. Recommendation: {Fix}.

**Summary:** {1-2 sentence assessment}
```

After all 7 dimensions:

```
### Overall Assessment
{2-3 sentences summarizing codebase health, biggest risks, and top priorities}
```

### Step 4: Synthesize and Grade

#### 4a. Apply grading rubric

Grade each of the 7 dimensions (see Grading Rubric section below).

#### 4b. Compare against previous review

Search VCMS for the most recent `code-review` scorecard for this venture:

```
crane_notes(tag: "code-review", venture: "{VENTURE_CODE}", limit: 1)
```

If a previous scorecard exists:

- Compare dimension grades. Note improvements and regressions.
- Calculate trend: improved, stable, or regressed.
- If the previous review created GitHub issues (label: `source:code-review`), query their status:
  ```bash
  gh issue list --repo {ORG}/{REPO_NAME} --label "source:code-review" --state all --json number,title,state
  ```
  Report: "{N} of {M} previous findings resolved."

#### 4c. Assign overall grade

The overall grade is the mode of dimension grades, pulled toward the worst grade if any dimension is D or F.

### Step 5: Store Artifacts

**5a. VCMS Scorecard**

Store concise scorecard (under 500 words) in VCMS using `crane_note`:

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
```

**5b. Full Report**

Write the complete report to `docs/reviews/code-review-{YYYY-MM-DD}.md` in the current repo. Create the `docs/reviews/` directory if it doesn't exist.

### Step 6: Create GitHub Issues (Optional)

If there are any critical or high severity findings, ask the user:

"Found {N} critical/high findings. Create GitHub issues for tracking?"

Options: "Yes, create issues" / "No, report only"

If approved, for each critical/high finding:

```bash
gh issue create --repo {ORG}/{REPO_NAME} \
  --title "[Code Review] {brief description}" \
  --body "{detailed finding with file, line, recommendation}" \
  --label "source:code-review,type:tech-debt,severity:{severity}"
```

Check for existing open `source:code-review` issues before creating to avoid duplicates.

### Step 7: Done

Display summary:

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

Record completion in the Cadence Engine:

```
crane_schedule(action: "complete", name: "code-review-{VENTURE_CODE}", result: "success", summary: "Grade: {GRADE}, {N} issues created", completed_by: "crane-mcp")
```

---

## Grading Rubric

### Architecture

- **A:** Clean module boundaries, consistent file organization, no files > 500 lines, clear separation of concerns.
- **B:** Minor organizational inconsistencies (1-2 files slightly large, one unclear boundary).
- **C:** 3+ files exceeding 500 lines OR unclear domain boundaries OR mixed concerns in route handlers.
- **D:** Monolithic structure with significant coupling OR god objects OR no discernible architecture.
- **F:** Single-file application at scale OR circular dependencies OR architecture prevents safe modification.

### Security

- **A:** All checklist items pass, no findings.
- **B:** 1-2 low-severity findings only.
- **C:** Any medium-severity finding OR 3+ low-severity.
- **D:** Any high-severity finding.
- **F:** Any critical finding (exposed secrets in code, SQL injection on production endpoint, missing auth on sensitive endpoints).

### Code Quality

- **A:** Strict TypeScript, consistent error handling, clean naming, no DRY violations, no dead code.
- **B:** 1-2 minor issues (occasional `any` type, one duplicated pattern).
- **C:** `strict: false` in tsconfig OR 3+ `any` usages OR inconsistent error handling OR notable DRY violations.
- **D:** Pervasive `any` usage OR swallowed errors OR significant dead code OR no consistent patterns.
- **F:** No TypeScript strictness, errors silently swallowed throughout, fundamentally inconsistent codebase.

### Testing

- **A:** Test framework configured, meaningful tests covering critical paths, good assertion quality, proper mocking.
- **B:** Tests exist but minor gaps (1-2 untested important paths).
- **C:** Test framework present but significant gaps OR tests are mostly smoke tests.
- **D:** Minimal tests (< 5 test cases for a non-trivial codebase).
- **F:** No test framework configured OR no tests at all.

### Dependencies

- **A:** No audit vulnerabilities, all major versions current, no unused dependencies.
- **B:** Low-severity audit findings only OR 1 major version behind on a key dependency.
- **C:** Medium-severity audit findings OR 2+ major versions behind OR 3+ unused dependencies.
- **D:** High-severity audit findings OR severely outdated dependencies (3+ major versions behind).
- **F:** Critical audit vulnerabilities OR dependencies with known exploits in use.

### Documentation

- **A:** Complete CLAUDE.md with commands + build instructions, README with setup guide, API docs present, schema documented.
- **B:** CLAUDE.md and README exist and are useful but missing 1-2 sections.
- **C:** CLAUDE.md exists but incomplete OR README is a stub OR no API docs for a project with API endpoints.
- **D:** CLAUDE.md is a template/stub OR no README OR documentation significantly out of date.
- **F:** No CLAUDE.md OR no documentation at all.

### Golden Path Compliance

- **A:** All tier-appropriate requirements met.
- **B:** All critical requirements met, 1-2 non-critical items missing.
- **C:** 1 critical Tier requirement missing OR 3+ non-critical items missing.
- **D:** Multiple critical Tier requirements missing.
- **F:** Fundamental Golden Path requirements absent.

---

## Error Handling

- **VCMS unavailable:** Write full report to disk. Warn: "VCMS scorecard could not be stored. Report saved to disk only."
- **GitHub CLI unavailable:** Skip issue creation and resolution tracking. Warn in report.
- Every external call has a timeout and skip-on-failure path. No external failure blocks the review.
