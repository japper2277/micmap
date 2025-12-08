/* =================================================================
   FILTERS
   Filter cycling, UI updates, reset
   ================================================================= */

// Cycle through filter states (for Price and Time toggles)
function cycleFilter(type) {
    const cycle = CONFIG.filterCycles[type];
    const currentIndex = cycle.indexOf(STATE.activeFilters[type]);
    const nextIndex = (currentIndex + 1) % cycle.length;
    STATE.activeFilters[type] = cycle[nextIndex];
    updateFilterPillUI(type, STATE.activeFilters[type]);
    render(STATE.currentMode);
}

function updateFilterPillUI(type, value) {
    const btn = document.getElementById(`filter-${type}`);

    const label = CONFIG.filterLabels[type][value] || value;
    btn.textContent = label;
    btn.classList.toggle('active', value !== 'All');

    // Update Home button state - active when no filters are applied
    const homeBtn = document.getElementById('btn-home');
    if (homeBtn) {
        const hasActiveFilters = STATE.activeFilters.price !== 'All' || STATE.activeFilters.time !== 'All';
        homeBtn.classList.toggle('active', !hasActiveFilters);
    }
}

function resetFilters() {
    STATE.activeFilters = { price: 'All', time: 'All' };
    ['price', 'time'].forEach(type => updateFilterPillUI(type, 'All'));
    // Ensure Home button is active when all filters are reset
    const homeBtn = document.getElementById('btn-home');
    if (homeBtn) homeBtn.classList.add('active');
}

// Show all mics - reset filters
function showAllMics() {
    resetFilters();
    // Also clear transit mode when going back to Home
    if (STATE.isTransitMode) {
        clearTransitData();
        updateTransitButtonUI(false);
    }
    render(STATE.currentMode);
}

/* =================================================================
   TRANSIT MODE (MVP)
   ================================================================= */

function toggleTransitMode() {
    const btn = document.getElementById('btn-transit');

    if (STATE.isTransitMode) {
        // Turn OFF transit mode
        clearTransitData();
        updateTransitButtonUI(false);
        render(STATE.currentMode);
    } else {
        // Turn ON transit mode - get user location
        btn.textContent = '⏳ Locating...';
        btn.disabled = true;

        if (!navigator.geolocation) {
            alert('Geolocation not supported by your browser');
            btn.textContent = '📍 Transit';
            btn.disabled = false;
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                STATE.userOrigin = { lat: latitude, lng: longitude };
                STATE.isTransitMode = true;

                btn.textContent = '⏳ Calculating...';

                // Calculate transit times
                await calculateTransitTimes(latitude, longitude);

                updateTransitButtonUI(true);
                render(STATE.currentMode);
            },
            (error) => {
                console.error('Geolocation error:', error);
                if (error.code === error.PERMISSION_DENIED) {
                    alert('Location access denied. Please enable location services.');
                } else {
                    alert('Could not get your location. Try again.');
                }
                btn.textContent = '📍 Transit';
                btn.disabled = false;
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }
}

function updateTransitButtonUI(isActive) {
    const btn = document.getElementById('btn-transit');
    btn.disabled = false;
    btn.textContent = isActive ? '✕ Clear' : '📍 Transit';
    btn.classList.toggle('active', isActive);

    // Update Home button
    const homeBtn = document.getElementById('btn-home');
    if (homeBtn) {
        const hasActiveFilters = STATE.activeFilters.price !== 'All' ||
                                 STATE.activeFilters.time !== 'All' ||
                                 STATE.isTransitMode;
        homeBtn.classList.toggle('active', !hasActiveFilters);
    }
}
