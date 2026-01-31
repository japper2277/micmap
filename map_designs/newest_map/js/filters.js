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

// Flash animation for filter buttons + haptic feedback
function flashFilterButton(type) {
    const btn = document.getElementById(`filter-${type}`) ||
                document.getElementById(`mobile-filter-${type}`);
    if (btn) {
        btn.classList.remove('filter-flash');
        void btn.offsetWidth; // Force reflow
        btn.classList.add('filter-flash');
        setTimeout(() => btn.classList.remove('filter-flash'), 300);
    }

    // Haptic feedback on mobile
    if ('vibrate' in navigator) {
        navigator.vibrate(10);
    }
}

// Store previous filter state for undo
let lastFilterState = null;
let undoTimeout = null;

function storeFilterStateForUndo() {
    lastFilterState = { ...STATE.activeFilters };
}

function showUndoToast() {
    if (!lastFilterState || typeof toastService === 'undefined') return;

    // Clear any existing undo timeout
    if (undoTimeout) clearTimeout(undoTimeout);

    toastService.show('Filter applied', 'info', {
        action: {
            label: 'Undo',
            callback: () => {
                if (lastFilterState) {
                    STATE.activeFilters = { ...lastFilterState };
                    updateFilterPillUI('price', STATE.activeFilters.price);
                    updateFilterPillUI('time', STATE.activeFilters.time);
                    updateFilterPillUI('borough', STATE.activeFilters.borough);
                    updateFilterPillUI('commute', STATE.activeFilters.commute);
                    render(STATE.currentMode);
                    lastFilterState = null;
                }
            }
        },
        duration: 4000
    });

    // Clear undo state after timeout
    undoTimeout = setTimeout(() => {
        lastFilterState = null;
    }, 4000);
}

// Cycle through filter states (for Price toggle and mobile borough)
function cycleFilter(type) {
    // Store state for undo before changing
    storeFilterStateForUndo();

    const cycle = CONFIG.filterCycles[type];
    const currentIndex = cycle.indexOf(STATE.activeFilters[type]);
    const nextIndex = (currentIndex + 1) % cycle.length;
    const newValue = cycle[nextIndex];
    STATE.activeFilters[type] = newValue;
    updateFilterPillUI(type, newValue);
    flashFilterButton(type);
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

    if (typeof syncSharedStateFromMicMap === 'function') syncSharedStateFromMicMap();
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

    if (typeof syncSharedStateFromMicMap === 'function') syncSharedStateFromMicMap();
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

    if (typeof syncSharedStateFromMicMap === 'function') syncSharedStateFromMicMap();
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
    flashFilterButton('time');

    // Close popover and re-render
    closeTimePopover();
    render(STATE.currentMode);

    if (typeof syncSharedStateFromMicMap === 'function') syncSharedStateFromMicMap();
}

// Custom time picker state
let customTimePickerState = {
    startHour: 17, // 5pm
    endHour: 21,   // 9pm
    openPicker: null
};

// Format hour for display (12-hour format)
function formatHourDisplay(hour) {
    if (hour === 0 || hour === 24) return '12am';
    if (hour === 12) return '12pm';
    return hour > 12 ? `${hour - 12}pm` : `${hour}am`;
}

// Initialize time picker dropdowns
function initTimePickerDropdowns() {
    const startOptions = document.getElementById('start-time-options');
    const endOptions = document.getElementById('end-time-options');

    if (!startOptions || !endOptions) return;

    // Generate hour options (12pm to 2am next day)
    const hours = [];
    for (let h = 12; h <= 23; h++) hours.push(h);
    hours.push(24); // Midnight
    hours.push(25); // 1am
    hours.push(26); // 2am

    const createOptions = (container, selectedHour, type) => {
        container.innerHTML = hours.map(h => {
            const displayHour = h > 24 ? h - 24 : (h === 24 ? 0 : h);
            const label = formatHourDisplay(displayHour);
            const isSelected = h === selectedHour || (h > 24 && displayHour === selectedHour);
            return `<button class="time-option${isSelected ? ' selected' : ''}" data-hour="${h}" onclick="selectTimeOption('${type}', ${h})">${label}</button>`;
        }).join('');
    };

    createOptions(startOptions, customTimePickerState.startHour, 'start');
    createOptions(endOptions, customTimePickerState.endHour, 'end');

    // Update display values
    document.getElementById('custom-start-value').textContent = formatHourDisplay(customTimePickerState.startHour);
    document.getElementById('custom-end-value').textContent = formatHourDisplay(customTimePickerState.endHour > 24 ? customTimePickerState.endHour - 24 : customTimePickerState.endHour);
}

