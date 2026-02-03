/* =================================================================
   RENDER
   Main rendering function for list and map
   ================================================================= */

// Show skeleton loading in list while data loads
function showListSkeleton() {
    const container = document.getElementById('list-content');
    if (!container) return;

    container.innerHTML = `
        <div class="list-skeleton">
            <div class="skeleton-card-item">
                <div class="skeleton-avatar"></div>
                <div class="skeleton-content">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-subtitle"></div>
                </div>
                <div class="skeleton-time"></div>
            </div>
            <div class="skeleton-card-item">
                <div class="skeleton-avatar"></div>
                <div class="skeleton-content">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-subtitle"></div>
                </div>
                <div class="skeleton-time"></div>
            </div>
            <div class="skeleton-card-item">
                <div class="skeleton-avatar"></div>
                <div class="skeleton-content">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-subtitle"></div>
                </div>
                <div class="skeleton-time"></div>
            </div>
            <div class="skeleton-card-item">
                <div class="skeleton-avatar"></div>
                <div class="skeleton-content">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-subtitle"></div>
                </div>
                <div class="skeleton-time"></div>
            </div>
            <div class="skeleton-card-item">
                <div class="skeleton-avatar"></div>
                <div class="skeleton-content">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-subtitle"></div>
                </div>
                <div class="skeleton-time"></div>
            </div>
        </div>`;
}

// Format set time (e.g., "5" -> "5min", "3-5min" -> "3-5min", "5min" -> "5min")
function formatSetTime(setTime) {
    if (!setTime) return '5min';
    const str = String(setTime).toLowerCase().trim();
    // Handle ranges like "3-5min" or "3-5"
    const rangeMatch = str.match(/(\d+)\s*-\s*(\d+)/);
    if (rangeMatch) {
        return rangeMatch[1] + '-' + rangeMatch[2] + 'min';
    }
    // Extract single number
    const num = str.match(/\d+/);
    if (!num) return '5min';
    return num[0] + 'min';
}

// Show picker popup for clustered venues
function showClusterPicker(cluster) {
    // Group mics by venue
    const venueMap = {};
    cluster.mics.forEach(mic => {
        const key = mic.title || mic.venue || 'Unknown';
        if (!venueMap[key]) venueMap[key] = { name: key, mics: [], firstMic: mic };
        venueMap[key].mics.push(mic);
    });

    const venues = Object.values(venueMap);

    // Build popup HTML
    const venueListHtml = venues.map(v => {
        const times = v.mics.map(m => m.timeStr || '?').join(', ');
        return `<div class="cluster-venue-item" data-lat="${v.firstMic.lat}" data-lng="${v.firstMic.lng}" data-id="${v.firstMic.id}">
            <div class="cluster-venue-name">${escapeHtml(v.name)}</div>
            <div class="cluster-venue-times">${escapeHtml(times)}</div>
        </div>`;
    }).join('');

    // Create popup at cluster location
    const popup = L.popup({
        className: 'cluster-picker-popup',
        closeButton: true,
        autoClose: true,
        maxWidth: 250
    })
    .setLatLng([cluster.lat, cluster.lng])
    .setContent(`<div class="cluster-picker">
        <div class="cluster-picker-title">${venues.length} Venues Nearby</div>
        <div class="cluster-picker-list">${venueListHtml}</div>
    </div>`)
    .openOn(map);

    // Add click handlers after popup opens
    setTimeout(() => {
        document.querySelectorAll('.cluster-venue-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                const mic = cluster.mics.find(m => m.id === id);
                if (mic) {
                    map.closePopup();
                    openVenueModal(mic);
                }
            });
        });
    }, 50);
}

