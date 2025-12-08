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

    // Map state
    markerLookup: {},
    isProgrammaticMove: false,

    // Filters
    activeFilters: { price: 'All', time: 'All' },

    // Geolocation
    userLocation: null,
    userMarker: null,

    // Timers
    resizeTimeout: null,

    // Transit Search (MVP)
    userOrigin: null,       // { lat, lng } - user's search origin
    isTransitMode: false    // true when sorting by transit time
};
