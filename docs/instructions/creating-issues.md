# Creating GitHub Issues

**Rule: Backlog items, stories, bugs, and tech-debt are GitHub Issues - never VCMS notes.**

VCMS (`crane_note`) is for knowledge (executive summaries, PRDs, strategy, bios).
Work items go in GitHub Issues so they appear on the sprint board and flow through the team workflow.

## When to Create an Issue

- You discover a bug while working on something else
- You identify a story or feature that should be built later
- You find tech-debt worth tracking
- You want to propose a spike or research task
- PM or Captain asks you to log something for the backlog

## Quick Reference

```bash
# Story
gh issue create \
  --repo venturecrane/{venture}-console \
  --title "Story: {brief title}" \
  --label "type:story,status:triage,sprint:backlog" \
  --body "## Story

As a **{role}**, I want **{capability}** so that **{benefit}**.

## Acceptance Criteria

- [ ] {criterion 1}
- [ ] {criterion 2}

## Technical Notes

{implementation hints, files to modify, etc.}"

# Bug
gh issue create \
  --repo venturecrane/{venture}-console \
  --title "BUG: {brief title}" \
  --label "type:bug,status:triage" \
  --body "## Problem

{what is broken}

## Steps to Reproduce

1. {step}

## Expected Behavior

{what should happen}

## Actual Behavior

{what happens instead}"

# Tech Debt
gh issue create \
  --repo venturecrane/{venture}-console \
  --title "TECH: {brief title}" \
  --label "type:tech-debt,status:triage,sprint:backlog" \
  --body "## Problem

{what technical issue needs addressing}

## Impact

{cost of not fixing this}

## Solution

{proposed approach}

## Files

{key files to modify}"
```

## Label Conventions

Always include at minimum:

| Label                                        | Purpose                   |
| -------------------------------------------- | ------------------------- |
| `type:story` / `type:bug` / `type:tech-debt` | What kind of work         |
| `status:triage`                              | New items start in triage |
| `sprint:backlog`                             | Unless it is urgent       |

Optional but helpful:

| Label                           | When to use                      |
| ------------------------------- | -------------------------------- |
| `prio:P0` - `prio:P3`           | If you know the priority         |
| `sprint:n` / `sprint:n+1`       | If it should be done soon        |
| `component:{venture}-{service}` | If it targets a specific service |

## Target Repo

Issues go in the repo for the venture they affect:

| Venture | Repo                         |
| ------- | ---------------------------- |
| vc      | `venturecrane/crane-console` |
| ke      | `venturecrane/ke-console`    |
| sc      | `venturecrane/sc-console`    |
| dfg     | `venturecrane/dfg-console`   |
| dc      | `venturecrane/dc-console`    |

Cross-venture infrastructure issues go in `venturecrane/crane-console`.

## What NOT to Do

- Do not use `crane_note` / VCMS for work items. Notes are knowledge, not tasks.
- Do not create issues without labels. At minimum: `type:*` and `status:triage`.
- Do not assign yourself or add `status:in-progress` unless you are starting work now.
- Do not create issues in the wrong repo. Check your venture context.
