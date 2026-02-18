---
name: prd-review
description: Multi-agent PRD review with configurable rounds
---

# PRD Review

Orchestrates a 6-role PRD review process with configurable rounds. Reads existing source documents, runs structured critique rounds with sequential role analysis, and synthesizes the output into a production-ready PRD.

Works in any venture console that has the required source documents.

## Arguments

```
prd-review [rounds]
```

- `rounds` - number of review rounds (default: **1**). Each additional round adds cross-pollination where roles read and respond to each other's work.
  - **1 round**: Independent analysis + synthesis. Fast. Good for early-stage products.
  - **2 rounds**: Adds cross-pollination. Roles revise after reading all Round 1 output.
  - **3 rounds**: Full process. Adds final polish with unresolved issues.

Parse the argument: if no arguments or not a number, default to 1. No upper bound. Store as `TOTAL_ROUNDS`.

## Execution

### Step 1: Locate Source Documents

Search for source material in three places, in priority order:

**1. Local filesystem (primary)**

Search for input files:

```
docs/process/*project-instructions*
docs/process/*project-description*
docs/pm/*.md (exclude prd-contributions/ subdirectory and prd.md itself)
```

**2. crane-context API (fallback)**

If local files are missing, try pulling from crane-context. Determine venture code from repo name (e.g., `ke-console` -> `ke`). Then query:

```bash
curl -s -H "X-Relay-Key: $CRANE_CONTEXT_KEY" \
  "https://crane-context.automation-ab6.workers.dev/docs?venture={VENTURE_CODE}"
```

Look for docs matching `*project-instructions*` or `*project-description*`.

**3. Classify what you found**

You need at minimum one source document. Ideally two categories:

1. **Project instructions/description** - foundational product vision, tech stack, principles, constraints
2. **PRD or product spec** - current PRD draft or product spec

- **Both found:** Proceed normally.
- **Only one found:** Proceed with what you have. Note which category is missing.
- **Nothing found (local AND crane-context):** Stop with instructions on creating source docs.

### Step 2: Extract and Confirm Venture Context

Read all source documents. Extract into a confirmation table:

| Field                 | Value                             |
| --------------------- | --------------------------------- |
| Product Name          | _(from docs)_                     |
| Tagline / One-liner   | _(from docs)_                     |
| Tech Stack            | _(from docs)_                     |
| Target User           | _(from docs)_                     |
| Primary Platform      | _(from docs)_                     |
| MVP Features (count)  | _(from docs)_                     |
| Kill Criteria         | _(from docs, or "Not specified")_ |
| Competitors Mentioned | _(from docs, or "None")_          |

Display: "Running {TOTAL_ROUNDS} round(s) with 6 roles."

Ask the user: "Does this look right? Anything to correct before I start the review?"

Wait for confirmation. If corrections provided, note them for all roles.

### Step 3: Handle Previous Runs

Check if `docs/pm/prd-contributions/` exists. If so:

1. Create archive: `docs/pm/prd-contributions-archive/{ISO-date}/`
2. Move `docs/pm/prd-contributions/` into the archive
3. Tell the user: "Archived previous run."

If the archive date already exists, append a counter.

### Step 4: Create Context File and Directory Structure

Write `docs/pm/prd-contributions/context.md`:

```markdown
# PRD Review Context

## Source Documents

- {absolute_path_to_source_doc_1}
- {absolute_path_to_source_doc_2}

## User Corrections

{verbatim corrections from Step 2, or "None"}

## Review Parameters

- Rounds: {TOTAL_ROUNDS}
- Date: {TODAY}
```

Create round directories:

```bash
mkdir -p docs/pm/prd-contributions/round-{1..TOTAL_ROUNDS}
```

### Step 5: Run Review Rounds

Execute `TOTAL_ROUNDS` rounds sequentially. Each round processes all 6 roles SEQUENTIALLY (one at a time).

---

**Round 1 (independent analysis):**

For each of the 6 roles (Product Manager, Technical Lead, Business Analyst, UX Lead, Target Customer, Competitor Analyst), execute sequentially:

Each role reads:

- The context file at `docs/pm/prd-contributions/context.md`
- Each source document listed in the context file
- User corrections if any

Write output to `docs/pm/prd-contributions/round-1/{role-slug}.md`.

Output must start with `# {ROLE_NAME} Contribution - PRD Review Round 1` and include metadata.

After all 6 roles complete, verify 6 files exist. Warn if any missing.

