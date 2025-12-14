/* =================================================================
   TRANSIT SERVICE - Dijkstra-based routing

   Uses exact coordinates for accurate subway routing:
   1. User's exact location → find nearest subway station
   2. Dijkstra pathfinding → venue's exact coordinates
   3. No estimation, no clusters, no pre-computed matrices

   ================================================================= */

// CONSTANTS
const WALK_MINS_PER_MILE = 20;      // ~3 mph walking pace

// OSRM Walking API - use local server in dev, public API in production
const isLocalDevTransit = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const OSRM_FOOT_API = isLocalDevTransit
    ? 'http://localhost:5001/route/v1/foot'
    : 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';

const transitService = {

    // Walking route cache
    walkCache: {},

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
        // Cache key: round to 4 decimals (~11 meter precision)
        const cacheKey = `${userLat.toFixed(4)},${userLng.toFixed(4)}|${venueLat.toFixed(4)},${venueLng.toFixed(4)}`;

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

            // 5-second timeout for Dijkstra calculation
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

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
                console.error('Route calculation timeout (>5s)');
            } else {
                console.error('Route fetch failed:', error.message);
            }
            // Don't cache failures - allow retry
            return null;
        }
    },

    // Fetch accurate walking time from OSRM foot API
    async fetchWalkingRoute(fromLat, fromLng, toLat, toLng) {
        // Cache key
        const cacheKey = `walk:${fromLat.toFixed(4)},${fromLng.toFixed(4)}|${toLat.toFixed(4)},${toLng.toFixed(4)}`;

        // Return cached result if available
        if (this.walkCache[cacheKey]) {
            return this.walkCache[cacheKey];
        }

        try {
            const url = `${OSRM_FOOT_API}/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'MicMap-NYC/1.0',
                    'Referer': 'https://micmap.nyc'
                }
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`OSRM walk API error: ${response.status}`);
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
            return null;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('OSRM walk timeout');
            } else {
                console.warn('OSRM walk error:', error.message);
            }
            return null;
        }
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

    async calculateFromOrigin(lat, lng, name, targetMic = null) {
        STATE.userOrigin = { lat, lng, name };
        STATE.isTransitMode = true;
        STATE.isCalculatingTransit = true;

        // Show commute filter button
        if (typeof updateTransitButtonUI === 'function') {
            updateTransitButtonUI(true);
        }

        this.showLoadingState();
        this.addOriginMarker(lat, lng, name);
        map.flyTo([lat, lng], 13, { duration: 1.2 });

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
            await this.calculateAllRoutes(lat, lng);
        } catch (error) {
            console.error('Transit calculation failed:', error);
            if (typeof toastService !== 'undefined') {
                toastService.show('Using estimated times', 'warning');
            }
            this.applyFallbackTimes();
        }

        STATE.isCalculatingTransit = false;
        render(STATE.currentMode);
    },

    // Calculate Dijkstra routes for all mics in batches
    async calculateAllRoutes(userLat, userLng) {
        // BATCH_SIZE = 30 since we have local OSRM (fast)
        // If using remote APIs, reduce to 10
        const BATCH_SIZE = 30;

        // Abort previous calculation if user searches again
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        const mics = STATE.mics;

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
            this.updateProgress(i, mics.length);

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
                    return;
                }

                // Get exact route via Dijkstra
                try {
                    const route = await this.fetchSubwayRoute(
                        userLat, userLng,
                        mic.lat, mic.lng
                    );

                    if (route) {
                        // Success - use exact time
                        mic.transitMins = route.totalTime;
                        mic.transitSeconds = route.totalTime * 60;
                        mic.transitType = 'transit';
                        mic.route = route; // Store for modal detail view
                    } else {
                        // API returned null - use fallback
                        mic.transitMins = Math.round(distance * WALK_MINS_PER_MILE);
                        mic.transitSeconds = mic.transitMins * 60;
                        mic.transitType = 'estimate';
                        mic.route = null;
                    }
                } catch (error) {
                    // Network error, timeout, or server error - use fallback
                    mic.transitMins = Math.round(distance * WALK_MINS_PER_MILE);
                    mic.transitSeconds = mic.transitMins * 60;
                    mic.transitType = 'estimate';
                    mic.route = null;
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
        if (STATE.searchMarker) {
            map.removeLayer(STATE.searchMarker);
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

        STATE.searchMarker = L.marker([lat, lng], { icon: originIcon, zIndexOffset: 2000 })
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

        if (STATE.searchMarker) {
            map.removeLayer(STATE.searchMarker);
            STATE.searchMarker = null;
        }

        STATE.mics.forEach(mic => {
            delete mic.transitSeconds;
            delete mic.transitMins;
            delete mic.transitType;
            delete mic.route;
        });

        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = '';
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
    }
};
