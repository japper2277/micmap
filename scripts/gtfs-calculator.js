/**
 * GTFS Transit Calculator
 *
 * Calculates subway ride times and transfer times from MTA GTFS data.
 * No external API calls needed - completely free!
 *
 * Usage:
 *   node scripts/gtfs-calculator.js
 *
 * Or import functions:
 *   const { getRideTime, getTransferTime, findRoute } = require('./gtfs-calculator');
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================
const GTFS_DIR = path.join(__dirname, '..', 'gtfs_supplemented');

// =============================================================================
// CSV PARSER (simple, no dependencies)
// =============================================================================
function parseCSV(filepath) {
    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',');

    return lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((h, i) => {
            obj[h.trim()] = values[i]?.trim() || '';
        });
        return obj;
    });
}

// =============================================================================
// LOAD GTFS DATA
// =============================================================================
console.log('📂 Loading GTFS data...');

const stops = parseCSV(path.join(GTFS_DIR, 'stops.txt'));
const transfers = parseCSV(path.join(GTFS_DIR, 'transfers.txt'));
const stopTimes = parseCSV(path.join(GTFS_DIR, 'stop_times.txt'));
const trips = parseCSV(path.join(GTFS_DIR, 'trips.txt'));
const routes = parseCSV(path.join(GTFS_DIR, 'routes.txt'));

console.log(`   ✓ ${stops.length} stops`);
console.log(`   ✓ ${transfers.length} transfers`);
console.log(`   ✓ ${stopTimes.length} stop times`);
console.log(`   ✓ ${trips.length} trips`);
console.log(`   ✓ ${routes.length} routes`);

// =============================================================================
// BUILD LOOKUP TABLES
// =============================================================================
console.log('\n🔨 Building lookup tables...');

// Stop ID → Stop Info
const stopLookup = {};
stops.forEach(s => {
    stopLookup[s.stop_id] = {
        name: s.stop_name,
        lat: parseFloat(s.stop_lat),
        lng: parseFloat(s.stop_lon),
        parentStation: s.parent_station || s.stop_id
    };
});

// Stop Name → Stop IDs (for searching by name)
const stopNameLookup = {};
stops.forEach(s => {
    const name = s.stop_name.toLowerCase();
    if (!stopNameLookup[name]) stopNameLookup[name] = [];
    stopNameLookup[name].push(s.stop_id);
});

// Transfer lookup: "fromStop:toStop" → seconds
const transferLookup = {};
transfers.forEach(t => {
    const key = `${t.from_stop_id}:${t.to_stop_id}`;
    transferLookup[key] = parseInt(t.min_transfer_time) || 180; // default 3 min
});

// Trip ID → Route ID
const tripToRoute = {};
trips.forEach(t => {
    tripToRoute[t.trip_id] = t.route_id;
});

// Route ID → Route Name
const routeNames = {};
routes.forEach(r => {
    routeNames[r.route_id] = r.route_short_name || r.route_id;
});

// Group stop_times by trip_id for faster lookup
const tripStopTimes = {};
stopTimes.forEach(st => {
    if (!tripStopTimes[st.trip_id]) tripStopTimes[st.trip_id] = [];
    tripStopTimes[st.trip_id].push(st);
});

// Sort each trip's stops by sequence
Object.values(tripStopTimes).forEach(stops => {
    stops.sort((a, b) => parseInt(a.stop_sequence) - parseInt(b.stop_sequence));
});

// Build route → trips mapping
const routeTrips = {};
trips.forEach(t => {
    if (!routeTrips[t.route_id]) routeTrips[t.route_id] = [];
    routeTrips[t.route_id].push(t.trip_id);
});

console.log('   ✓ Lookup tables ready');

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Parse GTFS time (HH:MM:SS) to minutes from midnight
function parseTime(timeStr) {
    const [h, m, s] = timeStr.split(':').map(Number);
    return h * 60 + m + s / 60;
}

// Get parent station ID (strips N/S suffix)
function getParentStation(stopId) {
    return stopLookup[stopId]?.parentStation || stopId.replace(/[NS]$/, '');
}

// Find stop IDs by name (fuzzy search)
function findStopsByName(query) {
    const q = query.toLowerCase();
    const matches = [];

    for (const [name, ids] of Object.entries(stopNameLookup)) {
        if (name.includes(q)) {
            matches.push({ name: stops.find(s => s.stop_id === ids[0])?.stop_name, ids });
        }
    }

    return matches.slice(0, 10); // limit results
}

// =============================================================================
// TRANSFER TIME CALCULATOR
// =============================================================================

/**
 * Get transfer time between two stops (in minutes)
 * @param {string} fromStopId - Origin stop ID
 * @param {string} toStopId - Destination stop ID
 * @returns {number} Transfer time in minutes
 */
