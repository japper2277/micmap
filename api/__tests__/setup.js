// setup.js - Test Environment Setup
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;

// Start in-memory MongoDB before all tests
beforeAll(async () => {
  // Create in-memory MongoDB instance
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  // Set test environment variables
  process.env.MONGODB_URI = uri;

  // If already connected (from server.js import), disconnect first
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Connect to in-memory MongoDB
  await mongoose.connect(uri);
});

// Clean up after all tests
afterAll(async () => {
  // Disconnect from MongoDB
  await mongoose.disconnect();

  // Stop in-memory MongoDB
  if (mongod) {
    await mongod.stop();
  }
});

// Clear all collections AND Redis cache before each test (isolation)
beforeEach(async () => {
  // If a prior test closed the connection (or failed before reconnecting), reconnect.
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  // Clear MongoDB collections
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }

  // Clear Redis cache (if using ioredis-mock)
  try {
    const { redis } = require('../config/cache');
    if (redis && redis.flushall) {
      await redis.flushall();
    }
  } catch (error) {
    // Redis might not be initialized, that's okay
  }
});
