/* =================================================================
   PLANNER
   Map-first route planning - click markers to build route
   ================================================================= */

// Update body class based on route state (for overlay visibility)
function updateRouteClass() {
    document.body.classList.toggle('has-route', STATE.route.length > 0);
}

// Hide plan overlay when user interacts with map
function onPlanMapInteraction() {
    if (STATE.planMode) {
        document.body.classList.add('map-interacted');
    }
}

// Setup map event listeners for plan mode (called once)
let planMapListenersAdded = false;
function setupPlanMapListeners() {
    if (planMapListenersAdded) return;
    planMapListenersAdded = true;

    map.on('movestart', onPlanMapInteraction);
    map.on('zoomstart', onPlanMapInteraction);
}

// Add mic to route
function addToRoute(micId, skipZoom = false) {
    if (STATE.route.includes(micId)) return;

    STATE.route.push(micId);

    // Sort by start time
    STATE.route.sort((a, b) => {
        const micA = STATE.mics.find(m => m.id === a);
        const micB = STATE.mics.find(m => m.id === b);
        if (!micA || !micB) return 0;
        return micA.start - micB.start;
    });

    updateRouteClass();
    render(STATE.currentMode);  // Re-render to update strikethrough on times
    updateMarkerStates();       // Update marker visual states (selected, dimmed, etc.)
    updateRouteLine();
    renderPlanDrawer();
    if (!skipZoom) fitMapToReachableMics();
}

// Fit map to show selected mic + all reachable (non-dimmed) mics
function fitMapToReachableMics() {
    if (!STATE.planMode || STATE.route.length === 0) return;

    const lastMicId = STATE.route[STATE.route.length - 1];
    const lastMic = STATE.mics.find(m => m.id === lastMicId);
    if (!lastMic) return;

    // Get today's mics
    const now = new Date();
    const todayName = CONFIG.dayNames[now.getDay()];
    const tomorrowName = CONFIG.dayNames[(now.getDay() + 1) % 7];
    const targetDay = STATE.currentMode === 'tomorrow' ? tomorrowName : todayName;
    const todayMics = STATE.mics.filter(m => m.day === targetDay);

    // Collect bounds: selected mics + reachable mics (glow/suggested)
    const points = [];

    // Add all selected mics
    STATE.route.forEach(id => {
        const mic = STATE.mics.find(m => m.id === id);
        if (mic && mic.lat && mic.lng) {
            points.push([mic.lat, mic.lng]);
        }
    });

    // Add reachable mics (check marker state)
    todayMics.forEach(mic => {
        if (STATE.route.includes(mic.id)) return; // Already added
        if (!mic.lat || !mic.lng) return;

        const marker = STATE.markerLookup[mic.id];
        if (!marker) return;
        const el = marker.getElement();
        if (!el) return;

        // Include if glow or suggested (not dimmed)
        if (el.classList.contains('marker-glow') || el.classList.contains('marker-suggested')) {
            points.push([mic.lat, mic.lng]);
        }
    });

    // Need at least 2 points to fit bounds
    if (points.length < 2) return;

    // Fit map with padding
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, {
        padding: [60, 60],
        maxZoom: 15,
        animate: true,
        duration: 0.4
    });
}

// Remove mic from route
function removeFromRoute(micId) {
    STATE.route = STATE.route.filter(id => id !== micId);
    updateRouteClass();
    render(STATE.currentMode);  // Re-render to update strikethrough on times
    updateMarkerStates();       // Update marker visual states (selected, dimmed, etc.)
    updateRouteLine();
    renderPlanDrawer();
}

// Toggle mic in/out of route (called when marker clicked in plan mode)
function toggleMicInRoute(micId, skipZoom = false) {
    if (!STATE.planMode) return;

    if (STATE.route.includes(micId)) {
        removeFromRoute(micId);
    } else {
        addToRoute(micId, skipZoom);
    }
}

