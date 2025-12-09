const fs = require('fs');
const path = require('path');

// CONFIG
const STOPS_FILE = './subway_stops.txt';
const TRANSIT_FILE = './map_designs/newest_map/js/transit_data.json';
const OUTPUT_FILE = './map_designs/newest_map/js/transit_data_enriched.json';

// 1. Parse the MTA Data
console.log('📖 Reading subway_stops.txt...');
const stopsRaw = fs.readFileSync(STOPS_FILE, 'utf8').split('\n');
const mtaStations = [];

// Skip header row (stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station)
stopsRaw.slice(1).forEach(line => {
    const cols = line.trim().split(',');
    // We only want Parent Stations (location_type === '1')
    if (cols[4] === '1') {
        mtaStations.push({
            id: cols[0],
            name: cols[1],
            lat: parseFloat(cols[2]),
            lng: parseFloat(cols[3])
        });
    }
});
console.log(`✅ Found ${mtaStations.length} parent stations in MTA data.`);

// 2. Read Your Venue Data
console.log('📖 Reading transit_data.json...');
let transitData;
let myStations;
try {
    transitData = JSON.parse(fs.readFileSync(TRANSIT_FILE, 'utf8'));
    myStations = transitData.stations; // stations are nested under .stations
    if (!myStations || !Array.isArray(myStations)) {
        console.error("❌ No 'stations' array found in transit_data.json");
        process.exit(1);
    }
} catch (e) {
    console.error("❌ Could not read transit_data.json. Make sure it exists!");
    process.exit(1);
}
console.log(`✅ Found ${myStations.length} stations in your data.`);

// 3. Match 'Em Up
let matchCount = 0;
const enrichedStations = myStations.map(station => {
    // Find closest MTA station using Pythagoras (good enough for short distances)
    let closest = null;
    let minDist = Infinity;

    mtaStations.forEach(mta => {
        const dist = Math.sqrt(
            Math.pow(station.lat - mta.lat, 2) + 
            Math.pow(station.lng - mta.lng, 2)
        );
        if (dist < minDist) {
            minDist = dist;
            closest = mta;
        }
    });

    // Threshold: ~0.002 degrees is roughly 200 meters. 
    // If it's further than that, it might be a mismatch, but we'll map it anyway and log a warning.
    if (closest) {
        matchCount++;
        // Log outliers just in case
        if (minDist > 0.005) {
            console.warn(`⚠️ Weak Match: "${station.name}" -> mapped to "${closest.name}" (${closest.id})`);
        }
        
        return {
            ...station,
            gtfsStopId: closest.id // <--- THE GOLDEN TICKET
        };
    }
    return station;
});

// 4. Save (preserve full structure, just update stations)
transitData.stations = enrichedStations;
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(transitData, null, 2));
console.log(`\n🎉 Done! Mapped ${matchCount} stations.`);
console.log(`💾 Saved to ${OUTPUT_FILE}`);
console.log(`👉 Review the file, then rename it to ${TRANSIT_FILE} to go live.`);