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

        return {
            ...m,
            title: m.venue,
            start: startDate,
            timeStr: m.startTime.replace(/\s*(AM|PM)/i, '').trim(),
            hood: m.neighborhood,
            price: m.cost || 'Free',
            setTime: m.stageTime || '5min',
            type: m.borough || 'NYC',
            status: status,
            signupUrl: extractSignupUrl(m.signup),
            signupEmail: extractSignupEmail(m.signup),
            signupInstructions: m.signup || 'No signup info available'
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
