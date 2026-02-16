/* =================================================================
   PLANNER
   Map-first route planning - click markers to build route
   ================================================================= */

// Confirm before exiting plan mode if route has items
function confirmExitPlanMode() {
    if (STATE.route.length > 0) {
        if (!confirm('Exit plan mode? Your schedule is saved.')) return;
    }
    exitPlanMode();
}

// Handle add button click with animation and toast
function handleAddClick(btn, micId) {
    if (STATE.route.includes(micId)) return;

    if ('vibrate' in navigator) {
        navigator.vibrate(10);
    }

    // Get mic info for toast
    const mic = STATE.mics.find(m => m.id === micId);
    const venueName = mic ? (mic.title || mic.venue || 'Mic') : 'Mic';

    // Add animation class
    btn.classList.add('added');

    // Add to route after brief delay for animation
    setTimeout(() => {
        addToRoute(micId, true); // skipZoom since user clicked from list

        // Show toast
        if (typeof toastService !== 'undefined' && toastService.show) {
            toastService.show(`Added ${venueName}`, 'success');
        }
    }, 150);
}

// Persist plan state to localStorage
function persistPlanState() {
    // Save current route to the specific date in schedules
    const dateKey = STATE.selectedCalendarDate || new Date().toDateString();

    if (dateKey) {
        if (STATE.route.length > 0) {
            STATE.schedules[dateKey] = [...STATE.route];
        } else {
            delete STATE.schedules[dateKey];
        }
        localStorage.setItem('planSchedules', JSON.stringify(STATE.schedules));
    }

    // Keep legacy/session storage for recovery
    localStorage.setItem('planRoute', JSON.stringify(STATE.route));
    localStorage.setItem('planDismissed', JSON.stringify(STATE.dismissed));
    localStorage.setItem('planSetDuration', STATE.setDuration.toString());
    if (STATE.timeWindowStart) localStorage.setItem('planTimeWindowStart', STATE.timeWindowStart.toString());
    if (STATE.timeWindowEnd) localStorage.setItem('planTimeWindowEnd', STATE.timeWindowEnd.toString());

    // Update calendar dots to reflect changes
    if (typeof renderCalendarDots === 'function') {
        renderCalendarDots();
    }
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

// Track when plan mode started (for overlay persist delay)
let planModeStartTime = 0;
const OVERLAY_MIN_DURATION = 5000; // Show overlay for at least 5 seconds

// Called when entering plan mode to reset the timer
function resetPlanOverlayTimer() {
    planModeStartTime = Date.now();
    document.body.classList.remove('map-interacted');
}

// Hide plan overlay when user interacts with map (after delay)
function onPlanMapInteraction() {
    if (STATE.planMode) {
        const elapsed = Date.now() - planModeStartTime;
        if (elapsed >= OVERLAY_MIN_DURATION) {
            document.body.classList.add('map-interacted');
        }
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
    render(STATE.currentMode);  // Re-render (includes My Schedule card)
    updateMarkerStates();       // Update marker visual states (selected, dimmed, etc.)
    updateRouteLine();
    persistPlanState();
    if (!skipZoom) fitMapToReachableMics();

    // Trigger pulse animation on schedule card
    const scheduleCard = document.querySelector('.my-schedule-card');
    if (scheduleCard) {
        scheduleCard.classList.add('just-added');
        setTimeout(() => scheduleCard.classList.remove('just-added'), 600);
    }
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
    if ('vibrate' in navigator) {
        navigator.vibrate(10);
    }
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
    render(STATE.currentMode);  // Re-render (includes My Schedule card)
    updateMarkerStates();       // Update marker visual states (selected, dimmed, etc.)
    updateRouteLine();
    persistPlanState();
}

// Reorder scheduled items (itinerary-grade)
function moveRouteItem(micId, direction) {
    const idx = STATE.route.indexOf(micId);
    if (idx < 0) return;
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= STATE.route.length) return;

    const next = STATE.route[nextIdx];
    STATE.route[nextIdx] = micId;
    STATE.route[idx] = next;

    updateRouteClass();
    render(STATE.currentMode);
    updateMarkerStates();
    updateRouteLine();
    persistPlanState();
}

function sortRouteByTime() {
    STATE.route.sort((a, b) => {
        const micA = STATE.mics.find(m => m.id === a);
        const micB = STATE.mics.find(m => m.id === b);
        if (!micA || !micB) return 0;
        return (micA.start || 0) - (micB.start || 0);
    });
    updateRouteClass();
    render(STATE.currentMode);
    updateMarkerStates();
    updateRouteLine();
    persistPlanState();
}

// Desktop drag-and-drop reorder for schedule (HTML5 DnD)
function initScheduleDragAndDrop(containerEl) {
    if (!containerEl || containerEl.dataset.dndBound === '1') return;
    containerEl.dataset.dndBound = '1';

    let draggedEl = null;

    const getItemEls = () => Array.from(containerEl.querySelectorAll('.my-schedule-item[data-mic-id]'));
    const getOrder = () => getItemEls().map(el => el.dataset.micId).filter(Boolean);

    containerEl.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.my-schedule-item[data-mic-id]');
        if (!item) return;
        draggedEl = item;
        item.classList.add('dragging');
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.micId || '');
        }
    });

    containerEl.addEventListener('dragend', () => {
        if (draggedEl) draggedEl.classList.remove('dragging');
        draggedEl = null;
    });

    containerEl.addEventListener('dragover', (e) => {
        if (!draggedEl) return;
        e.preventDefault();

        const over = e.target.closest('.my-schedule-item[data-mic-id]');
        if (!over || over === draggedEl) return;

        const rect = over.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        if (before) {
            containerEl.insertBefore(draggedEl, over);
        } else {
            containerEl.insertBefore(draggedEl, over.nextSibling);
        }
    });

    containerEl.addEventListener('drop', (e) => {
        if (!draggedEl) return;
        e.preventDefault();

        const newOrder = getOrder();
        if (!newOrder.length) return;

        STATE.route = newOrder;
        persistPlanState();
        updateRouteClass();
        updateMarkerStates();
        updateRouteLine();
        render(STATE.currentMode);
    });
}

