// @ts-check

import payloadEsLintConfig from '@payloadcms/eslint-config'

export const defaultESLintIgnores = [
  '**/.temp',
  '**/.*', // ignore all dotfiles
  '**/.git',
  '**/.hg',
  '**/.pnp.*',
  '**/.svn',
  '**/playwright.config.ts',
  '**/jest.config.js',
  '**/tsconfig.tsbuildinfo',
  '**/README.md',
  '**/eslint.config.js',
  '**/payload-types.ts',
  '**/dist/',
  '**/.yarn/',
  '**/build/',
  '**/node_modules/',
  '**/temp/',
]

export default [
  ...payloadEsLintConfig,
  {
    rules: {
      'no-restricted-exports': 'off',
      complexity: ['error', 40],
    },
  },
  {
    // Test files use `vi.mock` to stub hooks like `useConfig`, `useLocale`, etc.
    // The mock arrow functions share names with real hooks, so the rule flags them
    // as "useless custom hooks" — but they are intentionally plain mocks.
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    rules: {
      '@eslint-react/hooks-extra/no-useless-custom-hooks': 'off',
    },
  },
  {
    ignores: defaultESLintIgnores,
  },
  {
    // Browser-side components have no access to the Payload logger (`payload.logger` is
    // server-only). `console.error`/`console.warn` are the diagnostics channel there, and each
    // call site pairs the log with a user-facing toast.
    files: ['src/components/**/*.tsx'],
    rules: {
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
        projectService: {
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 40,
          allowDefaultProject: ['scripts/*.ts', '*.js', '*.mjs', '*.spec.ts', '*.d.ts'],
        },
        // projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]
