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
      'no-console': 'off', // TODO: remove this rule and use the Payload logger instead
    },
  },
  {
    // Test files use `vi.mock` to stub hooks like `useConfig`, `useRouter`, etc.
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
