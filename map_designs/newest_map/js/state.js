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
    route: JSON.parse(localStorage.getItem('planRoute') || '[]'),
    dismissed: JSON.parse(localStorage.getItem('planDismissed') || '[]'),
    setDuration: parseInt(localStorage.getItem('planSetDuration') || '45', 10),
    timeWindowStart: parseInt(localStorage.getItem('planTimeWindowStart') || '700', 10),
    timeWindowEnd: parseInt(localStorage.getItem('planTimeWindowEnd') || '1100', 10),
    planGracePeriod: 5,           // Minutes of overlap allowed between mics
    scheduleExpanded: false,      // Is "My Schedule" dropdown expanded?
    hideConflicts: false          // Hide mics that conflict with scheduled times?
};
