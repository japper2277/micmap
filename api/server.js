// server.js
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
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

// Subway Router
const subwayRouter = require('../scripts/subway-router');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all origins (restrict in production)
app.use(cors());

// Parse JSON bodies
app.use(express.json());

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

// =================================================================
// TRANSIT PROXY - Google Distance Matrix API
// =================================================================
app.post('/api/proxy/transit', async (req, res) => {
  const { originLat, originLng, destinations } = req.body;

  // Validate inputs
  if (!originLat || !originLng || !destinations?.length) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  if (destinations.length > 25) {
    return res.status(400).json({ error: 'Max 25 destinations per request' });
  }

  // Validate coordinates are in NYC area
  const isValidCoord = (lat, lng) =>
    lat >= 40.45 && lat <= 40.95 && lng >= -74.3 && lng <= -73.6;

  if (!isValidCoord(originLat, originLng)) {
    return res.status(400).json({ error: 'Origin outside NYC area' });
  }

  // Check API key exists
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.error('❌ GOOGLE_MAPS_API_KEY not configured');
    return res.status(500).json({ error: 'Transit service not configured' });
  }

  try {
    const destinationsStr = destinations.map(d => `${d.lat},${d.lng}`).join('|');

    const params = new URLSearchParams({
      origins: `${originLat},${originLng}`,
      destinations: destinationsStr,
      mode: 'transit',
      departure_time: 'now',
      key: process.env.GOOGLE_MAPS_API_KEY
    });

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Google API error:', data.status, data.error_message);
      return res.status(500).json({ error: `Google API: ${data.status}` });
    }

    // Map results back to destinations
    const times = data.rows[0].elements.map((el, i) => ({
      lat: destinations[i].lat,
      lng: destinations[i].lng,
      seconds: el.status === 'OK' ? el.duration.value : null,
      text: el.status === 'OK' ? el.duration.text : 'N/A',
      status: el.status
    }));

    console.log(`✅ Transit times calculated for ${times.length} destinations`);
    res.json({ times });

  } catch (error) {
    console.error('❌ Transit proxy error:', error);
    res.status(500).json({ error: 'Transit calculation failed' });
  }
});

// =================================================================
// MTA REALTIME - Alerts & Arrivals
// =================================================================

const MTA_BASE = 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds';
const MTA_ALERTS_URL = `${MTA_BASE}/camsys%2Fsubway-alerts`;

const MTA_FEED_MAP = {
  '1': 'nyct%2Fgtfs', '2': 'nyct%2Fgtfs', '3': 'nyct%2Fgtfs',
  '4': 'nyct%2Fgtfs', '5': 'nyct%2Fgtfs', '6': 'nyct%2Fgtfs', 'S': 'nyct%2Fgtfs',
  'A': 'nyct%2Fgtfs-ace', 'C': 'nyct%2Fgtfs-ace', 'E': 'nyct%2Fgtfs-ace',
  'N': 'nyct%2Fgtfs-nqrw', 'Q': 'nyct%2Fgtfs-nqrw', 'R': 'nyct%2Fgtfs-nqrw', 'W': 'nyct%2Fgtfs-nqrw',
  'B': 'nyct%2Fgtfs-bdfm', 'D': 'nyct%2Fgtfs-bdfm', 'F': 'nyct%2Fgtfs-bdfm', 'M': 'nyct%2Fgtfs-bdfm',
  'L': 'nyct%2Fgtfs-l',
  'G': 'nyct%2Fgtfs-g',
  'J': 'nyct%2Fgtfs-jz', 'Z': 'nyct%2Fgtfs-jz',
  '7': 'nyct%2Fgtfs-7'
};

// In-memory cache
const mtaCache = {
  alerts: { data: null, timestamp: 0 },
  feeds: {} // { 'L': { data: null, timestamp: 0 }, ... }
};

const MTA_CACHE_TTL = {
  alerts: 90 * 1000,  // 90 seconds
  feed: 30 * 1000     // 30 seconds
};

