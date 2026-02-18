---
name: edit-article
description: Editorial review with style check and fact check
---

# Edit Article

Runs an article through two sequential editorial passes (Style & Compliance, then Fact Check), applies blocking fixes directly, and reports what changed. Advisory issues are reported but not auto-fixed.

## Arguments

```
edit-article <path>
```

- `path` - path to the article markdown file (optional)

Parse the argument: if no arguments provided, scan `~/dev/vc-web/src/content/articles/` for files with `draft: true` in their YAML frontmatter. List them and ask the user: "Which draft article should I review?" If no drafts found, tell the user: "No draft articles found. Provide a path: `edit-article <path>`"

If arguments are provided, use them as the article path.

## Pre-flight

Execute the following steps sequentially:

1. **Terminology doc**: Read `~/dev/vc-web/docs/content/terminology.md`. If missing, stop: "Terminology doc not found at ~/dev/vc-web/docs/content/terminology.md. Cannot run editorial review."
2. **Venture registry**: Read `~/dev/crane-console/config/ventures.json`. If missing, stop: "Venture registry not found."
3. **Article file**: Read the file at `path`. If missing, stop: "Article not found at {path}."
4. **Display**: Extract the `title` from the article's YAML frontmatter. Display: `Editing: {title}` and proceed immediately. Do NOT ask for confirmation.

Store the full content of the terminology doc as `TERMINOLOGY_DOC`.
Store the venture registry as `VENTURE_REGISTRY`.
Store the full content of the article as `ARTICLE_TEXT`.

Build a list of **stealth ventures** - any venture where `portfolio.showInPortfolio` is `false`.

Extract **venture-name tags** from the article's frontmatter `tags` field. Recognized venture tags: `kid-expenses`, `durgan-field-guide`, `silicon-crane`, `draft-crane`. Store as `ARTICLE_VENTURE_TAGS` (or "None" if no venture tags found).

---

## Pass 1: Style & Compliance Editor

Execute the following checks sequentially. Read the article line by line. Check every line against the rules below. Report findings with exact quoted text and line numbers.

### BLOCKING checks (must fix before publish)

**Genericization violations - always blocking (regardless of tags):**

- Any `crane-*` pattern EXCEPT "Venture Crane" (e.g., crane-context, crane-mcp, crane-classifier, crane-relay are all internal names)
- Real org names: "venturecrane" in prose (OK in `sources` frontmatter URLs)
- Real venture codes used as identifiers: vc, ke, sc, dfg, dc (OK in `sources` frontmatter)
- Specific venture counts: "5 ventures", "six ventures", or any specific number of ventures
- Legal entity names
- Stealth venture names or identifiable details

**Venture name genericization - tag-dependent (see ARTICLE_VENTURE_TAGS):**

- If the article IS tagged with a venture name, that venture's proper name is ALLOWED in prose. Do not flag it.
- Other public venture names in a tagged article are ADVISORY.
- If the article has NO venture-name tags, ALL public venture names are ADVISORY.
- Stealth ventures are ALWAYS blocking regardless of tags.

**Terminology violations** - per the terminology doc canonical names table:

- "product factory" instead of "development lab"
- "SQLite" alone without "D1"
- "secrets manager" alone without naming "Infisical" on first reference
- Any other violations of the canonical name table

**Manufactured experience** - flag these patterns, then evaluate context:

- Patterns: "we discovered", "we learned", "we realized", "we felt", "we believed", "surprised", "it struck us", "it dawned on", "After X years", "In my experience", "Having spent", "I noticed", "I decided", "I wanted"
- NOT automatic blockers. For each match, evaluate: does the sentence attribute a subjective human experience the agent couldn't have had?
  - FINE: "We learned from the build logs that usage dropped 40%" (citing evidence)
  - BLOCKING: "We learned that simplicity matters" (manufacturing wisdom)
  - FINE: "We discovered the worker was timing out after checking the error logs" (citing debugging)
  - BLOCKING: "We discovered that less is more" (manufacturing insight)

**Founder-voice fabrication** - any sentence that puts words in the founder's mouth or manufactures a personal anecdote

### ADVISORY checks (should fix)

