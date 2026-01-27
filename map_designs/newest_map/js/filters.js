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

// Cycle through filter states (for Price toggle and mobile borough)
function cycleFilter(type) {
    const cycle = CONFIG.filterCycles[type];
    const currentIndex = cycle.indexOf(STATE.activeFilters[type]);
    const nextIndex = (currentIndex + 1) % cycle.length;
    const newValue = cycle[nextIndex];
    STATE.activeFilters[type] = newValue;
    updateFilterPillUI(type, newValue);
    render(STATE.currentMode);

    // Zoom map when borough filter changes (defer to ensure markers are registered)
    if (type === 'borough') {
        setTimeout(() => {
            if (newValue !== 'All') {
                const bounds = markersGroup.getBounds();
                if (bounds.isValid()) {
                    map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
                }
            } else {
                map.flyTo(CONFIG.mapCenter, CONFIG.mapZoom, { duration: 1.5 });
            }
        }, 0);
    }
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
    const mobileBtn = document.getElementById('mobile-filter-time');
    const chevron = btn?.querySelector('.filter-chevron');
    if (chevron) chevron.style.transform = '';
    popover.classList.remove('active');

    // Accessibility: Update aria-expanded
    if (btn) btn.setAttribute('aria-expanded', 'false');

    // Remove popover-open class from mobile pill
    if (mobileBtn) mobileBtn.classList.remove('popover-open');

    // Only remove listener if it was attached (could be desktop or mobile handler)
    if (popoverListenerAttached) {
        popoverListenerAttached = false;
        document.removeEventListener('click', closeTimePopoverOnOutsideClick);
        document.removeEventListener('click', closeMobileTimePopoverOnOutsideClick);
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
        const popoverWidth = 180; // min-width from CSS
        const viewportWidth = window.innerWidth;
        const padding = 12;

        // Calculate left position, ensuring it doesn't go off-screen
        let leftPos = rect.left;
        if (leftPos + popoverWidth > viewportWidth - padding) {
            leftPos = viewportWidth - popoverWidth - padding;
        }

        popover.style.top = (rect.bottom + 8) + 'px';
        popover.style.left = leftPos + 'px';

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
    const mobileBtn = document.getElementById('mobile-filter-borough');
    const chevron = btn?.querySelector('.filter-chevron');
    if (chevron) chevron.style.transform = '';
    popover.classList.remove('active');

    if (btn) btn.setAttribute('aria-expanded', 'false');

    // Remove popover-open class from mobile pill
    if (mobileBtn) mobileBtn.classList.remove('popover-open');

    if (boroughPopoverListenerAttached) {
        boroughPopoverListenerAttached = false;
        document.removeEventListener('click', closeBoroughPopoverOnOutsideClick);
        document.removeEventListener('click', closeMobileBoroughPopoverOnOutsideClick);
    }
}

function closeBoroughPopoverOnOutsideClick(e) {
    const popover = document.getElementById('borough-popover');
    const btn = document.getElementById('filter-borough');
    const mobileBtn = document.getElementById('mobile-filter-borough');
    if (!popover.contains(e.target) && !btn?.contains(e.target) && !mobileBtn?.contains(e.target)) {
        closeBoroughPopover();
    }
}

/* =================================================================
   PRICE FILTER POPOVER
   ================================================================= */

let pricePopoverListenerAttached = false;

function togglePricePopover() {
    const popover = document.getElementById('price-popover');
    const btn = document.getElementById('filter-price');
    const isOpen = popover.classList.contains('active');

    if (isOpen) {
        closePricePopover();
    } else {
        // Position popover below the button
        const rect = btn.getBoundingClientRect();
        popover.style.top = (rect.bottom + 8) + 'px';
        popover.style.left = rect.left + 'px';

        popover.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');

        // Close on outside click
        if (!pricePopoverListenerAttached) {
            pricePopoverListenerAttached = true;
            document.addEventListener('click', closePricePopoverOnOutsideClick);
        }
    }
}

function closePricePopover() {
    const popover = document.getElementById('price-popover');
    const btn = document.getElementById('filter-price');
    const mobileBtn = document.getElementById('mobile-filter-price');

    popover.classList.remove('active');
    if (btn) btn.setAttribute('aria-expanded', 'false');

    // Remove popover-open class from mobile pill
    if (mobileBtn) mobileBtn.classList.remove('popover-open');

    if (pricePopoverListenerAttached) {
        pricePopoverListenerAttached = false;
        document.removeEventListener('click', closePricePopoverOnOutsideClick);
        document.removeEventListener('click', closeMobilePricePopoverOnOutsideClick);
    }
}

function closePricePopoverOnOutsideClick(e) {
    const popover = document.getElementById('price-popover');
    const btn = document.getElementById('filter-price');
    const mobileBtn = document.getElementById('mobile-filter-price');
    if (!popover.contains(e.target) && !btn?.contains(e.target) && !mobileBtn?.contains(e.target)) {
        closePricePopover();
    }
}

function toggleMobilePricePopover(triggerBtn) {
    const popover = document.getElementById('price-popover');
    const isOpen = popover.classList.contains('active');

    if (isOpen) {
        closePricePopover();
    } else {
        // Position popover below the mobile pill
        const rect = triggerBtn.getBoundingClientRect();
        popover.style.top = (rect.bottom + 8) + 'px';
        popover.style.left = rect.left + 'px';

        popover.classList.add('active');
        triggerBtn.classList.add('popover-open');

        // Close on outside click
        if (!pricePopoverListenerAttached) {
            pricePopoverListenerAttached = true;
            document.addEventListener('click', closeMobilePricePopoverOnOutsideClick);
        }
    }
}

function closeMobilePricePopoverOnOutsideClick(e) {
    const popover = document.getElementById('price-popover');
    const mobileBtn = document.getElementById('mobile-filter-price');
    if (!popover.contains(e.target) && !mobileBtn?.contains(e.target)) {
        closePricePopover();
    }
}

function selectPriceFilter(value) {
    STATE.activeFilters.price = value;

    // Update popover option active states
    const options = document.querySelectorAll('#price-popover .popover-option');
    options.forEach(opt => {
        const isSelected = opt.dataset.value === value;
        opt.classList.toggle('active', isSelected);
        opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    // Update button UI
    updateFilterPillUI('price', value);

    // Close popover and re-render
    closePricePopover();
    render(STATE.currentMode);
}

/* =================================================================
   MOBILE FILTER POPOVERS
   Position popovers relative to mobile pills
   ================================================================= */

function toggleMobileTimePopover(triggerBtn) {
    const popover = document.getElementById('time-popover');
    const isOpen = popover.classList.contains('active');

    if (isOpen) {
        closeTimePopover();
    } else {
        // Position popover below the mobile pill
        const rect = triggerBtn.getBoundingClientRect();
        popover.style.top = (rect.bottom + 8) + 'px';
        popover.style.left = rect.left + 'px';

        popover.classList.add('active');
        triggerBtn.classList.add('popover-open');

        // Close on outside click
        if (!popoverListenerAttached) {
            popoverListenerAttached = true;
            document.addEventListener('click', closeMobileTimePopoverOnOutsideClick);
        }
    }
}

function closeMobileTimePopoverOnOutsideClick(e) {
    const popover = document.getElementById('time-popover');
    const mobileBtn = document.getElementById('mobile-filter-time');
    if (!popover.contains(e.target) && !mobileBtn?.contains(e.target)) {
        closeTimePopover();
    }
}

function toggleMobileBoroughPopover(triggerBtn) {
    const popover = document.getElementById('borough-popover');
    const isOpen = popover.classList.contains('active');

    if (isOpen) {
        closeBoroughPopover();
    } else {
        // Position popover below the mobile pill
        const rect = triggerBtn.getBoundingClientRect();
        const popoverWidth = 180; // min-width from CSS
        const viewportWidth = window.innerWidth;
        const padding = 12;

        // Calculate left position, ensuring it doesn't go off-screen
        let leftPos = rect.left;
        if (leftPos + popoverWidth > viewportWidth - padding) {
            leftPos = viewportWidth - popoverWidth - padding;
        }

        popover.style.top = (rect.bottom + 8) + 'px';
        popover.style.left = leftPos + 'px';

        popover.classList.add('active');
        triggerBtn.classList.add('popover-open');

        // Close on outside click
        if (!boroughPopoverListenerAttached) {
            boroughPopoverListenerAttached = true;
            document.addEventListener('click', closeMobileBoroughPopoverOnOutsideClick);
        }
    }
}

function closeMobileBoroughPopoverOnOutsideClick(e) {
    const popover = document.getElementById('borough-popover');
    const mobileBtn = document.getElementById('mobile-filter-borough');
    if (!popover.contains(e.target) && !mobileBtn?.contains(e.target)) {
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

    // Close popover and re-render first (so we have filtered markers)
    closeBoroughPopover();
    render(STATE.currentMode);

    // Zoom map to fit visible markers (defer to ensure markers are registered)
    setTimeout(() => {
        if (value !== 'All') {
            const bounds = markersGroup.getBounds();
            if (bounds.isValid()) {
                map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
            }
        } else {
            map.flyTo(CONFIG.mapCenter, CONFIG.mapZoom, { duration: 1.5 });
        }
    }, 0);
}

// Select time filter from popover
function selectTimeFilter(value) {
    STATE.activeFilters.time = value;

    // Hide custom inputs when selecting preset
    const customInputs = document.getElementById('custom-time-inputs');
    if (customInputs) customInputs.style.display = 'none';

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

// Show custom time inputs
function showCustomTimeInputs() {
    const customInputs = document.getElementById('custom-time-inputs');
    if (customInputs) {
        customInputs.style.display = customInputs.style.display === 'none' ? 'block' : 'none';
    }

    // Mark custom option as selected
    const options = document.querySelectorAll('#time-popover .popover-option');
    options.forEach(opt => {
        const isSelected = opt.dataset.value === 'custom';
        opt.classList.toggle('active', isSelected);
        opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });
}

// Apply custom time range
function applyCustomTime() {
    const startInput = document.getElementById('custom-time-start');
    const endInput = document.getElementById('custom-time-end');

    if (!startInput || !endInput) return;

    const startHour = parseInt(startInput.value.split(':')[0]);
    const endHour = parseInt(endInput.value.split(':')[0]);

    // Update the custom range in config
    CONFIG.timeRanges.custom = { start: startHour, end: endHour === 0 ? 24 : endHour };

    // Format label for display
    const formatHour = (h) => {
        if (h === 0 || h === 24) return '12am';
        if (h === 12) return '12pm';
        return h > 12 ? `${h - 12}pm` : `${h}am`;
    };
    CONFIG.filterLabels.time.custom = `${formatHour(startHour)}-${formatHour(endHour === 0 ? 24 : endHour)}`;

    // Apply the filter
    STATE.activeFilters.time = 'custom';
    updateFilterPillUI('time', 'custom');
    closeTimePopover();
    render(STATE.currentMode);
}

function updateFilterPillUI(type, value) {
    const btn = document.getElementById(`filter-${type}`);
    const label = CONFIG.filterLabels[type][value] || value;
    const hasFilter = value !== 'All';

    // Update desktop button if exists
    if (btn) {
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
        btn.classList.toggle('active', hasFilter);
    }

    // Update mobile pill if exists
    const mobileBtn = document.getElementById(`mobile-filter-${type}`);
    if (mobileBtn) {
        // Use mobile-specific labels (shorter)
        const mobileLabel = CONFIG.mobileFilterLabels?.[type]?.[value] || label;
        // Check if pill has new structure with .pill-text span
        const pillText = mobileBtn.querySelector('.pill-text');
        if (pillText) {
            pillText.textContent = mobileLabel;
        } else {
            mobileBtn.textContent = mobileLabel;
        }
        // Use both classes for backwards compatibility
        mobileBtn.classList.toggle('active', hasFilter);
        mobileBtn.classList.toggle('has-filter', hasFilter);
    }

    // Update filter icon state - active when any filter is applied
    const filterIcon = document.getElementById('mobile-filter-reset');
    if (filterIcon) {
        const hasActiveFilters = STATE.activeFilters.price !== 'All' ||
                                 STATE.activeFilters.time !== 'All' ||
                                 STATE.activeFilters.commute !== 'All' ||
                                 STATE.activeFilters.borough !== 'All';
        filterIcon.classList.toggle('active', hasActiveFilters);
    }
}

function resetFilters() {
    STATE.activeFilters = { price: 'All', time: 'All', commute: 'All', borough: 'All' };
    ['price', 'time', 'commute', 'borough'].forEach(type => updateFilterPillUI(type, 'All'));

    // Reset price popover option active states
    const priceOptions = document.querySelectorAll('#price-popover .popover-option');
    priceOptions.forEach(opt => {
        opt.classList.toggle('active', opt.dataset.value === 'All');
    });

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
}

/* =================================================================
   SYNC WITH MAP
   Filter list to only show mics visible in current map bounds
   ================================================================= */

function toggleSyncWithMap() {
    STATE.syncWithMap = !STATE.syncWithMap;
    const btn = document.getElementById('btn-sync-map');
    if (btn) {
        btn.classList.toggle('active', STATE.syncWithMap);
        btn.setAttribute('aria-pressed', STATE.syncWithMap);
        // Dismiss tooltip if shown
        const tooltip = btn.querySelector('.tooltip-hint');
        if (tooltip) {
            tooltip.remove();
            localStorage.setItem('micfinder_mapview_hint_seen', 'true');
        }
    }
    render(STATE.currentMode);
}

// Show first-time tooltip for Map view button
function showMapViewHint() {
    if (localStorage.getItem('micfinder_mapview_hint_seen')) return;

    const btn = document.getElementById('btn-sync-map');
    if (!btn || !window.matchMedia('(max-width: 640px)').matches) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-hint';
    tooltip.innerHTML = `
        Only show mics on screen
        <span class="tooltip-hint-dismiss">Tap to dismiss</span>
    `;
    btn.appendChild(tooltip);

    // Dismiss on tap anywhere
    const dismiss = () => {
        tooltip.remove();
        localStorage.setItem('micfinder_mapview_hint_seen', 'true');
        document.removeEventListener('click', dismiss);
    };

    // Delay adding listener to prevent immediate dismiss
    setTimeout(() => document.addEventListener('click', dismiss), 100);

    // Auto-dismiss after 6 seconds
    setTimeout(() => {
        if (tooltip.parentNode) dismiss();
    }, 6000);
}

// Setup map move listener for sync with map
function setupSyncWithMapListener() {
    if (typeof map === 'undefined') return;

    map.on('moveend', () => {
        if (STATE.syncWithMap) {
            render(STATE.currentMode);
        }
    });
}

// Call on init (after map is ready)
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(setupSyncWithMapListener, 100);
});
