/* =================================================================
   RENDER
   Main rendering function for list and map
   ================================================================= */

// Format set time to always show "Xmin" (e.g., "5" -> "5min", "5min" -> "5min")
function formatSetTime(setTime) {
    if (!setTime) return '5min';
    const str = String(setTime).toLowerCase().trim();
    // Extract just the number
    const num = str.replace(/[^0-9]/g, '');
    if (!num) return '5min';
    return num + 'min';
}

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

        // Hide mics started >30 min ago (too late to catch from start)
        if (mode === 'today' && diffMins < -30) return false;

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
            const priceStr = (m.price || 'Free').toLowerCase();
            const isFree = priceStr.includes('free');
            if (STATE.activeFilters.price === 'Free' && !isFree) return false;
            if (STATE.activeFilters.price === 'Paid' && isFree) return false;
        }

        // Filter by time
        if (STATE.activeFilters.time !== 'All' && m.start) {
            const hour = m.start.getHours();
            const range = CONFIG.timeRanges[STATE.activeFilters.time];
            if (range && (hour < range.start || hour >= range.end)) return false;
        }

        // Filter by commute (only when transit mode active)
        if (STATE.activeFilters.commute !== 'All' && STATE.isTransitMode) {
            const maxMins = STATE.activeFilters.commute;
            // If no transit data, hide when commute filter is active
            if (!m.transitMins) return false;
            if (m.transitMins > maxMins) return false;
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

        // Get earliest time for pill display (format: "6:00p")
        let earliestTime = '?';
        if (firstMic.start instanceof Date) {
            const hours = firstMic.start.getHours();
            const mins = firstMic.start.getMinutes();
            const displayHour = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
            const period = hours >= 12 ? 'p' : 'a';
            earliestTime = `${displayHour}:${mins.toString().padStart(2, '0')}${period}`;
        } else if (firstMic.timeStr) {
            earliestTime = firstMic.timeStr;
        }
        const extraCount = venueMics.length - 1; // How many additional mics (+2, +3, etc)
        const venueName = firstMic.title || firstMic.venue || 'Venue';

        // Tooltip shows venue name
        const tooltipTitle = escapeHtml((firstMic.title || 'Unknown Venue').toUpperCase());

        const marker = L.marker([firstMic.lat, firstMic.lng], {
            icon: createPin(bestStatus, earliestTime, extraCount, venueName),
            zIndexOffset: bestStatus === 'live' ? 1000 : (bestStatus === 'upcoming' ? 500 : 100)
        }).addTo(markersGroup)
        .bindTooltip(tooltipTitle, {
            direction: 'top',
            offset: [0, -16],
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

    // Sort by start time (chronological order)
    filtered.sort((a, b) => {
        const aStart = a.start instanceof Date ? a.start.getTime() : (a.start || 0);
        const bStart = b.start instanceof Date ? b.start.getTime() : (b.start || 0);
        return aStart - bStart;
    });

    // Split into upcoming and happening now (started within last 30 min)
    const upcomingMics = [];
    const happeningNowMics = [];

    if (mode === 'today') {
        filtered.forEach(m => {
            const diffMins = m.start ? (m.start - currentTime) / 60000 : 999;
            if (diffMins < 0) {
                happeningNowMics.push(m);
            } else {
                upcomingMics.push(m);
            }
        });
        // Only show upcoming mics in main list (happening now shown in card)
        filtered = STATE.happeningNowExpanded ? [...happeningNowMics] : [...upcomingMics];
    }

    // Render "Happening Now" collapsed card at top (only if there are in-progress mics)
    if (mode === 'today' && happeningNowMics.length > 0 && !STATE.happeningNowExpanded) {
        const venueNames = happeningNowMics.slice(0, 2).map(m => m.title || m.venue || 'Mic').join(', ');
        const moreCount = happeningNowMics.length > 2 ? ` +${happeningNowMics.length - 2} more` : '';

        const card = document.createElement('div');
        card.className = 'happening-now-card';
        card.onclick = () => {
            STATE.happeningNowExpanded = true;
            render(mode);
        };
        card.innerHTML = `
            <div class="happening-now-card-left">
                <span class="happening-now-dot"></span>
                <span class="happening-now-card-count">${happeningNowMics.length}</span>
                <span class="happening-now-card-label">Happening Now</span>
            </div>
            <div class="happening-now-card-right">
                <span class="happening-now-card-venues">${escapeHtml(venueNames)}${moreCount}</span>
                <svg class="happening-now-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6"/>
                </svg>
            </div>
        `;
        container.appendChild(card);
    }

    // Show "Back to Upcoming" button when viewing happening now
    if (mode === 'today' && STATE.happeningNowExpanded) {
        const backBtn = document.createElement('div');
        backBtn.className = 'happening-now-back';
        backBtn.onclick = () => {
            STATE.happeningNowExpanded = false;
            render(mode);
        };
        backBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 18l-6-6 6-6"/>
            </svg>
            <span>Back to Upcoming</span>
            <span class="happening-now-back-count">${upcomingMics.length} mics</span>
        `;
        container.appendChild(backBtn);
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
        const isHappeningNow = (mode === 'today') && diffMins < 0 && diffMins >= -30;

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
        const card = document.createElement('div');
        card.id = `card-${mic.id}`;
        card.onclick = () => locateMic(mic.lat, mic.lng, mic.id);
        card.className = `stream-item group ${isHappeningNow ? 'is-happening-now' : ''}`;
        // Accessibility: make card keyboard navigable
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'article');
        card.setAttribute('aria-label', `${mic.title || 'Mic'} at ${mic.timeStr}, ${mic.hood || 'NYC'}, ${mic.price || 'Free'}`);
        card.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                locateMic(mic.lat, mic.lng, mic.id);
            }
        };

        // Build commute display - show departure times if route available
        let commuteDisplay = '';
        if (mic.transitMins !== undefined) {
            commuteDisplay = `<div class="commute-live">
                <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                ${mic.transitMins}m
            </div>`;
        } else if (mic.distanceMiles !== undefined) {
            // Show distance if no transit time
            commuteDisplay = `<span class="commute-distance">${mic.distanceMiles < 0.1 ? Math.round(mic.distanceMiles * 5280) + 'ft' : mic.distanceMiles.toFixed(1) + 'mi'}</span>`;
        }

        // Status row HTML
        const statusClass = mic.status === 'live' ? 'is-live' : (mic.status === 'upcoming' ? 'is-upcoming' : 'is-future');
        const statusText = getStatusText(mic, mic.status);

        // Safely escape user data for HTML
        const safeTitle = escapeHtml(mic.title || 'Unknown Venue');
        const safeHood = escapeHtml((mic.hood || 'NYC').toUpperCase());
        const safePrice = escapeHtml((mic.price || 'Free').toUpperCase());
        const safeBorough = escapeHtml((mic.borough || 'NYC').toUpperCase());
        const safeSignupInstructions = escapeHtml(mic.signupInstructions || 'Sign up in person only');
        const safeContact = mic.contact ? escapeHtml(mic.contact.replace(/^@/, '')) : '';
        const safeSignupEmail = mic.signupEmail ? escapeHtml(mic.signupEmail) : '';
        const safeSignupUrl = mic.signupUrl ? escapeHtml(mic.signupUrl) : '';

        card.innerHTML = `
            <!-- FRONT: Card Content -->
            <div class="card-front">
                <!-- LEFT: Specs -->
                <div class="specs-col">
                    <div class="start-time">${escapeHtml(mic.timeStr)}</div>
                    <div class="stage-time">${escapeHtml(formatSetTime(mic.setTime))}</div>
                </div>

                <!-- CENTER: Info -->
                <div class="info-col">
                    <div class="venue-row">
                        <div class="venue-name">${safeTitle}</div>
                        ${commuteDisplay}
                    </div>
                    <div class="meta-row">
                        <span class="neighborhood">${safeHood}</span>
                        <span class="meta-dot">·</span>
                        <span class="tag-pill">${safePrice}</span>
                        <span class="tag-pill">${safeBorough}</span>
                    </div>
                </div>

                <!-- RIGHT: Actions -->
                <div class="action-col">
                    ${mic.signupUrl
                        ? `<a href="${safeSignupUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="icon-btn" title="Visit Website" aria-label="Sign up online for ${safeTitle}">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </a>`
                        : mic.signupEmail
                            ? `<a href="mailto:${safeSignupEmail}" onclick="event.stopPropagation();" class="icon-btn" title="Email ${safeSignupEmail}" aria-label="Email to sign up for ${safeTitle}">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                            </a>`
                            : `<button onclick="event.stopPropagation(); flipCard(this);" class="icon-btn" title="Signup info" aria-label="View signup instructions for ${safeTitle}">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            </button>`
                    }
                    ${safeContact ? `<a href="https://instagram.com/${safeContact}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="icon-btn" title="@${safeContact}" aria-label="View ${safeContact} on Instagram">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                    </a>` : ''}
                </div>
            </div>

            <!-- BACK: Signup Instructions -->
            <div class="card-back" role="region" aria-label="Signup instructions">
                <div class="signup-header">
                    <span class="signup-title">SIGNUP INSTRUCTIONS</span>
                    <button onclick="event.stopPropagation(); flipCard(this);" class="close-btn" aria-label="Close signup instructions">
                        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="signup-text">${safeSignupInstructions}</div>
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

    // Fetch and update departure times for cards with routes
    if (STATE.isTransitMode) {
        updateCardDepartureTimes();
    }
}

// Fetch live departure times and update card displays
async function updateCardDepartureTimes() {
    const departureElements = document.querySelectorAll('.commute-departures');
    if (departureElements.length === 0) return;

    // Group by line+stopId to batch similar requests
    const requests = new Map();
    departureElements.forEach(el => {
        const line = el.dataset.line;
        const stopId = el.dataset.stopId;
        const key = `${line}|${stopId}`;
        if (!requests.has(key)) {
            requests.set(key, { line, stopId, elements: [] });
        }
        requests.get(key).elements.push(el);
    });

    // Fetch arrivals for each unique station
    for (const [key, data] of requests) {
        try {
            const arrivals = await mtaService.fetchArrivals(data.line, data.stopId);
            if (arrivals && arrivals.length > 0) {
                // Format next 2-3 arrivals as clock times
                const next3 = arrivals.slice(0, 3);
                const timesStr = next3.map(a => {
                    const arrivalTime = new Date(Date.now() + a.minsAway * 60000);
                    const hours = arrivalTime.getHours();
                    const mins = arrivalTime.getMinutes().toString().padStart(2, '0');
                    const displayHour = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
                    return `${displayHour}:${mins}`;
                }).join(', ');

                // Update all elements for this station
                data.elements.forEach(el => {
                    const timesEl = el.querySelector('.dep-times-card');
                    if (timesEl) timesEl.textContent = timesStr;
                });
            } else {
                // No arrivals - show fallback
                data.elements.forEach(el => {
                    const timesEl = el.querySelector('.dep-times-card');
                    if (timesEl) timesEl.textContent = 'No trains';
                });
            }
        } catch (e) {
            console.warn('Failed to fetch departures for', data.line, data.stopId, e);
            data.elements.forEach(el => {
                const timesEl = el.querySelector('.dep-times-card');
                if (timesEl) timesEl.textContent = '--';
            });
        }
    }
}

// Flip card to show/hide signup instructions
function flipCard(btn) {
    const card = btn.closest('.stream-item');
    if (card) {
        card.classList.toggle('flipped');
    }
}

