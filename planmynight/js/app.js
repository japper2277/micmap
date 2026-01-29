// Plan My Night - Application Initialization

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
        initBoroughChips();
        initSearch();
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

        // 4. Hide loading overlay
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
