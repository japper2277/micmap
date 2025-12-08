/* =================================================================
   RENDER
   Main rendering function for list and map
   ================================================================= */

function render(mode) {
    const container = document.getElementById('list-content');

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
    const calcStatus = (m) => {
        if (mode !== 'today') return 'upcoming';
        const diffMins = m.start ? (m.start - currentTime) / 60000 : 999;
        if (diffMins > -90 && diffMins <= 0) return 'live';
        if (diffMins > 0 && diffMins <= 60) return 'urgent';
        if (diffMins > 60 && diffMins <= 120) return 'soon';
        return 'future';
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

        // Use best status for pin color
        const statusPriority = { live: 4, urgent: 3, soon: 2, upcoming: 1, future: 0 };
        const bestStatus = venueMics.reduce((best, mic) =>
            (statusPriority[mic.status] || 0) > (statusPriority[best] || 0) ? mic.status : best
        , 'future');

        // Combine times: "4:30, 6:00"
        const timesStr = venueMics.map(m => m.timeStr).join(', ');

        const marker = L.marker([firstMic.lat, firstMic.lng], {
            icon: createPin(bestStatus),
            zIndexOffset: bestStatus === 'urgent' || bestStatus === 'live' ? 1000 : (bestStatus === 'soon' ? 500 : 100)
        }).addTo(markersGroup)
        .bindTooltip(
            (bestStatus === 'live' || bestStatus === 'urgent')
                ? `<span style="color: white;">LIVE</span><span style="opacity: 0.6; margin: 0 8px;">|</span><span>${firstMic.title.toUpperCase()}</span>`
                : `<span style="color: ${bestStatus === 'soon' ? '#f59e0b' : '#fff'};">${timesStr}</span><span style="opacity: 0.5; margin: 0 8px;">|</span><span>${firstMic.title.toUpperCase()}</span>`,
            {
                direction: 'top',
                offset: (bestStatus === 'live' || bestStatus === 'urgent') ? [0, -25] : [0, -12],
                className: (bestStatus === 'live' || bestStatus === 'urgent') ? 'mic-tooltip mic-tooltip-live' : 'mic-tooltip',
                interactive: false
            }
        )
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

        // --- STREAM ITEM ---
        const accentColor = (mic.status === 'urgent' || mic.status === 'live') ? 'var(--rose)' : (mic.status === 'soon' ? 'var(--amber)' : 'var(--blue-muted)');
        const timeColor = (mic.status === 'urgent' || mic.status === 'live') ? 'text-rose-500' : (mic.status === 'soon' ? 'text-amber-400' : (mic.status === 'upcoming' ? 'text-white' : 'text-neutral-400'));
        const subTextColor = (mic.status === 'upcoming') ? 'text-white' : 'text-neutral-500';

        const card = document.createElement('div');
        card.id = `card-${mic.id}`;
        card.onclick = () => locateMic(mic.lat, mic.lng, mic.id);
        card.className = `stream-item group ${isRecentPast ? 'is-past' : ''}`;

        card.innerHTML = `
            <!-- Sliding Accent Bar -->
            <div class="stream-accent-bar" style="background-color: ${accentColor}"></div>

            <!-- Travel Connector -->
            <div class="travel-connector"></div>

            <!-- Default Card View -->
            <div class="card-default-view" style="display: contents;">
                <!-- LEFT: Time + Set Length -->
                <div class="flex flex-col items-center pt-1 relative z-10">
                    <span class="time-display font-mono font-bold text-lg ${timeColor} transition-colors">${mic.timeStr}</span>
                    <span class="sub-text text-[10px] ${subTextColor} font-mono mt-0.5 transition-colors">${mic.setTime}</span>
                </div>

                <!-- MIDDLE: Details -->
                <div class="flex flex-col justify-center relative z-10">
                    <div class="flex items-center gap-2">
                        <h3 class="font-bold text-base leading-tight text-white transition-colors font-display group-hover:text-black">${mic.title}</h3>
                        ${mic.transitMins !== undefined ? `<span class="transit-badge transit-${mic.transitType || 'transit'}">${mic.transitType === 'walk' ? '🚶' : '🚇'} ${mic.transitType === 'estimate' ? '~' : ''}${mic.transitMins}m</span>` : ''}
                    </div>
                    <div class="flex items-center gap-2 mt-1 text-[10px] ${subTextColor} font-mono uppercase tracking-wide">
                        <span class="sub-text">${mic.hood}</span>
                        <span class="w-0.5 h-0.5 bg-neutral-600 rounded-full"></span>
                        <span class="tag-text px-1 py-0.5 border border-white/20 rounded transition-colors">${mic.price}</span>
                        <span class="tag-text px-1 py-0.5 border border-white/20 rounded transition-colors">${mic.type}</span>
                    </div>
                </div>

                <!-- RIGHT: Link/Email/Info + Instagram -->
                <div class="flex flex-col items-center justify-center gap-2 relative z-10">
                    ${mic.signupUrl
                        ? `<a href="${mic.signupUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="w-10 h-10 rounded-full bg-white/10 hover:bg-rose-500 flex items-center justify-center transition-all group-hover:bg-black/20" title="Go to site">
                            <svg class="w-4 h-4 text-neutral-400 group-hover:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                            </svg>
                        </a>`
                        : mic.signupEmail
                        ? `<a href="mailto:${mic.signupEmail}" onclick="event.stopPropagation();" class="w-10 h-10 rounded-full bg-white/10 hover:bg-rose-500 flex items-center justify-center transition-all group-hover:bg-black/20" title="Email ${mic.signupEmail}">
                            <svg class="w-4 h-4 text-neutral-400 group-hover:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                            </svg>
                        </a>`
                        : `<button onclick="event.stopPropagation(); toggleSignupInfo('${mic.id}');" class="w-10 h-10 rounded-full bg-white/10 hover:bg-rose-500 flex items-center justify-center transition-all group-hover:bg-black/20" title="Signup info">
                            <svg class="w-4 h-4 text-neutral-400 group-hover:text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </button>`
                    }
                    ${mic.contact ? `<a href="https://instagram.com/${mic.contact.replace(/^@/, '')}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="w-10 h-10 rounded-full bg-white/10 hover:bg-rose-500 flex items-center justify-center transition-all group-hover:bg-black/20" title="@${mic.contact.replace(/^@/, '')}">
                        <svg class="w-4 h-4 text-neutral-400 group-hover:text-black" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                        </svg>
                    </a>` : ''}
                </div>
            </div>

            <!-- Expanded Signup Info View -->
            <div class="card-signup-view" style="display: none; grid-column: 1 / -1; padding: 16px 20px; background: rgba(0, 0, 0, 0.8); border-radius: 8px; margin: 8px 0;">
                <div class="flex justify-between items-start gap-3">
                    <div class="flex-1">
                        <div class="text-xs uppercase tracking-wider text-neutral-500 font-bold mb-2" style="color: #71717a !important;">Signup Instructions</div>
                        <div class="text-sm leading-relaxed" style="color: white !important;">${mic.signupInstructions}</div>
                    </div>
                    <button onclick="event.stopPropagation(); toggleSignupInfo('${mic.id}');" class="w-6 h-6 rounded-full bg-white/10 hover:bg-rose-500 flex items-center justify-center transition-all flex-shrink-0" style="color: #a1a1aa;">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    </button>
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

// Toggle signup info display
function toggleSignupInfo(micId) {
    const card = document.getElementById(`card-${micId}`);
    if (!card) return;

    const defaultView = card.querySelector('.card-default-view');
    const signupView = card.querySelector('.card-signup-view');

    if (signupView.style.display === 'none') {
        defaultView.style.display = 'none';
        signupView.style.display = 'block';
        card.classList.add('signup-expanded');
    } else {
        defaultView.style.display = 'contents';
        signupView.style.display = 'none';
        card.classList.remove('signup-expanded');
    }
}
