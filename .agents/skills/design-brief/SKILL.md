---
name: design-brief
description: Multi-agent design brief with configurable rounds
---

# Design Brief

Orchestrates a 4-role design brief process with configurable rounds. Reads the PRD and existing design artifacts, runs structured design rounds with sequential role analysis, and synthesizes the output into a production-ready design brief.

The design brief answers "how should this look and feel?" - downstream of the PRD ("what to build and why?"). It requires a PRD to exist before running.

Works in any venture console that has `docs/pm/prd.md`.

## Arguments

```
design-brief [rounds]
```

- `rounds` - number of design rounds (default: **1**). Each additional round adds cross-pollination where roles read and respond to each other's work.
  - **1 round**: Independent analysis + synthesis. Fast. Good for greenfield projects.
  - **2 rounds**: Adds cross-pollination. Roles revise after reading all Round 1 output.
  - **3 rounds**: Full process. Adds final polish with open design decisions.

Parse the argument: if no arguments or not a number, default to 1. No upper bound. Store as `TOTAL_ROUNDS`.

## Execution

### Step 1: Locate Source Documents

**PRD (required)**

Check for `docs/pm/prd.md`. If not found, stop:

> I couldn't find a PRD at `docs/pm/prd.md`.
>
> The design brief is downstream of product definition - it needs a PRD to work from.
>
> Run the prd-review skill first to generate a PRD, then re-run design-brief.

**Enrichment sources (optional)**

Search for additional design context. Proceed without them if not found:

1. **Executive summary** - Use `crane_notes` MCP tool to search for notes with tag `executive-summary` scoped to the current venture
2. **Design tokens** - Search for files matching `**/globals.css` and `**/tailwind.config.*`
3. **Component library** - Search for `**/components/ui/**/index.{ts,tsx,js,jsx}` (barrel exports only)
4. **Design charter** - Check `docs/design/charter.md` or search `docs/design/*.md`
5. **Live site** - Check for a deploy URL in the PRD, project instructions, or package.json

Display a **Design Artifact Inventory** table showing what was found:

| Source            | Status            | Path / Details           |
| ----------------- | ----------------- | ------------------------ |
| PRD               | Found             | `docs/pm/prd.md`         |
| Executive Summary | Found / Not found | VCMS note or -           |
| Design Tokens     | Found / Not found | path or -                |
| Component Library | Found / Not found | path (N components) or - |
| Design Charter    | Found / Not found | path or -                |
| Live Site         | Found / Not found | URL or -                 |

### Step 2: Extract and Confirm Design Context

Read the PRD and all found enrichment sources. Extract into a confirmation table:

| Field                | Value                                                               |
| -------------------- | ------------------------------------------------------------------- |
| Product Name         | _(from PRD)_                                                        |
| Tagline              | _(from PRD)_                                                        |
| Tech Stack           | _(from PRD)_                                                        |
| Primary Platform     | _(from PRD)_                                                        |
| Target User          | _(from PRD)_                                                        |
| Emotional Context    | _(from PRD - what emotional state is the user in when using this?)_ |
| **Design Maturity**  | _(from filesystem scan - see classification below)_                 |
| Existing Palette     | _(from globals.css custom properties, or "None")_                   |
| Component Count      | _(from ui/ barrel exports, or "0")_                                 |
| Dark Mode            | _(from globals.css: "Implemented" / "Partial" / "None")_            |
| Accessibility Target | _(from PRD/charter, or default "WCAG 2.1 AA")_                      |

**Design Maturity classification** (critical - this changes role behavior):

- **Greenfield**: No design tokens, no components. Roles propose everything from scratch - concrete hex values, type scales, spacing systems.
- **Tokens defined**: globals.css has CSS custom properties, minimal components (0-2). Roles respect existing tokens and extend the system.
- **Full system**: Design tokens + 3 or more components in ui/. Roles refine, document, and fill gaps - they do not replace what exists.

Display: "Running {TOTAL_ROUNDS} round(s) with 4 design roles. Design Maturity: {MATURITY}."

Ask the user: "Does this look right? Anything to correct before I start the design brief?"

Wait for confirmation. If corrections provided, note them for all roles.

### Step 3: Handle Previous Runs

Check if `docs/design/contributions/` exists. If so:

1. Create archive: `docs/design/contributions-archive/{ISO-date}/`
2. Move `docs/design/contributions/` into the archive
3. Tell the user: "Archived previous run to `docs/design/contributions-archive/{ISO-date}/`"

If the archive date directory already exists, append a counter.

### Step 4: Create Directory Structure

```bash
mkdir -p docs/design/contributions/round-{1..TOTAL_ROUNDS}
```

### Step 5: Run Design Rounds

Execute `TOTAL_ROUNDS` rounds sequentially. Each round processes all 4 roles SEQUENTIALLY (one at a time).

---

**Round 1 (independent analysis):**

