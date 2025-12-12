// server.js
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// MongoDB Connection
const mongoose = require('mongoose');
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
  'St. Mark\'s Comedy Club': { lat: 40.729, lng: -73.989 },
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

// Load mics from JSON file as fallback
let micsJsonData = null;
try {
  micsJsonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'mics.json'), 'utf-8'));
  console.log(`📋 Loaded ${micsJsonData.length} mics from mics.json as fallback`);
} catch (e) {
  console.warn('⚠️ Could not load mics.json fallback');
}

// Main endpoint: Fetch open mic data from MongoDB (with Redis caching)
app.get('/api/v1/mics', cacheMiddleware, async (req, res) => {
  try {
    // Extract query parameters for filtering
    const { day, borough, neighborhood, cost, sort } = req.query;

    let mics;

    // Try MongoDB first, fallback to JSON file
    if (mongoose.connection.readyState === 1) {
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
        micsQuery = micsQuery.sort({ day: 1, startTime: 1 });
      } else {
        micsQuery = micsQuery.sort({ day: 1, startTime: 1 });
      }

      mics = await micsQuery;
      console.log(`✅ Loaded ${mics.length} mics from MongoDB`);
    } else if (micsJsonData) {
      // Fallback to JSON file
      mics = micsJsonData;

      // Apply filters manually
      if (day) mics = mics.filter(m => m.day === day);
      if (borough) mics = mics.filter(m => m.borough === borough);
      if (neighborhood) mics = mics.filter(m => m.neighborhood === neighborhood);
      if (cost) {
        if (cost.toLowerCase() === 'free') {
          mics = mics.filter(m => m.cost?.toLowerCase() === 'free');
        } else {
          mics = mics.filter(m => m.cost === cost);
        }
      }

      console.log(`✅ Loaded ${mics.length} mics from JSON fallback`);
    } else {
      throw new Error('No data source available');
    }

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
  '7': 'nyct%2Fgtfs'  // 7 train is in the main feed, not a separate gtfs-7
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
      const arrivals = extractArrivals(mtaCache.feeds[lineUpper].data, stopId, lineUpper);
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

    const arrivals = extractArrivals(feed, stopId, lineUpper);
    console.log(`✅ MTA arrivals for ${lineUpper}/${stopId}: ${arrivals.length} trains`);
    res.json(arrivals);

  } catch (error) {
    console.error('❌ MTA arrivals error:', error.message);
    res.json([]);
  }
});

// Parse destination from MTA tripId format
// Format: "057250_F..S78R" where S/N indicates direction
function parseDestinationFromTripId(tripId, routeId) {
  if (!tripId || !routeId) return '';

  // Determine direction from tripId (..N = northbound, ..S = southbound)
  const isNorthbound = tripId.includes('..N');
  const isSouthbound = tripId.includes('..S');

  // Line terminals - [northbound terminal, southbound terminal]
  const lineTerminals = {
    'F': ['Jamaica-179 St', 'Coney Island-Stillwell Av'],
    'M': ['Forest Hills-71 Av', 'Middle Village-Metropolitan Av'],
    'E': ['Jamaica Center', 'World Trade Center'],
    'A': ['Inwood-207 St', 'Far Rockaway / Lefferts Blvd'],
    'C': ['168 St', 'Euclid Av'],
    'B': ['Bedford Park Blvd', 'Brighton Beach'],
    'D': ['Norwood-205 St', 'Coney Island-Stillwell Av'],
    'N': ['Astoria-Ditmars Blvd', 'Coney Island-Stillwell Av'],
    'W': ['Astoria-Ditmars Blvd', 'Whitehall St-South Ferry'],
    'Q': ['96 St', 'Coney Island-Stillwell Av'],
    'R': ['Forest Hills-71 Av', 'Bay Ridge-95 St'],
    'L': ['8 Av', 'Canarsie-Rockaway Pkwy'],
    'G': ['Court Sq', 'Church Av'],
    'J': ['Jamaica Center', 'Broad St'],
    'Z': ['Jamaica Center', 'Broad St'],
    '1': ['Van Cortlandt Park-242 St', 'South Ferry'],
    '2': ['Wakefield-241 St', 'Flatbush Av-Brooklyn College'],
    '3': ['Harlem-148 St', 'New Lots Av'],
    '4': ['Woodlawn', 'Crown Hts-Utica Av'],
    '5': ['Eastchester-Dyre Av', 'Flatbush Av-Brooklyn College'],
    '6': ['Pelham Bay Park', 'Brooklyn Bridge-City Hall'],
    '7': ['Flushing-Main St', '34 St-Hudson Yards'],
    'S': ['Times Sq-42 St', 'Grand Central-42 St'],
  };

  const line = routeId.replace(/X$/, '');
  const terminals = lineTerminals[line];
  if (!terminals) return '';

  if (isNorthbound) return terminals[0];
  if (isSouthbound) return terminals[1];
  return '';
}

