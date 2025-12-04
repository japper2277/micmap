// =============================================================================
// APP.JS - EVENT HANDLERS & INITIALIZATION
// =============================================================================

// DOM Elements (populated after DOM loads)
let dom = {};

// =============================================================================
// EVENT HANDLERS
// =============================================================================

function handleLocationSearch() {
    state.searchQuery = dom.locationSearchInput.value;
    if (state.searchQuery.trim()) {
        addToSearchHistory(state.searchQuery);
    }
    filterMics();
}

// Debounced version for input event
const debouncedSearch = debounce(handleLocationSearch, DEFAULTS.debounceDelay);

function handleDayPillClick(event) {
    dom.dayPillButtons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    state.selectedDay = event.target.dataset.day;
    filterMics();
}

function handleTimeFilterClick(event) {
    dom.timeFilterButtons.forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    state.selectedTime = event.target.dataset.time;
    filterMics();
}

function handleSortChange() {
    state.selectedSort = dom.sortFilter.value;
    filterMics();
}

function handleNearMeClick() {
    if (!FEATURES.userLocationEnabled) return;

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            state.currentPosition = [position.coords.latitude, position.coords.longitude];
            map.setView(state.currentPosition, DEFAULTS.userLocationZoom);

            // Remove existing user location marker if present
            if (state.userLocationMarker) {
                map.removeLayer(state.userLocationMarker);
            }

            // Add blue dot for user location
            state.userLocationMarker = L.circleMarker(state.currentPosition, {
                radius: 8,
                fillColor: "#3B82F6",
                color: "#FFFFFF",
                weight: 3,
                opacity: 1,
                fillOpacity: 0.9
            }).addTo(map);

            state.userLocationMarker.bindPopup("<strong>You are here</strong>");

            showToast("Location found!", 'success');
            filterMics();
        }, (error) => {
            console.error("Geolocation error:", error);
            alert("Could not retrieve your location. Please ensure location services are enabled.");
        });
    } else {
        alert("Geolocation is not supported by your browser.");
    }
}

function handleBoroughChange() {
    state.selectedBorough = dom.boroughFilter.value;
    state.selectedNeighborhood = ''; // Reset neighborhood when borough changes
    populateNeighborhoods(state.selectedBorough);
    filterMics();
}

function handleNeighborhoodChange() {
    state.selectedNeighborhood = dom.neighborhoodFilter.value;
    filterMics();
}

function handleCostFilterChange() {
    state.selectedCost = dom.costFilter.value;
    filterMics();
}

function handleFavoritesOnlyChange() {
    state.favoritesOnly = dom.favoritesOnly.checked;
    filterMics();
}

function handleClearFilters() {
    // Reset all filter states
    state.searchQuery = '';
    state.selectedDay = DEFAULTS.selectedDay;
    state.selectedTime = DEFAULTS.selectedTime;
    state.selectedSort = DEFAULTS.selectedSort;
    state.selectedBorough = '';
    state.selectedNeighborhood = '';
    state.selectedCost = '';
    state.favoritesOnly = false;

    // Reset UI elements
    dom.locationSearchInput.value = '';
    dom.sortFilter.value = DEFAULTS.selectedSort;
    dom.boroughFilter.value = '';
    dom.neighborhoodFilter.value = '';
    dom.costFilter.value = '';
    dom.favoritesOnly.checked = false;
    populateNeighborhoods('');

    // Reset day pill buttons
    dom.dayPillButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.day-pill[data-day="${DEFAULTS.selectedDay}"]`).classList.add('active');

    // Reset time filter buttons
    dom.timeFilterButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.time-filter-btn[data-time="${DEFAULTS.selectedTime}"]`).classList.add('active');

    showToast("Filters cleared", 'info');
    filterMics();
}

function handleMicCardHover(event) {
    let targetCard = event.target.closest('[data-mic-id]');
    if (targetCard) {
        const micId = parseInt(targetCard.dataset.micId);
        if (state.hoveredMicId !== micId) {
            state.hoveredMicId = micId;
            updateMapMarkers();
        }
    }
}

