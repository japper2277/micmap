// Plan My Night - Application Initialization

// ============================================================
// PRIORITY 1: Real-Time Filtering
// ============================================================

// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Update results preview in real-time (called on every filter change)
function updateResultsPreview() {
    if (!allMics || allMics.length === 0) return;

    const filterState = getCurrentFilterState();

    // Skip if nothing changed
    if (!hasFilterStateChanged(filterState)) {
        if (typeof savePlannerPrefs === 'function') {
            savePlannerPrefs();
        }
        return;
    }

    // Show loading state
    const preview = document.getElementById('filter-preview');
    if (preview) {
        preview.classList.add('loading');
    }

    // Update state
    PlannerState.setLastFilterState(filterState);

    // Filter mics
    const filtered = filterMics(allMics, filterState);
    PlannerState.setFilteredMics(filtered);

    // Build hour buckets for the selected day
    PlannerState.buildHourBuckets(allMics, filterState.day);

    // Update preview UI (slight delay to show loading state)
    requestAnimationFrame(() => {
        renderFilterPreview(filtered, filterState);
        if (preview) {
            preview.classList.remove('loading');
        }
        if (typeof savePlannerPrefs === 'function') {
            savePlannerPrefs();
        }
    });
}

// ============================================================
// Preference persistence (faster repeat use)
// ============================================================
const PLAN_PREFS_KEY = 'planMyNightPrefsV1';
const MICMAP_SHARED_KEY = 'micmap.shared.v1';

