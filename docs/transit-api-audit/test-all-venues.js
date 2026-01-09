/**
 * FULL TEST: All 102 venues vs Transiter
 * Maps each venue to nearest subway stops and tests arrivals
 */

const fs = require('fs');
const TRANSITER = 'https://demo.transiter.dev/systems/us-ny-subway';
const LOCAL = 'http://localhost:3001';

// Load stations data for stop lookups
const stations = JSON.parse(fs.readFileSync('./public/data/stations.json'));

// Venue coordinates (from server.js + additional lookups)
const VENUE_COORDS = {
  'Comedy Shop': { lat: 40.7288305, lng: -74.0001342 },
  'Greenwich Village Comedy Club': { lat: 40.7296565, lng: -74.001091 },
  'Pinebox': { lat: 40.7052293, lng: -73.9326664 },
  'Pine Box Rock Shop': { lat: 40.7052293, lng: -73.9326664 },
  'Pine Box': { lat: 40.7052293, lng: -73.9326664 },
  'UWS NY Comedy Club': { lat: 40.7808191, lng: -73.9805102 },
  'West Side Comedy Club': { lat: 40.7808191, lng: -73.9805102 },
  'Eastville Comedy Club': { lat: 40.68586, lng: -73.98165 },
  'Phoenix Bar': { lat: 40.72993, lng: -73.981042 },
  'Phoenix Bar Avenue A': { lat: 40.72993, lng: -73.981042 },
  'The Comic Strip Live': { lat: 40.7748581, lng: -73.9536956 },
  'Comic Strip Live': { lat: 40.7748581, lng: -73.9536956 },
  'St. Mark\'s Comedy Club': { lat: 40.729, lng: -73.989 },
  'St. Marks Comedy Club': { lat: 40.729, lng: -73.989 },
  'Producer\'s Club': { lat: 40.7644391, lng: -73.9856707 },
  'Caffeine Underground': { lat: 40.6836915, lng: -73.9112136 },
  'Brooklyn Art Haus': { lat: 40.7168611, lng: -73.9610679 },
  'Fear City Comedy Club': { lat: 40.7152631, lng: -73.9901598 },
  'Easy Lover BK': { lat: 40.7180926, lng: -73.9502883 },
  'Bushwick Comedy Club': { lat: 40.6955342, lng: -73.9288494 },
  'Idaho Bar': { lat: 40.7288305, lng: -74.0001342 },
  'O\'Keefe\'s Bar': { lat: 40.6784737, lng: -73.9860016 },
  'The Tiny Cupboard': { lat: 40.6836915, lng: -73.9112136 },
  'QED Astoria': { lat: 40.775548, lng: -73.9149401 },
  'The Pit Midtown': { lat: 40.7405356, lng: -73.9848055 },
  'The PIT NYC': { lat: 40.7405356, lng: -73.9848055 },
  'UCB': { lat: 40.7305356, lng: -73.9878055 },
  'Grisly Pear': { lat: 40.7318243, lng: -74.0036027 },
  'The Grisly Pear': { lat: 40.7318243, lng: -74.0036027 },
  'Grisly Pear Midtown': { lat: 40.7645366, lng: -73.9833266 },
  'New York Comedy Club Midtown': { lat: 40.738892, lng: -73.98084 },
  'New York Comedy Club East Village': { lat: 40.7270, lng: -73.9870 },
  'The Stand NYC': { lat: 40.7366948, lng: -73.9844585 },
  'The Stand': { lat: 40.7366948, lng: -73.9844585 },
  'Janice\'s apt': { lat: 40.7644391, lng: -73.9856707 },
  'Sesh Comedy': { lat: 40.7152631, lng: -73.9901598 },
  'BKLYN Made Comedy': { lat: 40.6955342, lng: -73.9288494 },
  'Comedy Village': { lat: 40.7300, lng: -74.0000 },
  'Caravan of Dreams': { lat: 40.726363, lng: -73.985668 },
  'Alligator Lounge': { lat: 40.7139062, lng: -73.9489165 },
  'Second City BlackBox': { lat: 40.7207729, lng: -73.9596507 },
  'Pete\'s Candy Store': { lat: 40.7180926, lng: -73.9502883 },
  'Broadway Comedy Club': { lat: 40.7644391, lng: -73.9856707 },
  'Laughing Devil Comedy Club': { lat: 40.7444693, lng: -73.953783 },
  'Young Ethel\'s': { lat: 40.6784737, lng: -73.9860016 },
  'Harlem Nights Bar': { lat: 40.8090, lng: -73.9450 },
  'Comedy in Harlem': { lat: 40.8090, lng: -73.9450 },
  'Oh Craft Beer Harlem': { lat: 40.8090, lng: -73.9450 },
  'Flop House Comedy Club': { lat: 40.7122083, lng: -73.9557789 },
  'The Gutter Williamsburg': { lat: 40.7139, lng: -73.9489 },
  'Gutter Bar': { lat: 40.7139, lng: -73.9489 },
  'Alphaville': { lat: 40.7050, lng: -73.9210 },
  'Alphaville Bar': { lat: 40.7050, lng: -73.9210 },
  'Freddy\'s': { lat: 40.6830, lng: -73.9750 },
  'Freddy\'s Bar': { lat: 40.6830, lng: -73.9750 },
  'Good Judy': { lat: 40.7300, lng: -73.9510 },
  'NYC Suite Bar': { lat: 40.8026454, lng: -73.964587 },
  'The Buddha Room': { lat: 40.7498782, lng: -73.9947359 },
  'Black Cat LES': { lat: 40.7200, lng: -73.9880 },
  'Cobra Club Brooklyn': { lat: 40.7050, lng: -73.9210 },
  'Cobra Club': { lat: 40.7050, lng: -73.9210 },
  'Tara Mor': { lat: 40.7480429, lng: -73.9919743 },
  'KGB Bar': { lat: 40.7270, lng: -73.9870 },
  'Stumble Inn': { lat: 40.7748, lng: -73.9537 },
  'Halyards': { lat: 40.6784, lng: -73.9860 },
  'Grove 34': { lat: 40.7674298, lng: -73.9329303 },
  'Windjammer': { lat: 40.709117, lng: -73.907004 },
  'Rodney\'s Comedy Club': { lat: 40.7139, lng: -73.9489 },
  'Rodney\'s': { lat: 40.7139, lng: -73.9489 },
  'Housewatch': { lat: 40.7139, lng: -73.9489 },
  'Echo Bravo': { lat: 40.7050, lng: -73.9210 },
  'Secret Pour': { lat: 40.6937282, lng: -73.9298594 },
  'Eastpoint Bar': { lat: 40.7050, lng: -73.9210 },
  'Grey Mare': { lat: 40.7270, lng: -73.9870 },
  'One and One': { lat: 40.7270, lng: -73.9870 },
  'Scorpion Records': { lat: 40.7050, lng: -73.9210 },
  'Logan\'s Run Bar': { lat: 40.7139, lng: -73.9489 },
  'Block Hill Station': { lat: 40.6830, lng: -73.9750 },
  'Corner Store BK': { lat: 40.7139, lng: -73.9489 },
  'Isola': { lat: 40.7139, lng: -73.9489 },
  'iNINE Bistro': { lat: 40.8067535, lng: -73.9266818 },
  'The Daily Press': { lat: 40.7050, lng: -73.9210 },
  'Branded Saloon': { lat: 40.6830, lng: -73.9750 },
  'Stella & Fly': { lat: 40.7139, lng: -73.9489 },
  'Sanger Hall': { lat: 40.7050, lng: -73.9210 },
  'Brooklyn Comedy Collective': { lat: 40.6784, lng: -73.9860 },
  'Pubkey': { lat: 40.7270, lng: -73.9870 },
  'FRIGID Theater': { lat: 40.7270, lng: -73.9870 },
  'Rose R&R Bar': { lat: 40.7139, lng: -73.9489 },
  'Luxor Lounge': { lat: 40.7050, lng: -73.9210 },
  'Starr Bar': { lat: 40.7050, lng: -73.9210 },
  'Judy Z\'s': { lat: 40.7139, lng: -73.9489 },
  'Enoch\'s': { lat: 40.7562531, lng: -73.9976964 },
  'Fiction Bar': { lat: 40.7050, lng: -73.9210 },
  'Tommy Figz': { lat: 40.7050, lng: -73.9210 },
  'Hell Phone': { lat: 40.7050, lng: -73.9210 },
  'Brooklyn Dreams Juice Lounge': { lat: 40.6784, lng: -73.9860 },
  'Soho Playhouse': { lat: 40.7250, lng: -74.0000 },
  'Hotel Edison': { lat: 40.7590, lng: -73.9870 },
  'Commune BK': { lat: 40.7050, lng: -73.9210 },
  'Island Ribhouse': { lat: 40.5750, lng: -73.9700 },
  'Cool Beans Coffee': { lat: 40.7139, lng: -73.9489 },
  'Talon Bar': { lat: 40.7050, lng: -73.9210 },
  'SkyBox Sports Bar & Grill': { lat: 40.7955865, lng: -73.9360676 },
};

