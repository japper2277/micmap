// =============================================================================
// STATE MANAGEMENT
// =============================================================================
// Central store for all application state

const state = {
    // User Location
    currentPosition: null,        // [lat, lon] from geolocation
    userLocationMarker: null,     // Leaflet marker object

    // Filters
    selectedDay: DEFAULTS.selectedDay,
    selectedTime: DEFAULTS.selectedTime,
    selectedSort: DEFAULTS.selectedSort,
    selectedBorough: '',
    selectedNeighborhood: '',
    selectedCost: '',
    favoritesOnly: false,

    // Data
    favorites: loadFromLocalStorage(STORAGE_KEYS.favorites, []),
    mics: [],                     // Processed/filtered mics
    topPicks: [],                 // Calculated top picks

    // UI State
    view: window.innerWidth >= 1024 ? 'desktop' : 'list',  // 'list', 'map', 'desktop'
    hoveredMicId: null,
    isPanelDragging: false,
    lastPanelHeight: window.innerHeight * DEFAULTS.panelHeightMobile,

    // Performance
    debounceTimer: null
};

// Helper function to load from localStorage
function loadFromLocalStorage(key, defaultValue) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error(`Error loading ${key} from localStorage:`, error);
        return defaultValue;
    }
}

// Helper function to save to localStorage
function saveToLocalStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error(`Error saving ${key} to localStorage:`, error);
    }
}
