# Claude -p Automation Research

**Date:** 2026-02-02
**Issue:** #122
**Status:** Complete

---

## Executive Summary

`claude -p` (pipe/print mode) enables non-interactive Claude Code usage for automation. After testing multiple use cases, the recommendations are:

| Use Case | Verdict | Cost/Run | Value |
|----------|---------|----------|-------|
| **Commit message generation** | Adopt | ~$0.01 | High - saves time, consistent quality |
| **Weekly summaries** | Adopt | ~$0.03 | High - useful for standups/planning |
| **PR code review** | Consider | ~$0.05-0.10 | Medium - good for security reviews |
| **Issue triage** | Defer | ~$0.08 | Low - manual review still needed |
| **Lint error explanation** | Skip | ~$0.05 | Low - IDE tools are faster |

**Bottom line:** Commit message generation and weekly summaries are the highest-value automation targets. Both are low-cost and provide immediate productivity gains.

---

## How claude -p Works

### Basic Syntax

```bash
# Simple query
claude -p "Your prompt here"

# Pipe input
cat file.txt | claude -p "Analyze this"

# JSON output with metadata
claude -p "Summarize" --output-format json

# Structured output with schema
claude -p "Extract data" --output-format json --json-schema '{"type":"object",...}'
```

### Key Flags

| Flag | Purpose |
|------|---------|
| `-p, --print` | Enable non-interactive mode |
| `--output-format` | `text`, `json`, or `stream-json` |
| `--json-schema` | Enforce structured output |
| `--allowedTools` | Auto-approve specific tools |
| `--continue` | Continue most recent conversation |
| `--resume <id>` | Resume specific session |
| `--append-system-prompt` | Add context to default prompt |
| `--model` | Specify model (sonnet, opus, haiku) |

### Output Format: JSON

```bash
claude -p "Hello" --output-format json
```

Returns:
```json
{
  "type": "result",
  "subtype": "success",
  "result": "Hi there!",
  "session_id": "uuid",
  "total_cost_usd": 0.01,
  "usage": {
    "input_tokens": 2,
    "output_tokens": 5,
    "cache_read_input_tokens": 13818
  }
}
```

Use `jq` to extract fields:
```bash
claude -p "Hello" --output-format json | jq -r '.result'
```

---

## Use Case Evaluations

### 1. Commit Message Generation

**Status:** Adopt

**Command:**
```bash
git diff --cached | claude -p "Write a commit message for these staged changes. Follow conventional commits format (feat/fix/docs/etc). Just output the message, no explanation." --output-format json 2>/dev/null | jq -r '.result'
```

**Test Results:**
- Cost: ~$0.01 per commit
- Time: 3-5 seconds
- Quality: Consistently good, follows conventions

**Prototype:** See `scripts/claude-commit-msg.sh`

**When to use:**
- Complex changes spanning multiple files
- When you want consistent commit style
- Drafting PR descriptions

**When NOT to use:**
- Simple one-line fixes (faster to type)
- Batch commits where context is lost

---

### 2. Weekly Summary

**Status:** Adopt

**Command:**
```bash
git log --oneline --since="1 week ago" | claude -p "Summarize this week's development work in 2-3 sentences for a standup update" --output-format json 2>/dev/null | jq -r '.result'
```

**Test Results:**
- Cost: ~$0.03 per summary
- Time: 5-8 seconds
- Quality: Accurate, well-structured

**Use cases:**
- Monday standup prep
- End-of-week reports
- Sprint retrospectives
- Handoff documentation

**Integration opportunity:** Add to `/eod` workflow for automatic weekly summary on Fridays.

---

### 3. PR Code Review

**Status:** Consider

**Command:**
```bash
gh pr diff 123 | claude -p "Review this PR for:
1. Security vulnerabilities
2. Performance issues
3. Code style problems
Provide specific line numbers and suggestions." \
  --append-system-prompt "You are a senior security engineer." \
  --output-format json 2>/dev/null | jq -r '.result'
```

**Test Results:**
- Cost: ~$0.05-0.10 depending on diff size
- Time: 10-20 seconds
- Quality: Good for catching obvious issues

**Best for:**
- Security-focused reviews
- Reviewing unfamiliar code
- Second opinion on complex changes

**Limitations:**
- Can't run the code
- May miss context from files not in diff
- Not a replacement for human review

**CI Integration:**
```yaml
# .github/workflows/pr-review.yml
- name: AI Security Review
  run: |
    gh pr diff ${{ github.event.pull_request.number }} | \
    claude -p "Review for security issues" --output-format json | \
    jq -r '.result' >> $GITHUB_STEP_SUMMARY
```

---

### 4. Issue Triage

**Status:** Defer

**Command:**
```bash
gh issue list --state open --json number,title,body,labels | \
claude -p "Prioritize these issues" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"priority":{"type":"array","items":{"type":"number"}},"rationale":{"type":"string"}}}'
```

**Test Results:**
- Cost: ~$0.08 per triage
- Quality: Reasonable suggestions, but needs human validation

**Why defer:**
- Cost adds up with many issues
- Suggestions need manual review anyway
- Better suited for weekly batch review, not continuous automation

---

### 5. Lint Error Explanation

**Status:** Skip

**Command:**
```bash
npm run lint 2>&1 | claude -p "Explain these lint errors and suggest fixes"
```

**Why skip:**
- IDE tools (ESLint, Copilot) are faster
- Most lint errors are self-explanatory
- Cost not justified for marginal benefit

---

## Cost Analysis

Based on testing with Opus model:

| Operation | Input Tokens | Output Tokens | Cost |
|-----------|--------------|---------------|------|
| Simple query | ~100 | ~10 | $0.01 |
| Commit message | ~500 | ~20 | $0.01 |
| Weekly summary | ~1000 | ~100 | $0.03 |
| PR review (small) | ~2000 | ~200 | $0.05 |
| PR review (large) | ~5000 | ~500 | $0.10 |
| Issue triage | ~3000 | ~300 | $0.08 |

**Monthly estimate (active developer):**
- 20 commit messages: $0.20
- 4 weekly summaries: $0.12
- 10 PR reviews: $0.50
- **Total: ~$1/month per developer**

This is negligible compared to Claude Code subscription cost.

---

## Error Handling

### Common Errors

**1. Rate limiting:**
```bash
# Check for error in JSON output
result=$(claude -p "..." --output-format json 2>/dev/null)
if echo "$result" | jq -e '.is_error' > /dev/null; then
  echo "Error: $(echo "$result" | jq -r '.result')"
  exit 1
fi
```

**2. Timeout:**
```bash
# Default timeout is usually sufficient
# For long operations, Claude handles internally
```

**3. Empty input:**
```bash
# Always validate input exists
if [ -z "$(git diff --cached)" ]; then
  echo "No staged changes"
  exit 0
fi
```

---

## Prototype Scripts

### scripts/claude-commit-msg.sh

```bash
#!/bin/bash
# Generate commit message from staged changes using Claude

set -e

# Check for staged changes
if [ -z "$(git diff --cached)" ]; then
  echo "No staged changes to commit"
  exit 1
fi

# Generate commit message
echo "Generating commit message..."
MSG=$(git diff --cached | claude -p "Write a commit message for these changes.
Rules:
- Use conventional commits format (feat/fix/docs/refactor/test/chore)
- First line: type(scope): description (max 72 chars)
- If complex, add blank line then bullet points
- Output ONLY the message, no explanation" \
  --output-format json 2>/dev/null | jq -r '.result')

if [ -z "$MSG" ]; then
  echo "Failed to generate commit message"
  exit 1
fi

echo ""
echo "Generated message:"
echo "---"
echo "$MSG"
echo "---"
echo ""
read -p "Use this message? [Y/n/e(dit)] " choice

case "$choice" in
  n|N)
    echo "Aborted"
    exit 1
    ;;
  e|E)
    # Open in editor
    echo "$MSG" > /tmp/commit-msg.txt
    ${EDITOR:-vim} /tmp/commit-msg.txt
    MSG=$(cat /tmp/commit-msg.txt)
    ;;
esac

git commit -m "$MSG"
echo "Committed!"
```

### scripts/claude-weekly-summary.sh

```bash
#!/bin/bash
# Generate weekly development summary using Claude

set -e

SINCE="${1:-1 week ago}"

# Get commit log
LOG=$(git log --oneline --since="$SINCE")

if [ -z "$LOG" ]; then
  echo "No commits since $SINCE"
  exit 0
fi

# Generate summary
echo "Generating summary for commits since $SINCE..."
SUMMARY=$(echo "$LOG" | claude -p "Summarize this development work for a standup update.
Format:
- 2-3 sentence summary
- Key accomplishments as bullet points
- Any notable patterns or themes" \
  --output-format json 2>/dev/null | jq -r '.result')

echo ""
echo "$SUMMARY"
```

---

## CI/CD Integration Examples

### GitHub Actions: PR Review

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Run AI Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          gh pr diff ${{ github.event.pull_request.number }} | \
          claude -p "Review this diff for security issues and bugs. Be concise." \
            --output-format json | jq -r '.result' >> review.md

      - name: Post Review Comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const review = fs.readFileSync('review.md', 'utf8');
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `## AI Review\n\n${review}`
            });
```

### Cron: Weekly Summary

```yaml
name: Weekly Summary

on:
  schedule:
    - cron: '0 9 * * 1'  # Monday 9am UTC

jobs:
  summary:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate Summary
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          git log --oneline --since="1 week ago" | \
          claude -p "Create a weekly development summary" \
            --output-format json | jq -r '.result' > summary.md

      - name: Post to Slack
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {"text": "Weekly Summary:\n$(cat summary.md)"}
```

---

## Recommendations

### Immediate Adoption

1. **Add `claude-commit-msg.sh` to scripts/**
   - Low cost, high value
   - Opt-in usage (run when helpful)

2. **Add `claude-weekly-summary.sh` to scripts/**
   - Useful for /eod on Fridays
   - Good for async team updates

### Future Consideration

3. **PR security review in CI**
   - Evaluate after 1 month of manual usage
   - Only for security-sensitive repos

4. **Pre-commit hooks**
   - Not recommended (too slow, ~5s per commit)
   - Better as opt-in script

### Not Recommended

5. **Automated issue triage**
   - Cost/benefit doesn't justify automation
   - Keep as manual weekly review

6. **Lint error explanation**
   - IDE tools are better for this

---

## Limitations

1. **No interactive mode features**
   - `/commit`, `/pr` skills not available
   - Must describe tasks explicitly

2. **No tool approval callbacks**
   - Either pre-approve tools or they're blocked
   - Use `--allowedTools` carefully

3. **Context window limits**
   - Large diffs may be truncated
   - Consider chunking for big PRs

4. **Cost scales with usage**
   - Free for Max plan users (within limits)
   - API users pay per token

---

## References

- [Claude Code Headless Documentation](https://code.claude.com/docs/en/headless)
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [GitHub Actions Integration](https://code.claude.com/docs/en/github-actions)
