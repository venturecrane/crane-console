---
name: docs-refresh
description: Enterprise Docs Refresh
---

# /docs-refresh - Enterprise Docs Refresh

Review and update enterprise documentation site content. Identifies stale pages and enriches them with data from existing sources.

## Arguments

```
/docs-refresh [scope]
```

Scope options:

- **No argument**: Audit mode - lists stale pages, recommends what to update. Does NOT modify files.
- **`vc`**, **`dfg`**, **`sc`**, **`ke`**, **`dc`**: Update all 3 pages (product-overview, metrics, roadmap) for one venture.
- **`metrics`**, **`roadmaps`**, **`overviews`**: Update one page type across all ventures.
- **`vc/metrics`**, **`dfg/roadmap`**, etc.: Update a single page.

## Execution

### Step 1: Audit Current State

Read all markdown files in `docs/ventures/*/` and `docs/company/` and `docs/operations/`. For each file, report:

- Line count
- Number of TBD placeholders
- Stale flag (>2 TBDs or <20 lines)

Present as a table:

```
DOCS SITE AUDIT
  STALE  ventures/ke/metrics.md        - 18 lines, 3 TBD
  STALE  ventures/dc/roadmap.md        - 11 lines, 3 TBD
  OK     ventures/dfg/product-overview  - 50 lines, 0 TBD
  ...
```

**If no scope argument was provided, STOP HERE.** Present the audit and ask the Captain which scope to run.

### Step 2: Gather Enrichment Data

For each page in scope, gather data from these sources:

#### Product Overview Pages

1. `config/ventures.json` — description, tagline, techStack, bvmStage
2. `docs/design/ventures/{code}/design-spec.md` — brand voice, audience, product concept
3. VCMS executive summaries — `crane_notes` with `tag: "executive-summary" venture: "{code}"`
4. Existing solid overviews (DFG, SC) as structural templates

**Target:** 40-70 lines covering: What It Is, Target Market, Value Proposition, Core Capabilities, Tech Stack, Revenue Model, Current Stage, Key Principles.

#### Metrics Pages

1. `config/ventures.json` — bvmStage (determines what metrics are appropriate)
2. VCMS notes with `tag: "prd"` or `tag: "strategy"` for pricing/revenue targets
3. Stage-appropriate defaults:
   - **IDEATION**: North star = hypothesis validated. Leading = experiments run, interviews completed.
   - **PROTOTYPE**: North star = first user interaction. Leading = features shipped, test coverage.
   - **MARKET TEST**: North star = paying customers. Leading = signups, activation rate, retention.
   - **Operating** (VC): North star = ventures supported. Leading = sessions/day, API uptime, fleet utilization.

**Target:** 25-35 lines with North Star, Leading Indicators table, Financial Metrics table.

#### Roadmap Pages

1. GitHub issues and milestones — `gh issue list --repo venturecrane/{code}-console --state open --json title,labels,milestone --limit 20`
2. Recent handoffs — `crane_handoffs` for the venture to understand current trajectory
3. Current focus from most recent SOD briefing data

**Target:** 25-40 lines with Current Focus, Near-Term milestones, Completed (recent), and dependencies.

### Step 3: Draft Content

Write updated markdown for each page in scope. Follow existing patterns:

- Match the structure and tone of the solid pages (DFG product-overview, SC product-overview, operating-principles)
- Use real data, not generic descriptions
- Preserve any existing content that is substantive (don't overwrite good content with generated content)
- Replace TBD placeholders with real values or stage-appropriate defaults

### Step 4: Present for Approval

Show the drafted content to the Captain. For each page, display:

- Current line count → new line count
- What data sources were used
- The full draft

**Wait for Captain approval before writing any files.**

### Step 5: Create PR

After approval:

1. Create a branch: `docs/refresh-{scope}-{date}` (e.g., `docs/refresh-vc-2026-03-23`)
2. Write the updated markdown files
3. Run `cd site && npm run build` to verify the build succeeds
4. Commit and push
5. Create PR with title: `docs: refresh {scope} enterprise docs`

## Site Rebuild Note

After the PR merges to main, Vercel automatically rebuilds the site at `crane-console.vercel.app` with the updated content. Template variables (`{{portfolio:table}}`, `{{venture:CODE:FIELD}}`) in markdown files are replaced at build time from `config/ventures.json`. No manual rebuild needed.

## Quality Bar

Updated pages must:

- Have 0 TBD placeholders (or justified "TBD - pending {specific thing}")
- Be at least 20 lines
- Use real data from the venture's actual state
- Not duplicate information that template variables already provide