function handleMicCardMouseOut() {
    state.hoveredMicId = null;
    updateMapMarkers();
}

function handleCheckInClick(event) {
    if (!FEATURES.checkInsEnabled) return;

    const micId = parseInt(event.target.dataset.micId);
    const mic = mockMics.find(m => m.id === micId);
    if (mic) {
        mic.comics = (mic.comics || 0) + 1;
        showToast("Checked in!", 'success');
        filterMics();
    }
}

async function handleShareClick(event) {
    const button = event.target.closest('.share-btn');
    const micId = button.dataset.micId;
    const micName = button.dataset.micName;
    const micDay = button.dataset.micDay;
    const micTime = button.dataset.micTime;

    const shareUrl = `${window.location.origin}${window.location.pathname}?mic=${micId}`;
    const shareText = `Check out ${micName} - ${micDay}s at ${micTime}`;

    // Try Web Share API first (mobile-friendly)
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'MicMap - NYC Comedy Open Mic',
                text: shareText,
                url: shareUrl
            });
            showToast("Shared successfully!", 'success');
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Share failed:', err);
            }
        }
    } else {
        // Fallback: Copy to clipboard
        try {
            await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
            showToast("Link copied to clipboard!", 'success');
        } catch (err) {
            console.error('Copy failed:', err);
            showToast("Could not copy link", 'error');
        }
    }
}

// =============================================================================
// VIEW TOGGLE (Mobile)
// =============================================================================

function updateViewToggle() {
    if (window.innerWidth >= 1024) {
        // Desktop: no toggle, list always open
        dom.leftPanel.style.transform = 'translateY(0)';
        dom.leftPanel.style.height = '100%';
        dom.viewToggle.classList.add('hidden');
        map.invalidateSize();
        return;
    }

    // Mobile: toggle panel visibility
    dom.viewToggle.classList.remove('hidden');
    if (state.view === 'list') {
        dom.leftPanel.classList.remove('hidden-mobile');
        dom.leftPanel.classList.remove('expanded-mobile');
        dom.leftPanel.style.height = `${state.lastPanelHeight}px`;
        dom.toggleIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path fill-rule="evenodd" d="M9.69 18.933l.97 1.03c.19.2.49.2.69 0l7.78-8.25a.75.75 0 000-1.06L11.35 2.4a.75.75 0 00-1.06 0L2.5 10.65a.75.75 0 000 1.06l7.19 7.22z" clip-rule="evenodd"></path></svg>`;
        dom.toggleText.textContent = 'Map';
    } else {
        dom.leftPanel.classList.add('hidden-mobile');
        dom.leftPanel.classList.remove('expanded-mobile');
        dom.toggleIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M3 4.5A1.5 1.5 0 014.5 3h11A1.5 1.5 0 0117 4.5v11a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 15.5v-11zM11.25 4.5a.75.75 0 00-1.5 0v.75H8.25a.75.75 0 000 1.5h1.5v1.5a.75.75 0 001.5 0v-1.5h1.5a.75.75 0 000-1.5h-1.5V4.5z" clip-rule="evenodd"></path></svg>`;
        dom.toggleText.textContent = 'List';
    }
    map.invalidateSize();
}

// =============================================================================
// EVENT LISTENERS SETUP
// =============================================================================