// Touch/pointer drag-to-reorder for schedule (mobile-friendly)
function initScheduleTouchReorder(containerEl) {
    if (!containerEl || containerEl.dataset.touchDndBound === '1') return;
    containerEl.dataset.touchDndBound = '1';

    containerEl.style.position = containerEl.style.position || 'relative';

    let draggedEl = null;
    let placeholder = null;
    let startY = 0;
    let startTop = 0;
    let pointerId = null;

    const getItemEls = () => Array.from(containerEl.querySelectorAll('.my-schedule-item[data-mic-id]'));
    const getOrder = () => getItemEls().map(el => el.dataset.micId).filter(Boolean);

    const cleanup = () => {
        if (draggedEl) {
            draggedEl.classList.remove('dragging-touch');
            draggedEl.style.position = '';
            draggedEl.style.left = '';
            draggedEl.style.right = '';
            draggedEl.style.top = '';
            draggedEl.style.width = '';
            draggedEl.style.zIndex = '';
            draggedEl.style.pointerEvents = '';
        }
        if (placeholder) placeholder.remove();
        placeholder = null;
        draggedEl = null;
        startY = 0;
        startTop = 0;
        pointerId = null;
    };

    const maybeAutoScroll = (clientY) => {
        const rect = containerEl.getBoundingClientRect();
        const edge = 40;
        if (clientY < rect.top + edge) containerEl.scrollTop -= 10;
        if (clientY > rect.bottom - edge) containerEl.scrollTop += 10;
    };

    containerEl.addEventListener('pointerdown', (e) => {
        const handle = e.target.closest('.schedule-drag-handle');
        if (!handle) return;
        const item = e.target.closest('.my-schedule-item[data-mic-id]');
        if (!item) return;

        // Only activate for coarse pointers (phones/tablets) to avoid fighting desktop DnD
        const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (!isCoarse) return;

        e.preventDefault();
        e.stopPropagation();

        pointerId = e.pointerId;
        handle.setPointerCapture(pointerId);

        draggedEl = item;
        draggedEl.classList.add('dragging-touch');

        const containerRect = containerEl.getBoundingClientRect();
        const itemRect = draggedEl.getBoundingClientRect();

        startY = e.clientY;
        startTop = itemRect.top - containerRect.top + containerEl.scrollTop;

        placeholder = document.createElement('div');
        placeholder.className = 'schedule-placeholder';
        placeholder.style.height = `${itemRect.height}px`;
        containerEl.insertBefore(placeholder, draggedEl.nextSibling);

        draggedEl.style.position = 'absolute';
        draggedEl.style.left = '0';
        draggedEl.style.right = '0';
        draggedEl.style.width = '100%';
        draggedEl.style.top = `${startTop}px`;
        draggedEl.style.zIndex = '20';
        draggedEl.style.pointerEvents = 'none';

        if ('vibrate' in navigator) navigator.vibrate(8);
    });

    containerEl.addEventListener('pointermove', (e) => {
        if (!draggedEl || e.pointerId !== pointerId) return;
        e.preventDefault();

        maybeAutoScroll(e.clientY);

        const delta = e.clientY - startY;
        const nextTop = startTop + delta;
        draggedEl.style.top = `${nextTop}px`;

        const containerRect = containerEl.getBoundingClientRect();
        const yInContainer = (e.clientY - containerRect.top) + containerEl.scrollTop;

        const items = getItemEls().filter(el => el !== draggedEl);
        const beforeEl = items.find(el => {
            const r = el.getBoundingClientRect();
            const mid = (r.top - containerRect.top) + containerEl.scrollTop + (r.height / 2);
            return yInContainer < mid;
        });

        if (beforeEl) {
            if (placeholder && placeholder.nextSibling !== beforeEl) {
                containerEl.insertBefore(placeholder, beforeEl);
            }
        } else {
            containerEl.appendChild(placeholder);
        }
    });

    containerEl.addEventListener('pointerup', (e) => {
        if (!draggedEl || e.pointerId !== pointerId) return;
        e.preventDefault();

        // Insert dragged element where placeholder ended
        containerEl.insertBefore(draggedEl, placeholder);

        const newOrder = getOrder();
        cleanup();

        if (!newOrder.length) return;
        STATE.route = newOrder;
        persistPlanState();
        updateRouteClass();
        updateMarkerStates();
        updateRouteLine();
        render(STATE.currentMode);
    });

    containerEl.addEventListener('pointercancel', (e) => {
        if (!draggedEl || e.pointerId !== pointerId) return;
        e.preventDefault();
        cleanup();
    });
}

