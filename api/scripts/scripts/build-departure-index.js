/**
 * Build a departure index from GTFS data
 * Creates a lookup: stopId -> line -> [sorted departure times in minutes]
 * This allows querying "next train after X minutes"
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const GTFS_DIR = path.join(__dirname, '..', 'gtfs_supplemented');
const OUTPUT_FILE = path.join(__dirname, '..', 'public', 'data', 'departure-index.json');

// Parse trips.txt to get route_id for each trip_id
async function loadTrips() {
  const trips = {};
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(GTFS_DIR, 'trips.txt')),
    crlfDelay: Infinity
  });

  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    const [route_id, trip_id] = line.split(',');
    trips[trip_id] = route_id;
  }
  return trips;
}

// Build departure index from stop_times.txt
async function buildDepartureIndex(trips) {
  // Structure: { stopId: { line: [mins, mins, ...] } }
  const index = {};

  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(GTFS_DIR, 'stop_times.txt')),
    crlfDelay: Infinity
  });

  let isHeader = true;
  let count = 0;

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    count++;
    if (count % 1000000 === 0) console.log(`  Processed ${count / 1000000}M rows...`);

    const parts = line.split(',');
    const trip_id = parts[0];
    const stop_id = parts[1];
    const departure_time = parts[3];

    const route_id = trips[trip_id];
    if (!route_id) continue;

    // Parse time to minutes from midnight
    const [h, m] = departure_time.split(':').map(Number);
    const mins = h * 60 + m;

    // Use base stop ID (without direction for now, we'll handle both)
    if (!index[stop_id]) index[stop_id] = {};
    if (!index[stop_id][route_id]) index[stop_id][route_id] = [];
    index[stop_id][route_id].push(mins);
  }

  console.log(`  Total rows: ${count}`);
  console.log(`  Unique stops: ${Object.keys(index).length}`);

  // Sort all departure arrays and remove duplicates
  let totalDepartures = 0;
  for (const stopId of Object.keys(index)) {
    for (const line of Object.keys(index[stopId])) {
      const sorted = [...new Set(index[stopId][line])].sort((a, b) => a - b);
      index[stopId][line] = sorted;
      totalDepartures += sorted.length;
    }
  }

  console.log(`  Total departures indexed: ${totalDepartures}`);

  return index;
}

async function main() {
  console.log('Loading trips...');
  const trips = await loadTrips();
  console.log(`  Loaded ${Object.keys(trips).length} trips`);

  console.log('\nBuilding departure index...');
  const index = await buildDepartureIndex(trips);

  // The full index is too large - let's compress it
  // Store only unique departure times per stop/line combo
  console.log(`\nWriting to ${OUTPUT_FILE}...`);

  // Write as JSON (will be ~20-30MB)
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index));

  const stats = fs.statSync(OUTPUT_FILE);
  console.log(`  File size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  console.log('Done!');
}

main().catch(console.error);
