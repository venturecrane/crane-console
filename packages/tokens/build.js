#!/usr/bin/env node
/**
 * Build per-venture CSS files from W3C-DTCG source tokens.
 *
 * Source: src/base/*.json (shared) + src/ventures/{code}.json (per-venture overrides)
 * Output: dist/{code}.css with CSS custom properties prefixed `--{code}-*`
 *
 * Style Dictionary v4 natively understands DTCG $value / $type tokens.
 */

import StyleDictionary from 'style-dictionary'
import { readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const venturesDir = join(root, 'src', 'ventures')
const baseDir = join(root, 'src', 'base')

const ventures = readdirSync(venturesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => basename(f, '.json'))

for (const code of ventures) {
  const sd = new StyleDictionary({
    source: [join(baseDir, '*.json'), join(venturesDir, `${code}.json`)],
    platforms: {
      css: {
        transformGroup: 'css',
        prefix: code,
        buildPath: 'dist/',
        files: [
          {
            destination: `${code}.css`,
            format: 'css/variables',
            options: { selector: ':root', outputReferences: true },
          },
        ],
      },
    },
    log: { verbosity: 'silent', warnings: 'warn' },
  })

  await sd.hasInitialized
  await sd.buildAllPlatforms()
  console.log(`built: dist/${code}.css`)
}
