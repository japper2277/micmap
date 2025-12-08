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

        // 1. Get visible mics + target mic (Ghost Venue fix)
        const visibleMics = STATE.mics.filter(mic => isMicVisible(mic));
        if (targetMic && !visibleMics.find(m => m.id === targetMic.id)) {
            visibleMics.push(targetMic);
        }

        // 2. Get unique cluster IDs needed
        const neededClusterIds = new Set();
        visibleMics.forEach(mic => {
            const clusterId = resolveClusterId(mic);
            if (clusterId !== null) neededClusterIds.add(clusterId);
        });

        // 3. SMART DELTA: Filter out already-cached clusters
        const currentCache = STATE.transitCache[cacheKey] || {};
        const clustersToFetch = [...neededClusterIds].filter(clusterId => {
            return currentCache[clusterId] === undefined;
        });

        if (clustersToFetch.length === 0) {
            console.log('All clusters cached - no API call needed');
            return {};
        }

        // 4. Map cluster IDs to coordinates and calculate distances
        let targets = clustersToFetch
            .map(clusterId => {
                const cluster = TRANSIT_DATA.clusters[clusterId];
                if (!cluster) return null;
                return {
                    id: clusterId,
                    name: cluster.name,
                    lat: cluster.lat,
                    lng: cluster.lng,
                    dist: calculateDistance(originLat, originLng, cluster.lat, cluster.lng)
                };
            })
            .filter(t => t !== null);

        // 5. Urgent Mic Priority (<3 hrs)
        const now = new Date();
        const urgentClusterIds = new Set();
        visibleMics.forEach(mic => {
            if (mic.start && (mic.start - now) / 36e5 <= 3) {
                const clusterId = resolveClusterId(mic);
                if (clusterId !== null) urgentClusterIds.add(clusterId);
            }
        });

        const urgentTargets = targets.filter(t => urgentClusterIds.has(t.id));
        const nonUrgentTargets = targets.filter(t => !urgentClusterIds.has(t.id));
        nonUrgentTargets.sort((a, b) => a.dist - b.dist);

        // 6. Apply cluster limit
        const clusterLimit = STATE.transitExpanded ? this.EXPANDED_HUB_LIMIT : this.INITIAL_HUB_LIMIT;
        let finalTargets = [...urgentTargets, ...nonUrgentTargets].slice(0, clusterLimit);

        // 7. Always include target venue's cluster
        if (targetMic) {
            const targetClusterId = resolveClusterId(targetMic);
            const targetInList = finalTargets.some(t => t.id === targetClusterId);
            if (!targetInList && targetClusterId !== null) {
                const targetCluster = TRANSIT_DATA.clusters[targetClusterId];
                if (targetCluster) {
                    finalTargets = [...finalTargets.slice(0, clusterLimit - 1), {
                        id: targetClusterId,
                        name: targetCluster.name,
                        lat: targetCluster.lat,
                        lng: targetCluster.lng,
                        dist: calculateDistance(originLat, originLng, targetCluster.lat, targetCluster.lng)
                    }];
                }
            }
        }

        console.log(`Fetching ${finalTargets.length} clusters (${STATE.transitExpanded ? 'expanded' : 'initial'})`);

        if (finalTargets.length === 0) return {};

        // 8. API call
        const res = await fetch(`${CONFIG.apiBase}/api/proxy/transit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                originLat,
                originLng,
                destinations: finalTargets.map(t => ({ name: t.name, lat: t.lat, lng: t.lng }))
            })
        });

        if (!res.ok) throw new Error(`Transit proxy error: ${res.status}`);

        const data = await res.json();
        const clusterTimes = {};

        if (data.times) {
            data.times.forEach((t, i) => {
                clusterTimes[finalTargets[i].id] = t.seconds;
            });
        }

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

    // Blue badge - Live API data
    applyLiveApiTime(mic) {
        const clusterId = resolveClusterId(mic);
        let clusterTime = clusterId !== null ? STATE.transitTimes[clusterId] : undefined;

        if (clusterTime !== undefined && clusterTime !== null) {
            if (clusterId !== null && TRANSIT_DATA) {
                const cluster = TRANSIT_DATA.clusters[clusterId];
                const walkDistMiles = calculateDistance(cluster.lat, cluster.lng, mic.lat, mic.lng);
                const walkSeconds = Math.ceil(walkDistMiles * WALK_MINS_PER_MILE * 60);
                mic.transitSeconds = clusterTime + walkSeconds;
                mic.transitMins = Math.round(mic.transitSeconds / 60);
            } else {
                mic.transitSeconds = clusterTime;
                mic.transitMins = Math.round(clusterTime / 60);
            }
            mic.transitType = 'transit';
        } else {
            this.applyMatrixTime(mic);
        }
    },

    // Gray badge - Matrix lookup (FREE)
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

        const originClusterId = getUserClusterId(STATE.userOrigin.lat, STATE.userOrigin.lng);
        const originCluster = TRANSIT_DATA.clusters[originClusterId];
        const destCluster = TRANSIT_DATA.clusters[destClusterId];

        // Bridge calculation: Walk A + Subway + Walk B
        const userToOriginCluster = calculateDistance(
            STATE.userOrigin.lat, STATE.userOrigin.lng,
            originCluster.lat, originCluster.lng
        );
        const walkToOrigin = Math.ceil(userToOriginCluster * WALK_MINS_PER_MILE);

        let rideTime = TRANSIT_DATA.matrix[originClusterId]?.[destClusterId];
        if (rideTime === undefined || rideTime === null) {
            const clusterDist = calculateDistance(
                originCluster.lat, originCluster.lng,
                destCluster.lat, destCluster.lng
            );
            rideTime = Math.round(clusterDist * SUBWAY_MINS_PER_MILE);
        }

        // Night Owl Penalty (+15 min for late night mics)
        const hour = mic.start ? mic.start.getHours() : 0;
        if (rideTime && (hour >= 23 || hour < 5)) {
            rideTime += 15;
        }

        const destClusterToVenue = calculateDistance(
            destCluster.lat, destCluster.lng,
            mic.lat, mic.lng
        );
        const walkToDest = Math.ceil(destClusterToVenue * WALK_MINS_PER_MILE);

        mic.transitMins = walkToOrigin + rideTime + walkToDest;
        mic.transitSeconds = mic.transitMins * 60;
        mic.transitType = 'estimate';
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
