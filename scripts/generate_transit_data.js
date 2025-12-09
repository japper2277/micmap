/* =================================================================
   TRANSIT DATA GENERATOR

   Creates the micro-cluster JSON file with:
   1. venue_map: mic_id -> cluster_id
   2. slug_map: slug -> cluster_id (fallback)
   3. clusters: array with id, lat, lng, borough, name, memberIds
   4. matrix: cluster-to-cluster transit times

   USAGE:
   DRY_RUN=true node scripts/generate_transit_data.js   # Preview only
   node scripts/generate_transit_data.js                 # Generate + API calls

   COST: ~$10 for 45x45 matrix (~2,025 elements)
   ================================================================= */

// Load dotenv from api folder
const dotenvPath = require('path').join(__dirname, '../api/node_modules/dotenv');
try {
    require(dotenvPath).config({ path: require('path').join(__dirname, '../api/.env') });
} catch (e) {
    console.log('Note: dotenv not found, using environment variables directly');
}
const fs = require('fs');
const path = require('path');

const DRY_RUN = process.env.DRY_RUN === 'true';
const CLUSTER_RADIUS = 0.2; // miles (~4 NYC blocks, ±4 min variance)
const OUTPUT_PATH = path.join(__dirname, '../map_designs/newest_map/js/transit_data.json');

// Load mics from JSON
const micsPath = path.join(__dirname, '../api/mics.json');
let mics;
try {
    mics = JSON.parse(fs.readFileSync(micsPath, 'utf-8'));
    // Handle both { mics: [...] } and [...] formats
    if (mics.mics) mics = mics.mics;
} catch (e) {
    console.error('Failed to load mics.json:', e.message);
    process.exit(1);
}

// Borough lookup by neighborhood
const BOROUGH_MAP = {
    'Greenwich Village': 'Manhattan',
    'East Village': 'Manhattan',
    'West Village': 'Manhattan',
    'Chelsea': 'Manhattan',
    'Midtown': 'Manhattan',
    'Hell\'s Kitchen': 'Manhattan',
    'Upper West Side': 'Manhattan',
    'Upper East Side': 'Manhattan',
    'Harlem': 'Manhattan',
    'Lower East Side': 'Manhattan',
    'SoHo': 'Manhattan',
    'Tribeca': 'Manhattan',
    'Financial District': 'Manhattan',
    'NoHo': 'Manhattan',
    'Nolita': 'Manhattan',
    'Williamsburg': 'Brooklyn',
    'Bushwick': 'Brooklyn',
    'Park Slope': 'Brooklyn',
    'DUMBO': 'Brooklyn',
    'Brooklyn Heights': 'Brooklyn',
    'Crown Heights': 'Brooklyn',
    'Greenpoint': 'Brooklyn',
    'Bed-Stuy': 'Brooklyn',
    'Bedford-Stuyvesant': 'Brooklyn',
    'Prospect Heights': 'Brooklyn',
    'Cobble Hill': 'Brooklyn',
    'Carroll Gardens': 'Brooklyn',
    'Boerum Hill': 'Brooklyn',
    'Fort Greene': 'Brooklyn',
    'Clinton Hill': 'Brooklyn',
    'Astoria': 'Queens',
    'Long Island City': 'Queens',
    'LIC': 'Queens',
    'Jackson Heights': 'Queens',
    'Flushing': 'Queens',
    'Sunnyside': 'Queens',
    'Woodside': 'Queens',
    'South Bronx': 'Bronx',
    'Mott Haven': 'Bronx',
    'Fordham': 'Bronx',
    'Riverdale': 'Bronx',
    'Kingsbridge': 'Bronx',
    'St. George': 'Staten Island',
    'Stapleton': 'Staten Island',
    'Tompkinsville': 'Staten Island',
};

