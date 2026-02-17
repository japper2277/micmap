const STATE = {
  events: [],
  filteredEvents: [],
  geocodeCache: {},
  markerLookup: {},
  activeFilters: {
    category: 'All',
    cost: 'All',
    date: 'All' // 'All' or a dateString like "Tue Feb 17 2026"
  },
  selectedEvent: null,
  isMobile: window.innerWidth < 640
};

// Load geocode cache from localStorage
try {
  const cached = localStorage.getItem('calred_geocode_cache');
  if (cached) STATE.geocodeCache = JSON.parse(cached);
} catch (e) {}
