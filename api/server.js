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

// Slotted.co signup scraper
const { getSlottedData, startSlottedRefresh } = require('./services/slotted');

// Logging
const { requestLoggingMiddleware } = require('./middleware/logging');
const logger = require('./utils/logger');

// Subway Router
let subwayRouter = null;
try {
  // Try local scripts folder first (production), then parent folder (development)
  subwayRouter = require('./scripts/subway-router');
  console.log('✅ Subway router loaded successfully');
} catch (e1) {
  try {
    subwayRouter = require('../scripts/subway-router');
    console.log('✅ Subway router loaded successfully');
  } catch (e2) {
    console.warn('⚠️ Subway router not available');
  }
}

// Load GTFS departure index for scheduled wait times (fallback when real-time unavailable)
let departureIndex = {};
try {
  // In production, files are in ./public/data; in development, ../public/data
  const indexPath = process.env.NODE_ENV === 'production'
    ? path.join(__dirname, 'public', 'data', 'departure-index.json')
    : path.join(__dirname, '..', 'public', 'data', 'departure-index.json');
  if (fs.existsSync(indexPath)) {
    departureIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    console.log(`📊 Loaded GTFS departures for ${Object.keys(departureIndex).length} stops`);
  }
} catch (e) {
  console.warn('⚠️ Could not load departure-index.json:', e.message);
}

// MTA real-time only reports arrivals up to 30 mins away.
// Skip real-time when transfer is beyond this horizon.
const REALTIME_HORIZON_MINS = 25;

// Helper: fetch with timeout (10s default)
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// Get next scheduled departure from GTFS (returns wait time in minutes)
function getScheduledWait(stopId, line, arrivalMins) {
  // arrivalMins = minutes from midnight when user arrives at platform
  const stopDepartures = departureIndex[stopId];
  if (!stopDepartures) return null;

  const lineDepartures = stopDepartures[line.toUpperCase()];
  if (!lineDepartures || lineDepartures.length === 0) return null;

  // Binary search for next departure after arrivalMins
  let left = 0, right = lineDepartures.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (lineDepartures[mid] < arrivalMins) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  // Check if we found a valid departure
  if (lineDepartures[left] >= arrivalMins) {
    return lineDepartures[left] - arrivalMins;
  }

  // Wrap to next day (first departure)
  return lineDepartures[0] + (24 * 60) - arrivalMins;
}

// Get next N scheduled departures from GTFS (returns array of minutes from midnight)
function getScheduledDepartures(stopId, line, arrivalMins, count = 3) {
  const stopDepartures = departureIndex[stopId];
  if (!stopDepartures) return null;

  const lineDepartures = stopDepartures[line.toUpperCase()];
  if (!lineDepartures || lineDepartures.length === 0) return null;

  // Binary search for first departure after arrivalMins
  let left = 0, right = lineDepartures.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (lineDepartures[mid] < arrivalMins) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  // Collect next N departures
  const departures = [];
  let idx = left;
  while (departures.length < count) {
    if (idx < lineDepartures.length && lineDepartures[idx] >= arrivalMins) {
      departures.push(lineDepartures[idx]);
    } else if (idx >= lineDepartures.length) {
      // Wrap to beginning of day
      idx = 0;
      arrivalMins = -1; // Accept all from start
      continue;
    }
    idx++;
    if (idx > lineDepartures.length + count) break; // Safety
  }

  return departures.length > 0 ? departures : null;
}

// Get N scheduled departures AT or BEFORE deadline (for on-time arrival)
// Returns latest trains that work, in ascending order
// Only considers trains within 60 mins of deadline (not morning trains for evening travel)
function getScheduledDeparturesBefore(stopId, line, deadlineMins, count = 3) {
  const stopDepartures = departureIndex[stopId];
  if (!stopDepartures) return null;

  const lineDepartures = stopDepartures[line.toUpperCase()];
  if (!lineDepartures || lineDepartures.length === 0) return null;

  // Only consider trains within 60 mins before deadline
  const minAcceptable = deadlineMins - 60;

  // Binary search for last departure AT or BEFORE deadline
  let left = 0, right = lineDepartures.length - 1;
  while (left < right) {
    const mid = Math.ceil((left + right) / 2);
    if (lineDepartures[mid] <= deadlineMins) {
      left = mid;
    } else {
      right = mid - 1;
    }
  }

  // Check if found train is within acceptable window (not morning train for evening deadline)
  if (lineDepartures[left] > deadlineMins || lineDepartures[left] < minAcceptable) {
    // No train within window - fall back to next available train after deadline
    return getScheduledDepartures(stopId, line, deadlineMins, count);
  }

  // Collect trains working backwards from deadline, within 60 min window
  const departures = [];
  let idx = left;

  while (departures.length < count && idx >= 0 && lineDepartures[idx] >= minAcceptable) {
    departures.unshift(lineDepartures[idx]);
    idx--;
  }

  // If no valid departures, fall back to next available
  if (departures.length === 0) {
    return getScheduledDepartures(stopId, line, deadlineMins, count);
  }

  return departures;
}

const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3001;

// Gzip/Brotli compression - reduces JSON payload ~70-80% for mobile
app.use(compression({ threshold: 1024 }));

// Enable CORS for all origins (restrict in production)
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Request logging with unique IDs
app.use(requestLoggingMiddleware);

