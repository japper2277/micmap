/* =================================================================
   MODAL - Updated for 12_11_25_venue_card.html design
   ================================================================= */

// DOM element references (initialized after DOM loads)
let venueModal, modalVenueName, modalAddress, modalDirections;
let modalMicTime, modalInstructions, modalActions, modalSignupBtn, modalIgBtn;
let modalTransit;

// Initialize modal DOM references
function initModal() {
    venueModal = document.getElementById('venue-modal');
    modalVenueName = document.getElementById('modal-venue-name');
    modalAddress = document.getElementById('modal-address');
    modalDirections = document.getElementById('modal-directions');
    modalMicTime = document.getElementById('modal-mic-time');
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

    // 1. HEADER - Venue name and time
    modalVenueName.innerText = mic.title || 'Unknown Venue';
    modalMicTime.innerText = mic.timeStr || '';

    // 2. SUB-HEADER - Address and Maps link
    modalAddress.innerText = mic.address || '';
    modalDirections.href = `https://www.google.com/maps/dir/?api=1&destination=${mic.lat},${mic.lng}`;
    modalDirections.target = '_blank';

    // 3. NOTE TEXT - Signup instructions
    let instructions = mic.signupInstructions || '';
    // Remove URLs from display text (button will handle the link)
    instructions = instructions.replace(/https?:\/\/[^\s]+/g, '').trim();
    instructions = instructions.replace(/\s*(sign\s*up\s*)?(at|@)\s*$/i, '').trim();
    if (!instructions || instructions.length < 3) {
        instructions = mic.signupUrl ? 'Online signup available' : 'Sign up in person';
    }
    modalInstructions.innerText = instructions;

    // 4. ACTION BUTTONS - Sign up and IG
    const hasSignupUrl = !!mic.signupUrl;
    const igHandle = mic.contact || mic.host || mic.hostIg;
    const hasIg = igHandle && igHandle !== 'TBD';

    if (hasSignupUrl) {
        modalSignupBtn.href = mic.signupUrl;
        modalSignupBtn.target = '_blank';
        modalSignupBtn.style.display = 'flex';
    } else {
        modalSignupBtn.style.display = 'none';
    }

    if (hasIg) {
        modalIgBtn.href = `https://instagram.com/${igHandle.replace(/^@/, '')}`;
        modalIgBtn.target = '_blank';
        modalIgBtn.style.display = 'flex';
    } else {
        modalIgBtn.style.display = 'none';
    }

    // Adjust grid based on button count
    if (hasSignupUrl && hasIg) {
        modalActions.classList.remove('single-btn');
    } else {
        modalActions.classList.add('single-btn');
    }

    // Hide actions row entirely if no buttons
    modalActions.style.display = (hasSignupUrl || hasIg) ? 'grid' : 'none';

    // Show modal
    venueModal.classList.add('active');

    // 5. TRANSIT - Load live arrivals
    loadModalArrivals(mic);
}

// Fetch routes from subway router API
async function fetchSubwayRoutes(userLat, userLng, venueLat, venueLng) {
    const url = `http://localhost:3001/api/subway/routes?userLat=${userLat}&userLng=${userLng}&venueLat=${venueLat}&venueLng=${venueLng}`;
    console.log('🚇 Fetching subway routes:', url);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Subway router API failed');
    const data = await response.json();
    console.log('🚇 Subway routes response:', data.routes?.length || 0, 'routes', data.schedule);
    return { routes: data.routes || [], schedule: data.schedule || {} };
}

