#!/usr/bin/env node
/**
 * Compare MicMap transit times vs Transiter API
 * Tests a sample of venue-to-venue routes for accuracy
 */

const MICMAP_API = 'http://localhost:3001';
const TRANSITER = 'https://demo.transiter.dev/systems/us-ny-subway';

// Sample routes to test (mix of short/long, different boroughs)
const TEST_ROUTES = [
  // Short routes (potential issues)
  { from: 'Phoenix Bar', fromLat: 40.7231925, fromLon: -73.982715, to: 'Idaho Bar', toLat: 40.7309458, toLon: -73.9833528 },
  { from: 'UCB', fromLat: 40.733, fromLon: -73.9855, to: 'Greenwich Village CC', toLat: 40.7296565, toLon: -74.001091 },
  { from: 'Comedy Shop', fromLat: 40.7288305, fromLon: -74.0001342, to: 'St. Marks CC', toLat: 40.7290207, toLon: -73.9893198 },

  // Medium routes
  { from: 'UCB', fromLat: 40.733, fromLon: -73.9855, to: 'Producer\'s Club', toLat: 40.7595017, toLon: -73.9914437 },
  { from: 'Brooklyn Art Haus', fromLat: 40.7133906, fromLon: -73.9549636, to: 'Comedy Shop', toLat: 40.7288305, toLon: -74.0001342 },
  { from: 'Bushwick CC', fromLat: 40.702, fromLon: -73.9299503, to: 'UCB', toLat: 40.733, toLon: -73.9855 },

  // Long routes (cross-borough)
  { from: 'QED Astoria', fromLat: 40.775548, fromLon: -73.9149401, to: 'Tiny Cupboard', toLat: 40.6836915, toLon: -73.9112136 },
  { from: 'Comic Strip Live', fromLat: 40.7748581, fromLon: -73.9536956, to: 'Eastville CC', toLat: 40.6859068, toLon: -73.9816185 },
  { from: 'UWS NY CC', fromLat: 40.7645366, fromLon: -73.9833266, to: 'Bushwick CC', toLat: 40.702, toLon: -73.9299503 },
  { from: 'Caffeine Underground', fromLat: 40.6922369, fromLon: -73.9144937, to: 'Producer\'s Club', toLat: 40.7595017, toLon: -73.9914437 },
];

// Walking time estimate (24 min/mile)
function walkingTime(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const miles = R * c;
  return { mins: Math.round(miles * 24), miles: Math.round(miles * 100) / 100 };
}

// Get MicMap route
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
        originStation: r.originStation,
        exitStation: r.exitStation,
        walkToStation: r.walkToStation,
        subwayTime: r.subwayTime,
        walkToVenue: r.walkToVenue
      };
    }
    return { error: 'No route' };
  } catch (e) {
    return { error: e.message };
  }
}

