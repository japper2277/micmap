// server.js
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config();

// MongoDB Connection
const { connectDB } = require('./config/database');
const Mic = require('./models/Mic');

// Redis Caching
const { cacheMiddleware } = require('./middleware/cache');
const { getCacheStats } = require('./utils/cache-invalidation');

// Logging
const { requestLoggingMiddleware } = require('./middleware/logging');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all origins (restrict in production)
app.use(cors());

// Request logging with unique IDs
app.use(requestLoggingMiddleware);

// Connect to MongoDB (skip in test - tests handle their own connection)
if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

// Venue address to coordinates mapping
const VENUE_COORDINATES = {
  'Comedy Shop': { lat: 40.7288305, lon: -74.0001342 },
  'Greenwich Village Comedy Club': { lat: 40.7296565, lon: -74.001091 },
  'Greenwich village comedy club': { lat: 40.7296565, lon: -74.001091 },
  'Pinebox': { lat: 40.7052293, lon: -73.9326664 },
  'Pine Box Rock Shop': { lat: 40.7052293, lon: -73.9326664 },
  'UWS NY Comedy Club': { lat: 40.7808191, lon: -73.9805102 },
  'Eastville Comedy Club': { lat: 40.7142545, lon: -73.9613017 },
  'Phoenix bar': { lat: 40.7288305, lon: -74.0001342 },
  'The Comic Strip Live': { lat: 40.7748581, lon: -73.9536956 },
  'St. Mark\'s Comedy Club': { lat: 40.7748581, lon: -73.9536956 },
  'Producer\'s Club': { lat: 40.7644391, lon: -73.9856707 },
  'Caffeine Underground': { lat: 40.6836915, lon: -73.9112136 },
  'Brooklyn Art Haus': { lat: 40.7168611, lon: -73.9610679 },
  'Fear City Comedy Club': { lat: 40.7152631, lon: -73.9901598 },
  'Easy Lover BK': { lat: 40.7180926, lon: -73.9502883 },
  'Bushwick Comedy Club': { lat: 40.6955342, lon: -73.9288494 },
  'Idaho Bar': { lat: 40.7288305, lon: -74.0001342 },
  'O\'Keefe\'s Bar': { lat: 40.6784737, lon: -73.9860016 },
  'The Tiny Cupboard': { lat: 40.6836915, lon: -73.9112136 },
  'QED Astoria': { lat: 40.775548, lon: -73.9149401 },
  'The Pit Midtown': { lat: 40.7405356, lon: -73.9848055 },
  'The PIT NYC': { lat: 40.7405356, lon: -73.9848055 },
  'UCB': { lat: 40.7305356, lon: -73.9878055 },
  'Grisly Pear': { lat: 40.7318243, lon: -74.0036027 },
  'New York Comedy Club Midtown': { lat: 40.7389213, lon: -73.9808057 },
  'The Stand NYC': { lat: 40.7366948, lon: -73.9844585 },
  'Janice\'s apt': { lat: 40.7644391, lon: -73.9856707 },
  'Sesh Comedy': { lat: 40.7152631, lon: -73.9901598 },
  'BKLYN Made Comedy': { lat: 40.6955342, lon: -73.9288494 },
  'Comedy Village': { lat: 40.7644391, lon: -73.9856707 },
  'Caravan of Dreams': { lat: 40.7256, lon: -73.9831 },
  'Phoenix Bar Avenue A': { lat: 40.7288305, lon: -74.0001342 },
  'West Side Comedy Club': { lat: 40.7808191, lon: -73.9805102 },
  'Alligator Lounge': { lat: 40.7139062, lon: -73.9489165 },
  'Second City': { lat: 40.7207729, lon: -73.9596507 },
  'Pete\'s Candy Store': { lat: 40.7180926, lon: -73.9502883 },
  'Broadway Comedy Club': { lat: 40.7644391, lon: -73.9856707 },
  'Laughing Devil Comedy Club': { lat: 40.7444693, lon: -73.953783 },
  'Young Ethel\'s': { lat: 40.6784737, lon: -73.9860016 }
};