For each of the 4 roles (Brand Strategist, Interaction Designer, Design Technologist, Target User), execute sequentially:

Provide each role with:

- Full text of the PRD
- Executive summary (if found)
- Design artifact contents (globals.css custom properties, component barrel exports, charter)
- Design Maturity classification and what it means for their work
- Any user corrections from Step 2
- Output path: `docs/design/contributions/round-1/{role-slug}.md`

Write each role's contribution to the output path.

After all 4 roles complete, tell the user: "Round 1 complete. All 4 design roles have written their independent analyses."

---

**Middle rounds (N > 1 and N < TOTAL_ROUNDS - cross-pollination):**

Read ALL 4 output files from round N-1. For each role, sequentially:

Provide the same inputs as Round 1 PLUS all 4 contributions from round N-1.

Each role's output must start with `## Changes from Round {N-1}` with a numbered list of key revisions, then the full revised contribution.

---

**Final round (N == TOTAL_ROUNDS and N > 1 - polish + open design decisions):**

Same as middle round, but each role must also include a final `## Open Design Decisions` section listing genuine design disagreements or unresolved questions. For each:

- **The question**: what needs to be decided
- **Options considered**: what each role suggested
- **Why it matters**: impact on user experience
- **My recommendation**: stance as this role
- **Needs**: what type of decision is required

**Special case: TOTAL_ROUNDS == 1** - Round 1 IS the final round. No "Changes from" or "Open Design Decisions" sections. Proceed directly to synthesis.

### Step 6: Synthesis

Read ALL 4 contributions from the final round. Synthesize into `docs/design/brief.md`:

```markdown
# {Product Name} - Design Brief

> Synthesized from {TOTAL_ROUNDS}-round, 4-role design brief process. Generated {TODAY}.
> Design Maturity: {MATURITY_LEVEL}

## Table of Contents

1. Product Identity
2. Brand Personality & Design Principles
3. Target User Context
4. Visual Language
5. Screen Inventory & Key Screens
6. Interaction Patterns
7. Component System Direction
8. Technical Constraints
9. Inspiration & Anti-Inspiration
10. Design Asks
11. Open Design Decisions
```

**Synthesis rules - Section-to-Role Mapping:**

| Section                                  | Primary Source       | Supporting Sources                     |
| ---------------------------------------- | -------------------- | -------------------------------------- |
| 1. Product Identity                      | Brand Strategist     | Target User                            |
| 2. Brand Personality & Design Principles | Brand Strategist     | Target User, Interaction Designer      |
| 3. Target User Context                   | Target User          | Brand Strategist, Interaction Designer |
| 4. Visual Language                       | Brand Strategist     | Design Technologist                    |
| 5. Screen Inventory & Key Screens        | Interaction Designer | Design Technologist                    |
| 6. Interaction Patterns                  | Interaction Designer | Target User, Design Technologist       |
| 7. Component System Direction            | Design Technologist  | Interaction Designer                   |
| 8. Technical Constraints                 | Design Technologist  | Interaction Designer                   |
| 9. Inspiration & Anti-Inspiration        | Brand Strategist     | Target User                            |
| 10. Design Asks                          | Interaction Designer | All                                    |
| 11. Open Design Decisions                | All                  | -                                      |

**Synthesis guidelines:**

- The synthesized brief should read as a unified document, not a collage
- Brand Strategist's voice is primary for identity and visual language
- Design Technologist is authoritative for technical constraints and components
- Preserve concrete artifacts: hex values, contrast ratios, component specs, ARIA patterns
- Include Target User's voice as quoted reactions where relevant (first person, emotional)
- Design Asks: numbered list of specific, actionable design tasks with title, description, priority (P0/P1/P2), and originating role
- This file overwrites any existing `docs/design/brief.md`

Tell the user: "Synthesis complete. Design brief written to `docs/design/brief.md`."

Provide summary: section count, word count, open design decisions, design asks, rounds run.

### Step 7: Follow-up (Optional)

Ask the user: "What would you like to do next?"

1. **Store in VCMS** - Save using `crane_note` with tag `design` and current venture scope.
2. **Create design issues** - Parse Design Asks, create GitHub issues with `area:design` label. Present list for approval first.
3. **Generate design charter** - If `docs/design/charter.md` doesn't exist, offer to generate one covering: design principles, decision-making process, token naming conventions, component contribution guidelines, accessibility standards.

If declined, finish: "Design brief complete. {TOTAL_ROUNDS \* 4} contribution files in `docs/design/contributions/`, synthesized brief at `docs/design/brief.md`."

---

## Role Definitions

### Brand Strategist

You own brand personality, visual identity, and emotional design direction.

**Sections:**