function getTransferTime(fromStopId, toStopId) {
    // Try exact match
    let key = `${fromStopId}:${toStopId}`;
    if (transferLookup[key]) {
        return Math.ceil(transferLookup[key] / 60);
    }

    // Try parent stations
    const fromParent = getParentStation(fromStopId);
    const toParent = getParentStation(toStopId);

    key = `${fromParent}:${toParent}`;
    if (transferLookup[key]) {
        return Math.ceil(transferLookup[key] / 60);
    }

    // Try with N/S suffixes
    for (const fromSuffix of ['', 'N', 'S']) {
        for (const toSuffix of ['', 'N', 'S']) {
            key = `${fromParent}${fromSuffix}:${toParent}${toSuffix}`;
            if (transferLookup[key]) {
                return Math.ceil(transferLookup[key] / 60);
            }
        }
    }

    // Same station = 3 min default
    if (fromParent === toParent) {
        return 3;
    }

    // Different stations = estimate based on typical walking
    return 5;
}

// =============================================================================
// RIDE TIME CALCULATOR
// =============================================================================

/**
 * Get ride time between two stops on the same line (in minutes)
 * @param {string} fromStopId - Origin stop ID
 * @param {string} toStopId - Destination stop ID
 * @param {string} routeId - Route/Line ID (optional, will search all if not provided)
 * @returns {number|null} Ride time in minutes, or null if no direct route
 */
function getRideTime(fromStopId, toStopId, routeId = null) {
    const fromParent = getParentStation(fromStopId);
    const toParent = getParentStation(toStopId);

    // Get routes to search
    const routesToSearch = routeId ? [routeId] : Object.keys(routeTrips);

    for (const route of routesToSearch) {
        const tripIds = routeTrips[route] || [];

        // Sample a few trips to get average ride time
        const sampleTrips = tripIds.slice(0, 20);

        for (const tripId of sampleTrips) {
            const stops = tripStopTimes[tripId];
            if (!stops) continue;

            // Find both stops in this trip
            let fromIdx = -1;
            let toIdx = -1;

            for (let i = 0; i < stops.length; i++) {
                const stopParent = getParentStation(stops[i].stop_id);
                if (stopParent === fromParent && fromIdx === -1) fromIdx = i;
                if (stopParent === toParent) toIdx = i;
            }

            // Both stops found and in correct order
            if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
                const fromTime = parseTime(stops[fromIdx].arrival_time);
                const toTime = parseTime(stops[toIdx].arrival_time);
                const rideTime = Math.round(toTime - fromTime);

                if (rideTime > 0 && rideTime < 120) { // sanity check
                    return rideTime;
                }
            }
        }
    }

    return null; // No direct route found
}

// =============================================================================
// ROUTE FINDER
// =============================================================================

/**
 * Find the best route between two stations
 * @param {string} fromStopId - Origin stop ID
 * @param {string} toStopId - Destination stop ID
 * @returns {object} Route info with legs and total time
 */
function findRoute(fromStopId, toStopId) {
    const fromParent = getParentStation(fromStopId);
    const toParent = getParentStation(toStopId);

    // Try direct route first
    for (const routeId of Object.keys(routeTrips)) {
        const rideTime = getRideTime(fromStopId, toStopId, routeId);
        if (rideTime !== null) {
            return {
                type: 'direct',
                line: routeNames[routeId] || routeId,
                rideTime,
                totalTime: rideTime,
                legs: [{
                    from: stopLookup[fromStopId]?.name || fromStopId,
                    to: stopLookup[toStopId]?.name || toStopId,
                    line: routeNames[routeId] || routeId,
                    time: rideTime
                }]
            };
        }
    }

    // TODO: Add transfer logic for multi-leg routes
    // This would involve finding common transfer points

    return {
        type: 'no_direct_route',
        message: 'No direct route found. Transfer required.',
        fromStation: stopLookup[fromStopId]?.name || fromStopId,
        toStation: stopLookup[toStopId]?.name || toStopId
    };
}