// Fast liveness check - for load balancers/Heroku (< 50ms)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Deep health check - tests actual database connectivity (< 2s)
app.get('/health/deep', async (req, res) => {
  const startTime = Date.now();
  const results = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {}
  };

  // Test MongoDB with timeout
  try {
    const mongoStart = Date.now();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('MongoDB timeout')), 500)
    );

    const countPromise = Mic.countDocuments();
    const totalMics = await Promise.race([countPromise, timeoutPromise]);

    const mongoResponseTime = Date.now() - mongoStart;

    results.services.mongodb = {
      status: mongoResponseTime < 100 ? 'healthy' : mongoResponseTime < 500 ? 'degraded' : 'unhealthy',
      connected: true,
      responseTime: mongoResponseTime,
      totalMics
    };

    if (mongoResponseTime >= 100) {
      results.status = mongoResponseTime < 500 ? 'degraded' : 'unhealthy';
    }
  } catch (error) {
    results.services.mongodb = {
      status: 'unhealthy',
      connected: false,
      error: error.message
    };
    results.status = 'unhealthy';
  }

  // Test Redis (optional - doesn't affect overall status)
  try {
    const redisStart = Date.now();
    const cacheStats = await getCacheStats();
    const redisResponseTime = Date.now() - redisStart;

    results.services.redis = {
      status: cacheStats.connected ? 'healthy' : 'down',
      connected: cacheStats.connected,
      responseTime: redisResponseTime,
      cacheKeys: cacheStats.micCacheKeys || 0
    };

    // Redis being down is degraded, not unhealthy (we have graceful fallback)
    if (!cacheStats.connected && results.status === 'healthy') {
      results.status = 'degraded';
    }
  } catch (error) {
    results.services.redis = {
      status: 'down',
      connected: false,
      error: error.message
    };
    if (results.status === 'healthy') {
      results.status = 'degraded';
    }
  }

  results.responseTime = Date.now() - startTime;

  // Return appropriate HTTP status code
  const statusCode = results.status === 'healthy' ? 200 : results.status === 'degraded' ? 207 : 503;
  res.status(statusCode).json(results);
});

// Main endpoint: Fetch open mic data from MongoDB (with Redis caching)
app.get('/api/v1/mics', cacheMiddleware, async (req, res) => {
  try {
    // Extract query parameters for filtering
    const { day, borough, neighborhood, cost, sort } = req.query;

    // Build query
    const query = {};
    if (day) query.day = day;
    if (borough) query.borough = borough;
    if (neighborhood) query.neighborhood = neighborhood;

    // Cost filtering
    if (cost) {
      if (cost.toLowerCase() === 'free') {
        query.cost = { $regex: /^free$/i };
      } else {
        query.cost = cost;
      }
    }

    // Execute query
    let micsQuery = Mic.find(query).lean();

    // Sorting
    if (sort === 'time') {
      micsQuery = micsQuery.sort({ startTime: 1 });
    } else if (sort === 'score') {
      micsQuery = micsQuery.sort({ score: -1 });
    } else if (sort === 'distance') {
      // Distance sorting will be handled by frontend
      // or require user coordinates passed in query
      micsQuery = micsQuery.sort({ day: 1, startTime: 1 });
    } else {
      // Default: sort by day and time
      micsQuery = micsQuery.sort({ day: 1, startTime: 1 });
    }

    const mics = await micsQuery;

    console.log(`✅ Loaded ${mics.length} mics from MongoDB`);

    res.json({
      success: true,
      count: mics.length,
      lastUpdated: new Date().toISOString(),
      mics
    });

  } catch (error) {
    console.error('❌ Error in /api/v1/mics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch open mic data. Please try again later.'
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🎤 MicMap API is running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`📋 Mics endpoint: http://localhost:${PORT}/api/v1/mics`);
  });
}

// Export app for testing
module.exports = app;
