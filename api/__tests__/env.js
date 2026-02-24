// env.js - runs BEFORE test files are evaluated
// Ensures server.js sees test env and does not auto-connect to production Mongo.

process.env.NODE_ENV = 'test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Use an in-memory Redis mock for deterministic tests.
jest.mock('ioredis', () => require('ioredis-mock'));