Tell the user: "Round 1 complete. All 6 roles have written their independent analyses."

---

**Middle rounds (N > 1 and N < TOTAL_ROUNDS - cross-pollination):**

For each role, sequentially: read ALL 6 contributions from round N-1, then write revised contribution.

Each output must start with `## Changes from Round {N-1}` listing key revisions, then the full revised contribution.

---

**Final round (N == TOTAL_ROUNDS and N > 1 - polish + unresolved issues):**

Same as middle round, but each role must also include a final `## Unresolved Issues` section listing genuine disagreements. For each:

- **The disagreement**: what each role says
- **Why it matters**: impact on the product
- **My position**: stance as this role
- **Needs**: what type of decision is required (PM call, ADR, user research, etc.)

**Special case: TOTAL_ROUNDS == 1** - Round 1 IS the final round. No "Changes from" or "Unresolved Issues" sections. Proceed directly to synthesis.

### Step 6: Synthesis

Read all 6 contributions from the final round. Synthesize into a single unified PRD at `docs/pm/prd.md`.

**PRD Structure:**

```markdown
# {Product Name} - Product Requirements Document

> Synthesized from {TOTAL_ROUNDS}-round, 6-role PRD review process. Generated {TODAY}.

## Table of Contents

1. Executive Summary
2. Product Vision & Identity
3. Target Users & Personas
4. Core Problem
5. Product Principles
6. Competitive Positioning
7. MVP User Journey
8. MVP Feature Specifications
9. Information Architecture
10. Architecture & Technical Design
11. Proposed Data Model
12. API Surface
13. Non-Functional Requirements
14. Platform-Specific Design Constraints
15. Success Metrics & Kill Criteria
16. Risks & Mitigations
17. Open Decisions / ADRs
18. Phased Development Plan
19. Glossary
    Appendix: Unresolved Issues
```

**Synthesis rules - Section-to-Role Mapping:**

| Section                                  | Primary Source                  | Supporting Sources                |
| ---------------------------------------- | ------------------------------- | --------------------------------- |
| 1. Executive Summary                     | Product Manager                 | All                               |
| 2. Product Vision & Identity             | Product Manager                 | Target Customer                   |
| 3. Target Users & Personas               | UX Lead                         | Target Customer                   |
| 4. Core Problem                          | Target Customer                 | UX Lead                           |
| 5. Product Principles                    | Product Manager                 | All                               |
| 6. Competitive Positioning               | Competitor Analyst              | Product Manager                   |
| 7. MVP User Journey                      | UX Lead                         | Target Customer, Business Analyst |
| 8. MVP Feature Specifications            | Business Analyst                | Product Manager, Technical Lead   |
| 9. Information Architecture              | UX Lead                         | Technical Lead                    |
| 10. Architecture & Technical Design      | Technical Lead                  | Product Manager                   |
| 11. Proposed Data Model                  | Technical Lead                  | Business Analyst                  |
| 12. API Surface                          | Technical Lead                  | Business Analyst                  |
| 13. Non-Functional Requirements          | Technical Lead                  | Product Manager                   |
| 14. Platform-Specific Design Constraints | UX Lead                         | Technical Lead                    |
| 15. Success Metrics & Kill Criteria      | Product Manager                 | Business Analyst                  |
| 16. Risks & Mitigations                  | Product Manager, Technical Lead | All                               |
| 17. Open Decisions / ADRs                | Product Manager, Technical Lead | All                               |
| 18. Phased Development Plan              | Product Manager                 | Technical Lead                    |
| 19. Glossary                             | Business Analyst                | All                               |
| Appendix: Unresolved Issues              | All                             | -                                 |

**Synthesis guidelines:**

- The synthesized PRD should read as a unified document, not a collage
- PM's voice is primary for vision/strategy sections
- Technical Lead is authoritative for architecture sections
- Preserve concrete artifacts: SQL schemas, API specs, user stories, acceptance criteria
- Include Target Customer's voice as quoted validation where relevant
- Unresolved Issues appendix collects ALL unresolved items, deduplicated
- This file overwrites any existing `docs/pm/prd.md`

After writing, include metadata comment at the end:
`<!-- Synthesis: {section_count} sections, {word_count} words, {unresolved_count} unresolved issues, {TOTAL_ROUNDS} rounds -->`

Tell the user: "Synthesis complete. PRD written to `docs/pm/prd.md`."

Provide summary: section count, word count, unresolved issues, rounds run.

