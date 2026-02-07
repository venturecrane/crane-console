/**
 * Crane Context Worker - Documentation Audit
 *
 * Queries doc_requirements against existing context_docs to find
 * missing and stale documentation for a venture.
 */

import { VENTURE_CONFIG, DEFAULT_DOC_REQUIREMENTS } from './constants';
import type { Venture } from './constants';

// ============================================================================
// Types
// ============================================================================

export interface DocAuditMissing {
  doc_name: string;
  required: boolean;
  description: string | null;
  auto_generate: boolean;
  generation_sources: string[];
}

export interface DocAuditStale {
  doc_name: string;
  scope: string;
  version: number;
  updated_at: string;
  days_since_update: number;
  staleness_threshold_days: number;
  auto_generate: boolean;
  generation_sources: string[];
}

export interface DocAuditPresent {
  doc_name: string;
  scope: string;
  version: number;
  updated_at: string;
}

export interface DocAuditResult {
  venture: string;
  venture_name: string;
  status: 'complete' | 'incomplete' | 'warning';
  missing: DocAuditMissing[];
  stale: DocAuditStale[];
  present: DocAuditPresent[];
  summary: string;
}

// ============================================================================
// Audit Logic
// ============================================================================

/**
 * Run documentation audit for a single venture.
 * Compares doc_requirements to existing context_docs.
 *
 * If doc_requirements table is empty, seeds it with DEFAULT_DOC_REQUIREMENTS first.
 */
export async function runDocAudit(
  db: D1Database,
  venture: string
): Promise<DocAuditResult> {
  const config = VENTURE_CONFIG[venture as Venture];
  if (!config) {
    return {
      venture,
      venture_name: venture,
      status: 'complete',
      missing: [],
      stale: [],
      present: [],
      summary: `Unknown venture: ${venture}`,
    };
  }

  const capabilities = config.capabilities as readonly string[];

  // Ensure requirements are seeded
  await seedRequirementsIfEmpty(db);

  // Fetch all applicable requirements for this venture
  const requirements = await getRequirementsForVenture(db, venture, capabilities);

  // Fetch existing docs for this venture (venture-scoped + global)
  const existingDocs = await getExistingDocs(db, venture);

  const now = Date.now();
  const missing: DocAuditMissing[] = [];
  const stale: DocAuditStale[] = [];
  const present: DocAuditPresent[] = [];

  for (const req of requirements) {
    // Resolve pattern: replace {venture} with actual venture code
    const docName = req.doc_name_pattern.replace('{venture}', venture);
    const generationSources = parseGenerationSources(req.generation_sources);

    // Check if doc exists
    const existing = existingDocs.find(d => d.doc_name === docName);

    if (!existing) {
      missing.push({
        doc_name: docName,
        required: req.required === 1,
        description: req.description,
        auto_generate: req.auto_generate === 1,
        generation_sources: generationSources,
      });
    } else {
      // Check staleness
      const updatedAt = new Date(existing.updated_at).getTime();
      const daysSinceUpdate = Math.floor((now - updatedAt) / (1000 * 60 * 60 * 24));
      const stalenessDays = req.staleness_days || 90;

      if (daysSinceUpdate > stalenessDays) {
        stale.push({
          doc_name: docName,
          scope: existing.scope,
          version: existing.version,
          updated_at: existing.updated_at,
          days_since_update: daysSinceUpdate,
          staleness_threshold_days: stalenessDays,
          auto_generate: req.auto_generate === 1,
          generation_sources: generationSources,
        });
      } else {
        present.push({
          doc_name: docName,
          scope: existing.scope,
          version: existing.version,
          updated_at: existing.updated_at,
        });
      }
    }
  }

  // Determine overall status
  const hasRequiredMissing = missing.some(m => m.required);
  const status: DocAuditResult['status'] = hasRequiredMissing
    ? 'incomplete'
    : stale.length > 0
      ? 'warning'
      : 'complete';

  // Build summary
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`${missing.length} missing`);
  if (stale.length > 0) parts.push(`${stale.length} stale`);
  if (present.length > 0) parts.push(`${present.length} present`);
  const summary = parts.length > 0
    ? `${config.name}: ${parts.join(', ')}`
    : `${config.name}: no requirements configured`;

  return {
    venture,
    venture_name: config.name,
    status,
    missing,
    stale,
    present,
    summary,
  };
}

/**
 * Run audit across all ventures
 */
export async function runDocAuditAll(
  db: D1Database
): Promise<DocAuditResult[]> {
  const ventures = Object.keys(VENTURE_CONFIG) as Venture[];
  const results: DocAuditResult[] = [];
  for (const v of ventures) {
    results.push(await runDocAudit(db, v));
  }
  return results;
}

// ============================================================================
// Internal Helpers
// ============================================================================

interface RequirementRow {
  id: number;
  doc_name_pattern: string;
  scope_type: string;
  scope_venture: string | null;
  required: number;
  condition: string | null;
  description: string | null;
  staleness_days: number | null;
  auto_generate: number;
  generation_sources: string | null;
}

interface ExistingDocRow {
  scope: string;
  doc_name: string;
  version: number;
  updated_at: string;
}

async function getRequirementsForVenture(
  db: D1Database,
  venture: string,
  capabilities: readonly string[]
): Promise<RequirementRow[]> {
  // Fetch requirements that apply: global, all_ventures, or this specific venture
  const result = await db
    .prepare(
      `SELECT id, doc_name_pattern, scope_type, scope_venture, required,
              condition, description, staleness_days, auto_generate, generation_sources
       FROM doc_requirements
       WHERE scope_type = 'global'
          OR scope_type = 'all_ventures'
          OR (scope_type = 'venture' AND scope_venture = ?)
       ORDER BY scope_type ASC, doc_name_pattern ASC`
    )
    .bind(venture)
    .all<RequirementRow>();

  // Filter by condition (capability check)
  return result.results.filter(req => {
    if (!req.condition) return true;
    return capabilities.includes(req.condition);
  });
}

async function getExistingDocs(
  db: D1Database,
  venture: string
): Promise<ExistingDocRow[]> {
  const result = await db
    .prepare(
      `SELECT scope, doc_name, version, updated_at
       FROM context_docs
       WHERE scope = 'global' OR scope = ?
       ORDER BY doc_name ASC`
    )
    .bind(venture)
    .all<ExistingDocRow>();

  return result.results;
}

async function seedRequirementsIfEmpty(db: D1Database): Promise<void> {
  const count = await db
    .prepare('SELECT COUNT(*) as cnt FROM doc_requirements')
    .first<{ cnt: number }>();

  if (count && count.cnt > 0) return;

  const now = new Date().toISOString();
  for (const req of DEFAULT_DOC_REQUIREMENTS) {
    await db
      .prepare(
        `INSERT INTO doc_requirements (doc_name_pattern, scope_type, scope_venture, required, condition,
         description, staleness_days, auto_generate, generation_sources, created_at, updated_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        req.doc_name_pattern,
        req.scope_type,
        req.required ? 1 : 0,
        req.condition,
        req.description,
        req.staleness_days,
        req.auto_generate ? 1 : 0,
        req.generation_sources,
        now,
        now
      )
      .run();
  }
}

function parseGenerationSources(sources: string | null): string[] {
  if (!sources) return [];
  try {
    const parsed = JSON.parse(sources);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
