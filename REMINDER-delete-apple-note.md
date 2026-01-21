# ⏰ REMINDER: Delete Apple Note Secrets Backup

**Action Required:** February 4, 2026

## What to Do

After 2 weeks of using Bitwarden in production (validation period), delete the locked Apple Note containing old secrets.

## Pre-Deletion Checklist

Before deleting the Apple Note, verify:

- [ ] No issues accessing secrets from Bitwarden during the 2-week period
- [ ] All development workflows using secrets work correctly
- [ ] Both MacBook and Ubuntu Server can retrieve secrets via CLI
- [ ] Browser extensions work for web-based credential filling
- [ ] No secrets were missed during migration (cross-reference with Bitwarden vault)

## How to Delete

1. Open Apple Notes app
2. Locate the locked note containing secrets
3. Delete the note
4. Empty "Recently Deleted" folder to permanently remove

## After Deletion

- [ ] Delete this reminder file: `rm ~/Documents/SMDurgan\ LLC/Projects/crane-console/REMINDER-delete-apple-note.md`
- [ ] Update documentation if needed

---

**Validation Period:** January 21, 2026 - February 4, 2026
**Migration Documentation:** `docs/bitwarden-migration-complete.md`
**Bitwarden Vault:** https://vault.bitwarden.com
