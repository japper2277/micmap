// cache-invalidation.js - Helper for Scraper Service to Invalidate Cache
const { redis, isRedisConnected } = require('../config/cache');

/**
 * Invalidate all cached mic data
 *
 * This function should be called by the scraper service after updating
 * the MongoDB database with fresh data.
 *
 * Usage in scraper service:
 *
 *   const { invalidateMicsCache } = require('./utils/cache-invalidation');
 *
 *   async function runScraper() {
 *     // 1. Scrape new data from Google Sheets
 *     // 2. Geocode addresses
 *     // 3. Update MongoDB
 *     await updateMongoDBWithNewData();
 *
 *     // 4. Invalidate cache so users get fresh data
 *     await invalidateMicsCache();
 *   }
 *
 * @returns {Promise<number>} Number of cache keys deleted
 */
async function invalidateMicsCache() {
  if (!isRedisConnected()) {
    console.warn('⚠️ Redis not connected - cache invalidation skipped');
    return 0;
  }

  try {
    // Find all cache keys matching our pattern
    const keys = await redis.keys('micmap:mics:*');

    if (keys.length === 0) {
      console.log('ℹ️ No cache entries to invalidate');
      return 0;
    }

    // Delete all matching keys
    await redis.del(...keys);

    console.log(`🗑️ Cache invalidated: ${keys.length} entries deleted`);
    return keys.length;

  } catch (error) {
    console.error('❌ Cache invalidation failed:', error.message);
    throw error;
  }
}

/**
 * Check cache statistics
 *
 * Useful for monitoring and debugging
 *
 * @returns {Promise<Object>} Cache statistics
 */
async function getCacheStats() {
  if (!isRedisConnected()) {
    return {
      connected: false,
      totalKeys: 0,
      micCacheKeys: 0
    };
  }

  try {
    const micKeys = await redis.keys('micmap:mics:*');
    const info = await redis.info('stats');

    return {
      connected: true,
      totalKeys: parseInt(info.match(/db0:keys=(\d+)/)?.[1] || 0),
      micCacheKeys: micKeys.length
    };
  } catch (error) {
    console.error('❌ Failed to get cache stats:', error.message);
    return {
      connected: false,
      error: error.message
    };
  }
}

module.exports = {
  invalidateMicsCache,
  getCacheStats
};
