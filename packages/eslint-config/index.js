// @venturecrane/eslint-config
//
// Shared ESLint flat config for the Venture Crane portfolio. Consumed by
// crane-console (this monorepo) and every venture repo. New rules and
// thresholds land here first; ventures pick up via version bump.
//
// Usage:
//
//   import { venturecraneEslintConfig } from '@venturecrane/eslint-config'
//   import { fileURLToPath } from 'node:url'
//   import { dirname } from 'node:path'
//
//   const tsconfigRootDir = dirname(fileURLToPath(import.meta.url))
//
//   export default venturecraneEslintConfig({
//     tsconfigRootDir,
//     additional: [/* per-repo overrides */],
//   })

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import importPlugin from 'eslint-plugin-import-x'

// Structural thresholds. These match docs/standards/nfr-assessment-template.md
// and are deliberately tractable for the existing portfolio after a one-shot
// cleanup. Tighten in future versions; never widen without a Captain directive.
const STRUCTURAL_THRESHOLDS = Object.freeze({
  maxLines: 500,
  maxLinesPerFunction: 75,
  complexity: 15,
  maxDepth: 4,
  maxParams: 5,
})

// Files that may use `export default` for framework-required reasons. Patterns
// are evaluated by eslint-plugin-import-x against file paths. Add new framework
// patterns here when ventures adopt them; do NOT override per-repo.
const DEFAULT_EXPORT_ALLOW_PATTERNS = [
  // Build & test config files
  '**/vitest.config.{ts,js,mjs}',
  '**/playwright.config.{ts,js,mjs}',
  '**/playwright.config.snippet.ts',
  '**/astro.config.{ts,js,mjs}',
  '**/next.config.{ts,js,mjs}',
  '**/tailwind.config.{ts,js,mjs}',
  '**/postcss.config.{ts,js,mjs}',
  '**/svelte.config.{ts,js,mjs}',
  '**/eslint.config.{ts,js,mjs}',
  '**/sentry.{client,server,edge}.config.{ts,js,mjs}',
  // Cloudflare Workers entry points (export default { fetch })
  '**/workers/*/src/index.ts',
  // Hono sub-app route modules (export default app pattern)
  '**/workers/*/src/routes/**/*.ts',
  // Next.js App Router special files (require default export)
  '**/page.{tsx,jsx,ts,js}',
  '**/layout.{tsx,jsx,ts,js}',
  '**/loading.{tsx,jsx,ts,js}',
  '**/error.{tsx,jsx,ts,js}',
  '**/not-found.{tsx,jsx,ts,js}',
  '**/route.{ts,js}',
  '**/template.{tsx,jsx}',
  '**/default.{tsx,jsx}',
  '**/middleware.{ts,js}',
  // Astro pages and components
  '**/*.astro',
]

// === Rule sets ===
// Extracted to module scope so the config-builder function stays under the
// 75-line max-lines-per-function cap (the package's own rule).

const STRUCTURAL_RULES = {
  'max-lines': [
    'error',
    {
      max: STRUCTURAL_THRESHOLDS.maxLines,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
  'max-lines-per-function': [
    'error',
    {
      max: STRUCTURAL_THRESHOLDS.maxLinesPerFunction,
      skipBlankLines: true,
      skipComments: true,
      IIFEs: true,
    },
  ],
  complexity: ['error', { max: STRUCTURAL_THRESHOLDS.complexity }],
  'max-depth': ['error', STRUCTURAL_THRESHOLDS.maxDepth],
  'max-params': ['error', STRUCTURAL_THRESHOLDS.maxParams],
}

const TYPE_SAFETY_RULES = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '.*',
      ignoreRestSiblings: true,
    },
  ],
  '@typescript-eslint/no-require-imports': 'error',
  // ESLint 10 newly-recommended rules.
  'no-useless-assignment': 'error',
  'preserve-caught-error': 'error',
}

