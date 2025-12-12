/* =================================================================
   MODAL
   Venue modal - New card design from 12_11_25_venue_card.html
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

// Format time as "11:15 AM"
function formatTime(date) {
    return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

function openVenueModal(mic) {
    if (!mic) return;

    // HEADER - Venue name and time
    modalVenueName.innerText = mic.title || 'Unknown Venue';
    modalMicTime.innerText = mic.timeStr || '';

    // Address and Maps link - format as "street, borough"
    let displayAddress = mic.address || '';
    if (displayAddress) {
        // Extract street (before first comma) and try to get borough
        const parts = displayAddress.split(',').map(p => p.trim());
        const street = parts[0] || '';
        // Try to find borough from address parts (usually "New York" or neighborhood name)
        let borough = '';
        if (parts.length > 1) {
            // Check for borough keywords
            const fullAddr = displayAddress.toLowerCase();
            if (fullAddr.includes('brooklyn')) borough = 'Brooklyn';
            else if (fullAddr.includes('queens')) borough = 'Queens';
            else if (fullAddr.includes('bronx')) borough = 'Bronx';
            else if (fullAddr.includes('staten island')) borough = 'Staten Island';
            else if (fullAddr.includes('manhattan') || fullAddr.includes('new york')) borough = 'Manhattan';
            else borough = parts[1].replace(/\s*NY\s*\d*/i, '').trim(); // Use second part, strip NY/zip
        }
        displayAddress = borough ? `${street}, ${borough}` : street;
    }
    modalAddress.innerText = displayAddress;
    modalDirections.href = `https://www.google.com/maps/dir/?api=1&destination=${mic.lat},${mic.lng}`;
    modalDirections.target = '_blank';

    // Note text - show instructions with emoji prefix
    let instructions = mic.signupInstructions || '';
    // Remove URLs from display text (button will handle the link)
    instructions = instructions.replace(/https?:\/\/[^\s]+/g, '').trim();
    // Clean up leftover "at" or "Sign up at" if URL was removed
    instructions = instructions.replace(/\s*(sign\s*up\s*)?(at|@)\s*$/i, '').trim();
    // If nothing meaningful, show default based on signup type
    if (!instructions || instructions.length < 3) {
        instructions = mic.signupUrl ? 'Online signup available.' : 'Sign up in person.';
    }
    // Add emoji prefix
    modalInstructions.innerText = '📝 ' + instructions;

    // Action buttons
    const hasSignupUrl = !!mic.signupUrl;
    if (hasSignupUrl) {
        modalSignupBtn.href = mic.signupUrl;
        modalSignupBtn.target = '_blank';
        modalSignupBtn.style.display = 'flex';
    } else {
        modalSignupBtn.style.display = 'none';
    }

    // Instagram button
    const igHandle = mic.contact || mic.host || mic.hostIg;
    const hasIg = igHandle && igHandle !== 'TBD';
    if (hasIg) {
        modalIgBtn.href = `https://instagram.com/${igHandle.replace(/^@/, '')}`;
        modalIgBtn.target = '_blank';
        modalIgBtn.style.display = 'flex';
    } else {
        modalIgBtn.style.display = 'none';
    }

    // Adjust grid layout based on visible buttons
    if (hasSignupUrl && hasIg) {
        modalActions.style.gridTemplateColumns = '1fr 1fr';
    } else if (hasSignupUrl || hasIg) {
        modalActions.style.gridTemplateColumns = '1fr';
    } else {
        modalActions.style.display = 'none';
    }
    if (hasSignupUrl || hasIg) {
        modalActions.style.display = 'grid';
    }

    // Show modal
    venueModal.classList.add('active');

    // Load transit cards
    loadModalArrivals(mic);
}

// Fetch routes from subway router API - request 5 to ensure we get at least 3
async function fetchSubwayRoutes(userLat, userLng, venueLat, venueLng) {
    const url = `http://localhost:3001/api/subway/routes?userLat=${userLat}&userLng=${userLng}&venueLat=${venueLat}&venueLng=${venueLng}&limit=5`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Subway router API failed');
    const data = await response.json();
    return data.routes || [];
}

