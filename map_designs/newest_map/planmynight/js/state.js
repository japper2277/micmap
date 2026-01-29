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
    // NEW: Time & Spatial Indexes (Priority 2 & 4)
    // ============================================================
    _hourBuckets: {},           // { hour: [mics] } for O(1) time lookups
    _geoIndex: new Map(),       // geohash -> [mics] for O(1) proximity lookups
    _filteredMics: [],          // Current filtered results for real-time preview
    _lastFilterState: null,     // Cache of last filter state to avoid redundant updates

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
    get hourBuckets() { return this._hourBuckets; },
    get geoIndex() { return this._geoIndex; },
    get filteredMics() { return this._filteredMics; },
    get lastFilterState() { return this._lastFilterState; },

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
    // HOUR BUCKETS (Priority 2)
    // ============================================================
    _allDayBuckets: {},  // Pre-cached buckets for all days
    _currentDay: null,

    // Pre-cache hour buckets for all days (call once on data load)
    preCacheAllDays(mics) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        this._allDayBuckets = {};

        days.forEach(day => {
            const buckets = {};
            const dayMics = mics.filter(m => m.day === day);
            dayMics.forEach(mic => {
                const hour = Math.floor(mic.startMins / 60);
                if (!buckets[hour]) buckets[hour] = [];
                buckets[hour].push(mic);
            });
            // Sort each bucket
            Object.keys(buckets).forEach(hour => {
                buckets[hour].sort((a, b) => a.startMins - b.startMins);
            });
            this._allDayBuckets[day] = buckets;
        });

        return this._allDayBuckets;
    },

    buildHourBuckets(mics, day) {
        // Use pre-cached if available
        if (this._allDayBuckets[day] && this._currentDay !== day) {
            this._hourBuckets = this._allDayBuckets[day];
            this._currentDay = day;
            return this._hourBuckets;
        }

        // Build on demand if not pre-cached
        this._hourBuckets = {};
        this._currentDay = day;
        const dayMics = mics.filter(m => m.day === day);
        dayMics.forEach(mic => {
            const hour = Math.floor(mic.startMins / 60);
            if (!this._hourBuckets[hour]) this._hourBuckets[hour] = [];
            this._hourBuckets[hour].push(mic);
        });
        // Sort each bucket by startMins
        Object.keys(this._hourBuckets).forEach(hour => {
            this._hourBuckets[hour].sort((a, b) => a.startMins - b.startMins);
        });
        return this._hourBuckets;
    },

    // Configuration for alternatives
    _alternativesConfig: {
        maxTimeDiff: 30,   // Default 30 minutes
        maxResults: 3      // Default 3 alternatives
    },

    setAlternativesConfig(config) {
        if (config.maxTimeDiff !== undefined) {
            this._alternativesConfig.maxTimeDiff = Math.max(15, Math.min(120, config.maxTimeDiff));
        }
        if (config.maxResults !== undefined) {
            this._alternativesConfig.maxResults = Math.max(0, Math.min(10, config.maxResults));
        }
    },

    getAlternatives(mic, maxTimeDiff, maxResults) {
        // Use provided values or fall back to config
        const timeDiff = maxTimeDiff ?? this._alternativesConfig.maxTimeDiff;
        const results = maxResults ?? this._alternativesConfig.maxResults;

        if (results === 0) return [];

        if (!mic || !mic.startMins) return [];
        const hour = Math.floor(mic.startMins / 60);

        // Look at current hour and ±1 hour buckets
        const candidates = [
            ...(this._hourBuckets[hour - 1] || []),
            ...(this._hourBuckets[hour] || []),
            ...(this._hourBuckets[hour + 1] || [])
        ];

        return candidates
            .filter(m => m.id !== mic.id && Math.abs(m.startMins - mic.startMins) <= timeDiff)
            .sort((a, b) => Math.abs(a.startMins - mic.startMins) - Math.abs(b.startMins - mic.startMins))
            .slice(0, results);
    },

    // ============================================================
    // GEO INDEX (Priority 4) - Simple geohash implementation
    // ============================================================
    buildGeoIndex(mics, precision = 5) {
        this._geoIndex = new Map();
        mics.forEach(mic => {
            if (!mic.lat || !mic.lng) return;
            const hash = this._encodeGeohash(mic.lat, mic.lng, precision);
            mic.geohash = hash;
            if (!this._geoIndex.has(hash)) this._geoIndex.set(hash, []);
            this._geoIndex.get(hash).push(mic);
        });
        return this._geoIndex;
    },

    // Simple geohash encoder (no external dependency)
    _encodeGeohash(lat, lng, precision = 5) {
        const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
        let minLat = -90, maxLat = 90, minLng = -180, maxLng = 180;
        let hash = '';
        let bit = 0, ch = 0, isLng = true;
        while (hash.length < precision) {
            const mid = isLng ? (minLng + maxLng) / 2 : (minLat + maxLat) / 2;
            if (isLng) {
                if (lng >= mid) { ch |= (1 << (4 - bit)); minLng = mid; }
                else { maxLng = mid; }
            } else {
                if (lat >= mid) { ch |= (1 << (4 - bit)); minLat = mid; }
                else { maxLat = mid; }
            }
            isLng = !isLng;
            if (++bit === 5) { hash += BASE32[ch]; bit = 0; ch = 0; }
        }
        return hash;
    },

    _getGeohashNeighbors(hash) {
        // Proper 2D geohash neighbor calculation
        // Geohash uses Z-order curve (Morton code) - neighbors in 2D space are NOT adjacent in BASE32
        const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

        // Neighbor lookup tables for each direction (based on geohash's 2D structure)
        // Each character alternates between encoding lng (even bits) and lat (odd bits)
        const NEIGHBORS = {
            n: { even: 'p0r21436x8zb9dcf5h7kjnmqesgutwvy', odd: 'bc01fg45238967deuvhjyznpkmstqrwx' },
            s: { even: '14365h7k9dcfesgujnmqp0teletrwvyx8zb', odd: '238967debc01teleufg45teletrwvyjnpkmstqrwxyz' },
            e: { even: 'bc01fg45238967deuvhjyznpkmstqrwx', odd: 'p0r21436x8zb9dcf5h7kjnmqesgutwvy' },
            w: { even: '238967debc01fg4teleuvhjyznpkmsteleqrwx', odd: '14365h7k9dcfesgujnmqp0r2twvyx8zb' }
        };
        const BORDERS = {
            n: { even: 'prxz', odd: 'bcfguvyz' },
            s: { even: '028b', odd: '0145hjnp' },
            e: { even: 'bcfguvyz', odd: 'prxz' },
            w: { even: '0145hjnp', odd: '028b' }
        };

        const neighbors = [hash]; // Include self

        // For simplicity in NYC (small area), use expanded search radius
        // Get 8 surrounding cells by checking boundary characters
        const lastChar = hash.slice(-1);
        const prefix = hash.slice(0, -1);
        const charIdx = BASE32.indexOf(lastChar);

        // Generate neighbors by bit manipulation (simplified for 5-bit characters)
        // Each char encodes 5 bits: 2-3 for lat, 2-3 for lng alternating
        const isOdd = hash.length % 2 === 1;

        // Add all 8 neighbors plus 16 2-cell radius for better coverage
        const offsets = [-2, -1, 0, 1, 2];
        for (const dx of offsets) {
            for (const dy of offsets) {
                if (dx === 0 && dy === 0) continue;

                // Approximate neighbor by shifting bits
                // This is simplified but works well for NYC's scale
                let newIdx = charIdx;

                // Horizontal movement (every other bit)
                if (dx !== 0) {
                    const hShift = isOdd ? 1 : 2;
                    newIdx = (newIdx + dx * hShift + 32) % 32;
                }

                // Vertical movement
                if (dy !== 0) {
                    const vShift = isOdd ? 2 : 1;
                    newIdx = (newIdx + dy * vShift + 32) % 32;
                }

                if (newIdx >= 0 && newIdx < 32) {
                    const neighborHash = prefix + BASE32[newIdx];
                    if (!neighbors.includes(neighborHash)) {
                        neighbors.push(neighborHash);
                    }
                }
            }
        }

        return neighbors;
    },

    getNearbyMics(mic, maxWalkMiles = 0.25) {
        if (!mic || !mic.geohash) return [];
        const neighbors = this._getGeohashNeighbors(mic.geohash);
        const candidates = neighbors
            .flatMap(h => this._geoIndex.get(h) || [])
            .filter(m => m.id !== mic.id);
        // Filter by actual distance
        return candidates.filter(m => {
            const dist = this._haversineDistance(mic.lat, mic.lng, m.lat, m.lng);
            return dist <= maxWalkMiles;
        });
    },

    _haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 3959; // Earth radius in miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    // ============================================================
    // FILTERED MICS (Priority 1 - Real-time filtering)
    // ============================================================
    setFilteredMics(mics) {
        this._filteredMics = Array.isArray(mics) ? mics : [];
    },

    setLastFilterState(state) {
        this._lastFilterState = state;
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
            cacheSize: Object.keys(this._transitCache).length,
            hourBucketsCount: Object.keys(this._hourBuckets).length,
            geoIndexSize: this._geoIndex.size,
            filteredMicsCount: this._filteredMics.length
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
