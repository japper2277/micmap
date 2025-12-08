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
function getStatus(startDate) {
    const diffMins = startDate ? (startDate - getNow()) / 60000 : 999;
    if (diffMins > -90 && diffMins <= 0) return 'live';
    if (diffMins > 0 && diffMins <= 60) return 'urgent';
    if (diffMins > 60 && diffMins <= 120) return 'soon';
    return 'future';
}

// Process mic data from JSON
function processMics(rawMics) {
    return rawMics.map(m => {
        const startDate = parseTime(m.startTime);
        const diffMins = startDate ? (startDate - getNow()) / 60000 : 999;

        let status = 'future';
        if (diffMins > -90 && diffMins <= 0) status = 'live';
        else if (diffMins > 0 && diffMins <= 60) status = 'urgent';
        else if (diffMins > 60 && diffMins <= 120) status = 'soon';

        // API field mapping: name, venueName, signUpDetails, lon
        const signup = m.signUpDetails || m.signup || '';
        return {
            ...m,
            title: m.venueName || m.venue || m.name,
            venue: m.venueName || m.venue || m.name,
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

/* =================================================================
   TRANSIT CALCULATION (MVP)
   ================================================================= */

async function calculateTransitTimes(originLat, originLng) {
    // Get currently visible mics (we'll filter same as render does)
    const currentTime = new Date();
    const todayName = CONFIG.dayNames[currentTime.getDay()];
    const tomorrowName = CONFIG.dayNames[(currentTime.getDay() + 1) % 7];

    // Filter to visible mics
    const visibleMics = STATE.mics.filter(mic => {
        const diffMins = mic.start ? (mic.start - currentTime) / 60000 : 999;

        // Day filter
        if (STATE.currentMode === 'today') {
            if (mic.day !== todayName) return false;
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
    });

    if (visibleMics.length === 0) return;

    // Build destinations array (limit to 25 per Google API)
    const destinations = visibleMics.slice(0, 25).map(mic => ({
        lat: mic.lat,
        lng: mic.lng,
        id: mic.id
    }));

    try {
        const response = await fetch(`${CONFIG.apiBase}/api/proxy/transit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originLat,
                originLng,
                destinations
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Transit API error');
        }

        const data = await response.json();

        // Apply transit times to mics
        data.times.forEach((result, i) => {
            const mic = visibleMics[i];
            if (mic && result.seconds !== null) {
                mic.transitSeconds = result.seconds;
                mic.transitMins = Math.round(result.seconds / 60);
            }
        });

        console.log(`✅ Transit times calculated for ${data.times.length} mics`);

    } catch (error) {
        console.error('Transit calculation failed:', error);
        // Fallback: estimate based on distance (~4 min per mile by subway)
        visibleMics.forEach(mic => {
            const dist = calculateDistance(originLat, originLng, mic.lat, mic.lng);
            mic.transitMins = Math.round(dist * 4 + 5); // 4 min/mile + 5 min buffer
            mic.transitSeconds = mic.transitMins * 60;
        });
    }
}

// Clear transit data from all mics
function clearTransitData() {
    STATE.mics.forEach(mic => {
        delete mic.transitMins;
        delete mic.transitSeconds;
    });
    STATE.userOrigin = null;
    STATE.isTransitMode = false;
}

/* =========================================================================
   TRANSIT DATA & CLUSTER UTILITIES
   ========================================================================= */

// Global transit data (loaded from transit_data.json)
let TRANSIT_DATA = null;
const CLUSTER_SNAP_RADIUS = 0.3; // miles - for snapping new venues to clusters

// Load transit data JSON
async function loadTransitData() {
    try {
        const response = await fetch('js/transit_data.json');
        TRANSIT_DATA = await response.json();
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
    const venueId = venue._id || venue.id;
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

/* =========================================================================
   MAP CLICK FALLBACK - When geolocation fails/denied
   ========================================================================= */
function enableMapClickMode() {
    const btn = document.getElementById('btn-transit');
    if (btn) {
        btn.textContent = '📍 Tap Map';
        btn.disabled = false;
        btn.classList.add('active');
    }

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

    STATE.userOrigin = { lat, lng, name: 'Selected Location' };
    STATE.isTransitMode = true;

    const btn = document.getElementById('btn-transit');
    if (btn) {
        btn.textContent = '⏳ Calculating...';
        btn.disabled = true;
    }

    await calculateTransitTimes(lat, lng);

    disableMapClickMode();
    if (typeof updateTransitButtonUI === 'function') {
        updateTransitButtonUI(true);
    }
    render(STATE.currentMode);
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
