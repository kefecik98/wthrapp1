// Jest configuration for the WeatherAlert client.
// Derives from jest-expo, which handles Babel + Metro-style transforms and
// transformIgnorePatterns for the React Native + Expo module zoo.

module.exports = {
  preset: 'jest-expo',

  // Mirror the TypeScript `@/*` path alias (see tsconfig.json) so test files
  // can `import x from '@/components/...'` exactly like app code does.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },

  setupFiles: ['<rootDir>/jest.setup.js'],

  // Common test patterns. `*.test.ts(x)` co-located with source is the rule.
  testMatch: [
    '**/__tests__/**/*.test.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],

  // Ignore build outputs + native project trees.
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/', '/.expo/'],
};
