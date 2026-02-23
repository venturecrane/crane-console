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

## Common Mistakes

| Mistake                                            | Fix                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| Preparing a PR description but not creating the PR | The description goes in `gh pr create --body`. Run the command.     |
| Forgetting to push before `gh pr create`           | Push first. `gh pr create` operates on remote branches.             |
| Using `git add .`                                  | Stage specific files to avoid committing secrets or artifacts.      |
| Missing `Closes #N`                                | PR won't auto-link to issue. Always include it.                     |
| No QA grade                                        | PR can't proceed to verification. Always assign one.                |
| Skipping local verify                              | CI will catch it, but you waste a round-trip. Verify locally first. |

---

## Agent Environment Notes

All agents launched via `crane` have `gh` CLI available through `GH_TOKEN`:

- `gh pr create` is the standard way to open PRs from any agent
- After creating the PR, CI runs automatically
- You do NOT need Captain approval to create the PR - create it, then report
- If `gh` returns auth errors, check env var setup (see CLAUDE.md in your repo)
- Codex and Gemini agents: your launcher whitelists `GH_TOKEN` past env sanitization. If `gh` still fails, verify with `gh auth status`.
