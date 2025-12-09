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
   TRANSIT MODE
   Transit mode now activates from search, not a button
   ================================================================= */

function updateTransitButtonUI(isActive) {
    // Transit button removed - transit mode now activates from search
    // Just update Home button state
    const homeBtn = document.getElementById('btn-home');
    if (homeBtn) {
        const hasActiveFilters = STATE.activeFilters.price !== 'All' ||
                                 STATE.activeFilters.time !== 'All' ||
                                 STATE.isTransitMode;
        homeBtn.classList.toggle('active', !hasActiveFilters);
    }
}
