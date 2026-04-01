-- Tighten staleness thresholds for venture documentation
UPDATE doc_requirements SET staleness_days = 30, updated_at = datetime('now')
  WHERE doc_name_pattern = '{venture}-project-instructions.md';
UPDATE doc_requirements SET staleness_days = 60, updated_at = datetime('now')
  WHERE doc_name_pattern = '{venture}-api.md';
UPDATE doc_requirements SET staleness_days = 60, updated_at = datetime('now')
  WHERE doc_name_pattern = '{venture}-schema.md';

-- Add ventures_json to project-instructions generation sources
UPDATE doc_requirements
  SET generation_sources = '["claude_md","readme","package_json","docs_process","ventures_json"]',
      updated_at = datetime('now')
  WHERE doc_name_pattern = '{venture}-project-instructions.md';
