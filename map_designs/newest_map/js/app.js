/* =================================================================
   APP
   Data loading, event listeners, initialization
   ================================================================= */

// Load JSON and initialize
async function loadData() {
    try {
        const response = await fetch(CONFIG.apiPath);
        const data = await response.json();
        const rawMics = data.mics || data; // Handle both { mics: [...] } and raw array
        STATE.mics = processMics(rawMics);

        // Check if there are any mics left for today
        const now = new Date();
        const todayName = CONFIG.dayNames[now.getDay()];
        const todayMics = STATE.mics.filter(m => {
            if (m.day !== todayName) return false;
            // Only count mics that haven't started > 30 min ago
            const diffMins = m.start ? (m.start - now) / 60000 : 999;
            return diffMins >= -30;
        });

        // If no mics left today, switch to tomorrow
        if (todayMics.length === 0) {
            STATE.currentMode = 'tomorrow';
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            STATE.selectedCalendarDate = tomorrow.toDateString();
            render('tomorrow');
        } else {
            render('today');
        }

        setTimeout(() => toggleDrawer(true), 500);
    } catch (err) {
        // Failed to load mics - user will see empty list
        if (typeof toastService !== 'undefined') {
            toastService.show('Failed to load open mics', 'error');
        }
    }
}

// Refresh statuses every minute (so "Live" badges update in real-time)
function refreshStatuses() {
    STATE.mics.forEach(mic => {
        mic.status = getStatus(mic.start);
    });
}

// Click on map dismisses date carousel
map.on('click', () => {
    const carousel = document.getElementById('date-carousel');
    if (carousel.style.transform === 'translateY(0)' || carousel.style.transform === 'translateY(0px)') {
        hideDateCarousel();
        updateToggleUI('today');
        STATE.currentMode = 'today';
        STATE.selectedCalendarDate = new Date().toDateString();
        render('today');
    }
});

// Handle orientation change
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        map.invalidateSize();
        fixDrawerStateForViewport();
    }, 100);
});

// Handle window resize
window.addEventListener('resize', () => {
    clearTimeout(STATE.resizeTimeout);
    STATE.resizeTimeout = setTimeout(() => {
        map.invalidateSize();
        fixDrawerStateForViewport();
    }, 150);
});

// Initialize everything
function init() {
    // Initialize modal DOM references
    initModal();

    // Initialize drawer state
    initDrawerState();

    // Setup mobile swipe
    setupMobileSwipe();

    // Setup keyboard scroll for list content
    setupKeyboardScroll();

    // Setup filter row accessibility (roving tabindex + scroll indicators)
    setupFilterRovingTabindex();
    setupFilterScrollIndicators();

    // Get user location
    getUserLocation();

    // Generate date carousel
    generateDateCarousel();

    // Initialize toast notifications
    if (typeof toastService !== 'undefined') {
        toastService.init();
    }

    // Initialize search service
    if (typeof searchService !== 'undefined') {
        searchService.init();
    }

    // Initialize settings modal
    if (typeof settingsService !== 'undefined') {
        settingsService.init();
    }

    // Load transit data (for matrix-based estimates)
    if (typeof loadTransitData === 'function') {
        loadTransitData();
    }

    // Load data and render
    loadData();

    // Refresh statuses every minute
    setInterval(refreshStatuses, 60000);
}

// Load transit station data for arrivals/fallback
async function loadTransitData() {
    try {
        const response = await fetch(`${CONFIG.apiBase}/data/stations.json`);
        if (!response.ok) throw new Error('Failed to fetch stations');
        const stationsObj = await response.json();

        // Transform object to array with gtfsStopId and lines
        const stations = Object.entries(stationsObj).map(([id, station]) => {
            // Extract lines from nodes (e.g., "101S_1" -> "1")
            const lines = new Set();
            (station.nodes || []).forEach(node => {
                const match = node.match(/_([A-Z0-9]+)$/);
                if (match) lines.add(match[1]);
            });

            // Build name with lines like "Station Name (1 2 3)"
            const lineStr = [...lines].sort().join(' ');
            const nameWithLines = lineStr ? `${station.name} (${lineStr})` : station.name;

            return {
                ...station,
                gtfsStopId: id,
                name: nameWithLines,
                lines: [...lines]
            };
        });

        window.TRANSIT_DATA = { stations };
    } catch (e) {
        // Failed to load transit data - will use fallback estimates
        window.TRANSIT_DATA = { stations: [] };
    }
}

// Run init when DOM is ready
init();
