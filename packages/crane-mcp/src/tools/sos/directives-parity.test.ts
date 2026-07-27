/**
 * Directives-block parity gate (2026-07-26).
 *
 * The SOS Directives block inlines the guardrails.md SOD_SUMMARY bullets as a
 * TypeScript constant "to avoid an HTTP fetch per session." A hand-maintained
 * copy of always-on rules is a drift machine: before this test existed, two SOD
 * bullets (client-content fabrication; instruction-module coupling) were absent
 * from every session briefing, while the doc's own editing instructions claimed
 * the SOD section "updates automatically - no TypeScript changes needed."
 *
 * The contract: every bullet between SOD_SUMMARY_START/END in
 * docs/instructions/guardrails.md appears VERBATIM in renderDirectivesBlock's
 * output. Edit the doc first, mirror into SOD_SUMMARY_BULLETS in
 * message-sections.ts in the same PR; this test blocks the drift.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderDirectivesBlock } from './message-sections.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..', '..', '..', '..')
const guardrailsPath = path.join(repoRoot, 'docs', 'instructions', 'guardrails.md')

function sodBullets(): string[] {
  const raw = readFileSync(guardrailsPath, 'utf8')
  const match = raw.match(/<!-- SOD_SUMMARY_START -->([\s\S]*?)<!-- SOD_SUMMARY_END -->/)
  if (!match) return []
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
}

describe('SOS Directives block stays in parity with guardrails.md SOD markers', () => {
  const bullets = sodBullets()
  const rendered = renderDirectivesBlock('venturecrane/example-repo')

  it('finds the SOD_SUMMARY block (sanity: a moved marker must not pass green)', () => {
    expect(bullets.length).toBeGreaterThanOrEqual(5)
  })

  it('every SOD bullet appears verbatim in the rendered Directives block', () => {
    const missing = bullets.filter((b) => !rendered.includes(b))
    expect(missing).toEqual([])
  })

  it('the rendered block still points at the full guardrails doc', () => {
    expect(rendered).toContain("crane_doc('global', 'guardrails.md')")
  })
})