// Show tabbed popup for co-located venues (when zoomed in)
function showTabbedVenuePopup(cluster) {
    // Group mics by venue
    const venueMap = {};
    cluster.mics.forEach(mic => {
        const key = mic.title || mic.venue || 'Unknown';
        if (!venueMap[key]) venueMap[key] = { name: key, mics: [], firstMic: mic };
        venueMap[key].mics.push(mic);
    });

    const venues = Object.values(venueMap);

    // Sort venues alphabetically
    venues.sort((a, b) => a.name.localeCompare(b.name));

    // Build tabs HTML
    const tabsHtml = venues.map((v, i) => {
        const shortName = shortenVenueName(v.name);
        const displayName = shortName.length > 12 ? shortName.substring(0, 11) + '…' : shortName;
        return `<button class="tabbed-popup-tab ${i === 0 ? 'active' : ''}" data-venue-index="${i}">${escapeHtml(displayName)}</button>`;
    }).join('');

    // Build content for each venue (mics list)
    const contentHtml = venues.map((v, i) => {
        const micsHtml = v.mics.map(mic => {
            const micName = mic.name || mic.micName || '';
            return `<div class="tabbed-mic-item" data-mic-id="${mic.id}">
                <span class="tabbed-mic-time">${escapeHtml(mic.timeStr || '?')}</span>
                ${micName ? `<span class="tabbed-mic-name">${escapeHtml(micName)}</span>` : ''}
            </div>`;
        }).join('');

        // Add price if available
        const price = v.firstMic.price || 'Free';
        const priceHtml = price.toLowerCase() !== 'free'
            ? `<div class="tabbed-venue-price">${escapeHtml(price)}</div>`
            : '';

        return `<div class="tabbed-popup-content ${i === 0 ? 'active' : ''}" data-venue-index="${i}">
            <div class="tabbed-mics-list">${micsHtml}</div>
            ${priceHtml}
        </div>`;
    }).join('');

    // Create popup
    const popup = L.popup({
        className: 'tabbed-venue-popup',
        closeButton: true,
        autoClose: true,
        maxWidth: 280,
        minWidth: 200
    })
    .setLatLng([cluster.lat, cluster.lng])
    .setContent(`<div class="tabbed-popup-container">
        <div class="tabbed-popup-tabs">${tabsHtml}</div>
        <div class="tabbed-popup-contents">${contentHtml}</div>
    </div>`)
    .openOn(map);

    // Add tab click handlers
    setTimeout(() => {
        document.querySelectorAll('.tabbed-popup-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const index = e.target.dataset.venueIndex;

                // Update active tab
                document.querySelectorAll('.tabbed-popup-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');

                // Update active content
                document.querySelectorAll('.tabbed-popup-content').forEach(c => c.classList.remove('active'));
                document.querySelector(`.tabbed-popup-content[data-venue-index="${index}"]`)?.classList.add('active');
            });
        });

        // Add mic item click handlers - open venue modal
        document.querySelectorAll('.tabbed-mic-item').forEach(item => {
            item.addEventListener('click', () => {
                const micId = item.dataset.micId;
                const mic = cluster.mics.find(m => m.id === micId);
                if (mic) {
                    map.closePopup();
                    openVenueModal(mic);
                }
            });
        });
    }, 50);
}