// GET /api/mta/alerts
app.get('/api/mta/alerts', async (req, res) => {
  try {
    // Serve from cache if fresh
    if (mtaCache.alerts.data && Date.now() - mtaCache.alerts.timestamp < MTA_CACHE_TTL.alerts) {
      return res.json(mtaCache.alerts.data);
    }

    // Fetch from MTA
    const response = await fetch(MTA_ALERTS_URL);
    if (!response.ok) throw new Error(`MTA status: ${response.status}`);

    // Decode Protobuf
    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

    // Parse alerts
    const alerts = [];
    feed.entity.forEach(entity => {
      if (entity.alert && entity.alert.headerText) {
        const alert = entity.alert;
        const lines = [];
        alert.informedEntity?.forEach(ie => {
          if (ie.routeId) lines.push(ie.routeId);
        });

        if (lines.length > 0) {
          const text = alert.headerText.translation?.[0]?.text || 'Service Alert';
          alerts.push({
            id: entity.id,
            lines,
            text,
            type: text.toLowerCase().includes('suspended') ? 'error' : 'warning'
          });
        }
      }
    });

    // Cache and return
    mtaCache.alerts = { data: alerts, timestamp: Date.now() };
    console.log(`✅ MTA alerts fetched: ${alerts.length} active`);
    res.json(alerts);

  } catch (error) {
    console.error('❌ MTA alerts error:', error.message);
    res.json([]); // Return empty array so frontend doesn't break
  }
});

// GET /api/mta/arrivals/:line/:stopId
app.get('/api/mta/arrivals/:line/:stopId', async (req, res) => {
  try {
    const { line, stopId } = req.params;
    const lineUpper = line.toUpperCase();
    const feedSuffix = MTA_FEED_MAP[lineUpper];

    if (!feedSuffix) {
      return res.status(400).json({ error: `Unknown line: ${line}` });
    }

    // Check cache
    if (mtaCache.feeds[lineUpper]?.data &&
        Date.now() - mtaCache.feeds[lineUpper].timestamp < MTA_CACHE_TTL.feed) {
      const arrivals = extractArrivals(mtaCache.feeds[lineUpper].data, stopId);
      return res.json(arrivals);
    }

    // Fetch fresh data
    const feedUrl = `${MTA_BASE}/${feedSuffix}`;
    const response = await fetch(feedUrl);
    if (!response.ok) throw new Error(`MTA status: ${response.status}`);

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

    // Cache the feed
    mtaCache.feeds[lineUpper] = { data: feed, timestamp: Date.now() };

    const arrivals = extractArrivals(feed, stopId);
    console.log(`✅ MTA arrivals for ${lineUpper}/${stopId}: ${arrivals.length} trains`);
    res.json(arrivals);

  } catch (error) {
    console.error('❌ MTA arrivals error:', error.message);
    res.json([]);
  }
});

function extractArrivals(feed, stopId) {
  const now = Date.now() / 1000;
  const arrivals = [];

  // Lines that don't run north-south (custom direction labels)
  const customDirections = {
    'L': { N: 'Manhattan', S: 'Brooklyn' },
    'G': { N: 'Queens', S: 'Brooklyn' },
    'J': { N: 'Manhattan', S: 'Queens' },
    'Z': { N: 'Manhattan', S: 'Queens' },
    'M': { N: 'Manhattan', S: 'Brooklyn' },
    'S': { N: 'Times Sq', S: 'Grand Central' }
  };

  feed.entity.forEach(entity => {
    if (entity.tripUpdate) {
      const trip = entity.tripUpdate.trip;

      entity.tripUpdate.stopTimeUpdate?.forEach(stu => {
        // Match stopId prefix (e.g., L08 matches L08N and L08S)
        if (stu.stopId?.startsWith(stopId)) {
          const arrivalTime = stu.arrival?.time?.low || stu.arrival?.time;
          // 60-second buffer for "boarding now" trains
          if (arrivalTime && arrivalTime > (now - 60)) {
            const minsAway = Math.round((arrivalTime - now) / 60);
            if (minsAway <= 30) {
              const suffix = stu.stopId.slice(-1); // N or S
              let direction;
              if (customDirections[trip.routeId]) {
                direction = customDirections[trip.routeId][suffix] || (suffix === 'N' ? 'Uptown' : 'Downtown');
              } else {
                direction = suffix === 'N' ? 'Uptown' : 'Downtown';
              }
              arrivals.push({
                line: trip.routeId,
                direction,
                minsAway: Math.max(0, minsAway) // Clamp to 0 for "boarding"
              });
            }
          }
        }
      });
    }
  });

  // Sort by arrival time, limit to 6
  arrivals.sort((a, b) => a.minsAway - b.minsAway);
  return arrivals.slice(0, 6);
}