// Helper: Format time range (e.g., "11:15 AM - 11:36 AM")
function formatTimeRange(durationMins) {
    const now = new Date();
    const end = new Date(now.getTime() + durationMins * 60000);
    const formatTime = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${formatTime(now)} - ${formatTime(end)}`;
}

// Helper: Show alert modal
function showAlertModal(line, alertText) {
    const modal = document.getElementById('alertModal');
    const badge = document.getElementById('alert-badge');
    const title = document.getElementById('alert-title');
    const text = document.getElementById('alert-text');

    badge.className = `alert-modal-badge b-${line}`;
    badge.innerText = line;
    title.innerText = 'Service Alert';
    text.innerText = alertText;
    modal.classList.add('show');
}

// Display subway routes in new card format
async function displaySubwayRoutes(routes, mic, walkOption = null, schedule = null) {
    if (!routes || routes.length === 0) {
        modalTransit.innerHTML = '<div class="empty-card">No routes found</div>';
        return;
    }

    let transitHTML = '';

    // Walking option card (if under 1 mile)
    if (walkOption) {
        const distDisplay = walkOption.directDist < 0.2
            ? `${(walkOption.directDist * 5280).toFixed(0)} ft`
            : `${walkOption.directDist.toFixed(2)} mi`;

        transitHTML += `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${formatTimeRange(walkOption.walkMins)}</span>
                    <span class="duration-main">${walkOption.walkMins} min</span>
                </div>
                <div class="card-mid">
                    <span>🚶 Start</span>
                    <span class="arrow">→</span>
                    <div class="badge-pill-green">Walk</div>
                    <span class="arrow">→</span>
                    <span>${distDisplay}</span>
                </div>
                <div class="card-bottom">
                    <div class="station-name">
                        <span class="station-prefix">Route:</span> Direct
                    </div>
                    <div class="status-text">No transit needed</div>
                </div>
            </div>
        `;
    }

    // Subway route cards
    for (const route of routes) {
        // Build icon flow from legs
        let iconFlow = '<span>🚶' + route.walkToStation + 'm</span>';
        let firstLine = null;
        let originStationId = null;

        route.legs.forEach((leg, legIdx) => {
            if (leg.type === 'ride') {
                const lines = [leg.line, ...(leg.altLines || [])];
                if (!firstLine) {
                    firstLine = leg.line;
                    originStationId = leg.fromStopId;
                }
                // Check if this leg has alerts
                const hasAlert = route.alerts && route.alerts.some(a =>
                    a.lines && a.lines.some(l => lines.includes(l))
                );
                const alertText = hasAlert ? route.alerts.find(a => a.lines && a.lines.some(l => lines.includes(l)))?.text : '';

                iconFlow += '<span class="arrow">→</span>';

                // Add badge for each line
                lines.forEach((line, lineIdx) => {
                    if (hasAlert && lineIdx === 0) {
                        iconFlow += `<div class="badge-wrap" onclick="event.stopPropagation(); showAlertModal('${line}', '${alertText.replace(/'/g, "\\'")}')">
                            <div class="badge b-${line}">${line}</div>
                            <div class="alert-dot"></div>
                        </div>`;
                    } else {
                        iconFlow += `<div class="badge b-${line}">${line}</div>`;
                    }
                });
            }
        });

        // Add final walk
        iconFlow += `<span class="arrow">→</span><span>🚶${route.walkToVenue}m</span>`;

        // Get first ride leg for station name
        const firstRideLeg = route.legs.find(l => l.type === 'ride');
        const originStation = firstRideLeg?.from || route.originStation;

        // Fetch actual departure times for first line at origin station
        let depTimesStr = '';
        if (firstLine && originStation) {
            try {
                // Look up the station by name to get GTFS stop ID
                const stationData = findStationByName(originStation, firstLine);
                if (stationData && stationData.gtfsStopId) {
                    const arrivals = await mtaService.fetchArrivals(firstLine, stationData.gtfsStopId);
                    if (arrivals && arrivals.length > 0) {
                        const next3 = arrivals.slice(0, 3);
                        // Format as clock times like "11:18, 11:25, 11:32"
                        depTimesStr = next3.map(a => {
                            const arrivalTime = new Date(Date.now() + a.minsAway * 60000);
                            return arrivalTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '');
                        }).join(', ');
                    }
                }
            } catch (e) {
                console.log('Could not fetch arrivals for', originStation, firstLine, e);
            }
        }
        if (!depTimesStr) {
            depTimesStr = `${route.walkToStation}m walk · ${route.subwayTime}m ride`;
        }

        transitHTML += `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${formatTimeRange(route.totalTime)}</span>
                    <span class="duration-main">${route.totalTime} min</span>
                </div>
                <div class="card-mid">
                    ${iconFlow}
                </div>
                <div class="card-bottom">
                    <div class="station-name">
                        <span class="station-prefix">From:</span> ${originStation}
                    </div>
                    <div class="dep-times">${depTimesStr}</div>
                </div>
            </div>
        `;
    }

    modalTransit.innerHTML = transitHTML;
}

// Load live train arrivals for venue's nearest stations
async function loadModalArrivals(mic) {
    if (!modalTransit) return;

    // Check if user has set their location (transit mode)
    const hasUserOrigin = STATE?.userOrigin?.lat && STATE?.userOrigin?.lng;
    if (!hasUserOrigin) {
        modalTransit.innerHTML = '';
        return;
    }

    // Show loading state
    modalTransit.innerHTML = '<div class="loading-card">Loading transit info...</div>';

    const originLat = STATE.userOrigin.lat;
    const originLng = STATE.userOrigin.lng;

    // Thresholds based on actual walking distance
    const WALK_ONLY_THRESHOLD = 0.5; // miles - under this, just walk
    const SHOW_WALK_OPTION = 1.0;    // miles - under this, show walk as an option

    // Get walking time AND distance from HERE API (accurate street-level)
    let walkMins, walkDist;
    try {
        const walkData = await getHereWalkingTime(originLat, originLng, mic.lat, mic.lng);
        walkMins = walkData.durationMins;
        walkDist = walkData.distanceMiles;
    } catch (e) {
        // Fallback to straight-line estimate
        const straightDist = calculateDistance(originLat, originLng, mic.lat, mic.lng);
        walkDist = straightDist * 1.3; // Manhattan factor ~1.3x
        walkMins = Math.ceil(walkDist * 20); // 20 min/mile
    }

    // Under 0.5 miles actual walk - just show walking card
    if (walkDist < WALK_ONLY_THRESHOLD) {
        const distDisplay = walkDist < 0.2
            ? `${(walkDist * 5280).toFixed(0)} ft`
            : `${walkDist.toFixed(2)} mi`;

        modalTransit.innerHTML = `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${formatTimeRange(walkMins)}</span>
                    <span class="duration-main">${walkMins} min</span>
                </div>
                <div class="card-mid">
                    <span>🚶 Start</span>
                    <span class="arrow">→</span>
                    <div class="badge-pill-green">Walk</div>
                    <span class="arrow">→</span>
                    <span>${distDisplay}</span>
                </div>
                <div class="card-bottom">
                    <div class="station-name">
                        <span class="station-prefix">Route:</span> Direct
                    </div>
                    <div class="status-text">No transit needed</div>
                </div>
            </div>
        `;
        return;
    }

    // Call subway router API
    let routes = [];
    let schedule = null;
    try {
        console.log('🚇 Calling fetchSubwayRoutes with:', { originLat, originLng, venueLat: mic.lat, venueLng: mic.lng });
        const result = await fetchSubwayRoutes(originLat, originLng, mic.lat, mic.lng);
        routes = result.routes || [];
        schedule = result.schedule || null;
        console.log('🚇 Got routes:', routes.length, 'schedule:', schedule);
    } catch (error) {
        console.error('Subway router API failed:', error);
    }

    // Display routes with walking option if under 1 mile actual walk
    if (routes && routes.length > 0) {
        console.log('🚇 Displaying subway routes');
        await displaySubwayRoutes(routes, mic, walkDist < SHOW_WALK_OPTION ? { walkMins, directDist: walkDist } : null, schedule);
        return;
    }
    console.log('🚇 No subway routes, falling back to station arrivals');

    // Fallback: Find 2 nearest stations to USER's origin and show arrivals
    const nearestStations = findNearestStations(originLat, originLng, 2);
    if (!nearestStations || nearestStations.length === 0) {
        modalTransit.innerHTML = '<div class="empty-card">No nearby stations</div>';
        return;
    }

    // Fetch alerts once for all stations
    const alerts = mtaService.alertsCache || await mtaService.fetchAlerts() || [];

    let transitHTML = '';

    // Process each station
    for (const station of nearestStations) {
        const lineMatch = station.name.match(/\(([^)]+)\)/);
        if (!lineMatch) continue;

        const lines = lineMatch[1].split(' ').filter(l => l.length > 0);
        const stationName = station.name.replace(/\s*\([^)]+\)/, '');

        // Calculate walk time
        let stationWalkMins;
        try {
            const walkData = await getHereWalkingTime(originLat, originLng, station.lat, station.lng);
            stationWalkMins = walkData.durationMins;
        } catch (e) {
            const walkMiles = calculateDistance(originLat, originLng, station.lat, station.lng);
            stationWalkMins = Math.ceil(walkMiles * 20);
        }

        // Fetch arrivals for ALL lines at this station
        let allArrivals = [];
        const linesWithService = new Set();

        for (const line of lines) {
            try {
                const lineArrivals = await mtaService.fetchArrivals(line, station.gtfsStopId);
                if (lineArrivals && lineArrivals.length > 0) {
                    lineArrivals.forEach(a => a.line = line);
                    allArrivals.push(...lineArrivals);
                    linesWithService.add(line);
                }
            } catch (e) {
                // Line has no service right now
            }
        }

        allArrivals.sort((a, b) => a.minsAway - b.minsAway);

        // Filter out trains user can't catch
        const minCatchableTime = stationWalkMins <= 3 ? stationWalkMins : (stationWalkMins - 2);
        const catchableArrivals = allArrivals.filter(a => a.minsAway >= minCatchableTime);

        // Get next 3 arrivals
        const nextArrivals = catchableArrivals.slice(0, 3);
        const timesStr = nextArrivals.length > 0
            ? nextArrivals.map(a => a.minsAway === 0 ? 'Now' : a.minsAway + 'm').join(', ')
            : 'No trains';

        // Check for alerts on this station's lines
        const stationAlerts = alerts.filter(alert =>
            alert.lines && alert.lines.some(l => lines.includes(l))
        );
        const hasAlert = stationAlerts.length > 0;
        const alertText = hasAlert ? stationAlerts[0].text : '';

        // Build badge flow
        const displayLines = linesWithService.size > 0
            ? [...linesWithService].slice(0, 3)
            : lines.slice(0, 1);

        let badgeFlow = `<span>🚶${stationWalkMins}m</span><span class="arrow">→</span>`;
        displayLines.forEach((line, idx) => {
            if (hasAlert && idx === 0) {
                badgeFlow += `<div class="badge-wrap" onclick="event.stopPropagation(); showAlertModal('${line}', '${alertText.replace(/'/g, "\\'")}')">
                    <div class="badge b-${line}">${line}</div>
                    <div class="alert-dot"></div>
                </div>`;
            } else {
                badgeFlow += `<div class="badge b-${line}">${line}</div>`;
            }
        });

        // Estimate total time (walk + wait + ride estimate)
        const waitTime = nextArrivals.length > 0 ? nextArrivals[0].minsAway : 5;
        const rideEstimate = 15; // Rough estimate
        const totalTime = stationWalkMins + waitTime + rideEstimate;

        transitHTML += `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${formatTimeRange(totalTime)}</span>
                    <span class="duration-main">~${totalTime} min</span>
                </div>
                <div class="card-mid">
                    ${badgeFlow}
                </div>
                <div class="card-bottom">
                    <div class="station-name">
                        <span class="station-prefix">From:</span> ${stationName}
                    </div>
                    <div class="dep-times">${timesStr}</div>
                </div>
            </div>
        `;
    }

    modalTransit.innerHTML = transitHTML || '<div class="empty-card">No transit info available</div>';
}

// Find nearest stations to a lat/lng (returns array)
function findNearestStations(lat, lng, count = 2) {
    return getStationsNearUser(lat, lng, count);
}

function closeVenueModal() {
    venueModal.classList.remove('active');
}
