---
name: edit-log
description: Build Log Editorial Review
version: 1.0.0
scope: enterprise
owner: agent-team
status: stable
---

# /edit-log - Build Log Editorial Review

> **Invocation:** As your first action, call `crane_skill_invoked(skill_name: "edit-log")`. This is non-blocking — if the call fails, log the warning and continue. Usage data drives `/skill-audit`.

Single-agent editorial review for build logs. Checks genericization and style, auto-fixes blocking issues, reports advisory issues for human judgment.

## Arguments

```
/edit-log <path>
```

- `path` - path to the build log markdown file (optional)

Parse the argument: if `$ARGUMENTS` is empty, scan `~/dev/vc-web/src/content/logs/` for files with `draft: true` in their YAML frontmatter. List them and ask the user to pick one using AskUserQuestion. If no drafts found, tell the user: "No draft logs found. Provide a path: `/edit-log <path>`"

If `$ARGUMENTS` is provided, use it as the log path.

## Pre-flight

Before spawning the editor agent, do these checks in order:

1. **Terminology doc**: Read `~/dev/vc-web/docs/content/terminology.md`. If missing, stop: "Terminology doc not found at ~/dev/vc-web/docs/content/terminology.md. Cannot run editorial review."
2. **Venture registry**: Read `~/dev/crane-console/config/ventures.json`. If missing, stop: "Venture registry not found."
3. **Log file**: Read the file at `path`. If missing, stop: "Log not found at {path}."
4. **Existing articles**: Glob `~/dev/vc-web/src/content/articles/*.md` and read their titles and slugs (frontmatter only) for the cross-reference check.
5. **Display**: Extract the `title` from the log's YAML frontmatter. Display: `Editing: {title}` and proceed immediately. Do NOT ask for confirmation.

Store file paths for agent delegation:

- Terminology doc path: `~/dev/vc-web/docs/content/terminology.md`
- Venture registry path: `~/dev/crane-console/config/ventures.json`

Store the full content of the log as `LOG_TEXT` (unique per invocation, must be embedded).
Store the article titles/slugs list as `ARTICLE_INDEX`.

Build a list of **stealth ventures** - any venture where `portfolio.showInPortfolio` is `false`.

Extract **venture-name tags** from the log's frontmatter `tags` field. Recognized venture tags: `kid-expenses`, `durgan-field-guide`, `silicon-crane`, `draft-crane`. Store the matched tags as `LOG_VENTURE_TAGS` (or "None" if no venture tags found).

## Editor Agent

Launch one agent using the Task tool (`subagent_type: general-purpose`, `model: "sonnet"`).

### Agent: Style & Genericization Editor

Prompt:

```
You are the Style & Genericization Editor for build logs. You check logs against the terminology doc, genericization rules, and style guidelines.

## Source Documents

Read these files using the Read tool before starting your review:
- **Terminology Doc (source of truth):** ~/dev/vc-web/docs/content/terminology.md
- **Venture Registry:** ~/dev/crane-console/config/ventures.json

## Stealth Ventures (must not appear at all)

{list of ventures with showInPortfolio: false, with their names and codes}

## Article Index (for cross-reference check)

{ARTICLE_INDEX}

## Log Venture Tags

{LOG_VENTURE_TAGS}

## Build Log Under Review

{LOG_TEXT}

## Instructions

Read the log line by line. Check every line against the rules below. Report findings with exact quoted text and line numbers.

### BLOCKING checks (must fix before publish)

**Genericization violations - always blocking (regardless of tags):**
- Any `crane-*` pattern EXCEPT "Venture Crane" (e.g., crane-context, crane-mcp, crane-watch, crane-relay - these are internal names)
- Real org names: "venturecrane" in prose (OK in the site URL venturecrane.com when referring to the published site)
- Venture codes used as identifiers: vc, ke, sc, dfg, dc (two-letter codes in technical context)
- Specific venture counts: "5 ventures", "six ventures", or any specific number of ventures
- Legal entity names, App IDs (e.g., "2619905"), installation IDs
- Internal hostnames (mac23, mac-mini-1, etc.)
- Infisical paths (/vc, /ke, /sc, /dfg, /dc)
- Stealth venture names, codes, descriptions, or identifiable details - even in genericized form

**Venture name genericization - tag-dependent (see Log Venture Tags above):**
- If the log IS tagged with a venture name (e.g., tags include `kid-expenses`), that venture's proper name ("Kid Expenses") is ALLOWED in prose. Do not flag it.
- Other public venture names in a tagged log are ADVISORY - report under "### Advisory", suggest genericizing for focus.
- If the log has NO venture-name tags, ALL public venture names are ADVISORY - report under "### Advisory", suggest genericizing for readability.
- Stealth ventures are ALWAYS blocking regardless of tags.

**Terminology violations** - per the terminology doc canonical names table:
- "product factory" instead of "development lab"
- "SQLite" alone without "D1"
- "secrets manager" alone without naming "Infisical" on first reference
- Any other violations of the canonical name table

For each blocking issue, provide:
- The EXACT genericized replacement per the terminology doc's Published Content section
- crane-context -> "the context API" or "the context worker"
- crane-mcp -> "the MCP server" or "the local MCP server"
- crane-watch -> "the webhook watcher" or "the webhook processor"
- crane-relay -> "the legacy webhook worker" or "the monolithic worker"
- Venture codes -> Generic codes (alpha, beta, gamma, etc.)
- venturecrane org -> Omit or "example-org"
- Specific counts -> "multiple ventures" or "several projects"

**Claude-attribution overclaim** - per terminology.md Claude Attribution Section 1. Check each sentence that characterizes the VC-Anthropic partnership relationship. If the characterization matches a canonical form verbatim ("in the Claude Partner Network", "pursuing Partner Network status", "applied to the Claude Partner Network"), pass. If not, flag BLOCKING and propose a rewrite toward the closest canonical form. Do NOT auto-fix; rewrites are human-review only because surrounding context shapes which canonical form fits.

**Tool attribution conflation** - per terminology.md Claude Attribution Section 2 (lexicon) and Section 3 (venture-to-integration mapping). Flag BLOCKING when a tool term does not match the integration point the sentence describes. Examples: "Claude Code" naming a direct HTTP API call (fix: "the Claude API"); "Claude" in a sentence specifically describing an SS or DFG pipeline call (fix: "the Claude API"); "MCP" used as if it were the agent itself (fix: "Claude Code" or "the agent"). Auto-fix only when the mapping yields an unambiguous target; otherwise flag for human review.

### ADVISORY checks (report but don't auto-fix)

- Public venture names per the tag-dependent rules above (not auto-fixed; suggest genericizing for focus)
- Em dashes (should be hyphens)
- Article-register voice: flag analytical or explanatory tone that reads like an article rather than an operational log. Build logs should feel like a field report, not an essay.
- Numbers that might go stale: specific counts, percentages, or metrics that will become wrong over time
- Article overlap: search the article index for keyword overlap with the log's content. If found, surface: "This log discusses [topic]. An article on this topic exists at [slug]. Verify consistency."
- **Generic AI-agent language** - per terminology.md Claude Attribution Section 4. Apply the two-question retrofit heuristic: (1) Does the log's title describe a Claude Code capability, workflow, or session? (2) Does the log already name Claude Code at least once? If YES to either, the retrofit exception does NOT apply: flag the generic reference as advisory with a specific Claude Code attribution suggestion. If NO to both, the retrofit exception applies: suppress silently.

### NOT checked (explicitly out of scope)

- "I" usage (acceptable in build logs per terminology doc)
- AI disclosure (BR-006 exempts logs)
- Fact-checking against other logs (avoids circular checking)

### Output Format

Start with `## Style & Genericization Editor`

Then:

### Blocking (must fix before publish)

1. Line X: "{exact quoted text}" - {rule violated}. Fix: "{exact replacement text}"

### Advisory (should review)

1. Line X: "{exact quoted text}" - {issue}. Suggestion: "{suggested change}"

### Clean

- {What was checked and passed}

If a section has no findings, write "None" under the heading.

CONSTRAINTS:
- Quote the EXACT text from the log. Do not paraphrase.
- Include line numbers. Count from line 1 of the raw file (including frontmatter).
- Every blocking issue MUST include a Fix with the EXACT replacement text that can be used in a find-and-replace operation.
- Advisory issues include a Suggestion (not a Fix) since they need human judgment.
- Do NOT write files. Return your report as your final response message.
```

---

## Apply Fixes

Wait for the agent to complete. Then:

### Step 1: Apply blocking fixes

Re-read the log file (it may have changed since pre-flight). For each blocking issue:

1. Use the Edit tool to find the exact quoted text and replace it with the suggested fix
2. If the quoted text can't be found (text was already fixed, etc.), skip it and note it in the report
3. Verify each edit preserves markdown formatting

### Step 2: Report

After applying fixes, present:

```
## Editorial Report: {log title}

### Fixed: {count}
{list of fixes applied, with before/after quotes}

### Requires Human Review: {count}
{advisory issues that need judgment}

### Clean Checks
{what passed}
```

**If nothing was fixed and nothing needs review**: "Editorial review complete. No issues found."

**If fixes were applied**: End with "Applied {N} fix(es). Re-run `/edit-log` to verify." Do NOT automatically re-run.

---

## Notes

- **Single agent**: Build logs are 200-1,000 words. One agent with a combined checklist is sufficient.
- **Auto-fix blocking only**: Genericization violations are mechanical and safe to auto-fix. Advisory issues need human judgment.
- **Re-run to verify**: After fixes, run `/edit-log` again to confirm issues are resolved.
- **Agent type**: Uses `subagent_type: general-purpose`, `model: "sonnet"` via the Task tool.
- **Terminology doc is the source of truth**: If the terminology doc is wrong, fix it there, not in the log.
- **No fact-checking**: Unlike `/edit-article`, there's no fact checker agent. Build logs are short operational updates, not claims-heavy articles.