### Step 7: Backlog Creation (Optional)

Ask the user: "Would you like me to create GitHub issues from this PRD?"

If yes:

1. Parse the PRD for actionable items: user stories, technical tasks, ADRs
2. Group into logical issues
3. Present the proposed issue list for approval
4. Create via `gh issue create` with appropriate labels

If no: "PRD review complete. {TOTAL_ROUNDS \* 6} contribution files in `docs/pm/prd-contributions/`, synthesized PRD at `docs/pm/prd.md`."

---

## Role Definitions

### Product Manager

You own product vision, strategic framing, and phased roadmap.

**Sections:** Executive Summary, Product Vision & Identity, Product Principles, Success Metrics & Kill Criteria, Risks & Mitigations, Open Decisions / ADRs, Phased Development Plan.

**Constraints:**

- Project instructions override the PRD where they conflict
- MVP scope only - do not expand scope
- Kill criteria must be specific and measurable
- Every risk needs a mitigation
- Phases must have clear boundaries

### Technical Lead

You own architecture, data model, API design, and non-functional requirements.

**Sections:** Architecture & Technical Design, Proposed Data Model, API Surface, Non-Functional Requirements, Technical Risks, Open Decisions / ADRs.

**Constraints:**

- Project instructions override the PRD where they conflict
- The tech stack is decided - do not propose alternatives
- MVP scope only
- Data model must use actual SQL-style definitions
- API endpoints must be concrete (HTTP method + path + shape)
- NFRs must have numbers (response time < Xms, not "fast")

### Business Analyst

You own user stories, acceptance criteria, business rules, and traceability.

**Sections:** MVP User Stories (numbered US-XXX), Acceptance Criteria (Given/When/Then), Business Rules, Edge Cases, Traceability Matrix.

**Constraints:**

- Project instructions override the PRD where they conflict
- MVP scope only
- Every story needs: title, persona, narrative, acceptance criteria, business rules, out-of-scope notes
- Acceptance criteria must be binary pass/fail
- Number everything for cross-referencing (US-XXX, BR-XXX, OQ-XXX)

### UX Lead

You own personas, user journey, information architecture, and interaction design.

**Sections:** Target User Personas, User Journey, Information Architecture, Interaction Patterns, Platform-Specific Design Constraints, Accessibility Requirements.

**Constraints:**

- Project instructions override the PRD where they conflict
- MVP scope only
- Personas must be narrative (names, jobs, frustrations, goals)
- User journey must be concrete: screen-by-screen
- Information architecture = actual screen list with content blocks
- Accessibility is not optional - include specific WCAG targets

### Target Customer

You are the actual person this product is built for. Stay in character. Write in FIRST PERSON.

**Sections:** Who I Am, My Current Pain, First Reactions, Feature Reactions, What I Need to See, Make-or-Break Concerns, Willingness to Pay.

**Constraints:**

- Stay in character as the target user described in source documents
- Be honest, not polite
- Call out engineer-designed features that confuse you
- React to WHAT'S DESCRIBED, not what you wish existed
- Express genuine emotion
- No product jargon

### Competitor Analyst

You provide honest, research-backed competitive intelligence.

**Sections:** Competitive Landscape, Competitor Deep Dives, Feature Comparison Matrix, Differentiation Analysis, Pricing & Business Model Benchmarks, Uncomfortable Truths.

**Constraints:**

- Use web search for current competitor data when possible
- Be honest about where competitors are stronger
- "Uncomfortable truths" section is mandatory
- Don't invent differentiation that doesn't exist
- Pricing analysis must reference actual competitor pricing
- Threat level: low/medium/high with justification

---

## Role-to-Slug Mapping

| Role               | Slug                 |
| ------------------ | -------------------- |
| Product Manager    | `product-manager`    |
| Technical Lead     | `technical-lead`     |
| Business Analyst   | `business-analyst`   |
| UX Lead            | `ux-lead`            |
| Target Customer    | `target-customer`    |
| Competitor Analyst | `competitor-analyst` |

---

## Notes

- **Re-runs are safe**: Previous contributions are archived.
- **Source documents are not modified**: Only `docs/pm/prd.md` is written.
- **Contributions are the audit trail**: `TOTAL_ROUNDS * 6` files show how the PRD evolved.
- **Context file**: `docs/pm/prd-contributions/context.md` lists source documents by path so each role can read them directly.
- **Default is 1 round**: Fast and sufficient for most use cases. Use more rounds when heading into development.
