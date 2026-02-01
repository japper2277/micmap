// Plan My Night - Transit & API Functions

// --- UNDO STACK FOR ROUTE EDITING ---
const routeUndoStack = [];
const MAX_UNDO_HISTORY = 5;

function saveRouteToUndoStack() {
    if (!currentRoute || !currentRoute.sequence) return;
    routeUndoStack.push(JSON.parse(JSON.stringify(currentRoute)));
    if (routeUndoStack.length > MAX_UNDO_HISTORY) {
        routeUndoStack.shift();
    }
    updateUndoButtonState();
}

function undoRouteChange() {
    if (routeUndoStack.length === 0) {
        showToast('Nothing to undo');
        return;
    }

    currentRoute = routeUndoStack.pop();
    renderResults(currentRoute.sequence, currentRoute.origin, currentRoute.timePerVenue || 60);
    showToast('Undo successful');
    updateUndoButtonState();
}

function updateUndoButtonState() {
    const btn = document.getElementById('undo-btn');
    if (btn) {
        btn.disabled = routeUndoStack.length === 0;
    }
}

// Clear undo stack (call when day changes or new planning session starts)
function clearUndoStack() {
    routeUndoStack.length = 0;
    updateUndoButtonState();
}

// Export for use in app.js
window.clearUndoStack = clearUndoStack;

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        // Only trigger if we have a route and not in an input field
        if (currentRoute && routeUndoStack.length > 0) {
            const activeEl = document.activeElement;
            const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable;
            if (!isInput) {
                e.preventDefault();
                undoRouteChange();
            }
        }
    }
});