// =============================================================================
// BUILD STATION-TO-STATION MATRIX
// =============================================================================

/**
 * Build a matrix of ride times between all station pairs on a line
 * @param {string} routeId - Route/Line ID
 * @returns {object} Matrix of ride times
 */
function buildLineMatrix(routeId) {
    const matrix = {};
    const tripIds = routeTrips[routeId] || [];

    if (tripIds.length === 0) return matrix;

    // Get all stops on this line from a sample trip
    const sampleTrip = tripStopTimes[tripIds[0]];
    if (!sampleTrip) return matrix;

    const lineStops = sampleTrip.map(st => ({
        id: getParentStation(st.stop_id),
        name: stopLookup[st.stop_id]?.name || st.stop_id,
        time: parseTime(st.arrival_time)
    }));

    // Build matrix
    for (let i = 0; i < lineStops.length; i++) {
        const from = lineStops[i];
        matrix[from.id] = {};

        for (let j = i + 1; j < lineStops.length; j++) {
            const to = lineStops[j];
            const rideTime = Math.round(to.time - from.time);
            if (rideTime > 0) {
                matrix[from.id][to.id] = rideTime;
            }
        }
    }

    return matrix;
}

// =============================================================================
// EXPORTS
// =============================================================================
module.exports = {
    // Core functions
    getTransferTime,
    getRideTime,
    findRoute,
    buildLineMatrix,

    // Lookup helpers
    findStopsByName,
    getParentStation,

    // Raw data (if needed)
    stopLookup,
    transferLookup,
    routeNames,
    routeTrips
};

// =============================================================================
// CLI INTERFACE
// =============================================================================
if (require.main === module) {
    console.log('\n' + '='.repeat(60));
    console.log('GTFS TRANSIT CALCULATOR - Interactive Mode');
    console.log('='.repeat(60));

    // Example: Times Square to 14th St
    console.log('\n📍 Example: Times Square to 14th St-Union Sq');

    // Find Times Square stops
    const tsStops = findStopsByName('times sq');
    console.log('\nTimes Square stops found:');
    tsStops.slice(0, 3).forEach(s => console.log(`   ${s.name}: ${s.ids.join(', ')}`));

    // Find 14th St stops
    const fourteenthStops = findStopsByName('14 st');
    console.log('\n14th St stops found:');
    fourteenthStops.slice(0, 3).forEach(s => console.log(`   ${s.name}: ${s.ids.join(', ')}`));

    // Example transfer time
    console.log('\n⏱️  Transfer Times:');
    console.log(`   Same platform (127 → 127): ${getTransferTime('127', '127')} min`);
    console.log(`   Times Sq 1/2/3 ↔ A/C/E: ${getTransferTime('127', 'A27')} min`);

    // Example ride time
    console.log('\n🚇 Ride Times:');
    const ride1 = getRideTime('127', '132', '1'); // 1 train: Times Sq to 14th
    console.log(`   1 train: Times Sq (127) → 14th St (132): ${ride1 || 'N/A'} min`);

    // Build 1 train matrix sample
    console.log('\n📊 Sample Matrix (1 train):');
    const matrix1 = buildLineMatrix('1');
    const matrixEntries = Object.entries(matrix1).slice(0, 3);
    matrixEntries.forEach(([from, dests]) => {
        const sample = Object.entries(dests).slice(0, 3);
        sample.forEach(([to, time]) => {
            const fromName = stopLookup[from]?.name || from;
            const toName = stopLookup[to]?.name || to;
            console.log(`   ${fromName} → ${toName}: ${time} min`);
        });
    });

    console.log('\n✅ Calculator ready! Import functions for use in your app.');
}