function extractArrivals(feed, stopId, requestedLine) {
  const now = Date.now() / 1000;
  const arrivals = [];
  const seenTrips = new Set();

  // Lines that don't run north-south (custom direction labels)
  const customDirections = {
    'L': { N: 'Manhattan', S: 'Brooklyn' },
    'G': { N: 'Queens', S: 'Brooklyn' },
    'J': { N: 'Jamaica', S: 'Manhattan' },
    'Z': { N: 'Jamaica', S: 'Manhattan' },
    'M': { N: 'Queens', S: 'Queens' },
    'S': { N: 'Times Sq', S: 'Grand Central' }
  };

  feed.entity.forEach(entity => {
    if (entity.tripUpdate) {
      const trip = entity.tripUpdate.trip;

      // Normalize line (6X → 6, 7X → 7, FX → F)
      const line = (trip.routeId || '').replace(/X$/, '');

      // Filter by requested line
      if (requestedLine && line !== requestedLine.replace(/X$/, '')) {
        return;
      }

      // Deduplicate by tripId
      const tripId = trip.tripId;
      if (seenTrips.has(tripId)) return;
      seenTrips.add(tripId);

      // Extract destination from headsign or tripId
      const destination = trip.tripHeadsign || parseDestinationFromTripId(tripId, trip.routeId) || '';

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
              if (customDirections[line]) {
                direction = customDirections[line][suffix] || (suffix === 'N' ? 'Uptown' : 'Downtown');
              } else {
                direction = suffix === 'N' ? 'Uptown' : 'Downtown';
              }
              arrivals.push({
                line,
                direction,
                destination,
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

  // Normalize MTA direction labels to Uptown/Downtown
  const isUptownDirection = (dir) => {
    if (!dir) return false;
    const d = dir.toLowerCase();
    return d === 'uptown' || d === 'manhattan' || d === 'queens' || d === 'bronx';
  };
  const isDowntownDirection = (dir) => {
    if (!dir) return false;
    const d = dir.toLowerCase();
    return d === 'downtown' || d === 'brooklyn';
  };

  for (const line of lines) {
    const arrivals = await getArrivalsForLine(line, stopId);
    // Check that arrivals actually match this line (feeds are shared)
    let lineArrivals = arrivals.filter(a => a.line === line);

    // Filter by direction if specified (with normalized matching)
    if (neededDirection && lineArrivals.length > 0) {
      if (neededDirection === 'Uptown') {
        lineArrivals = lineArrivals.filter(a => isUptownDirection(a.direction));
      } else if (neededDirection === 'Downtown') {
        lineArrivals = lineArrivals.filter(a => isDowntownDirection(a.direction));
      }
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

    // Fetch more routes than requested, then filter by real-time validation
    // This ensures we find valid alternatives when E/F/M don't run at certain times
    const fetchLimit = Math.max(parseInt(limit) * 4, 10);
    const routes = subwayRouter.findTopRoutes(
      parseFloat(userLat),
      parseFloat(userLng),
      parseFloat(venueLat),
      parseFloat(venueLng),
      fetchLimit
    );

    // Schedule awareness - NYC timezone
    const nycDate = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const nycHour = new Date(nycDate).getHours();
    const nycDay = new Date(nycDate).getDay(); // 0=Sun, 6=Sat
    const isLateNight = nycHour >= 0 && nycHour < 6;
    const isWeekend = nycDay === 0 || nycDay === 6;
    const isRushHour = !isWeekend && ((nycHour >= 7 && nycHour <= 9) || (nycHour >= 17 && nycHour <= 19));

    // Late night: swap lines that don't run
    const lateNightSwaps = { 'B': 'D', 'W': 'N', 'Z': 'J' };

    // Rush hour only lines - will be filtered by real-time validation if not running
    const rushHourOnlyLines = ['Z', '7X', '6X'];

    if (isLateNight) {
      for (const route of routes) {
        for (const leg of (route.legs || [])) {
          if (leg.line && lateNightSwaps[leg.line]) {
            const oldLine = leg.line;
            leg.line = lateNightSwaps[leg.line];
            console.log(`🌙 Late night: swapped ${oldLine} → ${leg.line}`);
          }
        }
        // Update route.lines array too
        if (route.lines) {
          route.lines = route.lines.map(l => lateNightSwaps[l] || l);
        }
      }
    }

    // Validate ALL ride legs against real-time MTA data
    // Routes where trains aren't running are filtered out
    const stationsData = subwayRouter.getStations ? subwayRouter.getStations() : null;
    const validatedRoutes = [];

    for (const route of routes) {
      if (!route.legs || route.legs.length === 0) {
        validatedRoutes.push(route);
        continue;
      }

      let routeValid = true;
      const rideLegs = route.legs.filter(l => l.type === 'ride');

      for (let i = 0; i < rideLegs.length; i++) {
        const leg = rideLegs[i];
        const fromStationId = leg.fromId;
        const toStationId = leg.toId;

        if (!fromStationId || !toStationId) continue;

        // Determine direction for this leg
        const fromStation = stationsData?.[fromStationId];
        const toStation = stationsData?.[toStationId];
        let neededDirection = null;
        if (fromStation?.lat && toStation?.lat) {
          neededDirection = toStation.lat > fromStation.lat ? 'Uptown' : 'Downtown';
        }

        // Check if this line has real-time service at BOTH origin AND destination
        // First try with direction filter, then try without (MTA feed direction can be delayed)
        let serviceAtOrigin = await getLinesWithService([leg.line], fromStationId, neededDirection);
        if (serviceAtOrigin.length === 0) {
          // Fallback: check if line has ANY service at origin (direction might not be in feed yet)
          serviceAtOrigin = await getLinesWithService([leg.line], fromStationId, null);
        }
        const serviceAtDest = await getLinesWithService([leg.line], toStationId, null);

        const hasService = serviceAtOrigin.length > 0 && serviceAtDest.length > 0;

        if (!hasService) {
          // No service on this line - try to find alternative
          // Get lines that serve BOTH stations
          const originNodes = stationsData?.[fromStationId]?.nodes || [];
          const destNodes = stationsData?.[toStationId]?.nodes || [];

          const originLines = new Set(originNodes.map(n => n.match(/_([A-Z0-9]+)$/)?.[1]).filter(Boolean));
          const destLines = new Set(destNodes.map(n => n.match(/_([A-Z0-9]+)$/)?.[1]).filter(Boolean));

          // Lines that exist at both stations
          const commonLines = [...originLines].filter(l => destLines.has(l));

          // Check which common lines have actual service
          const alternativesAtOrigin = await getLinesWithService(commonLines, fromStationId, neededDirection);
          const validAlternatives = [];
          for (const altLine of alternativesAtOrigin) {
            const altAtDest = await getLinesWithService([altLine], toStationId, null);
            if (altAtDest.length > 0) {
              validAlternatives.push(altLine);
            }
          }

          if (validAlternatives.length > 0) {
            // Found alternative - swap line
            const oldLine = leg.line;
            leg.line = validAlternatives[0];
            route.realTimeValidated = true;
            console.log(`✅ Leg ${i + 1} validated: ${oldLine} → ${leg.line} at ${leg.from}`);
          } else {
            // No alternatives - mark route invalid
            routeValid = false;
            console.log(`❌ No service for ${leg.line} from ${leg.from} to ${leg.to} - route invalid`);
            break;
          }
        }
      }

      if (routeValid) {
        // Sync transfer fromLine/toLine with validated ride legs
        const legs = route.legs || [];
        for (let i = 0; i < legs.length; i++) {
          if (legs[i].type === 'transfer') {
            // Find previous ride leg
            let prevRide = null;
            for (let j = i - 1; j >= 0; j--) {
              if (legs[j].type === 'ride') { prevRide = legs[j]; break; }
            }
            // Find next ride leg
            let nextRide = null;
            for (let j = i + 1; j < legs.length; j++) {
              if (legs[j].type === 'ride') { nextRide = legs[j]; break; }
            }

            if (prevRide) legs[i].fromLine = prevRide.line;
            if (nextRide) legs[i].toLine = nextRide.line;
          }
        }

        // Remove unnecessary transfers (same line) and merge rides
        route.legs = legs.filter((leg, i) => {
          if (leg.type === 'transfer' && leg.fromLine === leg.toLine) {
            console.log(`🗑️ Removing unnecessary transfer at ${leg.at}: ${leg.fromLine}→${leg.toLine}`);
            return false;
          }
          return true;
        });

        // Clean up altLines - remove main line from its own altLines (after validation swaps)
        for (const leg of route.legs) {
          if (leg.type === 'ride' && leg.altLines) {
            leg.altLines = leg.altLines.filter(alt => alt !== leg.line);
            if (leg.altLines.length === 0) delete leg.altLines;
          }
        }

        // Rebuild lines array from validated legs
        route.lines = route.legs.filter(l => l.type === 'ride').map(l => l.line);
        validatedRoutes.push(route);
      }
    }

    // Fetch alerts to attach to routes
    let alerts = [];
    try {
      if (mtaCache.alerts.data && Date.now() - mtaCache.alerts.timestamp < MTA_CACHE_TTL.alerts) {
        alerts = mtaCache.alerts.data;
      } else {
        const alertRes = await fetch(MTA_ALERTS_URL);
        if (alertRes.ok) {
          const buffer = await alertRes.arrayBuffer();
          const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
          alerts = [];
          feed.entity.forEach(entity => {
            if (entity.alert && entity.alert.headerText) {
              const alert = entity.alert;
              const lines = [];
              alert.informedEntity?.forEach(ie => {
                if (ie.routeId) lines.push(ie.routeId);
              });
              const text = alert.headerText?.translation?.[0]?.text || '';
              if (lines.length > 0 && text) {
                alerts.push({ lines, text, type: 'warning' });
              }
            }
          });
          mtaCache.alerts = { data: alerts, timestamp: Date.now() };
        }
      }
    } catch (e) {
      console.error('Failed to fetch alerts for routing:', e.message);
    }

    // Attach relevant alerts to each route
    for (const route of validatedRoutes) {
      const routeLines = new Set(route.lines || []);
      const relevantAlerts = alerts.filter(a =>
        a.lines.some(line => routeLines.has(line) || routeLines.has(line.replace(/X$/, '')))
      );
      if (relevantAlerts.length > 0) {
        route.alerts = relevantAlerts.map(a => ({
          lines: a.lines.filter(l => routeLines.has(l) || routeLines.has(l.replace(/X$/, ''))),
          text: a.text
        }));
      }
    }

    // Return only the requested number of routes (sorted by time)
    const finalRoutes = validatedRoutes
      .sort((a, b) => a.totalTime - b.totalTime)
      .slice(0, parseInt(limit));

    // Add schedule context to response
    const scheduleInfo = {
      isLateNight,
      isWeekend,
      isRushHour,
      note: isLateNight ? 'Late night service (B/W/Z not running)' :
            isWeekend ? 'Weekend service (some express trains run local)' : null
    };

    res.json({ routes: finalRoutes, schedule: scheduleInfo });
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