// =================================================================
// GEOCODING PROXY - Mapbox (100k free/month, supports business names)
// =================================================================
app.get('/api/proxy/geocode', async (req, res) => {
  const { query } = req.query;

  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Query too short' });
  }

  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!mapboxToken) {
    console.error('❌ MAPBOX_ACCESS_TOKEN not configured');
    return res.status(500).json({ error: 'Geocoding not configured' });
  }

  // Sanitize input (XSS protection)
  const sanitized = query.replace(/[<>"']/g, '').substring(0, 100);

  try {
    // Mapbox Geocoding API - includes POIs (businesses like Trader Joe's)
    // bbox = NYC bounding box (minLng,minLat,maxLng,maxLat)
    const bbox = '-74.3,40.45,-73.6,40.95';
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(sanitized)}.json?access_token=${mapboxToken}&bbox=${bbox}&limit=5&types=poi,address,neighborhood,place`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.message) {
      console.error('❌ Mapbox error:', data.message);
      return res.status(500).json({ error: 'Geocoding failed' });
    }

    const results = (data.features || []).map(item => ({
      name: item.text || item.place_name.split(',')[0],
      address: item.place_name,
      lat: item.center[1],
      lng: item.center[0]
    }));

    console.log(`✅ Geocoded "${sanitized}" -> ${results.length} results`);
    res.json({ results });

  } catch (error) {
    console.error('❌ Geocode error:', error);
    res.status(500).json({ error: 'Geocoding failed' });
  }
});

// =================================================================
// HERE API RATE LIMITING - Stay under free tier (250k/month, 1k/day)
// =================================================================
const hereRateLimit = {
  dailyCalls: 0,
  lastReset: Date.now(),
  DAILY_LIMIT: 900  // Stay under 1000/day limit
};

// Reset counter at midnight
function checkHereRateLimit() {
  const now = Date.now();
  const msSinceReset = now - hereRateLimit.lastReset;
  const msInDay = 24 * 60 * 60 * 1000;

  if (msSinceReset >= msInDay) {
    hereRateLimit.dailyCalls = 0;
    hereRateLimit.lastReset = now;
    console.log('🔄 HERE rate limit counter reset');
  }

  if (hereRateLimit.dailyCalls >= hereRateLimit.DAILY_LIMIT) {
    return false; // Over limit
  }

  hereRateLimit.dailyCalls++;
  return true;
}

// Middleware for HERE endpoints
function hereRateLimitMiddleware(req, res, next) {
  if (!checkHereRateLimit()) {
    console.warn(`⚠️ HERE daily limit reached (${hereRateLimit.dailyCalls}/${hereRateLimit.DAILY_LIMIT})`);
    return res.status(429).json({
      error: 'Daily HERE API limit reached. Try again tomorrow.',
      dailyCalls: hereRateLimit.dailyCalls,
      limit: hereRateLimit.DAILY_LIMIT
    });
  }
  next();
}

// Check HERE usage stats
app.get('/api/proxy/here/usage', (req, res) => {
  const msUntilReset = (24 * 60 * 60 * 1000) - (Date.now() - hereRateLimit.lastReset);
  const hoursUntilReset = Math.round(msUntilReset / (60 * 60 * 1000) * 10) / 10;

  res.json({
    dailyCalls: hereRateLimit.dailyCalls,
    limit: hereRateLimit.DAILY_LIMIT,
    remaining: hereRateLimit.DAILY_LIMIT - hereRateLimit.dailyCalls,
    hoursUntilReset
  });
});

// =================================================================
// HERE GEOCODING PROXY - 250k free/month, great for business names
// =================================================================
app.get('/api/proxy/here/geocode', hereRateLimitMiddleware, async (req, res) => {
  const { query } = req.query;

  if (!query || query.length < 2) {
    return res.status(400).json({ error: 'Query too short' });
  }

  const hereApiKey = process.env.HERE_API_KEY;
  if (!hereApiKey) {
    console.error('❌ HERE_API_KEY not configured');
    return res.status(500).json({ error: 'HERE geocoding not configured' });
  }

  const sanitized = query.replace(/[<>"']/g, '').substring(0, 100);

  try {
    // HERE Discover API - great for POIs (Trader Joe's, etc.)
    // at= biases results toward NYC
    const url = `https://discover.search.hereapi.com/v1/discover?q=${encodeURIComponent(sanitized)}&at=40.7128,-74.0060&limit=5&apiKey=${hereApiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('❌ HERE error:', data.error);
      return res.status(500).json({ error: 'Geocoding failed' });
    }

    const results = (data.items || []).map(item => ({
      name: item.title,
      address: item.address?.label || '',
      lat: item.position?.lat,
      lng: item.position?.lng
    }));

    console.log(`✅ HERE geocoded "${sanitized}" -> ${results.length} results`);
    res.json({ results });

  } catch (error) {
    console.error('❌ HERE geocode error:', error);
    res.status(500).json({ error: 'Geocoding failed' });
  }
});

