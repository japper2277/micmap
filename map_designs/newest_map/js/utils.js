/* =================================================================
   UTILS
   Pure utility functions
   ================================================================= */

// Always get fresh time (never use a stale cached value)
function getNow() {
    return new Date();
}

// Parse time string to Date object for today
function parseTime(timeStr) {
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return null;
    let hours = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const period = match[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    const d = new Date();
    d.setHours(hours, mins, 0, 0);
    return d;
}

// Extract URL from signup text
function extractSignupUrl(signupText) {
    if (!signupText) return null;
    const urlMatch = signupText.match(/(https?:\/\/[^\s]+)/);
    return urlMatch ? urlMatch[1] : null;
}

// Extract email from signup text
function extractSignupEmail(signupText) {
    if (!signupText) return null;
    const emailMatch = signupText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return emailMatch ? emailMatch[1] : null;
}

// Calculate status based on current time
// 3-tier system: live (green), upcoming (red, <2hrs), future (gray)
function getStatus(startDate) {
    const diffMins = startDate ? (startDate - getNow()) / 60000 : 999;
    if (diffMins > -90 && diffMins <= 0) return 'live';      // Green pulsing
    if (diffMins > 0 && diffMins <= 120) return 'upcoming';  // Red (<2 hours)
    return 'future';                                          // Gray (tonight/later)
}

// Process mic data from JSON
function processMics(rawMics) {
    return rawMics.map(m => {
        const startDate = parseTime(m.startTime);
        const diffMins = startDate ? (startDate - getNow()) / 60000 : 999;

        // 3-tier status: live, upcoming, future
        let status = 'future';
        if (diffMins > -90 && diffMins <= 0) status = 'live';
        else if (diffMins > 0 && diffMins <= 120) status = 'upcoming';

        // API field mapping: name, venueName, signUpDetails, lon
        const signup = m.signUpDetails || m.signup || '';

        // Shorten venue names: "Comedy Club" → "CC"
        let venueName = m.venueName || m.venue || m.name;
        if (venueName.endsWith('Comedy Club')) {
            venueName = venueName.replace(/Comedy Club$/, 'CC');
        }

        return {
            ...m,
            id: m._id || m.id,  // Normalize MongoDB _id to id
            title: venueName,
            venue: venueName,
            start: startDate,
            timeStr: m.startTime ? m.startTime.replace(/\s*(AM|PM)/i, '').trim() : '',
            hood: m.neighborhood,
            price: m.cost || 'Free',
            setTime: m.stageTime || '5min',
            type: m.borough || 'NYC',
            status: status,
            signupUrl: extractSignupUrl(signup),
            signupEmail: extractSignupEmail(signup),
            signupInstructions: signup || 'No signup info available',
            lng: m.lng || m.lon  // API uses 'lon', normalize to 'lng'
        };
    });
}

// Add days to a date
function addDays(date, days) {
    const r = new Date(date);
    r.setDate(r.getDate() + days);
    return r;
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Format distance
function formatDistance(miles) {
    if (miles < 0.1) return `${Math.round(miles * 5280)} ft`;
    if (miles < 10) return `${miles.toFixed(1)} mi`;
    return `${Math.round(miles)} mi`;
}

/* =========================================================================
   TRANSIT DATA & CLUSTER UTILITIES
   ========================================================================= */

// Global transit data (loaded from transit_data.json)
var TRANSIT_DATA = null;
window.TRANSIT_DATA = null; // Also expose on window for other modules
const CLUSTER_SNAP_RADIUS = 0.3; // miles - for snapping new venues to clusters

// Load transit data JSON
async function loadTransitData() {
    try {
        const response = await fetch('js/transit_data.json');
        TRANSIT_DATA = await response.json();
        window.TRANSIT_DATA = TRANSIT_DATA; // Expose on window
        console.log(`✅ Loaded transit data: ${TRANSIT_DATA.clusters.length} clusters`);
    } catch (e) {
        console.warn('Transit data not available:', e.message);
    }
}

/* =========================================================================
   isMicVisible - Determines if a mic passes current filters
   Must mirror the exact filtering logic in render()
   ========================================================================= */
function isMicVisible(mic) {
    const currentTime = new Date();

    // COMEDY DAY LOGIC: Day ends at 4AM, not midnight
    const adjustedTime = new Date(currentTime);
    if (adjustedTime.getHours() < 4) {
        adjustedTime.setDate(adjustedTime.getDate() - 1);
    }

    const todayName = CONFIG.dayNames[adjustedTime.getDay()];
    const tomorrowName = CONFIG.dayNames[(adjustedTime.getDay() + 1) % 7];

    // Day filter
    if (STATE.currentMode === 'today') {
        if (mic.day !== todayName) return false;
        const diffMins = mic.start ? (mic.start - currentTime) / 60000 : 999;
        if (diffMins < -60) return false;
    }
    if (STATE.currentMode === 'tomorrow' && mic.day !== tomorrowName) return false;
    if (STATE.currentMode === 'calendar') {
        const selectedDate = new Date(STATE.selectedCalendarDate);
        const selectedDayName = CONFIG.dayNames[selectedDate.getDay()];
        if (mic.day !== selectedDayName) return false;
    }

    // Price filter
    if (STATE.activeFilters.price !== 'All') {
        const isFree = mic.price.toLowerCase().includes('free');
        if (STATE.activeFilters.price === 'Free' && !isFree) return false;
        if (STATE.activeFilters.price === 'Paid' && isFree) return false;
    }

    // Time filter
    if (STATE.activeFilters.time !== 'All' && mic.start) {
        const hour = mic.start.getHours();
        if (STATE.activeFilters.time === 'early' && hour >= 17) return false;
        if (STATE.activeFilters.time === 'late' && hour < 17) return false;
    }

    return true;
}

/* =========================================================================
   resolveClusterId - Find which cluster a venue belongs to
   ========================================================================= */
function createSlug(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveClusterId(venue) {
    if (!TRANSIT_DATA) return null;

    // 1. PRIMARY: Check venue_map by mic ID
    const venueId = venue.id;
    if (venueId && TRANSIT_DATA.venue_map[venueId] !== undefined) {
        return TRANSIT_DATA.venue_map[venueId];
    }

    // 2. FALLBACK: Check slug_map
    const title = venue.venue || venue.title;
    if (title) {
        const slug = createSlug(title);
        if (TRANSIT_DATA.slug_map && TRANSIT_DATA.slug_map[slug] !== undefined) {
            return TRANSIT_DATA.slug_map[slug];
        }
    }

    // 3. LAST RESORT: Dynamic snap to closest cluster
    let closestId = null;
    let minDist = Infinity;

    TRANSIT_DATA.clusters.forEach(c => {
        const d = calculateDistance(venue.lat, venue.lng, c.lat, c.lng);
        if (d <= CLUSTER_SNAP_RADIUS && d < minDist) {
            minDist = d;
            closestId = c.id;
        }
    });

    return closestId;
}

function getUserClusterId(originLat, originLng) {
    if (!TRANSIT_DATA) return null;

    let closestId = null;
    let minDist = Infinity;

    TRANSIT_DATA.clusters.forEach(c => {
        const d = calculateDistance(originLat, originLng, c.lat, c.lng);
        if (d < minDist) {
            minDist = d;
            closestId = c.id;
        }
    });

    return closestId;
}

// Find nearest subway station to user's location (for pre-computed matrix lookup)
function getNearestStation(lat, lng) {
    if (!TRANSIT_DATA || !TRANSIT_DATA.stations) return null;

    let nearest = null;
    let minDist = Infinity;
    const MAX_STATION_DISTANCE = 0.5; // miles - max distance to snap to a station

    TRANSIT_DATA.stations.forEach(station => {
        const d = calculateDistance(lat, lng, station.lat, station.lng);
        if (d < minDist && d <= MAX_STATION_DISTANCE) {
            minDist = d;
            nearest = { ...station, distance: d };
        }
    });

    return nearest;
}

// Find N nearest subway stations to user's location (for departure assistant)
function getStationsNearUser(lat, lng, count = 3) {
    if (!TRANSIT_DATA || !TRANSIT_DATA.stations) return [];

    const MAX_STATION_DISTANCE = 0.5; // miles - max distance to consider

    // Calculate distance for all stations within range
    const stationsWithDistance = TRANSIT_DATA.stations
        .map(station => ({
            ...station,
            distance: calculateDistance(lat, lng, station.lat, station.lng)
        }))
        .filter(s => s.distance <= MAX_STATION_DISTANCE)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, count);

    return stationsWithDistance;
}

// Extract line letters from station name (e.g., "14 St (N Q R W)" -> ["N", "Q", "R", "W"])
function extractLinesFromStation(station) {
    const match = station.name.match(/\(([^)]+)\)/);
    if (!match) return [];
    return match[1].split(' ').filter(l => l.length > 0);
}

/* =========================================================================
   TRANSFER DETECTION
   Determines if a transfer is needed and suggests the best transfer hub
   ========================================================================= */

// Major transfer hubs with lines available
const TRANSFER_HUBS = {
    // Manhattan
    'times-sq': { name: 'Times Sq-42 St', lines: ['1','2','3','7','N','Q','R','W','S','A','C','E'], lat: 40.7559, lng: -73.9871 },
    'union-sq': { name: '14 St-Union Sq', lines: ['L','N','Q','R','W','4','5','6'], lat: 40.7359, lng: -73.9906 },
    'herald-sq': { name: '34 St-Herald Sq', lines: ['B','D','F','M','N','Q','R','W'], lat: 40.7496, lng: -73.9877 },
    '14-8av': { name: '14 St (8 Av)', lines: ['A','C','E','L'], lat: 40.7408, lng: -74.0021 },
    'fulton': { name: 'Fulton St', lines: ['2','3','4','5','A','C','J','Z'], lat: 40.7102, lng: -74.0073 },
    'chambers': { name: 'Chambers St', lines: ['1','2','3','A','C'], lat: 40.7142, lng: -74.0087 },
    'canal': { name: 'Canal St', lines: ['1','A','C','E','N','Q','R','W','J','Z','6'], lat: 40.7197, lng: -74.0011 },
    'lexington-59': { name: 'Lexington Av/59 St', lines: ['4','5','6','N','R','W'], lat: 40.7627, lng: -73.9676 },
    // Brooklyn
    'atlantic': { name: 'Atlantic Av-Barclays', lines: ['2','3','4','5','B','D','N','Q','R'], lat: 40.6841, lng: -73.9784 },
    'jay-st': { name: 'Jay St-MetroTech', lines: ['A','C','F','R'], lat: 40.6923, lng: -73.9872 },
    'broadway-jct': { name: 'Broadway Junction', lines: ['A','C','J','Z','L'], lat: 40.6783, lng: -73.9053 },
    // Queens
    'jackson-hts': { name: 'Jackson Hts-Roosevelt', lines: ['7','E','F','M','R'], lat: 40.7465, lng: -73.8912 },
    'court-sq': { name: 'Court Sq', lines: ['7','E','M','G'], lat: 40.7471, lng: -73.9456 },
    'queensboro': { name: 'Queensboro Plaza', lines: ['7','N','W'], lat: 40.7510, lng: -73.9403 }
};

// Get lines that serve stations near a cluster
function getLinesThatServeCluster(clusterId) {
    if (!TRANSIT_DATA?.clusters || !TRANSIT_DATA?.stations) return [];

    const cluster = TRANSIT_DATA.clusters.find(c => c.id === clusterId);
    if (!cluster) return [];

    const SERVE_RADIUS = 0.25; // miles - stations within this radius serve the cluster
    const nearbyLines = new Set();

    TRANSIT_DATA.stations.forEach(station => {
        const dist = calculateDistance(cluster.lat, cluster.lng, station.lat, station.lng);
        if (dist <= SERVE_RADIUS) {
            extractLinesFromStation(station).forEach(l => nearbyLines.add(l));
        }
    });

    return Array.from(nearbyLines);
}

// Find the best transfer hub between user's lines and venue's lines
function findTransferHub(userLines, venueLines) {
    let bestHub = null;
    let bestScore = -1;

    for (const [hubId, hub] of Object.entries(TRANSFER_HUBS)) {
        // Check if hub connects user's lines to venue's lines
        const userCanReach = userLines.some(l => hub.lines.includes(l));
        const hubReachesVenue = venueLines.some(l => hub.lines.includes(l));

        if (userCanReach && hubReachesVenue) {
            // Score by how many connecting lines (more = better)
            const userConnections = userLines.filter(l => hub.lines.includes(l));
            const venueConnections = venueLines.filter(l => hub.lines.includes(l));
            const score = userConnections.length + venueConnections.length;

            if (score > bestScore) {
                bestScore = score;
                bestHub = {
                    ...hub,
                    id: hubId,
                    takeLines: userConnections,
                    transferTo: venueConnections
                };
            }
        }
    }

    return bestHub;
}

// Check if transfer is needed and return transfer info
function checkTransferNeeded(userStation, venueClusterId) {
    const userLines = extractLinesFromStation(userStation);
    const venueLines = getLinesThatServeCluster(venueClusterId);

    // Check for direct connection (any line serves both)
    const directLines = userLines.filter(l => venueLines.includes(l));

    if (directLines.length > 0) {
        return {
            needsTransfer: false,
            directLines,
            userLines,
            venueLines
        };
    }

    // Need transfer - find best hub
    const transferHub = findTransferHub(userLines, venueLines);

    return {
        needsTransfer: true,
        directLines: [],
        userLines,
        venueLines,
        transferHub
    };
}

/* =========================================================================
   getDirectionToward - Determine which direction a train should go to reach venue
   Returns: direction label that matches MTA API response (e.g., "Manhattan", "Uptown")
   ========================================================================= */
function getDirectionToward(station, destCluster, line) {
    // Line-specific direction labels (matches server.js customDirections)
    const CUSTOM_DIRECTIONS = {
        'L': { N: 'Manhattan', S: 'Brooklyn' },
        'G': { N: 'Queens', S: 'Brooklyn' },
        'J': { N: 'Manhattan', S: 'Queens' },
        'Z': { N: 'Manhattan', S: 'Queens' },
        'M': { N: 'Manhattan', S: 'Brooklyn' },
        'S': { N: 'Times Sq', S: 'Grand Central' }
    };

    // Determine if venue is north/south or east/west of station
    const isEastWestLine = ['L', 'G', 'S'].includes(line);

    let needsNorthbound;
    if (isEastWestLine) {
        // For east-west lines: Manhattan is generally west (higher lng = more east = Brooklyn direction)
        // L: going toward Manhattan = going west = lower lng
        needsNorthbound = destCluster.lng < station.lng;
    } else {
        // For north-south lines: uptown = higher lat
        needsNorthbound = destCluster.lat > station.lat;
    }

    // Get direction label
    if (CUSTOM_DIRECTIONS[line]) {
        return needsNorthbound ? CUSTOM_DIRECTIONS[line].N : CUSTOM_DIRECTIONS[line].S;
    }
    return needsNorthbound ? 'Uptown' : 'Downtown';
}

/* =========================================================================
   calculateLiveCommute - Standardized commute calculation with live arrivals
   Returns: { total, breakdown: { walkToStation, waitTime, rideTime, walkToVenue }, catchTrain }
   ========================================================================= */
function calculateLiveCommute(options) {
    const {
        userLat, userLng,           // User's origin
        stationLat, stationLng,     // Departure station
        stationId,                  // For matrix lookup
        arrivals,                   // Filtered arrivals array (with minsAway)
        clusterId,                  // Destination cluster ID
        venueLat, venueLng          // Final destination
    } = options;

    // 1. Walk to station (20 min/mile)
    const walkToStationMiles = calculateDistance(userLat, userLng, stationLat, stationLng);
    const walkToStation = Math.ceil(walkToStationMiles * 20);

    // 2. Find first catchable train (arrives after we get to station)
    const catchableTrain = arrivals.find(a => a.minsAway >= walkToStation) || arrivals[arrivals.length - 1];
    const trainArrival = catchableTrain?.minsAway || 0;
    const waitTime = Math.max(0, trainArrival - walkToStation);

    // 3. Ride time from matrix (or distance estimate)
    let rideTime = 15; // default fallback
    if (TRANSIT_DATA?.matrix?.[stationId]?.[clusterId]) {
        rideTime = Math.ceil(TRANSIT_DATA.matrix[stationId][clusterId] / 60);
    } else {
        // Distance-based estimate: find cluster centroid
        const cluster = TRANSIT_DATA?.clusters?.find(c => c.id === clusterId);
        if (cluster) {
            const rideDist = calculateDistance(stationLat, stationLng, cluster.lat, cluster.lng);
            rideTime = Math.ceil(rideDist * 4) + 5; // 4 min/mile + buffer
        }
    }

    // 4. Walk from cluster to venue
    const cluster = TRANSIT_DATA?.clusters?.find(c => c.id === clusterId);
    let walkToVenue = 3; // default
    if (cluster) {
        const walkToVenueMiles = calculateDistance(cluster.lat, cluster.lng, venueLat, venueLng);
        walkToVenue = Math.ceil(walkToVenueMiles * 20);
    }

    return {
        total: walkToStation + waitTime + rideTime + walkToVenue,
        breakdown: { walkToStation, waitTime, rideTime, walkToVenue },
        catchTrain: catchableTrain || null
    };
}

/* =========================================================================
   MAP CLICK FALLBACK - When geolocation fails/denied
   ========================================================================= */
function enableMapClickMode() {
    // Transit button removed - just enable map click mode
    STATE.isWaitingForMapClick = true;
    document.getElementById('map').style.cursor = 'crosshair';
    map.on('click', onMapClickForTransit);
}

function disableMapClickMode() {
    STATE.isWaitingForMapClick = false;
    document.getElementById('map').style.cursor = '';
    map.off('click', onMapClickForTransit);
}

async function onMapClickForTransit(e) {
    if (!STATE.isWaitingForMapClick) return;
    const { lat, lng } = e.latlng;

    // Use pre-computed transit data (no API calls!)
    await transitService.calculateFromOrigin(lat, lng, 'Selected Location');

    disableMapClickMode();
    if (typeof updateTransitButtonUI === 'function') {
        updateTransitButtonUI(true);
    }
}

// Open directions in native Google Maps app
function openDirections(lat, lng) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);

    if (isIOS) {
        // Try Google Maps app first, falls back to Apple Maps
        window.location.href = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
        // Fallback after short delay if app not installed
        setTimeout(() => {
            window.location.href = `maps://maps.apple.com/?daddr=${lat},${lng}`;
        }, 500);
    } else if (isAndroid) {
        // Android: use geo intent which opens in default maps app
        window.location.href = `geo:${lat},${lng}?q=${lat},${lng}`;
    } else {
        // Desktop: open in new tab
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
    }
}

