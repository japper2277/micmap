/* =================================================================
   UTILS
   Pure utility functions
   ================================================================= */

const MICMAP_SHARED_KEY = 'micmap.shared.v1';
const COMEDY_DAY_ROLLOVER_HOUR = 4;

function supportsAfterMidnightPlanning() {
    return Boolean(CONFIG && CONFIG.supportsAfterMidnightMics);
}

function getComedyAdjustedNow() {
    const now = new Date();
    const adjusted = new Date(now);
    if (supportsAfterMidnightPlanning() && adjusted.getHours() < COMEDY_DAY_ROLLOVER_HOUR) {
        adjusted.setDate(adjusted.getDate() - 1);
    }
    return adjusted;
}

// Returns the active planning date based on current mode.
function getActivePlanningDate() {
    try {
        if (STATE.currentMode === 'calendar' && STATE.selectedCalendarDate) {
            const selected = new Date(STATE.selectedCalendarDate);
            if (!isNaN(selected.getTime())) return selected;
        }

        const adjusted = getComedyAdjustedNow();
        if (STATE.currentMode === 'tomorrow') {
            return addDays(adjusted, 1);
        }
        return adjusted;
    } catch (_) {
        return getComedyAdjustedNow();
    }
}

function getActivePlanningDayName() {
    const active = getActivePlanningDate();
    return CONFIG.dayNames[active.getDay()];
}

function isActivePlanningDateToday() {
    const adjustedNow = getComedyAdjustedNow();
    const active = getActivePlanningDate();
    return adjustedNow.toDateString() === active.toDateString();
}

// Converts a date into "comedy day minutes" where 12:30 AM is 24:30.
function toComedyMinutes(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return 0;
    let hours = date.getHours();
    if (supportsAfterMidnightPlanning() && hours < COMEDY_DAY_ROLLOVER_HOUR) hours += 24;
    return (hours * 60) + date.getMinutes();
}

function normalizeToComedyHour(hour) {
    const parsed = Number(hour);
    if (Number.isNaN(parsed)) return NaN;
    const wrapped = ((parsed % 24) + 24) % 24;
    if (!supportsAfterMidnightPlanning()) {
        if (parsed === 24) return 24;
        return wrapped;
    }
    if (parsed >= 24) return parsed;
    return wrapped < COMEDY_DAY_ROLLOVER_HOUR ? wrapped + 24 : wrapped;
}

function isWithinTimeRange(comedyMinutes, range) {
    if (!range) return true;

    const explicitStartComedyHour = Number(range.startComedyHour);
    const explicitEndComedyHour = Number(range.endComedyHour);
    const hasExplicitComedyHours = !Number.isNaN(explicitStartComedyHour) && !Number.isNaN(explicitEndComedyHour);

    const startHour = hasExplicitComedyHours
        ? explicitStartComedyHour
        : normalizeToComedyHour(range.start);
    const endHour = hasExplicitComedyHours
        ? explicitEndComedyHour
        : normalizeToComedyHour(range.end);

    if (Number.isNaN(startHour) || Number.isNaN(endHour)) return true;

    const start = startHour * 60;
    let end = endHour * 60;

    const crossesMidnight = supportsAfterMidnightPlanning() && (Boolean(range.crossesMidnight) || (end <= start));
    if (crossesMidnight && end <= start) {
        end += (24 * 60);
    }

    const candidate = comedyMinutes < start ? comedyMinutes + (24 * 60) : comedyMinutes;
    return candidate >= start && candidate < end;
}

function isMicInActivePlanningDay(mic) {
    return Boolean(mic && mic.day === getActivePlanningDayName());
}

function getMicMapSelectedDayName() {
    try {
        return getActivePlanningDayName();
    } catch (_) {
        return null;
    }
}

function getMicMapSharedOrigin() {
    const now = Date.now();
    if (STATE.userOrigin?.lat && STATE.userOrigin?.lng) {
        return { lat: STATE.userOrigin.lat, lng: STATE.userOrigin.lng, name: STATE.userOrigin.name || 'Saved Location', updatedAt: now };
    }
    if (STATE.userLocation?.lat && STATE.userLocation?.lng) {
        return { lat: STATE.userLocation.lat, lng: STATE.userLocation.lng, name: 'My Location', updatedAt: now };
    }
    return null;
}

function syncSharedStateFromMicMap() {
    try {
        const prevRaw = localStorage.getItem(MICMAP_SHARED_KEY);
        const prev = prevRaw ? JSON.parse(prevRaw) : {};

        const dayName = getMicMapSelectedDayName();
        const origin = getMicMapSharedOrigin();

        const next = {
            ...prev,
            source: 'micmap',
            origin,
            lastFilters: {
                ...(prev.lastFilters || {}),
                price: STATE.activeFilters?.price,
                time: STATE.activeFilters?.time,
                borough: STATE.activeFilters?.borough,
                commute: STATE.activeFilters?.commute,
                mode: STATE.currentMode,
                calendarDate: STATE.selectedCalendarDate,
                day: dayName
            },
            updatedAt: Date.now()
        };

        localStorage.setItem(MICMAP_SHARED_KEY, JSON.stringify(next));
    } catch (_) {
        // ignore
    }
}

