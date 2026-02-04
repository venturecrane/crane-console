# Dev Team Handoff

**Last Updated:** 2026-02-03
**Repository:** venturecrane/crane-console

---

## Current State

### In Progress
- **#130** - crane-mcp MCP server (ready for testing)

### Ready to Pick Up
- **#81** - Automate venture/org registration for new projects

### Blocked
None

---

## Session Summary (2026-02-03 - Evening)

### Accomplished

1. **Designed and implemented crane-mcp** - A complete MCP server to replace the fragile shell-based `ccs` process
   - Problem: Shell scripts were fragile, required sourcing, hardcoded paths, could get deep into wrong repo
   - Solution: MCP server that runs inside Claude, scans ~/dev/ by git remote, API-driven venture list

2. **Created 4 MCP tools:**
   - `crane_sod` - Start of day, validates context, guides to correct repo
   - `crane_ventures` - List ventures with local paths
   - `crane_context` - Get current venture/repo/branch
   - `crane_handoff` - Create session handoff

3. **Technical implementation:**
   - Built with TypeScript + @modelcontextprotocol/sdk
   - Org-based repo matching (not path naming conventions)
   - In-memory caching for session duration
   - Sanitized error messages

4. **Pushed to GitHub:** https://github.com/venturecrane/crane-mcp (private)

5. **Created issue #130** with full documentation for continuity

6. **Registered MCP server:** `claude mcp add --scope user crane -- crane-mcp`

### Left Off

- MCP server is built and registered
- Needs end-to-end testing with fresh Claude session
- Need to verify CRANE_CONTEXT_KEY env var passes through to MCP server

### Needs Attention

- **Test the MCP server** - Exit current session, start fresh with Infisical, call `crane_context`
- If env var doesn't pass, may need: `claude mcp add --scope user -e CRANE_CONTEXT_KEY crane -- crane-mcp`

---

## Session Summary (2026-02-03 - Earlier)

### Accomplished
- Evaluated secrets management solutions (Doppler vs Infisical)
- Chose Infisical (open source, generous free tier, self-host option)
- Installed Infisical CLI on all 4 dev machines
- Set up folder-based secrets organization in single `venture-crane` project
- Migrated secrets from Bitwarden to Infisical
- Created `docs/infra/machine-inventory.md` and `docs/infra/secrets-management.md`
- Updated CLAUDE.md with Infisical usage section

### Left Off
All Infisical work complete. Fully operational across all machines.

---

## Next Session Guidance

1. **First priority: Test crane-mcp**
   ```bash
   cd ~/dev/crane-console
   infisical run --path /vc -- claude
   # Then: "call crane_context"
   ```

2. **If working, test navigation flow:**
   ```bash
   cd ~
   infisical run --path /vc -- claude
   # Then: "call crane_sod"
   # Should show venture selection
   ```

3. **If tests pass:** Update issue #130 checklist, consider npm publish

4. **If tests fail:** Check troubleshooting in crane-mcp README, may need env var fix

---

## Quick Reference

| Command | When to Use |
|---------|-------------|
| `/sod` | Start of session |
| `/handoff <issue>` | PR ready for QA |
| `/question <issue> <text>` | Need PM clarification |
| `/merge <issue>` | After `status:verified` |
| `/eod` | End of session |

### Infisical Quick Reference

```bash
infisical run --path /vc -- claude          # VC secrets
infisical run --path /ke -- npm run dev     # KE secrets
infisical secrets --path /vc --env dev      # List secrets
infisical secrets set KEY="val" --path /vc  # Add secret
```

---

## Resources

- **crane-mcp repo:** https://github.com/venturecrane/crane-mcp
- **Issue #130:** https://github.com/venturecrane/crane-console/issues/130
- **MCP docs:** https://github.com/modelcontextprotocol/typescript-sdk