// =================================================================
// HERE Walking API - Accurate pedestrian routing
// =================================================================

// Cache for walking times to avoid redundant API calls
const walkingTimeCache = new Map();

// Get accurate walking time using HERE API (with caching)
async function getHereWalkingTime(originLat, originLng, destLat, destLng) {
    // Create cache key (rounded to 4 decimals = ~10m precision)
    const cacheKey = `${originLat.toFixed(4)},${originLng.toFixed(4)}-${destLat.toFixed(4)},${destLng.toFixed(4)}`;

    if (walkingTimeCache.has(cacheKey)) {
        return walkingTimeCache.get(cacheKey);
    }

    try {
        const res = await fetch(
            `${CONFIG.apiBase}/api/proxy/here/walk?originLat=${originLat}&originLng=${originLng}&destLat=${destLat}&destLng=${destLng}`
        );

        if (!res.ok) throw new Error('HERE walk API failed');

        const data = await res.json();
        const result = {
            durationMins: data.durationMins,
            distanceMiles: data.distanceMiles
        };

        // Cache the result
        walkingTimeCache.set(cacheKey, result);
        return result;
    } catch (e) {
        console.warn('HERE walk failed, using estimate:', e.message);
        // Fallback to crow-flies estimate with Manhattan factor
        const dist = calculateDistance(originLat, originLng, destLat, destLng);
        const MANHATTAN_FACTOR = 1.4;
        const WALK_MINS_PER_MILE = 20;
        return {
            durationMins: Math.round(dist * MANHATTAN_FACTOR * WALK_MINS_PER_MILE),
            distanceMiles: Math.round(dist * MANHATTAN_FACTOR * 100) / 100
        };
    }
}

// Batch get walking times for multiple destinations
async function getHereWalkingTimesBatch(originLat, originLng, destinations) {
    try {
        const res = await fetch(`${CONFIG.apiBase}/api/proxy/here/walk-batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ originLat, originLng, destinations })
        });

        if (!res.ok) throw new Error('HERE batch walk API failed');

        const data = await res.json();
        return data.results;
    } catch (e) {
        console.warn('HERE batch walk failed, using estimates:', e.message);
        // Fallback to estimates
        return destinations.map(dest => {
            const dist = calculateDistance(originLat, originLng, dest.lat, dest.lng);
            const MANHATTAN_FACTOR = 1.4;
            const WALK_MINS_PER_MILE = 20;
            return {
                id: dest.id,
                durationMins: Math.round(dist * MANHATTAN_FACTOR * WALK_MINS_PER_MILE),
                distanceMiles: Math.round(dist * MANHATTAN_FACTOR * 100) / 100
            };
        });
    }
}

// Clear walking cache (call when user location changes significantly)
function clearWalkingCache() {
    walkingTimeCache.clear();
}