// Display subway routes in modal (with optional walk option) - New card design
// supplementStations: additional nearby stations to show if routes < 3
async function displaySubwayRoutes(routes, mic, walkOption = null, supplementStations = []) {
    if ((!routes || routes.length === 0) && supplementStations.length === 0) {
        modalTransit.innerHTML = '<div style="padding: 20px; text-align: center; color: #8e8e93;">No routes found</div>';
        return;
    }

    const now = new Date();
    let transitHTML = '';
    let cardCount = 0;

    // Add walking card first if available
    if (walkOption) {
        const walkArrival = new Date(now.getTime() + walkOption.walkMins * 60000);
        const distDisplay = walkOption.directDist < 0.2
            ? `${(walkOption.directDist * 5280).toFixed(0)} ft`
            : `${walkOption.directDist.toFixed(2)} mi`;

        transitHTML += `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${formatTime(now)} - ${formatTime(walkArrival)}</span>
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
        cardCount++;
    }

    // Collect all transit options into unified array
    const allOptions = [];

    // Add router routes
    (routes || []).forEach((route) => {
        // Build route signature for deduplication (lines used in order)
        const routeLines = [];
        let midHTML = `<span>🚶${route.walkToStation}m</span>`;
        route.legs.forEach((leg) => {
            if (leg.type === 'ride') {
                const lines = [leg.line, ...(leg.altLines || [])].slice(0, 4);
                routeLines.push(leg.line); // Use primary line for signature
                midHTML += `<span class="arrow">→</span>`;
                lines.forEach(l => {
                    midHTML += `<div class="badge b-${l}">${l}</div>`;
                });
            }
        });

        allOptions.push({
            totalTime: route.totalTime,
            walkMins: route.walkToStation,
            stationName: route.originStation,
            midHTML,
            signature: `${route.originStation}|${routeLines.join('→')}` // e.g., "W 4 St|A→L"
        });
    });

    // Add supplement stations (if any)
    supplementStations.forEach((station) => {
        const lineMatch = station.name.match(/\(([^)]+)\)/);
        if (!lineMatch) return;

        const lines = lineMatch[1].split(' ').filter(l => l.length > 0).slice(0, 3);
        const stationName = station.name.replace(/\s*\([^)]+\)/, '');

        const walkMiles = calculateDistance(STATE.userOrigin.lat, STATE.userOrigin.lng, station.lat, station.lng);
        const stationWalkMins = Math.ceil(walkMiles * 20);
        const totalTime = stationWalkMins + 15;

        const midHTML = `<span>🚶${stationWalkMins}m</span><span class="arrow">→</span>` +
            lines.map(l => `<div class="badge b-${l}">${l}</div>`).join('');

        allOptions.push({
            totalTime,
            walkMins: stationWalkMins,
            stationName,
            midHTML,
            signature: `${stationName}|${lines.join(',')}`
        });
    });

    // Sort by total time (fastest first)
    allOptions.sort((a, b) => a.totalTime - b.totalTime);

    // Deduplicate: keep only the fastest route for each unique path
    const seen = new Set();
    const uniqueOptions = allOptions.filter(opt => {
        if (seen.has(opt.signature)) return false;
        seen.add(opt.signature);
        return true;
    });

    const maxRoutes = 3 - cardCount;

    uniqueOptions.slice(0, maxRoutes).forEach((opt) => {
        const arrivalTime = new Date(now.getTime() + opt.totalTime * 60000);
        const depTime1 = opt.walkMins + 2;
        const depTime2 = depTime1 + 5;
        const depTime3 = depTime2 + 6;

        transitHTML += `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${formatTime(now)} - ${formatTime(arrivalTime)}</span>
                    <span class="duration-main">${opt.totalTime} min</span>
                </div>
                <div class="card-mid">
                    ${opt.midHTML}
                </div>
                <div class="card-bottom">
                    <div class="station-name">
                        <span class="station-prefix">From:</span> ${opt.stationName}
                    </div>
                    <div class="dep-times">${depTime1}, ${depTime2}, ${depTime3} min</div>
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
        return;
    }

    // Show loading state
    modalTransit.innerHTML = `
        <div class="card-base" style="text-align: center; color: #8e8e93;">
            Loading transit info...
        </div>
    `;

    const originLat = STATE.userOrigin.lat;
    const originLng = STATE.userOrigin.lng;

    // Thresholds based on actual walking distance (not straight-line)
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
        const now = new Date();
        const walkArrival = new Date(now.getTime() + walkMins * 60000);
        const distDisplay = walkDist < 0.2
            ? `${(walkDist * 5280).toFixed(0)} ft`
            : `${walkDist.toFixed(2)} mi`;
        modalTransit.innerHTML = `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${formatTime(now)} - ${formatTime(walkArrival)}</span>
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
    try {
        routes = await fetchSubwayRoutes(originLat, originLng, mic.lat, mic.lng);
    } catch (error) {
        console.error('Subway router API failed:', error);
    }

    // Always find nearby stations (we'll use them to supplement if needed)
    const nearestStations = findNearestStations(originLat, originLng, 3);

    // Display routes (no supplement stations - only show real calculated routes)
    if (routes && routes.length > 0) {
        displaySubwayRoutes(routes, mic, walkDist < SHOW_WALK_OPTION ? { walkMins, directDist: walkDist } : null, []);
        return;
    }

    // Fallback: Show nearest stations only
    if (!nearestStations || nearestStations.length === 0) {
        modalTransit.innerHTML = '<div style="padding: 20px; text-align: center; color: #8e8e93;">No nearby stations</div>';
        return;
    }

    const now = new Date();
    let transitHTML = '';

    // Process each station as a card
    for (const station of nearestStations) {
        const lineMatch = station.name.match(/\(([^)]+)\)/);
        if (!lineMatch) continue;

        const lines = lineMatch[1].split(' ').filter(l => l.length > 0);
        const stationName = station.name.replace(/\s*\([^)]+\)/, '');

        // Calculate walk time using HERE API (accurate) with fallback to estimate
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
                // Line has no service right now - skip it
            }
        }

        allArrivals.sort((a, b) => a.minsAway - b.minsAway);

        const primaryLine = linesWithService.size > 0 ? [...linesWithService][0] : lines[0];
        let filteredArrivals = allArrivals;

        // Direction filtering
        const venueClusterId = resolveClusterId(mic);
        const venueCluster = venueClusterId !== null
            ? TRANSIT_DATA?.clusters?.find(c => c.id === venueClusterId)
            : null;

        if (venueCluster && allArrivals.length > 0) {
            const neededDirection = getDirectionToward(station, venueCluster, primaryLine);
            filteredArrivals = allArrivals.filter(a => a.direction === neededDirection);
            if (filteredArrivals.length === 0) filteredArrivals = allArrivals;
        }

        // Filter out trains user can't catch
        const minCatchableTime = stationWalkMins <= 3 ? stationWalkMins : (stationWalkMins - 2);
        filteredArrivals = filteredArrivals.filter(a => a.minsAway >= minCatchableTime);

        // Get next 3 arrivals
        const nextArrivals = filteredArrivals.slice(0, 3);
        const timesStr = nextArrivals.length > 0
            ? nextArrivals.map(a => a.minsAway === 0 ? 'Now' : a.minsAway).join(', ')
            : 'No trains';

        // Estimate total time (walk + wait + ride + walk to venue)
        const waitTime = nextArrivals.length > 0 ? nextArrivals[0].minsAway : 5;
        const rideTime = 10; // Rough estimate
        const totalTime = stationWalkMins + waitTime + rideTime + 5;
        const arrivalTime = new Date(now.getTime() + totalTime * 60000);

        // Build line badges
        const displayLines = linesWithService.size > 0
            ? [...linesWithService].slice(0, 3)
            : lines.slice(0, 1);
        const badgesHTML = displayLines.map(l => `<div class="badge b-${l}">${l}</div>`).join('');

        transitHTML += `
            <div class="card-base">
                <div class="card-top">
                    <span class="time-main">${formatTime(now)} - ${formatTime(arrivalTime)}</span>
                    <span class="duration-main">${totalTime} min</span>
                </div>
                <div class="card-mid">
                    <span>🚶${stationWalkMins}m</span>
                    <span class="arrow">→</span>
                    ${badgesHTML}
                </div>
                <div class="card-bottom">
                    <div class="station-name">
                        <span class="station-prefix">From:</span> ${stationName}
                    </div>
                    <div class="dep-times">${timesStr}${nextArrivals.length > 0 ? ' min' : ''}</div>
                </div>
            </div>
        `;
    }

    modalTransit.innerHTML = transitHTML || '';
}

// Find nearest stations to a lat/lng (returns array)
// Uses getStationsNearUser() from utils.js for proper Haversine distance
function findNearestStations(lat, lng, count = 2) {
    return getStationsNearUser(lat, lng, count);
}

function closeVenueModal() {
    venueModal.classList.remove('active');
}
