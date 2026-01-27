# /sod - Start of Day

This script will prepare your session by loading context, caching documentation, and displaying current work priorities from GitHub.

## Execution

```bash
bash scripts/sod-universal.sh
```

## After Running

1. **CONFIRM CONTEXT**: State the venture and repo shown in the Context Confirmation box. Verify with user this is correct.
2. **STOP** and wait for user direction. Do NOT automatically start working on issues.
3. Present a brief summary and ask "What would you like to focus on?"

## Wrong Repo Prevention

If you create any GitHub issues during this session, they MUST go to the repo shown in Context Confirmation. If you find yourself targeting a different repo, STOP and verify with the user before proceeding.
