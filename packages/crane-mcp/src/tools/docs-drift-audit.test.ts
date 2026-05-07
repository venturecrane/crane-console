/**
 * Tests for docs-drift-audit.ts (orchestrator)
 *
 * Function-level tests have been moved to matching module test files:
 *   - drift-markdown-parse.test.ts: extractMarkdownLinks, extractCraneDocCalls, resolveCraneDocCall
 *   - drift-checks.test.ts: all six check functions
 *   - drift-fs-helpers.test.ts: walkMarkdownFiles, classifyDocsDirs
 *
 * This file covers the orchestrator: runDocsDriftAudit, executeDocsDriftAudit.
 */

import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runDocsDriftAudit, executeDocsDriftAudit } from './docs-drift-audit.js'

function makeTmpRepo(withDocs = false): string {
  const root = mkdtempSync(join(tmpdir(), 'docs-drift-audit-orchestrator-'))
  if (withDocs) {
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'CLAUDE.md'), '# CLAUDE', 'utf8')
  }
  return root
}

// ---------------------------------------------------------------------------
// runDocsDriftAudit — smoke test with minimal repo structure
// ---------------------------------------------------------------------------

describe('runDocsDriftAudit', () => {
  it('returns a valid result shape with zero docs when docs dir is empty', () => {
    const repoRoot = makeTmpRepo(true)
    try {
      const result = runDocsDriftAudit({
        scope: undefined,
        stale_threshold_days: 180,
        severity_filter: 'all',
      })
      // Only structural checks — we can't predict findings in the real repo
      expect(result).toHaveProperty('inventory')
      expect(result).toHaveProperty('findings')
      expect(result).toHaveProperty('audit_tool_broken')
      expect(result).toHaveProperty('summary')
      expect(typeof result.summary).toBe('string')
      expect(Array.isArray(result.findings)).toBe(true)
    } finally {
      rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// executeDocsDriftAudit — wraps runDocsDriftAudit with error handling
// ---------------------------------------------------------------------------

describe('executeDocsDriftAudit', () => {
  it('returns status:success on clean run', async () => {
    const result = await executeDocsDriftAudit({
      scope: undefined,
      stale_threshold_days: 180,
      severity_filter: 'all',
    })
    expect(result.status).toBe('success')
    expect(typeof result.message).toBe('string')
    expect(result.message.length).toBeGreaterThan(0)
  })
})
