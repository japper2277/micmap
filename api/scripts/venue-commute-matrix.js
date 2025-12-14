#!/usr/bin/env node
/**
 * Calculate commute times between all comedy venues for today
 * Compares MicMap subway router vs Transiter API
 */

const MICMAP_API = 'http://localhost:3001';
const TRANSITER = 'https://demo.transiter.dev/systems/us-ny-subway';

// Get today's day name
const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
console.log(`\n📅 Today: ${today}`);
console.log('='.repeat(60));

async function getMicsForToday() {
  const res = await fetch(`${MICMAP_API}/api/v1/mics`);
  const data = await res.json();
  const todayMics = data.mics.filter(m => m.day === today);

  // Get unique venues
  const venues = {};
  todayMics.forEach(m => {
    const name = m.venueName || m.name;
    if (name && m.lat && m.lon) {
      venues[name] = { name, lat: m.lat, lon: m.lon };
    }
  });

  return Object.values(venues);
}

async function getMicMapRoute(fromLat, fromLon, toLat, toLon) {
  try {
    const url = `${MICMAP_API}/api/subway/routes?userLat=${fromLat}&userLng=${fromLon}&venueLat=${toLat}&venueLng=${toLon}&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      const r = data.routes[0];
      return {
        totalTime: r.totalTime,
        lines: r.lines || [],
        walkToStation: r.walkToStation,
        subwayTime: r.subwayTime,
        walkToVenue: r.walkToVenue,
        originStation: r.originStation,
        exitStation: r.exitStation
      };
    }
    return { error: 'No route found' };
  } catch (e) {
    return { error: e.message };
  }
}

// Calculate walking time (simple Haversine + 24 min/mile)
function walkingTime(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const miles = R * c;
  return Math.round(miles * 24); // 24 min/mile walking pace
}

async function main() {
  console.log('\n🎤 Fetching today\'s venues...');
  const venues = await getMicsForToday();
  console.log(`   Found ${venues.length} unique venues\n`);

  if (venues.length === 0) {
    console.log('No venues found for today');
    return;
  }

  // Calculate pairs
  const pairs = [];
  for (let i = 0; i < venues.length; i++) {
    for (let j = 0; j < venues.length; j++) {
      if (i !== j) {
        pairs.push({ from: venues[i], to: venues[j] });
      }
    }
  }

  console.log(`📊 Calculating ${pairs.length} route pairs...\n`);

  const results = [];
  let completed = 0;

  // Process in batches of 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
    const batch = pairs.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(batch.map(async (pair) => {
      const { from, to } = pair;

      // Get MicMap route
      const micmap = await getMicMapRoute(from.lat, from.lon, to.lat, to.lon);

      // Calculate walking time for comparison
      const walkTime = walkingTime(from.lat, from.lon, to.lat, to.lon);

      return {
        from: from.name,
        to: to.name,
        micmap: micmap,
        walkTime: walkTime,
        savings: micmap.totalTime ? walkTime - micmap.totalTime : null
      };
    }));

    results.push(...batchResults);
    completed += batch.length;
    process.stdout.write(`\r   Progress: ${completed}/${pairs.length} (${Math.round(completed/pairs.length*100)}%)`);

    // Small delay between batches
    if (i + BATCH_SIZE < pairs.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(60));

  // Analyze results
  const successful = results.filter(r => r.micmap.totalTime);
  const failed = results.filter(r => r.micmap.error);
  const walkFaster = successful.filter(r => r.savings < 0);
  const transitFaster = successful.filter(r => r.savings > 5);

  console.log(`\n✅ Successful routes: ${successful.length}/${results.length}`);
  console.log(`❌ Failed routes: ${failed.length}`);
  console.log(`🚶 Walking faster: ${walkFaster.length}`);
  console.log(`🚇 Transit saves >5min: ${transitFaster.length}`);

  // Show some examples
  console.log('\n📋 SAMPLE ROUTES (first 20):');
  console.log('-'.repeat(80));

  results.slice(0, 20).forEach(r => {
    const route = r.micmap;
    if (route.totalTime) {
      const lines = route.lines.join('→') || 'walk';
      console.log(`${r.from.substring(0,20).padEnd(20)} → ${r.to.substring(0,20).padEnd(20)}: ${route.totalTime}min (${lines}) [walk: ${r.walkTime}min]`);
    } else {
      console.log(`${r.from.substring(0,20).padEnd(20)} → ${r.to.substring(0,20).padEnd(20)}: ERROR - ${route.error}`);
    }
  });

  // Show routes where transit is much faster
  console.log('\n🚀 BEST TRANSIT ROUTES (>10min faster than walking):');
  console.log('-'.repeat(80));

  const bestRoutes = successful
    .filter(r => r.savings > 10)
    .sort((a, b) => b.savings - a.savings)
    .slice(0, 10);

  bestRoutes.forEach(r => {
    const route = r.micmap;
    const lines = route.lines.join('→');
    console.log(`${r.from.substring(0,18).padEnd(18)} → ${r.to.substring(0,18).padEnd(18)}: ${route.totalTime}min via ${lines} (saves ${r.savings}min vs walk)`);
  });

  // Show suspicious routes (transit slower than walking)
  console.log('\n⚠️  SUSPICIOUS ROUTES (transit >= walking time):');
  console.log('-'.repeat(80));

  const suspicious = successful
    .filter(r => r.savings <= 0 && r.micmap.lines.length > 0)
    .slice(0, 10);

  if (suspicious.length === 0) {
    console.log('   None found - all transit routes are faster than walking!');
  } else {
    suspicious.forEach(r => {
      const route = r.micmap;
      const lines = route.lines.join('→');
      console.log(`${r.from.substring(0,18).padEnd(18)} → ${r.to.substring(0,18).padEnd(18)}: ${route.totalTime}min via ${lines} (walk: ${r.walkTime}min) ❓`);
    });
  }

  // Export full results
  const outputFile = '/Users/jaredapper/Desktop/micmap/venue-commute-matrix.json';
  const fs = require('fs');
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`\n💾 Full results saved to: venue-commute-matrix.json`);
}

main().catch(console.error);
