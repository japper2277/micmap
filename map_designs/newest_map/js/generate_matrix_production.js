require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// =============================================================================
// CONFIGURATION
// =============================================================================
const DRY_RUN = false; // ⚠️ Set to FALSE to perform real API calls (~$0.50 - $1.00)
const CLUSTER_RADIUS_MILES = 0.15;
const STATION_SEARCH_RADIUS = 0.3;
const MTA_DATA_URL = "http://web.mta.info/developers/data/nyct/subway/Stations.csv";

// Fixed Departure Time: Next Friday at 7:00 PM
// This ensures consistency. We don't want "3:00 AM" traffic if we run this at night.
const getNextFriday7PM = () => {
    const d = new Date();
    d.setDate(d.getDate() + (5 + 7 - d.getDay()) % 7);
    d.setHours(19, 0, 0, 0);
    return Math.floor(d.getTime() / 1000); // Unix timestamp
};
const DEPARTURE_TIME = getNextFriday7PM();

// =============================================================================
// 1. RAW VENUE DATA (ALL 102 VENUES)
// =============================================================================
const RAW_VENUES = [
    // === BRONX ===
    { title: "iNINE Bistro", hood: "South Bronx", address: "53 Bruckner Blvd, Bronx, NY 10454", lat: 40.8067535, lng: -73.9266818, borough: "Bronx" },

    // === BROOKLYN ===
    { title: "Alligator Lounge", hood: "Williamsburg", address: "600 Metropolitan Ave, Brooklyn, NY 11211", lat: 40.7139062, lng: -73.9489165, borough: "Brooklyn" },
    { title: "Alphaville", hood: "Bushwick", address: "1288 Myrtle Ave, Brooklyn, NY 11221", lat: 40.698006, lng: -73.925272, borough: "Brooklyn" },
    { title: "Alphaville Bar", hood: "Bushwick", address: "140 Wilson Ave, Brooklyn, NY 11237", lat: 40.7005289, lng: -73.9258157, borough: "Brooklyn" },
    { title: "BKLYN Made Comedy", hood: "Bushwick", address: "1241 Halsey St, New York, NY 11237", lat: 40.6939773, lng: -73.9073961, borough: "Brooklyn" },
    { title: "Block Hill Station", hood: "Park Slope", address: "718 5th Ave, Brooklyn, NY 11215", lat: 40.6605429, lng: -73.9945714, borough: "Brooklyn" },
    { title: "Branded Saloon", hood: "Park Slope", address: "603 Vanderbilt Ave, Brooklyn, NY 11238", lat: 40.6792534, lng: -73.968081, borough: "Brooklyn" },
    { title: "Brooklyn Art Haus", hood: "Williamsburg", address: "24 Marcy Ave, Brooklyn, NY 11211", lat: 40.7133906, lng: -73.9549636, borough: "Brooklyn" },
    { title: "Brooklyn Comedy Collective", hood: "East Williamsburg", address: "167 Graham Ave, Brooklyn, NY 11206", lat: 40.7077362, lng: -73.9434301, borough: "Brooklyn" },
    { title: "Brooklyn Dreams Juice Lounge", hood: "Bushwick", address: "1276 Broadway, Brooklyn, NY 11221", lat: 40.6910162, lng: -73.9249124, borough: "Brooklyn" },
    { title: "Bushwick Comedy Club", hood: "Bushwick", address: "259 Melrose St, Brooklyn, NY 11206", lat: 40.702, lng: -73.9299503, borough: "Brooklyn" },
    { title: "Caffeine Underground", hood: "Bushwick", address: "447 Central Ave Suite A, Brooklyn, NY 11221", lat: 40.6922369, lng: -73.9144937, borough: "Brooklyn" },
    { title: "Cobra Club", hood: "East Williamsburg", address: "6 Wyckoff Ave, Brooklyn, NY 11237", lat: 40.7066852, lng: -73.9235217, borough: "Brooklyn" },
    { title: "Commune BK", hood: "Bed Stuy", address: "415 Classon Ave, Brooklyn, NY 11238", lat: 40.686831, lng: -73.9593734, borough: "Brooklyn" },
    { title: "Corner Store BK", hood: "Crown Heights", address: "753 Nostrand Ave, Brooklyn NY 11216", lat: 40.6715078, lng: -73.9502019, borough: "Brooklyn" },
    { title: "Eastville Comedy Club", hood: "Downtown Brooklyn", address: "487 Atlantic Ave, Brooklyn, NY 11217", lat: 40.6859068, lng: -73.9816185, borough: "Brooklyn" },
    { title: "Easy Lover BK", hood: "Williamsburg", address: "790 Metropolitan Ave, Brooklyn, NY 11211", lat: 40.7145615, lng: -73.9425485, borough: "Brooklyn" },
    { title: "Echo Bravo", hood: "Bushwick", address: "445 Troutman St, Brooklyn, NY 11237", lat: 40.7079355, lng: -73.9216365, borough: "Brooklyn" },
    { title: "Fiction Bar", hood: "East Williamsburg", address: "308 Hooper St, Brooklyn, NY 11211", lat: 40.7073204, lng: -73.9537223, borough: "Brooklyn" },
    { title: "Flop House Comedy Club", hood: "Williamsburg", address: "362 Grand St, Brooklyn, NY 11211", lat: 40.7122083, lng: -73.9557789, borough: "Brooklyn" },
    { title: "Freddy's", hood: "Park Slope", address: "627 5th Ave, Brooklyn, NY 11215", lat: 40.6632901, lng: -73.9911383, borough: "Brooklyn" },
    { title: "Good Judy", hood: "Park Slope", address: "563 5th Ave, Brooklyn, NY 11215", lat: 40.6652417, lng: -73.9892672, borough: "Brooklyn" },
    { title: "Gutter Bar", hood: "Williamsburg", address: "200 N 14th St, Brooklyn, NY 11249", lat: 40.7227408, lng: -73.9554759, borough: "Brooklyn" },
    { title: "Halyards", hood: "Gowanus", address: "406 3rd Ave, Brooklyn, NY 11215", lat: 40.6732561, lng: -73.9897416, borough: "Brooklyn" },
    { title: "Hell Phone", hood: "Williamsburg", address: "247 Varet St, Brooklyn, NY 11206", lat: 40.7042359, lng: -73.934179, borough: "Brooklyn" },
    { title: "Island Ribhouse", hood: "Crown Heights", address: "611 Nostrand Ave, Brooklyn, NY 11216", lat: 40.6762978, lng: -73.9496345, borough: "Brooklyn" },
    { title: "Isola", hood: "Williamsburg", address: "361 Metropolitan Ave, Brooklyn NY 11211", lat: 40.7142437, lng: -73.9558401, borough: "Brooklyn" },
    { title: "Logan's Run Bar", hood: "Park Slope", address: "375a 5th Ave, Brooklyn, NY 11215", lat: 40.662189, lng: -73.9925465, borough: "Brooklyn" },
    { title: "O'Keefe's Bar", hood: "Downtown Brooklyn", address: "62 Court St, Brooklyn, NY 11201", lat: 40.6920277, lng: -73.9914226, borough: "Brooklyn" },
    { title: "Pete's Candy Store", hood: "Williamsburg", address: "709 Lorimer St, Brooklyn, NY 11211", lat: 40.7180926, lng: -73.9502883, borough: "Brooklyn" },
    { title: "Pine Box Rock Shop", hood: "East Williamsburg", address: "12 Grattan St, Brooklyn, NY 11206", lat: 40.7052293, lng: -73.9326664, borough: "Brooklyn" },
    { title: "Rose R&R Bar", hood: "Williamsburg", address: "457 Graham Ave, Brooklyn, NY 11222", lat: 40.719117, lng: -73.9454171, borough: "Brooklyn" },
    { title: "Second City BlackBox", hood: "Williamsburg", address: "64 N 9th Street, Brooklyn, NY 11249", lat: 40.7207729, lng: -73.9596507, borough: "Brooklyn" },
    { title: "Secret Pour", hood: "Bushwick", address: "1114 DeKalb Ave, Brooklyn, NY 11221", lat: 40.6937282, lng: -73.9298594, borough: "Brooklyn" },
    { title: "Starr Bar", hood: "Bushwick", address: "214 Starr St, Brooklyn, NY 11237", lat: 40.7049722, lng: -73.9229059, borough: "Brooklyn" },
    { title: "Talon Bar", hood: "Bushwick", address: "220 Wyckoff Ave, Brooklyn, NY 11237", lat: 40.7011038, lng: -73.9143729, borough: "Brooklyn" },
    { title: "The Daily Press", hood: "Clinton Hill", address: "38 Somers St, Brooklyn, NY 11233", lat: 40.6787074, lng: -73.9107399, borough: "Brooklyn" },
    { title: "The Gutter Williamsburg", hood: "Greenpoint/Williamsburg", address: "200 N 14th St, Brooklyn, NY 11249", lat: 40.7227408, lng: -73.9554759, borough: "Brooklyn" },
    { title: "The Tiny Cupboard", hood: "Bushwick", address: "10 Cooper St, Brooklyn, NY 11207", lat: 40.6836915, lng: -73.9112136, borough: "Brooklyn" },

    // === MANHATTAN ===
    { title: "Black Cat LES", hood: "LES", address: "140 Eldridge St, New York, NY 10002", lat: 40.7190777, lng: -73.9912865, borough: "Manhattan" },
    { title: "Broadway Comedy Club", hood: "Hell's Kitchen", address: "318 W 53rd St, New York, NY 10019", lat: 40.7644391, lng: -73.9856707, borough: "Manhattan" },
    { title: "Caravan of Dreams", hood: "East Village", address: "405 E 6th St, New York, NY 10009", lat: 40.7264058, lng: -73.9856462, borough: "Manhattan" },
    { title: "Comedy in Harlem", hood: "Harlem", address: "750A St Nicholas Ave, New York, NY 10031", lat: 40.8255092, lng: -73.9433543, borough: "Manhattan" },
    { title: "Comedy Shop", hood: "Greenwich Village", address: "167 Bleecker St REAR, New York, NY 10012", lat: 40.7288305, lng: -74.0001342, borough: "Manhattan" },
    { title: "Comedy Village", hood: "Hell's Kitchen", address: "352 W 44th St, New York, NY 10036", lat: 40.7593093, lng: -73.9911149, borough: "Manhattan" },
    { title: "Comic Strip Live", hood: "UES", address: "1568 2nd Ave, New York, NY 10028", lat: 40.7748581, lng: -73.9536956, borough: "Manhattan" },
    { title: "Eastpoint Bar", hood: "East Village", address: "25 Avenue B, New York, NY 10009", lat: 40.7222419, lng: -73.9830182, borough: "Manhattan" },
    { title: "Enoch's", hood: "Hudson Yards", address: "480 10th Ave, New York, NY 10018", lat: 40.7562531, lng: -73.9976964, borough: "Manhattan" },
    { title: "Fear City Comedy Club", hood: "LES", address: "17 Essex St, New York, NY 10002", lat: 40.7152631, lng: -73.9901598, borough: "Manhattan" },
    { title: "FRIGID Theater", hood: "East Village", address: "94 St Marks Pl, New York, NY 10009", lat: 40.7272575, lng: -73.9847924, borough: "Manhattan" },
    { title: "Greenwich Village Comedy Club", hood: "Greenwich Village", address: "99 MacDougal St, New York, NY 10012", lat: 40.7296565, lng: -74.001091, borough: "Manhattan" },
    { title: "Grey Mare", hood: "LES", address: "61 2nd Ave, New York, NY 10003", lat: 40.7260295, lng: -73.9899072, borough: "Manhattan" },
    { title: "Grisly Pear", hood: "Greenwich Village", address: "107 MacDougal St, New York, NY 10012", lat: 40.7298491, lng: -74.0008199, borough: "Manhattan" },
    { title: "Grisly Pear Midtown", hood: "Midtown", address: "243 W 54th St, New York, NY 10019", lat: 40.7645366, lng: -73.9833266, borough: "Manhattan" },
    { title: "Harlem Nights Bar", hood: "Harlem", address: "2361 Adam Clayton Powell Jr Blvd, New York, NY 10030", lat: 40.8172204, lng: -73.9419721, borough: "Manhattan" },
    { title: "Hotel Edison", hood: "Midtown", address: "228 W 47th St, New York, NY 10036", lat: 40.759647, lng: -73.9862944, borough: "Manhattan" },
    { title: "Housewatch", hood: "East Village", address: "50 Avenue B, New York, NY 10009", lat: 40.7231925, lng: -73.982715, borough: "Manhattan" },
    { title: "Idaho Bar", hood: "East Village", address: "349 E 13th St, New York, NY 10003", lat: 40.7309458, lng: -73.9833528, borough: "Manhattan" },
    { title: "Janice's apt", hood: "Hell's Kitchen", address: "247 W 46th St Apt 1701, New York, NY 10036", lat: 40.7598818, lng: -73.9874267, borough: "Manhattan" },
    { title: "Judy Z's", hood: "West Village", address: "1 7th Ave S, New York, NY 10014", lat: 40.7297052, lng: -74.0048523, borough: "Manhattan" },
    { title: "KGB Bar", hood: "East Village", address: "85 E 4th St, New York, NY 10003", lat: 40.7265891, lng: -73.9898025, borough: "Manhattan" },
    { title: "Luxor Lounge", hood: "Greenwich Village", address: "118 MacDougal St, New York, NY 10012", lat: 40.7297418, lng: -74.0004218, borough: "Manhattan" },
    { title: "New York Comedy Club East Village", hood: "East Village", address: "85 E 4th St, New York, NY 10003", lat: 40.7265891, lng: -73.9898025, borough: "Manhattan" },
    { title: "New York Comedy Club Midtown", hood: "Gramercy", address: "241 E 24th St, New York, NY 10010", lat: 40.7389213, lng: -73.9808057, borough: "Manhattan" },
    { title: "NYC Suite Bar", hood: "UWS", address: "992 Amsterdam Ave, New York, NY 10025", lat: 40.8026454, lng: -73.964587, borough: "Manhattan" },
    { title: "Oh Craft Beer Harlem", hood: "Harlem", address: "1739 Amsterdam Ave, New York, NY 10031", lat: 40.8259371, lng: -73.9468664, borough: "Manhattan" },
    { title: "One and One", hood: "East Village", address: "76 E 1st St, New York, NY 10009", lat: 40.7232525, lng: -73.9881492, borough: "Manhattan" },
    { title: "Phoenix Bar", hood: "East Village", address: "50 Avenue B, New York, NY 10009", lat: 40.7231925, lng: -73.982715, borough: "Manhattan" },
    { title: "Phoenix Bar Avenue A", hood: "East Village", address: "447 E 13th St, New York, NY 10009", lat: 40.7299744, lng: -73.9811697, borough: "Manhattan" },
    { title: "Producer's Club", hood: "Hell's Kitchen", address: "358 W 44th St, New York, NY 10036", lat: 40.7595017, lng: -73.9914437, borough: "Manhattan" },
    { title: "Pubkey", hood: "Greenwich Village", address: "85 Washington Pl, New York, NY 10011", lat: 40.732185, lng: -74.0000205, borough: "Manhattan" },
    { title: "Rodney's", hood: "UES", address: "1118 1st Ave, New York, NY 10065", lat: 40.7610441, lng: -73.960624, borough: "Manhattan" },
    { title: "Sesh Comedy", hood: "LES", address: "140 Eldridge St, New York, NY 10002", lat: 40.7190777, lng: -73.9912865, borough: "Manhattan" },
    { title: "SkyBox Sports Bar & Grill", hood: "UES", address: "2241 1st Ave, New York, NY 10029", lat: 40.7955865, lng: -73.9360676, borough: "Manhattan" },
    { title: "Soho Playhouse", hood: "SoHo", address: "15 Vandam St, New York, NY 10013", lat: 40.7264507, lng: -74.0043756, borough: "Manhattan" },
    { title: "St. Marks Comedy Club", hood: "East Village", address: "12 St Marks Pl, New York, NY 10003", lat: 40.7290207, lng: -73.9893198, borough: "Manhattan" },
    { title: "Stella & Fly", hood: "Upper East Side", address: "1705 1st Ave, New York, NY 10128", lat: 40.7785553, lng: -73.9485889, borough: "Manhattan" },
    { title: "Stumble Inn", hood: "UES", address: "1454 2nd Ave, New York, NY 10021", lat: 40.771213, lng: -73.9563888, borough: "Manhattan" },
    { title: "Tara Mor", hood: "Chelsea", address: "150 W 30th St, New York, NY 10001", lat: 40.7480429, lng: -73.9919743, borough: "Manhattan" },
    { title: "The Buddha Room", hood: "Midtown", address: "410 8th Ave 2nd Floor, New York, NY 10001", lat: 40.7498782, lng: -73.9947359, borough: "Manhattan" },
    { title: "The Pit Midtown", hood: "Midtown", address: "154 W. 29th St., New York, NY 10001", lat: 40.7474462, lng: -73.9922022, borough: "Manhattan" },
    { title: "The Stand", hood: "Union Square", address: "116 E 16th St, New York, NY 10003", lat: 40.7353379, lng: -73.988463, borough: "Manhattan" },
    { title: "Tommy Figz", hood: "Hell's Kitchen", address: "1000 Eighth Ave, New York, NY 10019", lat: 40.7685, lng: -73.9835, borough: "Manhattan" },
    { title: "UCB", hood: "East Village", address: "239 E 14th St, New York, NY 10003", lat: 40.7328695, lng: -73.9853584, borough: "Manhattan" },
    { title: "West Side Comedy Club", hood: "UWS", address: "201 W 75th St, New York, NY 10023", lat: 40.7808191, lng: -73.9805102, borough: "Manhattan" },

    // === QUEENS ===
    { title: "Cool Beans Coffee", hood: "Astoria", address: "50-20 39th Ave, Woodside, NY 11377", lat: 40.7486201, lng: -73.9130718, borough: "Queens" },
    { title: "Grove 34", hood: "Astoria", address: "31-83 34th St, Astoria, NY 11106", lat: 40.7674298, lng: -73.9329303, borough: "Queens" },
    { title: "QED Astoria", hood: "Astoria", address: "27-16 23rd Ave, Astoria, NY 11105", lat: 40.775548, lng: -73.9149401, borough: "Queens" },
    { title: "Sanger Hall", hood: "Sunnyside", address: "4820 Skillman Ave, Sunnyside, NY 11104", lat: 40.7463932, lng: -73.9164999, borough: "Queens" },
    { title: "Scorpion Records", hood: "Ridgewood", address: "792 Onderdonk Ave, Queens, NY 11385", lat: 40.7024343, lng: -73.9048087, borough: "Queens" },
    { title: "Windjammer", hood: "Ridgewood", address: "5-52 Grandview Ave, Ridgewood, NY 11385", lat: 40.7093075, lng: -73.9070026, borough: "Queens" }
];

