/**
 * jest.config.ts — Jest configuration for Pulse v5.
 *
 * Uses ts-jest for TypeScript transformation.
 * Path aliases are mapped to match tsconfig.json.
 *
 * Run tests:
 *   npm test                  — all tests
 *   npm test -- --watch       — watch mode
 *   npm run test:cov          — with coverage report
 */

import type { Config } from 'jest';

const config: Config = {
  // Use ts-jest to handle TypeScript
  preset: 'ts-jest',

  // Node environment (not jsdom)
  testEnvironment: 'node',

  // TypeScript transformation config
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          // CommonJS for Jest (avoids ESM transform complexity)
          module: 'CommonJS',
          moduleResolution: 'node',
          strict: true,
          strictNullChecks: true,
          noUncheckedIndexedAccess: false, // Relax for tests
          esModuleInterop: true,
          resolveJsonModule: true,
          skipLibCheck: true,
          experimentalDecorators: false,
          emitDecoratorMetadata: false,
        },
        diagnostics: {
          // Warn-only during tests for faster feedback; typecheck runs separately
          warnOnly: true,
        },
      },
    ],
  },

  // Test file patterns — looks in both tests/ and src/
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts',
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.spec.ts',
  ],

  // Files to ignore
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/dist-test/',
    '\\.e2e\\.spec\\.ts$',
    '/tests/integration/',
  ],

  // Module name mapper for path aliases (mirrors tsconfig paths)
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@ports/(.*)$': '<rootDir>/src/ports/$1',
    '^@adapters/(.*)$': '<rootDir>/src/adapters/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@orchestrator/(.*)$': '<rootDir>/src/orchestrator/$1',
    // Strip .js extension from imports (NodeNext style → CommonJS in tests)
    '^(\\./.*)\\.js$': '$1',
    '^(\\.\\./.*)\\.js$': '$1',
  },

  // Coverage configuration
  collectCoverage: false, // Enable with --coverage flag or npm run test:cov
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/prompts/**',
  ],

  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],

  // Coverage thresholds — these will increase sprint by sprint
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 35,
      statements: 35,
    },
  },

  // Verbose output in CI, quiet locally
  verbose: process.env['CI'] === 'true',

  // Timeout per test (ms)
  testTimeout: 10_000,

  // Mock management
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};

export default config;