// Get nearest station from Transiter
async function getNearestStation(lat, lon) {
  try {
    // Get all stops and find nearest
    const url = `${TRANSITER}/stops?latitude=${lat}&longitude=${lon}&max_distance=0.5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.stops && data.stops.length > 0) {
      return data.stops[0];
    }
    return null;
  } catch (e) {
    return null;
  }
}

// Get Transiter trip time estimate
async function getTransiterEstimate(fromLat, fromLon, toLat, toLon) {
  try {
    // Find nearest stations to origin and destination
    const originStation = await getNearestStation(fromLat, fromLon);
    const destStation = await getNearestStation(toLat, toLon);

    if (!originStation || !destStation) {
      return { error: 'No nearby stations' };
    }

    // Get arrivals at origin station
    const arrivalsUrl = `${TRANSITER}/stops/${originStation.id}`;
    const arrivalsRes = await fetch(arrivalsUrl, { signal: AbortSignal.timeout(8000) });
    if (!arrivalsRes.ok) return { error: 'Failed to get arrivals' };
    const arrivalsData = await arrivalsRes.json();

    // Extract lines serving this station
    const lines = new Set();
    if (arrivalsData.stopTimes) {
      arrivalsData.stopTimes.forEach(st => {
        if (st.trip && st.trip.route) {
          lines.add(st.trip.route.id);
        }
      });
    }

    return {
      originStation: originStation.name,
      originId: originStation.id,
      destStation: destStation.name,
      destId: destStation.id,
      lines: Array.from(lines),
      // Transiter doesn't do routing, so we can't get exact time
      // But we can compare stations and lines
    };
  } catch (e) {
    return { error: e.message };
  }
}

async function main() {
  console.log('\n🔍 COMPARING MICMAP vs TRANSITER ACCURACY');
  console.log('='.repeat(70));
  console.log('Note: Transiter provides station/line data, not full routing.\n');

  const results = [];

  for (const route of TEST_ROUTES) {
    console.log(`\n📍 ${route.from} → ${route.to}`);
    console.log('-'.repeat(50));

    const walk = walkingTime(route.fromLat, route.fromLon, route.toLat, route.toLon);
    console.log(`   Walking: ${walk.mins}min (${walk.miles}mi)`);

    // Get MicMap route
    const micmap = await getMicMapRoute(route.fromLat, route.fromLon, route.toLat, route.toLon);
    if (micmap.error) {
      console.log(`   MicMap: ERROR - ${micmap.error}`);
    } else {
      const lines = micmap.lines.join('→') || 'walk';
      console.log(`   MicMap: ${micmap.totalTime}min via ${lines}`);
      console.log(`           ${micmap.originStation} → ${micmap.exitStation}`);
      console.log(`           (${micmap.walkToStation}m walk + ${micmap.subwayTime}m ride + ${micmap.walkToVenue}m walk)`);

      // Flag if transit >= walking
      if (micmap.totalTime >= walk.mins && micmap.lines.length > 0) {
        console.log(`   ⚠️  ISSUE: Transit (${micmap.totalTime}min) >= Walking (${walk.mins}min)`);
      }
    }

    // Get Transiter data for comparison
    const transiter = await getTransiterEstimate(route.fromLat, route.fromLon, route.toLat, route.toLon);
    if (transiter.error) {
      console.log(`   Transiter: ERROR - ${transiter.error}`);
    } else {
      console.log(`   Transiter stations: ${transiter.originStation} → ${transiter.destStation}`);
      console.log(`   Transiter lines at origin: ${transiter.lines.slice(0,5).join(', ')}`);

      // Compare origin stations
      if (micmap.originStation && transiter.originStation) {
        const micmapOrigin = micmap.originStation.toLowerCase().replace(/[^a-z0-9]/g, '');
        const transiterOrigin = transiter.originStation.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!micmapOrigin.includes(transiterOrigin) && !transiterOrigin.includes(micmapOrigin)) {
          console.log(`   ❓ Different origin stations: MicMap="${micmap.originStation}" vs Transiter="${transiter.originStation}"`);
        }
      }
    }

    results.push({
      route: `${route.from} → ${route.to}`,
      walk: walk.mins,
      micmap: micmap.error ? null : micmap.totalTime,
      micmapLines: micmap.lines || [],
      micmapOrigin: micmap.originStation,
      transiterOrigin: transiter.originStation,
      transiterLines: transiter.lines || [],
      issue: micmap.totalTime >= walk.mins && (micmap.lines || []).length > 0
    });

    // Small delay
    await new Promise(r => setTimeout(r, 300));
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  const issues = results.filter(r => r.issue);
  console.log(`\nTotal routes tested: ${results.length}`);
  console.log(`Routes with issues: ${issues.length}`);

  if (issues.length > 0) {
    console.log('\n⚠️  Routes where transit >= walking (need fixing):');
    issues.forEach(r => {
      console.log(`   - ${r.route}: ${r.micmap}min transit vs ${r.walk}min walk`);
    });
  }

  // Compare station matching
  const stationMismatches = results.filter(r =>
    r.micmapOrigin && r.transiterOrigin &&
    !r.micmapOrigin.toLowerCase().includes(r.transiterOrigin.toLowerCase().split(' ')[0]) &&
    !r.transiterOrigin.toLowerCase().includes(r.micmapOrigin.toLowerCase().split(' ')[0])
  );

  if (stationMismatches.length > 0) {
    console.log('\n❓ Routes with different origin stations (may need review):');
    stationMismatches.forEach(r => {
      console.log(`   - ${r.route}: MicMap="${r.micmapOrigin}" vs Transiter="${r.transiterOrigin}"`);
    });
  }
}

main().catch(console.error);
