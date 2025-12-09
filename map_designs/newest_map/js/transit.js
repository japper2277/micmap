/* =================================================================
   TRANSIT SERVICE

   KEY FEATURES:
   1. 3-Hour Threshold - Live API for urgent, Matrix for planning
   2. Micro-Cluster Matrix - ~65 clusters, ~98% accuracy
   3. Dynamic Walk Threshold - User preference + same-cluster bonus
   4. Slug-based Matching - Handles venue name variations
   5. Dynamic Snapping - New venues auto-snap to nearest cluster

   ================================================================= */

// CONSTANTS
const WALK_MINS_PER_MILE = 20;      // ~3 mph walking pace
const SUBWAY_MINS_PER_MILE = 4;     // ~15 mph avg including stops

const WALK_PREFERENCES = {
    '10min': 0.5,   // ~10 min walk
    '15min': 0.75,  // ~15 min walk (default)
    '20min': 1.0,   // ~20 min walk
    'none': 0       // Always show transit times
};

const transitService = {

    // Cluster limits for API calls
    INITIAL_HUB_LIMIT: 5,
    EXPANDED_HUB_LIMIT: 10,

    isOffline() {
        return !navigator.onLine;
    },

    async calculateFromOrigin(lat, lng, name, targetMic = null) {
        // Wait for transit data if not loaded yet
        if (!TRANSIT_DATA) {
            await loadTransitData();
        }

        STATE.userOrigin = { lat, lng, name };
        STATE.isTransitMode = true;
        STATE.isCalculatingTransit = true;

        // Track target venue for guaranteed visibility
        STATE.targetVenueHood = targetMic ? (targetMic.neighborhood || targetMic.hood) : null;

        // Reset expansion state for new search
        STATE.transitExpanded = false;

        this.showLoadingState();
        this.addOriginMarker(lat, lng, name);
        map.flyTo([lat, lng], 13, { duration: 1.2 });

        // Distance-based cache: reuse if within 0.1 miles of last search
        let cacheKey = null;
        const CACHE_REUSE_THRESHOLD = 0.1;

        for (const key in STATE.transitCache) {
            const [cachedLat, cachedLng] = key.split(',').map(Number);
            if (calculateDistance(lat, lng, cachedLat, cachedLng) < CACHE_REUSE_THRESHOLD) {
                cacheKey = key;
                break;
            }
        }

        if (!cacheKey) {
            cacheKey = `${lat},${lng}`;
            STATE.transitCache[cacheKey] = {};
        }

        // Offline Mode
        if (this.isOffline()) {
            if (typeof toastService !== 'undefined') {
                toastService.show('Offline - using estimated times', 'warning');
            }
            STATE.transitTimes = this.getAllFallbackTimes(lat, lng);
            this.applyTransitTimesToMics();
            STATE.isCalculatingTransit = false;
            render(STATE.currentMode);
            return;
        }

        try {
            const clusterTimes = await this.fetchBatchTransitTimes(lat, lng, cacheKey, targetMic);
            Object.assign(STATE.transitCache[cacheKey], clusterTimes);
            STATE.transitTimes = STATE.transitCache[cacheKey];
            this.applyTransitTimesToMics();
        } catch (error) {
            console.error('Transit calculation failed:', error);
            if (typeof toastService !== 'undefined') {
                toastService.show('Using estimated times', 'warning');
            }
            STATE.transitTimes = this.getAllFallbackTimes(lat, lng);
            this.applyTransitTimesToMics();
        }

        STATE.isCalculatingTransit = false;
        render(STATE.currentMode);
    },

    // Called when user clicks "Show more"
    async expandNeighborhoods() {
        if (!STATE.userOrigin) return;

        STATE.transitExpanded = true;
        STATE.isCalculatingTransit = true;
        this.showLoadingState();

        const { lat, lng } = STATE.userOrigin;

        let cacheKey = null;
        const CACHE_REUSE_THRESHOLD = 0.1;
        for (const key in STATE.transitCache) {
            const [cachedLat, cachedLng] = key.split(',').map(Number);
            if (calculateDistance(lat, lng, cachedLat, cachedLng) < CACHE_REUSE_THRESHOLD) {
                cacheKey = key;
                break;
            }
        }
        if (!cacheKey) cacheKey = `${lat},${lng}`;

        try {
            const clusterTimes = await this.fetchBatchTransitTimes(lat, lng, cacheKey, null);
            Object.assign(STATE.transitCache[cacheKey], clusterTimes);
            STATE.transitTimes = STATE.transitCache[cacheKey];
            this.applyTransitTimesToMics();
        } catch (error) {
            console.error('Expand failed:', error);
            if (typeof toastService !== 'undefined') {
                toastService.show('Could not load more neighborhoods', 'error');
            }
        }

        STATE.isCalculatingTransit = false;
        render(STATE.currentMode);
    },

    async fetchBatchTransitTimes(originLat, originLng, cacheKey, targetMic = null) {
        if (!TRANSIT_DATA) return {};

        // NEW: Use pre-computed station-based matrix (NO API CALLS!)
        const nearestStation = getNearestStation(originLat, originLng);

        if (!nearestStation) {
            console.log('No nearby station found - using distance estimates');
            return this.getAllFallbackTimes(originLat, originLng);
        }

        console.log(`Using pre-computed data from: ${nearestStation.name} (${nearestStation.distance.toFixed(2)} mi away)`);

        // Get all pre-computed times from this station
        const stationMatrix = TRANSIT_DATA.matrix[nearestStation.id];
        if (!stationMatrix) {
            console.warn('No matrix data for station:', nearestStation.id);
            return this.getAllFallbackTimes(originLat, originLng);
        }

        // Return all cluster times from this station
        const clusterTimes = {};
        for (const [clusterId, seconds] of Object.entries(stationMatrix)) {
            if (seconds !== null) {
                clusterTimes[clusterId] = seconds;
            }
        }

        console.log(`✅ Loaded ${Object.keys(clusterTimes).length} pre-computed transit times (FREE!)`);
        return clusterTimes;
    },

    applyTransitTimesToMics() {
        const now = new Date();
        const userWalkMiles = WALK_PREFERENCES[STATE.walkPreference] || 0.75;
        const userClusterId = getUserClusterId(STATE.userOrigin.lat, STATE.userOrigin.lng);

        STATE.mics.forEach(mic => {
            const directDist = calculateDistance(
                STATE.userOrigin.lat, STATE.userOrigin.lng,
                mic.lat, mic.lng
            );

            // Dynamic Walk Threshold with Borough-based river protection
            const micClusterId = resolveClusterId(mic);
            const isSameCluster = micClusterId === userClusterId;

            const userCluster = TRANSIT_DATA?.clusters[userClusterId];
            const micCluster = TRANSIT_DATA?.clusters[micClusterId];
            const sameBorough = userCluster?.borough === micCluster?.borough;

            let walkThreshold;
            if (STATE.walkPreference === 'none') {
                walkThreshold = 0;
            } else if (!sameBorough) {
                walkThreshold = 0; // Different boroughs = force transit
            } else {
                walkThreshold = isSameCluster ? userWalkMiles : userWalkMiles * 0.5;
            }

            if (directDist < walkThreshold) {
                mic.transitMins = Math.round(directDist * WALK_MINS_PER_MILE);
                mic.transitSeconds = mic.transitMins * 60;
                mic.transitType = 'walk';
                return;
            }

            // 3-Hour Threshold: Live API vs Matrix
            const timeUntilStart = mic.start ? (mic.start - now) / (1000 * 60 * 60) : 999;

            if (timeUntilStart <= 3 || STATE.transitExpanded) {
                this.applyLiveApiTime(mic);
            } else {
                this.applyMatrixTime(mic);
            }
        });
    },

    // Blue badge - Pre-computed transit data (was Live API, now uses matrix)
    applyLiveApiTime(mic) {
        const clusterId = resolveClusterId(mic);
        let clusterTime = clusterId !== null ? STATE.transitTimes[clusterId] : undefined;

        if (clusterTime !== undefined && clusterTime !== null) {
            // Add walk time from station to destination cluster, then to venue
            const nearestStation = getNearestStation(STATE.userOrigin.lat, STATE.userOrigin.lng);
            const walkToStation = nearestStation ? Math.ceil(nearestStation.distance * WALK_MINS_PER_MILE * 60) : 300;

            if (clusterId !== null && TRANSIT_DATA) {
                const cluster = TRANSIT_DATA.clusters.find(c => c.id === clusterId);
                if (cluster) {
                    const walkDistMiles = calculateDistance(cluster.lat, cluster.lng, mic.lat, mic.lng);
                    const walkToDest = Math.ceil(walkDistMiles * WALK_MINS_PER_MILE * 60);
                    mic.transitSeconds = walkToStation + clusterTime + walkToDest;
                    mic.transitMins = Math.round(mic.transitSeconds / 60);
                } else {
                    mic.transitSeconds = walkToStation + clusterTime;
                    mic.transitMins = Math.round(mic.transitSeconds / 60);
                }
            } else {
                mic.transitSeconds = clusterTime;
                mic.transitMins = Math.round(clusterTime / 60);
            }
            mic.transitType = 'transit';
        } else {
            this.applyMatrixTime(mic);
        }
    },

    // Gray badge - Matrix lookup (FREE - uses pre-computed station data)
    applyMatrixTime(mic) {
        if (!TRANSIT_DATA) {
            const dist = calculateDistance(STATE.userOrigin.lat, STATE.userOrigin.lng, mic.lat, mic.lng);
            mic.transitMins = Math.round(dist * WALK_MINS_PER_MILE);
            mic.transitSeconds = mic.transitMins * 60;
            mic.transitType = 'estimate';
            return;
        }

        const destClusterId = resolveClusterId(mic);
        if (destClusterId === null) {
            const dist = calculateDistance(STATE.userOrigin.lat, STATE.userOrigin.lng, mic.lat, mic.lng);
            mic.transitMins = Math.round(dist * WALK_MINS_PER_MILE);
            mic.transitSeconds = mic.transitMins * 60;
            mic.transitType = 'estimate';
            return;
        }

        // NEW: Use station-based pre-computed matrix
        const nearestStation = getNearestStation(STATE.userOrigin.lat, STATE.userOrigin.lng);
        const destCluster = TRANSIT_DATA.clusters.find(c => c.id === destClusterId);

        if (!destCluster) {
            const dist = calculateDistance(STATE.userOrigin.lat, STATE.userOrigin.lng, mic.lat, mic.lng);
            mic.transitMins = Math.round(dist * SUBWAY_MINS_PER_MILE);
            mic.transitSeconds = mic.transitMins * 60;
            mic.transitType = 'estimate';
            return;
        }

        // Walk to nearest station
        let walkToStation = 0;
        let rideTime = null;

        if (nearestStation && TRANSIT_DATA.matrix[nearestStation.id]) {
            // Use pre-computed time from nearest station
            walkToStation = Math.ceil(nearestStation.distance * WALK_MINS_PER_MILE);
            rideTime = TRANSIT_DATA.matrix[nearestStation.id][destClusterId];

            // Convert seconds to minutes if needed
            if (rideTime !== null && rideTime !== undefined) {
                rideTime = Math.round(rideTime / 60);
            }
        }

        // Fallback: estimate based on distance
        if (rideTime === null || rideTime === undefined) {
            const dist = calculateDistance(STATE.userOrigin.lat, STATE.userOrigin.lng, destCluster.lat, destCluster.lng);
            rideTime = Math.round(dist * SUBWAY_MINS_PER_MILE);
            walkToStation = 5; // Assume 5 min walk to subway
        }

        // Night Owl Penalty (+15 min for late night mics)
        const hour = mic.start ? mic.start.getHours() : 0;
        if (rideTime && (hour >= 23 || hour < 5)) {
            rideTime += 15;
        }

        // Walk from destination cluster to venue
        const destClusterToVenue = calculateDistance(
            destCluster.lat, destCluster.lng,
            mic.lat, mic.lng
        );
        const walkToDest = Math.ceil(destClusterToVenue * WALK_MINS_PER_MILE);

        mic.transitMins = walkToStation + rideTime + walkToDest;
        mic.transitSeconds = mic.transitMins * 60;
        mic.transitType = nearestStation ? 'transit' : 'estimate';
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
        STATE.transitTimes = {};
        STATE.transitExpanded = false;

        if (STATE.searchMarker) {
            map.removeLayer(STATE.searchMarker);
            STATE.searchMarker = null;
        }

        STATE.mics.forEach(mic => {
            delete mic.transitSeconds;
            delete mic.transitMins;
            delete mic.transitType;
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
    },

    getAllFallbackTimes(originLat, originLng) {
        if (!TRANSIT_DATA) return {};

        const clusterTimes = {};
        TRANSIT_DATA.clusters.forEach(cluster => {
            const distMiles = calculateDistance(originLat, originLng, cluster.lat, cluster.lng);
            clusterTimes[cluster.id] = Math.round(distMiles * SUBWAY_MINS_PER_MILE * 60);
        });
        return clusterTimes;
    }
};
