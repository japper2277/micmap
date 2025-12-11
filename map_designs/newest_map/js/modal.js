/* =================================================================
   MODAL
   Venue modal open/close/toggle functions - Updated for new card design
   ================================================================= */

// DOM element references (initialized after DOM loads)
let venueModal, modalVenueName, modalAddress, modalDirections, modalTravelTime;
let modalMicTime, modalSignupBadge, modalInstructions, modalActions, modalSignupBtn, modalIgBtn;
let modalTransit;

// SVG Icons
const iconWalk = `<svg class="walk-icon" width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7z"/></svg>`;
const iconWarning = `<svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm1 16h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`;

// Initialize modal DOM references
function initModal() {
    venueModal = document.getElementById('venue-modal');
    modalVenueName = document.getElementById('modal-venue-name');
    modalAddress = document.getElementById('modal-address');
    modalDirections = document.getElementById('modal-directions');
    modalTravelTime = document.getElementById('modal-travel-time');
    modalMicTime = document.getElementById('modal-mic-time');
    modalSignupBadge = document.getElementById('modal-signup-badge');
    modalInstructions = document.getElementById('modal-instructions');
    modalActions = document.getElementById('modal-actions');
    modalSignupBtn = document.getElementById('modal-signup-btn');
    modalIgBtn = document.getElementById('modal-ig-btn');
    modalTransit = document.getElementById('modal-transit');

    // Close modal on background click
    venueModal.addEventListener('click', (e) => {
        if (e.target === venueModal) closeVenueModal();
    });

    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && venueModal.classList.contains('active')) {
            closeVenueModal();
        }
    });
}

function openVenueModal(mic) {
    if (!mic) return;

    // 1. HEADER - Venue Info
    modalVenueName.innerText = mic.title || 'Unknown Venue';
    modalAddress.innerText = mic.address || '';

    // Directions button - opens Google Maps
    modalDirections.href = `https://www.google.com/maps/dir/?api=1&destination=${mic.lat},${mic.lng}`;
    modalDirections.target = '_blank';

    // Travel time - check mic for pre-calculated transit time (set by applyTransitTimesToMics)
    if (mic.transitMins) {
        modalTravelTime.innerText = mic.transitMins + 'm';
    } else {
        modalTravelTime.innerText = '--';
    }

    // 2. MIC PROTOCOL
    modalMicTime.innerText = mic.timeStr || '';

    // Signup badge - determine type
    if (mic.signupUrl) {
        modalSignupBadge.innerText = 'Web Signup';
        modalSignupBadge.className = 'signup-badge type-web';
    } else {
        modalSignupBadge.innerText = 'In Person';
        modalSignupBadge.className = 'signup-badge type-web'; // Same style for now
    }

    // Instructions - strip URLs since button handles it
    let instructions = mic.signupInstructions || '';
    // Remove URLs from display text (button will handle the link)
    instructions = instructions.replace(/https?:\/\/[^\s]+/g, '').trim();
    // Clean up leftover "at" or "Sign up at" if URL was removed
    instructions = instructions.replace(/\s*(sign\s*up\s*)?(at|@)\s*$/i, '').trim();
    // If nothing meaningful left, show a default
    if (!instructions || instructions.length < 3) {
        instructions = mic.signupUrl ? 'Online signup available' : 'Sign up in person';
    }
    modalInstructions.innerText = instructions;

    // Action buttons - Sign up link (only if URL exists)
    const hasSignupUrl = !!mic.signupUrl;
    if (hasSignupUrl) {
        modalSignupBtn.href = mic.signupUrl;
        modalSignupBtn.target = '_blank';
        modalSignupBtn.style.display = 'flex';
    } else {
        modalSignupBtn.style.display = 'none';
    }

    // Instagram button - always show if available (check contact, host, or hostIg fields)
    const igHandle = mic.contact || mic.host || mic.hostIg;
    const hasIg = igHandle && igHandle !== 'TBD';
    if (hasIg) {
        modalIgBtn.href = `https://instagram.com/${igHandle.replace(/^@/, '')}`;
        modalIgBtn.target = '_blank';
        modalIgBtn.style.display = 'flex';
    } else {
        modalIgBtn.style.display = 'none';
    }

    // Adjust grid layout based on number of buttons
    const actionGrid = document.getElementById('modal-actions');
    if (hasSignupUrl && hasIg) {
        actionGrid.style.gridTemplateColumns = '1fr 1fr';
    } else {
        actionGrid.style.gridTemplateColumns = '1fr'; // Single button takes full width
    }

    // Show modal
    venueModal.classList.add('active');

    // 3. TRANSIT - Load live arrivals
    loadModalArrivals(mic);
}

