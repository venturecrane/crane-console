import { venturecraneEslintConfig } from '@venturecrane/eslint-config'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url))

export default venturecraneEslintConfig({
  tsconfigRootDir,
  additional: [
    {
      // Guard against the legacy live-wrangler test pattern. Tests under
      // workers/*/test/harness/** and workers/*/test/canary/** must use the
      // crane-test-harness in-process invoker, not hit a wrangler dev server
      // on localhost:8787. The legacy test/integration/** folder is exempted
      // because it intentionally targets live wrangler.
      files: ['workers/*/test/harness/**/*.ts', 'workers/*/test/canary/**/*.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'Literal[value=/localhost:8787/]',
            message:
              'Do not target live wrangler dev (localhost:8787) in harness or canary tests. Use the @venturecrane/crane-test-harness invoke() helper to call the worker in-process.',
          },
          {
            selector: 'TemplateElement[value.raw=/localhost:8787/]',
            message:
              'Do not target live wrangler dev (localhost:8787) in harness or canary tests. Use the @venturecrane/crane-test-harness invoke() helper to call the worker in-process.',
          },
        ],
      },
    },
    {
      ignores: [
        '**/dist/**',
        '**/node_modules/**',
        '**/.wrangler/**',
        '**/.astro/**',
        '**/.claude/worktrees/**',
        '**/bin/**',
        'site/scripts/**',
        'site/src/**',
      ],
    },
  ],
})
