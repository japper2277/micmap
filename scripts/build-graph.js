/**
 * SUBWAY GRAPH BUILDER
 * --------------------
 * Parses MTA GTFS data and builds:
 * 1. graph-weekday.json - Weekday subway topology
 * 2. graph-weekend.json - Weekend subway topology
 * 3. stations.json - Station metadata (names, coords, node mappings)
 *
 * Usage: node scripts/build-graph.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const GTFS_DIR = 'gtfs_supplemented';
const OUTPUT_DIR = 'public/data';

// --- SUPER COMPLEXES (Hardcoded Tunnel Transfers) ---
// These connect stations that GTFS treats as separate but are actually linked
const SUPER_COMPLEXES = [
    // Times Square Complex
    { from: '127', to: 'A27', time: 180 },  // Times Sq (1/2/3) <-> Port Auth (A/C/E)
    { from: 'A27', to: '127', time: 180 },
    { from: '127', to: '725', time: 120 },  // Times Sq (1/2/3) <-> Times Sq (7)
    { from: '725', to: '127', time: 120 },
    { from: '127', to: 'R16', time: 120 },  // Times Sq (1/2/3) <-> Times Sq (N/Q/R/W)
    { from: 'R16', to: '127', time: 120 },
    { from: '725', to: 'R16', time: 120 },  // Times Sq (7) <-> Times Sq (N/Q/R/W)
    { from: 'R16', to: '725', time: 120 },
    { from: 'A27', to: 'R16', time: 180 },  // Port Auth (A/C/E) <-> Times Sq (N/Q/R/W)
    { from: 'R16', to: 'A27', time: 180 },

    // 14th Street Complex
    { from: '132', to: '635', time: 180 },  // 14 St (1/2/3) <-> Union Sq (4/5/6)
    { from: '635', to: '132', time: 180 },
    { from: '635', to: 'A31', time: 240 },  // Union Sq (4/5/6) <-> 14 St (A/C/E)
    { from: 'A31', to: '635', time: 240 },
    { from: '635', to: 'L03', time: 120 },  // Union Sq (4/5/6) <-> Union Sq (L)
    { from: 'L03', to: '635', time: 120 },
    { from: '132', to: 'A31', time: 240 },  // 14 St (1/2/3) <-> 14 St (A/C/E)
    { from: 'A31', to: '132', time: 240 },

    // Fulton Complex
    { from: '418', to: '419', time: 120 },  // Fulton (2/3) <-> Fulton (4/5)
    { from: '419', to: '418', time: 120 },
    { from: '419', to: 'A38', time: 120 },  // Fulton (4/5) <-> Fulton (A/C)
    { from: 'A38', to: '419', time: 120 },
    { from: 'A38', to: '229', time: 120 },  // Fulton (A/C) <-> Fulton (J/Z)
    { from: '229', to: 'A38', time: 120 },
    { from: '418', to: 'A38', time: 120 },  // Fulton (2/3) <-> Fulton (A/C)
    { from: 'A38', to: '418', time: 120 },
];

// --- CSV HELPERS ---
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else current += char;
    }
    result.push(current.trim());
    return result;
}

async function readCSV(filename, rowCallback) {
    const filePath = path.join(GTFS_DIR, filename);
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ File not found: ${filename}`);
        return;
    }
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let headers = null;
    let rowCount = 0;
    for await (const line of rl) {
        if (!line.trim()) continue;
        const cleanLine = line.replace(/^\uFEFF/, ''); // Strip BOM
        const cols = parseCSVLine(cleanLine);
        if (!headers) {
            headers = cols;
            continue;
        }
        const row = {};
        headers.forEach((h, i) => {
            if (cols[i] !== undefined) row[h] = cols[i];
        });
        rowCallback(row);
        rowCount++;
    }
    return rowCount;
}

function parseTime(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(':').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    // GTFS uses hours > 24 for late night (25:30:00 = 1:30 AM)
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
}

// --- MAIN BUILDER ---
async function buildGraph() {
    console.log('🚀 Starting Subway Graph Build...\n');

    // 1. Parse calendar.txt for service IDs
    console.log('📅 Parsing calendar.txt...');
    const serviceIds = { weekday: new Set(), weekend: new Set() };
    await readCSV('calendar.txt', (row) => {
        if (row.monday === '1') serviceIds.weekday.add(row.service_id);
        if (row.saturday === '1' || row.sunday === '1') serviceIds.weekend.add(row.service_id);
    });
    console.log(`   Weekday services: ${serviceIds.weekday.size}`);
    console.log(`   Weekend services: ${serviceIds.weekend.size}`);

    // 2. Parse trips.txt
    console.log('🚇 Parsing trips.txt...');
    const trips = [];
    await readCSV('trips.txt', (row) => {
        trips.push({
            id: row.trip_id,
            route: row.route_id,
            service: row.service_id
        });
    });
    console.log(`   Trips loaded: ${trips.length}`);

    // 3. Parse stops.txt - Build stop info AND station metadata
    console.log('📍 Parsing stops.txt...');
    const stopsInfo = {};          // stop_id -> { id, parent }
    const stationMeta = {};        // parent_id -> { name, lat, lng, nodes }
    const parentToChildren = {};   // parent_id -> [child_stop_ids]

    await readCSV('stops.txt', (row) => {
        stopsInfo[row.stop_id] = {
            id: row.stop_id,
            parent: row.parent_station || null
        };

        const parent = row.parent_station || row.stop_id;

        // Build metadata for parent stations only (location_type=1 or no parent)
        if (!row.parent_station && row.stop_lat && row.stop_lon) {
            stationMeta[row.stop_id] = {
                name: row.stop_name,
                lat: parseFloat(row.stop_lat),
                lng: parseFloat(row.stop_lon),
                nodes: []
            };
        }

        if (!parentToChildren[parent]) parentToChildren[parent] = [];
        parentToChildren[parent].push(row.stop_id);
    });
    console.log(`   Stops loaded: ${Object.keys(stopsInfo).length}`);
    console.log(`   Parent stations: ${Object.keys(stationMeta).length}`);

    // 4. Parse stop_times.txt (LARGE FILE - streaming)
    console.log('⏱️  Parsing stop_times.txt (this may take a moment)...');
    const tripStops = {};
    const rowCount = await readCSV('stop_times.txt', (row) => {
        const tid = row.trip_id;
        if (!tripStops[tid]) tripStops[tid] = [];
        tripStops[tid].push({
            stopId: row.stop_id,
            time: parseTime(row.arrival_time),
            seq: parseInt(row.stop_sequence)
        });
    });
    console.log(`   Stop times loaded: ${rowCount}`);

    // Sort each trip's stops by sequence
    Object.values(tripStops).forEach(list => list.sort((a, b) => a.seq - b.seq));

    // 5. Parse transfers.txt
    console.log('🔄 Parsing transfers.txt...');
    const officialTransfers = [];
    await readCSV('transfers.txt', (row) => {
        // transfer_type 3 = not possible, skip those
        if (row.from_stop_id !== row.to_stop_id && row.transfer_type !== '3') {
            officialTransfers.push({
                from: row.from_stop_id,
                to: row.to_stop_id,
                time: parseInt(row.min_transfer_time) || 180
            });
        }
    });
    console.log(`   Official transfers: ${officialTransfers.length}`);

    // --- GRAPH GENERATOR ---
    function generate(mode) {
        console.log(`\n🏗️  Building ${mode.toUpperCase()} graph...`);
        const graph = {};
        const relevantServices = serviceIds[mode];
        const addedEdges = new Set();
        const parentToNodes = {};  // parent_id -> Set of node IDs in this graph

        // Helper: Add edge with deduplication
        const addEdge = (u, v, time, type, line = null) => {
            const key = `${u}|${v}`;
            if (addedEdges.has(key)) return;
            if (!graph[u]) graph[u] = [];
            const edge = { to: v, time, type };
            if (line) edge.line = line;
            graph[u].push(edge);
            addedEdges.add(key);
        };

        // Helper: Track node's parent station
        const trackNode = (nodeId, stopId) => {
            const stopInfo = stopsInfo[stopId];
            const parent = stopInfo?.parent || stopInfo?.id || stopId;
            if (!parentToNodes[parent]) parentToNodes[parent] = new Set();
            parentToNodes[parent].add(nodeId);
        };

        // A. Build RIDE edges from stop_times
        let rideEdges = 0;
        trips.forEach(trip => {
            if (!relevantServices.has(trip.service)) return;
            const tripStopList = tripStops[trip.id];
            if (!tripStopList || tripStopList.length < 2) return;

            for (let i = 0; i < tripStopList.length - 1; i++) {
                const fromStop = tripStopList[i];
                const toStop = tripStopList[i + 1];

                const u = `${fromStop.stopId}_${trip.route}`;
                const v = `${toStop.stopId}_${trip.route}`;

                // Calculate ride time (handle missing/invalid times)
                let time = 120; // Default 2 min if calculation fails
                if (fromStop.time !== null && toStop.time !== null) {
                    time = toStop.time - fromStop.time;
                    if (time < 0) time = 120; // Fallback for wraparound issues
                }

                addEdge(u, v, time, 'ride', trip.route);
                rideEdges++;

                // Track which parent station each node belongs to
                trackNode(u, fromStop.stopId);
                trackNode(v, toStop.stopId);
            }
        });
        console.log(`   Ride edges: ${addedEdges.size}`);

        // B. TRANSFER EXPLOSION - Connect nodes between stations
        const processTransfer = (fromParent, toParent, time) => {
            const fromNodes = parentToNodes[fromParent];
            const toNodes = parentToNodes[toParent];
            if (!fromNodes || !toNodes) return;

            fromNodes.forEach(u => {
                toNodes.forEach(v => {
                    if (u === v) return;
                    const lineU = u.split('_')[1];
                    const lineV = v.split('_')[1];
                    if (lineU === lineV) return; // Same line = ride, not transfer
                    addEdge(u, v, time, 'transfer');
                });
            });
        };

        // Official transfers from transfers.txt
        officialTransfers.forEach(t => {
            processTransfer(t.from, t.to, t.time);
            processTransfer(t.to, t.from, t.time); // Bidirectional
        });

        // Super complex hardcoded transfers
        SUPER_COMPLEXES.forEach(c => {
            processTransfer(c.from, c.to, c.time);
        });

        const afterOfficialTransfers = addedEdges.size;
        console.log(`   After official transfers: ${afterOfficialTransfers}`);

        // C. IMPLICIT TRANSFERS - Same station, different lines
        Object.entries(parentToNodes).forEach(([parent, nodes]) => {
            const nodeArray = Array.from(nodes);
            for (let i = 0; i < nodeArray.length; i++) {
                for (let j = 0; j < nodeArray.length; j++) {
                    if (i === j) continue;
                    const u = nodeArray[i];
                    const v = nodeArray[j];
                    const lineU = u.split('_')[1];
                    const lineV = v.split('_')[1];
                    if (lineU === lineV) continue;
                    // Only add if not already added by official transfers
                    if (!addedEdges.has(`${u}|${v}`)) {
                        addEdge(u, v, 120, 'transfer'); // 2 min default
                    }
                }
            }
        });
        console.log(`   After implicit transfers: ${addedEdges.size}`);

        // D. Accumulate nodes into stationMeta
        Object.entries(parentToNodes).forEach(([parent, nodes]) => {
            if (stationMeta[parent]) {
                nodes.forEach(n => {
                    if (!stationMeta[parent].nodes.includes(n)) {
                        stationMeta[parent].nodes.push(n);
                    }
                });
            }
        });

        // Save graph
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        }
        const outPath = path.join(OUTPUT_DIR, `graph-${mode}.json`);
        fs.writeFileSync(outPath, JSON.stringify(graph));
        const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);
        console.log(`   ✅ Saved: graph-${mode}.json (${sizeKB} KB, ${Object.keys(graph).length} nodes)`);

        return { nodes: Object.keys(graph).length, edges: addedEdges.size };
    }

    // Generate both graphs
    const weekdayStats = generate('weekday');
    const weekendStats = generate('weekend');

    // Save station metadata
    console.log('\n💾 Saving station metadata...');
    const metaPath = path.join(OUTPUT_DIR, 'stations.json');
    fs.writeFileSync(metaPath, JSON.stringify(stationMeta));
    const metaSizeKB = (fs.statSync(metaPath).size / 1024).toFixed(0);
    console.log(`   ✅ Saved: stations.json (${metaSizeKB} KB, ${Object.keys(stationMeta).length} stations)`);

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('BUILD COMPLETE');
    console.log('='.repeat(50));
    console.log(`Weekday: ${weekdayStats.nodes} nodes, ${weekdayStats.edges} edges`);
    console.log(`Weekend: ${weekendStats.nodes} nodes, ${weekendStats.edges} edges`);
    console.log(`Stations: ${Object.keys(stationMeta).length}`);
    console.log('='.repeat(50));
}

buildGraph().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
