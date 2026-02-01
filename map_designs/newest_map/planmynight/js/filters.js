// Plan My Night - Filter Logic

// --- RADIO PILLS ---
// Default values for each filter (used to determine active state)
const FILTER_DEFAULTS = {
    'priority': 'most_mics',
    'max-commute': '999',
    'time-per-venue': '60'
};

function initRadioPills() {
    document.querySelectorAll('.radio-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const input = pill.querySelector('input');
            if (!input) return;
            haptic('light');
            const group = pill.closest('.radio-pills');
            group.querySelectorAll('.radio-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            input.checked = true;

            // Update parent pill-filter's has-value state
            updatePillFilterActiveState(input);

            setTimeout(updateFilterCountBadge, 10);
        });
    });
}

// Update the pill-filter's has-value class based on selected value
function updatePillFilterActiveState(input) {
    const pillFilter = input.closest('.pill-filter');
    if (!pillFilter) return;

    const inputName = input.name;
    const defaultValue = FILTER_DEFAULTS[inputName];

    if (defaultValue !== undefined) {
        const hasNonDefaultValue = input.value !== defaultValue;
        pillFilter.classList.toggle('has-value', hasNonDefaultValue);
    }
}

// Update all pill-filter active states (call on init)
function updateAllPillFilterStates() {
    Object.keys(FILTER_DEFAULTS).forEach(filterName => {
        const checkedInput = document.querySelector(`input[name="${filterName}"]:checked`);
        if (checkedInput) {
            updatePillFilterActiveState(checkedInput);
        }
    });
}

// --- HIERARCHICAL AREA FILTER ---
function renderNeighborhoods() {
    const row = document.getElementById('neighborhood-row');
    if (!expandedBorough) {
        row.classList.add('hidden');
        row.innerHTML = '';
        return;
    }

    const neighborhoods = BOROUGH_NEIGHBORHOODS[expandedBorough] || [];
    row.innerHTML = neighborhoods.map(n =>
        `<button type="button" class="neighborhood-chip ${selectedAreas.has(n) ? 'selected' : ''}" data-neighborhood="${n}">${n}</button>`
    ).join('');
    row.classList.remove('hidden');

    // Add click handlers
    row.querySelectorAll('.neighborhood-chip').forEach(chip => {
        chip.addEventListener('click', () => toggleNeighborhood(chip.dataset.neighborhood));
    });
}

// Clear all area selections (reset to "All NYC")
function clearAllAreas() {
    haptic('light');
    selectedAreas.clear();
    expandedBorough = null;
    document.querySelectorAll('.borough-chip').forEach(c => {
        c.classList.remove('selected', 'expanded');
        c.setAttribute('aria-expanded', 'false');
        c.setAttribute('aria-pressed', 'false');
    });
    const allChip = document.getElementById('all-areas-chip');
    if (allChip) {
        allChip.classList.add('selected');
        allChip.setAttribute('aria-pressed', 'true');
    }
    document.getElementById('neighborhood-row').classList.add('hidden');
    document.getElementById('neighborhood-row').innerHTML = '';
    updateAreaCheckboxes();
    updateFilterCountBadge();
}

// Update "All NYC" chip state based on selections
function updateAllNycChip() {
    const allChip = document.getElementById('all-areas-chip');
    if (allChip) {
        if (selectedAreas.size === 0) {
            allChip.classList.add('selected');
        } else {
            allChip.classList.remove('selected');
        }
    }
}