// Haversine distance
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Find nearest stations
function findNearestStations(lat, lng, maxDist = 1.0) {
  const results = [];
  for (const [id, station] of Object.entries(stations)) {
    if (!station.lat || !station.lng) continue;
    const dist = haversine(lat, lng, station.lat, station.lng);
    if (dist <= maxDist) {
      // Extract lines from nodes
      const lines = new Set();
      (station.nodes || []).forEach(node => {
        const match = node.match(/_([A-Z0-9]+)$/);
        if (match) lines.add(match[1]);
      });
      results.push({
        id,
        name: station.name,
        distance: dist,
        lines: [...lines]
      });
    }
  }
  return results.sort((a, b) => a.distance - b.distance).slice(0, 3);
}

let output = [];
let totalBugs = 0;
let bugsByType = {};

function log(msg) {
  console.log(msg);
  output.push(msg);
}

function addBug(type, venue, line, dir, detail) {
  totalBugs++;
  if (!bugsByType[type]) bugsByType[type] = [];
  bugsByType[type].push({ venue, line, dir, detail });
}

async function getTransiter(stopId, direction) {
  try {
    const res = await fetch(`${TRANSITER}/stops/${stopId}${direction}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { error: `HTTP ${res.status}`, arrivals: [] };
    const data = await res.json();
    const now = Date.now() / 1000;
    const arrivals = (data.stopTimes || [])
      .map(st => {
        const time = st.arrival?.time || st.departure?.time;
        if (!time) return null;
        const mins = Math.round((time - now) / 60);
        if (mins < -1 || mins > 20) return null;
        return { line: st.trip?.route?.id, mins: Math.max(0, mins) };
      })
      .filter(Boolean)
      .sort((a, b) => a.mins - b.mins);
    return { arrivals };
  } catch (e) {
    return { error: e.message, arrivals: [] };
  }
}

async function getLocal(line, stopId) {
  try {
    const res = await fetch(`${LOCAL}/api/mta/arrivals/${line}/${stopId}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { error: `HTTP ${res.status}`, arrivals: [] };
    const data = await res.json();
    return {
      arrivals: (Array.isArray(data) ? data : [])
        .filter(a => a.minsAway <= 20)
        .map(a => ({ line: a.line, dir: a.direction, mins: a.minsAway, dest: a.destination || '' }))
    };
  } catch (e) {
    return { error: e.message, arrivals: [] };
  }
}

async function testVenue(name, coords) {
  const nearStations = findNearestStations(coords.lat, coords.lng);
  if (nearStations.length === 0) {
    log(`\n⚠️  ${name} - No nearby stations found`);
    addBug('NO_STATION', name, '-', '-', 'No subway within 1mi');
    return;
  }

  const station = nearStations[0];
  log(`\n📍 ${name}`);
  log(`   Station: ${station.name} (${station.id}) - ${(station.distance * 5280).toFixed(0)}ft`);
  log(`   Lines: ${station.lines.join(', ') || 'none'}`);

  for (const dir of ['N', 'S']) {
    const dirLabel = dir === 'N' ? 'Uptown' : 'Downtown';

    // Get Transiter baseline
    const transiter = await getTransiter(station.id, dir);
    const transiterLines = [...new Set(transiter.arrivals.map(a => a.line))];

    // Test each line at this station
    for (const line of station.lines) {
      const local = await getLocal(line, station.id);

      // Filter local by direction
      const localFiltered = local.arrivals.filter(a => {
        const d = (a.dir || '').toLowerCase();
        if (dir === 'N') return d.includes('uptown') || d.includes('manhattan') || d.includes('queens') || d.includes('bronx') || d.includes('jamaica');
        return d.includes('downtown') || d.includes('brooklyn') || d.includes('manhattan');
      });

      // Check for bugs
      const tCount = transiter.arrivals.filter(a => a.line === line).length;
      const lCount = localFiltered.filter(a => a.line === line).length;

      // Wrong line returned
      const wrongLines = localFiltered.filter(a => a.line !== line);
      if (wrongLines.length > 0) {
        addBug('WRONG_LINE', name, line, dirLabel, `Got ${[...new Set(wrongLines.map(a => a.line))].join(',')}`);
      }

      // Missing data
      if (tCount > 0 && lCount === 0) {
        addBug('MISSING_DATA', name, line, dirLabel, `Transiter: ${tCount}, Local: 0`);
      }

      // Incomplete
      if (tCount >= 3 && lCount < tCount / 2) {
        addBug('INCOMPLETE', name, line, dirLabel, `Transiter: ${tCount}, Local: ${lCount}`);
      }

      // Duplicates
      const times = localFiltered.map(a => `${a.line}-${a.mins}`);
      const dupes = times.length - new Set(times).size;
      if (dupes > 0) {
        addBug('DUPLICATES', name, line, dirLabel, `${dupes} duplicates`);
      }

      // No destination
      if (localFiltered.length > 0 && !localFiltered.some(a => a.dest && a.dest.length > 3)) {
        addBug('NO_DESTINATION', name, line, dirLabel, 'Missing destination info');
      }
    }
  }
}

async function main() {
  const startTime = Date.now();
  const venueList = Object.keys(VENUE_COORDS);

  log('╔══════════════════════════════════════════════════════════════════════╗');
  log('║           FULL VENUE TRANSIT API TEST                                ║');
  log(`║           Testing ${venueList.length} venues                                          ║`);
  log(`║           Generated: ${new Date().toISOString()}              ║`);
  log('╚══════════════════════════════════════════════════════════════════════╝');

  let tested = 0;
  for (const venue of venueList) {
    await testVenue(venue, VENUE_COORDS[venue]);
    tested++;
    if (tested % 10 === 0) {
      console.error(`Progress: ${tested}/${venueList.length} venues tested...`);
    }
  }

  // Summary
  log('\n\n');
  log('╔══════════════════════════════════════════════════════════════════════╗');
  log('║                         BUG SUMMARY                                  ║');
  log('╚══════════════════════════════════════════════════════════════════════╝');
  log(`\nTotal bugs: ${totalBugs}`);
  log(`Venues tested: ${venueList.length}`);
  log(`Time: ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);

  for (const [type, bugs] of Object.entries(bugsByType).sort((a, b) => b[1].length - a[1].length)) {
    log(`\n${type}: ${bugs.length} occurrences`);
    log('─'.repeat(50));

    // Group by venue
    const byVenue = {};
    bugs.forEach(b => {
      if (!byVenue[b.venue]) byVenue[b.venue] = [];
      byVenue[b.venue].push(b);
    });

    const venues = Object.entries(byVenue).slice(0, 15);
    venues.forEach(([venue, vBugs]) => {
      const lines = [...new Set(vBugs.map(b => b.line))].join(',');
      log(`  ${venue} [${lines}]`);
    });
    if (Object.keys(byVenue).length > 15) {
      log(`  ... and ${Object.keys(byVenue).length - 15} more venues`);
    }
  }

  // Write to file
  const filename = 'transit-api-full-test.txt';
  fs.writeFileSync(filename, output.join('\n'));
  console.log(`\n✅ Results written to ${filename}`);
  console.log(`   Total bugs: ${totalBugs}`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