- Brand Personality: 3-5 traits with "this, not that" examples
- Design Principles: 5-7 prioritized principles
- Color System: primary, secondary, accent, semantic, neutral palette. Every color as hex with WCAG AA contrast ratio. Light and dark mode variants.
- Typography: font stack (Google Fonts or system fonts only), scale with specific sizes for h1-h6, body, small, caption. Line heights and letter spacing.
- Spacing & Rhythm: base unit and scale (e.g., 4px base)
- Imagery & Iconography: icon style, library recommendation, illustration/photography direction
- Inspiration Board: 3-5 real products with URLs and what to take from each
- Anti-Inspiration: 2-3 products representing the wrong direction

**Constraints:**

- If existing tokens found, START from those values. Propose changes only where gaps or inconsistencies exist.
- If greenfield, propose CONCRETE hex values - never say "choose a primary color." Choose it.
- All text/background pairings MUST pass WCAG AA contrast (4.5:1 normal, 3:1 large). Include ratio.
- Typography must use only Google Fonts or system font stacks.
- Inspiration references must be real, current products with URLs.

### Interaction Designer

You own screen inventory, user flows, navigation, and interaction patterns.

**Sections:**

- Screen Inventory: complete list mapping 1:1 to PRD features. URL pattern, purpose, primary action.
- Key Screen Breakdowns: top 5 screens with layout (mobile-first), content hierarchy, primary action, empty/loading/error states.
- Navigation Model: primary nav, secondary nav, breadcrumbs, max depth, mobile nav pattern.
- User Flows: top 3 critical task flows, step-by-step with happy path and error path.
- Form Patterns: input styles, validation timing, error placement, required indicators.
- Feedback Patterns: toast/notification style, confirmations, progress indicators.
- Responsive Strategy: breakpoints, what changes at each, mobile-first.

**Constraints:**

- Screen inventory MUST map 1:1 to PRD features.
- Mobile-first descriptions.
- Every data-displaying screen MUST specify empty, loading, and error states.
- Max 2 taps/clicks to reach any primary feature from home.
- User flows must be concrete, not abstract.

### Design Technologist

You own component system, token architecture, accessibility, and technical constraints.

**Sections:**

- Component Inventory: every UI component for MVP with name, purpose, variants, key props (TypeScript-style), status (Exists/Needs update/New), ARIA role/pattern.
- Design Token Architecture: naming convention with venture prefix (e.g., --ke-color-primary), categories, CSS custom property definitions, Tailwind config mapping.
- CSS Strategy: methodology based on tech stack.
- Dark Mode Implementation: strategy and token structure.
- Responsive Implementation: container queries vs media queries, fluid typography, responsive spacing.
- Accessibility: focus management, keyboard navigation, ARIA patterns, reduced-motion, screen reader announcements.
- Performance Budget: FCP, LCP, CLS targets in specific numbers. CSS bundle size target. Font loading strategy.
- Animation & Motion: easing curves, duration scale, what animates.

**Constraints:**

- If existing components found, mark as Exists/Needs update/New. Do not replace existing.
- Token naming MUST use venture prefix pattern.
- Every component MUST specify ARIA role or pattern.
- Performance budget must have specific numbers.
- Animation durations: 100-150ms micro-interactions, 200-300ms transitions, 300-500ms page transitions.
- Accessibility target is WCAG 2.1 AA unless specified otherwise.

### Target User

You are the actual person this product is designed for. Stay in character. Write in FIRST PERSON.

**Sections:**

- Who I Am: identity, daily life, emotional state when using this product.
- My Environment: device, time of day, attention level, physical context.
- First Impressions: trustworthy? Professional? Fun? Confusing?
- Emotional Reactions: for each key screen, how does it make me feel?
- What Feels Right: design patterns from real apps I already use.
- What Would Turn Me Off: specific anti-patterns that would make me leave.
- Navigation Expectations: what should be one tap away? What's OK to bury?
- Make-or-Break Moments: 2-3 moments where design quality determines if I stay or leave.

**Constraints:**

- First person ONLY. Never break character. Never use design jargon.
- Be honest, not polite.
- Reference REAL apps as comparisons.
- Express genuine emotion.
- React to WHAT'S DESCRIBED, not what you wish existed.

---

## Role-to-Slug Mapping

| Role                 | Slug                   |
| -------------------- | ---------------------- |
| Brand Strategist     | `brand-strategist`     |
| Interaction Designer | `interaction-designer` |
| Design Technologist  | `design-technologist`  |
| Target User          | `target-user`          |

---

## Notes

- **PRD is required**: Design brief is downstream of product definition.
- **Design Maturity drives behavior**: Greenfield = propose everything. Full system = refine and extend.
- **4 roles not 6**: Design is more focused than product definition; 6 roles would produce redundancy.
- **Output in `docs/design/`**: Separate concern from PM artifacts in `docs/pm/`.
- **Re-runs are safe**: Previous contributions are archived.
- **Source documents are not modified**: Only `docs/design/brief.md` is written.
- **Contributions are the audit trail**: `TOTAL_ROUNDS * 4` files show how the brief evolved.
- **Default is 1 round**: Fast and sufficient for most use cases.
