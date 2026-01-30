/* =================================================================
   MAP
   Leaflet map initialization, pins, geolocation
   ================================================================= */

// Initialize map with device-appropriate center and zoom
const isMobile = window.matchMedia('(max-width: 767px)').matches;
const initialCenter = isMobile ? CONFIG.mapCenter : CONFIG.desktopMapCenter;
const initialZoom = isMobile ? CONFIG.mobileMapZoom : CONFIG.mapZoom;
const map = L.map('map', { zoomControl: false, attributionControl: false })
    .setView(initialCenter, initialZoom);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd'
}).addTo(map);

const markersGroup = L.featureGroup().addTo(map);

// Zoom threshold for switching between pill and ticket styles
const ZOOM_TICKET_THRESHOLD = 14;

// Shorten venue names for ticket display
function shortenVenueName(name) {
    if (!name) return 'Venue';

    // Known venue shortcuts
    const shortcuts = {
        // Classic NYC venues
        'grisly pear': 'Pear',
        'the grisly pear': 'Pear',
        'grisly pear midtown': 'Pear',
        'comedy shop': 'Shop',
        'the comedy shop': 'Shop',
        'stand nyc': 'Stand',
        'the stand': 'Stand',
        'stand up ny': 'Stand Up NY',
        'qed astoria': 'QED',
        'qed': 'QED',
        'fear city': 'Fear City',
        'comedy cellar': 'Cellar',
        'the comedy cellar': 'Cellar',
        'village underground': 'Village UG',
        'fat black pussycat': 'Pussycat',
        'cream': 'Cream',
        'tiny cupboard': 'Tiny Cupboard',
        'easy laughter': 'Easy Laughter',
        'easy lover': 'Easy Lover',
        'the comic strip live': 'Comic Strip',
        'comic strip live': 'Comic Strip',
        'ucb': 'UCB',
        'ucb theatre': 'UCB',

        // NYCC locations - one word, no midtown
        'new york comedy club east village': 'NYCC',
        'new york comedy club midtown': 'NYCC',
        'new york comedy club': 'NYCC',
        'nycc east village': 'NYCC',
        'nycc midtown': 'NYCC',
        'nycc': 'NYCC',

        // Brooklyn venues
        'brooklyn comedy collective': 'BK Collective',
        'brooklyn art haus': 'BK Art Haus',
        'brooklyn dreams juice lounge': 'BK Dreams',
        'cobra club brooklyn': 'Cobra Club',
        'the gutter williamsburg': 'Gutter',
        'gutter williamsburg': 'Gutter',
        'corner store bk': 'Corner Store',

        // Other long names
        'greenwich village comedy club': 'Greenwich',
        'pine box rock shop': 'Pine Box',
        'pete\'s candy store': 'Pete\'s',
        'caravan of dreams': 'Caravan',
        'caffeine underground': 'Caffeine UG',
        'phoenix bar avenue a': 'Phoenix',
        'phoenix bar': 'Phoenix',
        'alligator lounge': 'Alligator',
        'harlem nights bar': 'Harlem Nights',
        'harlem nights': 'Harlem Nights',
        'oh craft beer harlem': 'Oh Craft',
        'second city blackbox': 'Second City',
        'skybox sports bar & grill': 'SkyBox',
        'cool beans coffee': 'Cool Beans',
        'comedy in harlem': 'Harlem',
        'scorpion records': 'Scorpion',
        'logan\'s run bar': 'Logan\'s Run',
        'logan\'s run': 'Logan\'s Run',
        'island ribhouse': 'Island',
        'block hill station': 'Block Hill',
        'rose r&r bar': 'Rose R&R',
        'rose r&r': 'Rose R&R',
    };

    const lower = name.toLowerCase().trim();
    if (shortcuts[lower]) return shortcuts[lower];

    // Strip common suffixes and prefixes
    let short = name
        .replace(/\s*(comedy club|comedy cellar|cc|comedy|club|nyc)$/i, '')
        .replace(/\s+bar$/i, '')  // Remove trailing "Bar"
        .replace(/\s+bar\s+/i, ' ')  // Remove "Bar" in middle
        .replace(/\s+midtown$/i, '')  // Remove trailing "Midtown"
        .replace(/\s+lounge$/i, '')  // Remove trailing "Lounge"
        .replace(/^the\s+/i, '')
        .trim();

    // Abbreviate remaining long names
    short = short
        .replace(/\bNew York\b/gi, 'NY')
        .replace(/\bBrooklyn\b/gi, 'BK')
        .replace(/\bWilliamsburg\b/gi, 'Wburg');

    return short || name;
}

