-- 0038_fleet_machine_check_cadence.sql
--
-- Issue #657 Phase D. Adds a schedule_items row for the Hermes-on-mini
-- fleet update orchestrator (fleet-machine-check). Distinct from the
-- existing fleet-health-check cadence — that one is owned by the
-- weekly GitHub org audit (fleet-ops-health.yml). Two sources, two
-- cadence items, no completion race.
--
-- Pattern: idempotent INSERT OR REPLACE on the stable id, mirroring
-- 0033_add_skill_audit_cadence.sql.
--
-- The orchestrator marks this complete via
-- POST /schedule/fleet-machine-check/complete at the end of each run
-- (see tools/hermes/fleet_update/SKILL.md §8).

INSERT OR REPLACE INTO schedule_items (
  id, name, title, description,
  cadence_days, scope, priority,
  last_completed_at, last_completed_by, last_result,
  enabled, created_at, updated_at
) VALUES (
  'sched_seed_fleet_machine_check',
  'fleet-machine-check',
  'Fleet Machine Check',
  'Weekly host-patch audit run by the Hermes-on-mini orchestrator. Walks each fleet machine via SSH, classifies findings (OS security updates, brew outdated, reboot-required, uptime, Xcode CLT, disk pressure), applies safe-auto fixes, and files GitHub issues for anything needing human judgment. Completes automatically on successful run via POST /schedule/fleet-machine-check/complete. If this item goes overdue, check systemctl list-timers on mini and tail /var/log/fleet-update/run.log.',
  7,
  'global',
  2,
  NULL,
  NULL,
  NULL,
  1,
  datetime('now'),
  datetime('now')
);