const MICMAP_SHARED_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function safeJsonParse(raw) {
    try {
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function getSharedUpdatedAt(shared) {
    if (!shared || typeof shared !== 'object') return null;
    if (Number.isFinite(shared.updatedAt)) return shared.updatedAt;
    if (Number.isFinite(shared.origin?.updatedAt)) return shared.origin.updatedAt;
    if (Number.isFinite(shared.lastSearch?.updatedAt)) return shared.lastSearch.updatedAt;
    return null;
}

function loadMicMapSharedState() {
    try {
        const raw = localStorage.getItem(MICMAP_SHARED_KEY);
        if (!raw) return null;
        const shared = safeJsonParse(raw);
        if (!shared || typeof shared !== 'object') return null;

        const updatedAt = getSharedUpdatedAt(shared);
        if (updatedAt && Date.now() - updatedAt > MICMAP_SHARED_MAX_AGE_MS) return null;

        return shared;
    } catch (_) {
        return null;
    }
}

function getPlannerSelectedMicIds() {
    const ids = [
        document.getElementById('anchor-start-id')?.value,
        document.getElementById('anchor-must-id')?.value,
        document.getElementById('anchor-end-id')?.value
    ].filter(Boolean);

    return [...new Set(ids.map(String))];
}

function getPlannerLastSearch() {
    try {
        const recents = safeJsonParse(localStorage.getItem('recentSearches') || '[]');
        if (!Array.isArray(recents) || recents.length === 0) return null;
        const mostRecent = recents[0];
        if (!mostRecent || typeof mostRecent !== 'object') return null;
        if (!mostRecent.name) return null;
        return { query: String(mostRecent.name), updatedAt: Date.now() };
    } catch (_) {
        return null;
    }
}

function saveMicMapSharedState(patch) {
    try {
        const prev = loadMicMapSharedState() || {};

        const next = {
            ...prev,
            ...patch,
            origin: patch.origin !== undefined ? patch.origin : prev.origin,
            lastSearch: patch.lastSearch !== undefined ? patch.lastSearch : prev.lastSearch,
            lastFilters: { ...(prev.lastFilters || {}), ...(patch.lastFilters || {}) },
            favorites: Array.isArray(patch.favorites) ? patch.favorites : (prev.favorites || []),
            selectedMicIds: Array.isArray(patch.selectedMicIds) ? patch.selectedMicIds : (prev.selectedMicIds || []),
            source: patch.source || prev.source || 'planmynight',
            updatedAt: Date.now()
        };

        localStorage.setItem(MICMAP_SHARED_KEY, JSON.stringify(next));
    } catch (_) {
        // ignore
    }
}

function syncMicMapSharedStateFromPlannerPrefs(prefs) {
    if (!prefs) return;

    const now = Date.now();
    const selectedMicIds = getPlannerSelectedMicIds();
    const lastSearch = getPlannerLastSearch();
    const origin = prefs.origin && prefs.origin.lat && prefs.origin.lng
        ? { lat: prefs.origin.lat, lng: prefs.origin.lng, name: prefs.origin.name || 'Saved Location', updatedAt: now }
        : null;

    saveMicMapSharedState({
        source: 'planmynight',
        origin,
        lastSearch,
        selectedMicIds,
        favorites: selectedMicIds,
        lastFilters: {
            day: prefs.day,
            startTime: prefs.startTime,
            duration: prefs.duration,
            goal: prefs.goal,
            stops: prefs.stops,
            priority: prefs.priority,
            price: prefs.price,
            signup: prefs.signup,
            maxCommute: prefs.maxCommute,
            timePerVenue: prefs.timePerVenue,
            maxWalk: prefs.maxWalk,
            transitAccuracy: prefs.transitAccuracy,
            altsPerStop: prefs.altsPerStop,
            areas: prefs.areas
        }
    });
}

function applyMicMapSharedStateToUI(shared) {
    const applied = { day: false, startTime: false, duration: false, origin: false, price: false, time: false, borough: false, commute: false };
    if (!shared || typeof shared !== 'object') return applied;

    const lastFilters = shared.lastFilters || {};

    const normalizePrice = (value) => {
        if (!value) return null;
        if (value === 'Free' || value === 'free') return 'free';
        if (value === 'All' || value === 'all' || value === 'Paid' || value === 'paid') return 'all';
        return null;
    };

    const normalizeTime = (value) => {
        if (!value) return null;
        if (value === 'All' || value === 'all') return 'all';
        if (value === 'custom') return 'all';
        if (['afternoon', 'evening', 'latenight'].includes(value)) return value;
        return null;
    };

    const normalizeBorough = (value) => {
        if (!value) return null;
        if (value === 'All' || value === 'all') return 'all';
        if (['Manhattan', 'Brooklyn', 'Queens', 'Bronx'].includes(value)) return value;
        return null;
    };

    const normalizeCommute = (value) => {
        if (value === undefined || value === null || value === '') return null;
        if (value === 'All' || value === 'all') return 'all';
        const n = Number(value);
        if (Number.isFinite(n)) {
            if (n <= 15) return '20';
            if (n <= 30) return '40';
            return '60';
        }
        if (['20', '40', '60'].includes(String(value))) return String(value);
        if (value === '999') return 'all';
        return null;
    };

    if (lastFilters.day) {
        const daySelect = document.getElementById('day-select');
        if (daySelect) {
            daySelect.value = lastFilters.day;
            applied.day = true;
        }
    }

    const sharedPrice = normalizePrice(lastFilters.price);
    if (sharedPrice) {
        const input = document.querySelector(`input[name="price"][value="${sharedPrice}"]`);
        if (input) {
            input.click();
            applied.price = true;
        }

        // Keep the top "PRICE" pill UI in sync if present
        if (typeof formFilterState !== 'undefined') {
            formFilterState.price = sharedPrice;
            const pill = document.getElementById('form-filter-price');
            if (pill) {
                pill.querySelector('.pill-text').textContent = sharedPrice === 'all' ? 'PRICE' : 'FREE';
                pill.classList.toggle('has-filter', sharedPrice !== 'all');
            }
        }
    }

    const sharedTime = normalizeTime(lastFilters.time);
    if (sharedTime && typeof selectFormTimeFilter === 'function') {
        selectFormTimeFilter(sharedTime);
        applied.time = true;
    }

    const sharedCommute = normalizeCommute(lastFilters.commute);
    if (sharedCommute) {
        const commuteValue = sharedCommute === 'all' ? '999' : sharedCommute;
        const input = document.querySelector(`input[name="max-commute"][value="${commuteValue}"]`);
        if (input) {
            input.click();
            applied.commute = true;
        }

        if (typeof formFilterState !== 'undefined') {
            formFilterState.commute = sharedCommute;
            const pill = document.getElementById('form-filter-commute');
            if (pill) {
                const labels = { all: 'COMMUTE', '20': '20 MIN', '40': '40 MIN', '60': '60 MIN' };
                pill.querySelector('.pill-text').textContent = labels[sharedCommute];
                pill.classList.toggle('has-filter', sharedCommute !== 'all');
            }
        }
    }

    const sharedBorough = normalizeBorough(lastFilters.borough);
    if (sharedBorough) {
        if (sharedBorough === 'all') {
            if (typeof clearAllAreas === 'function') clearAllAreas();
        } else {
            if (typeof clearAllAreas === 'function') clearAllAreas();
            selectedAreas.add(sharedBorough);
            const boroughChip = document.querySelector(`.borough-chip[data-borough="${sharedBorough}"]`);
            if (boroughChip) boroughChip.classList.add('selected');
            if (typeof updateAreaCheckboxes === 'function') updateAreaCheckboxes();
            if (typeof updateAllNycChip === 'function') updateAllNycChip();
        }

        if (typeof selectFormBoroughFilter === 'function') {
            selectFormBoroughFilter(sharedBorough);
        }

        applied.borough = true;
    }

    if (lastFilters.startTime) {
        const startTime = document.getElementById('start-time');
        if (startTime) {
            startTime.value = lastFilters.startTime;
            applied.startTime = true;
        }
    }

    if (lastFilters.duration) {
        const durationSelect = document.getElementById('duration-select');
        if (durationSelect) {
            durationSelect.value = String(lastFilters.duration);
            applied.duration = true;
        }
    }

    if (shared.origin && shared.origin.lat && shared.origin.lng) {
        selectedOrigin = {
            lat: shared.origin.lat,
            lng: shared.origin.lng,
            name: shared.origin.name || 'Saved Location'
        };
        if (typeof selectOriginUI === 'function') {
            selectOriginUI(selectedOrigin);
        }
        applied.origin = true;
    }

    if (typeof updateFilterCountBadge === 'function') updateFilterCountBadge();
    if (typeof updateResultsPreview === 'function') updateResultsPreview();

    return applied;
}

function savePlannerPrefs() {
    try {
        const prefs = {
            lastUsedAt: Date.now(),
            day: document.getElementById('day-select')?.value,
            startTime: document.getElementById('start-time')?.value,
            duration: document.getElementById('duration-select')?.value,
            goal: document.querySelector('input[name="goal"]:checked')?.value,
            stops: document.querySelector('input[name="stops"]:checked')?.value,
            priority: document.querySelector('input[name="priority"]:checked')?.value,
            price: document.querySelector('input[name="price"]:checked')?.value,
            signup: document.querySelector('input[name="signup"]:checked')?.value,
            maxCommute: document.querySelector('input[name="max-commute"]:checked')?.value,
            timePerVenue: document.querySelector('input[name="time-per-venue"]:checked')?.value,
            maxWalk: document.querySelector('input[name="max-walk"]:checked')?.value,
            transitAccuracy: document.querySelector('input[name="transit-accuracy"]:checked')?.value,
            altsPerStop: document.querySelector('input[name="alts-per-stop"]:checked')?.value,
            areas: typeof getSelectedAreas === 'function' ? getSelectedAreas() : [],
            origin: selectedOrigin ? { lat: selectedOrigin.lat, lng: selectedOrigin.lng, name: selectedOrigin.name } : null
        };
        localStorage.setItem(PLAN_PREFS_KEY, JSON.stringify(prefs));

        syncMicMapSharedStateFromPlannerPrefs(prefs);
    } catch (_) {
        // localStorage might be full/unavailable
    }
}

function loadPlannerPrefs() {
    try {
        const shared = loadMicMapSharedState();
        const raw = localStorage.getItem(PLAN_PREFS_KEY);
        const prefs = raw ? safeJsonParse(raw) : null;

        const sharedTs = getSharedUpdatedAt(shared);
        const prefsTs = prefs?.lastUsedAt;
        const preferShared = !!shared && (!prefsTs || (sharedTs && sharedTs > prefsTs));
        const sharedApplied = preferShared
            ? applyMicMapSharedStateToUI(shared)
            : { day: false, startTime: false, duration: false, origin: false };

        if (!prefs || typeof prefs !== 'object') {
            if (typeof updateEndTimePreview === 'function') updateEndTimePreview();
            if (typeof updateFilterCountBadge === 'function') updateFilterCountBadge();
            return;
        }

        const now = Date.now();
        const isRecent = prefs.lastUsedAt && (now - prefs.lastUsedAt) < 12 * 60 * 60 * 1000;

        // Restore day/time only if the session was recent (prevents stale defaults)
        if (!sharedApplied.day && isRecent && prefs.day) {
            const daySelect = document.getElementById('day-select');
            if (daySelect) daySelect.value = prefs.day;
        }
        if (!sharedApplied.startTime && isRecent && prefs.startTime) {
            const startTime = document.getElementById('start-time');
            if (startTime) startTime.value = prefs.startTime;
        }
        if (!sharedApplied.duration && isRecent && prefs.duration) {
            const duration = document.getElementById('duration-select');
            if (duration) duration.value = prefs.duration;
        }

        const radioMap = [
            ['goal', prefs.goal],
            ['stops', prefs.stops],
            ['priority', prefs.priority],
            ['price', prefs.price],
            ['signup', prefs.signup],
            ['max-commute', prefs.maxCommute],
            ['time-per-venue', prefs.timePerVenue],
            ['max-walk', prefs.maxWalk],
            ['transit-accuracy', prefs.transitAccuracy],
            ['alts-per-stop', prefs.altsPerStop]
        ];

        radioMap.forEach(([name, value]) => {
            if (!value) return;
            const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
            if (input) {
                input.checked = true;
                const pill = input.closest('.radio-pill');
                const group = pill?.closest('.radio-pills');
                if (group) group.querySelectorAll('.radio-pill').forEach(p => p.classList.remove('active'));
                if (pill) pill.classList.add('active');
            }
        });

        // Restore areas
        if (Array.isArray(prefs.areas) && prefs.areas.length > 0) {
            if (typeof clearAllAreas === 'function') clearAllAreas();
            prefs.areas.forEach(a => {
                if (typeof a === 'string' && a.length > 0) {
                    selectedAreas.add(a);
                    const boroughChip = document.querySelector(`.borough-chip[data-borough="${a}"]`);
                    if (boroughChip) boroughChip.classList.add('selected');
                }
            });
            if (typeof updateAreaCheckboxes === 'function') updateAreaCheckboxes();
            if (typeof updateAllNycChip === 'function') updateAllNycChip();
        }

        // Restore origin (do this after areas to avoid auto-suggestion overriding the user)
        if (!sharedApplied.origin && prefs.origin && prefs.origin.lat && prefs.origin.lng) {
            selectedOrigin = { lat: prefs.origin.lat, lng: prefs.origin.lng, name: prefs.origin.name || 'Saved Location' };
            if (typeof selectOriginUI === 'function') selectOriginUI(selectedOrigin);
        }

        if (typeof updateEndTimePreview === 'function') updateEndTimePreview();
        if (typeof updateFilterCountBadge === 'function') updateFilterCountBadge();
    } catch (_) {
        // ignore
    }
}

// Render the filter preview (shows count + summary)
function renderFilterPreview(filtered, filterState) {
    // Get or create preview element
    let preview = document.getElementById('filter-preview');
    if (!preview) {
        // Create preview element after the form card
        const formCard = document.querySelector('.card.form-card-mobile-padding') ||
                         document.querySelector('.card');
        if (formCard) {
            preview = document.createElement('div');
            preview.id = 'filter-preview';
            preview.className = 'filter-preview';
            formCard.parentNode.insertBefore(preview, formCard.nextSibling);
        }
    }

    if (!preview) return;

    const count = filtered.length;
    const day = filterState.day;

    if (count === 0) {
        // Show "no mics" state with suggestions
        const nextDayWithMics = findNextDayWithMics(allMics, day);
        preview.innerHTML = `
            <div class="filter-preview-empty">
                <span class="filter-preview-count">0 mics</span>
                <span class="filter-preview-text">match your filters for ${day}</span>
                ${nextDayWithMics ? `
                    <button onclick="document.getElementById('day-select').value='${nextDayWithMics.day}'; updateResultsPreview();" class="filter-preview-link">
                        Try ${nextDayWithMics.day} (${nextDayWithMics.count} mics)
                    </button>
                ` : ''}
            </div>
        `;
        preview.classList.add('show', 'empty');
    } else {
        // Show count with time range
        const earliest = filtered.reduce((min, m) => m.startMins < min.startMins ? m : min, filtered[0]);
        const latest = filtered.reduce((max, m) => m.startMins > max.startMins ? m : max, filtered[0]);
        const timeRange = `${minsToTime(earliest.startMins)} - ${minsToTime(latest.startMins)}`;

        // Group by hour for summary
        const hourGroups = {};
        filtered.forEach(m => {
            const hour = Math.floor(m.startMins / 60);
            hourGroups[hour] = (hourGroups[hour] || 0) + 1;
        });
        const peakHour = Object.entries(hourGroups).sort((a, b) => b[1] - a[1])[0];
        const peakTime = peakHour ? minsToTime(parseInt(peakHour[0]) * 60) : '';

        preview.innerHTML = `
            <div class="filter-preview-success">
                <span class="filter-preview-count">${count} mic${count !== 1 ? 's' : ''}</span>
                <span class="filter-preview-text">available ${day} ${timeRange}</span>
                ${peakHour && peakHour[1] >= 3 ? `<span class="filter-preview-peak">Most at ${peakTime}</span>` : ''}
            </div>
        `;
        preview.classList.add('show');
        preview.classList.remove('empty');
    }
}

// Find next day with mics available
function findNextDayWithMics(mics, currentDay) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentIdx = days.indexOf(currentDay);

    for (let i = 1; i <= 7; i++) {
        const nextIdx = (currentIdx + i) % 7;
        const nextDay = days[nextIdx];
        const dayMics = mics.filter(m => m.day === nextDay);
        if (dayMics.length > 0) {
            return { day: nextDay, count: dayMics.length };
        }
    }
    return null;
}

// Debounced version for input changes
const debouncedUpdatePreview = debounce(updateResultsPreview, 150);

function initQuickFilterPills() {
    const pills = Array.from(document.querySelectorAll('.pill-filter'));
    if (pills.length === 0) return;

    const closeAll = (except) => {
        pills.forEach(p => {
            if (p === except) return;
            p.open = false;
        });
    };

    pills.forEach(pill => {
        pill.addEventListener('toggle', () => {
            if (pill.open) closeAll(pill);
        });

        // Auto-close after a selection (radio click)
        pill.querySelectorAll('input[type="radio"]').forEach(input => {
            input.addEventListener('change', () => {
                setTimeout(() => { pill.open = false; }, 50);
            });
        });
    });

    // Click outside closes all
    document.addEventListener('click', (e) => {
        if (e.target.closest('.pill-filter')) return;
        closeAll();
    });
}

// Setup real-time filter listeners
function setupRealTimeFilters() {
    // Day select - immediate update
    const daySelect = document.getElementById('day-select');
    if (daySelect) {
        daySelect.addEventListener('change', updateResultsPreview);
    }

    // Time inputs - debounced
    const startTime = document.getElementById('start-time');
    if (startTime) {
        startTime.addEventListener('change', debouncedUpdatePreview);
        startTime.addEventListener('input', debouncedUpdatePreview);
    }

    const durationSelect = document.getElementById('duration-select');
    if (durationSelect) {
        durationSelect.addEventListener('change', debouncedUpdatePreview);
    }

    // Radio pills - use event delegation
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', debouncedUpdatePreview);
    });

    // Area checkboxes are updated via updateAreaCheckboxes(), so we listen there
    const areaObserver = new MutationObserver(debouncedUpdatePreview);
    const areaContainer = document.getElementById('area-checkboxes');
    if (areaContainer) {
        areaObserver.observe(areaContainer, { childList: true, subtree: true });
    }
}