// Fetch routes from subway router API
async function fetchSubwayRoutes(userLat, userLng, venueLat, venueLng) {
    const url = `http://localhost:3001/api/subway/routes?userLat=${userLat}&userLng=${userLng}&venueLat=${venueLat}&venueLng=${venueLng}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Subway router API failed');
    const data = await response.json();
    return data.routes || [];
}

// Display subway routes in modal
function displaySubwayRoutes(routes, mic) {
    if (!routes || routes.length === 0) {
        modalTransit.innerHTML = '<div class="transit-empty">No routes found</div>';
        return;
    }

    // Update travel time with best route
    const bestRoute = routes[0];
    modalTravelTime.innerText = bestRoute.totalTime + 'm';

    // Build HTML for each route
    let transitHTML = '';
    routes.forEach((route, idx) => {
        const routeNum = idx + 1;

        // Build route description from legs
        let routeDesc = '';
        route.legs.forEach((leg, legIdx) => {
            if (leg.type === 'ride') {
                const lines = [leg.line, ...(leg.altLines || [])];
                const linesBullets = lines.map(l => `<span class="bullet b-${l}">${l}</span>`).join('');
                routeDesc += `${linesBullets} → ${leg.to}`;
                if (legIdx < route.legs.length - 1) routeDesc += '<br>';
            }
        });

        transitHTML += `
            <div class="transit-row route-option">
                <div class="route-badge">Route ${routeNum}</div>
                <div>
                    <div class="station-header">
                        <span class="st-name">${route.originStation}</span>
                    </div>
                    <div class="arrival-data">
                        <div class="route-details">${routeDesc}</div>
                        <div class="time-breakdown">
                            ${iconWalk} ${route.walkToStation}m walk ·
                            🚇 ${route.subwayTime}m ride ·
                            ${iconWalk} ${route.walkToVenue}m walk
                        </div>
                    </div>
                </div>
                <div class="walk-info">
                    <div class="walk-time">${route.totalTime}m</div>
                </div>
            </div>
        `;
    });

    modalTransit.innerHTML = transitHTML;
}

// Load live train arrivals for venue's nearest stations
async function loadModalArrivals(mic) {
    if (!modalTransit) return;

    // Check if user has set their location (transit mode)
    const hasUserOrigin = STATE?.userOrigin?.lat && STATE?.userOrigin?.lng;
    if (!hasUserOrigin) {
        modalTransit.innerHTML = '';
        // Don't overwrite travel time if mic already has transitMins
        if (!mic.transitMins) {
            modalTravelTime.innerText = '--';
        }
        return;
    }

    // Show loading state
    modalTransit.innerHTML = `
        <div class="transit-row">
            <div style="grid-column: 1 / -1; text-align: center; color: var(--text-sec); font-size: 13px;">
                Loading transit info...
            </div>
        </div>
    `;

    const originLat = STATE.userOrigin.lat;
    const originLng = STATE.userOrigin.lng;

    // Check if venue is walkable (skip subway router for short distances)
    const directDist = calculateDistance(originLat, originLng, mic.lat, mic.lng);
    const WALK_THRESHOLD = 0.5; // miles - under this, just walk

    if (directDist < WALK_THRESHOLD) {
        // Use HERE API for accurate walking time, fallback to estimate
        let walkMins;
        try {
            const walkData = await getHereWalkingTime(originLat, originLng, mic.lat, mic.lng);
            walkMins = walkData.durationMins;
        } catch (e) {
            walkMins = Math.ceil(directDist * 20); // 20 min/mile fallback
        }

        modalTravelTime.innerText = walkMins + 'm';
        modalTransit.innerHTML = `
            <div class="transit-row">
                <div class="walk-route">
                    ${iconWalk}
                    <div class="walk-details">
                        <div class="walk-title">Walk directly</div>
                        <div class="walk-distance">${(directDist * 5280).toFixed(0)} ft · ${walkMins} min</div>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    // Call subway router API for longer distances
    try {
        const routes = await fetchSubwayRoutes(originLat, originLng, mic.lat, mic.lng);
        if (routes && routes.length > 0) {
            displaySubwayRoutes(routes, mic);
            return;
        }
    } catch (error) {
        console.error('Subway router API failed:', error);
        // Fall through to old method
    }

    // Find 2 nearest stations to USER's origin
    const nearestStations = findNearestStations(originLat, originLng, 2);
    if (!nearestStations || nearestStations.length === 0) {
        modalTransit.innerHTML = '<div class="transit-empty">No nearby stations</div>';
        return;
    }

    // Fetch alerts once for all stations (use cache if available)
    const alerts = mtaService.alertsCache || await mtaService.fetchAlerts() || [];

    let transitHTML = '';
    let bestTotalTime = Infinity;

    // Process each station (ONE ROW PER STATION, not per line)
    for (const station of nearestStations) {
        const lineMatch = station.name.match(/\(([^)]+)\)/);
        if (!lineMatch) continue;

        const lines = lineMatch[1].split(' ').filter(l => l.length > 0);
        const stationName = station.name.replace(/\s*\([^)]+\)/, '');

        // Calculate walk time using HERE API (accurate) with fallback to estimate
        let walkMins;
        try {
            const walkData = await getHereWalkingTime(originLat, originLng, station.lat, station.lng);
            walkMins = walkData.durationMins;
        } catch (e) {
            // Fallback to estimate
            const walkMiles = calculateDistance(originLat, originLng, station.lat, station.lng);
            walkMins = Math.ceil(walkMiles * 20);
        }

        // Fetch arrivals for ALL lines at this station - NEVER GUESS, use real-time data
        let allArrivals = [];
        const linesWithService = new Set();

        for (const line of lines) {
            try {
                const lineArrivals = await mtaService.fetchArrivals(line, station.gtfsStopId);
                if (lineArrivals && lineArrivals.length > 0) {
                    // Tag each arrival with its line
                    lineArrivals.forEach(a => a.line = line);
                    allArrivals.push(...lineArrivals);
                    linesWithService.add(line);
                }
            } catch (e) {
                // Line has no service right now - skip it
            }
        }

        // Sort all arrivals by time
        allArrivals.sort((a, b) => a.minsAway - b.minsAway);

        // Use the first line with actual service as primary
        const primaryLine = linesWithService.size > 0 ? [...linesWithService][0] : lines[0];
        let arrivals = allArrivals;

        // DIRECTION FILTERING: Only show trains going TOWARD the venue
        const venueClusterId = resolveClusterId(mic);
        const venueCluster = venueClusterId !== null
            ? TRANSIT_DATA?.clusters?.find(c => c.id === venueClusterId)
            : null;

        let filteredArrivals = arrivals;
        let directionLabel = '';
        if (venueCluster && arrivals.length > 0) {
            // Determine needed direction based on venue position vs station
            const neededDirection = getDirectionToward(station, venueCluster, primaryLine);
            directionLabel = neededDirection;
            filteredArrivals = arrivals.filter(a => a.direction === neededDirection);

            // If no trains in needed direction, show all (better than empty)
            if (filteredArrivals.length === 0) {
                filteredArrivals = arrivals;
                directionLabel = ''; // Don't show direction if we couldn't filter
            }
        }

        // Filter out trains user can't catch
        // 1 min walk → 1+ min, 2 min walk → 2+ min, 3 min walk → 3+ min
        // After 3 min walk, apply -2 buffer: 4 min walk → 2+ min, 5 min → 3+ min, 8 min → 6+ min
        const minCatchableTime = walkMins <= 3 ? walkMins : (walkMins - 2);
        filteredArrivals = filteredArrivals.filter(a => a.minsAway >= minCatchableTime);

        // Get next 3 arrival times
        const nextArrivals = filteredArrivals.slice(0, 3);
        const timesStr = nextArrivals.length > 0
            ? nextArrivals.map(a => a.minsAway === 0 ? 'Now' : a.minsAway).join(', ')
            : 'No trains';
        const directionStr = directionLabel ? `→ ${directionLabel}` : '';

        // Calculate total commute time for this option using standardized function
        if (nextArrivals.length > 0 && venueClusterId !== null) {
            const commute = calculateLiveCommute({
                userLat: originLat,
                userLng: originLng,
                stationLat: station.lat,
                stationLng: station.lng,
                stationId: station.id,
                arrivals: nextArrivals,
                clusterId: venueClusterId,
                venueLat: mic.lat,
                venueLng: mic.lng
            });

            if (commute.total < bestTotalTime) {
                bestTotalTime = commute.total;
            }
        }

        // Build bullet HTML - ONLY show lines with actual real-time service
        const displayLines = linesWithService.size > 0
            ? [...linesWithService].slice(0, 3)
            : lines.slice(0, 1); // Fallback to first line if no real-time data
        const bulletHTML = displayLines.length === 1
            ? `<div class="bullet b-${displayLines[0]}">${displayLines[0]}</div>`
            : `<div class="bullet-stack">${displayLines.map(l => `<div class="bullet b-${l}">${l}</div>`).join('')}</div>`;

        // Determine express vs local
        const isExpress = ['2','3','4','5','A','D','N','Q'].includes(primaryLine);
        const svcBadge = isExpress ? 'svc-express' : 'svc-local';
        const svcLabel = isExpress ? 'Express' : 'Local';

        // Check if any line at this station has alerts
        const stationAlerts = alerts.filter(alert =>
            alert.lines && alert.lines.some(l => lines.includes(l))
        );
        const hasDelay = stationAlerts.length > 0;
        const alertText = hasDelay ? (stationAlerts[0].text || 'Service alert') : '';

        // Check if transfer is needed to reach venue
        const transferInfo = venueClusterId !== null ? checkTransferNeeded(station, venueClusterId) : null;
        let transferHTML = '';
        if (transferInfo?.needsTransfer && transferInfo.transferHub) {
            const hub = transferInfo.transferHub;
            const transferLine = hub.transferTo[0]; // First line to transfer to
            transferHTML = `<div class="transfer-msg">↔ Transfer at ${hub.name} to <span class="bullet-inline b-${transferLine}">${transferLine}</span></div>`;
        }

        transitHTML += `
            <div class="transit-row ${hasDelay ? 'delayed-row' : ''}">
                ${bulletHTML}
                <div>
                    <div class="station-header">
                        <span class="st-name">${stationName}</span>
                        ${directionStr ? `<span class="direction-label">${directionStr}</span>` : ''}
                    </div>
                    <div class="arrival-data">
                        <div class="time-row">${timesStr}${nextArrivals.length > 0 ? ' <span class="unit">min</span>' : ''}</div>
                        ${transferHTML}
                        ${hasDelay ? `<div class="delay-msg">${iconWarning} ${alertText}</div>` : ''}
                    </div>
                </div>
                <div class="walk-info">
                    ${iconWalk}
                    <div class="walk-time">${walkMins} min</div>
                </div>
            </div>
        `;
    }

    modalTransit.innerHTML = transitHTML || '';

    // Update travel time badge in header
    // Only update if we calculated a real time, otherwise keep mic.transitMins
    if (bestTotalTime < Infinity) {
        modalTravelTime.innerText = bestTotalTime + 'm';
    }
    // Don't reset to '--' - mic.transitMins was already set earlier
}

// Find nearest stations to a lat/lng (returns array)
// Uses getStationsNearUser() from utils.js for proper Haversine distance
function findNearestStations(lat, lng, count = 2) {
    return getStationsNearUser(lat, lng, count);
}

function closeVenueModal() {
    venueModal.classList.remove('active');
    // Collapse the details element when closing
    const micRow = venueModal.querySelector('details.mic-row');
    if (micRow) micRow.removeAttribute('open');
}
