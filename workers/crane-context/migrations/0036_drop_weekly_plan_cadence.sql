-- Migration 0036: Drop the 'weekly-plan' cadence item
--
-- Context: The /work-plan skill was retired on 2026-04-20 per Captain
-- directive. The corresponding 'Weekly Plan' cadence item in schedule_items
-- was seeded by migration 0012 as 'sched_seed_002'. With the skill gone,
-- the cadence reminder points at a dead command, so it is deleted here.
--
-- Idempotent: re-running finds no matching row and DELETE is a no-op.
-- Fresh deployments still run 0012's seed (which re-creates the row),
-- but 0036 runs immediately after and removes it, leaving the DB in the
-- same state as an existing, migrated environment.

DELETE FROM schedule_items WHERE name = 'weekly-plan';