// --- CUSTOM REMOVE CONFIRMATION MODAL ---
function showRemoveConfirmModal(venueName) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'remove-confirm-modal';
        modal.innerHTML = `
            <div class="remove-confirm-overlay"></div>
            <div class="remove-confirm-sheet">
                <div class="remove-confirm-icon">🗑️</div>
                <h3>Remove from route?</h3>
                <p>Remove <strong>${venueName}</strong> from your night plan?</p>
                <div class="remove-confirm-actions">
                    <button class="remove-confirm-cancel">Cancel</button>
                    <button class="remove-confirm-delete">Remove</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Animate in
        requestAnimationFrame(() => modal.classList.add('show'));

        // Handle clicks
        const cleanup = (result) => {
            modal.classList.remove('show');
            setTimeout(() => modal.remove(), 200);
            resolve(result);
        };

        modal.querySelector('.remove-confirm-overlay').onclick = () => cleanup(false);
        modal.querySelector('.remove-confirm-cancel').onclick = () => cleanup(false);
        modal.querySelector('.remove-confirm-delete').onclick = () => cleanup(true);

        // Handle escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleEscape);
                cleanup(false);
            }
        };
        document.addEventListener('keydown', handleEscape);
    });
}

// --- GEOLOCATION ---
function setGeoButtonToFoundState(btn) {
    if (!btn) return;
    btn.innerHTML = '<svg class="w-5 h-5 text-white checkmark-animated" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg> <span>Location Found</span>';
    btn.classList.remove('btn-loading');
    btn.classList.add('success');
    btn.disabled = false;
}

async function autoUseMyLocationOnLoad() {
    try {
        if (selectedOrigin) return;
        const btn = document.getElementById('geo-btn');
        if (!btn) return;

        if (!navigator.geolocation) return;
        if (!navigator.permissions?.query) return;

        const status = await navigator.permissions.query({ name: 'geolocation' });
        if (status.state !== 'granted') return;

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                selectedOrigin = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: 'My Location' };
                selectOriginUI(selectedOrigin);
                setGeoButtonToFoundState(btn);
            },
            () => {
                // Silent fail: user can still click Use My Location manually
            },
            { timeout: 5000, enableHighAccuracy: false, maximumAge: 5 * 60 * 1000 }
        );
    } catch (_) {
        // no-op
    }
}

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
        showGeoErrorHelp(locationSection, 'Your browser doesn\'t support location. Please search for a neighborhood or subway station below.');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            haptic('success');
            selectedOrigin = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: "My Location" };
            selectOriginUI(selectedOrigin);
            setGeoButtonToFoundState(btn);
            btn.classList.add('success-flash');

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
                helpMsg = 'Location access was denied. You can search for a neighborhood or subway station below instead.';
            } else if (error.code === 2) {
                errorMsg = 'Location unavailable';
                helpMsg = 'Unable to determine your location. Try searching for a nearby subway station or neighborhood.';
            } else if (error.code === 3) {
                errorMsg = 'Location request timed out';
                helpMsg = 'Location request took too long. Please try again or search for a neighborhood below.';
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
    const walkableMiles = typeof getWalkableMilesFromUI === 'function' ? getWalkableMilesFromUI() : 0.5;

    // Walking distance - estimate walk time
    if (distance < walkableMiles) {
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
        const walkableMiles = typeof getWalkableMilesFromUI === 'function' ? getWalkableMilesFromUI() : 0.5;

        const subwayRoute = await fetchSubwayRoute(current.lat, current.lng, mic.lat, mic.lng);

        const isWalk = dist < walkableMiles;
        const isEstimate = !isWalk && !subwayRoute;

        entry.transitFromPrev = {
            mins: subwayRoute ? (subwayRoute.adjustedTotalTime || subwayRoute.totalTime || subwayRoute.duration) : Math.max(travelMins, 5),
            type: isWalk ? 'walk' : (subwayRoute ? 'transit' : 'estimate'),
            subwayRoute: subwayRoute,
            isEstimate
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

    const micIndex = currentRoute.sequence.findIndex(e => e.mic.id === micId);
    if (micIndex === -1) {
        showToast('Mic not found');
        return;
    }

    const micToRemove = currentRoute.sequence[micIndex];
    const venueName = micToRemove.mic.venueName || micToRemove.mic.venue;

    // Show custom confirmation modal
    const confirmed = await showRemoveConfirmModal(venueName);
    if (!confirmed) {
        return;
    }

    // Save current state to undo stack before modifying
    saveRouteToUndoStack();

    currentRoute.sequence = currentRoute.sequence.filter(e => e.mic.id !== micId);

    if (currentRoute.sequence.length === 0) {
        document.getElementById('results').classList.add('hidden');
        showToast('Route is now empty');
        return;
    }

    await recalculateTransitTimes(currentRoute.sequence, currentRoute.origin);
    await renderResults(currentRoute.sequence, currentRoute.origin, currentRoute.timePerVenue || 60);

    showToast(`Removed ${venueName}`);
}

// --- INSERT MIC INTO ROUTE ---
async function insertMicInRoute(afterIndex, mic) {
    if (!currentRoute || !currentRoute.sequence) {
        showToast('No route to modify');
        return;
    }

    // Validate mic has required data
    if (!mic || !mic.lat || !mic.lng) {
        showToast('Invalid mic data');
        return;
    }

    // Check if mic is already in route
    const existingIdx = currentRoute.sequence.findIndex(e => e.mic.id === mic.id);
    if (existingIdx !== -1) {
        showToast('This mic is already in your route');
        return;
    }

    // Save current state to undo stack before modifying
    saveRouteToUndoStack();

    // Create new entry
    const newEntry = {
        mic: mic,
        transitFromPrev: null
    };

    // Insert at the correct position
    const insertAt = afterIndex + 1;
    currentRoute.sequence.splice(insertAt, 0, newEntry);

    // Check for time conflicts
    const conflict = validateRouteTimeOrder();
    if (conflict) {
        showToast(`⚠️ ${conflict}`, 'warning');
    }

    // Recalculate all transit times
    await recalculateTransitTimes(currentRoute.sequence, currentRoute.origin);
    await renderResults(currentRoute.sequence, currentRoute.origin, currentRoute.timePerVenue || 60);

    showToast(`✓ Added ${mic.venueName || mic.venue}`);
}

// --- ADD MIC TO END OF ROUTE ---
async function addMicToRoute(mic) {
    if (!currentRoute || !currentRoute.sequence) {
        showToast('No route to modify');
        return;
    }

    // Insert after the last stop
    const lastIndex = currentRoute.sequence.length - 1;
    await insertMicInRoute(lastIndex, mic);
}

// --- VALIDATE ROUTE TIME ORDER ---
function validateRouteTimeOrder() {
    if (!currentRoute || !currentRoute.sequence || currentRoute.sequence.length < 2) {
        return null;
    }

    // Use the configured time per venue, default to 60 if not set
    const timePerVenue = currentRoute.timePerVenue || 60;

    for (let i = 1; i < currentRoute.sequence.length; i++) {
        const prev = currentRoute.sequence[i - 1].mic;
        const curr = currentRoute.sequence[i].mic;
        const transitMins = currentRoute.sequence[i].transitFromPrev?.mins || 0;

        // Check if we have enough time to get from prev to curr
        const prevEndMins = prev.startMins + timePerVenue;
        const neededDeparture = curr.startMins - transitMins;

        if (prevEndMins > neededDeparture) {
            const overlap = prevEndMins - neededDeparture;
            return `Overlap: You may not make it from ${prev.venueName || prev.venue} to ${curr.venueName || curr.venue} in time (${overlap} min short)`;
        }
    }

    return null;
}

// --- SHOW INSERT MIC PICKER ---
function showInsertMicPicker(afterIndex) {
    // Get available mics for the same day, excluding those already in route
    const day = currentRoute.sequence[0]?.mic?.day;
    if (!day) {
        showToast('Cannot determine day');
        return;
    }

    const routeMicIds = new Set(currentRoute.sequence.map(e => e.mic.id));
    const availableMics = (allMics || []).filter(m =>
        m.day === day && !routeMicIds.has(m.id)
    ).sort((a, b) => a.startMins - b.startMins);

    if (availableMics.length === 0) {
        showToast('No other mics available for this day');
        return;
    }

    // Create picker modal with search
    const modal = document.createElement('div');
    modal.className = 'insert-mic-modal';
    modal.innerHTML = `
        <div class="insert-mic-overlay" onclick="closeInsertMicPicker()"></div>
        <div class="insert-mic-sheet">
            <div class="insert-mic-header">
                <h3>Add a Stop</h3>
                <button onclick="closeInsertMicPicker()" class="insert-mic-close" aria-label="Close">&times;</button>
            </div>
            <div class="insert-mic-search">
                <input type="text" id="insert-mic-search-input" placeholder="Search mics..." autocomplete="off">
            </div>
            <div class="insert-mic-list">
                ${availableMics.map(m => `
                    <div class="insert-mic-item" data-venue-name="${(m.venueName || m.venue).toLowerCase()}" onclick="selectMicToInsert(${afterIndex}, '${m.id}')">
                        <div class="insert-mic-time">${minsToTime(m.startMins)}</div>
                        <div class="insert-mic-info">
                            <div class="insert-mic-name">${m.venueName || m.venue}</div>
                            <div class="insert-mic-meta">${m.neighborhood || ''} ${m.cost === 'Free' || m.cost === 0 ? '• Free' : `• $${m.cost}`}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(() => modal.classList.add('show'));

    // Add search functionality
    const searchInput = modal.querySelector('#insert-mic-search-input');
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        modal.querySelectorAll('.insert-mic-item').forEach(item => {
            const name = item.dataset.venueName || '';
            item.style.display = name.includes(query) ? '' : 'none';
        });
    });

    // Focus search input after animation
    setTimeout(() => searchInput.focus(), 250);

    // Handle escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            document.removeEventListener('keydown', handleEscape);
            closeInsertMicPicker();
        }
    };
    document.addEventListener('keydown', handleEscape);
}

// --- CLOSE INSERT MIC PICKER ---
function closeInsertMicPicker() {
    const modal = document.querySelector('.insert-mic-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
    }
}

// --- SELECT MIC TO INSERT ---
async function selectMicToInsert(afterIndex, micId) {
    closeInsertMicPicker();

    const mic = (allMics || []).find(m => m.id === micId);
    if (!mic) {
        showToast('Mic not found');
        return;
    }

    await insertMicInRoute(afterIndex, mic);
}
