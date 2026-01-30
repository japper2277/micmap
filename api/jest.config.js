// jest.config.js - Jest Test Configuration
module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.spec.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'server.js',
    'config/**/*.js',
    'models/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    '!**/__tests__/**',
    '!coverage/**',
    '!node_modules/**'
  ],

  // Coverage threshold (aspirational - start at 0%)
  coverageThreshold: {
    global: {
      statements: 0,
      branches: 0,
      functions: 0,
      lines: 0
    }
  },

  // Setup files
  // setupFiles runs before each test file is evaluated (critical so server.js sees NODE_ENV=test)
  setupFiles: ['<rootDir>/__tests__/env.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],

  // Test timeout (increase for MongoDB memory server)
  testTimeout: 30000,

  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // Verbose output
  verbose: true
};
