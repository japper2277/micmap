/* =================================================================
   RENDER
   Main rendering function for list and map
   ================================================================= */

function render(mode) {
    const container = document.getElementById('list-content');
    if (!container) return;

    markersGroup.clearLayers();
    STATE.markerLookup = {};
    container.innerHTML = '';

    // Use fresh timestamp for accurate calculations
    const currentTime = new Date();

    // Get day names for filtering
    const todayName = CONFIG.dayNames[currentTime.getDay()];
    const tomorrowName = CONFIG.dayNames[(currentTime.getDay() + 1) % 7];

    // Base filter for day/time (used for both map and list)
    let baseMics = STATE.mics.filter(m => {
        const diffMins = m.start ? (m.start - currentTime) / 60000 : 999;

        // Deep past (>1 hour ago): REMOVE from DOM - only for TODAY
        if (mode === 'today' && diffMins < -60) return false;

        // Filter by day of week
        if (mode === 'today' && m.day !== todayName) return false;
        if (mode === 'tomorrow' && m.day !== tomorrowName) return false;
        if (mode === 'calendar') {
            const selectedDate = new Date(STATE.selectedCalendarDate);
            const selectedDayName = CONFIG.dayNames[selectedDate.getDay()];
            if (m.day !== selectedDayName) return false;
        }

        return true;
    });

    // Additional filters for the LIST only (price, time)
    let filtered = baseMics.filter(m => {
        // Filter by price
        if (STATE.activeFilters.price !== 'All') {
            const isFree = m.price.toLowerCase().includes('free');
            if (STATE.activeFilters.price === 'Free' && !isFree) return false;
            if (STATE.activeFilters.price === 'Paid' && isFree) return false;
        }

        // Filter by time
        if (STATE.activeFilters.time !== 'All' && m.start) {
            const hour = m.start.getHours();
            if (STATE.activeFilters.time === 'early' && hour >= 17) return false;
            if (STATE.activeFilters.time === 'late' && hour < 17) return false;
        }

        return true;
    });

    // Recalculate status based on mode
    // Simplified 3-tier: live (green), upcoming (red, <2hrs), future (gray)
    const calcStatus = (m) => {
        if (mode !== 'today') return 'future'; // Tomorrow+ = gray
        const diffMins = m.start ? (m.start - currentTime) / 60000 : 999;
        if (diffMins > -90 && diffMins <= 0) return 'live';      // Green pulsing
        if (diffMins > 0 && diffMins <= 120) return 'upcoming';  // Red (<2 hours)
        return 'future';                                          // Gray (tonight)
    };

    // Get status text for card display
    const getStatusText = (m, status) => {
        if (status === 'live') return 'Live Now';
        if (status === 'upcoming') {
            const diffMins = m.start ? Math.ceil((m.start - currentTime) / 60000) : 0;
            if (diffMins >= 60) {
                const hours = Math.floor(diffMins / 60);
                const mins = diffMins % 60;
                return mins > 0 ? `Starting in ${hours}h ${mins}m` : `Starting in ${hours}h`;
            }
            return `Starting in ${diffMins}m`;
        }
        return 'Tonight';
    };

    // Apply status to both baseMics (for map) and filtered (for list)
    baseMics = baseMics.map(m => ({ ...m, status: calcStatus(m) }));
    filtered = filtered.map(m => ({ ...m, status: calcStatus(m) }));

    // Update mic count in header
    document.getElementById('mic-count').textContent = filtered.length;

    // Group mics by venue (same lat/lng) into one marker - use baseMics for ALL map pins
    const venueGroups = {};
    baseMics.forEach(mic => {
        const key = `${mic.lat},${mic.lng}`;
        if (!venueGroups[key]) venueGroups[key] = [];
        venueGroups[key].push(mic);
    });

    // Render one marker per venue with all times
    Object.values(venueGroups).forEach(venueMics => {
        venueMics.sort((a, b) => (a.start || 0) - (b.start || 0));
        const firstMic = venueMics[0];

        // Use best status for pin color (3-tier: live > upcoming > future)
        const statusPriority = { live: 3, upcoming: 2, future: 0 };
        const bestStatus = venueMics.reduce((best, mic) =>
            (statusPriority[mic.status] || 0) > (statusPriority[best] || 0) ? mic.status : best
        , 'future');

        // Combine times: "4:30, 6:00"
        const timesStr = venueMics.map(m => m.timeStr).join(', ');

        // Tooltip content based on status
        const tooltipContent = bestStatus === 'live'
            ? `<span style="color: #30d158;">LIVE</span><span style="opacity: 0.6; margin: 0 8px;">|</span><span>${firstMic.title.toUpperCase()}</span>`
            : bestStatus === 'upcoming'
            ? `<span style="color: #ff453a;">${timesStr}</span><span style="opacity: 0.5; margin: 0 8px;">|</span><span>${firstMic.title.toUpperCase()}</span>`
            : `<span style="color: #8e8e93;">${timesStr}</span><span style="opacity: 0.5; margin: 0 8px;">|</span><span>${firstMic.title.toUpperCase()}</span>`;

        const marker = L.marker([firstMic.lat, firstMic.lng], {
            icon: createPin(bestStatus),
            zIndexOffset: bestStatus === 'live' ? 1000 : (bestStatus === 'upcoming' ? 500 : 100)
        }).addTo(markersGroup)
        .bindTooltip(tooltipContent, {
            direction: 'top',
            offset: [0, -12],
            className: 'mic-tooltip',
            interactive: false
        })
        .on('click', () => openVenueModal(firstMic));

        // Store marker reference for each mic at this venue
        venueMics.forEach(mic => {
            STATE.markerLookup[mic.id] = marker;
        });
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="text-center py-12 text-neutral-600 text-[10px] font-mono uppercase tracking-widest">No Signals Found</div>`;
        return;
    }

    // Sort: Transit time (if in transit mode) OR start time
    if (STATE.isTransitMode && STATE.userOrigin) {
        // Sort by transit time - closest first, then by start time for ties
        filtered.sort((a, b) =>
            (a.transitMins || 999) - (b.transitMins || 999) ||
            (a.start || 0) - (b.start || 0)
        );
    } else {
        // Default: Sort by start time
        filtered.sort((a, b) => (a.start || 0) - (b.start || 0));
    }

    // In transit mode: split into visible and hidden for "Show more" functionality
    const searchQuery = document.getElementById('search-input')?.value?.toLowerCase() || '';
    let visibleMics = filtered;
    let hiddenMics = [];

    if (STATE.isTransitMode && !STATE.transitExpanded) {
        visibleMics = [];
        hiddenMics = [];

        // filtered is already sorted by transitMins at this point
        filtered.forEach((mic, index) => {
            const title = (mic.title || mic.venue || '').toLowerCase();
            const isSearchTarget = title.includes(searchQuery) && searchQuery.length > 2;
            const isTop5 = index < 5;  // ALWAYS show top 5 closest
            const hasBlueOrGreenBadge = mic.transitType === 'transit' || mic.transitType === 'walk';

            // Show if: search target OR top 5 OR has live data
            if (isSearchTarget || isTop5 || hasBlueOrGreenBadge) {
                visibleMics.push(mic);
            } else {
                hiddenMics.push(mic);
            }
        });
    }

    // Group by Hour with Sticky Headers
    let currentHour = -1;

    visibleMics.forEach(mic => {
        const micHour = mic.start ? mic.start.getHours() : 0;
        const diffMins = mic.start ? (mic.start - currentTime) / 60000 : 999;
        const isRecentPast = (mode === 'today') && diffMins < 0 && diffMins >= -60;

        // --- STICKY HOUR HEADER ---
        if (micHour !== currentHour) {
            currentHour = micHour;
            const displayHour = micHour === 0 ? 12 : (micHour > 12 ? micHour - 12 : micHour);
            const ampm = micHour >= 12 ? 'PM' : 'AM';
            const header = document.createElement('div');
            header.className = 'time-header text-white/50 text-sm';
            header.innerHTML = `
                <span class="font-mono text-lg text-white">${displayHour}:00 ${ampm}</span>
                <div class="h-[1px] bg-white/10 flex-1"></div>
            `;
            container.appendChild(header);
        }

        // --- STREAM ITEM (New Card Design) ---
        const card = document.createElement('div');
        card.id = `card-${mic.id}`;
        card.onclick = () => locateMic(mic.lat, mic.lng, mic.id);
        card.className = `venue-card ${isRecentPast ? 'is-past' : ''}`;

        // Format address: street, borough
        const streetAddress = mic.address ? mic.address.split(',')[0].trim() : '';
        const borough = mic.hood || '';
        const formattedAddress = streetAddress ? `${streetAddress}, ${borough}` : borough;

        // Build commute badge
        let commuteBadge = '';
        if (mic.transitMins !== undefined) {
            commuteBadge = `<span class="commute-badge">${mic.transitType === 'estimate' ? '~' : ''}${mic.transitMins} min</span>`;
        } else if (mic.distanceMiles !== undefined) {
            commuteBadge = `<span class="commute-badge">${mic.distanceMiles < 0.1 ? Math.round(mic.distanceMiles * 5280) + 'ft' : mic.distanceMiles.toFixed(1) + 'mi'}</span>`;
        }

        // Status indicator class
        const statusClass = mic.status === 'live' ? 'is-live' : (mic.status === 'upcoming' ? 'is-upcoming' : 'is-future');
        const statusText = getStatusText(mic, mic.status);

        // Signup note text
        const noteText = mic.signupInstructions || (mic.signupUrl ? 'Online signup available' : 'Sign up in person');

        card.innerHTML = `
            <!-- HEADER SECTION -->
            <div class="card-header">
                <div class="card-header-top">
                    <h2 class="card-venue-name">${mic.title}</h2>
                    <span class="card-time">${mic.timeStr}</span>
                </div>

                <div class="card-sub-header">
                    <span class="card-address">${formattedAddress}</span>
                    <a href="https://maps.apple.com/?q=${encodeURIComponent(mic.address || mic.title)}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="maps-link">Maps ↗</a>
                    ${commuteBadge}
                </div>

                <div class="card-status ${statusClass}">
                    <span class="status-dot"></span>
                    <span>${statusText}</span>
                    <span class="card-set-time">${mic.setTime} sets</span>
                    <span class="card-price">${mic.price}</span>
                </div>

                <p class="card-note">📝 ${noteText}</p>

                <div class="card-actions">
                    ${mic.signupUrl
                        ? `<a href="${mic.signupUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="btn btn-primary">Sign Up Link</a>`
                        : ''
                    }
                    ${mic.contact
                        ? `<a href="https://instagram.com/${mic.contact.replace(/^@/, '')}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="btn btn-ig">IG</a>`
                        : ''
                    }
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    // Add "Show more" button if there are hidden mics
    if (STATE.isTransitMode && !STATE.transitExpanded && hiddenMics.length > 0) {
        const showMoreContainer = document.createElement('div');
        showMoreContainer.className = 'show-more-container';
        showMoreContainer.innerHTML = `
            <button class="show-more-btn" onclick="transitService.expandNeighborhoods()">
                + ${hiddenMics.length} more venues further away
            </button>
        `;
        container.appendChild(showMoreContainer);
    }
}


