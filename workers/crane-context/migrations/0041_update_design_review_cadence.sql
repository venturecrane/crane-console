-- Migration 0041: Update design-system-review cadence description
--
-- Stitch was retired in favor of /product-design + Claude Design (claude.ai/design).
-- The cadence item seeded in 0019 still pointed at .stitch/DESIGN.md and "Stitch
-- cloud design systems" — both gone. Refocus the description on the canonical
-- per-venture design-spec.md and the current generation tools.

UPDATE schedule_items
SET
  description = 'Cross-venture design sync: verify each Tier 1 venture''s `crane_doc(''{code}'', ''design-spec.md'')` matches the live tokens in the venture repo (globals.css, @theme), then refresh the corresponding Claude Design system at claude.ai/design. Run `/product-design` for any venture whose generated screens are stale.',
  updated_at = datetime('now')
WHERE name = 'design-system-review';
