// Plan My Night - Centralized State Management
// Provides controlled access to app state with validation

const PlannerState = {
    // ============================================================
    // PRIVATE STATE (use getters/setters)
    // ============================================================
    _mics: [],
    _stations: [],
    _transitCache: {},
    _origin: null,
    _currentRoute: null,
    _selectedAreas: new Set(),
    _expandedBorough: null,
    _anchorMicsByDay: {},
    _anchorCurrentDayMics: [],

    // Search state
    _searchableItems: [],
    _fuse: null,
    _selectedSearchIndex: -1,
    _currentQuery: '',
    _searchFilter: 'all',

    // ============================================================
    // GETTERS
    // ============================================================
    get mics() { return this._mics; },
    get stations() { return this._stations; },
    get transitCache() { return this._transitCache; },
    get origin() { return this._origin; },
    get currentRoute() { return this._currentRoute; },
    get selectedAreas() { return this._selectedAreas; },
    get expandedBorough() { return this._expandedBorough; },
    get anchorMicsByDay() { return this._anchorMicsByDay; },
    get anchorCurrentDayMics() { return this._anchorCurrentDayMics; },
    get searchableItems() { return this._searchableItems; },
    get fuse() { return this._fuse; },
    get selectedSearchIndex() { return this._selectedSearchIndex; },
    get currentQuery() { return this._currentQuery; },
    get searchFilter() { return this._searchFilter; },

    // ============================================================
    // SETTERS WITH VALIDATION
    // ============================================================
    setMics(mics) {
        if (!Array.isArray(mics)) {
            console.error('setMics: expected array, got', typeof mics);
            return;
        }
        this._mics = mics;
    },

    setStations(stations) {
        if (!Array.isArray(stations)) {
            console.error('setStations: expected array, got', typeof stations);
            return;
        }
        this._stations = stations;
    },

    setOrigin(origin) {
        if (origin !== null && (!origin.lat || !origin.lng)) {
            console.error('setOrigin: origin must have lat/lng or be null');
            return;
        }
        this._origin = origin;
    },

    setCurrentRoute(route) {
        this._currentRoute = route;
    },

    setExpandedBorough(borough) {
        this._expandedBorough = borough;
    },

    setSearchableItems(items) {
        if (!Array.isArray(items)) {
            console.error('setSearchableItems: expected array');
            return;
        }
        this._searchableItems = items;
    },

    setFuse(fuseInstance) {
        this._fuse = fuseInstance;
    },

    setSelectedSearchIndex(index) {
        this._selectedSearchIndex = typeof index === 'number' ? index : -1;
    },

    setCurrentQuery(query) {
        this._currentQuery = query || '';
    },

    setSearchFilter(filter) {
        const valid = ['all', 'neighborhoods', 'mics', 'stations'];
        this._searchFilter = valid.includes(filter) ? filter : 'all';
    },

    // ============================================================
    // AREA MANAGEMENT
    // ============================================================
    addArea(area) {
        if (typeof area === 'string' && area.length > 0) {
            this._selectedAreas.add(area);
        }
    },

    removeArea(area) {
        this._selectedAreas.delete(area);
    },

    clearAreas() {
        this._selectedAreas.clear();
    },

    hasArea(area) {
        return this._selectedAreas.has(area);
    },

    getAreasArray() {
        return [...this._selectedAreas];
    },

    // ============================================================
    // ANCHOR MANAGEMENT
    // ============================================================
    setAnchorMicsByDay(micsByDay) {
        if (typeof micsByDay !== 'object') {
            console.error('setAnchorMicsByDay: expected object');
            return;
        }
        this._anchorMicsByDay = micsByDay;
    },

    updateAnchorCurrentDay(day) {
        this._anchorCurrentDayMics = this._anchorMicsByDay[day] || [];
    },

    // ============================================================
    // TRANSIT CACHE
    // ============================================================
    cacheTransit(key, value) {
        this._transitCache[key] = value;
    },

    getTransitCache(key) {
        return this._transitCache[key];
    },

    clearTransitCache() {
        this._transitCache = {};
    },

    // ============================================================
    // RESET
    // ============================================================
    reset() {
        this._origin = null;
        this._currentRoute = null;
        this._selectedAreas.clear();
        this._expandedBorough = null;
        this._transitCache = {};
    },

    // ============================================================
    // DEBUG
    // ============================================================
    debug() {
        return {
            micsCount: this._mics.length,
            stationsCount: this._stations.length,
            origin: this._origin?.name || null,
            selectedAreas: [...this._selectedAreas],
            expandedBorough: this._expandedBorough,
            hasRoute: !!this._currentRoute,
            cacheSize: Object.keys(this._transitCache).length
        };
    }
};

// ============================================================
// BACKWARDS COMPATIBILITY
// These globals are exposed for existing code during migration.
// New code should use PlannerState directly.
// ============================================================

let allMics = [];
let subwayStations = [];
let loadedStations = [];
let transitCache = {};
let selectedOrigin = null;
let searchableItems = [];
let fuse = null;
let selectedSearchIndex = -1;
let currentQuery = '';
let searchFilter = 'all';
let currentRoute = null;

// Area filter state (Set is shared reference)
const selectedAreas = PlannerState._selectedAreas;
let expandedBorough = null;

// Anchor mic data
let anchorMicsByDay = {};
let anchorCurrentDayMics = [];

// Sync globals to PlannerState (call after major state changes)
function syncGlobalsToState() {
    PlannerState._mics = allMics;
    PlannerState._stations = subwayStations;
    PlannerState._transitCache = transitCache;
    PlannerState._origin = selectedOrigin;
    PlannerState._currentRoute = currentRoute;
    PlannerState._expandedBorough = expandedBorough;
    PlannerState._anchorMicsByDay = anchorMicsByDay;
    PlannerState._anchorCurrentDayMics = anchorCurrentDayMics;
    PlannerState._searchableItems = searchableItems;
    PlannerState._fuse = fuse;
    PlannerState._selectedSearchIndex = selectedSearchIndex;
    PlannerState._currentQuery = currentQuery;
    PlannerState._searchFilter = searchFilter;
}

// Sync PlannerState to globals (if migrating incrementally)
function syncStateToGlobals() {
    allMics = PlannerState._mics;
    subwayStations = PlannerState._stations;
    transitCache = PlannerState._transitCache;
    selectedOrigin = PlannerState._origin;
    currentRoute = PlannerState._currentRoute;
    expandedBorough = PlannerState._expandedBorough;
    anchorMicsByDay = PlannerState._anchorMicsByDay;
    anchorCurrentDayMics = PlannerState._anchorCurrentDayMics;
    searchableItems = PlannerState._searchableItems;
    fuse = PlannerState._fuse;
    selectedSearchIndex = PlannerState._selectedSearchIndex;
    currentQuery = PlannerState._currentQuery;
    searchFilter = PlannerState._searchFilter;
}