function toggleBorough(borough) {
    if (borough === 'all') {
        clearAllAreas();
        return;
    }

    haptic('light');
    const chip = document.querySelector(`.borough-chip[data-borough="${borough}"]`);

    const neighborhoods = BOROUGH_NEIGHBORHOODS[borough] || [];
    const hasNeighborhoodSelected = neighborhoods.some(n => selectedAreas.has(n));
    const isBoroughSelected = selectedAreas.has(borough);
    const isExpanded = expandedBorough === borough;

    // New behavior:
    // - Single click selects the borough AND expands neighborhoods for refinement.
    // - Clicking again (when selected + expanded) clears that borough.
    if (isExpanded && isBoroughSelected && !hasNeighborhoodSelected) {
        // Clear this borough
        selectedAreas.delete(borough);
        neighborhoods.forEach(n => selectedAreas.delete(n));
        chip.classList.remove('selected', 'expanded');
        chip.setAttribute('aria-expanded', 'false');
        chip.setAttribute('aria-pressed', 'false');
        expandedBorough = null;
    } else {
        // Collapse any other expanded borough
        document.querySelectorAll('.borough-chip:not([data-borough="all"])').forEach(c => {
            if (c.dataset.borough !== borough) {
                c.classList.remove('expanded');
                c.setAttribute('aria-expanded', 'false');
            }
        });

        // Select the whole borough by default, and open the neighborhood row
        neighborhoods.forEach(n => selectedAreas.delete(n));
        selectedAreas.add(borough);

        chip.classList.add('selected', 'expanded');
        chip.setAttribute('aria-expanded', 'true');
        chip.setAttribute('aria-pressed', 'true');
        expandedBorough = borough;
    }

    // Update "All NYC" chip aria-pressed based on selection state
    const allChip = document.getElementById('all-areas-chip');
    if (allChip) {
        allChip.setAttribute('aria-pressed', selectedAreas.size === 0 ? 'true' : 'false');
    }

    renderNeighborhoods();
    updateAreaCheckboxes();
    updateAllNycChip();
    updateFilterCountBadge();
}

function toggleNeighborhood(neighborhood) {
    haptic('light');
    if (selectedAreas.has(neighborhood)) {
        selectedAreas.delete(neighborhood);
    } else {
        selectedAreas.add(neighborhood);
        // If selecting a neighborhood, deselect the whole-borough selection
        if (expandedBorough) selectedAreas.delete(expandedBorough);
    }
    renderNeighborhoods();
    updateAreaCheckboxes();
    updateAllNycChip();
    // Update borough chip visual
    const chip = document.querySelector(`.borough-chip[data-borough="${expandedBorough}"]`);
    if (chip) {
        const hasNeighborhoodSelected = BOROUGH_NEIGHBORHOODS[expandedBorough]?.some(n => selectedAreas.has(n));
        chip.classList.toggle('selected', hasNeighborhoodSelected);
    }
    updateFilterCountBadge();
}

function updateAreaCheckboxes() {
    // Create hidden checkboxes for form compatibility
    const container = document.getElementById('area-checkboxes');
    container.innerHTML = [...selectedAreas].map(area =>
        `<input type="checkbox" class="area-checkbox" value="${area}" checked>`
    ).join('');
}

function getSelectedAreas() {
    return [...selectedAreas];
}

// Initialize borough chip click handlers
function initBoroughChips() {
    document.querySelectorAll('.borough-chip').forEach(chip => {
        chip.addEventListener('click', () => toggleBorough(chip.dataset.borough));
    });
}