// =============================================================================
// HELPERS
// =============================================================================

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959; // Radius of the earth in miles
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg) { return deg * (Math.PI / 180); }

function createSlug(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// =============================================================================
// STEP 1: CLUSTER VENUES (Destinations)
// =============================================================================
function generateVenueClusters() {
    console.log(`\n🔹 STEP 1: Clustering ${RAW_VENUES.length} venues...`);
    const clusters = [];

    RAW_VENUES.forEach((venue, index) => {
        // Add ID if missing (mocking DB behavior)
        if (!venue.id) venue.id = `mic_${index}`; 

        let assigned = false;
        
        // Try to snap to existing cluster
        for (const cluster of clusters) {
            const dist = calculateDistance(venue.lat, venue.lng, cluster.lat, cluster.lng);
            if (dist <= CLUSTER_RADIUS_MILES && cluster.borough === venue.borough) {
                // Add to cluster
                cluster.memberIds.push(venue.id);
                cluster.venueNames.push(venue.title);
                
                // Recalculate centroid
                const count = cluster.memberIds.length;
                cluster.lat = (cluster.lat * (count - 1) + venue.lat) / count;
                cluster.lng = (cluster.lng * (count - 1) + venue.lng) / count;
                assigned = true;
                break;
            }
        }

        // Create new cluster if no snap
        if (!assigned) {
            clusters.push({
                id: clusters.length,
                name: `Cluster ${clusters.length} (${venue.title})`,
                lat: venue.lat,
                lng: venue.lng,
                borough: venue.borough,
                memberIds: [venue.id],
                venueNames: [venue.title]
            });
        }
    });

    console.log(`✅ Compressed ${RAW_VENUES.length} venues into ${clusters.length} clusters.`);
    return clusters;
}

// =============================================================================
// STEP 2: FETCH & FILTER STATIONS (Origins)
// =============================================================================
async function getRelevantStations(venueClusters) {
    console.log(`\n🔹 STEP 2: Fetching MTA Data & Finding Hubs...`);
    
    // Fetch CSV
    const response = await axios.get(MTA_DATA_URL);
    
    // SAFE PARSING with csv-parse
    const records = parse(response.data, {
        columns: true, // Auto-map headers
        skip_empty_lines: true
    });
    
    const stations = [];
    const validBoroughs = { 'M': 'Manhattan', 'Bk': 'Brooklyn', 'Q': 'Queens', 'Bx': 'Bronx' };

    records.forEach(row => {
        // MTA CSV Headers: "Stop Name", "Borough", "GTFS Latitude", "GTFS Longitude", "Daytime Routes"
        const name = row['Stop Name'];
        const boroughCode = row['Borough'];
        const lat = parseFloat(row['GTFS Latitude']);
        const lng = parseFloat(row['GTFS Longitude']);
        const lines = row['Daytime Routes'];

        if (!name || !lat || !lng || !validBoroughs[boroughCode]) return;

        // Is this station useful? (Within range of ANY venue cluster)
        let isUseful = false;
        for (const cluster of venueClusters) {
            if (calculateDistance(lat, lng, cluster.lat, cluster.lng) <= STATION_SEARCH_RADIUS) {
                isUseful = true;
                break;
            }
        }

        if (isUseful) {
            stations.push({
                id: `subway_${stations.length}`,
                name: `${name} (${lines})`,
                lat: lat,
                lng: lng,
                borough: validBoroughs[boroughCode]
            });
        }
    });

    // Deduplicate stations (same name + very close coordinates)
    const uniqueStations = [];
    stations.forEach(s => {
        const duplicate = uniqueStations.find(u => 
            u.name === s.name && calculateDistance(u.lat, u.lng, s.lat, s.lng) < 0.1
        );
        if (!duplicate) uniqueStations.push(s);
    });

    console.log(`✅ Found ${uniqueStations.length} useful subway stations (Origin Hubs).`);
    return uniqueStations;
}

// =============================================================================
// STEP 3: GENERATE MATRIX (Google API)
// =============================================================================
async function generateMatrix(origins, destinations) {
    console.log(`\n🔹 STEP 3: Generating Matrix (${origins.length} origins x ${destinations.length} destinations)...`);
    
    const matrix = {};
    const elementsToCompute = origins.length * destinations.length;
    console.log(`📊 Total elements: ${elementsToCompute}`);
    console.log(`💰 Estimated cost: $${(elementsToCompute / 1000 * 5).toFixed(2)}`);
    console.log(`🕒 Using Departure Time: ${new Date(DEPARTURE_TIME * 1000).toLocaleString()}`);

    if (DRY_RUN) {
        console.log("⚠️ DRY RUN MODE: Generating mock data (Free)");
    } else {
        console.log("🚨 LIVE MODE: This will charge your Google Account.");
    }

    // Initialize matrix objects - RESUME from progress file if exists
    const progressFile = 'matrix_progress.json';
    let existingProgress = {};
    if (fs.existsSync(progressFile)) {
        existingProgress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        console.log(`📂 Found existing progress file, resuming...`);
    }

    origins.forEach(o => {
        matrix[o.id] = existingProgress[o.id] || {};
    });

    // Batch processing (Google allows max 25 destinations per call)
    const BATCH_SIZE = 25;

    for (let i = 0; i < origins.length; i++) {
        // SKIP stations that already have complete data
        if (Object.keys(matrix[origins[i].id]).length >= destinations.length) {
            console.log(`   ⏭️ Skipping ${origins[i].name} (already complete)`);
            continue;
        }
        const origin = origins[i];
        const originCoords = `${origin.lat},${origin.lng}`;

        // Save progress every 5 origins to prevent data loss on crash
        if (i > 0 && i % 5 === 0) {
            fs.writeFileSync('matrix_progress.json', JSON.stringify(matrix));
            console.log(`   💾 Progress saved at origin ${i}/${origins.length}`);
        }

        // Process destinations in batches
        for (let j = 0; j < destinations.length; j += BATCH_SIZE) {
            const batch = destinations.slice(j, j + BATCH_SIZE);
            const destCoords = batch.map(d => `${d.lat},${d.lng}`).join('|');

            if (DRY_RUN) {
                // Mock Data
                batch.forEach(dest => {
                    const dist = calculateDistance(origin.lat, origin.lng, dest.lat, dest.lng);
                    const subwayTime = Math.round(dist * 4 * 60) + 300; // 4 min/mile + 5 min wait
                    matrix[origin.id][dest.id] = subwayTime;
                });
            } else {
                // Real API Call
                try {
                    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`;
                    const res = await axios.get(url, {
                        params: {
                            origins: originCoords,
                            destinations: destCoords,
                            mode: 'transit',
                            transit_mode: 'subway|bus',
                            departure_time: DEPARTURE_TIME,
                            key: process.env.GOOGLE_MAPS_API_KEY // Corrected Key
                        }
                    });

                    if (res.data.status === 'OK') {
                        res.data.rows[0].elements.forEach((el, idx) => {
                            const destId = batch[idx].id;
                            if (el.status === 'OK') {
                                matrix[origin.id][destId] = el.duration.value;
                            } else {
                                matrix[origin.id][destId] = null; // Unreachable
                            }
                        });
                    }
                    process.stdout.write('.'); // Progress dot
                    await sleep(100); // Rate limit buffer
                } catch (error) {
                    console.error(`Error fetching batch for ${origin.name}:`, error.message);
                }
            }
        }
    }
    console.log("\n✅ Matrix generation complete.");
    return matrix;
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================
async function main() {
    // 1. Create Venue Clusters
    const venueClusters = generateVenueClusters();

    // 2. Build ID Maps
    const venueMap = {}; // ID -> ClusterID
    const slugMap = {};  // Slug -> ClusterID
    
    RAW_VENUES.forEach(v => {
        // Need to find which cluster this venue ended up in
        const cluster = venueClusters.find(c => c.memberIds.includes(v.id));
        if (cluster) {
            venueMap[v.id] = cluster.id;
            slugMap[createSlug(v.title)] = cluster.id;
        }
    });

    // 3. Find Origin Stations
    const originStations = await getRelevantStations(venueClusters);

    // 4. Generate Matrix (Stations -> Clusters)
    const transitMatrix = await generateMatrix(originStations, venueClusters);

    // 5. Assemble Final JSON
    const output = {
        meta: {
            generated_at: new Date().toISOString(),
            venue_count: RAW_VENUES.length,
            cluster_count: venueClusters.length,
            origin_station_count: originStations.length
        },
        venue_map: venueMap,
        slug_map: slugMap,
        // Save clusters to calculate walking distance from station
        clusters: venueClusters.map(c => ({
            id: c.id,
            lat: Number(c.lat.toFixed(5)),
            lng: Number(c.lng.toFixed(5)),
            borough: c.borough,
            name: c.name,
            venues: c.venueNames
        })),
        // Save origins to snap user to
        stations: originStations.map(s => ({
            id: s.id,
            name: s.name,
            lat: Number(s.lat.toFixed(5)),
            lng: Number(s.lng.toFixed(5)),
            borough: s.borough
        })),
        // The Data
        matrix: transitMatrix
    };

    // 6. Save
    fs.writeFileSync(path.join(__dirname, 'transit_data.json'), JSON.stringify(output, null, 2));
    console.log(`\n🎉 DONE! Data saved to transit_data.json`);
    console.log(`   Size: ${(fs.statSync('transit_data.json').size / 1024).toFixed(2)} KB`);
}

main();