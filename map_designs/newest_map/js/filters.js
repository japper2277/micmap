/* =================================================================
   FILTERS
   Filter cycling, UI updates, reset
   ================================================================= */

// Track if popover outside click listener is attached (prevents memory leak)
let popoverListenerAttached = false;
let moreMenuListenerAttached = false;
let boroughPopoverListenerAttached = false;

/* =================================================================
   FILTER ROW ACCESSIBILITY
   Roving tabindex + scroll indicators
   ================================================================= */

// Setup roving tabindex for filter buttons (arrow key navigation)
function setupFilterRovingTabindex() {
    const filterRow = document.getElementById('drawer-filters');
    if (!filterRow) return;

    const getVisibleButtons = () => {
        return Array.from(filterRow.querySelectorAll('.drawer-filter-btn'))
            .filter(btn => btn.style.display !== 'none' && btn.offsetParent !== null);
    };

    // Initialize: only first button is tabbable
    const buttons = getVisibleButtons();
    buttons.forEach((btn, i) => {
        btn.setAttribute('tabindex', i === 0 ? '0' : '-1');
    });

    // Arrow key navigation
    filterRow.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;

        const buttons = getVisibleButtons();
        const currentIndex = buttons.findIndex(btn => btn === document.activeElement);
        if (currentIndex === -1) return;

        let newIndex = currentIndex;

        switch (e.key) {
            case 'ArrowRight':
                newIndex = (currentIndex + 1) % buttons.length;
                break;
            case 'ArrowLeft':
                newIndex = (currentIndex - 1 + buttons.length) % buttons.length;
                break;
            case 'Home':
                newIndex = 0;
                break;
            case 'End':
                newIndex = buttons.length - 1;
                break;
        }

        e.preventDefault();

        // Update tabindex
        buttons[currentIndex].setAttribute('tabindex', '-1');
        buttons[newIndex].setAttribute('tabindex', '0');
        buttons[newIndex].focus();

        // Scroll button into view
        buttons[newIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
}

// Setup scroll indicators for filter row
function setupFilterScrollIndicators() {
    const filterRow = document.getElementById('drawer-filters');
    if (!filterRow) return;

    const updateScrollIndicators = () => {
        const scrollLeft = filterRow.scrollLeft;
        const scrollWidth = filterRow.scrollWidth;
        const clientWidth = filterRow.clientWidth;

        // Show left indicator if scrolled right
        filterRow.classList.toggle('scroll-left', scrollLeft > 5);

        // Show right indicator if more content to scroll
        filterRow.classList.toggle('scroll-right', scrollLeft < scrollWidth - clientWidth - 5);
    };

    // Initial check
    updateScrollIndicators();

    // Update on scroll
    filterRow.addEventListener('scroll', updateScrollIndicators, { passive: true });

    // Update on resize
    window.addEventListener('resize', updateScrollIndicators, { passive: true });
}

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

/* =================================================================
   MORE MENU
   Three-dot menu for settings and other rare actions
   ================================================================= */

function toggleMoreMenu() {
    const popover = document.getElementById('more-popover');
    const btn = document.getElementById('btn-more');
    const isOpen = popover.classList.contains('active');

    if (isOpen) {
        closeMoreMenu();
    } else {
        // Position popover below the button, aligned to right edge
        const rect = btn.getBoundingClientRect();
        popover.style.top = (rect.bottom + 8) + 'px';
        popover.style.right = (window.innerWidth - rect.right) + 'px';
        popover.style.left = 'auto';

        btn.classList.add('active');
        popover.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');

        // Close on outside click
        if (!moreMenuListenerAttached) {
            moreMenuListenerAttached = true;
            setTimeout(() => {
                document.addEventListener('click', closeMoreMenuOnOutsideClick);
            }, 0);
        }
    }
}

function closeMoreMenu() {
    const popover = document.getElementById('more-popover');
    const btn = document.getElementById('btn-more');

    popover.classList.remove('active');
    if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
    }

    if (moreMenuListenerAttached) {
        moreMenuListenerAttached = false;
        document.removeEventListener('click', closeMoreMenuOnOutsideClick);
    }
}

