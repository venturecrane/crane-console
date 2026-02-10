# Crane-Context Documentation Audit Report

**Date:** 2026-01-31
**Auditor:** Claude Code (cc-cli)
**Scope:** All 28 documents in crane-context D1 database

---

## Executive Summary

Completed comprehensive audit of documentation stored in crane-context against source code and migrations. Found and fixed **critical evidence removal issues** in crane-relay docs. Identified additional items requiring attention.

### Actions Taken

| Action                                   | Status      |
| ---------------------------------------- | ----------- |
| Updated vc/crane-relay-api.md to v3      | ✅ Complete |
| Updated vc/crane-relay-schema.md to v3   | ✅ Complete |
| Updated vc/crane-context-schema.md to v2 | ✅ Complete |

### Items Requiring Future Attention

| Item                           | Priority | Description                                              |
| ------------------------------ | -------- | -------------------------------------------------------- |
| team-workflow.md evidence refs | P2       | References `/v2/evidence` endpoints that no longer exist |
| sc-project-instructions.md     | P3       | Sprint dates and "Current State" are stale               |

---

## Detailed Findings

### 1. Crane-Relay Documentation (P0 - FIXED)

**Issue:** Docs still referenced evidence storage that was removed in migration 0004.

**crane-relay-api.md (v2 → v3):**

- ❌ Removed: `/v2/evidence` POST endpoint
- ❌ Removed: `/v2/evidence/{id}` GET endpoint
- ❌ Removed: `crane-relay-evidence (R2)` storage reference
- ✅ Kept: All active endpoints documented

**crane-relay-schema.md (v2 → v3):**

- ❌ Removed: `evidence_assets` table definition
- ❌ Removed: `evidence_urls` column from approval_queue
- ❌ Removed: R2 Storage section
- ✅ Added: Migration history section noting 0004 drop
- ✅ Updated: Table count from 5 to 4

### 2. Crane-Context Documentation (P1 - FIXED)

**Issue:** Schema doc was missing `rate_limits` table added in migration 0005.

**crane-context-schema.md (v1 → v2):**

- ✅ Added: `rate_limits` table definition
- ✅ Added: `idx_rate_limits_expires` index
- ✅ Updated: Table count from 6 to 7

**crane-context-api.md (v1):**

- ✅ Verified: All endpoints match source code
- ✅ No changes needed

### 3. Process Documentation Cross-Reference (P2)

| Doc                | Filesystem  | D1          | Status                        |
| ------------------ | ----------- | ----------- | ----------------------------- |
| eod-sod-process.md | 6322 bytes  | 6321 bytes  | ✅ In sync                    |
| team-workflow.md   | 22317 bytes | 22316 bytes | ⚠️ Sync but has stale content |

**team-workflow.md Issue:**
Lines 570-582 reference evidence endpoints:

```markdown
## V2 Relay Integration

| Endpoint | Purpose |
| `POST /v2/evidence` | Upload screenshots (optional) |
| `GET /v2/evidence/:id` | Retrieve evidence |
```

These endpoints no longer exist. **Recommendation:** Update both filesystem and D1 versions to remove evidence references.

### 4. SC Documentation Review (P3)

| Doc                        | Version | Status                           |
| -------------------------- | ------- | -------------------------------- |
| sc-api.md                  | v1      | ✅ Accurate (updated 2026-01-31) |
| sc-schema.md               | v1      | ✅ Accurate (updated 2026-01-31) |
| sc-project-instructions.md | v1      | ⚠️ Stale content                 |

**sc-project-instructions.md Issues:**

- Last Updated date says "January 12, 2026"
- Sprint "SC Tier 1 (Target: Feb 9-15, 2026)" is in the past
- "Current State" sections have checkbox items that may be resolved
- Pricing says "TBD" - may need updating

**Recommendation:** Review and update project instructions with current status.

### 5. Other Venture Documentation

| Venture | Docs                                          | Status                                           |
| ------- | --------------------------------------------- | ------------------------------------------------ |
| KE      | ke-api, ke-schema, ke-project-instructions    | ✅ Recently standardized (v2)                    |
| DFG     | dfg-api, dfg-schema, dfg-project-instructions | ✅ Current                                       |
| Global  | 12 docs                                       | ✅ Current (except team-workflow.md noted above) |

---

## Document Inventory (Post-Audit)

| Scope     | Doc Count | Versions |
| --------- | --------- | -------- |
| global    | 12        | v1-v6    |
| vc        | 7         | v1-v3    |
| sc        | 3         | v1       |
| dfg       | 3         | v1-v2    |
| ke        | 3         | v1-v2    |
| **Total** | **28**    |          |

### Updated Documents

| Scope | Doc                     | Old Version | New Version |
| ----- | ----------------------- | ----------- | ----------- |
| vc    | crane-relay-api.md      | v2          | v3          |
| vc    | crane-relay-schema.md   | v2          | v3          |
| vc    | crane-context-schema.md | v1          | v2          |

---

## Verification

### Crane-Relay Evidence Removal Confirmed

```sql
-- Source: workers/crane-relay/migrations/0004_drop_evidence.sql
DROP TABLE IF EXISTS evidence_assets;
DROP INDEX IF EXISTS idx_evidence_repo_issue;
```

```bash
# Source code grep for 'evidence' - No matches found
grep -r "evidence" workers/crane-relay/src/index.ts
```

### Crane-Context Rate Limits Confirmed

```sql
-- Source: workers/crane-context/migrations/0005_add_rate_limits.sql
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL
);
```

---

## Recommendations

### Immediate (This Session)

- [x] Update crane-relay-api.md to remove evidence endpoints
- [x] Update crane-relay-schema.md to remove evidence table
- [x] Update crane-context-schema.md to add rate_limits table

### Short-Term (Next Session)

- [ ] Update team-workflow.md to remove evidence endpoint references
- [ ] Review sc-project-instructions.md for current status

### Ongoing

- [ ] Consider automated sync between docs/process/ and crane-context
- [ ] Add version/updated_at to markdown frontmatter for easier tracking

---

## Conclusion

The audit identified and corrected critical documentation drift following the evidence storage removal. All infrastructure documentation (crane-relay, crane-context) is now accurate against source code and migrations. Minor stale content exists in process and product docs that should be addressed in future sessions.
