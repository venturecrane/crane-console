# PR Workflow for Agents

**Scope:** All ventures, all agent types (Claude Code, Codex, Gemini CLI)
**Rule:** All code changes must go through Pull Requests. No direct pushes to main.

---

## Quick Reference

After finishing implementation and passing local verification:

```bash
# 1. Push your branch
git push -u origin $(git branch --show-current)

# 2. Create the PR
gh pr create \
  --title "{type}: {brief description}" \
  --body "$(cat <<'EOF'
## Summary

- {what this PR does, 1-3 bullets}

## Related Issues

Closes #{issue_number}

## Changes

- {key change 1}
- {key change 2}

## Test Plan

- [x] Tests added/updated for changed code
- [x] Typecheck passes
- [x] Lint passes
- [ ] Documentation updated if needed

## Feature Impact

<!-- Does this PR remove, disable, or change any existing user-facing functionality? -->
<!-- Write "None" if no existing features are affected -->
<!-- Write "Authorized - #{directive}" if Captain approved the removal/change -->
<!-- If neither applies, STOP - fetch crane_doc('global', 'guardrails.md') -->

**Feature impact:** None

## Instruction Module Impact

<!-- Does this PR change how agents interact with a tool, service, or integration? -->
<!-- (auth changes, MCP config, CLI behavior, env vars, deployment targets) -->
<!-- If yes: list which instruction modules you checked/updated. -->
<!-- If no: write "None" -->
<!-- Run: grep -rl "{tool_name}" docs/instructions/ to find affected modules -->

**Module impact:** None

## QA Grade

**Grade:** qa:{0-3}

<!--
qa:0 - Automated only (CI green = pass)
qa:1 - CLI/API verifiable (no browser needed)
qa:2 - Light visual (quick spot-check)
qa:3 - Full visual (complete walkthrough)
-->

## Deployment Notes

{any special deployment steps, or "Standard deploy"}
EOF
)"
```

---

## Branch Naming

```
{type}/issue-{number}-{short-description}
```

| Type        | When                      |
| ----------- | ------------------------- |
| `feat/`     | New feature               |
| `fix/`      | Bug fix                   |
| `refactor/` | Code restructuring        |
| `docs/`     | Documentation only        |
| `chore/`    | Maintenance, dependencies |

Examples:

- `feat/issue-45-user-auth`
- `fix/issue-152-fee-calculation`
- `refactor/issue-160-extract-service`

---

## Commit Message Format

```
{type}({scope}): {description} [#{issue}]
```

Examples:

- `feat(api): add markdown remediation endpoint [#99]`
- `fix(auth): enforce active project status in ownership checks [#100]`

---

## QA Grades

Assign exactly one grade based on what verification the change needs:

| Grade  | Meaning            | Verification                          |
| ------ | ------------------ | ------------------------------------- |
| `qa:0` | Automated only     | CI green = pass. No manual review.    |
| `qa:1` | CLI/API verifiable | curl, gh CLI, DB queries. No browser. |
| `qa:2` | Light visual       | Quick spot-check, single screenshot.  |
| `qa:3` | Full visual        | Complete walkthrough with evidence.   |

When uncertain, grade higher.

---

## Feature Impact Declaration

If your PR removes, disables, or changes the behavior of existing functionality:

1. Add a **Feature Impact** section to the PR body
2. List each feature affected and how
3. Link the Captain directive that authorized the change

If no Captain directive exists, STOP. This is a guardrail violation. See `crane_doc('global', 'guardrails.md')`.

---

## Step by Step

### 1. Verify locally before pushing

Run the repo's full verification suite:

```bash
npm run verify    # or: npm run typecheck && npm run lint && npm test
```

Do NOT create a PR if verification fails. Fix the issues first.

### 2. Create the branch (if not already on one)

```bash
git checkout -b {type}/issue-{number}-{short-description}
```

If working from a worktree, the branch already exists.

### 3. Commit your changes

```bash
git add {specific files}
git commit -m "{type}({scope}): {description} [#{issue}]"
```

Stage specific files. Never `git add .` or `git add -A` - these risk committing secrets or build artifacts.

### 4. Push the branch

```bash
git push -u origin $(git branch --show-current)
```

### 5. Create the PR

```bash
gh pr create \
  --title "{type}: {brief description}" \
  --body "..."
```

Use the template from Quick Reference above. Requirements:

- **`Closes #XXX`** in the body to auto-link the issue
- **QA Grade** section with exactly one grade
- **Test Plan** showing what was verified

### 6. Confirm the PR was created

The `gh pr create` command prints the PR URL on success. Include it in your output.