function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function createSlug(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getBoroughForMic(mic) {
    const hood = mic.neighborhood || mic.hood;
    return BOROUGH_MAP[hood] || mic.borough || 'Manhattan';
}

// ============================================================
// STEP 1: Build clusters using density-first algorithm
// ============================================================
function buildClusters(venues) {
    const clusters = [];
    const assigned = new Set();

    // Filter to venues with valid coords
    const validVenues = venues.filter(v => v.lat && v.lng);

    // Sort venues by density (venues with most neighbors first)
    const venuesByDensity = validVenues.map(v => ({
        ...v,
        neighborCount: validVenues.filter(other =>
            other._id !== v._id &&
            calculateDistance(v.lat, v.lng, other.lat, other.lng) <= CLUSTER_RADIUS
        ).length
    })).sort((a, b) => b.neighborCount - a.neighborCount);

    venuesByDensity.forEach(venue => {
        const venueId = venue._id || venue.id;
        if (assigned.has(venueId)) return;

        // Find all unassigned venues within radius
        const members = validVenues.filter(v => {
            const vId = v._id || v.id;
            return !assigned.has(vId) &&
                calculateDistance(venue.lat, venue.lng, v.lat, v.lng) <= CLUSTER_RADIUS;
        });

        if (members.length > 0) {
            const centroid = {
                lat: members.reduce((sum, m) => sum + m.lat, 0) / members.length,
                lng: members.reduce((sum, m) => sum + m.lng, 0) / members.length
            };

            const clusterId = clusters.length;
            const borough = getBoroughForMic(members[0]);
            const venueName = members[0].venue || members[0].title || `Cluster ${clusterId}`;

            clusters.push({
                id: clusterId,
                lat: centroid.lat,
                lng: centroid.lng,
                borough: borough,
                name: `${venueName} area`,
                memberIds: members.map(m => m._id || m.id)
            });

            members.forEach(m => assigned.add(m._id || m.id));
        }
    });

    return clusters;
}

// ============================================================
// STEP 2: Build venue_map and slug_map
// ============================================================
function buildVenueMaps(clusters) {
    const venue_map = {};
    const slug_map = {};

    clusters.forEach(cluster => {
        cluster.memberIds.forEach(micId => {
            venue_map[micId] = cluster.id;

            const mic = mics.find(m => (m._id || m.id) === micId);
            if (mic) {
                const title = mic.venue || mic.title;
                if (title) {
                    const slug = createSlug(title);
                    slug_map[slug] = cluster.id;
                }
            }
        });
    });

    return { venue_map, slug_map };
}

// ============================================================
// STEP 3: Fetch transit times from Google Distance Matrix
// ============================================================
async function fetchTransitMatrix(clusters) {
    if (DRY_RUN) {
        console.log(`\n[DRY RUN] Would fetch ${clusters.length}x${clusters.length} = ${clusters.length * clusters.length} elements`);
        console.log(`[DRY RUN] Estimated cost: $${((clusters.length * clusters.length) / 1000 * 5).toFixed(2)}`);
        return null;
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
        console.error('❌ GOOGLE_MAPS_API_KEY not set in api/.env');
        console.log('Generating with distance-based estimates instead...');
        return generateEstimatedMatrix(clusters);
    }

    const matrix = {};
    const BATCH_SIZE = 10;

    for (let i = 0; i < clusters.length; i++) {
        const origin = clusters[i];
        matrix[origin.id] = {};

        for (let j = 0; j < clusters.length; j += BATCH_SIZE) {
            const batch = clusters.slice(j, j + BATCH_SIZE);
            const destinations = batch.map(c => `${c.lat},${c.lng}`).join('|');

            const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
            url.searchParams.set('origins', `${origin.lat},${origin.lng}`);
            url.searchParams.set('destinations', destinations);
            url.searchParams.set('mode', 'transit');
            url.searchParams.set('departure_time', getFridayEvening().toString());
            url.searchParams.set('key', process.env.GOOGLE_MAPS_API_KEY);

            try {
                const response = await fetch(url);
                const data = await response.json();

                if (data.status !== 'OK') {
                    console.error(`API Error for cluster ${origin.id}:`, data.status, data.error_message);
                    // Use estimates for this batch
                    batch.forEach(destCluster => {
                        const dist = calculateDistance(origin.lat, origin.lng, destCluster.lat, destCluster.lng);
                        matrix[origin.id][destCluster.id] = Math.round(dist * 4 + 5);
                    });
                    continue;
                }

                data.rows[0].elements.forEach((el, idx) => {
                    const destCluster = batch[idx];
                    if (el.status === 'OK') {
                        matrix[origin.id][destCluster.id] = Math.round(el.duration.value / 60);
                    } else {
                        const dist = calculateDistance(origin.lat, origin.lng, destCluster.lat, destCluster.lng);
                        matrix[origin.id][destCluster.id] = Math.round(dist * 4 + 5);
                    }
                });

                await new Promise(r => setTimeout(r, 100));
            } catch (err) {
                console.error(`Network error for cluster ${origin.id}:`, err.message);
                batch.forEach(destCluster => {
                    const dist = calculateDistance(origin.lat, origin.lng, destCluster.lat, destCluster.lng);
                    matrix[origin.id][destCluster.id] = Math.round(dist * 4 + 5);
                });
            }
        }

        console.log(`Processed cluster ${i + 1}/${clusters.length}`);
    }

    return matrix;
}

// Generate estimated matrix based on distance (fallback)
function generateEstimatedMatrix(clusters) {
    const matrix = {};
    clusters.forEach(origin => {
        matrix[origin.id] = {};
        clusters.forEach(dest => {
            const dist = calculateDistance(origin.lat, origin.lng, dest.lat, dest.lng);
            // Estimate: ~4 min per mile + 5 min buffer for NYC transit
            matrix[origin.id][dest.id] = Math.round(dist * 4 + 5);
        });
    });
    return matrix;
}

function getFridayEvening() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    const friday = new Date(now);
    friday.setDate(now.getDate() + daysUntilFriday);
    friday.setHours(19, 0, 0, 0);
    return Math.floor(friday.getTime() / 1000);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
    console.log(`\n🚇 Transit Data Generator`);
    console.log(`========================`);
    console.log(`Processing ${mics.length} venues...`);

    // Step 1: Build clusters
    const clusters = buildClusters(mics);
    console.log(`✅ Created ${clusters.length} clusters`);

    // Step 2: Build venue maps
    const { venue_map, slug_map } = buildVenueMaps(clusters);
    console.log(`✅ Mapped ${Object.keys(venue_map).length} venues by ID`);
    console.log(`✅ Mapped ${Object.keys(slug_map).length} venues by slug`);

    // Step 3: Fetch/generate transit matrix
    const matrix = await fetchTransitMatrix(clusters);

    // Step 4: Write output
    const output = {
        generated_at: new Date().toISOString(),
        venue_map,
        slug_map,
        clusters: clusters.map(c => ({
            id: c.id,
            lat: c.lat,
            lng: c.lng,
            borough: c.borough,
            name: c.name,
            memberIds: c.memberIds
        })),
        matrix: matrix || {}
    };

    if (DRY_RUN) {
        console.log('\n[DRY RUN] Sample output:');
        console.log(JSON.stringify(output, null, 2).slice(0, 1500) + '\n...(truncated)');
        console.log(`\nTo generate real data, run without DRY_RUN=true`);
    } else {
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
        console.log(`\n✅ Written to ${OUTPUT_PATH}`);
    }
}

main().catch(console.error);