// Auto-select today's day
function setDayToToday() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    const daySelect = document.getElementById('day-select');
    if (daySelect) {
        daySelect.value = today;
    }
}

// Load all required data
async function initializeData() {
    const [micsData, stationsData] = await Promise.all([
        loadMics(),
        loadSubwayStations()
    ]);

    if (!micsData || micsData.length === 0) {
        throw new Error('Failed to load mic data');
    }

    // Store data
    loadedStations = stationsData;
    subwayStations = stationsData;
    allMics = addNearbyLinesToMics(micsData, loadedStations);

    // Initialize dependent features
    populateAnchorDropdowns();
    buildSearchIndex();

    // Sync to PlannerState
    if (typeof syncGlobalsToState === 'function') {
        syncGlobalsToState();
    }

    // Build indexes (Priority 2 & 4)
    // Pre-cache hour buckets for all days for O(1) day switching
    PlannerState.preCacheAllDays(allMics);

    const today = document.getElementById('day-select')?.value || 'Monday';
    PlannerState.buildHourBuckets(allMics, today);
    PlannerState.buildGeoIndex(allMics);

    // Initial filter preview
    updateResultsPreview();

    // Update form header mic count and calendar text
    if (typeof updateFormMicCount === 'function') {
        updateFormMicCount();
    }
    if (typeof updateFormCalendarText === 'function') {
        updateFormCalendarText();
    }

    // Listen for day changes to update count and calendar
    const daySelect = document.getElementById('day-select');
    if (daySelect) {
        daySelect.addEventListener('change', () => {
            if (typeof updateFormMicCount === 'function') updateFormMicCount();
            if (typeof updateFormCalendarText === 'function') updateFormCalendarText();
        });
    }
}