// =================================================================
// HERE WALKING ROUTE PROXY - Accurate pedestrian times
// =================================================================
app.get('/api/proxy/here/walk', hereRateLimitMiddleware, async (req, res) => {
  const { originLat, originLng, destLat, destLng } = req.query;

  if (!originLat || !originLng || !destLat || !destLng) {
    return res.status(400).json({ error: 'Missing coordinates' });
  }

  const hereApiKey = process.env.HERE_API_KEY;
  if (!hereApiKey) {
    console.error('❌ HERE_API_KEY not configured');
    return res.status(500).json({ error: 'HERE routing not configured' });
  }

  try {
    const url = `https://router.hereapi.com/v8/routes?transportMode=pedestrian&origin=${originLat},${originLng}&destination=${destLat},${destLng}&return=summary&apiKey=${hereApiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error || !data.routes?.length) {
      console.error('❌ HERE routing error:', data.error || 'No routes found');
      return res.status(500).json({ error: 'Routing failed' });
    }

    const route = data.routes[0].sections[0].summary;
    const result = {
      durationSeconds: route.duration,
      durationMins: Math.round(route.duration / 60),
      distanceMeters: route.length,
      distanceMiles: Math.round(route.length / 1609.34 * 100) / 100
    };

    console.log(`✅ HERE walk: ${result.durationMins} min, ${result.distanceMiles} mi`);
    res.json(result);

  } catch (error) {
    console.error('❌ HERE walk error:', error);
    res.status(500).json({ error: 'Walking route failed' });
  }
});

// =================================================================
// HERE BATCH WALKING - Multiple destinations at once
// =================================================================
app.post('/api/proxy/here/walk-batch', async (req, res) => {
  const { originLat, originLng, destinations } = req.body;

  if (!originLat || !originLng || !destinations?.length) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  // Check if we have enough quota for all destinations
  const remaining = hereRateLimit.DAILY_LIMIT - hereRateLimit.dailyCalls;
  if (destinations.length > remaining) {
    console.warn(`⚠️ HERE batch rejected: need ${destinations.length}, only ${remaining} remaining`);
    return res.status(429).json({
      error: `Daily limit: only ${remaining} calls remaining, need ${destinations.length}`,
      remaining,
      requested: destinations.length
    });
  }

  // Reserve the calls upfront
  hereRateLimit.dailyCalls += destinations.length;

  const hereApiKey = process.env.HERE_API_KEY;
  if (!hereApiKey) {
    console.error('❌ HERE_API_KEY not configured');
    return res.status(500).json({ error: 'HERE routing not configured' });
  }

  try {
    // Fetch all routes in parallel (up to 10 at a time to be safe)
    const batchSize = 10;
    const results = [];

    for (let i = 0; i < destinations.length; i += batchSize) {
      const batch = destinations.slice(i, i + batchSize);
      const promises = batch.map(async (dest) => {
        try {
          const url = `https://router.hereapi.com/v8/routes?transportMode=pedestrian&origin=${originLat},${originLng}&destination=${dest.lat},${dest.lng}&return=summary&apiKey=${hereApiKey}`;
          const response = await fetch(url);
          const data = await response.json();

          if (data.routes?.length) {
            const summary = data.routes[0].sections[0].summary;
            return {
              id: dest.id,
              durationMins: Math.round(summary.duration / 60),
              distanceMiles: Math.round(summary.length / 1609.34 * 100) / 100
            };
          }
          return { id: dest.id, durationMins: null, error: 'No route' };
        } catch (e) {
          return { id: dest.id, durationMins: null, error: e.message };
        }
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    console.log(`✅ HERE batch walk: ${results.length} routes calculated`);
    res.json({ results });

  } catch (error) {
    console.error('❌ HERE batch walk error:', error);
    res.status(500).json({ error: 'Batch routing failed' });
  }
});

