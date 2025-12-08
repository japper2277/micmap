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
        console.log(`Loaded ${STATE.mics.length} mics`);
        render('today');
        setTimeout(() => toggleDrawer(true), 500);
    } catch (err) {
        console.error('Failed to load mics:', err);
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

// Run init when DOM is ready
init();