- Public venture names per the tag-dependent rules above
- Em dashes (should be hyphens)
- "I" in articles (only "we" or third person per terminology doc)
- Throat-clearing openers ("In this article, we will...", "Today we're going to...")
- Marketing language (superlatives, hype, "revolutionary", "game-changing", etc.)
- Register mismatch (article should be analytical/explanatory, not terse build-log voice)

### Output Format for Pass 1

```
## Style & Compliance Editor

### Blocking (must fix before publish)
1. Line X: "{exact quoted text}" - {rule violated}. Fix: "{exact replacement text}"

### Advisory (should fix)
1. Line X: "{exact quoted text}" - {issue}. Fix: "{exact replacement text}"

### Clean
- {What was checked and passed}
```

Quote the EXACT text. Include line numbers. Every issue MUST include a Fix with EXACT replacement text.

---

## Pass 2: Fact Checker

After completing Pass 1, execute the fact-checking pass. Verify claims in the article against real sources using the verification checklist below IN ORDER.

### Verification Checklist

**1. Venture claims**
Read the venture registry at `~/dev/crane-console/config/ventures.json`. Compare to any count, name, or capability claim in the article. Flag mismatches.

**2. Number verification**
For any token count, file count, line count, percentage, or other specific number: search build logs at `~/dev/vc-web/src/content/logs/*.md` for verification. Flag numbers that don't match.

**3. Status claims**
For anything described as a "current limitation", "not yet", "doesn't yet", "future work": search build logs and the codebase for evidence it's been resolved. Flag solved problems presented as current limitations.

**4. Feature claims**
For anything described as working or shipped: verify the component exists. Check for the worker, endpoint, config file, or package - a quick existence check is sufficient. Do NOT deep-read source code.

**5. Cross-article consistency**
Read other articles at `~/dev/vc-web/src/content/articles/*.md`. Flag contradictions.

### Scope Constraint

Do NOT read arbitrary source code files. Stick to the checklist. Use these sources ONLY:

- `~/dev/crane-console/config/ventures.json`
- `~/dev/vc-web/src/content/logs/*.md`
- `~/dev/vc-web/src/content/articles/*.md`
- `crane_notes` MCP tool
- `crane_status` MCP tool
- File existence checks (not reading implementation)

If a claim cannot be verified, flag as "UNVERIFIED - requires manual confirmation."

### Classification

**BLOCKING**: Outdated claims (solved problem as current limitation), wrong numbers, aspirational-as-shipped.

**ADVISORY**: Architecture descriptions that don't match, cross-article contradictions, unverifiable claims.

### Output Format for Pass 2

```
## Fact Checker

### Blocking (must fix before publish)
1. Line X: "{exact quoted text}" - {what's wrong}. Source: {where you checked}. Fix: "{exact replacement text}"

### Advisory (should fix)
1. Line X: "{exact quoted text}" - {issue}. Source: {where you checked}. Fix: "{exact replacement text}"

### Clean
- {What was checked and passed, with source references}
```

---

## Apply Fixes

After completing both passes:

### Step 1: Apply blocking fixes

Re-read the article file (it may have changed). For each blocking issue from both passes:

1. Edit the file to find the exact quoted text and replace it with the suggested fix
2. If the quoted text can't be found, skip it and note it in the report
3. Deduplicate - if both passes flagged the same text, apply the fix once

### Step 2: Apply advisory fixes

For advisory issues with clear, mechanical fixes (em dashes, grammar errors, wrong terminology), apply them. Skip advisory issues that require judgment - list those in the report for human review.

### Step 3: Report

```
## Editorial Report: {article title}

### Fixed: {count}
{list of fixes applied, with before/after quotes}

### Requires Human Review: {count}
{advisory issues that weren't auto-fixed because they need judgment}

### Clean Checks
{what passed across both passes}
```

**If nothing was fixed and nothing needs review**: "Editorial review complete. No issues found."

**If fixes were applied**: End with "Applied {N} fix(es). Re-run `edit-article` to verify." Do NOT automatically re-run.

---

## Notes

- **Auto-fix**: Fixes blocking issues and mechanical advisory issues directly in the article file.
- **Human review**: Advisory issues requiring judgment are reported but not auto-fixed.
- **Re-run to verify**: After fixes, run `edit-article` again to confirm.
- **No rounds**: Single pass. Re-invoke after fixes to verify.
- **Terminology doc is the source of truth**: If the terminology doc is wrong, fix it there - not in the article.