// Toggle time picker dropdown
function toggleTimePicker(type) {
    const dropdown = document.getElementById(`${type}-time-dropdown`);
    const select = document.getElementById(`custom-${type}-picker`);
    const otherType = type === 'start' ? 'end' : 'start';
    const otherDropdown = document.getElementById(`${otherType}-time-dropdown`);
    const otherSelect = document.getElementById(`custom-${otherType}-picker`);

    // Close other dropdown
    otherDropdown?.classList.remove('open');
    otherSelect?.classList.remove('open');

    // Toggle this dropdown
    const isOpen = dropdown.classList.contains('open');
    dropdown.classList.toggle('open', !isOpen);
    select.classList.toggle('open', !isOpen);
    customTimePickerState.openPicker = isOpen ? null : type;

    // Scroll selected option into view
    if (!isOpen) {
        setTimeout(() => {
            const selected = dropdown.querySelector('.time-option.selected');
            if (selected) {
                selected.scrollIntoView({ block: 'center', behavior: 'instant' });
            }
        }, 50);
    }
}

// Select time option
function selectTimeOption(type, hour) {
    const normalizedHour = hour > 24 ? hour - 24 : hour;

    if (type === 'start') {
        customTimePickerState.startHour = hour;
        document.getElementById('custom-start-value').textContent = formatHourDisplay(normalizedHour);
    } else {
        customTimePickerState.endHour = hour;
        document.getElementById('custom-end-value').textContent = formatHourDisplay(normalizedHour);
    }

    // Update selected state
    const options = document.getElementById(`${type}-time-options`);
    options.querySelectorAll('.time-option').forEach(opt => {
        opt.classList.toggle('selected', parseInt(opt.dataset.hour) === hour);
    });

    // Close dropdown
    document.getElementById(`${type}-time-dropdown`).classList.remove('open');
    document.getElementById(`custom-${type}-picker`).classList.remove('open');
    customTimePickerState.openPicker = null;
}

// Close time picker dropdowns when clicking outside
document.addEventListener('click', (e) => {
    if (!customTimePickerState.openPicker) return;

    const startPicker = document.getElementById('custom-start-picker');
    const endPicker = document.getElementById('custom-end-picker');
    const startDropdown = document.getElementById('start-time-dropdown');
    const endDropdown = document.getElementById('end-time-dropdown');

    const clickedInsidePicker = startPicker?.contains(e.target) ||
                                 endPicker?.contains(e.target) ||
                                 startDropdown?.contains(e.target) ||
                                 endDropdown?.contains(e.target);

    if (!clickedInsidePicker) {
        startDropdown?.classList.remove('open');
        endDropdown?.classList.remove('open');
        startPicker?.classList.remove('open');
        endPicker?.classList.remove('open');
        customTimePickerState.openPicker = null;
    }
});

// Show custom time inputs
function showCustomTimeInputs() {
    const customInputs = document.getElementById('custom-time-inputs');
    if (customInputs) {
        const isShowing = customInputs.style.display !== 'none';
        customInputs.style.display = isShowing ? 'none' : 'block';

        // Initialize dropdowns when showing
        if (!isShowing) {
            initTimePickerDropdowns();
        }
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
    let startHour = customTimePickerState.startHour;
    let endHour = customTimePickerState.endHour;

    // Normalize hours for the filter (handle past-midnight times)
    const normalizedStart = startHour > 24 ? startHour - 24 : startHour;
    const normalizedEnd = endHour > 24 ? endHour - 24 : (endHour === 24 ? 0 : endHour);

    // Update the custom range in config
    CONFIG.timeRanges.custom = {
        start: normalizedStart,
        end: normalizedEnd === 0 ? 24 : normalizedEnd,
        crossesMidnight: endHour > 24 || endHour < startHour
    };

    // Format label for display
    CONFIG.filterLabels.time.custom = `${formatHourDisplay(normalizedStart)}-${formatHourDisplay(normalizedEnd)}`;

    // Apply the filter
    STATE.activeFilters.time = 'custom';
    updateFilterPillUI('time', 'custom');
    flashFilterButton('time');
    closeTimePopover();
    render(STATE.currentMode);

    if (typeof syncSharedStateFromMicMap === 'function') syncSharedStateFromMicMap();
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
        // Reset commute filter when hiding and notify user
        if (!show && STATE.activeFilters.commute !== 'All') {
            const prevFilter = CONFIG.filterLabels.commute[STATE.activeFilters.commute];
            STATE.activeFilters.commute = 'All';
            updateFilterPillUI('commute', 'All');
            // Notify user that filter was reset
            if (typeof toastService !== 'undefined') {
                toastService.show(`Commute filter (${prevFilter}) cleared`, 'info');
            }
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

