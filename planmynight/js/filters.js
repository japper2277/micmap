// Plan My Night - Filter Logic

// --- RADIO PILLS ---
function initRadioPills() {
    document.querySelectorAll('.radio-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            haptic('light');
            const group = pill.closest('.radio-pills');
            group.querySelectorAll('.radio-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            pill.querySelector('input').checked = true;
            setTimeout(updateFilterCountBadge, 10);
        });
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
    haptic('light');
    const chip = document.querySelector(`.borough-chip[data-borough="${borough}"]`);

    if (selectedAreas.has(borough)) {
        // Deselect borough and all its neighborhoods
        selectedAreas.delete(borough);
        BOROUGH_NEIGHBORHOODS[borough]?.forEach(n => selectedAreas.delete(n));
        chip.classList.remove('selected', 'expanded');
        chip.setAttribute('aria-expanded', 'false');
        chip.setAttribute('aria-pressed', 'false');
        if (expandedBorough === borough) expandedBorough = null;
    } else if (expandedBorough === borough) {
        // Clicking expanded borough selects whole borough
        selectedAreas.add(borough);
        BOROUGH_NEIGHBORHOODS[borough]?.forEach(n => selectedAreas.delete(n)); // Clear individual neighborhoods
        chip.classList.add('selected');
        chip.classList.remove('expanded');
        chip.setAttribute('aria-expanded', 'false');
        chip.setAttribute('aria-pressed', 'true');
        expandedBorough = null;
    } else {
        // Expand to show neighborhoods
        document.querySelectorAll('.borough-chip:not([data-borough="all"])').forEach(c => {
            c.classList.remove('expanded');
            c.setAttribute('aria-expanded', 'false');
        });
        chip.classList.add('expanded');
        chip.setAttribute('aria-expanded', 'true');
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

// --- NO RESULTS RECOVERY ACTIONS ---
function resetFiltersAndRetry() {
    haptic('medium');
    // Reset all filter pills to "All"
    document.querySelectorAll('.radio-pills').forEach(group => {
        const allPill = group.querySelector('[data-value="all"], [data-value="All"]') ||
            group.querySelector('.radio-pill:first-child');
        if (allPill) {
            group.querySelectorAll('.radio-pill').forEach(p => p.classList.remove('active'));
            allPill.classList.add('active');
        }
    });

    // Clear borough selections
    selectedAreas.clear();
    expandedBorough = null;
    document.querySelectorAll('.borough-chip').forEach(c => c.classList.remove('selected', 'expanded'));
    document.getElementById('neighborhood-row').classList.add('hidden');

    // Hide no results
    document.getElementById('no-results').classList.add('hidden');

    showToast('Filters reset! Try searching again', 'success');
}

function tryDifferentDay() {
    haptic('light');
    const daySelect = document.getElementById('day-select');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = daySelect.value;
    const currentIndex = days.indexOf(currentDay);
    const nextIndex = (currentIndex + 1) % 7;

    daySelect.value = days[nextIndex];

    // Hide no results
    document.getElementById('no-results').classList.add('hidden');

    showToast(`Switched to ${days[nextIndex]}`, 'success');

    // Auto-trigger search if origin is set
    if (selectedOrigin) {
        document.getElementById('find-btn')?.click();
    }
}

// --- FILTER COUNT BADGE ---
function updateFilterCountBadge() {
    let count = 0;

    // Check priority (default is "most_mics")
    const priority = document.querySelector('input[name="priority"]:checked')?.value;
    if (priority && priority !== 'most_mics') count++;

    // Check areas (default is none = All NYC)
    if (selectedAreas.size > 0) count++;

    // Check price (default is "all")
    const price = document.querySelector('input[name="price"]:checked')?.value;
    if (price && price !== 'all') count++;

    // Check signup (default is "all")
    const signup = document.querySelector('input[name="signup"]:checked')?.value;
    if (signup && signup !== 'all') count++;

    // Check anchors
    if (document.getElementById('anchor-start-id')?.value) count++;
    if (document.getElementById('anchor-must-id')?.value) count++;
    if (document.getElementById('anchor-end-id')?.value) count++;

    // Check mic count (default is "flexible")
    const micCount = document.querySelector('input[name="mic-count"]:checked')?.value;
    if (micCount && micCount !== 'flexible') count++;

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
}
