/* =================================================================
   STATE
   Centralized application state
   ================================================================= */

const STATE = {
    // Data
    mics: [],

    // View mode
    currentMode: 'today',
    selectedCalendarDate: new Date().toDateString(),

    // UI state
    isDrawerOpen: false,
    drawerState: 'peek', // 'peek', 'half', or 'open' (mobile only)
    happeningNowExpanded: false, // Whether "Happening Now" section is expanded

    // Map state
    markerLookup: {},
    isProgrammaticMove: false,

    // Filters
    activeFilters: { price: 'All', time: 'All', commute: 'All' },

    // Geolocation
    userLocation: null,
    userMarker: null,

    // Timers
    resizeTimeout: null,

    // Transit Search State
    userOrigin: null,           // { lat, lng, name }
    transitTimes: {},           // { clusterId: seconds, ... }
    searchMarker: null,         // Leaflet marker for origin
    isTransitMode: false,       // True when sorted by transit
    transitCache: {},           // { 'lat,lng': { clusterId: seconds, ... } }
    isCalculatingTransit: false, // Loading state
    transitExpanded: false,     // Has user clicked "Show more"?
    targetVenueHood: null,      // Neighborhood of explicitly searched venue
    isWaitingForMapClick: false, // Waiting for user to tap map (geolocation fallback)

    // User Preferences (persisted to localStorage)
    walkPreference: localStorage.getItem('walkPref') || '15min'
};
