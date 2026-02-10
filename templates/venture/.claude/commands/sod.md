# /sod - Start of Day

This script will prepare your session by loading context, caching documentation, and displaying current work priorities from GitHub.

## Execution

```bash
bash scripts/sod-universal.sh
```

## Bitwarden Unlock

If the script output contains `[BW_UNLOCK_REQUIRED]`, the Bitwarden vault needs to be unlocked before continuing. Use AskUserQuestion to ask the user to unlock it:

- Question: "Bitwarden vault is locked. Please run `export BW_SESSION=$(bw unlock --raw)` in another terminal, then confirm here."
- Options: "Done - vault unlocked", "Skip - continue without Bitwarden"

If user selects "Done", re-run the script. If "Skip", note that secrets access will be limited this session.

## After Running

1. **CONFIRM CONTEXT**: State the venture and repo shown in the Context Confirmation box. Verify with user this is correct.

2. **CHECK WEEKLY PLAN**: Look at the "Weekly Plan Check" section in the output.
   - If plan is **valid**: Note the current priority and proceed.
   - If plan is **missing or stale**: Ask the user:
     - "What venture is priority this week? (vc/dfg/sc/ke)"
     - "Any specific issues to target? (optional)"
     - "Any capacity constraints? (optional)"
   - Create/update `docs/planning/WEEKLY_PLAN.md` with their answers using this format:

     ```markdown
     # Weekly Plan - Week of {DATE}

     ## Priority Venture

     {venture code}

     ## Target Issues

     {list or "None specified"}

     ## Capacity Notes

     {notes or "Normal capacity"}

     ## Created

     {ISO timestamp}
     ```

3. **STOP** and wait for user direction. Do NOT automatically start working on issues.

4. Present a brief summary and ask "What would you like to focus on?"

## Wrong Repo Prevention

If you create any GitHub issues during this session, they MUST go to the repo shown in Context Confirmation. If you find yourself targeting a different repo, STOP and verify with the user before proceeding.
