/* =================================================================
   PLANNER
   Map-first route planning - click markers to build route
   ================================================================= */

// Persist plan state to localStorage
function persistPlanState() {
    localStorage.setItem('planRoute', JSON.stringify(STATE.route));
    localStorage.setItem('planDismissed', JSON.stringify(STATE.dismissed));
    localStorage.setItem('planSetDuration', STATE.setDuration.toString());
    localStorage.setItem('planTimeWindowStart', STATE.timeWindowStart.toString());
    localStorage.setItem('planTimeWindowEnd', STATE.timeWindowEnd.toString());
}

// Clear plan state from localStorage
function clearPlanState() {
    localStorage.removeItem('planRoute');
    localStorage.removeItem('planDismissed');
}

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

    // Remove from dismissed list if it was there
    STATE.dismissed = STATE.dismissed.filter(id => id !== micId);

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
    persistPlanState();
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

    // Handle edge cases
    if (points.length === 0 && lastMic) {
        // No points at all - center on last mic
        map.setView([lastMic.lat, lastMic.lng], 15, { animate: true });
        return;
    }

    if (points.length === 1) {
        // Single point - center and zoom appropriately
        map.setView(points[0], 15, { animate: true });
        return;
    }

    // 2+ points - fit bounds
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
    // Add to dismissed list so it shows crossed out on map
    if (!STATE.dismissed.includes(micId)) {
        STATE.dismissed.push(micId);
    }
    // Cap dismissed list to prevent unbounded growth
    if (STATE.dismissed.length > 50) {
        STATE.dismissed = STATE.dismissed.slice(-50);
    }
    updateRouteClass();
    render(STATE.currentMode);  // Re-render to update strikethrough on times
    updateMarkerStates();       // Update marker visual states (selected, dimmed, etc.)
    updateRouteLine();
    renderPlanDrawer();
    persistPlanState();
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
                el.classList.remove('marker-selected', 'marker-glow', 'marker-suggested', 'marker-dimmed', 'marker-dismissed');
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
                el.classList.remove('marker-selected', 'marker-glow', 'marker-suggested', 'marker-dimmed', 'marker-dismissed');
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
        el.classList.remove('marker-selected', 'marker-glow', 'marker-suggested', 'marker-dimmed', 'marker-dismissed');

        // Check if any mic at this marker is in the route
        const hasSelectedMic = mics.some(m => STATE.route.includes(m.id));
        if (hasSelectedMic) {
            el.classList.add('marker-selected');
            removeCommuteLabel(el);
            return;
        }

        // Check if ALL mics at this marker are dismissed
        const allDismissed = mics.every(m => STATE.dismissed.includes(m.id));
        if (allDismissed) {
            el.classList.add('marker-dismissed');
            removeCommuteLabel(el);
            return;
        }

        // Use earliest mic for commute label
        const earliestMic = mics.reduce((a, b) => (a.start || 0) < (b.start || 0) ? a : b);
        const commuteMins = getCommuteBetweenMics(lastMic, earliestMic);
        setCommuteLabel(el, commuteMins);

        // Check if ANY mic at this marker is reachable (not dimmed and not dismissed)
        const anyReachable = mics.some(mic => {
            if (STATE.route.includes(mic.id)) return true;
            if (STATE.dismissed.includes(mic.id)) return false;
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
    const grace = STATE.planGracePeriod || 5;

    // Use Time filter to determine availability window
    const timeFilter = STATE.activeFilters?.time || 'All';

    // Only apply time window filtering if a specific time range is selected
    if (timeFilter !== 'All' && CONFIG.timeRanges && CONFIG.timeRanges[timeFilter]) {
        const range = CONFIG.timeRanges[timeFilter];
        const windowStartMins = range.start * 60;  // CONFIG uses 24-hour format (17 = 5pm)
        const windowEndMins = (range.end === 24 ? 24 : range.end) * 60;

        // Dim mics outside the user's availability window
        if (candidateTime < windowStartMins || candidateTime > windowEndMins) {
            return 'dimmed';
        }
    }

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
    if (candidateEndTime <= firstMicTime + grace) {
        return 'visible';
    }

    // Check if candidate can fit AFTER the last mic
    const lastMicTime = routeMics[routeMics.length - 1].time;
    const lastMicEndTime = lastMicTime + setDuration + travelMins;
    if (candidateTime >= lastMicEndTime - grace) {
        return 'visible';
    }

    // Check if candidate can fit BETWEEN any two consecutive mics
    for (let i = 0; i < routeMics.length - 1; i++) {
        const prevMicEndTime = routeMics[i].time + setDuration + travelMins;
        const nextMicTime = routeMics[i + 1].time;

        // Candidate must start after prev mic ends and end before next mic starts
        if (candidateTime >= prevMicEndTime - grace && candidateEndTime <= nextMicTime + grace) {
            return 'visible';
        }
    }

    return 'dimmed';  // Can't fit anywhere
}

// Route polyline for map
let routePolyline = null;

// Update route line on map
function updateRouteLine() {
    // Remove existing line
    if (routePolyline) {
        map.removeLayer(routePolyline);
        routePolyline = null;
    }

    // Need at least 2 points to draw a line
    if (STATE.route.length < 2) return;

    // Get coordinates for each mic in route
    const points = STATE.route
        .map(id => STATE.mics.find(m => m.id === id))
        .filter(m => m && m.lat && m.lng)
        .map(m => [m.lat, m.lng]);

    if (points.length < 2) return;

    // Create dashed polyline
    routePolyline = L.polyline(points, {
        color: '#22c55e',      // Green to match selected markers
        weight: 3,
        opacity: 0.8,
        dashArray: '10, 10',
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(map);
}

// Handle set duration change
function onSetDurationChange(value) {
    STATE.setDuration = parseInt(value, 10);
    updateMarkerStates();
    renderPlanDrawer();
    persistPlanState();
}

// Handle time window change
function onTimeWindowChange() {
    const startEl = document.getElementById('planTimeStart');
    const endEl = document.getElementById('planTimeEnd');
    if (startEl) STATE.timeWindowStart = parseInt(startEl.value, 10);
    if (endEl) STATE.timeWindowEnd = parseInt(endEl.value, 10);
    updateMarkerStates();  // Re-evaluate which mics are reachable
    renderPlanDrawer();
    persistPlanState();
}

// Duration options for Plan My Night
const planDurationOptions = [
    { value: 30, label: '30' },
    { value: 45, label: '45' },
    { value: 60, label: '60' },
    { value: 90, label: '90' }
];

// Handle duration pill click - expand if collapsed, select if expanded
function handleDurationClick(value, event) {
    event.stopPropagation();
    const picker = document.getElementById('plan-duration-picker');
    const isExpanded = picker.classList.contains('expanded');

    if (!isExpanded) {
        // Expand
        picker.classList.add('expanded');
    } else {
        // Select this option
        STATE.setDuration = value;

        // Update selected state
        picker.querySelectorAll('.plan-duration-pill').forEach(pill => {
            pill.classList.toggle('selected', parseInt(pill.dataset.value) === value);
        });

        // Collapse after brief delay
        setTimeout(() => {
            picker.classList.remove('expanded');
        }, 150);

        // Update markers and persist
        updateMarkerStates();
        renderPlanDrawer();
        persistPlanState();
    }
}

// Close duration picker when clicking outside
document.addEventListener('click', (e) => {
    const picker = document.getElementById('plan-duration-picker');
    if (picker && !picker.contains(e.target)) {
        picker.classList.remove('expanded');
    }
});

// Initialize the plan filter row in the header
function initPlanFilterRow() {
    const container = document.getElementById('plan-filter-row');
    if (!container) return;

    const duration = STATE.setDuration || 45;

    container.innerHTML = `
        <div class="plan-header-title">Plan My Night</div>
        <div class="plan-duration-row" onclick="event.stopPropagation()">
            <span class="plan-duration-label">Stay</span>
            <div class="plan-duration-picker" id="plan-duration-picker">
                ${planDurationOptions.map(opt => `
                    <button class="plan-duration-pill${opt.value === duration ? ' selected' : ''}"
                            data-value="${opt.value}"
                            onclick="handleDurationClick(${opt.value}, event)">
                        ${opt.label}
                    </button>
                `).join('')}
            </div>
            <span class="plan-duration-unit">min</span>
        </div>
    `;
}

// Render drawer content for plan mode
function renderPlanDrawer() {
    const container = document.getElementById('list-content');
    if (!container) return;

    let html = '';

    // When route is empty, show the normal mic list (render() adds "+ Tonight" buttons in plan mode)
    if (STATE.route.length === 0) {
        render(STATE.currentMode);
        return;
    }

    // Show current route
    const stopCount = STATE.route.length;
    const stopWord = stopCount === 1 ? 'stop' : 'stops';
    const swipeHint = STATE.drawerState === 'peek' ? '<span style="font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.5);">Swipe up ↑</span>' : '';
    html += '<div style="padding: 16px;">';
    html += `<div style="font-size: 17px; font-weight: 700; color: #fff; margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;">
        <span>${stopCount} ${stopWord} planned</span>
        ${swipeHint}
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