// --- FILTER COUNT BADGE ---
// Note: resetFiltersAndRetry() and tryDifferentDay() are defined in utils.js
function updateFilterCountBadge() {
    let count = 0;

    // Check priority (default is "most_mics")
    const priority = document.querySelector('input[name="priority"]:checked')?.value;
    if (priority && priority !== 'most_mics') count++;

    // Check areas (default is none = All NYC)
    if (selectedAreas.size > 0) count++;

    // Check anchors
    if (document.getElementById('anchor-start-id')?.value) count++;
    if (document.getElementById('anchor-must-id')?.value) count++;
    if (document.getElementById('anchor-end-id')?.value) count++;

    // Check max commute (default is "999" = Any)
    const maxCommute = document.querySelector('input[name="max-commute"]:checked')?.value;
    if (maxCommute && maxCommute !== '999') count++;

    // Check time per venue (default is "60")
    const timePerVenue = document.querySelector('input[name="time-per-venue"]:checked')?.value;
    if (timePerVenue && timePerVenue !== '60') count++;

    // Update badge
    const badge = document.getElementById('filter-count-badge');
    if (badge) {
        if (count > 0) {
            badge.textContent = count + ' active';
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    // Also update active filter chips
    renderActiveFilterChips();
}

// --- ACTIVE FILTER CHIPS ---
// Configuration for chip display
const CHIP_CONFIG = {
    maxVisibleChips: 4,  // Show this many before collapsing
    expandedState: false // Track if expanded
};

function renderActiveFilterChips() {
    const container = document.getElementById('active-filter-chips');
    if (!container) return;

    const chips = [];

    // Day of week (always show)
    const day = document.getElementById('day-select')?.value;
    if (day) {
        chips.push({
            id: 'day',
            label: day,
            removable: false,
            icon: '📅'
        });
    }

    // Time range - show start to end
    const startTimeEl = document.getElementById('start-time');
    const endTimeEl = document.getElementById('end-time-select');
    if (startTimeEl && startTimeEl.value && endTimeEl && endTimeEl.value) {
        const startTime = formatTimeInput(startTimeEl.value);
        const endTime = formatTimeInput(endTimeEl.value);
        chips.push({
            id: 'time',
            label: `${startTime} - ${endTime}`,
            removable: false,
            icon: '🕐'
        });
    }

    // Price filter
    const price = document.querySelector('input[name="price"]:checked')?.value;
    if (price && price !== 'all') {
        chips.push({
            id: 'price',
            label: price === 'free' ? 'Free Only' : price,
            removable: true,
            onRemove: () => {
                document.querySelector('input[name="price"][value="all"]').click();
            },
            icon: '💵'
        });
    }

    // Areas
    if (selectedAreas.size > 0) {
        const areaList = [...selectedAreas].slice(0, 2).join(', ');
        const extra = selectedAreas.size > 2 ? ` +${selectedAreas.size - 2}` : '';
        const allAreas = [...selectedAreas].join(', ');
        chips.push({
            id: 'areas',
            label: areaList + extra,
            removable: true,
            onRemove: () => clearAllAreas(),
            icon: '📍',
            tooltip: selectedAreas.size > 2 ? allAreas : null
        });
    }

    // Priority
    const priority = document.querySelector('input[name="priority"]:checked')?.value;
    if (priority && priority !== 'most_mics') {
        const priorityLabels = {
            'least_travel': 'Less Travel',
            'best_timing': 'Safer Timing'
        };
        chips.push({
            id: 'priority',
            label: priorityLabels[priority] || priority,
            removable: true,
            onRemove: () => {
                document.querySelector('input[name="priority"][value="most_mics"]').click();
            },
            icon: '⭐'
        });
    }

    // Max commute
    const maxCommute = document.querySelector('input[name="max-commute"]:checked')?.value;
    if (maxCommute && maxCommute !== '999') {
        chips.push({
            id: 'max-commute',
            label: `Max ${maxCommute}m`,
            removable: true,
            onRemove: () => {
                document.querySelector('input[name="max-commute"][value="999"]').click();
            },
            icon: '🚇'
        });
    }

    // Time per venue
    const timePerVenue = document.querySelector('input[name="time-per-venue"]:checked')?.value;
    if (timePerVenue && timePerVenue !== '60') {
        chips.push({
            id: 'time-per-venue',
            label: `${timePerVenue}m/mic`,
            removable: true,
            onRemove: () => {
                document.querySelector('input[name="time-per-venue"][value="60"]').click();
            },
            icon: '⏱️'
        });
    }

    // Render chips
    if (chips.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    // Count removable chips for "Clear All" button
    const removableChips = chips.filter(c => c.removable);
    const hasRemovableFilters = removableChips.length > 0;

    // Determine visible vs collapsed chips
    const visibleChips = CHIP_CONFIG.expandedState ? chips : chips.slice(0, CHIP_CONFIG.maxVisibleChips);
    const hiddenCount = chips.length - visibleChips.length;

    let html = visibleChips.map(chip => `
        <div class="active-chip ${chip.removable ? 'removable' : ''}" data-chip-id="${chip.id}"${chip.tooltip ? ` title="${chip.tooltip}"` : ''}>
            <span class="active-chip-icon">${chip.icon}</span>
            <span class="active-chip-label">${chip.label}</span>
            ${chip.removable ? `
                <button class="active-chip-remove" onclick="removeFilterChip('${chip.id}')" aria-label="Remove ${chip.label} filter">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            ` : ''}
        </div>
    `).join('');

    // Add "+N more" button if there are hidden chips
    if (hiddenCount > 0 && !CHIP_CONFIG.expandedState) {
        html += `
            <button class="active-chip more-chip" onclick="toggleChipsExpanded()" aria-label="Show ${hiddenCount} more filters" aria-expanded="false">
                +${hiddenCount} more
            </button>
        `;
    } else if (CHIP_CONFIG.expandedState && chips.length > CHIP_CONFIG.maxVisibleChips) {
        html += `
            <button class="active-chip more-chip" onclick="toggleChipsExpanded()" aria-label="Show fewer filters" aria-expanded="true">
                Show less
            </button>
        `;
    }

    // Add "Clear All" button if there are removable filters
    if (hasRemovableFilters) {
        html += `
            <button class="active-chip clear-all-chip" onclick="clearAllFilters()" aria-label="Clear all ${removableChips.length} active filters">
                Clear All
            </button>
        `;
    }

    container.innerHTML = html;
}

// Toggle expanded state for chips
function toggleChipsExpanded() {
    CHIP_CONFIG.expandedState = !CHIP_CONFIG.expandedState;
    renderActiveFilterChips();
}

// Clear all removable filters
function clearAllFilters() {
    haptic('light');

    // Reset price to "all"
    const priceAll = document.querySelector('input[name="price"][value="all"]');
    if (priceAll) priceAll.click();

    // Clear areas
    clearAllAreas();

    // Reset priority to "most_mics"
    const priorityDefault = document.querySelector('input[name="priority"][value="most_mics"]');
    if (priorityDefault) priorityDefault.click();

    // Reset max commute to "999" (Any)
    const commuteDefault = document.querySelector('input[name="max-commute"][value="999"]');
    if (commuteDefault) commuteDefault.click();

    // Reset time per venue to "60"
    const timeDefault = document.querySelector('input[name="time-per-venue"][value="60"]');
    if (timeDefault) timeDefault.click();

    // Collapse expanded state
    CHIP_CONFIG.expandedState = false;

    // Update pill filter active states
    updateAllPillFilterStates();

    // Update UI
    updateFilterCountBadge();
}

// Helper to format time input
function formatTimeInput(timeStr) {
    const [hours, mins] = timeStr.split(':').map(Number);
    const ampm = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${mins.toString().padStart(2, '0')}${ampm}`;
}

// Remove a filter chip by ID
function removeFilterChip(chipId) {
    haptic('light');
    const chipRemoveHandlers = {
        'price': () => document.querySelector('input[name="price"][value="all"]').click(),
        'areas': () => clearAllAreas(),
        'priority': () => document.querySelector('input[name="priority"][value="most_mics"]').click(),
        'max-commute': () => document.querySelector('input[name="max-commute"][value="999"]').click(),
        'time-per-venue': () => document.querySelector('input[name="time-per-venue"][value="60"]').click()
    };

    if (chipRemoveHandlers[chipId]) {
        chipRemoveHandlers[chipId]();
    }
}

// =================================================================
// FORM FILTER PILLS (PRICE, TIME, BOROUGH, COMMUTE)
// =================================================================

// Update mic count in header based on current day and filters
function updateFormMicCount() {
    const countEl = document.getElementById('form-mic-count');
    const headerCountEl = document.getElementById('header-mic-count');
    if (!countEl && !headerCountEl) return;

    // Get current day
    const daySelect = document.getElementById('day-select');
    const selectedDay = daySelect?.value || 'Monday';

    // Filter mics for current day
    if (typeof allMics !== 'undefined' && allMics.length > 0) {
        let filtered = allMics.filter(mic => mic.day === selectedDay);

        // Apply form filter state - price
        if (formFilterState.price === 'free') {
            filtered = filtered.filter(mic =>
                mic.cost === 'Free' || mic.cost === '$0' || !mic.cost
            );
        }

        // Apply borough filter
        if (formFilterState.borough && formFilterState.borough !== 'all') {
            filtered = filtered.filter(mic => mic.borough === formFilterState.borough);
        }

        // Apply neighborhood filter
        if (formFilterState.neighborhood) {
            filtered = filtered.filter(mic => mic.neighborhood === formFilterState.neighborhood);
        }

        if (countEl) countEl.textContent = filtered.length;
        if (headerCountEl) headerCountEl.textContent = filtered.length;
    } else {
        if (countEl) countEl.textContent = '--';
        if (headerCountEl) headerCountEl.textContent = '--';
    }
}

// Update calendar text to show selected day
function updateFormCalendarText() {
    const calText = document.getElementById('form-cal-text');
    const daySelect = document.getElementById('day-select');
    if (!calText || !daySelect) return;

    const day = daySelect.value;
    const today = new Date();
    const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(day);
    const todayIndex = today.getDay();

    // Calculate date for selected day
    let diff = dayIndex - todayIndex;
    if (diff < 0) diff += 7;
    const selectedDate = new Date(today);
    selectedDate.setDate(today.getDate() + diff);

    const dayAbbrev = day.slice(0, 3);
    const dateNum = selectedDate.getDate();
    calText.textContent = `${dayAbbrev} ${dateNum}`;
}

// Toggle day popover
function toggleFormDayPopover() {
    haptic('light');
    const popover = document.getElementById('form-day-popover');
    const btn = document.getElementById('form-calendar-btn');
    const isOpen = !popover.classList.contains('hidden');

    // Close other popovers
    closeAllFormPopovers();

    if (!isOpen) {
        popover.classList.remove('hidden');
        btn.classList.add('active');

        // Mark current day as active
        const daySelect = document.getElementById('day-select');
        const currentDay = daySelect?.value;
        document.querySelectorAll('.day-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.day === currentDay);
        });
    } else {
        popover.classList.add('hidden');
        btn.classList.remove('active');
    }
}

// Select a day from popover
function selectFormDay(day) {
    haptic('light');

    // Update hidden select
    const daySelect = document.getElementById('day-select');
    if (daySelect) {
        daySelect.value = day;
        daySelect.dispatchEvent(new Event('change'));
    }

    // Update active state
    document.querySelectorAll('.day-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.day === day);
    });

    // Close popover
    const popover = document.getElementById('form-day-popover');
    const btn = document.getElementById('form-calendar-btn');
    popover.classList.add('hidden');
    btn.classList.remove('active');

    // Update calendar text and mic count
    updateFormCalendarText();
    updateFormMicCount();
}

// State for form filters
const formFilterState = {
    price: 'all',        // 'all' | 'free'
    time: 'all',         // 'all' | 'afternoon' | 'evening' | 'latenight' | 'custom'
    borough: 'all',      // 'all' | 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx'
    neighborhood: null,  // null or specific neighborhood name
    commute: 'all'       // 'all' | '20' | '40' | '60'
};

// Price cycles: All -> Free -> All
function cycleFormFilter(filterType) {
    haptic('light');
    const pill = document.getElementById(`form-filter-${filterType}`);

    if (filterType === 'price') {
        formFilterState.price = formFilterState.price === 'all' ? 'free' : 'all';
        pill.querySelector('.pill-text').textContent = formFilterState.price === 'all' ? 'PRICE' : 'FREE';
        pill.classList.toggle('has-filter', formFilterState.price !== 'all');

        // Sync with existing price radio
        const priceRadio = document.querySelector(`input[name="price"][value="${formFilterState.price}"]`);
        if (priceRadio) priceRadio.click();
    }
    else if (filterType === 'commute') {
        const commuteCycles = ['all', '20', '40', '60'];
        const currentIdx = commuteCycles.indexOf(formFilterState.commute);
        formFilterState.commute = commuteCycles[(currentIdx + 1) % commuteCycles.length];

        const labels = { 'all': 'COMMUTE', '20': '20 MIN', '40': '40 MIN', '60': '60 MIN' };
        pill.querySelector('.pill-text').textContent = labels[formFilterState.commute];
        pill.classList.toggle('has-filter', formFilterState.commute !== 'all');

        // Sync with existing commute radio
        const commuteValue = formFilterState.commute === 'all' ? '999' : formFilterState.commute;
        const commuteRadio = document.querySelector(`input[name="max-commute"][value="${commuteValue}"]`);
        if (commuteRadio) commuteRadio.click();
    }

    updateFilterCountBadge();
    updateFormMicCount();
}

// Time popover
function toggleFormTimePopover(btn) {
    haptic('light');
    const popover = document.getElementById('form-time-popover');
    const isOpen = !popover.classList.contains('hidden');

    closeAllFormPopovers();

    if (!isOpen) {
        popover.classList.remove('hidden');
        btn.classList.add('popover-open');
        btn.setAttribute('aria-expanded', 'true');
    }
}

function selectFormTimeFilter(value) {
    haptic('light');
    formFilterState.time = value;

    const pill = document.getElementById('form-filter-time');
    const labels = { 'all': 'TIME', 'afternoon': 'AFTERNOON', 'evening': 'EVENING', 'latenight': 'LATE NIGHT' };
    pill.querySelector('.pill-text').textContent = labels[value];
    pill.classList.toggle('has-filter', value !== 'all');

    // Update popover active state
    document.querySelectorAll('#form-time-popover .popover-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.value === value);
    });

    closeAllFormPopovers();
    updateFilterCountBadge();
    updateFormMicCount();

    // Apply time filter to start-time input if needed
    if (value !== 'all') {
        const timeRanges = { 'afternoon': '14:00', 'evening': '19:00', 'latenight': '21:00' };
        const startTimeInput = document.getElementById('start-time');
        if (startTimeInput && timeRanges[value]) {
            startTimeInput.value = timeRanges[value];
        }
    }
}

// Borough popover
function toggleFormBoroughPopover(btn) {
    haptic('light');
    const popover = document.getElementById('form-borough-popover');
    const isOpen = !popover.classList.contains('hidden');

    closeAllFormPopovers();

    if (!isOpen) {
        popover.classList.remove('hidden');
        btn.classList.add('popover-open');
        btn.setAttribute('aria-expanded', 'true');
    }
}

function selectFormBoroughFilter(value) {
    haptic('light');
    formFilterState.borough = value;
    formFilterState.neighborhood = null;

    const pill = document.getElementById('form-filter-borough');
    const labels = { 'all': 'BOROUGH', 'Manhattan': 'MANHATTAN', 'Brooklyn': 'BROOKLYN', 'Queens': 'QUEENS', 'Bronx': 'BRONX' };
    pill.querySelector('.pill-text').textContent = labels[value] || value.toUpperCase();
    pill.classList.toggle('has-filter', value !== 'all');

    // Update popover active state - clear all first
    document.querySelectorAll('#form-borough-popover .popover-option[data-value]').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.value === value);
    });
    document.querySelectorAll('#form-borough-popover .borough-header').forEach(h => {
        h.classList.remove('selected');
    });
    document.querySelectorAll('#form-borough-popover .neighborhood-option').forEach(n => {
        n.classList.remove('selected');
    });

    closeAllFormPopovers();
    updateFilterCountBadge();
    updateFormMicCount();
}

// Toggle borough section to show/hide neighborhoods
function toggleBoroughSection(borough) {
    haptic('light');
    const header = document.querySelector(`.borough-header[data-borough="${borough}"]`);
    const grid = document.getElementById(`neighborhoods-${borough}`);
    const expandBtn = header ? header.querySelector('.borough-expand') : null;
    if (!header || !grid) return;

    // Close other borough sections
    document.querySelectorAll('.borough-header').forEach(h => {
        if (h.dataset.borough !== borough) {
            h.classList.remove('expanded');
            const otherExpandBtn = h.querySelector('.borough-expand');
            if (otherExpandBtn) otherExpandBtn.setAttribute('aria-expanded', 'false');
            const otherGrid = document.getElementById(`neighborhoods-${h.dataset.borough}`);
            if (otherGrid) otherGrid.classList.add('hidden');
        }
    });

    // Toggle this section
    const isExpanded = header.classList.contains('expanded');
    if (isExpanded) {
        // Collapse - select the whole borough
        header.classList.remove('expanded');
        if (expandBtn) expandBtn.setAttribute('aria-expanded', 'false');
        grid.classList.add('hidden');

        // Select borough
        formFilterState.borough = borough;
        formFilterState.neighborhood = null;

        const pill = document.getElementById('form-filter-borough');
        pill.querySelector('.pill-text').textContent = borough.toUpperCase();
        pill.classList.add('has-filter');

        // Update visual state
        document.querySelectorAll('#form-borough-popover .popover-option[data-value]').forEach(opt => {
            opt.classList.remove('active');
        });
        header.classList.add('selected');
        document.querySelectorAll('.neighborhood-option').forEach(n => n.classList.remove('selected'));

        closeAllFormPopovers();
        updateFilterCountBadge();
        updateFormMicCount();
    } else {
        // Expand to show neighborhoods
        header.classList.add('expanded');
        if (expandBtn) expandBtn.setAttribute('aria-expanded', 'true');
        grid.classList.remove('hidden');
    }
}

// Back-compat for older markup
function toggleBoroughNeighborhoods(borough) {
    toggleBoroughSection(borough);
}

// Select a specific neighborhood
function selectFormNeighborhood(borough, neighborhood) {
    haptic('light');
    formFilterState.borough = borough;
    formFilterState.neighborhood = neighborhood;

    const pill = document.getElementById('form-filter-borough');
    pill.querySelector('.pill-text').textContent = neighborhood.toUpperCase();
    pill.classList.add('has-filter');

    // Update visual state
    document.querySelectorAll('#form-borough-popover .popover-option[data-value]').forEach(opt => {
        opt.classList.remove('active');
    });
    document.querySelectorAll('.borough-header').forEach(h => h.classList.remove('selected'));
    document.querySelectorAll('.neighborhood-option').forEach(n => {
        n.classList.toggle('selected', n.textContent === neighborhood);
    });

    closeAllFormPopovers();
    updateFilterCountBadge();
    updateFormMicCount();
}

function closeAllFormPopovers() {
    document.querySelectorAll('.form-filter-popover').forEach(p => p.classList.add('hidden'));
    document.querySelectorAll('.form-filter-pill').forEach(p => {
        p.classList.remove('popover-open');
        p.setAttribute('aria-expanded', 'false');
    });

    // Also close day popover
    const dayPopover = document.getElementById('form-day-popover');
    const calBtn = document.getElementById('form-calendar-btn');
    if (dayPopover) dayPopover.classList.add('hidden');
    if (calBtn) calBtn.classList.remove('active');
}

// Apply custom time range
function applyCustomTime() {
    haptic('light');
    const startInput = document.getElementById('custom-start-time');
    const endInput = document.getElementById('custom-end-time');

    if (!startInput.value || !endInput.value) return;

    formFilterState.time = 'custom';
    formFilterState.customStart = startInput.value;
    formFilterState.customEnd = endInput.value;

    // Format for display (e.g., "7pm-11pm")
    const formatTime = (timeStr) => {
        const [hours, mins] = timeStr.split(':').map(Number);
        const ampm = hours >= 12 ? 'pm' : 'am';
        const hour12 = hours % 12 || 12;
        return mins === 0 ? `${hour12}${ampm}` : `${hour12}:${mins.toString().padStart(2, '0')}${ampm}`;
    };

    const startFormatted = formatTime(startInput.value);
    const endFormatted = formatTime(endInput.value);

    const pill = document.getElementById('form-filter-time');
    pill.querySelector('.pill-text').textContent = `${startFormatted}-${endFormatted}`.toUpperCase();
    pill.classList.add('has-filter');

    // Clear preset active states
    document.querySelectorAll('#form-time-popover .popover-option[data-value]').forEach(opt => {
        opt.classList.remove('active');
    });

    closeAllFormPopovers();
    updateFilterCountBadge();

    // Sync with form start time
    const formStartTime = document.getElementById('start-time');
    if (formStartTime) {
        formStartTime.value = startInput.value;
    }
}

// Close popovers when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.form-filter-pill') &&
        !e.target.closest('.form-filter-popover') &&
        !e.target.closest('.calendar-pill-btn') &&
        !e.target.closest('.form-day-popover')) {
        closeAllFormPopovers();
    }
});
