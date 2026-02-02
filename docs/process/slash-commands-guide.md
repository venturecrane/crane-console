# CC CLI Slash Commands Guide

**Version:** 1.0
**Last Updated:** 2026-01-18
**Purpose:** Reference guide for available slash commands in CC CLI

---

## Core Commands

### /sod - Start of Day
**Purpose:** Load operational context from Context Worker

**Usage:**
```bash
/sod                  # Auto-detect venture, default track 1
/sod vc              # Explicit venture, default track 1
/sod vc 2            # Explicit venture and track
```

**What It Does:**
- Creates session in Context Worker
- Downloads documentation to `/tmp/crane-context/docs/`
- Reports available documentation

**When to Use:**
- Start of every work session
- After long break
- When switching repos

**See:** `eod-sod-process.md` for complete workflow

---

### /compact - Compress Context
**Purpose:** Reduce token usage while preserving session context

**Usage:**
```bash
/compact             # Compress conversation context
```

**What It Does:**
- Summarizes conversation history
- Preserves key context and decisions
- Reduces token count for continued work

**When to Use:**
- Long sessions approaching context limits
- Before complex operations that need room
- When Claude mentions context is getting large

**What It Preserves:**
- Key decisions made in session
- File changes and their purpose
- Current task state

**What It Loses:**
- Detailed intermediate reasoning
- Exact conversation flow
- Some nuance in discussions

**Comparison with /clear:**
| Aspect | /compact | /clear |
|--------|----------|--------|
| Context preserved | Yes (summarized) | No |
| Need to re-run /sod | No | **Yes** |
| Token reduction | Moderate | Complete |
| Use case | Same task, long session | Different task entirely |

**Rule:** When in doubt, use `/compact`. Only use `/clear` when switching to completely unrelated work.

---

### /commit - Create Git Commit
**Purpose:** Stage changes and create commit with proper message

**Usage:**
```bash
/commit              # Stage all changes, create commit
```

**What It Does:**
1. Runs `git status` to see changes
2. Runs `git diff` to review changes
3. Analyzes changes and drafts commit message
4. Stages relevant files
5. Creates commit with Co-Authored-By tag

**Commit Message Format:**
```
<type>: <description>

<optional body>

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Add/update tests
- `chore:` Maintenance

**When to Use:**
- After completing a feature
- After fixing a bug
- When work is ready to commit

---

### /pr - Create Pull Request
**Purpose:** Create PR from current branch

**Usage:**
```bash
/pr                  # Create PR from current branch to main
```

**What It Does:**
1. Checks git status and diff
2. Reviews all commits in branch (from divergence point)
3. Drafts PR title and description
4. Creates PR via `gh pr create`
5. Returns PR URL

**PR Description Format:**
```markdown
## Summary
- Bullet point 1
- Bullet point 2

## Test plan
- [ ] Test scenario 1
- [ ] Test scenario 2

🤖 Generated with Claude Code
```

**When to Use:**
- Feature branch is complete
- Tests passing
- Ready for review

---

## Project-Specific Commands

These commands are defined in `.claude/commands/` directories in each repo.

### DFG Console Commands

**Location:** `dfg-console/.claude/commands/`

Available commands (examples):
- `/dfg-review` - Run DFG-specific code review
- `/build-all` - Build all DFG packages
- `/test-all` - Run all DFG tests
- `/deploy-worker` - Deploy DFG worker
- `/migrate-db` - Run database migrations
- `/ios-check` - Check iOS app status
- `/security-audit` - Run security audit

**See:** Repo-specific `.claude/commands/` directory for full list

---

## Environment & Setup

### Setting Up Relay Key
```bash
# In ~/.zshrc or ~/.bashrc
export CRANE_RELAY_KEY="your-relay-key-here"
```

### Checking Configuration
```bash
# Verify relay key
echo $CRANE_RELAY_KEY

# Check git config
git config --list | grep user