function setupEventListeners() {
    // Search & Filters
    dom.locationSearchInput.addEventListener('input', debouncedSearch);
    dom.sortFilter.addEventListener('change', handleSortChange);
    dom.nearMeButton.addEventListener('click', handleNearMeClick);
    dom.dayPillButtons.forEach(button => {
        button.addEventListener('click', handleDayPillClick);
    });
    dom.timeFilterButtons.forEach(button => {
        button.addEventListener('click', handleTimeFilterClick);
    });

    dom.boroughFilter.addEventListener('change', handleBoroughChange);
    dom.neighborhoodFilter.addEventListener('change', handleNeighborhoodChange);
    dom.costFilter.addEventListener('change', handleCostFilterChange);
    dom.favoritesOnly.addEventListener('change', handleFavoritesOnlyChange);
    dom.clearFilters.addEventListener('click', handleClearFilters);

    // Mic Card Interactions
    dom.micList.addEventListener('mouseover', handleMicCardHover);
    dom.micList.addEventListener('mouseout', handleMicCardMouseOut);
    dom.micList.addEventListener('click', (event) => {
        // Check-in button
        if (event.target.classList.contains('check-in-btn')) {
            handleCheckInClick(event);
        }

        // Share button
        if (event.target.closest('.share-btn')) {
            handleShareClick(event);
            event.stopPropagation();
        }

        // Favorite button
        const favoriteBtn = event.target.closest('.favorite-btn');
        if (favoriteBtn) {
            const micId = parseInt(favoriteBtn.dataset.micId);
            toggleFavorite(micId);
            event.stopPropagation();
        }
    });

    // View Toggle (Mobile)
    dom.viewToggleBtn.addEventListener('click', () => {
        state.view = state.view === 'list' ? 'map' : 'list';
        updateViewToggle();
    });

    // Mobile Panel Drag Handler
    setupPanelDragHandler();

    // Window Resize
    window.addEventListener('resize', () => {
        if (window.mapInstance) {
            window.mapInstance.invalidateSize();
        }
        updateViewToggle();
        filterMics();
    });

    // Set initial active day pill button
    document.querySelector(`.day-pill[data-day="${DEFAULTS.selectedDay}"]`).classList.add('active');

    // Set initial active time filter button
    document.querySelector(`.time-filter-btn[data-time="${DEFAULTS.selectedTime}"]`).classList.add('active');
}

// =============================================================================
// PANEL DRAG HANDLER (Mobile)
// =============================================================================

function setupPanelDragHandler() {
    let startY, currentPanelHeight;

    const dragStart = (e) => {
        if (window.innerWidth >= 1024) return; // Desktop only
        state.isPanelDragging = true;
        dom.leftPanel.style.transition = 'none';
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        currentPanelHeight = dom.leftPanel.clientHeight;
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('mouseup', dragEnd);
        document.addEventListener('touchend', dragEnd);
    };

    const dragMove = (e) => {
        if (!state.isPanelDragging) return;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaY = startY - clientY;
        let newHeight = currentPanelHeight + deltaY;

        // Clamp height
        const minHeight = window.innerHeight * 0.15;
        const maxHeight = window.innerHeight * 0.9;
        newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

        dom.leftPanel.style.height = `${newHeight}px`;
        dom.leftPanel.style.transform = `translateY(calc(100% - ${newHeight}px))`;

        if (e.cancelable) e.preventDefault();
    };

    const dragEnd = () => {
        if (!state.isPanelDragging) return;
        state.isPanelDragging = false;
        dom.leftPanel.style.transition = '';
        state.lastPanelHeight = dom.leftPanel.clientHeight;

        const panelHeight = dom.leftPanel.clientHeight;
        const screenHeight = window.innerHeight;

        if (panelHeight > screenHeight * 0.75) {
            dom.leftPanel.classList.add('expanded-mobile');
            dom.leftPanel.style.transform = 'translateY(0%)';
            state.view = 'list';
        } else if (panelHeight < screenHeight * 0.25) {
            state.view = 'map';
            dom.leftPanel.classList.add('hidden-mobile');
        } else {
            dom.leftPanel.classList.remove('expanded-mobile');
            dom.leftPanel.classList.remove('hidden-mobile');
            dom.leftPanel.style.transform = `translateY(calc(100% - ${panelHeight}px))`;
            state.view = 'list';
        }

        updateViewToggle();
    };

    dom.panelHandle.addEventListener('mousedown', dragStart);
    dom.panelHandle.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('mouseup', dragEnd);
    document.addEventListener('touchend', dragEnd);
}