function render(mode) {
    const container = document.getElementById('list-content');
    if (!container) return;

    // Plan mode: schedule card lives in the sticky drawer header (not the scrolling list)
    const scheduleSlot = document.getElementById('plan-schedule-slot');
    if (scheduleSlot) scheduleSlot.innerHTML = '';

    markersGroup.clearLayers();
    STATE.markerLookup = {};
    container.innerHTML = '';

    // Plan mode: schedule UI is rendered later (after "Happening Now" calculation)

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
    // Track mics filtered by commute for user feedback
    let commuteFilteredCount = 0;
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
            // Track mics filtered out by commute
            if (!m.transitMins || m.transitMins > maxMins) {
                commuteFilteredCount++;
                return false;
            }
        }

        // Filter by borough
        if (STATE.activeFilters.borough !== 'All') {
            const micBorough = (m.borough || '').toLowerCase();
            const filterBorough = STATE.activeFilters.borough.toLowerCase();
            if (micBorough !== filterBorough) return false;
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

    // Update mic count in header and stop pulsing
    const countEl = document.getElementById('mic-count');
    const previousCount = parseInt(countEl.textContent) || 0;
    countEl.textContent = filtered.length;
    countEl.classList.remove('pulsing');

    // Plan mode header: mic count
    const planCountEl = document.getElementById('plan-mic-count');
    if (planCountEl) planCountEl.textContent = filtered.length;

    // Announce filter changes to screen readers (only if count changed significantly)
    if (Math.abs(filtered.length - previousCount) > 0 && previousCount > 0) {
        const hasActiveFilters = STATE.activeFilters.price !== 'All' ||
                                  STATE.activeFilters.time !== 'All' ||
                                  STATE.activeFilters.borough !== 'All' ||
                                  STATE.activeFilters.commute !== 'All';
        if (hasActiveFilters && typeof announceToScreenReader === 'function') {
            announceToScreenReader(`${filtered.length} mic${filtered.length !== 1 ? 's' : ''} match your filters`);
        }
    }

    // --- PROXIMITY CLUSTERING ---
    // Cluster nearby venues to prevent overlapping markers
    const isZoomedIn = map.getZoom() >= 16;
    // When zoomed in: cluster nearby venues (~200m)
    // When zoomed out: larger radius for cleaner pills (~200m)
    const CLUSTER_RADIUS_METERS = 200;

    // Haversine distance in meters
    function getDistanceMeters(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Earth radius in meters
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // First group by exact venue (same lat/lng)
    // Use filtered mics for map markers so filters apply to both list AND map
    // Skip mics without valid coordinates (they'll still show in the list)
    // Skip warning-only entries (no map marker for them)
    const venueGroups = {};
    filtered.forEach(mic => {
        if (mic.warning) return; // Warning entries don't get map markers
        if (mic.lat == null || mic.lng == null || isNaN(mic.lat) || isNaN(mic.lng)) return;
        const key = `${mic.lat},${mic.lng}`;
        if (!venueGroups[key]) venueGroups[key] = [];
        venueGroups[key].push(mic);
    });

    // Convert to array of venue objects with all their mics
    const venues = Object.entries(venueGroups).map(([key, mics]) => {
        const [lat, lng] = key.split(',').map(Number);
        mics.sort((a, b) => (a.start || 0) - (b.start || 0));
        return { lat, lng, mics, clustered: false };
    });

    // Cluster nearby venues together
    const clusters = [];
    venues.forEach(venue => {
        if (venue.clustered) return;

        // Find all unclustered venues within radius
        const nearby = venues.filter(v =>
            !v.clustered &&
            getDistanceMeters(venue.lat, venue.lng, v.lat, v.lng) <= CLUSTER_RADIUS_METERS
        );

        // Mark all as clustered
        nearby.forEach(v => v.clustered = true);

        // Merge all mics from nearby venues
        const allMics = nearby.flatMap(v => v.mics);
        allMics.sort((a, b) => (a.start || 0) - (b.start || 0));

        // Calculate cluster center (average of all venues)
        const centerLat = nearby.reduce((sum, v) => sum + v.lat, 0) / nearby.length;
        const centerLng = nearby.reduce((sum, v) => sum + v.lng, 0) / nearby.length;

        clusters.push({
            lat: centerLat,
            lng: centerLng,
            mics: allMics,
            venues: nearby,
            venueCount: nearby.length
        });
    });

    // Render one marker per cluster
    clusters.forEach(cluster => {
        const firstMic = cluster.mics[0];

        // Use best status for pin color (3-tier: live > upcoming > future)
        const statusPriority = { live: 3, upcoming: 2, future: 0 };
        const bestStatus = cluster.mics.reduce((best, mic) =>
            (statusPriority[mic.status] || 0) > (statusPriority[best] || 0) ? mic.status : best
        , 'future');

        // Get ALL times for this venue (format: "6p, 9p")
        const formatTime = (mic) => {
            if (mic.start instanceof Date) {
                const hours = mic.start.getHours();
                const mins = mic.start.getMinutes();
                const displayHour = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
                const period = hours >= 12 ? 'p' : 'a';
                return mins === 0
                    ? `${displayHour}${period}`
                    : `${displayHour}:${mins.toString().padStart(2, '0')}${period}`;
            } else if (mic.timeStr) {
                return mic.timeStr.replace(/:00([ap])$/, '$1');
            }
            return '?';
        };

        // Get unique times (dedupe in case of duplicates)
        const allTimes = [...new Set(cluster.mics.map(formatTime))];

        // In plan mode, check which times are reachable/dismissed
        let displayTimes;
        if (STATE.planMode && STATE.route.length > 0 && typeof getMicStatus === 'function') {
            const lastMicId = STATE.route[STATE.route.length - 1];

            // Group mics by time, check if ANY mic at that time is reachable and not dismissed
            const timeReachability = {};
            cluster.mics.forEach(mic => {
                const timeStr = formatTime(mic);
                const status = getMicStatus(mic.id, lastMicId, 20);
                const isDismissed = STATE.dismissed?.includes(mic.id);
                // If any mic at this time is reachable AND not dismissed, mark time as reachable
                if (!timeReachability[timeStr]) {
                    timeReachability[timeStr] = status !== 'dimmed' && !isDismissed;
                } else if (status !== 'dimmed' && !isDismissed) {
                    timeReachability[timeStr] = true;
                }
            });

            // Format times with strikethrough for unreachable/dismissed
            displayTimes = allTimes.map(t =>
                timeReachability[t] ? t : `<s class="time-unreachable">${t}</s>`
            ).join(', ');
        } else if (STATE.planMode && STATE.dismissed?.length > 0) {
            // Plan mode with dismissed mics but no route - just check dismissed
            const timeReachability = {};
            cluster.mics.forEach(mic => {
                const timeStr = formatTime(mic);
                const isDismissed = STATE.dismissed.includes(mic.id);
                if (!timeReachability[timeStr]) {
                    timeReachability[timeStr] = !isDismissed;
                } else if (!isDismissed) {
                    timeReachability[timeStr] = true;
                }
            });
            displayTimes = allTimes.map(t =>
                timeReachability[t] ? t : `<s class="time-unreachable">${t}</s>`
            ).join(', ');
        } else {
            displayTimes = allTimes.join(', ');
        }

        // Count unique venues
        const venueNames = [...new Set(cluster.mics.map(m => m.title || m.venue))];
        const isMultiVenue = venueNames.length > 1;

        // Only show +X badge for multiple venues (not for multiple mics at same venue)
        const extraCount = isMultiVenue ? (venueNames.length - 1) : 0;
        const extraType = 'venues';
        const venueName = firstMic.title || firstMic.venue || 'Venue';

        // Determine which icon to use
        let markerIcon;
        const currentZoom = map.getZoom();
        // Large clusters (4+ venues) need deeper zoom to expand
        const zoomThreshold = venueNames.length >= 4 ? 16 : ZOOM_TICKET_THRESHOLD;
        const isZoomedIn = currentZoom >= zoomThreshold;

        if (isZoomedIn && isMultiVenue) {
            // Multi-venue stacked ticket: build venue data array
            const venueMap = {};
            const lastMicId = STATE.planMode && STATE.route.length > 0 ? STATE.route[STATE.route.length - 1] : null;

            cluster.mics.forEach(mic => {
                const key = mic.title || mic.venue || 'Unknown';
                if (!venueMap[key]) venueMap[key] = { name: key, mics: [], status: 'future' };
                venueMap[key].mics.push(mic);
                // Use best status (live > upcoming > future)
                const statusPri = { live: 3, upcoming: 2, future: 0 };
                if ((statusPri[mic.status] || 0) > (statusPri[venueMap[key].status] || 0)) {
                    venueMap[key].status = mic.status;
                }
            });

            const venueData = Object.values(venueMap).map(v => {
                // Get unique times for this venue
                const uniqueTimes = [...new Set(v.mics.map(formatTime))];

                // In plan mode, check reachability per time (also check dismissed)
                let timesStr;
                if (lastMicId && typeof getMicStatus === 'function') {
                    const timeReach = {};
                    v.mics.forEach(mic => {
                        const t = formatTime(mic);
                        const status = getMicStatus(mic.id, lastMicId, 20);
                        const isDismissed = STATE.dismissed?.includes(mic.id);
                        if (!timeReach[t]) timeReach[t] = status !== 'dimmed' && !isDismissed;
                        else if (status !== 'dimmed' && !isDismissed) timeReach[t] = true;
                    });
                    timesStr = uniqueTimes.map(t =>
                        timeReach[t] ? t : `<s class="time-unreachable">${t}</s>`
                    ).join(', ');
                } else if (STATE.dismissed?.length > 0) {
                    // No route but have dismissed - just check dismissed
                    const timeReach = {};
                    v.mics.forEach(mic => {
                        const t = formatTime(mic);
                        const isDismissed = STATE.dismissed.includes(mic.id);
                        if (!timeReach[t]) timeReach[t] = !isDismissed;
                        else if (!isDismissed) timeReach[t] = true;
                    });
                    timesStr = uniqueTimes.map(t =>
                        timeReach[t] ? t : `<s class="time-unreachable">${t}</s>`
                    ).join(', ');
                } else {
                    timesStr = uniqueTimes.join(', ');
                }

                return { name: v.name, times: timesStr, status: v.status };
            });
            markerIcon = createMultiVenuePin(venueData);
        } else {
            // Single venue ticket OR pill (zoomed out)
            markerIcon = createPin(bestStatus, displayTimes, extraCount, isMultiVenue ? null : venueName, extraType);
        }

        const marker = L.marker([cluster.lat, cluster.lng], {
            icon: markerIcon,
            zIndexOffset: bestStatus === 'live' ? 1000 : (bestStatus === 'upcoming' ? 500 : 100)
        }).addTo(markersGroup);


        marker
        .on('click', () => {
            // Plan mode: toggle mic in route instead of opening modal
            if (STATE.planMode) {
                if (cluster.mics.length === 1) {
                    // Single mic - toggle it in route
                    toggleMicInRoute(firstMic.id);
                } else {
                    // Multiple mics - still open modal for selection
                    openVenueModalWithMics(cluster.mics);
                }
                return;
            }

            // Normal mode: open modal
            if (cluster.venueCount > 1 || cluster.mics.length > 1) {
                openVenueModalWithMics(cluster.mics);
            } else {
                openVenueModal(firstMic);
            }
        });

        // Store marker reference for each mic in this cluster
        cluster.mics.forEach(mic => {
            STATE.markerLookup[mic.id] = marker;
        });
    });

    if (filtered.length === 0) {
        // Check if filters are active
        const hasActiveFilters = STATE.activeFilters.price !== 'All' ||
                                  STATE.activeFilters.time !== 'All' ||
                                  STATE.activeFilters.borough !== 'All' ||
                                  STATE.activeFilters.commute !== 'All';

        if (hasActiveFilters) {
            // Filters are blocking results - show reset option
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="m21 21-4.35-4.35"/>
                            <path d="M8 8l6 6M14 8l-6 6" stroke-width="2"/>
                        </svg>
                    </div>
                    <div class="empty-state-title">No mics match your filters</div>
                    <div class="empty-state-subtitle">Try adjusting your filters or browse all mics</div>
                    <button class="empty-state-btn" onclick="resetFilters()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M6 6v14a2 2 0 002 2h8a2 2 0 002-2V6"/>
                        </svg>
                        Clear all filters
                    </button>
                </div>`;
        } else {
            // No mics at all for this day
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                            <line x1="12" x2="12" y1="19" y2="22"/>
                        </svg>
                    </div>
                    <div class="empty-state-title">No mics scheduled</div>
                    <div class="empty-state-subtitle">Check back tomorrow or pick a different day</div>
                </div>`;
        }
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
    // In plan mode: render to sticky scheduleSlot; otherwise render to scrollable container
    const happeningNowTarget = (STATE.planMode && scheduleSlot) ? scheduleSlot : container;

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
        happeningNowTarget.appendChild(card);
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

    // Plan mode: render schedule UI (below "Happening Now" in sticky slot)
    if (scheduleSlot && STATE.planMode && STATE.route && STATE.route.length > 0) {
        const routeMics = STATE.route.map(id => STATE.mics.find(m => m.id === id)).filter(Boolean);
        const setDuration = STATE.setDuration || 45;

        const fmtTime = (d) => {
            const h = d?.getHours?.() || 0;
            const m = d?.getMinutes?.() || 0;
            const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
            const ampm = h >= 12 ? 'PM' : 'AM';
            return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;
        };

        const startTime = routeMics[0]?.start ? fmtTime(routeMics[0].start) : '';
        const endTime = routeMics[routeMics.length - 1]?.start ? fmtTime(routeMics[routeMics.length - 1].start) : '';
        const rangeText = startTime && endTime && startTime !== endTime ? `${startTime}–${endTime}` : startTime;

        // Conflict detection (adjacent overlap in current itinerary order)
        const conflicts = new Set();
        for (let i = 1; i < routeMics.length; i++) {
            const prev = routeMics[i - 1];
            const cur = routeMics[i];
            if (!prev?.start || !cur?.start) continue;
            const prevEnd = prev.start.getTime() + (setDuration * 60 * 1000);
            if (cur.start.getTime() < prevEnd) {
                conflicts.add(prev.id);
                conflicts.add(cur.id);
            }
        }

        const scheduleCard = document.createElement('div');
        scheduleCard.className = `my-schedule-card${STATE.scheduleExpanded ? ' expanded' : ''}`;
        scheduleCard.setAttribute('role', 'button');
        scheduleCard.setAttribute('aria-expanded', STATE.scheduleExpanded ? 'true' : 'false');
        const expandedList = document.createElement('div');
        expandedList.className = `my-schedule-expanded${STATE.scheduleExpanded ? ' is-open' : ''}`;

        scheduleCard.onclick = () => {
            if ('vibrate' in navigator) navigator.vibrate(8);
            STATE.scheduleExpanded = !STATE.scheduleExpanded;
            scheduleCard.classList.toggle('expanded', STATE.scheduleExpanded);
            scheduleCard.setAttribute('aria-expanded', STATE.scheduleExpanded ? 'true' : 'false');
            expandedList.classList.toggle('is-open', STATE.scheduleExpanded);
        };
        scheduleCard.innerHTML = `
            <div class="my-schedule-card-left">
                <span class="my-schedule-icon">📋</span>
                <span class="my-schedule-card-count">${routeMics.length}</span>
                <span class="my-schedule-card-label">My Schedule</span>
            </div>
            <div class="my-schedule-card-right">
                <span class="my-schedule-card-preview">${rangeText}</span>
                <svg class="my-schedule-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 9l6 6 6-6"/>
                </svg>
            </div>
        `;
        scheduleSlot.appendChild(scheduleCard);

        const conflictBanner = conflicts.size
            ? `
                <div class="schedule-conflict-banner" onclick="event.stopPropagation(); toggleHideConflicts();" role="button">
                    <span class="schedule-conflict-dot"></span>
                    <span><strong>${conflicts.size}</strong> conflict${conflicts.size === 1 ? '' : 's'} in your itinerary</span>
                    <span class="schedule-conflict-cta">${STATE.hideConflicts ? 'Showing conflicts' : 'Hide conflicts in list'}</span>
                </div>
            `
            : '';

        const itemsHtml = routeMics.map((mic) => {
            const timeStr = mic.start ? fmtTime(mic.start) : '';
            const rawPrice = mic.price || mic.cost || 0;
            const priceStr = !rawPrice || rawPrice === 'Free' || rawPrice === 0
                ? 'FREE'
                : (String(rawPrice).startsWith('$') ? rawPrice : `$${rawPrice}`);
            const priceClass = priceStr === 'FREE' ? 'free' : '';
            const conflictClass = conflicts.has(mic.id) ? ' conflict' : '';

            return `
                <div class="my-schedule-item${conflictClass}" draggable="true" data-mic-id="${mic.id}" aria-label="Scheduled stop">
                    <div class="my-schedule-item-time">${timeStr}</div>
                    <div class="my-schedule-item-info">
                        <div class="my-schedule-item-venue">${escapeHtml(mic.title || mic.venue || 'Mic')}</div>
                        <div class="my-schedule-item-price ${priceClass}">${priceStr}</div>
                    </div>
                    <div class="my-schedule-item-actions">
                        <button class="schedule-drag-handle" onclick="event.stopPropagation();" aria-label="Drag to reorder" title="Drag to reorder">⋮⋮</button>
                        <button class="my-schedule-remove" onclick="event.stopPropagation(); removeFromRoute('${mic.id}')" aria-label="Remove from schedule">✕</button>
                    </div>
                </div>
            `;
        }).join('');

        const toolsRow = `
            <div class="schedule-tools" onclick="event.stopPropagation()">
                <button class="schedule-tool-btn" onclick="event.stopPropagation(); sortRouteByTime();" aria-label="Sort schedule by time">Sort by time</button>
            </div>
        `;

        expandedList.innerHTML = `${conflictBanner}${itemsHtml}${toolsRow}`;
        scheduleSlot.appendChild(expandedList);

        if (typeof initScheduleReorder === 'function') {
            initScheduleReorder(expandedList);
        } else if (typeof initScheduleDragAndDrop === 'function') {
            initScheduleDragAndDrop(expandedList);
        }
    }

    // In transit mode: split into visible and hidden for "Show more" functionality
    const searchQuery = document.getElementById('search-input')?.value?.toLowerCase() || '';
    let visibleMics = filtered;
    let hiddenMics = [];

    if (STATE.isTransitMode) {
        const wouldBeVisible = [];
        const wouldBeHidden = [];

        // filtered is already sorted by transitMins at this point
        filtered.forEach((mic, index) => {
            const title = (mic.title || mic.venue || '').toLowerCase();
            const isSearchTarget = title.includes(searchQuery) && searchQuery.length > 2;
            const isTop5 = index < 5;  // ALWAYS show top 5 closest
            const hasBlueOrGreenBadge = mic.transitType === 'transit' || mic.transitType === 'walk';

            // Show if: search target OR top 5 OR has live data
            if (isSearchTarget || isTop5 || hasBlueOrGreenBadge) {
                wouldBeVisible.push(mic);
            } else {
                wouldBeHidden.push(mic);
            }
        });

        // Only hide distant venues when not expanded
        if (!STATE.transitExpanded) {
            visibleMics = wouldBeVisible;
            hiddenMics = wouldBeHidden;
        } else {
            visibleMics = filtered;
            hiddenMics = wouldBeHidden; // Keep track of count for "Show fewer" button
        }
    }

    // Filter out conflicting mics when hideConflicts is enabled (plan mode)
    let hiddenConflictCount = 0;
    if (STATE.planMode && STATE.hideConflicts && STATE.route && STATE.route.length > 0) {
        const setDuration = STATE.setDuration || 45;
        const routeTimes = STATE.route.map(id => {
            const m = STATE.mics.find(mic => mic.id === id);
            return m?.start ? m.start.getTime() : null;
        }).filter(Boolean);

        const beforeFilter = visibleMics.length;
        visibleMics = visibleMics.filter(mic => {
            // Always show mics in the route
            if (STATE.route.includes(mic.id)) return true;
            if (!mic.start) return true;

            const micTime = mic.start.getTime();
            const micEndTime = micTime + (setDuration * 60 * 1000);

            // Check if this mic conflicts with any scheduled mic
            for (const routeTime of routeTimes) {
                const routeEndTime = routeTime + (setDuration * 60 * 1000);
                // Conflict if times overlap
                const overlaps = (micTime < routeEndTime) && (micEndTime > routeTime);
                if (overlaps) return false;
            }
            return true;
        });
        hiddenConflictCount = beforeFilter - visibleMics.length;
    }

    // Separate warning cards from regular mics - render warnings first
    const warningMics = visibleMics.filter(m => m.warning);
    const regularMics = visibleMics.filter(m => !m.warning);

    // Render warning cards at top (no time header)
    warningMics.forEach(mic => {
        const card = document.createElement('div');
        card.id = `card-${mic.id}`;
        card.className = 'stream-item warning-card';
        const warningLink = mic.warningLink || '';
        const venueName = escapeHtml(mic.title || mic.venueName || 'Venue');
        const learnMoreHtml = warningLink
            ? `<a href="${escapeHtml(warningLink)}" target="_blank" rel="noopener" class="warning-learn-more" onclick="event.stopPropagation();">Learn more →</a>`
            : '';
        card.innerHTML = `
            <div class="warning-card-content">
                <div class="warning-icon"><svg viewBox="0 0 24 24" fill="#f97316"><path d="M12 2L1 21h22L12 2z"/><rect x="11" y="9" width="2" height="6" rx="1" fill="#1a1a1a"/><circle cx="12" cy="17.5" r="1.2" fill="#1a1a1a"/></svg></div>
                <div class="warning-text">
                    <div class="warning-venue">${venueName}</div>
                    <div class="warning-message">${escapeHtml(mic.warning)} ${learnMoreHtml}</div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    // Group by Hour with Sticky Headers
    let currentHour = -1;

    regularMics.forEach(mic => {
        const micHour = mic.start ? mic.start.getHours() : 0;
        const diffMins = mic.start ? (mic.start - currentTime) / 60000 : 999;
        const isHappeningNow = (mode === 'today') && diffMins < 0 && diffMins >= -30;

        // --- STICKY HOUR HEADER ---
        if (micHour !== currentHour) {
            currentHour = micHour;
            const displayHour = micHour === 0 ? 12 : (micHour > 12 ? micHour - 12 : micHour);
            const ampm = micHour >= 12 ? 'PM' : 'AM';
            const header = document.createElement('div');
            header.className = 'time-header';
            header.innerHTML = `
                <div class="time-header-label">${displayHour}:00 ${ampm}</div>
                <div class="time-header-divider"></div>
            `;
            container.appendChild(header);
        }

        // --- STREAM ITEM ---
        const card = document.createElement('div');
        card.id = `card-${mic.id}`;
        card.onclick = () => locateMic(mic.lat, mic.lng, mic.id);
        const isInRoute = STATE.planMode && STATE.route && STATE.route.includes(mic.id);
        card.className = `stream-item group ${isHappeningNow ? 'is-happening-now' : ''} ${isInRoute ? 'in-route' : ''}`;
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

        // Build commute display - show line badges for transit, walk icon for walking
        let commuteDisplay = '';
        if (mic.transitMins !== undefined) {
            if (mic.transitType === 'walk') {
                // Walking - show walk icon + time
                const walkIcon = `<svg viewBox="0 0 24 24"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>`;
                commuteDisplay = `<div class="commute-live commute-walk">${walkIcon}${mic.transitMins}m</div>`;
            } else if (mic.transitType === 'transit' && mic.route && mic.route.legs) {
                // Transit with route data - show line badge(s) + time
                const rideLegs = mic.route.legs.filter(l => l.type === 'ride');
                if (rideLegs.length > 0) {
                    // Get unique lines (max 3 for 3-transfer routes)
                    const lines = [];
                    rideLegs.forEach(leg => {
                        if (leg.line && !lines.includes(leg.line)) lines.push(leg.line);
                    });
                    const badges = lines.slice(0, 3).map(line =>
                        `<span class="commute-badge b-${escapeHtml(line)}">${escapeHtml(line)}</span>`
                    ).join('');
                    commuteDisplay = `<div class="commute-live commute-transit">${badges}<span class="commute-time">${mic.transitMins}m</span></div>`;
                } else {
                    // Fallback if no ride legs found
                    commuteDisplay = `<div class="commute-live commute-estimate">~${mic.transitMins}m</div>`;
                }
            } else {
                // Estimate - just show ~time (no icon)
                commuteDisplay = `<div class="commute-live commute-estimate">~${mic.transitMins}m</div>`;
            }
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
        // Normalize price display - shorten "FREE (buy something...)" to "FREE (BUY SMTH)"
        let priceDisplay = (mic.price || 'Free').toUpperCase();
        if (priceDisplay.includes('FREE') && priceDisplay.includes('(') && priceDisplay.includes('BUY')) {
            priceDisplay = 'FREE (BUY SMTH)';
        }
        const safePrice = escapeHtml(priceDisplay);
        const safeBorough = escapeHtml((mic.borough || 'NYC').toUpperCase());
        const boroughAbbrev = { 'MANHATTAN': 'MN', 'BROOKLYN': 'BK', 'QUEENS': 'QN', 'BRONX': 'BX', 'STATEN ISLAND': 'SI' };
        const shortBorough = boroughAbbrev[safeBorough] || safeBorough;
        // Filter redundant signup instructions (shown elsewhere via badges/buttons)
        let filteredSignup = mic.signupInstructions || '';
        const hasSignupTime = /sign\s*up\s*(at|@)\s*\d{1,2}(:\d{2})?\s*(am|pm)?/i.test(filteredSignup);
        if (!hasSignupTime && filteredSignup) {
            const lower = filteredSignup.toLowerCase();
            // Walk-in variations - shown as Walk-in badge in modal
            const isWalkIn = /^(sign\s*up\s*)?(there|in\s*person|at\s*(the\s*)?venue|list\s*in\s*person)/.test(lower) ||
                             lower === 'in person only' || lower === 'in person' ||
                             /^in\s*person\b/.test(lower);
            // IG/DM mentions - shown as IG button
            const isIgDm = /(dm|comment)\s*(on\s*)?(ig|instagram)|@\w+\s*(on\s*)?(ig|instagram)/i.test(filteredSignup);
            // Price info - shown in price badge
            const isPriceOnly = /^\$?\d+(\.\d{2})?\s*(\*|fee)?$/.test(filteredSignup.trim()) ||
                               /free\s*(but\s*buy|drink|item)/i.test(lower);
            // Marketing/perks text
            const isPerks = /free\s*drink|free\s*fries|you\s*get\s*a\s*free/i.test(lower);
            if (isWalkIn || isIgDm || isPriceOnly || isPerks) {
                filteredSignup = '';
            }
        }
        const safeSignupInstructions = escapeHtml(filteredSignup || 'Walk-in');
        const safeContact = mic.contact ? escapeHtml(mic.contact.replace(/^@/, '')) : '';
        const safeSignupEmail = mic.signupEmail ? escapeHtml(mic.signupEmail) : '';
        const safeSignupUrl = mic.signupUrl ? escapeHtml(mic.signupUrl) : '';
        const signupLabel = mic.signupUrl ? 'Online signup' : mic.signupEmail ? 'Email signup' : 'Sign up in person';

        const isInPlanRoute = !!(STATE.planMode && STATE.route && STATE.route.includes(mic.id));

        // Build action buttons HTML (small for desktop)
        const signupBtnSm = mic.signupUrl
            ? `<a href="${safeSignupUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="icon-btn-sm" title="Visit Website"><svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`
            : mic.signupEmail
                ? `<a href="mailto:${safeSignupEmail}" onclick="event.stopPropagation();" class="icon-btn-sm" title="Email"><svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg></a>`
                : `<button onclick="event.stopPropagation(); flipCard(this);" class="icon-btn-sm" title="Signup info"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></button>`;
        const igBtnSm = safeContact ? `<a href="https://instagram.com/${safeContact}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="icon-btn-sm" title="@${safeContact}"><svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></a>` : '';

        // Build action buttons HTML (large for mobile)
        const signupBtn = mic.signupUrl
            ? `<a href="${safeSignupUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="icon-btn" title="Visit Website"><svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`
            : mic.signupEmail
                ? `<a href="mailto:${safeSignupEmail}" onclick="event.stopPropagation();" class="icon-btn" title="Email"><svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg></a>`
                : `<button onclick="event.stopPropagation(); flipCard(this);" class="icon-btn" title="Signup info"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></button>`;
        const igBtn = safeContact ? `<a href="https://instagram.com/${safeContact}" target="_blank" rel="noopener" onclick="event.stopPropagation();" class="icon-btn" title="@${safeContact}"><svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg></a>` : '';

        const planAddBtn = `<button class="plan-add-btn" onclick="event.stopPropagation(); handleAddClick(this, '${mic.id}')" aria-label="Add to schedule">+ Add</button>`;
        const planCta = !STATE.planMode
            ? ''
            : isInPlanRoute
                ? `<span class="in-schedule-badge" aria-label="In Schedule">✓ In Schedule</span>`
                : planAddBtn;

        // Add live indicator class for styling
        const liveClass = mic.status === 'live' ? ' is-live-mic' : '';

        card.innerHTML = `
            <!-- FRONT: Card Content -->
            <div class="card-front">
                <!-- MOBILE LAYOUT -->
                <div class="card-layout-mobile">
                    <div class="specs-col${liveClass}">
                        <div class="start-time">${mic.status === 'live' ? '<span class="live-dot"></span>' : ''}${escapeHtml(mic.timeStr)}</div>
                        <div class="stage-time">${escapeHtml(formatSetTime(mic.setTime))}</div>
                    </div>
                    <div class="info-col">
                        <div class="venue-row">
                            <div class="venue-name">${safeTitle}</div>
                            <span class="tag-pill borough-pill"><span class="borough-full">${safeBorough}</span><span class="borough-short">${shortBorough}</span></span>
                            ${planCta}
                        </div>
                        <div class="meta-row">
                            <span class="neighborhood">${safeHood}</span>
                            <span class="meta-dot">·</span>
                            <span class="price-badge">${safePrice}</span>
                            ${commuteDisplay}
                        </div>
                    </div>
                    <div class="action-col">
                        ${signupBtn}
                        ${igBtn}
                    </div>
                </div>

                <!-- DESKTOP LAYOUT -->
                <div class="card-layout-desktop">
                    <div class="specs-col${liveClass}">
                        <div class="start-time">${mic.status === 'live' ? '<span class="live-dot"></span>' : ''}${escapeHtml(mic.timeStr)}</div>
                        <div class="stage-time">${escapeHtml(formatSetTime(mic.setTime))}</div>
                    </div>
                    <div class="info-col">
                        <div class="venue-row">
                            <div class="venue-name">${safeTitle}</div>
                            <span class="tag-pill borough-pill"><span class="borough-full">${safeBorough}</span><span class="borough-short">${shortBorough}</span></span>
                            ${planCta}
                        </div>
                        <div class="meta-row">
                            <span class="neighborhood">${safeHood}</span>
                        </div>
                        <div class="meta-row">
                            <span class="price-badge">${safePrice}</span>
                            ${commuteDisplay}
                        </div>
                    </div>
                    <div class="action-col">
                        ${signupBtn}
                        ${igBtn}
                    </div>
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

        // Hover effect: highlight corresponding map pin
        card.addEventListener('mouseenter', () => {
            const marker = STATE.markerLookup[mic.id];
            if (marker) {
                const el = marker.getElement();
                if (el) el.classList.add('marker-highlight');
            }
        });
        card.addEventListener('mouseleave', () => {
            const marker = STATE.markerLookup[mic.id];
            if (marker) {
                const el = marker.getElement();
                if (el) el.classList.remove('marker-highlight');
            }
        });

        container.appendChild(card);
    });

    // Add "Show more" / "Show fewer" button for transit mode
    if (STATE.isTransitMode && hiddenMics.length > 0) {
        const showMoreContainer = document.createElement('div');
        showMoreContainer.className = 'show-more-container';
        if (!STATE.transitExpanded) {
            showMoreContainer.innerHTML = `
                <button class="show-more-btn" onclick="transitService.expandNeighborhoods()">
                    + ${hiddenMics.length} more venues further away
                </button>
            `;
        } else {
            showMoreContainer.innerHTML = `
                <button class="show-more-btn" onclick="transitService.collapseNeighborhoods()">
                    Show fewer venues
                </button>
            `;
        }
        container.appendChild(showMoreContainer);
    }

    // Show "X conflicts hidden" notice when conflicts are being filtered
    if (STATE.planMode && STATE.hideConflicts && hiddenConflictCount > 0) {
        const notice = document.createElement('div');
        notice.className = 'hidden-mics-notice';
        notice.onclick = () => toggleHideConflicts();
        notice.innerHTML = `${hiddenConflictCount} conflicting mic${hiddenConflictCount > 1 ? 's' : ''} hidden • <strong>Show All</strong>`;
        container.appendChild(notice);
    }

    // Fetch and update departure times for cards with routes
    if (STATE.isTransitMode) {
        updateCardDepartureTimes();
    }

    // Show sticky bottom banner if few mics left tonight
    // Use total mics (happening now + upcoming), not just current view
    // Only show when no filters are active (don't suggest tomorrow when filters caused 0 results)
    const bottomBanner = document.getElementById('drawer-bottom-banner');
    const bannerCount = document.getElementById('banner-count');
    if (bottomBanner) {
        const totalTonightMics = happeningNowMics.length + upcomingMics.length;
        const noFiltersActive = typeof hasActiveFilters === 'function' ? !hasActiveFilters() : true;
        if (mode === 'today' && totalTonightMics > 0 && totalTonightMics <= 5 && noFiltersActive) {
            bannerCount.textContent = totalTonightMics;
            bottomBanner.classList.add('show');
        } else {
            bottomBanner.classList.remove('show');
        }
    }

    // Hide the old map-based tomorrow notice (deprecated)
    const tomorrowNotice = document.getElementById('tomorrow-notice');
    if (tomorrowNotice) {
        tomorrowNotice.classList.remove('show');
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