function initScheduleReorder(containerEl) {
    if (!containerEl) return;

    const finePointer = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    containerEl.querySelectorAll('.my-schedule-item[data-mic-id]').forEach(el => {
        el.draggable = !!finePointer;
    });

    if (finePointer) {
        initScheduleDragAndDrop(containerEl);
    }

    initScheduleTouchReorder(containerEl);
}

// Toggle mic in/out of route (called when marker clicked in plan mode)
function toggleMicInRoute(micId, skipZoom = false) {
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

    // If not in plan mode: just mark scheduled mics, leave others normal
    if (!STATE.planMode) {
        todayMics.forEach(mic => {
            const marker = STATE.markerLookup[mic.id];
            if (!marker) return;
            const el = marker.getElement();
            if (!el) return;
            el.classList.remove('marker-selected', 'marker-glow', 'marker-suggested', 'marker-dimmed', 'marker-dismissed');
            removeCommuteLabel(el);
            if (STATE.route?.includes(mic.id)) {
                el.classList.add('marker-selected');
            }
        });
        return;
    }

    // In plan mode with empty route - show commute from user location
    if (STATE.route.length === 0) {
        // Sort by start time so earliest mic is processed first
        const sortedMics = [...todayMics].sort((a, b) => (a.start || 0) - (b.start || 0));
        const labeledMarkers = new Set();
        let earliestGlobalTime = Infinity;

        // First pass: Find earliest mic time
        sortedMics.forEach(mic => {
            const t = getTimeInMinutes(mic.start);
            if (t < earliestGlobalTime) earliestGlobalTime = t;
        });

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

                // Highlight the earliest mic(s) as "suggested start"
                if (getTimeInMinutes(mic.start) === earliestGlobalTime) {
                    el.classList.add('marker-glow');
                } else {
                    el.classList.add('marker-suggested');
                }
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

    // PASS 1: Calculate states and find the best "next" option
    const markerUpdates = [];
    let minReachableTime = Infinity;

    markerMics.forEach((mics, marker) => {
        const el = marker.getElement();
        if (!el) return;

        let state = 'dimmed'; // Default to dimmed
        let markerReachableTime = Infinity;
        let commuteMins = 0;

        // Check if any mic at this marker is in the route
        const hasSelectedMic = mics.some(m => STATE.route.includes(m.id));
        if (hasSelectedMic) {
            state = 'selected';
        } else {
            // Check if ALL mics at this marker are dismissed
            const allDismissed = mics.every(m => STATE.dismissed.includes(m.id));
            if (allDismissed) {
                state = 'dismissed';
            } else {
                // Use earliest mic for commute label calculation base
                const earliestMic = mics.reduce((a, b) => (a.start || 0) < (b.start || 0) ? a : b);
                commuteMins = getCommuteBetweenMics(lastMic, earliestMic);

                // Check if ANY mic at this marker is reachable
                let anyReachable = false;
                mics.forEach(mic => {
                    if (STATE.route.includes(mic.id)) return;
                    if (STATE.dismissed.includes(mic.id)) return;

                    const status = getMicStatus(mic.id, lastMicId, commuteMins);
                    if (status !== 'dimmed') {
                        anyReachable = true;
                        const t = getTimeInMinutes(mic.start);
                        if (t < markerReachableTime) markerReachableTime = t;
                    }
                });

                if (anyReachable) {
                    state = 'suggested';
                    if (markerReachableTime < minReachableTime) {
                        minReachableTime = markerReachableTime;
                    }
                }
            }
        }
        // Store update info
        markerUpdates.push({ el, state, commuteMins, reachableTime: markerReachableTime });
    });

    // PASS 2: Apply updates
    let glowApplied = false;

    // Sort updates to prioritize the "best" suggestion for glowing
    // Criteria: Is Suggested -> Earliest Reachable Time -> Shortest Commute
    markerUpdates.sort((a, b) => {
        if (a.state !== 'suggested' && b.state === 'suggested') return 1;
        if (a.state === 'suggested' && b.state !== 'suggested') return -1;
        
        if (a.reachableTime !== b.reachableTime) return a.reachableTime - b.reachableTime;
        return a.commuteMins - b.commuteMins;
    });

    markerUpdates.forEach(({ el, state, commuteMins, reachableTime }) => {
        // Clear previous states
        el.classList.remove('marker-selected', 'marker-glow', 'marker-suggested', 'marker-dimmed', 'marker-dismissed');
        removeCommuteLabel(el);

        if (state === 'selected') {
            el.classList.add('marker-selected');
        } else if (state === 'dismissed') {
            el.classList.add('marker-dismissed');
        } else if (state === 'dimmed') {
            el.classList.add('marker-dimmed');
        } else if (state === 'suggested') {
            el.classList.add('marker-suggested');
            
            // "Google Standard" Logic:
            // 1. Only ONE marker glows (the absolute best option).
            // 2. Only the glowing marker gets the commute label (reduce noise).
            if (!glowApplied && reachableTime !== Infinity && reachableTime === minReachableTime) {
                // Double check this is actually the best one (it should be due to sort)
                el.classList.add('marker-glow');
                setCommuteLabel(el, commuteMins); // Only show label for the top recommendation
                glowApplied = true;
            }
        }
    });
}

// Get time in minutes from midnight (for comparison)
function getTimeInMinutes(date) {
    if (!(date instanceof Date)) return 0;
    let h = date.getHours();
    if (h < 4) h += 24;
    return h * 60 + date.getMinutes();
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

// Google Calendar Integration
function formatGoogleTime(date) {
    if (!date) return '';
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function generateGoogleCalendarUrl(mic) {
    if (!mic) return '';
    
    const venueName = mic.title || mic.venue || 'Open Mic';
    const title = encodeURIComponent(`Open Mic @ ${venueName}`);
    
    // Default duration 90 mins if not specified
    const start = mic.start || new Date();
    const durationMins = STATE.setDuration || 90;
    const end = new Date(start.getTime() + durationMins * 60000);
    
    const startTime = formatGoogleTime(start);
    const endTime = formatGoogleTime(end);
    
    const address = mic.address || mic.location || (mic.neighborhood ? `${mic.venue}, ${mic.neighborhood}, NY` : 'New York, NY');
    const location = encodeURIComponent(address);
    
    const price = mic.price || 'Free';
    const signup = mic.signupInstructions || 'Check app for signup details';
    const details = encodeURIComponent(`Price: ${price}\nSignup: ${signup}\n\nPlan your night with MicFinder NYC`);

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startTime}/${endTime}&location=${location}&details=${details}`;
}

function exportScheduleToGoogleCalendar() {
    if (!STATE.route || STATE.route.length === 0) {
        if (typeof toastService !== 'undefined') toastService.show('No mics in schedule', 'error');
        return;
    }

    // Since we can't batch add via URL scheme, we'll export the *first* mic 
    // or maybe open multiple tabs? Opening multiple tabs is often blocked.
    // Let's just export the first one for now, or maybe prompt?
    // BETTER: Export the whole itinerary as one event or provide links for each?
    // The requirement says "Creates events for each scheduled mic".
    // But URL scheme only does one. 
    // Let's try to add "Add to Calendar" button *per mic* in the schedule list,
    // OR just open the first one and let user handle it.
    
    // Actually, for "Add to Google Calendar" button on the schedule card, 
    // maybe we create a combined event "Mic Crawl: Venue 1, Venue 2..."?
    // Or we just add the button to each item in the list.
    
    // Let's look at the plan: "Add to Google Calendar button... Creates events for each scheduled mic".
    // If I click one button and it creates multiple events, that requires API.
    // If I use URL scheme, I can only do one.
    
    // Strategy: Add an export button *next to* the schedule that opens a modal with links for each?
    // OR add a small calendar icon to each item in the schedule list.
    
    // Let's go with adding a small calendar icon to each item in the list in `render.js`.
    // And maybe a "Export All" that tries to open multiple windows (might be blocked).
    
    // For this function, let's make it handle a specific mic ID.
}

function exportMicToCalendar(micId) {
    const mic = STATE.mics.find(m => m.id === micId);
    if (!mic) return;
    
    const url = generateGoogleCalendarUrl(mic);
    window.open(url, '_blank');
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
        if ('vibrate' in navigator) {
            navigator.vibrate(6);
        }
        picker.classList.add('expanded');
    } else {
        // Select this option
        if ('vibrate' in navigator) {
            navigator.vibrate(10);
        }
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

    const hasRoute = !!(STATE.route && STATE.route.length > 0);
    const conflictToggleText = STATE.hideConflicts ? 'Show All' : 'Hide Conflicts';

    container.innerHTML = `
        <div class="plan-header-left">
            <div class="plan-header-title">Plan My Night</div>
            <div class="plan-header-sub">
                <span id="plan-mic-count">0</span> available
            </div>
        </div>
        <div class="plan-header-right" onclick="event.stopPropagation()">
            <button class="conflict-toggle${STATE.hideConflicts ? ' active' : ''}" id="conflict-toggle" ${hasRoute ? '' : 'disabled'} onclick="event.stopPropagation(); toggleHideConflicts()" aria-label="Toggle hide conflicts">
                <span id="conflict-toggle-text">${conflictToggleText}</span>
            </button>
            <div class="plan-duration-row">
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
            <button class="plan-exit-btn" onclick="event.stopPropagation(); confirmExitPlanMode();" aria-label="Exit plan mode">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    <path d="M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </button>
        </div>
    `;
}

// Render drawer content for plan mode
// Toggle hide conflicts setting
function toggleHideConflicts() {
    if (!STATE.route || STATE.route.length === 0) return;
    STATE.hideConflicts = !STATE.hideConflicts;
    const toggle = document.getElementById('conflict-toggle');
    const toggleText = document.getElementById('conflict-toggle-text');
    if (toggle) {
        toggle.classList.toggle('active', STATE.hideConflicts);
    }
    if (toggleText) {
        toggleText.textContent = STATE.hideConflicts ? 'Show All' : 'Hide Conflicts';
    }
    render(STATE.currentMode);
}

// Legacy function - now just calls render() since My Schedule is inline
function renderPlanDrawer() {
    render(STATE.currentMode);
}

// Find mics that fit in the current schedule gaps
function getSuggestedMics() {
    if (!STATE.route || STATE.route.length === 0) return [];

    // Get today's mics
    const now = new Date();
    const todayName = CONFIG.dayNames[now.getDay()];
    const tomorrowName = CONFIG.dayNames[(now.getDay() + 1) % 7];
    const targetDay = STATE.currentMode === 'tomorrow' ? tomorrowName : todayName;
    const todayMics = STATE.mics.filter(m => m.day === targetDay);

    const routeMics = STATE.route
        .map(id => STATE.mics.find(m => m.id === id))
        .filter(m => m && m.start)
        .sort((a, b) => (a.start || 0) - (b.start || 0));

    if (routeMics.length === 0) return [];

    const suggestions = [];
    const setDuration = STATE.setDuration || 30;
    const grace = STATE.planGracePeriod || 5;

    // Helper to check if a mic is already in route or dismissed
    const isAvailable = (mic) => {
        return !STATE.route.includes(mic.id) && !STATE.dismissed.includes(mic.id);
    };

    // Helper to format reason
    const getReason = (type, travelMins) => {
        const mode = travelMins <= 15 ? 'walk' : 'travel';
        const timeStr = `${travelMins}m ${mode}`;
        
        if (travelMins <= 10) return `Nearby • ${timeStr}`;
        if (type === 'gap') return `Fits gap • ${timeStr}`;
        return `Up next • ${timeStr}`;
    };

    // 1. Check for gaps BETWEEN mics
    for (let i = 0; i < routeMics.length - 1; i++) {
        const prevMic = routeMics[i];
        const nextMic = routeMics[i+1];
        
        const prevEnd = getTimeInMinutes(prevMic.start) + setDuration;
        const nextStart = getTimeInMinutes(nextMic.start);

        // Find mics that start after prevEnd + travel and end before nextStart - travel
        todayMics.forEach(mic => {
            if (!isAvailable(mic)) return;
            
            const micStart = getTimeInMinutes(mic.start);
            const micEnd = micStart + setDuration;

            // Travel times
            const travelTo = getCommuteBetweenMics(prevMic, mic);
            const travelFrom = getCommuteBetweenMics(mic, nextMic);

            if (micStart >= prevEnd + travelTo - grace && 
                micEnd + travelFrom <= nextStart + grace) {
                
                suggestions.push({
                    mic: mic,
                    type: 'gap',
                    score: travelTo + travelFrom, // Lower is better
                    reason: getReason('gap', travelTo)
                });
            }
        });
    }

    // 2. Check for slots AFTER the last mic
    const lastMic = routeMics[routeMics.length - 1];
    const lastEnd = getTimeInMinutes(lastMic.start) + setDuration;
    
    todayMics.forEach(mic => {
        if (!isAvailable(mic)) return;

        const micStart = getTimeInMinutes(mic.start);
        const travelTo = getCommuteBetweenMics(lastMic, mic);

        // Must be after last mic (plus travel) and within reasonable time (e.g. < 2 hours wait)
        if (micStart >= lastEnd + travelTo - grace && 
            micStart <= lastEnd + travelTo + 120) {
            
            suggestions.push({
                mic: mic,
                type: 'next',
                score: travelTo + (micStart - (lastEnd + travelTo)), // Travel + Wait time
                reason: getReason('next', travelTo)
            });
        }
    });

    // Deduplicate suggestions (prefer gap fillers over tail end)
    const uniqueSuggestions = [];
    const seenIds = new Set();
    
    // Sort by type (gap first) then score (lower is better)
    suggestions.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'gap' ? -1 : 1;
        return a.score - b.score;
    });

    for (const item of suggestions) {
        if (!seenIds.has(item.mic.id)) {
            seenIds.add(item.mic.id);
            uniqueSuggestions.push(item);
        }
    }

    return uniqueSuggestions.slice(0, 3);
}

function addSuggestedMic(micId) {
    if ('vibrate' in navigator) {
        navigator.vibrate([10, 30, 10]); // Distinct 'success' pattern
    }
    
    // Find the element to animate (if possible)
    const btn = document.querySelector(`.suggested-mic-item[data-id="${micId}"] .suggested-mic-add-btn`);
    if (btn) {
        btn.innerHTML = '✓';
        btn.classList.add('added');
    }

    // Add with a slight delay to allow animation to register
    setTimeout(() => {
        addToRoute(micId, true); // skipZoom=true to not zoom out
        if (typeof toastService !== 'undefined') {
            toastService.show('Added to schedule', 'success');
        }
    }, 250);
}
