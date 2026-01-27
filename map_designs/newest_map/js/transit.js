/* =================================================================
   TRANSIT SERVICE - Dijkstra-based routing

   Uses exact coordinates for accurate subway routing:
   1. User's exact location → find nearest subway station
   2. Dijkstra pathfinding → venue's exact coordinates
   3. No estimation, no clusters, no pre-computed matrices

   ================================================================= */

// CONSTANTS
const WALK_MINS_PER_MILE = 20;      // ~3 mph walking pace

// OSRM Walking API - try local first, fallback to public
const OSRM_LOCAL = 'http://localhost:5001/route/v1/foot';
const OSRM_PUBLIC = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';
let osrmEndpoint = OSRM_LOCAL;
let osrmLocalFailed = false;
let osrmLocalFailedAt = null;  // Track when it failed to allow retry after 5 min

const transitService = {

    // Walking route cache (expires after 30 min)
    walkCache: {},
    walkCacheTimestamp: null,

    // Route cache: keyed by "userLat,userLng|venueLat,venueLng"
    routeCache: {},
    cacheTimestamp: null,

    // AbortController for canceling previous search
    abortController: null,

    isOffline() {
        return !navigator.onLine;
    },

    // Call subway router API for accurate Dijkstra-based routing
    async fetchSubwayRoute(userLat, userLng, venueLat, venueLng) {
        // Cache key: round to 3 decimals (~111 meter precision, reduces API spam)
        const cacheKey = `${userLat.toFixed(3)},${userLng.toFixed(3)}|${venueLat.toFixed(3)},${venueLng.toFixed(3)}`;

        // Cache invalidation: clear after 5 minutes
        if (!this.cacheTimestamp) this.cacheTimestamp = Date.now();
        if (Date.now() - this.cacheTimestamp > 5 * 60 * 1000) {
            this.routeCache = {};
            this.cacheTimestamp = Date.now();
        }

        // Return cached result if available
        if (this.routeCache[cacheKey]) {
            return this.routeCache[cacheKey];
        }

        try {
            const url = `${CONFIG.apiBase}/api/subway/routes?userLat=${userLat}&userLng=${userLng}&venueLat=${venueLat}&venueLng=${venueLng}`;

            // 15-second timeout for Dijkstra calculation (production can be slower)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.error(`Route API error: ${response.status}`);
                return null;
            }

            const data = await response.json();
            const route = data.routes && data.routes.length > 0 ? data.routes[0] : null;

            // Cache the result (success or null)
            this.routeCache[cacheKey] = route;
            return route;

        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('Route calculation timeout (>15s)');
            } else {
                console.error('Route fetch failed:', error.message);
            }
            // Don't cache failures - allow retry
            return null;
        }
    },

    // Fetch accurate walking time from OSRM foot API (local with public fallback)
    async fetchWalkingRoute(fromLat, fromLng, toLat, toLng) {
        // Cache key
        const cacheKey = `walk:${fromLat.toFixed(4)},${fromLng.toFixed(4)}|${toLat.toFixed(4)},${toLng.toFixed(4)}`;

        // Cache invalidation: clear walk cache after 30 minutes
        if (!this.walkCacheTimestamp) this.walkCacheTimestamp = Date.now();
        if (Date.now() - this.walkCacheTimestamp > 30 * 60 * 1000) {
            this.walkCache = {};
            this.walkCacheTimestamp = Date.now();
        }

        // Return cached result if available
        if (this.walkCache[cacheKey]) {
            return this.walkCache[cacheKey];
        }

        // Try local OSRM first, then public API as fallback
        // Retry local after 5 minutes even if it failed before
        const shouldRetryLocal = !osrmLocalFailed ||
            (osrmLocalFailedAt && Date.now() - osrmLocalFailedAt > 5 * 60 * 1000);
        const endpoints = shouldRetryLocal ? [OSRM_LOCAL, OSRM_PUBLIC] : [OSRM_PUBLIC];

        for (const endpoint of endpoints) {
            try {
                const url = `${endpoint}/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), endpoint === OSRM_LOCAL ? 2000 : 8000);

                const response = await fetch(url, {
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'MicMap-NYC/1.0',
                        'Referer': 'https://micmap.nyc'
                    }
                });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    if (endpoint === OSRM_LOCAL) {
                        osrmLocalFailed = true;
                        osrmLocalFailedAt = Date.now();
                        console.log('Local OSRM unavailable, switching to public API');
                        continue;
                    }
                    return null;
                }

                const data = await response.json();
                if (data.routes && data.routes.length > 0) {
                    const r = data.routes[0];
                    const result = {
                        meters: Math.round(r.distance),
                        mins: Math.round(r.duration / 60),
                        miles: Math.round(r.distance / 1609.34 * 100) / 100
                    };
                    // Cache the result
                    this.walkCache[cacheKey] = result;
                    return result;
                }
            } catch (error) {
                if (endpoint === OSRM_LOCAL) {
                    osrmLocalFailed = true;
                    osrmLocalFailedAt = Date.now();
                    console.log('Local OSRM unavailable, switching to public API');
                    continue;
                }
                // Public API also failed
                if (error.name === 'AbortError') {
                    console.warn('OSRM walk timeout');
                } else {
                    console.warn('OSRM walk error:', error.message);
                }
            }
        }
        return null;
    },

    // Get walking time - tries OSRM first, falls back to estimate
    async getWalkingTime(fromLat, fromLng, toLat, toLng) {
        // Try accurate OSRM route
        const osrmRoute = await this.fetchWalkingRoute(fromLat, fromLng, toLat, toLng);
        if (osrmRoute) {
            return {
                mins: osrmRoute.mins,
                meters: osrmRoute.meters,
                miles: osrmRoute.miles,
                source: 'osrm'
            };
        }

        // Fallback to estimate (Haversine * 1.35 for NYC grid)
        const straightLine = calculateDistance(fromLat, fromLng, toLat, toLng);
        const adjustedMiles = straightLine * 1.35;
        return {
            mins: Math.round(adjustedMiles * WALK_MINS_PER_MILE),
            meters: Math.round(adjustedMiles * 1609.34),
            miles: Math.round(adjustedMiles * 100) / 100,
            source: 'estimate'
        };
    },

    async calculateFromOrigin(lat, lng, name, targetMic = null, options = {}) {
        const { silent = false, skipOriginMarker = false } = options;

        // NYC bounds check - don't call transit API if user is outside NYC
        const NYC_BOUNDS = {
            north: 40.92,  // Bronx
            south: 40.49,  // Staten Island
            east: -73.70,  // Queens
            west: -74.26   // Staten Island
        };

        const isInNYC = lat >= NYC_BOUNDS.south && lat <= NYC_BOUNDS.north &&
                        lng >= NYC_BOUNDS.west && lng <= NYC_BOUNDS.east;

        if (!isInNYC) {
            console.log('User outside NYC bounds, skipping transit calculations');
            // Still set origin for UI purposes but don't calculate routes
            STATE.userOrigin = { lat, lng, name };
            STATE.isTransitMode = false;
            return;
        }

        STATE.userOrigin = { lat, lng, name };
        STATE.isTransitMode = true;
        STATE.isCalculatingTransit = true;

        // Show commute filter button
        if (typeof updateTransitButtonUI === 'function') {
            updateTransitButtonUI(true);
        }

        // Show commute loading toast
        this.showCommuteLoading();

        // Only show loading state in list and fly if not silent (background) mode
        if (!silent) {
            this.showLoadingState();
            if (!skipOriginMarker) this.addOriginMarker(lat, lng, name);
            map.flyTo([lat, lng], 14, { duration: 1.2 });
        } else {
            // Silent mode: add marker if not skipped, no fly
            if (!skipOriginMarker) this.addOriginMarker(lat, lng, name);
        }

        // Check offline before starting
        if (this.isOffline()) {
            if (typeof toastService !== 'undefined') {
                toastService.show('Offline - using estimated times', 'warning');
            }
            this.applyFallbackTimes();
            STATE.isCalculatingTransit = false;
            render(STATE.currentMode);
            return;
        }

        try {
            // Calculate Dijkstra routes for all mics
            await this.calculateAllRoutes(lat, lng, silent);
        } catch (error) {
            console.error('Transit calculation failed:', error);
            if (typeof toastService !== 'undefined') {
                toastService.show('Using estimated times', 'warning');
            }
            this.applyFallbackTimes();
        }

        STATE.isCalculatingTransit = false;

        // Hide commute loading toast
        this.hideCommuteLoading();

        render(STATE.currentMode);

        // Background preload: Calculate routes for other days
        this.preloadOtherDays(lat, lng);
    },

    // Preload routes for other days in the background
    async preloadOtherDays(userLat, userLng) {
        // Wait 2 seconds before starting background loading
        await new Promise(r => setTimeout(r, 2000));

        const currentTime = new Date();
        const todayName = CONFIG.dayNames[currentTime.getDay()];
        const tomorrowName = CONFIG.dayNames[(currentTime.getDay() + 1) % 7];

        // Determine which days to preload based on current mode
        const modesMap = {
            'today': ['tomorrow'],     // If viewing today, preload tomorrow
            'tomorrow': ['today'],     // If viewing tomorrow, preload today
            'calendar': ['today', 'tomorrow']  // If viewing calendar, preload both
        };

        const modesToPreload = modesMap[STATE.currentMode] || [];

        for (const mode of modesToPreload) {
            // Get mics for this mode that don't have routes yet
            const dayName = mode === 'today' ? todayName : tomorrowName;
            const micsToLoad = STATE.mics.filter(m => {
                // Only load if: correct day AND no route data from this origin
                if (m.day !== dayName) return false;

                if (m.transitMins !== undefined && m.transitOrigin) {
                    const originMatch =
                        Math.abs(m.transitOrigin.lat - userLat) < 0.0001 &&
                        Math.abs(m.transitOrigin.lng - userLng) < 0.0001;
                    if (originMatch) return false; // Already cached
                }
                return true;
            });

            if (micsToLoad.length > 0) {
                console.log(`Background preloading ${micsToLoad.length} mics for ${mode}`);
                await this.calculateRoutesForMics(micsToLoad, userLat, userLng, 20); // Slower batch size for background
            }
        }
    },

    // Calculate routes for a specific set of mics
    async calculateRoutesForMics(mics, userLat, userLng, batchSize = 15) {
        const WALK_MINS_PER_MILE = 20;

        for (let i = 0; i < mics.length; i += batchSize) {
            const batch = mics.slice(i, i + batchSize);

            await Promise.all(batch.map(async (mic) => {
                const distance = calculateDistance(userLat, userLng, mic.lat, mic.lng);

                if (distance < 0.5) {
                    const walkData = await this.getWalkingTime(userLat, userLng, mic.lat, mic.lng);
                    mic.transitMins = walkData.mins;
                    mic.transitSeconds = walkData.mins * 60;
                    mic.transitType = 'walk';
                    mic.walkData = walkData;
                    mic.route = null;
                    mic.transitOrigin = { lat: userLat, lng: userLng };
                    return;
                }

                try {
                    const route = await this.fetchSubwayRoute(userLat, userLng, mic.lat, mic.lng);

                    if (route) {
                        // Use adjustedTotalTime (includes wait times) if available
                        const totalMins = route.adjustedTotalTime || route.totalTime;
                        mic.transitMins = totalMins;
                        mic.transitSeconds = totalMins * 60;
                        mic.transitType = 'transit';
                        mic.route = route;
                    } else {
                        mic.transitMins = Math.round(distance * WALK_MINS_PER_MILE);
                        mic.transitSeconds = mic.transitMins * 60;
                        mic.transitType = 'estimate';
                        mic.route = null;
                    }
                    mic.transitOrigin = { lat: userLat, lng: userLng };
                } catch (error) {
                    mic.transitMins = Math.round(distance * WALK_MINS_PER_MILE);
                    mic.transitSeconds = mic.transitMins * 60;
                    mic.transitType = 'estimate';
                    mic.route = null;
                    mic.transitOrigin = { lat: userLat, lng: userLng };
                }
            }));

            // Longer delay for background processing
            if (i + batchSize < mics.length) {
                await new Promise(r => setTimeout(r, 50));
            }
        }
    },

    // Calculate Dijkstra routes for all mics in batches
    async calculateAllRoutes(userLat, userLng, silent = false) {
        // BATCH_SIZE = 15 for progressive loading
        const BATCH_SIZE = 15;

        // Abort previous calculation if user searches again
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        // OPTIMIZATION: Filter by current mode AND skip already-calculated routes
        const currentTime = new Date();
        const todayName = CONFIG.dayNames[currentTime.getDay()];
        const tomorrowName = CONFIG.dayNames[(currentTime.getDay() + 1) % 7];

        const mics = STATE.mics.filter(m => {
            // Skip if already has route data from this location
            if (m.transitMins !== undefined && m.transitOrigin) {
                const originMatch =
                    Math.abs(m.transitOrigin.lat - userLat) < 0.0001 &&
                    Math.abs(m.transitOrigin.lng - userLng) < 0.0001;
                if (originMatch) return false; // Already calculated from this location
            }

            const diffMins = m.start ? (m.start - currentTime) / 60000 : 999;

            // Filter by current mode
            if (STATE.currentMode === 'today') {
                if (diffMins < -60) return false; // Skip deep past
                return m.day === todayName;
            }
            if (STATE.currentMode === 'tomorrow') {
                return m.day === tomorrowName;
            }
            if (STATE.currentMode === 'calendar') {
                const selectedDate = new Date(STATE.selectedCalendarDate);
                const selectedDayName = CONFIG.dayNames[selectedDate.getDay()];
                return m.day === selectedDayName;
            }
            return true; // 'all' mode
        });

        for (let i = 0; i < mics.length; i += BATCH_SIZE) {
            // Check if aborted
            if (signal.aborted) {
                return;
            }

            // Check if went offline
            if (!navigator.onLine) {
                this.applyFallbackTimes();
                return;
            }

            const batch = mics.slice(i, i + BATCH_SIZE);

            // Update progress
            this.updateToastProgress(Math.min(i + BATCH_SIZE, mics.length), mics.length);
            if (!silent) {
                this.updateProgress(i, mics.length);
            }

            // Process batch in parallel
            await Promise.all(batch.map(async (mic) => {
                // Check if walkable first (< 0.5 miles straight line)
                const distance = calculateDistance(userLat, userLng, mic.lat, mic.lng);
                if (distance < 0.5) {
                    // Get accurate walking time from OSRM
                    const walkData = await this.getWalkingTime(userLat, userLng, mic.lat, mic.lng);
                    mic.transitMins = walkData.mins;
                    mic.transitSeconds = walkData.mins * 60;
                    mic.transitType = 'walk';
                    mic.walkData = walkData; // Store for display
                    mic.route = null;
                    mic.transitOrigin = { lat: userLat, lng: userLng }; // Cache origin
                    return;
                }

                // Get exact route via Dijkstra
                try {
                    const route = await this.fetchSubwayRoute(
                        userLat, userLng,
                        mic.lat, mic.lng
                    );

                    if (route) {
                        // Success - use exact time (adjustedTotalTime includes wait times)
                        const totalMins = route.adjustedTotalTime || route.totalTime;
                        mic.transitMins = totalMins;
                        mic.transitSeconds = totalMins * 60;
                        mic.transitType = 'transit';
                        mic.route = route; // Store for modal detail view
                    } else {
                        // API returned null - use fallback
                        mic.transitMins = Math.round(distance * WALK_MINS_PER_MILE);
                        mic.transitSeconds = mic.transitMins * 60;
                        mic.transitType = 'estimate';
                        mic.route = null;
                    }
                    mic.transitOrigin = { lat: userLat, lng: userLng }; // Cache origin
                } catch (error) {
                    // Network error, timeout, or server error - use fallback
                    mic.transitMins = Math.round(distance * WALK_MINS_PER_MILE);
                    mic.transitSeconds = mic.transitMins * 60;
                    mic.transitType = 'estimate';
                    mic.route = null;
                    mic.transitOrigin = { lat: userLat, lng: userLng }; // Cache origin
                }
            }));

            // 10ms delay between batches (local OSRM is fast)
            if (i + BATCH_SIZE < mics.length) {
                await new Promise(r => setTimeout(r, 10));
            }
        }
    },

    // Update loading UI with progress
    updateProgress(current, total) {
        const percent = Math.round((current / total) * 100);
        const container = document.getElementById('list-content');
        if (container) {
            container.innerHTML = `
                <div class="transit-loading">
                    <div class="loading-spinner"></div>
                    <span>Calculating routes... ${current}/${total} (${percent}%)</span>
                </div>
            `;
        }
    },

    // Fallback when offline or API fails
    applyFallbackTimes() {
        STATE.mics.forEach(mic => {
            const dist = calculateDistance(
                STATE.userOrigin.lat, STATE.userOrigin.lng,
                mic.lat, mic.lng
            );
            mic.transitMins = Math.round(dist * WALK_MINS_PER_MILE);
            mic.transitSeconds = mic.transitMins * 60;
            mic.transitType = 'estimate';
            mic.route = null;
        });
    },

    addOriginMarker(lat, lng, name) {
        // Clear any existing origin/search marker
        if (STATE.searchMarker) {
            map.removeLayer(STATE.searchMarker);
            STATE.searchMarker = null;
        }
        // Also clear user location marker to prevent duplicates
        if (STATE.userMarker) {
            map.removeLayer(STATE.userMarker);
            STATE.userMarker = null;
        }

        const originIcon = L.divIcon({
            className: 'origin-marker',
            html: `
                <div class="origin-pin">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
                        <path d="M12 2L2 22l10-2 10 2L12 2z"/>
                    </svg>
                </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18]
        });

        STATE.searchMarker = L.marker([lat, lng], { icon: originIcon, zIndexOffset: 50 })
            .addTo(map)
            .bindTooltip(name, { direction: 'top', offset: [0, -20], className: 'origin-tooltip' });
    },

    clearTransitMode() {
        STATE.userOrigin = null;
        STATE.isTransitMode = false;

        // Abort any ongoing calculation
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        // Clear all origin-related markers
        if (STATE.searchMarker) {
            map.removeLayer(STATE.searchMarker);
            STATE.searchMarker = null;
        }
        if (STATE.userMarker) {
            map.removeLayer(STATE.userMarker);
            STATE.userMarker = null;
        }

        STATE.mics.forEach(mic => {
            delete mic.transitSeconds;
            delete mic.transitMins;
            delete mic.transitType;
            delete mic.route;
        });

        // Reset search input
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.value = '';
            searchInput.placeholder = 'Search venues or places';
        }
        render(STATE.currentMode);
    },

    expandNeighborhoods() {
        STATE.transitExpanded = true;
        render(STATE.currentMode);
    },

    showLoadingState() {
        const container = document.getElementById('list-content');
        if (container) {
            container.innerHTML = `
                <div class="transit-loading">
                    <div class="loading-spinner"></div>
                    <span>Calculating transit times...</span>
                </div>
            `;
        }
    },

    showCommuteLoading() {
        const toast = document.getElementById('commute-toast');
        if (toast) toast.classList.add('active');
    },

    hideCommuteLoading() {
        const toast = document.getElementById('commute-toast');
        const progress = document.getElementById('commute-toast-progress');
        if (toast) toast.classList.remove('active');
        if (progress) progress.textContent = '';
    },

    updateToastProgress(current, total) {
        const progress = document.getElementById('commute-toast-progress');
        if (progress) {
            progress.textContent = `${current} of ${total} routes`;
        }
    }
};
