// Plan My Night - Transit & API Functions

// --- GEOLOCATION ---
async function useMyLocation() {
    const btn = document.getElementById('geo-btn');
    const originalContent = btn.innerHTML;
    const locationSection = btn.parentElement;

    // Remove any existing error help
    const existingHelp = locationSection.querySelector('.geo-error-help');
    if (existingHelp) existingHelp.remove();

    // Show loading state with spinner
    btn.innerHTML = '<div class="spinner-inline"></div> <span>Locating...</span>';
    btn.classList.add('btn-loading');
    btn.disabled = true;
    haptic('light');

    if (!navigator.geolocation) {
        btn.innerHTML = originalContent;
        btn.classList.remove('btn-loading');
        btn.disabled = false;
        showToast('Geolocation not supported', 'error');
        showGeoErrorHelp(locationSection, 'Your browser doesn\'t support location. Please search for an address or subway station below.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            haptic('success');
            selectedOrigin = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: "My Location" };
            selectOriginUI(selectedOrigin);
            btn.innerHTML = '<svg class="w-5 h-5 text-white checkmark-animated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg> <span>Location Found</span>';
            btn.classList.remove('btn-loading');
            btn.classList.add('success', 'success-flash');
            btn.disabled = false;

            // Announce to screen readers
            announceToScreenReader('Location found successfully');
        },
        (error) => {
            haptic('error');
            btn.innerHTML = originalContent;
            btn.classList.remove('btn-loading');
            btn.disabled = false;

            let errorMsg = 'Location denied';
            let helpMsg = '';

            if (error.code === 1) {
                errorMsg = 'Location permission denied';
                helpMsg = 'Location access was denied. You can search for an address or subway station below instead.';
            } else if (error.code === 2) {
                errorMsg = 'Location unavailable';
                helpMsg = 'Unable to determine your location. Try searching for your address or nearest subway station.';
            } else if (error.code === 3) {
                errorMsg = 'Location request timed out';
                helpMsg = 'Location request took too long. Please try again or search for an address below.';
            }

            showToast(errorMsg, 'error');
            showGeoErrorHelp(locationSection, helpMsg);
        },
        { timeout: 10000, enableHighAccuracy: true }
    );
}

// Show geo error help message
function showGeoErrorHelp(container, message) {
    const existingHelp = container.querySelector('.geo-error-help');
    if (existingHelp) existingHelp.remove();

    const helpDiv = document.createElement('div');
    helpDiv.className = 'geo-error-help';
    helpDiv.innerHTML = `${message} <a onclick="focusOriginSearch(); return false;" href="#">Search now →</a>`;

    const btn = container.querySelector('.geo-btn-primary');
    if (btn) {
        btn.after(helpDiv);
    }

    // Auto-hide after 10 seconds
    setTimeout(() => {
        helpDiv.style.opacity = '0';
        helpDiv.style.transition = 'opacity 0.3s ease';
        setTimeout(() => helpDiv.remove(), 300);
    }, 10000);
}

