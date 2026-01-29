// Plan My Night - Data Loading & Processing

// Process mic data from API (SYNCED WITH MAIN MAP)
function processMics(rawMics) {
    return rawMics.map(m => {
        const startDate = parseTime(m.startTime);
        const diffMins = startDate ? (startDate - getNow()) / 60000 : 999;

        // 3-tier status: live, upcoming, future
        let status = 'future';
        if (diffMins > -90 && diffMins <= 0) status = 'live';
        else if (diffMins > 0 && diffMins <= 120) status = 'upcoming';

        // API field mapping
        const signup = m.signUpDetails || m.signup || '';
        const signupType = detectSignupType(signup);

        // Extract IG handle from host
        let contact = '';
        const hostStr = m.host || m.contact || '';
        const igMatch = hostStr.match(/@([a-zA-Z0-9_.]+)/);
        if (igMatch) {
            contact = igMatch[1];
        }

        // Shorten venue names: "Comedy Club" → "CC"
        let venueName = m.venueName || m.venue || m.name || 'Unknown Venue';
        venueName = venueName.replace(/Comedy Club/gi, 'CC');

        // Derive day from API data
        let day = m.day;
        if (!day && m.date) {
            const dateObj = new Date(m.date);
            if (!isNaN(dateObj.getTime())) {
                day = CONFIG.dayNames[dateObj.getDay()];
            }
        }
        if (!day) {
            day = CONFIG.dayNames[new Date().getDay()];
        }

        return {
            ...m,
            id: m._id || m.id,
            venueName: venueName,
            venue: venueName,
            neighborhood: m.neighborhood || 'NYC',
            cost: m.cost || 'Free',
            price: m.cost || 'Free',
            status: status,
            signupUrl: extractSignupUrl(signup),
            signupEmail: extractSignupEmail(signup),
            signupInstructions: signup || 'No signup info available',
            signupType: signupType.type,
            requiresAdvanceSignup: signupType.requiresAdvance,
            lng: m.lon || m.lng,
            lat: m.lat,
            address: m.address || '',
            contact: contact,
            borough: m.borough,
            day: day,
            startMins: timeToMins(m.startTime),
            start: startDate,
            stageTime: m.stageTime || m.stage_time || null,
            instagram: contact || m.instagram || null
        };
    });
}

// Add nearby subway lines to mics
function addNearbyLinesToMics(mics, stations) {
    if (!stations || stations.length === 0) return mics;
    return mics.map(mic => {
        if (!mic.lat || !mic.lng) return mic;
        const nearbyLines = new Set();
        stations.forEach(station => {
            const dist = haversineDistance(mic.lat, mic.lng, station.lat, station.lng);
            if (dist < 0.8) { // ~10 min walk (0.8 km)
                (station.lines || []).forEach(line => nearbyLines.add(line));
            }
        });
        return { ...mic, nearbyLines: [...nearbyLines].sort() };
    });
}

// ============================================================
// PRIORITY 1: Extract filterMics() for real-time filtering
// ============================================================
function filterMics(mics, filters) {
    const {
        day,
        startMins,
        endMins,
        priceFilter,
        selectedAreasArr,
        maxCommuteMins,
        origin
    } = filters;

    return mics.filter(m => {
        // Day filter
        if (day && m.day !== day) return false;

        // Time filter
        if (startMins !== undefined && endMins !== undefined) {
            if (m.startMins < startMins || m.startMins > endMins) return false;
        }

        // Price filter
        if (priceFilter === 'free') {
            const cost = m.cost || m.price || 0;
            if (typeof cost === 'number' && cost > 0) return false;
            if (typeof cost === 'string' && cost.toLowerCase() !== 'free') return false;
        }

        // Area filter
        if (selectedAreasArr && selectedAreasArr.length > 0) {
            const matchesBorough = m.borough && selectedAreasArr.includes(m.borough);
            const matchesNeighborhood = m.neighborhood && selectedAreasArr.includes(m.neighborhood);
            if (!matchesBorough && !matchesNeighborhood) return false;
        }

        return true;
    });
}

// Get current filter state from DOM
function getCurrentFilterState() {
    const day = document.getElementById('day-select')?.value;
    const startTimeEl = document.getElementById('start-time');
    const endTimeEl = document.getElementById('end-time-select');

    let startMins = 0;
    let endMins = 1439;

    if (startTimeEl && startTimeEl.value) {
        const parts = startTimeEl.value.split(':');
        startMins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }

    if (endTimeEl && endTimeEl.value) {
        const parts = endTimeEl.value.split(':');
        endMins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        // Handle crossing midnight
        if (endMins <= startMins) {
            endMins += 24 * 60;
        }
    }

    const priceFilter = document.querySelector('input[name="price"]:checked')?.value || 'all';
    const selectedAreasArr = Array.from(document.querySelectorAll('.area-checkbox:checked')).map(cb => cb.value);
    const maxCommuteMins = parseInt(document.querySelector('input[name="max-commute"]:checked')?.value || '999');

    return {
        day,
        startMins,
        endMins,
        priceFilter,
        selectedAreasArr,
        maxCommuteMins,
        origin: selectedOrigin
    };
}

// Check if filter state has changed
function hasFilterStateChanged(newState) {
    const lastState = PlannerState.lastFilterState;
    if (!lastState) return true;

    return JSON.stringify(newState) !== JSON.stringify(lastState);
}

// Load mics from API (with retry logic)
async function loadMics() {
    // Check online status first
    if (!isOnline()) {
        throw new Error('You appear to be offline. Please check your connection.');
    }

    try {
        const data = await fetchWithRetry(`${API_BASE}/api/v1/mics`, {}, 2);

        if (!data.mics || data.mics.length === 0) {
            throw new Error('No mic data received from server');
        }

        return processMics(data.mics);

    } catch (error) {
        // Re-throw with user-friendly message
        throw new Error(error.message || 'Failed to load mic data. Please try again.');
    }
}

// Load subway stations (with retry logic)
async function loadSubwayStations() {
    try {
        const stationsObj = await fetchWithRetry(`${API_BASE}/data/stations.json`, {}, 1);

        // Transform object to array with gtfsStopId and lines
        const stations = Object.entries(stationsObj).map(([id, station]) => {
            // Extract lines from nodes (e.g., "101S_1" -> "1")
            const lines = new Set();
            (station.nodes || []).forEach(node => {
                const match = node.match(/_([A-Z0-9]+)$/);
                if (match) lines.add(match[1]);
            });

            // Build name with lines like "Station Name (1 2 3)"
            const lineStr = [...lines].sort().join(' ');
            const nameWithLines = lineStr ? `${station.name} (${lineStr})` : station.name;

            return {
                ...station,
                gtfsStopId: id,
                name: nameWithLines,
                lines: [...lines]
            };
        });

        return stations;

    } catch (error) {
        // Stations are optional - return empty array on failure
        return [];
    }
}
