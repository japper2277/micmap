// cache.js - Redis Caching Middleware
const crypto = require('crypto');
const { redis, isRedisConnected } = require('../config/cache');

// Cache TTL: 15 minutes in seconds
const CACHE_TTL = 15 * 60;

/**
 * Generate a deterministic cache key from request query parameters
 * Uses MD5 hash of sorted query params to avoid collisions and order issues
 *
 * Examples:
 * ?day=Monday&borough=Brooklyn -> micmap:mics:a1b2c3d4...
 * ?borough=Brooklyn&day=Monday -> micmap:mics:a1b2c3d4... (same hash!)
 *
 * @param {Object} query - Express req.query object
 * @returns {String} Cache key
 */
function generateCacheKey(query) {
  // Sort query params alphabetically to ensure consistent hashing
  const sortedKeys = Object.keys(query).sort();
  const sortedQuery = {};

  for (const key of sortedKeys) {
    sortedQuery[key] = query[key];
  }

  // Create hash of sorted query
  const queryString = JSON.stringify(sortedQuery);
  const hash = crypto.createHash('md5').update(queryString).digest('hex');

  return `micmap:mics:${hash}`;
}

/**
 * Redis caching middleware for /api/v1/mics endpoint
 *
 * Flow:
 * 1. Check if Redis is connected
 * 2. Try to get cached response from Redis
 * 3. If cache hit: return cached data immediately
 * 4. If cache miss: continue to MongoDB query
 * 5. Intercept response and cache it for next request
 *
 * Graceful Failure:
 * - If Redis is down, middleware passes through to MongoDB
 * - If Redis errors occur, they're caught and logged (non-blocking)
 * - API always works, caching is a performance optimization only
 */
async function cacheMiddleware(req, res, next) {
  // Skip caching if Redis isn't connected
  if (!isRedisConnected()) {
    if (process.env.NODE_ENV !== 'test') {
      console.log('⚠️ Redis not connected - bypassing cache');
    }
    return next();
  }

  try {
    const cacheKey = generateCacheKey(req.query);

    // Try to get from cache
    const cachedData = await redis.get(cacheKey);

    if (cachedData) {
      // Cache HIT - return immediately
      if (process.env.NODE_ENV !== 'test') {
        console.log(`✅ Cache HIT: ${cacheKey}`);
      }
      const data = JSON.parse(cachedData);

      // Add cache metadata to response
      data.cached = true;
      data.cacheKey = cacheKey;

      return res.json(data);
    }

    // Cache MISS - continue to MongoDB
    if (process.env.NODE_ENV !== 'test') {
      console.log(`❌ Cache MISS: ${cacheKey}`);
    }

    // Intercept res.json() to cache the response before sending
    const originalJson = res.json.bind(res);

    res.json = (data) => {
      // Cache the response asynchronously (don't block response)
      setImmediate(async () => {
        try {
          // Add cache metadata
          const dataToCache = {
            ...data,
            cached: false,
            cacheKey: cacheKey
          };

          await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(dataToCache));
          if (process.env.NODE_ENV !== 'test') {
            console.log(`💾 Cached response: ${cacheKey} (TTL: ${CACHE_TTL}s)`);
          }
        } catch (cacheError) {
          if (process.env.NODE_ENV !== 'test') {
            console.warn('⚠️ Failed to cache response:', cacheError.message);
          }
          // Don't throw - caching is optional
        }
      });

      // Return response immediately (don't wait for caching)
      return originalJson(data);
    };

    next();

  } catch (error) {
    // Redis error - log and continue without cache
    if (process.env.NODE_ENV !== 'test') {
      console.warn('⚠️ Cache middleware error:', error.message);
    }
    next();
  }
}

module.exports = { cacheMiddleware, generateCacheKey };
