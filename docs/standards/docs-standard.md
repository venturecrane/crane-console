---
title: 'Documentation Standard'
sidebar:
  order: 1
---

# Documentation Standard

**Version:** 1.0
**Last Updated:** 2026-04-12
**Purpose:** Canonical structure, naming, and governance for documentation across the portfolio

---

## Philosophy

Documentation in Venture Crane serves two audiences: agents (who consume docs via `crane_doc()` from D1) and humans (who browse the Starlight site). The structure must work for both without anyone needing to ask where things go.

This standard makes the right thing the easy thing. Every directory has a defined purpose. Every file has a naming convention. Every new venture starts with the same skeleton. Agents can validate compliance automatically - no human audit required.

---

## Hub Taxonomy (crane-console)

The hub has 13 canonical directories under `docs/`, organized by function. Anything outside this taxonomy produces a warning in the audit script.

### Enterprise-Wide

Shared across all ventures. Maintained centrally.

| Directory        | Purpose                                              | D1 Sync      | Starlight |
| ---------------- | ---------------------------------------------------- | ------------ | --------- |
| `company/`       | Corporate structure, strategy, financials            | Yes (global) | Yes       |
| `operations/`    | Operating principles, portfolio management           | Yes (global) | Yes       |
| `instructions/`  | Agent directive modules (loaded via `crane_doc`)     | Yes (global) | Yes       |
| `standards/`     | Engineering standards, templates, this document      | No           | Yes       |
| `process/`       | Development workflows, session lifecycle             | No           | Yes       |
| `infra/`         | Machine inventory, secrets, networking               | No           | Yes       |
| `runbooks/`      | Operational how-to guides                            | No           | Yes       |
| `adr/`           | Architecture Decision Records (numbered, immutable)  | No           | Yes       |
| `design-system/` | Shared design philosophy, tokens, brand architecture | No           | Yes       |

### Portfolio

Per-venture documentation aggregated at the hub for cross-venture visibility. Each venture gets a subdirectory with a standard set of files.

| Directory          | Purpose                                                     | D1 Sync      | Starlight |
| ------------------ | ----------------------------------------------------------- | ------------ | --------- |
| `ventures/{code}/` | Product overview, roadmap, metrics, design spec per venture | Yes ({code}) | Yes       |

**Required files per venture:** `product-overview.md`, `roadmap.md`, `metrics.md`, `design-spec.md`, `index.md`

### Active Ephemeral

Growing categories with new content added regularly. Point-in-time artifacts with reference value but not synced to D1 or Starlight.

| Directory   | Purpose                                       |
| ----------- | --------------------------------------------- |
| `handoffs/` | Historical session handoff records            |
| `reviews/`  | Code reviews, platform audits, retrospectives |
| `research/` | Technology evaluations, research spikes       |

### Not in Hub Taxonomy

These belong in venture repos only:

- `wireframes/` - Generated wireframe HTML, organized by issue number
- `pm/` - Venture-specific PRDs

---

## Venture Taxonomy (spoke repos)

Venture repos are leaner. They contain product-specific documentation.

### Required (all ventures)

| Directory   | Purpose                                                              |
| ----------- | -------------------------------------------------------------------- |
| `pm/`       | Product Requirements Document (`prd.md`) and PRD contribution rounds |
| `process/`  | Venture-specific project instructions                                |
| `handoffs/` | Session handoff records                                              |

### Tier 2+ (ventures with active development)

| Directory     | Purpose                                              |
| ------------- | ---------------------------------------------------- |
| `adr/`        | Architecture Decision Records                        |
| `design/`     | Venture design specs and artifacts                   |
| `wireframes/` | Generated wireframe HTML (organized by issue number) |

### Domain-Specific

Ventures may add directories for domain-specific content. These must have an `index.md` and follow naming conventions. Examples from the current portfolio:

- `agents/` (KE) - Agent wave plans and persona briefs
- `collateral/` (SS) - Marketing and sales collateral
- `lead-automation/` (SS) - Lead automation recipes and specs
- `technical/` (SC) - Technical deep-dive specs

---

## Naming Conventions

### Files

| Rule                          | Example                        |
| ----------------------------- | ------------------------------ |
| **kebab-case** for all files  | `product-overview.md`          |
| ADRs: `NNN-kebab-title.md`    | `025-crane-context-worker.md`  |
| Handoffs: `YYYY-MM-DD-*.md`   | `2026-04-12-platform-audit.md` |
| Reviews: `YYYY-MM-DD-*.md`    | `2026-04-08-code-review-dc.md` |
| Wireframes: `{issue}/` folder | `286/index.html`               |
| Known exceptions              | `CLAUDE.md`, `README.md`       |

