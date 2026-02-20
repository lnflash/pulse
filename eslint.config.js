// @ts-check
import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  // Base JS recommended
  {
    ...eslint.configs.recommended,
    files: ['src/**/*.ts', 'tests/**/*.ts'],
  },

  // TypeScript rules
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript safety
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',

      // General quality
      'no-console': 'error',   // Use pino logger, not console
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],

      // Disabled rules
      'no-undef': 'off',       // TypeScript handles this
    },
  },

  // Test files — relax some rules
  {
    files: ['tests/**/*.ts', 'src/**/*.test.ts', 'src/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Prettier disables conflicting formatting rules
  prettier,

  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'dist-test/**',
      'node_modules/**',
      'coverage/**',
      '*.js',
      '*.cjs',
      '*.mjs',
    ],
  },
];
