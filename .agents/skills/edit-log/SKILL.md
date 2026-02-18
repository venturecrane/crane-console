---
name: edit-log
description: Editorial review for build logs - checks genericization and style
---

# Edit Log

Single-agent editorial review for build logs. Checks genericization and style, auto-fixes blocking issues, reports advisory issues for human judgment.

## Arguments

```
edit-log <path>
```

- `path` - path to the build log markdown file (optional)

Parse the argument: if no arguments provided, scan `~/dev/vc-web/src/content/logs/` for files with `draft: true` in their YAML frontmatter. List them and ask the user: "Which draft log should I review?" If no drafts found, tell the user: "No draft logs found. Provide a path: `edit-log <path>`"

If arguments are provided, use them as the log path.

## Pre-flight

Execute the following steps sequentially:

1. **Terminology doc**: Read `~/dev/vc-web/docs/content/terminology.md`. If missing, stop: "Terminology doc not found at ~/dev/vc-web/docs/content/terminology.md. Cannot run editorial review."
2. **Venture registry**: Read `~/dev/crane-console/config/ventures.json`. If missing, stop: "Venture registry not found."
3. **Log file**: Read the file at `path`. If missing, stop: "Log not found at {path}."
4. **Existing articles**: Search for files matching `~/dev/vc-web/src/content/articles/*.md` and read their titles and slugs (frontmatter only) for the cross-reference check.
5. **Display**: Extract the `title` from the log's YAML frontmatter. Display: `Editing: {title}` and proceed immediately. Do NOT ask for confirmation.

Store the full content of the terminology doc as `TERMINOLOGY_DOC`.
Store the full content of the log as `LOG_TEXT`.
Store the venture registry as `VENTURE_REGISTRY`.
Store the article titles/slugs list as `ARTICLE_INDEX`.

Build a list of **stealth ventures** - any venture where `portfolio.showInPortfolio` is `false`.

Extract **venture-name tags** from the log's frontmatter `tags` field. Recognized venture tags: `kid-expenses`, `durgan-field-guide`, `silicon-crane`, `draft-crane`. Store the matched tags as `LOG_VENTURE_TAGS` (or "None" if no venture tags found).

## Style & Genericization Editor

Execute the following editorial review inline (do not delegate to a sub-agent). Read the log line by line, checking every line against the rules below. Report findings with exact quoted text and line numbers.

### BLOCKING checks (must fix before publish)

**Genericization violations - always blocking (regardless of tags):**

- Any `crane-*` pattern EXCEPT "Venture Crane" (e.g., crane-context, crane-mcp, crane-classifier, crane-relay - these are internal names)
- Real org names: "venturecrane" in prose (OK in the site URL venturecrane.com when referring to the published site)
- Venture codes used as identifiers: vc, ke, sc, dfg, dc (two-letter codes in technical context)
- Specific venture counts: "5 ventures", "six ventures", or any specific number of ventures
- Legal entity names, App IDs (e.g., "2619905"), installation IDs
- Internal hostnames (mac23, mac-mini-1, etc.)
- Infisical paths (/vc, /ke, /sc, /dfg, /dc)
- Stealth venture names, codes, descriptions, or identifiable details - even in genericized form

**Venture name genericization - tag-dependent (see LOG_VENTURE_TAGS):**

- If the log IS tagged with a venture name (e.g., tags include `kid-expenses`), that venture's proper name ("Kid Expenses") is ALLOWED in prose. Do not flag it.
- Other public venture names in a tagged log are ADVISORY - report under Advisory, suggest genericizing for focus.
- If the log has NO venture-name tags, ALL public venture names are ADVISORY.
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
- crane-classifier -> "the GitHub classifier" or "the webhook processor"
- crane-relay -> "the legacy webhook worker" or "the monolithic worker"
- Venture codes -> Generic codes (alpha, beta, gamma, etc.)
- venturecrane org -> Omit or "example-org"
- Specific counts -> "multiple ventures" or "several projects"

### ADVISORY checks (report but don't auto-fix)

- Public venture names per the tag-dependent rules above (not auto-fixed; suggest genericizing for focus)
- Em dashes (should be hyphens)
- Article-register voice: flag analytical or explanatory tone that reads like an article rather than an operational log. Build logs should feel like a field report, not an essay.
- Numbers that might go stale: specific counts, percentages, or metrics that will become wrong over time
- Article overlap: search the article index for keyword overlap with the log's content. If found, surface: "This log discusses [topic]. An article on this topic exists at [slug]. Verify consistency."

### NOT checked (explicitly out of scope)

- "I" usage (acceptable in build logs per terminology doc)
- AI disclosure (BR-006 exempts logs)
- Fact-checking against other logs (avoids circular checking)

### Output Format

```
## Style & Genericization Editor

### Blocking (must fix before publish)

1. Line X: "{exact quoted text}" - {rule violated}. Fix: "{exact replacement text}"

### Advisory (should review)

1. Line X: "{exact quoted text}" - {issue}. Suggestion: "{suggested change}"

### Clean

- {What was checked and passed}
```

If a section has no findings, write "None" under the heading.

Quote the EXACT text from the log. Include line numbers. Every blocking issue MUST include a Fix with the EXACT replacement text.

---

## Apply Fixes

After completing the editorial review:

### Step 1: Apply blocking fixes

Re-read the log file (it may have changed). For each blocking issue:

1. Edit the file to find the exact quoted text and replace it with the suggested fix
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

**If fixes were applied**: End with "Applied {N} fix(es). Re-run `edit-log` to verify." Do NOT automatically re-run.

---

## Notes

- **Single pass**: Build logs are 200-1,000 words. One pass with a combined checklist is sufficient.
- **Auto-fix blocking only**: Genericization violations are mechanical and safe to auto-fix. Advisory issues need human judgment.
- **Re-run to verify**: After fixes, run `edit-log` again to confirm issues are resolved.
- **Terminology doc is the source of truth**: If the terminology doc is wrong, fix it there, not in the log.
- **No fact-checking**: Unlike `edit-article`, there's no fact checker. Build logs are short operational updates, not claims-heavy articles.