const TYPE_AWARE_ERROR_RULES = {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/await-thenable': 'error',
  '@typescript-eslint/switch-exhaustiveness-check': [
    'error',
    { considerDefaultExhaustiveForUnions: true },
  ],
}

// Same Zod-availability reasoning as the no-unsafe-* set below: these errors
// fire on `${unknown}` and `${{}}` template patterns and on type-system
// unsafety propagating through `any`-typed values. Promotion to error is
// sequenced into the Zod boundary rollout PR.
const TYPE_AWARE_WARN_RULES = {
  '@typescript-eslint/no-unsafe-assignment': 'warn',
  '@typescript-eslint/no-unsafe-member-access': 'warn',
  '@typescript-eslint/no-unsafe-call': 'warn',
  '@typescript-eslint/no-unsafe-return': 'warn',
  '@typescript-eslint/no-unsafe-argument': 'warn',
  '@typescript-eslint/restrict-template-expressions': [
    'warn',
    { allowNumber: true, allowBoolean: true, allowNullish: true },
  ],
}

const HYGIENE_RULES = {
  // Real bug-catchers only. Deliberately omitted:
  //   - `no-implicit-coercion`: `!!x` is widely understood; forcing
  //     `Boolean(x)` is bikeshedding, not bug-catching.
  //   - `require-await`: in our codebase `async` on a Promise-returning
  //     wrapper is intentional documentation. Flagging it costs more
  //     in churn than it earns in bugs caught.
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-throw-literal': 'error',
  'import-x/no-default-export': 'error',
}

const TEST_FILE_OVERRIDES = {
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unused-vars': 'off',
  '@typescript-eslint/no-require-imports': 'off',
  'preserve-caught-error': 'off',
  'max-lines': 'off',
  'max-lines-per-function': 'off',
  complexity: 'off',
  'max-depth': 'off',
  'max-params': 'off',
  '@typescript-eslint/no-floating-promises': 'off',
  '@typescript-eslint/no-misused-promises': 'off',
  '@typescript-eslint/await-thenable': 'off',
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/restrict-template-expressions': 'off',
}

/**
 * Build a flat ESLint config for a Venture Crane repo.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir - Absolute directory containing the
 *   consuming repo's root tsconfig. Required by typescript-eslint when multiple
 *   tsconfigs exist in the workspace tree.
 * @param {Array} [options.additional] - Repo-specific overrides appended after
 *   the shared rules. Use for ignores, file-pattern restrictions, etc.
 * @returns {Array} ESLint flat config array.
 */
export function venturecraneEslintConfig({ tsconfigRootDir, additional = [] } = {}) {
  if (!tsconfigRootDir) {
    throw new Error('@venturecrane/eslint-config: tsconfigRootDir is required')
  }
  return tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      plugins: { 'import-x': importPlugin },
      rules: {
        ...STRUCTURAL_RULES,
        ...TYPE_SAFETY_RULES,
        ...TYPE_AWARE_ERROR_RULES,
        ...TYPE_AWARE_WARN_RULES,
        ...HYGIENE_RULES,
      },
    },
    {
      // Test files: relax structural and typing rules. Long describe blocks,
      // broad any usage, and unused fixture vars are normal in test code.
      // Patterns also cover test helper files (setup.ts, fixtures, etc.) in
      // any test/ or __tests__/ directory.
      files: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
        '**/test/**/*.ts',
        '**/test/**/*.tsx',
        '**/__tests__/**/*.ts',
        '**/__tests__/**/*.tsx',
        '**/__fixtures__/**/*.ts',
      ],
      rules: TEST_FILE_OVERRIDES,
    },
    {
      // Default-export overrides for framework-required positions.
      files: DEFAULT_EXPORT_ALLOW_PATTERNS,
      rules: { 'import-x/no-default-export': 'off' },
    },
    {
      // JS scripts: allow CommonJS require.
      files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
      rules: { '@typescript-eslint/no-require-imports': 'off' },
    },
    ...additional
  )
}

export { STRUCTURAL_THRESHOLDS, DEFAULT_EXPORT_ALLOW_PATTERNS }