// Focus on origin search input
function focusOriginSearch() {
    const input = document.getElementById('origin-search');
    if (input) {
        input.focus();
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Note: announceToScreenReader() is defined in utils.js

// --- FETCH SUBWAY ROUTE DETAILS ---
async function fetchSubwayRoute(fromLat, fromLng, toLat, toLng) {
    try {
        const url = `${API_BASE}/api/subway/routes?userLat=${fromLat}&userLng=${fromLng}&venueLat=${toLat}&venueLng=${toLng}&limit=1`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch subway route');
        const data = await res.json();
        return data.routes && data.routes.length > 0 ? data.routes[0] : null;
    } catch (e) {
        // API error - return null to trigger fallback estimate
        return null;
    }
}

// --- GET TRANSIT TIME WITH FALLBACK ---
// Returns { mins, type, route } with fallback estimates if API fails
async function getTransitTime(fromLat, fromLng, toLat, toLng) {
    const distance = haversine(fromLat, fromLng, toLat, toLng);

    // Walking distance (< 0.5 miles) - estimate walk time
    if (distance < 0.5) {
        const walkMins = Math.round(distance * 20); // ~3 mph walking
        return {
            mins: Math.max(walkMins, 5),
            type: 'walk',
            route: null,
            isEstimate: false
        };
    }

    // Try to get real transit time from API
    try {
        const route = await fetchSubwayRoute(fromLat, fromLng, toLat, toLng);
        if (route && route.duration) {
            return {
                mins: route.adjustedTotalTime || route.totalTime || route.duration,
                type: 'transit',
                route: route,
                isEstimate: false
            };
        }
    } catch (e) {
        // API failed - will use fallback estimate below
    }

    // Fallback: estimate based on distance
    // Assume ~15 mph average with subway (including walk to station, wait, etc.)
    const estimateMins = Math.round(distance * 4 + 10); // 4 min/mile + 10 min overhead
    return {
        mins: Math.max(estimateMins, 15),
        type: 'transit',
        route: null,
        isEstimate: true
    };
}

// Check if transit estimate is used (for UI warning)
function hasTransitEstimates(sequence) {
    return sequence.some(entry => entry.transitFromPrev?.isEstimate);
}

// --- FETCH MTA ARRIVALS ---
async function fetchMTAArrivals(line, stopId) {
    try {
        const url = `${API_BASE}/api/mta/arrivals/${line}/${stopId}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch arrivals');
        const data = await res.json();
        return data.arrivals || [];
    } catch (e) {
        // API error - return empty array
        return [];
    }
}

// --- FETCH MTA ALERTS ---
async function fetchMTAAlerts() {
    try {
        const url = `${API_BASE}/api/mta/alerts`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch alerts');
        const data = await res.json();
        return data || [];
    } catch (e) {
        // API error - return empty array
        return [];
    }
}

// --- RECALCULATE TRANSIT TIMES ---
async function recalculateTransitTimes(sequence, origin) {
    if (sequence.length === 0) return;

    let current = { lat: origin.lat, lng: origin.lng };

    for (let i = 0; i < sequence.length; i++) {
        const entry = sequence[i];
        const mic = entry.mic;
        const dist = haversine(current.lat, current.lng, mic.lat, mic.lng);
        const travelMins = Math.round(dist * 20);

        const subwayRoute = await fetchSubwayRoute(current.lat, current.lng, mic.lat, mic.lng);

        entry.transitFromPrev = {
            mins: subwayRoute ? subwayRoute.duration : travelMins,
            type: travelMins < 10 ? 'walk' : 'transit',
            subwayRoute: subwayRoute
        };

        current = { lat: mic.lat, lng: mic.lng };
    }
}

// --- SHOW LIVE ARRIVALS ---
async function showLiveArrivals(line, stopId, legId) {
    const container = document.getElementById(`${legId}-arrivals`);
    if (!container) return;

    container.innerHTML = '<div class="flex items-center gap-2"><div class="spinner-inline" style="width: 14px; height: 14px;"></div><span class="text-zinc-400">Fetching live times...</span></div>';

    try {
        const arrivals = await fetchMTAArrivals(line, stopId);

        if (!arrivals || arrivals.length === 0) {
            container.innerHTML = '<span class="text-zinc-500">No arrivals data available</span>';
            return;
        }

        const now = new Date();
        const times = arrivals.slice(0, 3).map(a => {
            const mins = Math.round(a.minutes);
            const arrivalTime = new Date(now.getTime() + mins * 60000);
            let hours = arrivalTime.getHours();
            const minutes = arrivalTime.getMinutes();
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            const timeStr = `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;

            if (mins === 0) return `<span class="text-emerald-400 font-bold">Now!</span>`;
            if (mins <= 3) return `<span class="text-orange-400 font-semibold">${timeStr}</span>`;
            return `<span class="text-white">${timeStr}</span>`;
        }).join(', ');

        container.innerHTML = times;
    } catch (e) {
        container.innerHTML = '<span class="text-red-400">Unable to fetch arrivals</span>';
    }
}

// --- DIRECTIONS ---
function openDirections(venueName, lat, lng) {
    if (!lat || !lng) {
        showToast('Location not available');
        return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);

    let url;
    if (isIOS) {
        url = `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=r`;
    } else if (isAndroid) {
        url = `google.navigation:q=${lat},${lng}&mode=transit`;
    } else {
        url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=transit`;
        window.open(url, '_blank');
        return;
    }

    window.location.href = url;
    setTimeout(() => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=transit`, '_blank');
    }, 2000);
}

// --- REMOVE MIC FROM ROUTE ---
async function removeMicFromRoute(micId) {
    if (!currentRoute || !currentRoute.sequence) {
        showToast('No route to modify');
        return;
    }

    if (!confirm('Remove this mic from your route?')) {
        return;
    }

    const micIndex = currentRoute.sequence.findIndex(e => e.mic.id === micId);
    if (micIndex === -1) {
        showToast('Mic not found');
        return;
    }

    const removedMic = currentRoute.sequence[micIndex];
    currentRoute.sequence = currentRoute.sequence.filter(e => e.mic.id !== micId);

    if (currentRoute.sequence.length === 0) {
        document.getElementById('results').classList.add('hidden');
        showToast('Route is now empty');
        return;
    }

    await recalculateTransitTimes(currentRoute.sequence, currentRoute.origin);
    await renderResults(currentRoute.sequence, currentRoute.origin, currentRoute.timePerVenue || 60);

    showToast(`✓ Removed ${removedMic.mic.venueName || removedMic.mic.venue}`);
}