// Strip HTML tags for text length calculation
function stripHtml(str) {
    return str.replace(/<[^>]*>/g, '');
}

// Create marker - pill style (zoomed out) or ticket style (zoomed in)
// extraCount: number of additional items, extraType: 'mics' or 'venues'
function createPin(status, timeStr, extraCount, venueName, extraType = 'mics') {
    const displayTime = timeStr || '?';
    const displayTimeText = stripHtml(displayTime); // For width calculation
    const isZoomedIn = map.getZoom() >= ZOOM_TICKET_THRESHOLD;

    // Status determines color class
    let statusClass = 'future'; // gray
    if (status === 'live') {
        statusClass = 'live'; // green
    } else if (status === 'upcoming' || status === 'urgent' || status === 'soon') {
        statusClass = 'upcoming'; // red
    }

    // Label for count badge (singular/plural)
    const countLabel = extraType === 'venues'
        ? (extraCount === 1 ? 'venue' : 'venues')
        : (extraCount === 1 ? 'mic' : 'mics');

    if (isZoomedIn && venueName) {
        // TICKET STYLE: stacked time/venue
        const shortName = shortenVenueName(venueName);
        const displayName = shortName.length > 14 ? shortName.substring(0, 13) + '…' : shortName;
        const countBadge = extraCount > 0 ? `<span class="ticket-count">+${extraCount} ${countLabel}</span>` : '';

        // Dynamic width based on longer of: times or venue name
        const timeWidth = displayTimeText.length * 8 + 16;  // times are bigger font
        const nameWidth = displayName.length * 7 + 16;
        const contentWidth = Math.max(timeWidth, nameWidth);
        const ticketWidth = Math.max(70, Math.min(contentWidth, 180));

        return L.divIcon({
            className: 'bg-transparent',
            html: `<div class="mic-ticket ticket-${statusClass}">
                    <div class="ticket-content">
                        <div class="ticket-time">${displayTime}${countBadge}</div>
                        <div class="ticket-venue">${displayName}</div>
                    </div>
                   </div>`,
            iconSize: [ticketWidth, 44],
            iconAnchor: [ticketWidth / 2, 44]
        });
    } else {
        // PILL STYLE: Main pill with white chip badge for venue count
        const isLive = statusClass === 'live';
        // For pills, only show earliest time (first one before comma)
        const firstTime = displayTimeText.split(',')[0].trim();
        const mainText = isLive ? 'LIVE' : firstTime;
        const hasCount = extraCount > 0;

        // White chip badge for venue count
        const chipHtml = hasCount
            ? `<div class="venue-chip">+${extraCount} ${countLabel}</div>`
            : '';

        // Calculate dimensions - tighter fit for short times like "7p"
        const textWidth = isLive ? 50 : (firstTime.length * 11 + 12);
        const totalWidth = Math.max(textWidth, 44) + (hasCount ? 20 : 0);
        const totalHeight = 42;

        return L.divIcon({
            className: 'bg-transparent',
            html: `<div class="cluster-pill status-${statusClass}">
                    <span class="pill-main-text ${isLive ? 'is-live-text' : ''}">${mainText}</span>
                    ${chipHtml}
                    <div class="pill-tail"></div>
                   </div>`,
            iconSize: [totalWidth, totalHeight],
            iconAnchor: [totalWidth / 2, totalHeight]
        });
    }
}

