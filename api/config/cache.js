// cache.js - Redis Connection Configuration
const Redis = require('ioredis');

// Redis connection options optimized for fast failure and graceful degradation
const redisOptions = {
  connectTimeout: 500,        // Fail fast - don't wait more than 500ms
  maxRetriesPerRequest: 1,    // Only retry once - don't hang
  enableOfflineQueue: false,  // Don't queue commands when disconnected
  lazyConnect: true,          // Don't block server startup if Redis is down
  retryStrategy: (times) => {
    // Retry connection every 5 seconds for first minute, then give up
    if (times > 12) {
      console.error('❌ Redis connection failed after 12 attempts. Caching disabled.');
      return null; // Stop retrying
    }
    return 5000; // Retry after 5 seconds
  }
};

// Initialize Redis connection
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl, redisOptions);

// Connection state tracking
let isRedisConnected = false;

// Handle successful connection
redis.on('connect', () => {
  isRedisConnected = true;
  if (process.env.NODE_ENV !== 'test') {
    console.log('✅ Redis connected successfully');
    console.log(`📦 Redis URL: ${redisUrl.replace(/:[^:]*@/, ':****@')}`); // Hide password
  }
});

// Handle connection ready
redis.on('ready', () => {
  isRedisConnected = true;
  if (process.env.NODE_ENV !== 'test') {
    console.log('✅ Redis is ready to accept commands');
  }
});

// Handle connection errors
redis.on('error', (error) => {
  isRedisConnected = false;
  if (process.env.NODE_ENV !== 'test') {
    console.warn('⚠️ Redis connection error:', error.message);
    console.warn('⚠️ Caching disabled - API will query MongoDB directly');
  }
});

// Handle disconnection
redis.on('close', () => {
  isRedisConnected = false;
  if (process.env.NODE_ENV !== 'test') {
    console.warn('⚠️ Redis connection closed');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  redis.disconnect();
});

// Attempt to connect (lazy connect is true, so this won't block server startup)
redis.connect().catch((error) => {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('⚠️ Redis not available:', error.message);
    console.warn('⚠️ Server will run without caching');
  }
});

// Export Redis client and connection status helper
module.exports = {
  redis,
  isRedisConnected: () => isRedisConnected
};