### Directories

- **kebab-case** (e.g., `design-system/`, `lead-automation/`)
- Every canonical directory MUST have an `index.md`

---

## Index File Requirements

Every canonical directory must contain an `index.md` that includes:

1. Frontmatter with `title` and `sidebar: { order: 0 }`
2. Brief description of the directory's purpose
3. "Who This Is For" section targeting the reader to the right file
4. List of contents with relative markdown links

Model: [`process/index.md`](/process/) demonstrates the pattern well - it organizes files by use case rather than alphabetically.

---

## Frontmatter

Required for all Starlight-synced docs:

```yaml
---
title: 'Human-readable title'
sidebar:
  order: N
---
```

For git-only docs (handoffs, reviews, research), frontmatter is optional. The first `# heading` serves as the title.

---

## Sync Rules

Documentation flows through two pipelines. Git is the single source of truth for both.

### D1 (agent access via `crane_doc`)

Synced automatically by GitHub Action on push to main:

| Path Pattern                   | Scope    |
| ------------------------------ | -------- |
| `docs/company/**/*.md`         | `global` |
| `docs/operations/**/*.md`      | `global` |
| `docs/instructions/**/*.md`    | `global` |
| `docs/ventures/{code}/**/*.md` | `{code}` |

Agents fetch docs with `crane_doc(scope, doc_name)`. Design specs are accessed as `crane_doc('{code}', 'design-spec.md')`.

### Starlight (human browsing)

Synced at build time via `site/scripts/sync-docs.mjs`:

`company`, `operations`, `ventures`, `infra`, `process`, `instructions`, `design-system`, `adr`, `runbooks`, `standards`

### Git-only

`handoffs`, `reviews`, `research` - accessible by reading the repo, not published to D1 or Starlight.

---

## Audit

### Filesystem (`scripts/audit-docs-structure.sh`)

Validates the docs/ directory structure:

- Required `index.md` presence in all canonical directories
- Naming convention compliance (kebab-case, date-prefixed where required)
- Non-canonical directories produce warnings
- Minimum content check (files under 20 lines flagged as stubs)
- `README.md` completeness (all canonical dirs referenced)

Integrated into `/platform-audit`. Advisory - reports violations, does not block CI.

Exit codes: `0` = clean, `1` = warnings only, `2` = errors (missing required structure).

### D1 (`crane_doc_audit`)

Validates required documents exist in D1 and are not stale:

| Document                            | Scope                         | Staleness |
| ----------------------------------- | ----------------------------- | --------- |
| `{venture}-project-instructions.md` | Per venture                   | 30 days   |
| `{venture}-api.md`                  | Per venture (if has_api)      | 60 days   |
| `{venture}-schema.md`               | Per venture (if has_database) | 60 days   |
| `product-overview.md`               | Per venture                   | 90 days   |
| `roadmap.md`                        | Per venture                   | 30 days   |
| `metrics.md`                        | Per venture                   | 60 days   |
| `design-spec.md`                    | Per venture                   | 90 days   |
| `company-overview.md`               | Global                        | 180 days  |
| `strategic-planning.md`             | Global                        | 90 days   |

New requirements are seeded automatically via `ensureDefaultsSeeded` in `audit.ts` - no manual admin API calls needed when the defaults list expands.

---

## New Venture Setup

When creating a new venture via `/new-venture`:

1. The venture template creates the repo with `pm/`, `process/`, `handoffs/`, `design/`, and `wireframes/` directories
2. The hub's `docs/ventures/{code}/` directory gets `product-overview.md`, `roadmap.md`, `metrics.md`, and `design-spec.md`
3. Design specs sync to D1 automatically via the GitHub Action on merge to main
4. `crane_doc_audit` will begin tracking the venture's required documents

---

## Content Rules

1. Every doc must start with a `# heading` that matches its subject
2. Placeholder `TBD` markers must include context: `TBD (#123)` or `TBD - pending design review`
3. Cross-references use relative markdown links, not absolute URLs
4. Template variables use `{{token}}` syntax, resolved by `sync-docs.mjs` at build time

---

<!-- Machine-readable taxonomy for scripts/audit-docs-structure.sh -->

```yaml
# docs-standard: canonical directory taxonomy
hub:
  required:
    - company
    - operations
    - instructions
    - standards
    - process
    - infra
    - runbooks
    - adr
    - design-system
    - ventures
    - handoffs
    - reviews
    - research
  managed:
    - planning
venture:
  required:
    - pm
    - process
    - handoffs
  optional:
    - adr
    - design
    - wireframes
```
