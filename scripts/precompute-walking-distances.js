#!/usr/bin/env node
/**
 * Pre-compute walking distances between NEARBY comedy venues
 * Only computes for venues < 1.5 miles apart (saves API calls)
 * Uses routing.openstreetmap.de/routed-foot (1 req/sec limit)
 */

const fs = require('fs');
const OSRM_FOOT = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';
const MICMAP_API = 'http://localhost:3001';
const MAX_DISTANCE_MILES = 1.5; // Only compute walks for venues this close

// Haversine distance
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function getAllVenues() {
  const res = await fetch(`${MICMAP_API}/api/v1/mics`);
  const data = await res.json();

  // Get unique venues by coordinates (rounded to 4 decimals)
  const venues = {};
  data.mics.forEach(m => {
    const key = `${m.lat.toFixed(4)},${(m.lon || m.lng).toFixed(4)}`;
    if (!venues[key]) {
      venues[key] = {
        name: m.venueName || m.name,
        lat: m.lat,
        lon: m.lon || m.lng,
        address: m.address
      };
    }
  });

  return Object.values(venues);
}

async function getWalkingRoute(fromLat, fromLon, toLat, toLon) {
  try {
    const url = `${OSRM_FOOT}/${fromLon},${fromLat};${toLon},${toLat}?overview=false`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'MicMap-NYC/1.0 (comedy venue finder)',
        'Referer': 'https://micmap.nyc'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      return { error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      const r = data.routes[0];
      return {
        meters: Math.round(r.distance),
        seconds: Math.round(r.duration),
        miles: Math.round(r.distance / 1609.34 * 100) / 100,
        mins: Math.round(r.duration / 60)
      };
    }
    return { error: 'No route found' };
  } catch (e) {
    return { error: e.message };
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('\n🚶 PRE-COMPUTING WALKING DISTANCES (NEARBY VENUES ONLY)');
  console.log('='.repeat(55));
  console.log(`Only computing for venues < ${MAX_DISTANCE_MILES} miles apart`);
  console.log('Using: routing.openstreetmap.de/routed-foot');
  console.log('Rate limit: 1 request/second\n');

  // Get all venues
  console.log('📍 Fetching venues...');
  const venues = await getAllVenues();
  console.log(`   Found ${venues.length} unique venue locations\n`);

  // Find nearby pairs only
  console.log('🔍 Finding nearby venue pairs...');
  const pairs = [];
  for (let i = 0; i < venues.length; i++) {
    for (let j = i + 1; j < venues.length; j++) {
      const dist = getDistance(venues[i].lat, venues[i].lon, venues[j].lat, venues[j].lon);
      if (dist <= MAX_DISTANCE_MILES) {
        pairs.push({ from: venues[i], to: venues[j], straightLine: dist });
      }
    }
  }

  console.log(`   Found ${pairs.length} pairs within ${MAX_DISTANCE_MILES} miles`);
  console.log(`   (Skipped ${venues.length * (venues.length - 1) / 2 - pairs.length} distant pairs)\n`);

  const estimatedMins = Math.ceil(pairs.length * 2 / 60); // *2 for both directions
  console.log(`📊 Calculating ${pairs.length * 2} walking routes (both directions)...`);
  console.log(`   Estimated time: ${estimatedMins} minutes\n`);

  // Build distance lookup
  const lookup = {};
  let completed = 0;
  let errors = 0;
  const totalRoutes = pairs.length * 2;
  const startTime = Date.now();

  for (const pair of pairs) {
    // Forward direction (A → B)
    const fromKey = `${pair.from.lat.toFixed(4)},${pair.from.lon.toFixed(4)}`;
    const toKey = `${pair.to.lat.toFixed(4)},${pair.to.lon.toFixed(4)}`;

    const route = await getWalkingRoute(pair.from.lat, pair.from.lon, pair.to.lat, pair.to.lon);

    if (route.error) {
      errors++;
    } else {
      // Store both directions (walking is symmetric)
      lookup[`${fromKey}|${toKey}`] = {
        mins: route.mins,
        meters: route.meters,
        miles: route.miles,
        fromName: pair.from.name,
        toName: pair.to.name
      };
      lookup[`${toKey}|${fromKey}`] = {
        mins: route.mins,
        meters: route.meters,
        miles: route.miles,
        fromName: pair.to.name,
        toName: pair.from.name
      };
    }

    completed += 2; // Both directions

    // Progress update
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (completed/2) / elapsed; // Actual API calls per second
    const remaining = Math.round((totalRoutes/2 - completed/2) / rate / 60);
    process.stdout.write(`\r   Progress: ${completed}/${totalRoutes} (${Math.round(completed/totalRoutes*100)}%) - ~${remaining}min remaining   `);

    // Rate limit: 1 request per second
    await sleep(1050);
  }

  console.log(`\n\n✅ Complete! ${Object.keys(lookup).length} routes cached, ${errors} errors`);

  // Save results
  const output = {
    generated: new Date().toISOString(),
    venueCount: venues.length,
    maxDistanceMiles: MAX_DISTANCE_MILES,
    routeCount: Object.keys(lookup).length,
    errorCount: errors,
    source: 'routing.openstreetmap.de/routed-foot',
    note: 'Walking times in minutes. For venues not in lookup, use transit.',
    lookup: lookup
  };

  const outputPath = '/Users/jaredapper/Desktop/micmap/api/data/walking-distances.json';

  // Ensure directory exists
  const dir = '/Users/jaredapper/Desktop/micmap/api/data';
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n💾 Saved to: ${outputPath}`);

  // Summary stats
  const allMins = Object.values(lookup).map(r => r.mins);
  if (allMins.length > 0) {
    const avgMins = Math.round(allMins.reduce((a,b) => a+b, 0) / allMins.length);
    const maxMins = Math.max(...allMins);
    const minMins = Math.min(...allMins);

    console.log('\n📈 Stats:');
    console.log(`   Avg walk: ${avgMins} min`);
    console.log(`   Shortest: ${minMins} min`);
    console.log(`   Longest: ${maxMins} min`);
  }
}

main().catch(console.error);
