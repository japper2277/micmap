// =============================================================================
// CONFIGURATION - CUSTOMIZE YOUR APP HERE
// =============================================================================

// API Configuration
const API_CONFIG = {
    // Set to 'mongodb' to use the new MongoDB API, or 'sheets' for legacy Google Sheets
    dataSource: 'mongodb',  // 'mongodb' or 'sheets'

    // MongoDB API settings
    mongodb: {
        baseUrl: 'http://localhost:3001',  // Change to production URL when deployed
        endpoints: {
            mics: '/api/v1/mics',
            health: '/health'
        }
    },

    // Google Sheets API settings (legacy)
    sheets: {
        apiKey: 'AIzaSyBL_zeouBAs0g43BirfK4YIz6mfjYpraP8',
        sheetId: '1wROLFgLrbgP1aP_b9VIJn0QzbGzmifT9r7CV15Lw7Mw',
        range: ''
    }
};

// Color Palette - Change these to customize the app's look
const COLORS = {
    brandBlue: '#5C6BC0',
    brandBlueHover: '#455A80',
    backgroundDark: '#1A1A2E',
    surfaceLight: '#3A3A50',
    surfaceMedium: '#2C2C40',
    textPrimary: '#E0E0E0',
    textSecondary: '#B0B0C0',
    textTertiary: '#808090',
    borderColor: '#4A4A60',
    topPickGold: '#FFD700',
    topPickGlow: '#FFEA00',
    successGreen: '#66BB6A',
    warningOrange: '#FFA726'
};

// Default Settings
const DEFAULTS = {
    selectedDay: '',              // Default day filter (empty = "Any Day", shows all days)
    selectedTime: 'all',          // Default time filter: 'all', 'afternoon', 'evening'
    selectedSort: 'distance',     // Default sort: 'distance', 'time', 'popularity'
    mapZoom: 13,                  // Initial map zoom level
    userLocationZoom: 14,         // Zoom level when showing user location
    panelHeightMobile: 0.4,       // Mobile panel height as % of screen (0.4 = 40%)
    searchHistoryLimit: 5,        // How many recent searches to store
    toastDuration: 3000,          // Toast notification display time (ms)
    debounceDelay: 300            // Search debounce delay (ms)
};

// Map Configuration
const MAP_CONFIG = {
    defaultCenter: [40.7128, -74.0060],  // NYC coordinates [lat, lon]
    defaultZoom: DEFAULTS.mapZoom,
    tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution: '© OpenStreetMap contributors',
    markerClusterOptions: {
        showCoverageOnHover: false,
        maxClusterRadius: 50
    }
};

// Feature Toggles - Turn features on/off
const FEATURES = {
    topPicksEnabled: true,          // Show "Top Picks" section
    favoritesEnabled: true,         // Enable favorites system
    checkInsEnabled: true,          // Enable check-in feature
    searchHistoryEnabled: true,     // Enable search history
    toastNotificationsEnabled: true, // Enable toast notifications
    userLocationEnabled: true       // Enable "Near Me" feature
};

// Filter Options
const FILTER_OPTIONS = {
    timeRanges: {
        afternoon: { start: 12, end: 17 },  // 12 PM - 4:59 PM
        evening: { start: 17, end: 23 }     // 5 PM - 11:59 PM
    },
    boroughs: [
        'Manhattan',
        'Brooklyn',
        'Queens',
        'Bronx',
        'Staten Island'
    ]
};

// Top Picks Algorithm Configuration
const TOP_PICKS_CONFIG = {
    count: 3,                    // How many top picks to show
    scoreWeights: {
        isActive: 10,            // Weight for mics happening now
        comics: 5,               // Weight for number of check-ins
        distance: -2,            // Weight for distance (negative = closer is better)
        hasTag: 3                // Weight for having certain tags
    },
    favoredTags: ['Hot', 'Pro-Am', 'Supportive']  // Tags that boost score
};

// Mic Status Timing (in hours)
const MIC_TIMING = {
    opensBefore: 1,     // Show "Opens Soon" 1 hour before start
    duration: 3,        // Assume mics run for 3 hours
    staleDataDays: 7    // Mark info as "Stale" after 7 days
};

// localStorage Keys
const STORAGE_KEYS = {
    favorites: 'micFavorites',
    searchHistory: 'searchHistory'
};

// DOM Element IDs (for reference)
const DOM_IDS = {
    appContainer: 'app-container',
    mapView: 'map-view',
    filtersContainer: 'filters-container',
    leftPanel: 'left-panel',
    micList: 'mic-list',
    searchInput: 'location-search-input',
    sortFilter: 'sort-filter',
    nearMeButton: 'near-me-button',
    dayFilter: 'day-filter',
    boroughFilter: 'borough-filter',
    neighborhoodFilter: 'neighborhood-filter',
    costFilter: 'cost-filter',
    favoritesOnly: 'favorites-only',
    clearFilters: 'clear-filters'
};
