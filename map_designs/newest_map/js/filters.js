/* =================================================================
   FILTERS
   Filter cycling, UI updates, reset
   ================================================================= */

// Track if popover outside click listener is attached (prevents memory leak)
let popoverListenerAttached = false;

// Cycle through filter states (for Price toggle)
function cycleFilter(type) {
    const cycle = CONFIG.filterCycles[type];
    const currentIndex = cycle.indexOf(STATE.activeFilters[type]);
    const nextIndex = (currentIndex + 1) % cycle.length;
    STATE.activeFilters[type] = cycle[nextIndex];
    updateFilterPillUI(type, STATE.activeFilters[type]);
    render(STATE.currentMode);
}

// Toggle time filter popover
function toggleTimePopover() {
    const popover = document.getElementById('time-popover');
    const btn = document.getElementById('filter-time');
    const chevron = btn.querySelector('.filter-chevron');
    const isOpen = popover.classList.contains('active');

    if (isOpen) {
        closeTimePopover();
    } else {
        // Position popover below the button
        const rect = btn.getBoundingClientRect();
        popover.style.top = (rect.bottom + 8) + 'px';
        popover.style.left = rect.left + 'px';

        chevron.style.transform = 'rotate(180deg)';
        popover.classList.add('active');

        // Accessibility: Update aria-expanded
        btn.setAttribute('aria-expanded', 'true');

        // Close on outside click - only add listener if not already attached
        if (!popoverListenerAttached) {
            popoverListenerAttached = true;
            document.addEventListener('click', closeTimePopoverOnOutsideClick);
        }
    }
}

function closeTimePopover() {
    const popover = document.getElementById('time-popover');
    const btn = document.getElementById('filter-time');
    const chevron = btn?.querySelector('.filter-chevron');
    if (chevron) chevron.style.transform = '';
    popover.classList.remove('active');

    // Accessibility: Update aria-expanded
    if (btn) btn.setAttribute('aria-expanded', 'false');

    // Only remove listener if it was attached
    if (popoverListenerAttached) {
        popoverListenerAttached = false;
        document.removeEventListener('click', closeTimePopoverOnOutsideClick);
    }
}

function closeTimePopoverOnOutsideClick(e) {
    const popover = document.getElementById('time-popover');
    const btn = document.getElementById('filter-time');
    if (!popover.contains(e.target) && !btn.contains(e.target)) {
        closeTimePopover();
    }
}

// Select time filter from popover
function selectTimeFilter(value) {
    STATE.activeFilters.time = value;

    // Update popover option active states and aria-selected
    const options = document.querySelectorAll('#time-popover .popover-option');
    options.forEach(opt => {
        const isSelected = opt.dataset.value === value;
        opt.classList.toggle('active', isSelected);
        opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    // Update button UI
    updateFilterPillUI('time', value);

    // Close popover and re-render
    closeTimePopover();
    render(STATE.currentMode);
}

function updateFilterPillUI(type, value) {
    const btn = document.getElementById(`filter-${type}`);
    const label = CONFIG.filterLabels[type][value] || value;

    if (type === 'time') {
        // For time filter, update just the text node (preserve chevron SVG)
        const textNode = btn.childNodes[0];
        if (textNode.nodeType === Node.TEXT_NODE) {
            textNode.textContent = label + ' ';
        } else {
            btn.firstChild.textContent = label + ' ';
        }
    } else {
        btn.textContent = label;
    }

    btn.classList.toggle('active', value !== 'All');

    // Update Home button state - active when no filters are applied
    const homeBtn = document.getElementById('btn-home');
    if (homeBtn) {
        const hasActiveFilters = STATE.activeFilters.price !== 'All' ||
                                 STATE.activeFilters.time !== 'All' ||
                                 STATE.activeFilters.commute !== 'All';
        homeBtn.classList.toggle('active', !hasActiveFilters);
    }
}

function resetFilters() {
    STATE.activeFilters = { price: 'All', time: 'All', commute: 'All' };
    ['price', 'time', 'commute'].forEach(type => updateFilterPillUI(type, 'All'));

    // Reset time popover option active states
    const options = document.querySelectorAll('#time-popover .popover-option');
    options.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.value === 'All');
    });

    // Ensure Home button is active when all filters are reset
    const homeBtn = document.getElementById('btn-home');
    if (homeBtn) homeBtn.classList.add('active');
}

// Show/hide commute filter based on transit mode
function updateCommuteFilterVisibility(show) {
    const commuteBtn = document.getElementById('filter-commute');
    if (commuteBtn) {
        commuteBtn.style.display = show ? '' : 'none';
        // Reset commute filter when hiding
        if (!show && STATE.activeFilters.commute !== 'All') {
            STATE.activeFilters.commute = 'All';
            updateFilterPillUI('commute', 'All');
        }
    }
}

// Show all mics - reset filters
function showAllMics() {
    resetFilters();
    // Also clear transit mode when going back to Home
    if (STATE.isTransitMode) {
        transitService.clearTransitMode();
        updateTransitButtonUI(false);
    }
    render(STATE.currentMode);
}

/* =================================================================
   TRANSIT MODE
   Transit mode now activates from search, not a button
   ================================================================= */

function updateTransitButtonUI(isActive) {
    // Show/hide commute filter based on transit mode
    updateCommuteFilterVisibility(isActive);

    // Update Home button state
    const homeBtn = document.getElementById('btn-home');
    if (homeBtn) {
        const hasActiveFilters = STATE.activeFilters.price !== 'All' ||
                                 STATE.activeFilters.time !== 'All' ||
                                 STATE.activeFilters.commute !== 'All' ||
                                 STATE.isTransitMode;
        homeBtn.classList.toggle('active', !hasActiveFilters);
    }
}