### 7. Report completion

Include in your handoff or completion report:

- Issue number
- PR number and URL
- QA grade assigned
- Verification evidence (test counts, commands run)
- Any post-merge steps needed (migrations, secret provisioning, remediation scripts)

---

## After Creating the PR

Your job stops here. Report the PR and wait.

**Do NOT:**

- **Merge your own PR.** Captain directs merges. You create the PR, report it, and wait for the merge directive. Never run `gh pr merge` unless Captain explicitly tells you to merge.
- **Deploy to production.** Running `npx wrangler deploy --env production`, `vercel --prod`, or any production deployment is a Captain-directed action. Never deploy on your own initiative.
- **Run post-merge steps.** Migrations, remediation scripts, cache invalidation, secret provisioning - these go in the PR's Deployment Notes section as proposals. Captain decides when and whether to execute them.
- **Close issues.** Issue closure happens after merge and deployment verification. Captain or PM directs this.

**Do:**

- Report the PR URL, issue number, QA grade, and test evidence
- List any post-merge steps needed in Deployment Notes
- Move on to the next task or wait for further direction

---

## Post-Merge QA Verification

After Captain merges the PR, verification depends on the QA grade:

| Grade  | Verification Method      | Tool                             |
| ------ | ------------------------ | -------------------------------- |
| `qa:0` | CI green = pass          | None (automated)                 |
| `qa:1` | CLI/API spot-check       | `curl`, `gh api`, DB queries     |
| `qa:2` | Light browser spot-check | `agent-browser`                  |
| `qa:3` | Full browser walkthrough | `agent-browser` with screenshots |

### qa:0 - Automated Only

No post-merge action needed. CI passing confirms the change.

### qa:1 - CLI/API Verifiable

Run the relevant CLI or API commands to confirm the change is live. Example:

```bash
curl -s https://api.example.com/endpoint | jq '.field'
gh api repos/venturecrane/repo/actions/runs --jq '.workflow_runs[0].status'
```

### qa:2 - Light Visual (Browser Spot-Check)

Use `agent-browser` to navigate to the affected page, confirm the change renders correctly, and capture a screenshot as evidence.

```bash
agent-browser "Navigate to {URL}. Verify {expected behavior}. Take a screenshot."
```

### qa:3 - Full Visual (Complete Walkthrough)

Use `agent-browser` to walk through the full user flow, checking each step for correctness. Capture screenshots at key points.

```bash
agent-browser "Go to {URL}. {Step-by-step walkthrough instructions}. Screenshot each step."
```

### When to Suggest QA

If you worked on a qa:2 or qa:3 issue, proactively suggest browser-based verification when reporting your PR. This is a suggestion to Captain, not an action you take yourself.

**Template:**

> This PR is qa:{grade}. After merge, browser verification is recommended:
>
> ```bash
> agent-browser "{specific verification instructions for this change}"
> ```

Captain decides whether and when to run QA. Your job is to propose the verification command with specific instructions tailored to the change.

### Cross-Agent Notes

- **All agents** (Claude Code, Codex, Gemini CLI): Use `agent-browser` via Bash. This works universally regardless of agent type or skill configuration.
- The `agent-browser` CLI is available on all fleet machines launched via `crane`.

---

## Common Mistakes

| Mistake                                            | Fix                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| Preparing a PR description but not creating the PR | The description goes in `gh pr create --body`. Run the command.     |
| Forgetting to push before `gh pr create`           | Push first. `gh pr create` operates on remote branches.             |
| Using `git add .`                                  | Stage specific files to avoid committing secrets or artifacts.      |
| Missing `Closes #N`                                | PR won't auto-link to issue. Always include it.                     |
| No QA grade                                        | PR can't proceed to verification. Always assign one.                |
| Skipping local verify                              | CI will catch it, but you waste a round-trip. Verify locally first. |
| Merging your own PR                                | Never. Create the PR and report. Captain directs merges.            |
| Deploying to production after merge                | Never. List deploy steps in Deployment Notes. Captain executes.     |
| Running remediation/migration scripts in prod      | Never. Document the commands. Captain decides when to run them.     |

---

## Agent Environment Notes

All agents launched via `crane` have `gh` CLI available through `GH_TOKEN`:

- `gh pr create` is the standard way to open PRs from any agent
- After creating the PR, CI runs automatically
- You do NOT need Captain approval to create the PR - create it, then report
- If `gh` returns auth errors, check env var setup (see CLAUDE.md in your repo)
- Codex and Gemini agents: your launcher whitelists `GH_TOKEN` past env sanitization. If `gh` still fails, verify with `gh auth status`.