// =============================================================================
// APP INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM references
    dom = {
        appContainer: document.getElementById(DOM_IDS.appContainer),
        mapView: document.getElementById(DOM_IDS.mapView),
        locationSearchInput: document.getElementById(DOM_IDS.searchInput),
        sortFilter: document.getElementById(DOM_IDS.sortFilter),
        nearMeButton: document.getElementById(DOM_IDS.nearMeButton),
        dayPillButtons: document.querySelectorAll('.day-pill'),
        timeFilterContainer: document.getElementById('time-filter-container'),
        timeFilterButtons: document.querySelectorAll('.time-filter-btn'),
        boroughFilter: document.getElementById(DOM_IDS.boroughFilter),
        neighborhoodFilter: document.getElementById(DOM_IDS.neighborhoodFilter),
        costFilter: document.getElementById(DOM_IDS.costFilter),
        favoritesOnly: document.getElementById(DOM_IDS.favoritesOnly),
        clearFilters: document.getElementById(DOM_IDS.clearFilters),
        leftPanel: document.getElementById(DOM_IDS.leftPanel),
        panelHandle: document.getElementById('panel-handle'),
        micList: document.getElementById(DOM_IDS.micList),
        viewToggle: document.getElementById('view-toggle'),
        viewToggleBtn: document.getElementById('view-toggle-btn'),
        toggleIcon: document.getElementById('toggle-icon'),
        toggleText: document.getElementById('toggle-text')
    };

    // Initialize map
    initMap();

    // Update time display
    updateCurrentTimeDisplay();

    // Setup all event listeners
    setupEventListeners();

    // Set initial panel state for mobile
    if (window.innerWidth < 1024) {
        const initialHeight = window.innerHeight * 0.25;
        state.lastPanelHeight = initialHeight;
        state.view = 'list';
    }

    // Load data and render
    loadInitialData();

    console.log('🎤 MicMap initialized successfully!');
});

// =============================================================================
// DATA LOADING
// =============================================================================

async function loadInitialData() {
    showLoadingState();

    try {
        // Use the new API client (MongoDB or Google Sheets)
        console.log(`📊 Loading data from ${API_CONFIG.dataSource}...`);

        const micsData = await ApiClient.fetchMics();

        if (micsData && micsData.length > 0) {
            mockMics = micsData;
            console.log(`✅ Loaded ${micsData.length} mics from ${API_CONFIG.dataSource}`);
        } else {
            console.warn('⚠️ No mics data returned');
        }

        hideLoadingState();

    } catch (error) {
        console.error('❌ Error loading mics data:', error);
        hideLoadingState();

        // Show error message to user
        if (dom.micList) {
            dom.micList.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 space-y-4 px-6">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-red-500">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    <p class="text-[var(--text-primary)] text-base font-semibold">Failed to load mics</p>
                    <p class="text-[var(--text-secondary)] text-sm text-center">
                        ${API_CONFIG.dataSource === 'mongodb'
                            ? 'Could not connect to API server. Make sure the backend is running on ' + API_CONFIG.mongodb.baseUrl
                            : 'Could not load data from Google Sheets'}
                    </p>
                    <button onclick="location.reload()" class="mt-4 bg-[var(--brand-blue)] hover:bg-[var(--brand-blue-hover)] text-white font-semibold py-2 px-6 rounded-lg transition-all duration-150">
                        Retry
                    </button>
                </div>
            `;
        }
        return;
    }

    // Initial render with loaded data
    filterMics();
    updateViewToggle();
}

function showLoadingState() {
    if (dom.micList) {
        dom.micList.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 space-y-4">
                <div class="animate-spin rounded-full h-12 w-12 border-4 border-[var(--brand-blue)] border-t-transparent"></div>
                <p class="text-[var(--text-secondary)] text-sm font-medium">Loading mics...</p>
            </div>
        `;
    }
}

function hideLoadingState() {
    // Loading state will be replaced by filterMics() rendering
}