function closeMoreMenuOnOutsideClick(e) {
    const popover = document.getElementById('more-popover');
    const btn = document.getElementById('btn-more');
    if (!popover.contains(e.target) && !btn.contains(e.target)) {
        closeMoreMenu();
    }
}

/* =================================================================
   BOROUGH FILTER POPOVER
   ================================================================= */

function toggleBoroughPopover() {
    const popover = document.getElementById('borough-popover');
    const btn = document.getElementById('filter-borough');
    const chevron = btn.querySelector('.filter-chevron');
    const isOpen = popover.classList.contains('active');

    if (isOpen) {
        closeBoroughPopover();
    } else {
        // Position popover below the button
        const rect = btn.getBoundingClientRect();
        popover.style.top = (rect.bottom + 8) + 'px';
        popover.style.left = rect.left + 'px';

        chevron.style.transform = 'rotate(180deg)';
        popover.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');

        // Close on outside click
        if (!boroughPopoverListenerAttached) {
            boroughPopoverListenerAttached = true;
            document.addEventListener('click', closeBoroughPopoverOnOutsideClick);
        }
    }
}

function closeBoroughPopover() {
    const popover = document.getElementById('borough-popover');
    const btn = document.getElementById('filter-borough');
    const chevron = btn?.querySelector('.filter-chevron');
    if (chevron) chevron.style.transform = '';
    popover.classList.remove('active');

    if (btn) btn.setAttribute('aria-expanded', 'false');

    if (boroughPopoverListenerAttached) {
        boroughPopoverListenerAttached = false;
        document.removeEventListener('click', closeBoroughPopoverOnOutsideClick);
    }
}

function closeBoroughPopoverOnOutsideClick(e) {
    const popover = document.getElementById('borough-popover');
    const btn = document.getElementById('filter-borough');
    if (!popover.contains(e.target) && !btn.contains(e.target)) {
        closeBoroughPopover();
    }
}

function selectBoroughFilter(value) {
    STATE.activeFilters.borough = value;

    // Update popover option active states
    const options = document.querySelectorAll('#borough-popover .popover-option');
    options.forEach(opt => {
        const isSelected = opt.dataset.value === value;
        opt.classList.toggle('active', isSelected);
        opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    // Update button UI
    updateFilterPillUI('borough', value);

    // Zoom map to fit all mics in borough (or reset to default view for "All")
    if (value !== 'All') {
        // Get all mics in this borough
        const boroughMics = STATE.mics.filter(m =>
            (m.borough || '').toLowerCase() === value.toLowerCase()
        );

        if (boroughMics.length > 0) {
            // Calculate bounds from mic locations
            const lats = boroughMics.map(m => m.lat);
            const lngs = boroughMics.map(m => m.lng);
            const bounds = L.latLngBounds(
                [Math.min(...lats), Math.min(...lngs)],
                [Math.max(...lats), Math.max(...lngs)]
            );
            map.fitBounds(bounds, { padding: [50, 50], animate: true });
        }
    } else {
        // Reset to default NYC view
        map.setView(CONFIG.mapCenter, CONFIG.mapZoom, { animate: true });
    }

    // Close popover and re-render
    closeBoroughPopover();
    render(STATE.currentMode);
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
    if (!btn) return;
    const label = CONFIG.filterLabels[type][value] || value;

    if (type === 'time' || type === 'borough') {
        // For filters with chevron, update just the text node (preserve chevron SVG)
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
                                 STATE.activeFilters.commute !== 'All' ||
                                 STATE.activeFilters.borough !== 'All';
        homeBtn.classList.toggle('active', !hasActiveFilters);
    }
}

function resetFilters() {
    STATE.activeFilters = { price: 'All', time: 'All', commute: 'All', borough: 'All' };
    ['price', 'time', 'commute', 'borough'].forEach(type => updateFilterPillUI(type, 'All'));

    // Reset time popover option active states
    const timeOptions = document.querySelectorAll('#time-popover .popover-option');
    timeOptions.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.value === 'All');
    });

    // Reset borough popover option active states
    const boroughOptions = document.querySelectorAll('#borough-popover .popover-option');
    boroughOptions.forEach(opt => {
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
                                 STATE.activeFilters.borough !== 'All' ||
                                 STATE.isTransitMode;
        homeBtn.classList.toggle('active', !hasActiveFilters);
    }
}
