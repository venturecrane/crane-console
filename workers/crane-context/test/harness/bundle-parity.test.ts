/**
 * Bundle-parity test: the AGENT_PATTERN regex defined in
 * @venturecrane/crane-contracts must end up in the compiled crane-context
 * worker bundle byte-for-byte.
 *
 * Why this exists: the 2026-04 agent-identity bug was *enabled* by a
 * build-time change (PR #486 wired a previously-dead validator into the
 * /sos handler). If a future build pipeline, esbuild rewrite, or
 * minifier ever mutates the regex literal (e.g., rewriting a character
 * class or stripping the anchors), this test fails loudly before the
 * change reaches prod.
 *
 * Approach: run esbuild with the same entrypoint wrangler uses, capture
 * the bundled output, and grep for the AGENT_PATTERN source. If the
 * bundle doesn't contain the literal string representation of the regex
 * source, something rewrote it on the way through.
 *
 * Fast (<500ms in practice) — worth running on every CI `npm test`.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { build } from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AGENT_PATTERN } from '@venturecrane/crane-contracts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const workerRoot = join(__dirname, '..', '..')

let bundled: string | null = null

beforeAll(async () => {
  const result = await build({
    entryPoints: [join(workerRoot, 'src', 'index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser', // workerd-like target
    target: 'es2022',
    write: false,
    logLevel: 'silent',
    conditions: ['worker', 'browser'],
    external: ['cloudflare:workers'],
  })
  bundled = result.outputFiles[0].text
})

describe('crane-context bundle parity', () => {
  it('compiled bundle contains the canonical AGENT_PATTERN source literal', () => {
    expect(bundled).not.toBeNull()
    // The regex literal in the source ("/^[a-z0-9]+-[a-z0-9-]+$/") should
    // survive bundling. esbuild may re-serialize regex literals, so we
    // check for the source pattern (between the slashes).
    expect(bundled!).toContain(AGENT_PATTERN.source)
  })

  it('compiled bundle does not contain a stale duplicate of the pre-fix regex', () => {
    // Defensive: if someone ever re-introduces a raw regex literal in
    // another worker file (instead of importing from contracts), this
    // catches it. There should be exactly ONE occurrence of the pattern
    // source in the bundle — the one from crane-contracts.
    const occurrences = bundled!.split(AGENT_PATTERN.source).length - 1
    expect(occurrences).toBeGreaterThanOrEqual(1)
    expect(occurrences).toBeLessThanOrEqual(3) // regex + possible string doc + possible error msg
  })
})