// Update loading overlay message
function updateLoadingMessage(message) {
    const loadingText = document.getElementById('app-loading-text');
    if (loadingText) {
        loadingText.textContent = message;
    }
}

// Show error in loading overlay
function showLoadingError(message) {
    const loadingOverlay = document.getElementById('app-loading');
    if (loadingOverlay) {
        loadingOverlay.innerHTML = `
            <div class="text-center">
                <div class="text-red-400 text-4xl mb-4">!</div>
                <div class="text-red-400 font-medium mb-2">Failed to load</div>
                <div class="text-zinc-500 text-sm mb-4">${message}</div>
                <button onclick="location.reload()"
                        class="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-white text-sm transition-colors">
                    Retry
                </button>
            </div>
        `;
    }
}

// Hide loading overlay
function hideLoadingOverlay() {
    const loadingOverlay = document.getElementById('app-loading');
    if (loadingOverlay) {
        loadingOverlay.style.opacity = '0';
        loadingOverlay.style.transition = 'opacity 0.3s ease';
        setTimeout(() => loadingOverlay.remove(), 300);
    }
}

// Main initialization (async)
async function init() {
    try {
        // 1. DOM-dependent setup (sync, fast)
        setDayToToday();
        initRadioPills();
        initQuickFilterPills();
        initBoroughChips();
        initSearch();
        loadPlannerPrefs();
        updateAllPillFilterStates();
        // If the user already granted location permission, reflect it immediately.
        if (typeof autoUseMyLocationOnLoad === 'function') {
            autoUseMyLocationOnLoad();
        }
        setupAnchorDropdown();
        updateEndTimePreview();

        // 2. Event listeners
        const daySelect = document.getElementById('day-select');
        if (daySelect) {
            daySelect.addEventListener('change', updateAnchorOptions);
        }

        const startTime = document.getElementById('start-time');
        if (startTime) {
            startTime.addEventListener('change', updateEndTimePreview);
        }

        const durationSelect = document.getElementById('duration-select');
        if (durationSelect) {
            durationSelect.addEventListener('change', updateEndTimePreview);
        }

        // 3. Load data (async - AWAIT this)
        updateLoadingMessage('Loading mic data...');
        await initializeData();

        // 4. Setup real-time filtering (Priority 1)
        setupRealTimeFilters();

        // 5. Render initial active filter chips (Priority 6)
        renderActiveFilterChips();

        // 6. Hide loading overlay
        hideLoadingOverlay();

    } catch (error) {
        showLoadingError(error.message || 'Unable to connect to server');
    }
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