# Check gh CLI
gh auth status
```

---

## Command Chaining

You can run multiple commands in sequence:

```bash
# Make changes, commit, create PR
# (Do work first)
/commit
/pr
```

```bash
# Start session, work, commit
/sod
# (Do work)
/commit
```

---

## Best Practices

### DO:
✅ Run `/sod` at start of session
✅ Use `/commit` for all commits (consistent messages)
✅ Use `/pr` after completing feature branches
✅ Check repo-specific commands in `.claude/commands/`

### DON'T:
❌ Skip `/sod` - you'll miss important context
❌ Run `/commit` with uncommitted secrets
❌ Create PRs without running tests first
❌ Use force push with `/pr` workflow

---

## Command Reference Table

| Command | Purpose | When to Use | Output |
|---------|---------|-------------|--------|
| `/sod` | Load context | Session start | Cached docs list |
| `/commit` | Create commit | After changes | Commit SHA |
| `/pr` | Create pull request | Feature complete | PR URL |
| `/help` | Get help | When stuck | Help info |
| `/compact` | Compress context | Long sessions | Reduced tokens |
| `/clear` | Clear conversation | Unrelated work | (clears chat) |

---

## Troubleshooting

### "/sod command not found"
**Cause:** Script not in PATH or not executable

**Fix:**
```bash
# Add to PATH (in ~/.zshrc or ~/.bashrc)
export PATH="$PATH:$HOME/path/to/crane-console/scripts"

# Make executable
chmod +x ~/path/to/crane-console/scripts/crane-sod.sh

# Create alias
alias /sod='~/path/to/crane-console/scripts/crane-sod.sh'
```

### "/commit fails with git errors"
**Cause:** Working directory not clean or git config issues

**Fix:**
```bash
# Check status
git status

# Check config
git config user.name
git config user.email

# If not set
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### "/pr fails to create"
**Cause:** gh CLI not authenticated or branch not pushed

**Fix:**
```bash
# Check gh auth
gh auth status

# If not authenticated
gh auth login

# Push branch first
git push -u origin feature-branch

# Try again
/pr
```

---

## Creating Custom Commands

You can create project-specific slash commands:

### 1. Create Command File
```bash
mkdir -p .claude/commands
vim .claude/commands/my-command.md
```

### 2. Command Format
```markdown
# My Custom Command

Instructions for what the agent should do when this command is invoked.

## Steps
1. First do this
2. Then do that
3. Finally do this

## Output
Describe what should be returned
```

### 3. Use Command
```bash
/my-command
```

---

## Integration with Other Tools

### With GitHub Actions
Commands trigger workflows automatically:
- `/commit` → Doc sync workflow (if docs changed)
- `/pr` → CI/CD pipeline

### With Context Worker
- `/sod` → Fetches from Context Worker DB
- Documentation always up-to-date

### With Crane Relay
- `/sod` → Authenticates with Relay
- Relay provides project context

---

## Command Development

### Testing New Commands
1. Create command file in `.claude/commands/`
2. Test by invoking: `/command-name`
3. Iterate based on results
4. Document in this guide

### Sharing Commands Across Repos
For commands that work across all ventures:
1. Create in crane-console
2. Copy to other repos
3. Or create shared commands repo

---

## Quick Reference Card

```
SESSION MANAGEMENT
/sod                Start session, load context
/compact            Compress context, keep working
/clear              Clear conversation (re-run /sod after)

GIT WORKFLOW
/commit             Create commit with good message
/pr                 Create pull request

PROJECT-SPECIFIC
/dfg-review         DFG code review
/build-all          Build all packages
/test-all           Run all tests

HELP
/help               Get help with CC CLI
```

---

## Further Reading

- **EOD/SOD Process:** `eod-sod-process.md`
- **Team Workflow:** `team-workflow.md`
- **PR Workflow:** `dev-directive-pr-workflow.md`
- **Crane Relay API:** `crane-relay-api.md`

---

## Summary

Slash commands make CC CLI agents productive:
- `/sod` loads context → agents know everything
- `/commit` and `/pr` handle git workflow → consistent, clean
- Custom commands → repo-specific automation

**Most Important Commands:**
1. `/sod` - Always start here
2. `/commit` - Better than manual commits
3. `/pr` - Streamlined PR creation

Keep this guide handy. When in doubt, check here!