// Escape HTML to prevent XSS attacks
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Escape for use in inline onclick handlers (escapes quotes and special chars)
function escapeAttr(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '&#10;')
        .replace(/\r/g, '&#13;');
}

// Always get fresh time (never use a stale cached value)
function getNow() {
    return new Date();
}

// Parse time string to Date object for today
function parseTime(timeStr) {
    if (!timeStr) return null;
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return null;
    let hours = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const period = match[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    // Use Comedy Adjusted Now as base (handles post-midnight viewing)
    const d = getComedyAdjustedNow();
    d.setHours(hours, mins, 0, 0);

    // If time is 00:00 - 04:00, it belongs to the "next day" of the comedy night
    // (e.g. Friday Night 12:30 AM is Saturday morning)
    if (supportsAfterMidnightPlanning() && hours < COMEDY_DAY_ROLLOVER_HOUR) {
        d.setDate(d.getDate() + 1);
    }
    
    return d;
}

// Extract URL from signup text
function extractSignupUrl(signupText) {
    if (!signupText) return null;
    // First try full URLs with http/https
    const fullUrlMatch = signupText.match(/(https?:\/\/[^\s]+)/);
    if (fullUrlMatch) return fullUrlMatch[1];
    // Then try domain-style URLs (www.site.com or site.com/path)
    const domainMatch = signupText.match(/(?:^|\s)((?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/i);
    if (domainMatch) return 'https://' + domainMatch[1];
    return null;
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

        // Extract IG handle from host or contact field (e.g., "Dina Marie (@fabulousdinamarie)" -> "fabulousdinamarie")
        let contact = '';
        const hostStr = m.host || m.contact || '';
        const igMatch = hostStr.match(/@([a-zA-Z0-9_.]+)/);
        if (igMatch) {
            contact = igMatch[1];
        }

        // Shorten venue names: "Comedy Club" → "CC" (anywhere in name)
        let venueName = m.venueName || m.venue || m.name || 'Unknown Venue';
        venueName = venueName.replace(/Comedy Club/gi, 'CC');

        // Derive day from API data or date field
        let day = m.day;
        if (!day && m.date) {
            // If API provides a date string, parse it to get day name
            const dateObj = new Date(m.date);
            if (!isNaN(dateObj.getTime())) {
                day = CONFIG.dayNames[dateObj.getDay()];
            }
        }
        if (!day) {
            // Fallback: assume today if no day info available
            day = CONFIG.dayNames[new Date().getDay()];
        }

        return {
            ...m,
            id: m._id || m.id,  // Normalize MongoDB _id to id
            title: venueName,
            venue: venueName,
            start: startDate,
            timeStr: m.startTime ? m.startTime.replace(/\s*(AM|PM)/i, '').trim() : '',
            hood: m.neighborhood || 'NYC',
            price: m.cost || 'Free',
            setTime: m.stageTime || '5min',
            type: m.borough || 'NYC',
            status: status,
            signupUrl: extractSignupUrl(signup),
            signupEmail: extractSignupEmail(signup),
            signupInstructions: signup || 'No signup info available',
            lng: m.lon || m.lng,  // API returns 'lon', normalize to 'lng'
            address: m.address || '',
            contact: contact,
            borough: m.borough,
            day: day,
            notes: m.notes || null
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
   isMicVisible - Determines if a mic passes current filters
   Must mirror the exact filtering logic in render()
   ========================================================================= */
function isMicVisible(mic) {
    const currentTime = new Date();
    const activeDayName = getActivePlanningDayName();

    // Day filter
    if (activeDayName && mic.day !== activeDayName) return false;
    if (STATE.currentMode === 'today') {
        const diffMins = mic.start ? (mic.start - currentTime) / 60000 : 999;
        if (diffMins < -30) return false;
    }

    // Price filter
    if (STATE.activeFilters.price !== 'All') {
        const priceStr = (mic.price || 'Free').toLowerCase();
        const isFree = priceStr.includes('free');
        if (STATE.activeFilters.price === 'Free' && !isFree) return false;
        if (STATE.activeFilters.price === 'Paid' && isFree) return false;
    }

    // Time filter
    if (STATE.activeFilters.time !== 'All' && mic.start) {
        const range = CONFIG.timeRanges[STATE.activeFilters.time];
        const comedyMins = toComedyMinutes(mic.start);
        if (range && !isWithinTimeRange(comedyMins, range)) return false;
    }

    return true;
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
