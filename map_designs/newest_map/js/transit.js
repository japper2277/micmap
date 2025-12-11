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

    // Call subway router API for accurate Dijkstra-based routing
    async fetchSubwayRoute(userLat, userLng, venueLat, venueLng) {
        try {
            const url = `http://localhost:3001/api/subway/routes?userLat=${userLat}&userLng=${userLng}&venueLat=${venueLat}&venueLng=${venueLng}`;
            const response = await fetch(url);
            if (!response.ok) return null;
            const data = await response.json();
            return data.routes && data.routes.length > 0 ? data.routes[0] : null;
        } catch (error) {
            console.error('Subway router API error:', error);
            return null;
        }
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
            // Fetch live arrivals for user's nearest stations (for accurate wait times)
            await this.fetchUserArrivals(lat, lng);

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
        if (!stationMatrix || Object.keys(stationMatrix).length === 0) {
            console.warn('No matrix data for station:', nearestStation.id, '- using distance fallback');
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

            const userCluster = TRANSIT_DATA?.clusters?.find(c => c.id === userClusterId);
            const micCluster = TRANSIT_DATA?.clusters?.find(c => c.id === micClusterId);
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

    // Fetch live arrivals for user's nearest stations
    async fetchUserArrivals(lat, lng) {
        const stations = getStationsNearUser(lat, lng, 2);
        STATE.userArrivals = {};
        STATE.userStations = stations;

        for (const station of stations) {
            const lineMatch = station.name.match(/\(([^)]+)\)/);
            if (!lineMatch) continue;

            const lines = lineMatch[1].split(' ').filter(l => l.length > 0);

            // Fetch arrivals for ALL lines - NEVER GUESS, use real-time data
            let allArrivals = [];
            const linesWithService = [];

            for (const line of lines) {
                try {
                    const lineArrivals = await mtaService.fetchArrivals(line, station.gtfsStopId);
                    if (lineArrivals && lineArrivals.length > 0) {
                        lineArrivals.forEach(a => a.line = line);
                        allArrivals.push(...lineArrivals);
                        if (!linesWithService.includes(line)) {
                            linesWithService.push(line);
                        }
                    }
                } catch (e) {
                    // Line has no service right now - skip it
                }
            }

            // Sort by arrival time
            allArrivals.sort((a, b) => a.minsAway - b.minsAway);

            STATE.userArrivals[station.id] = {
                station,
                lines: linesWithService.length > 0 ? linesWithService : lines,
                arrivals: allArrivals
            };
        }
    },

    // Blue badge - Uses live arrivals + calculateLiveCommute (same as modal)
    applyLiveApiTime(mic) {
        const clusterId = resolveClusterId(mic);
        if (clusterId === null) {
            this.applyMatrixTime(mic);
            return;
        }

        const venueCluster = TRANSIT_DATA?.clusters?.find(c => c.id === clusterId);
        if (!venueCluster) {
            this.applyMatrixTime(mic);
            return;
        }

        // Use live arrivals if available
        if (STATE.userArrivals && STATE.userStations?.length > 0) {
            let bestTime = Infinity;

            for (const station of STATE.userStations) {
                const stationData = STATE.userArrivals[station.id];
                if (!stationData || !stationData.arrivals?.length) continue;

                // Filter arrivals by direction toward venue
                const primaryLine = stationData.lines[0];
                const neededDirection = getDirectionToward(station, venueCluster, primaryLine);
                let filteredArrivals = stationData.arrivals.filter(a => a.direction === neededDirection);
                if (filteredArrivals.length === 0) filteredArrivals = stationData.arrivals;

                // Calculate walk time
                const walkMins = Math.ceil(calculateDistance(
                    STATE.userOrigin.lat, STATE.userOrigin.lng,
                    station.lat, station.lng
                ) * WALK_MINS_PER_MILE);

                // Filter catchable trains (same logic as modal)
                const minCatchableTime = walkMins <= 3 ? walkMins : (walkMins - 2);
                filteredArrivals = filteredArrivals.filter(a => a.minsAway >= minCatchableTime);

                if (filteredArrivals.length === 0) continue;

                // Use calculateLiveCommute (same as modal)
                const commute = calculateLiveCommute({
                    userLat: STATE.userOrigin.lat,
                    userLng: STATE.userOrigin.lng,
                    stationLat: station.lat,
                    stationLng: station.lng,
                    stationId: station.id,
                    arrivals: filteredArrivals,
                    clusterId: clusterId,
                    venueLat: mic.lat,
                    venueLng: mic.lng
                });

                if (commute.total < bestTime) {
                    bestTime = commute.total;
                }
            }

            if (bestTime < Infinity) {
                mic.transitMins = bestTime;
                mic.transitSeconds = bestTime * 60;
                mic.transitType = 'transit';
                return;
            }
        }

        // Fallback to matrix if no live arrivals
        this.applyMatrixTime(mic);
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

        // Estimated wait time for train (avg ~4 min for NYC subway)
        const estimatedWait = 4;

        mic.transitMins = walkToStation + estimatedWait + rideTime + walkToDest;
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
