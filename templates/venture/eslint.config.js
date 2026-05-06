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
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '.*',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.wrangler/**'],
  }
)
