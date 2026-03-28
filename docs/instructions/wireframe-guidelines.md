# Wireframe Guidelines

Guidelines for generating and using wireframes in the Venture Crane workflow.

## Before Generating a Wireframe

1. Load the venture's design spec: `crane_doc('{venture_code}', 'design-spec.md')`
2. Use the design spec's color tokens, typography, and component patterns in the wireframe
3. Match the venture's dark/light mode and surface hierarchy
4. Use venture-prefixed CSS custom properties (e.g., `var(--vc-surface-chrome)`, `var(--ke-accent)`)

If no design spec exists for the venture, use the wireframe defaults below and note the gap.

## When to Wireframe

**Decision rule:** Does this story change what a user sees in a browser or app?

- **Yes** (new page, layout change, new component, UI redesign) - wireframe required
- **No** (API endpoint, background job, config change, pure backend logic) - skip, mark "N/A" in Agent Brief

Bug fixes skip wireframes unless the fix changes layout.

## What PM Generates

An interactive HTML/CSS prototype - a single self-contained HTML file with inline CSS and JS. No external dependencies.

### Prompt Template

Feed Claude the acceptance criteria and this prompt pattern (works in Claude Code, Claude Desktop, or any Claude agent):

> Generate an interactive HTML wireframe for this feature:
>
> [Paste acceptance criteria here]
>
> Requirements:
>
> - Single self-contained HTML file (inline CSS and JS, no external dependencies)
> - Mobile-first responsive layout with breakpoints at 640px (sm), 768px (md), 1024px (lg)
> - Semantic HTML5 (nav, main, aside, footer - not div soup)
> - Plain CSS (no frameworks)
> - Show key states: default, empty, loading, error (where applicable)
> - Interactive elements should be clickable/demonstrable where possible
> - Use realistic content structure from the acceptance criteria (not Lorem Ipsum)
> - Include accessibility landmarks

Iterate from there: "move X above Y", "add empty state", "make the CTA more prominent", "show the error state for invalid input."

### Wireframe MUST Show

- Component placement and hierarchy
- Responsive behavior (mobile, tablet, desktop)
- Key interaction states (empty, loading, error, success - where applicable)
- Content structure (headings, body text, metadata, CTAs)

### Wireframe Does NOT Need

- Exact colors (use semantic names: primary, secondary, danger)
- Exact spacing values (use visual consistency, not pixel measurements)
- Icon artwork (use text labels or placeholders)
- Animations (describe in a comment, don't implement)
- Production data (use realistic examples from the ACs)
- Brand typography (use system fonts)

## File Conventions

- **Path:** `/docs/wireframes/{issue-number}/`
- **Main file:** `index.html`
- **Additional states (optional):** `empty-state.html`, `error-state.html`, `mobile-detail.html`
- **Self-contained:** All CSS and JS inline. No CDN links, no npm packages, no build step.

## Conflict Resolution

Wireframe is a visual interpretation of the acceptance criteria. **AC always wins** if there's ambiguity.

If Dev finds a conflict between wireframe and AC:

1. Dev applies `needs:pm` label immediately
2. PM updates EITHER wireframe OR AC to resolve (Dev does not decide)
3. PM documents change in issue comment and removes `needs:pm`
4. Dev resumes from updated source of truth

## Freeze Rule

Once Dev marks issue `status:in-progress`, the wireframe is frozen. Any PM changes after that point require Captain approval.

## Google Stitch Integration

[Stitch](https://stitch.withgoogle.com) generates visual UI from text prompts. Use it for complex interaction UI where describing layout through text alone is inefficient.

### When to Use Stitch

- **Complex interaction patterns** (multi-panel editors, drag-and-drop, streaming feedback) - Stitch
- **Simple layouts** (landing pages, forms, lists) - direct wireframe generation per the prompt template above

### Authentication

Stitch uses **OAuth2 via gcloud Application Default Credentials (ADC)** - API keys are rejected by the Stitch API.

The fleet launcher configures Stitch MCP automatically:

- `STITCH_PROJECT_ID` — hardcoded to `smdurgan-tools`
- `GOOGLE_APPLICATION_CREDENTIALS` — points to the system ADC file (`~/.config/gcloud/application_default_credentials.json`)

The proxy server handles token refresh automatically using the ADC refresh token.

**If Stitch tools fail to connect:**

1. Verify ADC exists: `ls ~/.config/gcloud/application_default_credentials.json`
2. If missing, run: `gcloud auth application-default login`
3. Test auth: `gcloud auth application-default print-access-token | head -c 10`
4. A session restart is needed after fixing auth (MCP servers are initialized at launch time)

**Per-machine setup** (one-time, handled during fleet bootstrap):

```bash
gcloud auth login
gcloud auth application-default login
npx @_davideast/stitch-mcp@0.5.0 init -c cc  # select OAuth > Proxy
```

### MCP Tools (Fleet-Managed)

The `stitch` MCP server is registered fleet-wide via `.mcp.json`. Available tools:

| Tool               | Purpose                                         |
| ------------------ | ----------------------------------------------- |
| `build_site`       | Create or update a Stitch project from a prompt |
| `get_screen_code`  | Export HTML/CSS/JS for a specific screen        |
| `get_screen_image` | Export a screenshot of a specific screen        |

### Project Conventions

- **Project:** Use the venture's persistent Stitch project (from `stitchProjectId` in `config/ventures.json`). Do NOT create per-issue projects.
- **Screen naming:** `{issue-number}-{feature}-{state}` (e.g., `395-editor-panel-feedback`, `395-mobile-nav`)
- Import the venture's `.stitch/DESIGN.md` into the Stitch project for brand-accurate output (generate it via `/stitch-design` if it doesn't exist)

> **Migration note:** Projects created before 2026-03-28 used per-issue naming (`{code}-{issue}`). These remain accessible via `list_projects` but new screens go in the persistent venture project from `stitchProjectId`.

### Stitch Output in the Wireframe Pipeline

Stitch output feeds into the same pipeline as hand-written wireframes:

1. Generate screens in Stitch (iterate on prompts until interaction model is right)
2. Export via `get_screen_code` into `/docs/wireframes/{issue-number}/`
3. Commit as the wireframe artifact - same freeze rule applies
4. Dev implements from the wireframe + ACs (ACs are still canonical)

## What Wireframes Are NOT

- Not final designs (no brand colors, exact typography, or pixel-perfect asset placement)
- Not a Figma replacement for design-heavy products
- Not required for non-UI work
- Not a separate source of truth (ACs are canonical)
