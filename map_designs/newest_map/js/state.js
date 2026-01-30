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
    activeFilters: { price: 'All', time: 'All', commute: 'All', borough: 'All' },

    // Geolocation
    userLocation: null,
    userMarker: null,

    // Timers
    resizeTimeout: null,

    // Transit Search State
    userOrigin: null,           // { lat, lng, name }
    searchMarker: null,         // Leaflet marker for origin
    isTransitMode: false,       // True when sorted by transit
    isCalculatingTransit: false, // Loading state
    transitExpanded: false,     // Has user clicked "Show more"?
    targetVenueHood: null,      // Neighborhood of explicitly searched venue
    isWaitingForMapClick: false, // Waiting for user to tap map (geolocation fallback)

    // User Preferences (persisted to localStorage)
    walkPreference: localStorage.getItem('walkPref') || '15min',

    // Plan Mode State
    planMode: false,              // Is plan mode active?
    route: [],                    // Array of mic IDs in route
    setDuration: 45,              // Minutes user stays at each mic
    timeWindowStart: 700,         // Start of availability (7pm = 700)
    timeWindowEnd: 1100           // End of availability (11pm = 1100)
};