// Helper: Fetch arrivals for a line/station (internal use)
async function getArrivalsForLine(line, stopId) {
  try {
    const lineUpper = line.toUpperCase();
    const feedSuffix = MTA_FEED_MAP[lineUpper];
    if (!feedSuffix) return [];

    // Check cache
    if (mtaCache.feeds[lineUpper]?.data &&
        Date.now() - mtaCache.feeds[lineUpper].timestamp < MTA_CACHE_TTL.feed) {
      return extractArrivals(mtaCache.feeds[lineUpper].data, stopId);
    }

    // Fetch fresh data
    const feedUrl = `${MTA_BASE}/${feedSuffix}`;
    const response = await fetch(feedUrl);
    if (!response.ok) return [];

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    mtaCache.feeds[lineUpper] = { data: feed, timestamp: Date.now() };

    return extractArrivals(feed, stopId);
  } catch (e) {
    return [];
  }
}

// Helper: Find which lines have real-time service at a station in a specific direction
async function getLinesWithService(lines, stopId, neededDirection = null) {
  const linesWithService = [];
  for (const line of lines) {
    const arrivals = await getArrivalsForLine(line, stopId);
    // Check that arrivals actually match this line (feeds are shared)
    let lineArrivals = arrivals.filter(a => a.line === line);

    // Filter by direction if specified
    if (neededDirection && lineArrivals.length > 0) {
      lineArrivals = lineArrivals.filter(a => a.direction === neededDirection);
    }

    if (lineArrivals.length > 0) {
      linesWithService.push(line);
    }
  }
  return linesWithService;
}

// Subway Routes API - with real-time validation
app.get('/api/subway/routes', async (req, res) => {
  try {
    const { userLat, userLng, venueLat, venueLng, limit = 3 } = req.query;

    if (!userLat || !userLng || !venueLat || !venueLng) {
      return res.status(400).json({ error: 'Missing required params: userLat, userLng, venueLat, venueLng' });
    }

    const routes = subwayRouter.findTopRoutes(
      parseFloat(userLat),
      parseFloat(userLng),
      parseFloat(venueLat),
      parseFloat(venueLng),
      parseInt(limit)
    );

    // Validate and correct first leg's train line using real-time data
    // Load stations data to get all lines at origin station
    const stationsData = subwayRouter.getStations ? subwayRouter.getStations() : null;

    for (const route of routes) {
      if (route.legs && route.legs.length > 0) {
        const firstLeg = route.legs.find(l => l.type === 'ride');
        if (firstLeg && route.originStationId) {
          // Get all lines at origin station from stations data
          let originLines = [firstLeg.line];
          if (stationsData && stationsData[route.originStationId]) {
            const stationNodes = stationsData[route.originStationId].nodes || [];
            // Extract unique lines from node names (e.g., "R34N_R" -> "R")
            const linesSet = new Set();
            stationNodes.forEach(node => {
              const match = node.match(/_([A-Z0-9]+)$/);
              if (match) linesSet.add(match[1]);
            });
            if (linesSet.size > 0) originLines = [...linesSet];
          }

          // Determine needed direction based on origin vs destination latitude
          // Uptown = North (higher lat), Downtown = South (lower lat)
          const originStationData = stationsData[route.originStationId];
          const originLat = originStationData?.lat || parseFloat(userLat);
          const destLat = parseFloat(venueLat);
          const neededDirection = destLat > originLat ? 'Uptown' : 'Downtown';

          // Check which lines actually have real-time service IN THE NEEDED DIRECTION
          const linesWithService = await getLinesWithService(originLines, route.originStationId, neededDirection);

          console.log(`🔍 Origin ${route.originStation} (${route.originStationId}): lines=${originLines.join(',')}, direction=${neededDirection}, withService=${linesWithService.join(',')}, firstLeg=${firstLeg.line}`);

          if (linesWithService.length > 0 && !linesWithService.includes(firstLeg.line)) {
            // Replace first leg's line with one that has actual service
            const oldLine = firstLeg.line;
            firstLeg.line = linesWithService[0];
            route.realTimeValidated = true;

            console.log(`✅ Route validated: ${oldLine} → ${firstLeg.line} at ${route.originStation}`);
          }
        }
      }
    }

    res.json({ routes });
  } catch (error) {
    console.error('Subway routing error:', error);
    res.status(500).json({ error: 'Routing failed' });
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