// Estimate commute time between two mics (in minutes)
function getCommuteBetweenMics(fromMic, toMic) {
    if (!fromMic || !toMic || !fromMic.lat || !toMic.lat) return 20;

    // Calculate distance in km using Haversine
    const R = 6371;
    const dLat = (toMic.lat - fromMic.lat) * Math.PI / 180;
    const dLon = (toMic.lng - fromMic.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(fromMic.lat * Math.PI / 180) * Math.cos(toMic.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    // Estimate transit time: ~3 min per km in NYC (walking + subway)
    // Add 5 min base for getting to/from stations
    return Math.round(5 + distance * 3);
}

// Add or update commute label on a marker element
function setCommuteLabel(el, minutes) {
    if (!el) return;

    // Find or create commute label
    let label = el.querySelector('.marker-commute-label');
    if (!label) {
        label = document.createElement('div');
        label.className = 'marker-commute-label';
        el.appendChild(label);
    }

    label.textContent = `${minutes}M`;
}

// Remove commute label from marker element
function removeCommuteLabel(el) {
    if (!el) return;
    const label = el.querySelector('.marker-commute-label');
    if (label) label.remove();
}

// Calculate commute from user location to a mic
function getCommuteFromUser(mic) {
    // Prefer walking time if available (matches modal's first option for walkable venues)
    if (mic.walkMins !== undefined) {
        return Math.round(mic.walkMins);
    }

    // Use transit time if available
    if (mic.transitMins !== undefined) {
        return Math.round(mic.transitMins);
    }

    // Fallback to distance estimate
    if (!STATE.userLocation || !mic || !mic.lat) return 15;

    const R = 6371;
    const dLat = (mic.lat - STATE.userLocation.lat) * Math.PI / 180;
    const dLon = (mic.lng - STATE.userLocation.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(STATE.userLocation.lat * Math.PI / 180) * Math.cos(mic.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;

    return Math.round(5 + distance * 3);
}

// Update marker visual states based on route
function updateMarkerStates() {
    // Get today's mics only (same day as current mode)
    const now = new Date();
    const todayName = CONFIG.dayNames[now.getDay()];
    const tomorrowName = CONFIG.dayNames[(now.getDay() + 1) % 7];
    const targetDay = STATE.currentMode === 'tomorrow' ? tomorrowName : todayName;

    const todayMics = STATE.mics.filter(m => m.day === targetDay);

    // If not in plan mode, just clear all states
    if (!STATE.planMode) {
        todayMics.forEach(mic => {
            const marker = STATE.markerLookup[mic.id];
            if (!marker) return;
            const el = marker.getElement();
            if (el) {
                el.classList.remove('marker-selected', 'marker-glow', 'marker-suggested', 'marker-dimmed');
                removeCommuteLabel(el);
            }
        });
        return;
    }

    // In plan mode with empty route - show commute from user location
    if (STATE.route.length === 0) {
        // Sort by start time so earliest mic is processed first
        const sortedMics = [...todayMics].sort((a, b) => (a.start || 0) - (b.start || 0));
        const labeledMarkers = new Set();

        sortedMics.forEach(mic => {
            const marker = STATE.markerLookup[mic.id];
            if (!marker) return;

            // Only label each marker once (use earliest mic's time)
            if (labeledMarkers.has(marker)) return;
            labeledMarkers.add(marker);

            const el = marker.getElement();
            if (el) {
                el.classList.remove('marker-selected', 'marker-glow', 'marker-suggested', 'marker-dimmed');
                // Show commute from user location
                const commuteMins = getCommuteFromUser(mic);
                setCommuteLabel(el, commuteMins);
            }
        });
        // Mark commute times as loaded
        document.body.classList.add('commute-loaded');
        return;
    }

    const lastMicId = STATE.route[STATE.route.length - 1];
    const lastMic = STATE.mics.find(m => m.id === lastMicId);

    // Group mics by their marker (venues with multiple mics share a marker)
    const markerMics = new Map();
    todayMics.forEach(mic => {
        const marker = STATE.markerLookup[mic.id];
        if (!marker) return;
        if (!markerMics.has(marker)) markerMics.set(marker, []);
        markerMics.get(marker).push(mic);
    });

    // Update each marker based on timing
    markerMics.forEach((mics, marker) => {
        const el = marker.getElement();
        if (!el) return;

        // Clear previous states
        el.classList.remove('marker-selected', 'marker-glow', 'marker-suggested', 'marker-dimmed');

        // Check if any mic at this marker is in the route
        const hasSelectedMic = mics.some(m => STATE.route.includes(m.id));
        if (hasSelectedMic) {
            el.classList.add('marker-selected');
            removeCommuteLabel(el);
            return;
        }

        // Use earliest mic for commute label
        const earliestMic = mics.reduce((a, b) => (a.start || 0) < (b.start || 0) ? a : b);
        const commuteMins = getCommuteBetweenMics(lastMic, earliestMic);
        setCommuteLabel(el, commuteMins);

        // Check if ANY mic at this marker is reachable (not dimmed)
        const anyReachable = mics.some(mic => {
            if (STATE.route.includes(mic.id)) return true;
            const status = getMicStatus(mic.id, lastMicId, commuteMins);
            return status !== 'dimmed';
        });

        // Only dim if ALL mics at this marker are unreachable
        if (!anyReachable) {
            el.classList.add('marker-dimmed');
        }
    });
}

// Get time in minutes from midnight (for comparison)
function getTimeInMinutes(date) {
    if (!(date instanceof Date)) return 0;
    return date.getHours() * 60 + date.getMinutes();
}

// Calculate if a mic is reachable - can it fit anywhere in the route?
function getMicStatus(candidateId, lastMicId, commuteMins) {
    const candidate = STATE.mics.find(m => m.id === candidateId);
    if (!candidate || !candidate.start) return 'visible';

    // Skip if already in route
    if (STATE.route.includes(candidateId)) return 'in-route';

    const candidateTime = getTimeInMinutes(candidate.start);
    const setDuration = STATE.setDuration || 30;
    const travelMins = commuteMins || 20;

    // Get sorted route mics with their times
    const routeMics = STATE.route
        .map(id => STATE.mics.find(m => m.id === id))
        .filter(m => m && m.start)
        .map(m => ({
            id: m.id,
            time: getTimeInMinutes(m.start)
        }));

    if (routeMics.length === 0) return 'visible';

    // Check if candidate can fit BEFORE the first mic
    const firstMicTime = routeMics[0].time;
    const candidateEndTime = candidateTime + setDuration + travelMins;
    if (candidateEndTime <= firstMicTime + 5) {  // 5 min grace
        return 'visible';
    }

    // Check if candidate can fit AFTER the last mic
    const lastMicTime = routeMics[routeMics.length - 1].time;
    const lastMicEndTime = lastMicTime + setDuration + travelMins;
    if (candidateTime >= lastMicEndTime - 5) {  // 5 min grace
        return 'visible';
    }

    // Check if candidate can fit BETWEEN any two consecutive mics
    for (let i = 0; i < routeMics.length - 1; i++) {
        const prevMicEndTime = routeMics[i].time + setDuration + travelMins;
        const nextMicTime = routeMics[i + 1].time;

        // Candidate must start after prev mic ends and end before next mic starts
        if (candidateTime >= prevMicEndTime - 5 && candidateEndTime <= nextMicTime + 5) {
            return 'visible';
        }
    }

    return 'dimmed';  // Can't fit anywhere
}

// Update route line on map
function updateRouteLine() {
    // Placeholder - will be implemented in phase 5
    console.log('updateRouteLine called, route:', STATE.route);
}

// Render drawer content for plan mode
function renderPlanDrawer() {
    const container = document.getElementById('list-content');
    if (!container) return;

    if (STATE.route.length === 0) {
        container.innerHTML = `
            <div style="padding: 20px 24px; text-align: center;">
                <p style="font-size: 16px; font-weight: 600; color: #fff; margin: 0; line-height: 1.4;">Tap mics on the map to add them to your schedule for the night</p>
            </div>
        `;
        return;
    }

    // Show current route
    const stopCount = STATE.route.length;
    const stopWord = stopCount === 1 ? 'stop' : 'stops';
    let html = '<div style="padding: 16px;">';
    html += `<div style="font-size: 17px; font-weight: 700; color: #fff; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;">
        <span>${stopCount} ${stopWord} planned</span>
        <span style="font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.5);">Swipe up ↑</span>
    </div>`;

    STATE.route.forEach((micId, i) => {
        const mic = STATE.mics.find(m => m.id === micId);
        if (!mic) return;

        const timeStr = mic.start ? mic.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
        const priceStr = mic.price === 0 || mic.price === 'Free' ? 'FREE' : `$${mic.price}`;
        const priceClass = mic.price === 0 || mic.price === 'Free' ? 'color: #4ade80;' : 'color: #fb923c;';

        html += `
            <div style="display: flex; align-items: center; padding: 12px; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 12px; margin-bottom: 8px;">
                <div style="font-size: 16px; font-weight: 700; width: 60px;">${timeStr}</div>
                <div style="flex: 1;">
                    <div style="font-size: 15px; font-weight: 600;">${mic.venue || mic.name}</div>
                    <div style="font-size: 12px; color: rgba(255,255,255,0.5);"><span style="${priceClass}">${priceStr}</span></div>
                </div>
                <button onclick="removeFromRoute('${micId}')" style="width: 32px; height: 32px; border-radius: 50%; background: rgba(239, 68, 68, 0.2); border: none; color: #ef4444; cursor: pointer; font-size: 16px;">✕</button>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}