// Serve static data files (stations.json, graph.json)
// In production (Railway), files are in ./public/data relative to api folder
// In development, files are in ../public/data
const dataPath = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, 'public', 'data')
  : path.join(__dirname, '..', 'public', 'data');
app.use('/data', express.static(dataPath, { maxAge: '1h' }));

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
  'St. Mark\'s Comedy Club': { lat: 40.729, lon: -73.989 },
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

// Clear cache endpoint
app.post('/admin/clear-cache', async (req, res) => {
  try {
    const { invalidateMicsCache } = require('./utils/cache-invalidation');
    const count = await invalidateMicsCache();
    res.json({ success: true, clearedKeys: count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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
// In test, we disable fallback so tests can assert Mongo failure behavior deterministically.
const allowJsonFallback = process.env.NODE_ENV !== 'test';
let micsJsonData = null;
if (allowJsonFallback) {
  try {
    micsJsonData = JSON.parse(fs.readFileSync(path.join(__dirname, 'mics.json'), 'utf-8'));
    console.log(`📋 Loaded ${micsJsonData.length} mics from mics.json as fallback`);
  } catch (e) {
    console.warn('⚠️ Could not load mics.json fallback');
  }
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

      // Execute query - exclude fields the frontend doesn't need
      let micsQuery = Mic.find(query, { location: 0, __v: 0, createdAt: 0, updatedAt: 0 }).lean();

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
    } else if (allowJsonFallback && micsJsonData) {
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

      // Sort the filtered results (same as MongoDB path)
      mics = mics.sort((a, b) => {
        // First sort by day
        if (a.day !== b.day) {
          const dayOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          return dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day);
        }

        // Then sort by time (parse time string to compare correctly)
        const parseTimeValue = (timeStr) => {
          const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
          if (!match) return 0;
          let hours = parseInt(match[1]);
          const mins = parseInt(match[2]);
          const period = match[3].toUpperCase();
          if (period === 'PM' && hours !== 12) hours += 12;
          if (period === 'AM' && hours === 12) hours = 0;
          return hours * 60 + mins; // Convert to minutes since midnight
        };

        const aTime = parseTimeValue(a.startTime);
        const bTime = parseTimeValue(b.startTime);
        return aTime - bTime;
      });

      console.log(`✅ Loaded ${mics.length} mics from JSON fallback`);
    } else {
      throw new Error('MongoDB not connected');
    }

    // Allow browser to cache for 5 min, CDN for 10 min
    res.set('Cache-Control', 'public, max-age=300, s-maxage=600');

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
    const response = await fetchWithTimeout(url, {}, 10000);
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

    // Fetch from MTA with timeout
    const response = await fetchWithTimeout(MTA_ALERTS_URL, {}, 10000);
    if (!response.ok) throw new Error(`MTA status: ${response.status}`);

    // Decode Protobuf
    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

    // Parse alerts - only include currently active ones
    const alerts = [];
    const now = Math.floor(Date.now() / 1000); // Current time in seconds

    feed.entity.forEach(entity => {
      if (entity.alert && entity.alert.headerText) {
        const alert = entity.alert;

        // Check if alert is currently active
        const activePeriods = alert.activePeriod || [];
        let isActive = activePeriods.length === 0; // No period = always active

        for (const period of activePeriods) {
          const start = period.start ? Number(period.start) : 0;
          const end = period.end ? Number(period.end) : Infinity;
          if (now >= start && now <= end) {
            isActive = true;
            break;
          }
        }

        if (!isActive) return; // Skip alerts not currently active

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

    // Fetch fresh data with timeout
    const feedUrl = `${MTA_BASE}/${feedSuffix}`;
    const response = await fetchWithTimeout(feedUrl, {}, 10000);
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
// GTFS DEPARTURES - Get scheduled departures for a station/line/time
// =================================================================
app.get('/api/gtfs/departures', (req, res) => {
  const { stopId, line, time } = req.query;

  if (!stopId || !line) {
    return res.status(400).json({ error: 'stopId and line required' });
  }

  // Parse time - accepts minutes from midnight or ISO string
  let arrivalMins;
  if (time) {
    if (time.includes('T') || time.includes(':')) {
      // ISO string or time string - convert to NYC minutes from midnight
      const d = new Date(time);
      const nycTime = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      arrivalMins = nycTime.getHours() * 60 + nycTime.getMinutes();
    } else {
      arrivalMins = parseInt(time, 10);
    }
  } else {
    // Default to current NYC time
    const now = new Date();
    const nycNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    arrivalMins = nycNow.getHours() * 60 + nycNow.getMinutes();
  }

  const departures = getScheduledDepartures(stopId, line, arrivalMins, 3);

  if (!departures || departures.length === 0) {
    return res.json({ departures: [] });
  }

  // Convert minutes from midnight to ISO timestamps for today
  const now = new Date();
  const nycDateStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const [month, day, year] = nycDateStr.split('/').map(Number);

  // NYC timezone offset (EST = +5, EDT = +4)
  const isJanOrFeb = month <= 2;
  const isNovOrDec = month >= 11;
  const isDST = !isJanOrFeb && !isNovOrDec;
  const nycOffsetHours = isDST ? 4 : 5;

  const isoTimes = departures.map(mins => {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    const utcDate = new Date(Date.UTC(year, month - 1, day, hours + nycOffsetHours, minutes, 0));
    return utcDate.toISOString();
  });

  res.json({ departures: isoTimes });
});

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

    const response = await fetchWithTimeout(url, {}, 10000);
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

    const response = await fetchWithTimeout(url, {}, 10000);
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

    const response = await fetchWithTimeout(url, {}, 10000);
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

  const hereApiKey = process.env.HERE_API_KEY;
  if (!hereApiKey) {
    console.error('❌ HERE_API_KEY not configured');
    return res.status(500).json({ error: 'HERE routing not configured' });
  }

  try {
    // Fetch all routes in parallel (up to 10 at a time to be safe)
    const batchSize = 10;
    const results = [];
    let successCount = 0;

    for (let i = 0; i < destinations.length; i += batchSize) {
      const batch = destinations.slice(i, i + batchSize);
      const promises = batch.map(async (dest) => {
        try {
          const url = `https://router.hereapi.com/v8/routes?transportMode=pedestrian&origin=${originLat},${originLng}&destination=${dest.lat},${dest.lng}&return=summary&apiKey=${hereApiKey}`;
          const response = await fetchWithTimeout(url, {}, 10000);
          const data = await response.json();

          if (data.routes?.length) {
            const summary = data.routes[0].sections[0].summary;
            successCount++;
            return {
              id: dest.id,
              durationMins: Math.round(summary.duration / 60),
              distanceMiles: Math.round(summary.length / 1609.34 * 100) / 100
            };
          }
          // No route found but API worked - still count as call
          successCount++;
          return { id: dest.id, durationMins: null, error: 'No route' };
        } catch (e) {
          // API call failed - don't count toward quota
          return { id: dest.id, durationMins: null, error: e.message };
        }
      });

      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    // Only count successful API calls toward quota
    hereRateLimit.dailyCalls += successCount;

    console.log(`✅ HERE batch walk: ${successCount}/${results.length} routes calculated`);
    res.json({ results, successCount });

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
      return extractArrivals(mtaCache.feeds[lineUpper].data, stopId, lineUpper);
    }

    // Fetch fresh data with timeout
    const feedUrl = `${MTA_BASE}/${feedSuffix}`;
    const response = await fetchWithTimeout(feedUrl, {}, 10000);
    if (!response.ok) return [];

    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    mtaCache.feeds[lineUpper] = { data: feed, timestamp: Date.now() };

    return extractArrivals(feed, stopId, lineUpper);
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

// Helper: Find nearby stations within radius (in miles)
function findNearbyStations(lat, lng, radiusMiles, stationsData, excludeStationIds = []) {
  const nearbyStations = [];
  const radiusKm = radiusMiles * 1.60934;

  for (const [stationId, station] of Object.entries(stationsData || {})) {
    if (excludeStationIds.includes(stationId)) continue;
    if (!station.lat || !station.lng) continue;

    // Haversine distance
    const R = 6371; // Earth radius in km
    const dLat = (station.lat - lat) * Math.PI / 180;
    const dLng = (station.lng - lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat * Math.PI / 180) * Math.cos(station.lat * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distKm = R * c;

    if (distKm <= radiusKm) {
      nearbyStations.push({
        stationId,
        name: station.name,
        lat: station.lat,
        lng: station.lng,
        distMiles: distKm / 1.60934
      });
    }
  }

  return nearbyStations.sort((a, b) => a.distMiles - b.distMiles);
}

// Subway Routes API - with real-time validation
app.get('/api/subway/routes', async (req, res) => {
  try {
    const { userLat, userLng, venueLat, venueLng, limit = 3, targetArrival } = req.query;

    if (!userLat || !userLng || !venueLat || !venueLng) {
      return res.status(400).json({ error: 'Missing required params: userLat, userLng, venueLat, venueLng' });
    }

    // Fetch more routes than requested, then filter by real-time validation
    // This ensures we find valid alternatives when E/F/M don't run at certain times
    const fetchLimit = Math.max(parseInt(limit) * 4, 10);
    const routes = await subwayRouter.findTopRoutes(
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
    const nowMins = nycHour * 60 + new Date(nycDate).getMinutes();

    // Calculate base time for schedule lookups (schedule-based vs real-time)
    let baseMins; // Minutes from midnight for GTFS lookups
    let useRealtimeData = true;
    let targetDate = null;
    let scheduleHour = nycHour; // Hour to use for schedule awareness (late night, rush hour)
    let scheduleDay = nycDay;

    if (targetArrival) {
      targetDate = new Date(targetArrival);
      if (!isNaN(targetDate.getTime())) {
        // Convert target to NYC timezone
        const targetNyc = new Date(targetDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        baseMins = targetNyc.getHours() * 60 + targetNyc.getMinutes();
        scheduleHour = targetNyc.getHours();
        scheduleDay = targetNyc.getDay();
        // Use real-time MTA data only when target is < 30 min away
        // (MTA real-time feed only shows ~30 min of departures)
        const timeTillTarget = baseMins - nowMins;
        useRealtimeData = timeTillTarget < 30 && timeTillTarget >= 0;
        console.log(`📅 Target arrival: ${targetArrival}, baseMins: ${baseMins}, nowMins: ${nowMins}, scheduleHour: ${scheduleHour}, useRealtime: ${useRealtimeData}`);
      }
    } else {
      baseMins = nowMins;
    }

    // Use target time (not current time) for schedule awareness
    const isLateNight = scheduleHour >= 0 && scheduleHour < 6;
    const isWeekend = scheduleDay === 0 || scheduleDay === 6;
    const isRushHour = !isWeekend && ((scheduleHour >= 7 && scheduleHour <= 9) || (scheduleHour >= 17 && scheduleHour <= 19));

    // Late night: swap lines that don't run (midnight - 6am)
    const lateNightSwaps = {
      'B': 'D',    // B doesn't run late night
      'W': 'N',    // W doesn't run late night
      'Z': 'J',    // Z doesn't run late night
      '7X': '7',   // Express doesn't run late night
      '6X': '6',   // Express doesn't run late night
      '5X': '5',   // Express doesn't run
    };

    // Rush hour only lines - will be filtered by real-time validation if not running
    const rushHourOnlyLines = ['Z', '7X', '6X', '5X'];

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
      // Skip routes with no legs - these aren't valid transit routes
      if (!route.legs || route.legs.length === 0) {
        continue;
      }

      // Skip routes with no ride legs (only transfers)
      const hasRideLegs = route.legs.some(l => l.type === 'ride');
      if (!hasRideLegs) {
        continue;
      }

      let routeValid = true;
      const rideLegs = route.legs.filter(l => l.type === 'ride');

      for (let i = 0; i < rideLegs.length; i++) {
        const leg = rideLegs[i];
        const fromStationId = leg.fromId;
        const toStationId = leg.toId;

        if (!fromStationId || !toStationId) continue;

        // Determine direction from Dijkstra path nodes (already correct)
        // Path nodes like "M18N_M" encode direction: N=northbound, S=southbound
        // This is more reliable than latitude comparison, which fails for lines
        // like J/M/Z where "North" (toward Jamaica) goes geographically south
        // through Brooklyn
        let pathDirection = null;
        for (const node of route.path) {
          const [stopPart, nodeLine] = node.split('_');
          const baseStop = stopPart.replace(/[NS]$/, '');
          if (baseStop === fromStationId && nodeLine === leg.line) {
            pathDirection = stopPart.endsWith('N') ? 'N' : 'S';
            break;
          }
        }

        // Use directional stop IDs from path (bypasses MTA direction label issues)
        const originDirStop = pathDirection ? fromStationId + pathDirection : fromStationId;
        const destDirStop = pathDirection ? toStationId + pathDirection : toStationId;

        // Check if this line has real-time service at BOTH origin AND destination
        const serviceAtOrigin = await getLinesWithService([leg.line], originDirStop, null);
        const serviceAtDest = await getLinesWithService([leg.line], destDirStop, null);

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
          const alternativesAtOrigin = await getLinesWithService(commonLines, originDirStop, null);
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
        const alertRes = await fetchWithTimeout(MTA_ALERTS_URL, {}, 10000);
        if (alertRes.ok) {
          const buffer = await alertRes.arrayBuffer();
          const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
          alerts = [];
          const now = Math.floor(Date.now() / 1000);
          feed.entity.forEach(entity => {
            if (entity.alert && entity.alert.headerText) {
              const alert = entity.alert;

              // Check if alert is currently active
              const activePeriods = alert.activePeriod || [];
              let isActive = activePeriods.length === 0;
              for (const period of activePeriods) {
                const start = period.start ? Number(period.start) : 0;
                const end = period.end ? Number(period.end) : Infinity;
                if (now >= start && now <= end) {
                  isActive = true;
                  break;
                }
              }
              if (!isActive) return;

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

    // Calculate wait times AFTER validation (first train + all transfers)
    console.log(`🚇 Starting wait time calculation for ${validatedRoutes.length} routes`);
    await Promise.all(validatedRoutes.map(async (route) => {
      console.log(`  Route: ${route.summary || 'no summary'}, legs: ${route.legs?.length || 0}`);
      const legs = route.legs || [];
      const rideLegs = legs.filter(l => l.type === 'ride');

      if (rideLegs.length === 0 || !route.path || route.path.length === 0) {
        console.log('  ❌ Early return - no ride legs or path');
        route.waitTime = 0;
        route.transferWaits = [];
        route.totalWaitTime = 0;
        route.adjustedTotalTime = route.totalTime;
        return;
      }

      let totalWaitTime = 0;
      const transferWaits = [];

      // 1. First train wait
      const firstLeg = rideLegs[0];
      const stopId = route.path[0].split('_')[0];
      let firstWait = 0;

      try {
        const arrivals = await getArrivalsForLine(firstLeg.line, stopId);
        if (arrivals?.length > 0) {
          const catchable = arrivals.filter(a => a.minsAway >= route.walkToStation);
          if (catchable.length > 0) {
            firstWait = Math.max(0, catchable[0].minsAway - route.walkToStation);
          }
        }
      } catch (e) { /* ignore */ }

      totalWaitTime += firstWait;
      route.waitTime = firstWait;

      // 2. Transfer waits - track cumulative time through route
      let cumulativeTime = route.walkToStation + firstWait;

      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];

        if (leg.type === 'ride') {
          cumulativeTime += leg.time;
        } else if (leg.type === 'transfer') {
          cumulativeTime += leg.time; // transfer walking time

          // Find the next ride leg to get the line we're boarding
          const nextRide = legs.slice(i + 1).find(l => l.type === 'ride');
          if (!nextRide) continue;

          // Find stop ID with direction from path for this leg
          // Match by station ID since path may have original line letters (before validation)
          let transferStopId = null;
          const nextRideFromId = nextRide.fromId;
          for (const node of route.path) {
            const [nodeStopId] = node.split('_');
            const baseStopId = nodeStopId.replace(/[NS]$/, '');
            // Check if this node matches the transfer station
            if (baseStopId === nextRideFromId) {
              transferStopId = nodeStopId;
              break;
            }
          }

          if (!transferStopId) {
            // Fallback: use the station ID with direction guess based on route
            const fromStation = stationsData?.[nextRide.fromId];
            const toStation = stationsData?.[nextRide.toId];
            let direction;
            // L line runs east-west: N=Manhattan(west), S=Canarsie(east)
            if (nextRide.line === 'L') {
              direction = (fromStation?.lng && toStation?.lng && toStation.lng < fromStation.lng) ? 'N' : 'S';
            } else {
              // Most lines run north-south
              direction = (fromStation?.lat && toStation?.lat && toStation.lat > fromStation.lat) ? 'N' : 'S';
            }
            transferStopId = nextRide.fromId + direction;
          }

          // Try real-time only if transfer is within MTA's 30-min reporting window
          // (using 25-min threshold for safety buffer)
          let foundRealtime = false;
          if (cumulativeTime <= REALTIME_HORIZON_MINS) {
            try {
              const arrivals = await getArrivalsForLine(nextRide.line, transferStopId);
              if (arrivals?.length > 0) {
                // Find first train arriving after we reach the platform
                // Both values are "minutes from NOW" so comparison is valid
                const catchable = arrivals.filter(a => a.minsAway >= cumulativeTime);
                if (catchable.length > 0) {
                  const transferWait = Math.max(0, catchable[0].minsAway - cumulativeTime);
                  totalWaitTime += transferWait;
                  transferWaits.push({
                    at: leg.at,
                    line: nextRide.line,
                    wait: transferWait,
                    estimated: false
                  });
                  cumulativeTime += transferWait;
                  foundRealtime = true;
                }
              }
            } catch (e) { /* fall through to GTFS */ }
          }

          // GTFS fallback (or planned when transfer > 25 mins away)
          if (!foundRealtime) {
            // For schedule-based: work backwards from target arrival
            // departureBase = target arrival - total route time
            const departureBaseMins = useRealtimeData ? nowMins : (baseMins - route.totalTime + 24 * 60) % (24 * 60);
            const arrivalMins = (departureBaseMins + cumulativeTime) % (24 * 60);
            const scheduledWait = getScheduledWait(transferStopId, nextRide.line, arrivalMins);
            const estimatedWait = scheduledWait !== null ? scheduledWait : 5;
            totalWaitTime += estimatedWait;
            transferWaits.push({
              at: leg.at,
              line: nextRide.line,
              wait: estimatedWait,
              estimated: true,
              source: scheduledWait !== null ? 'gtfs' : 'fallback'
            });
            cumulativeTime += estimatedWait;
          }
        }
      }

      route.transferWaits = transferWaits;
      route.totalWaitTime = totalWaitTime;
      route.adjustedTotalTime = route.totalTime + totalWaitTime;
    }));

    // Return only the requested number of routes (sorted by adjusted time with wait)
    let finalRoutes = validatedRoutes
      .sort((a, b) => (a.adjustedTotalTime || a.totalTime) - (b.adjustedTotalTime || b.totalTime))
      .slice(0, parseInt(limit));

    // RETRY: If all routes failed validation, try nearby stations within 1 mile
    if (finalRoutes.length === 0 && routes.length > 0) {
      console.log('⚠️ All routes from nearest station failed validation - trying nearby stations...');

      // Get the origin station that failed
      const failedOriginId = routes[0]?.originStationId;
      const userLatF = parseFloat(userLat);
      const userLngF = parseFloat(userLng);
      const venueLatF = parseFloat(venueLat);
      const venueLngF = parseFloat(venueLng);

      // Find nearby stations within 1 mile
      const nearbyStations = findNearbyStations(userLatF, userLngF, 1.0, stationsData, [failedOriginId]);

      // Try routes from each nearby station (limit to 5 attempts)
      for (const nearbyStation of nearbyStations.slice(0, 5)) {
        console.log(`🔄 Trying routes from ${nearbyStation.name} (${nearbyStation.distMiles.toFixed(2)} mi away)...`);

        // Get routes starting from this station's coordinates
        const altRoutes = await subwayRouter.findTopRoutes(
          nearbyStation.lat,
          nearbyStation.lng,
          venueLatF,
          venueLngF,
          fetchLimit
        );

        if (!altRoutes || altRoutes.length === 0) continue;

        // Validate these routes (same logic as above)
        const altValidatedRoutes = [];
        for (const route of altRoutes) {
          if (!route.legs || route.legs.length === 0) {
            altValidatedRoutes.push(route);
            continue;
          }

          let routeValid = true;
          const rideLegs = route.legs.filter(l => l.type === 'ride');

          for (const leg of rideLegs) {
            const fromStationId = leg.fromId;
            const toStationId = leg.toId;
            if (!fromStationId || !toStationId) continue;

            // Determine direction from path nodes (same fix as primary validation)
            let pathDir = null;
            if (route.path) {
              for (const node of route.path) {
                const [stopPart, nodeLine] = node.split('_');
                const baseStop = stopPart.replace(/[NS]$/, '');
                if (baseStop === fromStationId && nodeLine === leg.line) {
                  pathDir = stopPart.endsWith('N') ? 'N' : 'S';
                  break;
                }
              }
            }
            const origDirStop = pathDir ? fromStationId + pathDir : fromStationId;
            const destDirStop = pathDir ? toStationId + pathDir : toStationId;

            const serviceAtOrigin = await getLinesWithService([leg.line], origDirStop, null);
            const serviceAtDest = await getLinesWithService([leg.line], destDirStop, null);

            if (serviceAtOrigin.length === 0 || serviceAtDest.length === 0) {
              // Try to find alternative line
              const originNodes = stationsData?.[fromStationId]?.nodes || [];
              const destNodes = stationsData?.[toStationId]?.nodes || [];
              const originLines = new Set(originNodes.map(n => n.match(/_([A-Z0-9]+)$/)?.[1]).filter(Boolean));
              const destLines = new Set(destNodes.map(n => n.match(/_([A-Z0-9]+)$/)?.[1]).filter(Boolean));
              const commonLines = [...originLines].filter(l => destLines.has(l));

              const alternativesAtOrigin = await getLinesWithService(commonLines, origDirStop, null);
              let foundAlt = false;
              for (const altLine of alternativesAtOrigin) {
                const altAtDest = await getLinesWithService([altLine], toStationId, null);
                if (altAtDest.length > 0) {
                  leg.line = altLine;
                  route.realTimeValidated = true;
                  foundAlt = true;
                  break;
                }
              }
              if (!foundAlt) {
                routeValid = false;
                break;
              }
            }
          }

          if (routeValid) {
            // Rebuild lines array and add extra walk time from user to this station
            route.lines = route.legs.filter(l => l.type === 'ride').map(l => l.line);
            // Add walk time from user's actual location to this alternate station
            const extraWalkMins = Math.round(nearbyStation.distMiles * 20); // ~3mph walking
            route.walkToStation = (route.walkToStation || 0) + extraWalkMins;
            route.totalTime = (route.totalTime || 0) + extraWalkMins;
            route.fromAlternateStation = nearbyStation.name;
            altValidatedRoutes.push(route);
          }
        }

        // If we found validated routes from this station, use them
        if (altValidatedRoutes.length > 0) {
          console.log(`✅ Found ${altValidatedRoutes.length} validated routes from ${nearbyStation.name}`);

          // Calculate wait times for these routes (first train + transfers)
          await Promise.all(altValidatedRoutes.map(async (route) => {
            const legs = route.legs || [];
            const rideLegs = legs.filter(l => l.type === 'ride');

            if (rideLegs.length === 0 || !route.path || route.path.length === 0) {
              route.waitTime = 0;
              route.transferWaits = [];
              route.totalWaitTime = 0;
              route.adjustedTotalTime = route.totalTime;
              return;
            }

            let totalWaitTime = 0;
            const transferWaits = [];

            // First train wait
            const firstLeg = rideLegs[0];
            const stopId = route.path[0].split('_')[0];
            let firstWait = 0;

            try {
              const arrivals = await getArrivalsForLine(firstLeg.line, stopId);
              if (arrivals?.length > 0) {
                const catchable = arrivals.filter(a => a.minsAway >= route.walkToStation);
                if (catchable.length > 0) {
                  firstWait = Math.max(0, catchable[0].minsAway - route.walkToStation);
                }
              }
            } catch (e) { /* ignore */ }

            totalWaitTime += firstWait;
            route.waitTime = firstWait;

            // Transfer waits
            let cumulativeTime = route.walkToStation + firstWait;

            for (let i = 0; i < legs.length; i++) {
              const leg = legs[i];
              if (leg.type === 'ride') {
                cumulativeTime += leg.time;
              } else if (leg.type === 'transfer') {
                cumulativeTime += leg.time;
                const nextRide = legs.slice(i + 1).find(l => l.type === 'ride');
                if (!nextRide) continue;

                let transferStopId = null;
                const nextRideFromId = nextRide.fromId;
                for (const node of route.path) {
                  const [nodeStopId] = node.split('_');
                  const baseStopId = nodeStopId.replace(/[NS]$/, '');
                  if (baseStopId === nextRideFromId ||
                      stationsData?.[nextRideFromId]?.nodes?.some(n => n.startsWith(nodeStopId.slice(0, -1)))) {
                    transferStopId = nodeStopId;
                    break;
                  }
                }

                if (!transferStopId) {
                  const fromStation = stationsData?.[nextRide.fromId];
                  const toStation = stationsData?.[nextRide.toId];
                  const direction = (fromStation?.lat && toStation?.lat && toStation.lat > fromStation.lat) ? 'N' : 'S';
                  transferStopId = nextRide.fromId + direction;
                }

                try {
                  const arrivals = await getArrivalsForLine(nextRide.line, transferStopId);
                  if (arrivals?.length > 0) {
                    const catchable = arrivals.filter(a => a.minsAway >= cumulativeTime);
                    if (catchable.length > 0) {
                      const transferWait = Math.max(0, catchable[0].minsAway - cumulativeTime);
                      totalWaitTime += transferWait;
                      transferWaits.push({ at: leg.at, line: nextRide.line, wait: transferWait });
                      cumulativeTime += transferWait;
                    }
                  }
                } catch (e) { /* ignore */ }
              }
            }

            route.transferWaits = transferWaits;
            route.totalWaitTime = totalWaitTime;
            route.adjustedTotalTime = route.totalTime + totalWaitTime;
          }));

          finalRoutes = altValidatedRoutes
            .sort((a, b) => (a.adjustedTotalTime || a.totalTime) - (b.adjustedTotalTime || b.totalTime))
            .slice(0, parseInt(limit));
          break; // Found valid routes, stop trying other stations
        }
      }

      // If still no routes, fall back to unvalidated but still calculate GTFS-based wait times
      if (finalRoutes.length === 0) {
        console.log('⚠️ No validated routes found from nearby stations - returning unvalidated routes with GTFS wait times');
        finalRoutes = routes
          .sort((a, b) => a.totalTime - b.totalTime)
          .slice(0, parseInt(limit));

        // Calculate GTFS-based wait times for unvalidated routes
        await Promise.all(finalRoutes.map(async (route) => {
          route.unvalidated = true;
          const legs = route.legs || [];
          const rideLegs = legs.filter(l => l.type === 'ride');

          if (rideLegs.length === 0 || !route.path || route.path.length === 0) {
            route.waitTime = 0;
            route.transferWaits = [];
            route.totalWaitTime = 0;
            route.adjustedTotalTime = route.totalTime;
            return;
          }

          let totalWaitTime = 0;
          const transferWaits = [];

          // For schedule-based: work backwards from target arrival
          const departureBaseMins = useRealtimeData ? nowMins : (baseMins - route.totalTime + 24 * 60) % (24 * 60);

          // First train wait from GTFS
          const firstLeg = rideLegs[0];
          const firstStopId = route.path[0]?.split('_')[0];
          const arrivalMins = (departureBaseMins + route.walkToStation) % (24 * 60);
          const firstWait = getScheduledWait(firstStopId, firstLeg.line, arrivalMins) || 3;
          totalWaitTime += firstWait;
          route.waitTime = firstWait;

          // Transfer waits from GTFS
          let cumulativeTime = route.walkToStation + firstWait;
          for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            if (leg.type === 'ride') {
              cumulativeTime += leg.time;
            } else if (leg.type === 'transfer') {
              cumulativeTime += leg.time;
              const nextRide = legs.slice(i + 1).find(l => l.type === 'ride');
              if (!nextRide) continue;

              // Find stop ID from path
              let transferStopId = null;
              for (const node of route.path) {
                const [nodeStopId] = node.split('_');
                const baseStopId = nodeStopId.replace(/[NS]$/, '');
                if (baseStopId === nextRide.fromId) {
                  transferStopId = nodeStopId;
                  break;
                }
              }
              if (!transferStopId) transferStopId = nextRide.fromId + 'N';

              const transferArrival = (departureBaseMins + cumulativeTime) % (24 * 60);
              const transferWait = getScheduledWait(transferStopId, nextRide.line, transferArrival) || 3;
              totalWaitTime += transferWait;
              transferWaits.push({
                at: leg.at,
                line: nextRide.line,
                wait: transferWait,
                estimated: true,
                source: 'gtfs'
              });
              cumulativeTime += transferWait;
            }
          }

          route.transferWaits = transferWaits;
          route.totalWaitTime = totalWaitTime;
          route.adjustedTotalTime = route.totalTime + totalWaitTime;
        }));
      }
    }

    // Add scheduled departure/arrival times when using schedule-based calculation
    if (targetArrival && targetDate && !useRealtimeData) {
      for (const route of finalRoutes) {
        const totalMins = route.adjustedTotalTime || route.totalTime;
        const departureMs = targetDate.getTime() - (totalMins * 60000);
        route.scheduledDeparture = new Date(departureMs).toISOString();
        route.scheduledArrival = targetArrival;
        route.useRealtime = false;

        // Get exact GTFS departure times from origin station
        // Use line from path (e.g., "R22N_N" -> "N"), not lines array
        // lines array can be wrong after real-time validation swaps (N->Q, R->W, etc.)
        const firstStopId = route.path?.[0]?.split('_')[0];
        const firstLine = route.path?.[0]?.split('_')[1] || route.lines?.[0];
        if (firstStopId && firstLine) {
          // Calculate the LATEST acceptable train to arrive on time
          // deadline = target - walkFromStation - rideTime
          const walkFromStation = route.walkToVenue || 0;
          const rideTime = route.subwayTime || (route.totalTime - (route.walkToStation || 0) - walkFromStation);
          const deadlineMins = (baseMins - walkFromStation - rideTime + 24 * 60) % (24 * 60);

          // Find trains BEFORE the deadline (ones that get you there on time)
          const gtfsDepartures = getScheduledDeparturesBefore(firstStopId, firstLine, deadlineMins, 3);
          if (gtfsDepartures && gtfsDepartures.length > 0) {
            // GTFS minutes are NYC local time (minutes from midnight)
            // Convert to UTC by finding midnight NYC time, then adding minutes

            // Get target date string in NYC timezone (e.g., "1/27/2026")
            const nycDateStr = targetDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
            const [month, day, year] = nycDateStr.split('/').map(Number);

            // NYC timezone offset (EST = +5, EDT = +4 hours to add to get UTC)
            const isJanOrFeb = month <= 2;
            const isNovOrDec = month >= 11;
            const isDST = !isJanOrFeb && !isNovOrDec; // Rough DST: Mar-Oct
            const nycOffsetHours = isDST ? 4 : 5;

            route.scheduledDepartureTimes = gtfsDepartures.map(mins => {
              const hours = Math.floor(mins / 60);
              const minutes = mins % 60;
              // Create UTC date: NYC midnight + GTFS mins + NYC offset
              const utcDate = new Date(Date.UTC(year, month - 1, day, hours + nycOffsetHours, minutes, 0));
              return utcDate.toISOString();
            });
          }
        }
      }
    } else {
      // Real-time mode - mark routes accordingly
      for (const route of finalRoutes) {
        route.useRealtime = true;
      }
    }

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

// =================================================================
// CAL.RED PROXY - Scrape and parse cal.red/plain events
// =================================================================

// In-memory geocode cache (persists across requests, resets on server restart)
const calredGeocodeCache = {};

async function geocodeVenue(whereStr) {
  if (calredGeocodeCache[whereStr]) return calredGeocodeCache[whereStr];

  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!mapboxToken) return null;

  let addr = whereStr
    .replace(/^@\s*/, '')
    .replace(/\(\d+\+\)/g, '')
    .replace(/\(all ages\)/gi, '')
    .replace(/,\s*(mnhtn)\b/gi, ', Manhattan')
    .replace(/,\s*(bklyn)\b/gi, ', Brooklyn')
    .replace(/,\s*(qns)\b/gi, ', Queens')
    .trim();

  if (!addr.toLowerCase().includes('new york')) {
    addr += ', New York, NY';
  }

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${mapboxToken}&bbox=-74.3,40.45,-73.6,40.95&limit=1`;
    const response = await fetchWithTimeout(url, {}, 10000);
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      const result = { lat, lng };
      calredGeocodeCache[whereStr] = result;
      return result;
    }
  } catch (e) {
    console.warn('Cal.red geocode failed for:', addr, e.message);
  }
  return null;
}

app.get('/api/proxy/calred', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://cal.red/plain', {
      headers: { 'User-Agent': 'CalRedMap/1.0 (event map integration)' }
    });
    if (!response.ok) throw new Error(`cal.red returned ${response.status}`);
    const html = await response.text();

    // Parse HTML table rows into structured events
    const events = [];
    const rowRegex = /<tr>\s*<td>([\s\S]*?)<\/tr>/g;
    let match;
    let isHeader = true;

    while ((match = rowRegex.exec(html)) !== null) {
      if (isHeader) { isHeader = false; continue; }
      const row = match[0];

      const imgMatch = row.match(/src="([^"]+\.webp)"/);
      const tds = [];
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let tdMatch;
      while ((tdMatch = tdRegex.exec(row)) !== null) {
        tds.push(tdMatch[1].trim());
      }

      if (tds.length < 7) continue;

      const linkMatch = row.match(/<a\s+href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/);
      const descFullMatch = row.match(/<span class="desc-full"[^>]*>([\s\S]*?)<\/span>/);
      const descShortMatch = row.match(/<span class="desc-short">([\s\S]*?)<\/span>/);

      const stripHtml = (s) => s ? s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#34;/g, '"').replace(/\s+/g, ' ').trim() : '';

      const title = stripHtml(tds[1] || '');
      const cost = stripHtml(tds[2] || '');
      const when = stripHtml(tds[3] || '');
      const where = stripHtml(tds[4] || '');
      const categories = stripHtml(tds[5] || '');
      const description = descFullMatch ? stripHtml(descFullMatch[1]) : (descShortMatch ? stripHtml(descShortMatch[1]) : '');

      if (!title) continue;

      events.push({
        img: imgMatch ? imgMatch[1] : null,
        title, cost, when, where, categories, description,
        link: linkMatch ? { url: linkMatch[1], text: stripHtml(linkMatch[2]) } : null
      });
    }

    // Server-side geocoding with Mapbox
    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    if (mapboxToken) {
      const uniqueVenues = [...new Set(events.map(e => e.where))];
      const uncached = uniqueVenues.filter(v => !calredGeocodeCache[v]);
      console.log(`📍 Cal.red: ${uniqueVenues.length} unique venues, ${uncached.length} need geocoding`);

      for (const venue of uncached) {
        await geocodeVenue(venue);
        await new Promise(r => setTimeout(r, 50));
      }

      // Attach coords to events
      for (const event of events) {
        const coords = calredGeocodeCache[event.where];
        if (coords) {
          event.lat = coords.lat;
          event.lng = coords.lng;
        }
      }
    }

    res.set('Cache-Control', 'public, max-age=900'); // 15 min cache
    res.json({ success: true, count: events.length, events });
  } catch (error) {
    console.error('Cal.red proxy error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch cal.red data' });
  }
});

// Slotted.co signup availability
app.get('/api/v1/mics/slots/:slottedId', async (req, res) => {
  try {
    const data = await getSlottedData(req.params.slottedId);
    if (!data) return res.status(404).json({ success: false, error: 'Unknown slotted ID' });
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Slotted endpoint error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch slot data' });
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
    startSlottedRefresh();
  });
}

// Export app for testing
module.exports = app;
