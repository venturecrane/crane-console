-- Migration 0054: Reflect Operator product rename in exec-summary refresh cadence
--
-- ADR 0034 (venturecrane/ss-console, 2026-06-01) renamed the active SS product
-- line from "AI Employee" to "Operator". Migration 0053 seeded the monthly
-- exec-summary refresh cadence with the phrase "Must explicitly cover the
-- ai-employee product line" on the ss row (sched_seed_015). That phrasing now
-- contradicts the canonical product name and would re-introduce stale framing
-- if the next cadence run cited the description verbatim.
--
-- This migration updates only the description text for sched_seed_015. All
-- other rows (014, 016, 017, 018) and all other columns (cadence_days, scope,
-- enabled, last_completed_at, ...) are left untouched. The row's last_completed_at
-- still points at 2026-05-27T17:00:00Z because the data-layer refresh that this
-- migration accompanies was applied directly to VCMS (note_01KN2ZFMZ8PSXYYR9QAPV4MTNV)
-- in the same change window; the next scheduled refresh remains 30 days from that mark.

UPDATE schedule_items
SET
  description = 'Refresh the SMD Services exec-summary VCMS note. Pass criteria: cite recent commits/PRs, reference top 3 focus areas verifiable against gh issue list for venturecrane/ss-console, dated within 7 days. Must explicitly cover the Operator product line (renamed from AI Employee on 2026-06-01 per ADR 0034 in venturecrane/ss-console; thesis locked in ADR 0037).',
  updated_at = datetime('now')
WHERE id = 'sched_seed_015';
