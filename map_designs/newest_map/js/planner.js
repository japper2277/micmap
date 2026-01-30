/* =================================================================
   PLANNER
   Map-first route planning - click markers to build route
   ================================================================= */

// Update body class based on route state (for overlay visibility)
function updateRouteClass() {
    document.body.classList.toggle('has-route', STATE.route.length > 0);
}

// Add mic to route
function addToRoute(micId) {
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
    updateMarkerStates();
    updateRouteLine();
    renderPlanDrawer();
}

// Remove mic from route
function removeFromRoute(micId) {
    STATE.route = STATE.route.filter(id => id !== micId);
    updateRouteClass();
    updateMarkerStates();
    updateRouteLine();
    renderPlanDrawer();
}

// Toggle mic in/out of route (called when marker clicked in plan mode)
function toggleMicInRoute(micId) {
    if (!STATE.planMode) return;

    if (STATE.route.includes(micId)) {
        removeFromRoute(micId);
    } else {
        addToRoute(micId);
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

    label.textContent = `${minutes}m`;
}

// Remove commute label from marker element
function removeCommuteLabel(el) {
    if (!el) return;
    const label = el.querySelector('.marker-commute-label');
    if (label) label.remove();
}

// Calculate commute from user location to a mic
function getCommuteFromUser(mic) {
    if (!STATE.userLocation || !mic || !mic.lat) return 15; // Default

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
        todayMics.forEach(mic => {
            const marker = STATE.markerLookup[mic.id];
            if (!marker) return;
            const el = marker.getElement();
            if (el) {
                el.classList.remove('marker-selected', 'marker-glow', 'marker-suggested', 'marker-dimmed');
                // Show commute from user location
                const commuteMins = getCommuteFromUser(mic);
                setCommuteLabel(el, commuteMins);
            }
        });
        return;
    }

    const lastMicId = STATE.route[STATE.route.length - 1];
    const lastMic = STATE.mics.find(m => m.id === lastMicId);

    // Update each marker based on timing
    todayMics.forEach(mic => {
        const marker = STATE.markerLookup[mic.id];
        if (!marker) return;

        const el = marker.getElement();
        if (!el) return;

        // Clear previous states
        el.classList.remove('marker-selected', 'marker-glow', 'marker-suggested', 'marker-dimmed');

        if (STATE.route.includes(mic.id)) {
            el.classList.add('marker-selected');
            removeCommuteLabel(el); // No commute label for selected mics
        } else {
            // Calculate commute from last selected mic
            const commuteMins = getCommuteBetweenMics(lastMic, mic);
            setCommuteLabel(el, commuteMins);

            // Apply status based on timing
            const status = getMicStatus(mic.id, lastMicId, commuteMins);
            if (status === 'glow') el.classList.add('marker-glow');
            else if (status === 'suggested') el.classList.add('marker-suggested');
            else if (status === 'dimmed') el.classList.add('marker-dimmed');
        }
    });
}

// Calculate if a mic is reachable and how good the timing is
function getMicStatus(candidateId, lastMicId, commuteMins) {
    const candidate = STATE.mics.find(m => m.id === candidateId);
    const anchor = STATE.mics.find(m => m.id === lastMicId);
    if (!candidate || !anchor || !candidate.start || !anchor.start) return 'visible';

    // Candidate must be after anchor in time
    if (candidate.start <= anchor.start) return 'dimmed';

    // When does anchor mic end? (start + setDuration)
    const anchorEndTime = new Date(anchor.start.getTime() + STATE.setDuration * 60000);

    // Use provided commute time or default to 20
    const travelMins = commuteMins || 20;
    const arrivalTime = new Date(anchorEndTime.getTime() + travelMins * 60000);

    // How much buffer before the candidate mic starts?
    const waitMins = (candidate.start - arrivalTime) / 60000;

    // Status based on wait time
    if (waitMins < -5) return 'dimmed';      // Too late (5m grace period)
    if (waitMins <= 15) return 'glow';       // Perfect! Arrive 0-15m early
    if (waitMins <= 45) return 'suggested';  // Good, but some waiting
    return 'dimmed';                          // Too much dead time (45+ mins)
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
            <div style="padding: 24px 16px; text-align: center; color: rgba(255,255,255,0.4);">
                <p style="font-size: 14px;">0 stops</p>
            </div>
        `;
        return;
    }

    // Show current route
    let html = '<div style="padding: 16px;">';
    html += '<div style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">Your Route</div>';

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
