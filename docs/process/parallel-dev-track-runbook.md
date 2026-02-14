# Parallel Dev Track Runbook

**Last Updated:** January 14, 2026

---

## Overview

The factory runs multiple parallel dev tracks using Claude Code CLI across independent instances (Host + VMs). Each instance has its own local repo clone but shares the same GitHub remotes. Coordination happens via branches and PRs, not shared files.

---

## Instance Configuration

| Instance | Purpose              | Branch Prefix |
| -------- | -------------------- | ------------- |
| Host     | Primary dev track    | `dev/host/`   |
| Crane 1  | Parallel dev track 2 | `dev/crane1/` |
| Crane 2  | Parallel dev track 3 | `dev/crane2/` |

Each instance has identical tooling:

- Claude Code CLI
- Claude Desktop
- VS Code
- GitHub CLI (authenticated)
- All repos cloned to `~/dev/`

---

## Starting a Dev Track

### 1. Pick your instance

Choose Host, Crane 1, or Crane 2 based on current workload.

### 2. Navigate to repo

```bash
cd ~/dev/<repo-name>
```

Available repos:

- `dfg-console`
- `crane-relay`
- `crane-operations`
- `crane-command`
- `sc-operations`

### 3. Sync with remote

```bash
git fetch origin
git checkout main
git pull origin main
```

### 4. Create dedicated branch

```bash
git checkout -b dev/<instance>/<feature>
```

Examples:

- `dev/host/fix-relay-timeout`
- `dev/crane1/add-lot-filter`
- `dev/crane2/update-schema`

### 5. Start Claude Code

```bash
claude
```

---

## Rules

1. **One branch per track** - Never two instances on the same branch simultaneously
2. **Always branch from main** - Pull latest main before creating feature branch
3. **Push frequently** - Commit and push at logical checkpoints
4. **PRs for merge** - All merges to main go through PR, even small fixes
5. **Clear branch names** - Include instance identifier and feature description

---

## Ending a Dev Track

### Commit and push

```bash
git add .
git commit -m "description of changes"
git push origin dev/<instance>/<feature>
```

### Create PR

```bash
gh pr create --title "Feature X" --body "Description"
```

Or create via GitHub web UI.

---

## Handoff Between Instances

If work needs to continue on a different instance:

### On source instance (e.g., Crane 1):

```bash
git add .
git commit -m "WIP: checkpoint for handoff"
git push origin dev/crane1/feature-name
```

### On target instance (e.g., Crane 2):

```bash
git fetch origin
git checkout -b dev/crane2/feature-name origin/dev/crane1/feature-name
```

Then continue work on the new branch.

---

## Conflict Prevention

The branch-per-track model prevents conflicts by ensuring no two instances edit the same files simultaneously. If conflicts occur:

1. **Don't panic** - Git conflicts are normal
2. **Communicate** - Check which other track touched the same files
3. **Rebase or merge** - Pull latest main, resolve conflicts locally
4. **Test before push** - Verify changes work after resolution

---

## Monitoring Active Tracks

To see what branches are active:

```bash
git branch -r | grep "dev/"
```

To see recent commits across tracks:

```bash
git log --oneline --all --graph -20
```

---

## Quick Reference

### Start work

```bash
cd ~/dev/<repo>
git fetch origin && git checkout main && git pull origin main
git checkout -b dev/<instance>/<feature>
claude
```

### End work

```bash
git add . && git commit -m "message" && git push origin HEAD
gh pr create
```

### Switch repos mid-session

```bash
# Exit Claude Code first (Ctrl+C or /exit)
cd ~/dev/<other-repo>
claude
```
