import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

// ESLint 10 + typescript-eslint require an explicit tsconfigRootDir when
// multiple candidate tsconfig.json files exist in the workspace tree.
// See https://tseslint.com/parser-tsconfigrootdir
const tsconfigRootDir = dirname(fileURLToPath(import.meta.url))

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        tsconfigRootDir,
      },
    },
    rules: {
      // Allow unused vars starting with underscore (intentionally unused)
      // Also allow unused args (common in callbacks/handlers)
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '.*',
          ignoreRestSiblings: true,
        },
      ],
      // Allow require() imports in specific cases (dynamic imports, CommonJS)
      '@typescript-eslint/no-require-imports': 'warn',
      // Warn on explicit any to encourage gradual typing improvements
      '@typescript-eslint/no-explicit-any': 'warn',
      // ESLint 10 added two new rules to its recommended set. They flag real
      // smells but the codebase predates them — start at "warn" so the
      // signal is visible without blocking CI; tighten to "error" once the
      // existing instances are cleaned up in a follow-up.
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
    },
  },
  {
    // Relax rules for test files
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // Guard against the legacy live-wrangler test pattern. Tests under
    // workers/*/test/harness/** and workers/*/test/canary/** must use the
    // crane-test-harness in-process invoker, not hit a wrangler dev server
    // on localhost:8787. The legacy test/integration/** folder is exempted
    // because it intentionally targets live wrangler until Phase 2 deletes
    // it.
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
    // Allow require in JS scripts
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.wrangler/**', 'site/.astro/**'],
  }
)