// Create multi-venue stacked ticket marker (for zoomed-in view of multi-venue clusters)
// venueData: array of { name: string, times: string } objects
function createMultiVenuePin(venueData) {
    // Build venue rows (max 4 to keep marker reasonable)
    const maxVenues = 4;
    const displayVenues = venueData.slice(0, maxVenues);

    const rowsHtml = displayVenues.map(v => {
        const shortName = shortenVenueName(v.name);
        const status = v.status || 'future';
        return `<div class="mv-venue-row">
            <div class="mv-venue-info">
                <div class="mv-status-dot ${status}"></div>
                <div class="mv-venue-name">${shortName}</div>
            </div>
            <div class="mv-gutter"></div>
            <div class="mv-times-list ${status}">${v.times}</div>
        </div>`;
    }).join('');

    // Calculate height: 22px per venue row
    const ticketHeight = displayVenues.length * 22;

    return L.divIcon({
        className: 'bg-transparent',
        html: `<div class="multi-venue-ticket no-day">
                <div class="mv-content-stack">
                    ${rowsHtml}
                </div>
               </div>`,
        iconSize: [140, ticketHeight],
        iconAnchor: [70, ticketHeight]
    });
}

// Get user location
function getUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                STATE.userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };

                // Clear any existing search/origin marker to prevent duplicates
                if (STATE.searchMarker) {
                    map.removeLayer(STATE.searchMarker);
                    STATE.searchMarker = null;
                }

                // Add user marker (navigation arrow icon)
                const navIcon = L.divIcon({
                    className: 'user-location-marker',
                    html: `<div class="nav-arrow-icon">
                             <svg viewBox="0 0 24 24" fill="white" width="16" height="16">
                               <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                             </svg>
                           </div>`,
                    iconSize: [44, 44],
                    iconAnchor: [22, 22]
                });

                if (STATE.userMarker) {
                    STATE.userMarker.setLatLng([STATE.userLocation.lat, STATE.userLocation.lng]);
                } else {
                    STATE.userMarker = L.marker([STATE.userLocation.lat, STATE.userLocation.lng], {
                        icon: navIcon
                    }).addTo(map);
                }

                // Automatically calculate transit times from user location (silent/background mode)
                // Only if mics are already loaded; otherwise flag for later
                if (STATE.mics && STATE.mics.length > 0) {
                    if (typeof transitService !== 'undefined' && transitService.calculateFromOrigin) {
                        const searchInput = document.getElementById('search-input');
                        if (searchInput) searchInput.value = 'My Location';
                        transitService.calculateFromOrigin(STATE.userLocation.lat, STATE.userLocation.lng, 'My Location', null, { silent: true, skipOriginMarker: true });
                    }
                } else {
                    // Mics not loaded yet - flag to calculate after loadData completes
                    STATE.pendingTransitCalc = true;
                }

                // Clear any existing interval first
                if (STATE.manhattanBtnInterval) {
                    clearInterval(STATE.manhattanBtnInterval);
                }

                // Set up Manhattan button click handler
                const manhattanBtn = document.getElementById('manhattan-btn');
                const manhattanNotice = document.getElementById('manhattan-notice');
                if (manhattanBtn && manhattanNotice) {
                    manhattanBtn.onclick = () => {
                        STATE.isProgrammaticMove = true;
                        map.flyTo(CONFIG.mapCenter, CONFIG.mapZoom, { duration: 1.2 });
                        manhattanNotice.classList.remove('show');
                        // Close drawer if open (mobile only)
                        const isMobile = window.matchMedia('(max-width: 767px)').matches;
                        if (isMobile && STATE.isDrawerOpen && typeof setDrawerState === 'function') {
                            setDrawerState(DRAWER_STATES.PEEK);
                        }
                    };
                }

                // Check periodically if user is outside NYC with few mics
                STATE.manhattanBtnInterval = setInterval(() => {
                    const manhattanNotice = document.getElementById('manhattan-notice');
                    if (!manhattanNotice) return;

                    // NYC borough bounding box (approximate)
                    const nycBounds = {
                        minLat: 40.4774,
                        maxLat: 40.9176,
                        minLng: -74.2591,
                        maxLng: -73.7004
                    };

                    // Check where the map is currently centered
                    const mapCenter = map.getCenter();
                    const viewLat = mapCenter.lat;
                    const viewLng = mapCenter.lng;

                    // Check if map view is within NYC bounds
                    const isViewingNYC = viewLat >= nycBounds.minLat && viewLat <= nycBounds.maxLat &&
                        viewLng >= nycBounds.minLng && viewLng <= nycBounds.maxLng;

                    const bounds = map.getBounds();
                    const visibleMics = STATE.mics.filter(mic =>
                        bounds.contains([mic.lat, mic.lng || mic.lon])
                    );

                    // Show notice if outside NYC OR < 3 mics visible
                    if (!isViewingNYC && visibleMics.length < 3) {
                        manhattanNotice.classList.add('show');
                    } else {
                        manhattanNotice.classList.remove('show');
                    }
                }, 2000);
            },
            (error) => {
                console.warn('Geolocation error:', error.code, error.message);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
    }
}

