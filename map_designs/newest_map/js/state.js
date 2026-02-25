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
    drawerState: 'peek', // 'peek' or 'open' (mobile only)
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

    // Plan Mode State
    planMode: false,              // Is plan mode active?
    route: [],                    // Current active route (will be loaded/saved to schedules)
    schedules: JSON.parse(localStorage.getItem('planSchedules') || '{}'), // Multi-day schedules { "dateStr": [ids] }
    dismissed: [],
    setDuration: parseInt(localStorage.getItem('planSetDuration') || '45', 10),
    planGracePeriod: 5,           // Minutes of overlap allowed between mics
    scheduleExpanded: false,      // Is "My Schedule" dropdown expanded?
    hideConflicts: false,         // Hide mics that conflict with scheduled times?
    showConflictWhy: false,       // Show conflict explanation/details in schedule UI
    suggestionSort: localStorage.getItem('planSuggestionSort') || 'closest', // 'closest' | 'soonest'
    suggestionsExpanded: false,   // Whether "Show more" is active for suggestions

    // Per-mic stay durations (overrides global setDuration)
    micDurations: JSON.parse(localStorage.getItem('planMicDurations') || '{}'), // { micId: minutes }

    // Slotted signup availability
    slottedSlots: {}              // { venueName: { slots: [...], signupUrl, lastFetched } }
};