// Center map on user's location AND trigger transit mode
function centerOnUser() {
    const btn = document.getElementById('locate-btn');

    if (STATE.userLocation) {
        // We have location - fly to it (zoom 15 to show ticket/card view)
        STATE.isProgrammaticMove = true;
        map.flyTo([STATE.userLocation.lat, STATE.userLocation.lng], 15, { duration: 1 });
        btn.classList.add('active');

        // Clear any existing search/origin marker to prevent duplicates
        if (STATE.searchMarker) {
            map.removeLayer(STATE.searchMarker);
            STATE.searchMarker = null;
        }

        // Add/update user marker (navigation arrow icon)
        const navIcon = L.divIcon({
            className: 'user-location-marker',
            html: `<div class="nav-arrow-icon">
                     <svg viewBox="0 0 24 24" fill="white" width="16" height="16">
                       <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                     </svg>
                   </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });

        if (STATE.userMarker) {
            STATE.userMarker.setLatLng([STATE.userLocation.lat, STATE.userLocation.lng]);
        } else {
            STATE.userMarker = L.marker([STATE.userLocation.lat, STATE.userLocation.lng], {
                icon: navIcon
            }).addTo(map);
        }

        // Trigger transit calculations from user location
        if (typeof transitService !== 'undefined' && transitService.calculateFromOrigin) {
            // Show origin chip instead of polluting search input
            if (typeof searchService !== 'undefined' && searchService.showOriginChip) {
                searchService.showOriginChip('Current Location');
            }
            transitService.calculateFromOrigin(STATE.userLocation.lat, STATE.userLocation.lng, 'My Location', null, { skipOriginMarker: true });
        }

        // Remove active state after animation
        setTimeout(() => btn.classList.remove('active'), 1500);
    } else {
        // Request location
        if (navigator.geolocation) {
            btn.style.opacity = '0.5';
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    STATE.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    btn.style.opacity = '1';
                    centerOnUser(); // Recurse now that we have location
                },
                () => {
                    btn.style.opacity = '1';
                    if (typeof toastService !== 'undefined') {
                        toastService.show('Unable to get location. Enable location services.', 'error');
                    } else {
                        alert('Unable to get your location. Please enable location services.');
                    }
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            if (typeof toastService !== 'undefined') {
                toastService.show('Geolocation not supported by your browser', 'error');
            } else {
                alert('Geolocation is not supported by your browser.');
            }
        }
    }
}

// Fly to a specific mic location
function locateMic(lat, lng, id) {
    STATE.isProgrammaticMove = true;
    map.flyTo([lat, lng], 15, { duration: 1.2, easeLinearity: 0.25 });

    // Minimize drawer on mobile so user can see the map
    if (window.matchMedia('(max-width: 767px)').matches && STATE.isDrawerOpen) {
        toggleDrawer(false);
    }

    // Open the venue modal after fly animation completes
    setTimeout(() => {
        const mic = STATE.mics.find(m => m.id === id);
        if (mic) {
            openVenueModal(mic);
        }
    }, 1300);
}

// Map event: track programmatic moves
map.on('moveend', () => {
    if (STATE.isProgrammaticMove) {
        STATE.isProgrammaticMove = false;
    }
});

// Collapse drawer when user pans the map (mobile only)
map.on('movestart', () => {
    // Skip if this is a programmatic move (flyTo, setView, etc.)
    if (STATE.isProgrammaticMove) return;

    // Collapse drawer when open (mobile only - desktop keeps drawer visible)
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (isMobile && STATE.isDrawerOpen && typeof setDrawerState === 'function') {
        setDrawerState(DRAWER_STATES.PEEK);
    }
});

// Track zoom level for marker style switching
let lastZoomWasTicket = map.getZoom() >= ZOOM_TICKET_THRESHOLD;
let lastZoomWasLargeCluster = map.getZoom() >= 16; // Threshold for 4+ venue clusters

map.on('zoomend', () => {
    const currentZoom = map.getZoom();
    const isNowTicket = currentZoom >= ZOOM_TICKET_THRESHOLD;
    const isNowLargeCluster = currentZoom >= 16;

    // Re-render if we crossed either threshold
    if (isNowTicket !== lastZoomWasTicket || isNowLargeCluster !== lastZoomWasLargeCluster) {
        lastZoomWasTicket = isNowTicket;
        lastZoomWasLargeCluster = isNowLargeCluster;
        // Re-render to swap marker styles
        if (typeof render === 'function') {
            render(STATE.currentMode);
        }
        // Reapply plan mode marker states after re-render
        if (STATE.planMode && typeof updateMarkerStates === 'function') {
            updateMarkerStates();
        }
    }
});

/* =================================================================
   PIN DROP MODE
   Toggle map click to set custom origin location
   ================================================================= */

function togglePinDropMode() {
    const btn = document.getElementById('pinBtn');

    btn.classList.toggle('active');
    STATE.isWaitingForMapClick = btn.classList.contains('active');

    if (STATE.isWaitingForMapClick) {
        // Entering pin drop mode - add one-time map click listener
        map.once('click', handleMapClick);

        // Show toast feedback
        if (typeof toastService !== 'undefined') {
            toastService.show('Tap anywhere on the map to set your location', 'info');
        }
    } else {
        // Exiting pin drop mode
        map.off('click', handleMapClick);
    }
}

function handleMapClick(e) {
    const { lat, lng } = e.latlng;

    // Deactivate pin mode
    const btn = document.getElementById('pinBtn');
    btn.classList.remove('active');
    STATE.isWaitingForMapClick = false;

    // Show origin chip
    if (typeof searchService !== 'undefined' && searchService.showOriginChip) {
        searchService.showOriginChip('Dropped Pin');
    }

    // Collapse drawer so user can see the map (mobile only)
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (isMobile && typeof toggleDrawer === 'function' && STATE.isDrawerOpen) {
        toggleDrawer(false);
    }

    // Zoom to location
    map.flyTo([lat, lng], 14, { duration: 1 });

    // Calculate transit from this location
    if (typeof transitService !== 'undefined' && transitService.calculateFromOrigin) {
        transitService.calculateFromOrigin(lat, lng, 'Dropped Pin', null);
    }

    // Reset pin button if geo button was active
    document.getElementById('geoBtn')?.classList.remove('finding');
}
