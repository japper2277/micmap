// Plan My Night - Main Planning Algorithm

// Abort controller for cancelling in-progress planning
let planningAbortController = null;

// Cancel any in-progress planning
function cancelPlanning() {
    if (planningAbortController) {
        planningAbortController.abort();
        planningAbortController = null;
        showToast('Planning cancelled', 'info');
    }
}

async function planMyNight() {
    // Cancel any in-progress planning
    if (planningAbortController) {
        planningAbortController.abort();
    }
    planningAbortController = new AbortController();
    const signal = planningAbortController.signal;

    haptic('medium');

    // Validate origin is selected
    if (!selectedOrigin) {
        const originInput = document.getElementById('origin-search');
        const originContainer = originInput?.closest('.dropdown-container');
        if (originContainer) {
            originContainer.classList.add('error-shake');
            originInput.setAttribute('aria-invalid', 'true');
            setTimeout(() => {
                originContainer.classList.remove('error-shake');
            }, 400);
        }
        showToast('Please select a starting location first', 'error');
        originInput?.focus();
        return;
    }

    // Validate time inputs
    const timeValidation = validateTimeInputs();
    if (!timeValidation.valid) {
        showToast(timeValidation.message, 'error');
        haptic('error');
        return;
    }

    // Get both mobile and desktop buttons
    const btnMobile = document.getElementById('plan-btn');
    const btnDesktop = document.getElementById('plan-btn-desktop');
    const originalMobileHTML = btnMobile?.innerHTML;
    const originalDesktopHTML = btnDesktop?.innerHTML;

    // Show loading state in buttons
    const loadingHTML = '<div class="spinner-inline"></div> <span>Finding...</span>';
    if (btnMobile) {
        btnMobile.innerHTML = loadingHTML;
        btnMobile.disabled = true;
        btnMobile.classList.add('btn-loading');
    }
    if (btnDesktop) {
        btnDesktop.innerHTML = loadingHTML;
        btnDesktop.disabled = true;
        btnDesktop.classList.add('btn-loading');
    }

    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('no-results').classList.add('hidden');

    // Show skeleton loading in results area
    showTimelineSkeleton(3);
    document.getElementById('results').classList.remove('hidden');

    // Helper to reset buttons
    function resetButtons() {
        if (btnMobile) {
            btnMobile.innerHTML = originalMobileHTML;
            btnMobile.disabled = false;
            btnMobile.classList.remove('btn-loading');
        }
        if (btnDesktop) {
            btnDesktop.innerHTML = originalDesktopHTML;
            btnDesktop.disabled = false;
            btnDesktop.classList.remove('btn-loading');
        }
    }

    try {
        // Data is guaranteed loaded by init() - no defensive check needed
        document.getElementById('loading-detail').textContent = 'Calculating optimal route...';

        // Gather Inputs
        const day = document.getElementById('day-select').value;
        const startTime = document.getElementById('start-time').value;
        const startMins = parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]);

        const durationMins = parseInt(document.getElementById('duration-select').value);
        const endMins = durationMins === 999 ? 1439 : startMins + durationMins;

        const timePerVenue = parseInt(document.querySelector('input[name="time-per-venue"]:checked').value);
        const priceFilter = document.querySelector('input[name="price"]:checked').value;
        const signupFilter = document.querySelector('input[name="signup"]:checked').value;
        const selectedAreasArr = Array.from(document.querySelectorAll('.area-checkbox:checked')).map(cb => cb.value);
        const maxCommuteMins = parseInt(document.querySelector('input[name="max-commute"]:checked').value);

        // Mic Count Constraints
        const micCountMode = document.querySelector('input[name="mic-count"]:checked').value;
        let minMics = 1;
        let maxMics = 99;
        let exactMics = null;

        switch (micCountMode) {
            case 'min-2':
                minMics = 2;
                maxMics = 99;
                break;
            case 'min-3':
                minMics = 3;
                maxMics = 99;
                break;
            default:
                minMics = 1;
                maxMics = 99;
        }

        // Anchors
        const anchorStartId = document.getElementById('anchor-start-id').value;
        const anchorMustId = document.getElementById('anchor-must-id').value;
        const anchorEndId = document.getElementById('anchor-end-id').value;

        // Origin
        let origin = selectedOrigin || NEIGHBORHOODS[0];

        // Filter Mics
        let eligible = allMics.filter(m => {
            if (m.day !== day) return false;
            if (m.startMins < startMins || m.startMins > endMins) return false;

            // Price Filter
            if (priceFilter === 'free') {
                const cost = m.cost || m.price || 0;
                if (cost > 0) return false;
            }

            // Signup Filter
            if (signupFilter === 'walk-in') {
                if (m.requiresAdvanceSignup) return false;
            } else if (signupFilter === 'advance') {
                if (!m.requiresAdvanceSignup) return false;
            }

            // Area Filter
            if (selectedAreasArr.length > 0) {
                const matchesBorough = m.borough && selectedAreasArr.includes(m.borough);
                const matchesNeighborhood = m.neighborhood && selectedAreasArr.includes(m.neighborhood);
                if (!matchesBorough && !matchesNeighborhood) return false;
            }

            return true;
        });

        // ============================================================
        // PRE-FETCH REAL TRANSIT TIMES (uses existing subway API)
        // This ensures routing decisions are based on actual times,
        // not distance estimates
        // ============================================================
        document.getElementById('loading-detail').textContent = `Calculating transit times for ${eligible.length} mics...`;

        // Batch fetch transit times from origin to all eligible mics
        const BATCH_SIZE = 10;
        for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
            // Check if cancelled
            if (signal.aborted) {
                throw new DOMException('Planning was cancelled', 'AbortError');
            }

            const batch = eligible.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (mic) => {
                const distance = haversine(origin.lat, origin.lng, mic.lat, mic.lng);

                // Walkable distance (< 0.5 miles) - estimate walk time
                if (distance < 0.5) {
                    mic._transitMins = Math.round(distance * 20);
                    mic._transitType = 'walk';
                    mic._subwayRoute = null;
                    return;
                }

                // Get real transit time from API
                try {
                    const route = await fetchSubwayRoute(origin.lat, origin.lng, mic.lat, mic.lng);
                    if (route) {
                        mic._transitMins = route.adjustedTotalTime || route.totalTime || route.duration;
                        mic._transitType = 'transit';
                        mic._subwayRoute = route;
                        return;
                    }
                } catch (e) {
                    // API failed - will use fallback estimate
                }

                // Fallback estimate only on API failure
                mic._transitMins = Math.round(distance * 20);
                mic._transitType = 'estimate';
                mic._subwayRoute = null;
            }));

            // Update progress
            const progress = Math.min(i + BATCH_SIZE, eligible.length);
            document.getElementById('loading-detail').textContent =
                `Calculating transit times... ${progress}/${eligible.length}`;
        }

        document.getElementById('loading-detail').textContent = 'Building optimal route...';

        // Find anchor mics
        const anchorStart = anchorStartId ? eligible.find(m => m.id === anchorStartId) : null;
        const anchorMust = anchorMustId ? eligible.find(m => m.id === anchorMustId) : null;
        const anchorEnd = anchorEndId ? eligible.find(m => m.id === anchorEndId) : null;

        // Simple Routing Algorithm (Greedy with Anchors)
        let sequence = [];
        let current = { lat: origin.lat, lng: origin.lng, mins: startMins };
        let pool = [...eligible];

        // Remove anchors from pool
        if (anchorStart) pool = pool.filter(m => m.id !== anchorStart.id);
        if (anchorMust) pool = pool.filter(m => m.id !== anchorMust.id);
        if (anchorEnd) pool = pool.filter(m => m.id !== anchorEnd.id);

        // 1. Start with anchor start if specified
        if (anchorStart) {
            // Use pre-fetched transit time (real API data)
            const travelToStart = anchorStart._transitMins;

            if (maxCommuteMins < 999 && travelToStart > maxCommuteMins) {
                throw new Error(`Your starting mic "${anchorStart.venueName || anchorStart.venue}" is ${travelToStart} mins away, but your max commute is ${maxCommuteMins} mins. Try increasing your max commute or choosing a closer venue.`);
            }

            sequence.push({
                mic: anchorStart,
                arriveBy: anchorStart.startMins,
                transitFromPrev: {
                    mins: travelToStart,
                    type: anchorStart._transitType,
                    subwayRoute: anchorStart._subwayRoute
                },
                isAnchorStart: true
            });
            current = { lat: anchorStart.lat, lng: anchorStart.lng, mins: anchorStart.startMins + 60 };
        }

        // Helper: Get transit time between two points
        // Uses cache, then API, then falls back to estimate
        const transitCache = {};
        const CACHE_MAX_SIZE = 100; // Prevent memory bloat

        async function getTransitTime(fromLat, fromLng, toLat, toLng) {
            const cacheKey = `${fromLat.toFixed(3)},${fromLng.toFixed(3)}|${toLat.toFixed(3)},${toLng.toFixed(3)}`;
            if (transitCache[cacheKey]) return transitCache[cacheKey];

            // Limit cache size to prevent memory issues
            const cacheKeys = Object.keys(transitCache);
            if (cacheKeys.length >= CACHE_MAX_SIZE) {
                // Remove oldest entries (first 20%)
                cacheKeys.slice(0, Math.floor(CACHE_MAX_SIZE * 0.2)).forEach(k => delete transitCache[k]);
            }

            const distance = haversine(fromLat, fromLng, toLat, toLng);

            // Walkable distance
            if (distance < 0.5) {
                const result = { mins: Math.round(distance * 20), type: 'walk', route: null };
                transitCache[cacheKey] = result;
                return result;
            }

            // Try API
            try {
                const route = await fetchSubwayRoute(fromLat, fromLng, toLat, toLng);
                if (route) {
                    const result = {
                        mins: route.adjustedTotalTime || route.totalTime || route.duration,
                        type: 'transit',
                        route: route
                    };
                    transitCache[cacheKey] = result;
                    return result;
                }
            } catch (e) {
                // API failed - using estimate
            }

            // Fallback: smarter estimate (5 min overhead + ~20mph transit)
            const estimate = distance < 0.3 ? Math.round(distance * 20) : Math.round(5 + distance * 3);
            const result = { mins: estimate, type: 'estimate', route: null };
            transitCache[cacheKey] = result;
            return result;
        }

        // 2. Find middle mics (greedy)
        const anchorCount = (anchorStart ? 1 : 0) + (anchorMust ? 1 : 0) + (anchorEnd ? 1 : 0);
        let targetMaxMics = maxMics - anchorCount;
        let mustHitInserted = false;

        while (sequence.length < (anchorStart ? 1 : 0) + (mustHitInserted ? 1 : 0) + targetMaxMics && pool.length > 0) {
            // Check if must-hit mic should be inserted now
            if (anchorMust && !mustHitInserted && anchorMust.startMins >= current.mins + 20) {
                // Use pre-fetched time if at origin, otherwise get fresh
                const isAtOrigin = current.lat === origin.lat && current.lng === origin.lng;
                const transitData = isAtOrigin
                    ? { mins: anchorMust._transitMins, type: anchorMust._transitType, route: anchorMust._subwayRoute }
                    : await getTransitTime(current.lat, current.lng, anchorMust.lat, anchorMust.lng);

                const travelToMust = transitData.mins;
                const arrivalAtMust = current.mins + travelToMust;

                const nextPoolMic = pool.find(m => m.startMins >= current.mins + 20);
                const shouldInsertNow = !nextPoolMic ||
                    anchorMust.startMins <= (nextPoolMic ? nextPoolMic.startMins : Infinity) ||
                    arrivalAtMust <= anchorMust.startMins + 30;

                if (shouldInsertNow && arrivalAtMust <= anchorMust.startMins + 30) {
                    sequence.push({
                        mic: anchorMust,
                        arriveBy: anchorMust.startMins,
                        transitFromPrev: { mins: travelToMust, type: transitData.type, subwayRoute: transitData.route },
                        isAnchorMust: true
                    });
                    current = { lat: anchorMust.lat, lng: anchorMust.lng, mins: anchorMust.startMins + 60 };
                    mustHitInserted = true;
                    continue;
                }
            }

            let best = null;
            let minCost = Infinity;
            let bestTransitData = null;

            // Check if we're still at origin (can use pre-fetched times)
            const isAtOrigin = current.lat === origin.lat && current.lng === origin.lng;

            for (let mic of pool) {
                if (mic.startMins < current.mins + 20) continue;
                if (anchorMust && !mustHitInserted && mic.startMins > anchorMust.startMins) continue;

                // Get transit time - use pre-fetched if at origin, otherwise calculate
                let travelMins, transitData;
                if (isAtOrigin && mic._transitMins !== undefined) {
                    travelMins = mic._transitMins;
                    transitData = { mins: mic._transitMins, type: mic._transitType, route: mic._subwayRoute };
                } else {
                    transitData = await getTransitTime(current.lat, current.lng, mic.lat, mic.lng);
                    travelMins = transitData.mins;
                }

                if (maxCommuteMins < 999 && travelMins > maxCommuteMins) continue;

                const arrival = current.mins + travelMins;
                const cost = travelMins + (mic.startMins - arrival);

                if (cost < minCost && arrival <= mic.startMins + 30) {
                    minCost = cost;
                    best = { mic, travel: travelMins };
                    bestTransitData = transitData;
                }
            }

            if (best) {
                sequence.push({
                    mic: best.mic,
                    arriveBy: best.mic.startMins,
                    transitFromPrev: {
                        mins: best.travel,
                        type: bestTransitData.type,
                        subwayRoute: bestTransitData.route
                    }
                });
                current = { lat: best.mic.lat, lng: best.mic.lng, mins: best.mic.startMins + 60 };
                pool = pool.filter(m => m.id !== best.mic.id);
            } else {
                break;
            }
        }

        // If must-hit wasn't inserted, force it
        if (anchorMust && !mustHitInserted) {
            const transitData = await getTransitTime(current.lat, current.lng, anchorMust.lat, anchorMust.lng);
            const travelToMust = transitData.mins;
            const arrivalAtMust = current.mins + travelToMust;

            if (arrivalAtMust <= anchorMust.startMins + 30) {
                sequence.push({
                    mic: anchorMust,
                    arriveBy: anchorMust.startMins,
                    transitFromPrev: { mins: travelToMust, type: transitData.type, subwayRoute: transitData.route },
                    isAnchorMust: true
                });
                current = { lat: anchorMust.lat, lng: anchorMust.lng, mins: anchorMust.startMins + 60 };
            } else {
                showToast(`"${anchorMust.venueName || anchorMust.venue}" starts too soon after your previous stop. Try starting earlier or removing this pinned mic.`, 'error');
            }
        }

        // 3. End with anchor end
        if (anchorEnd && anchorEnd.startMins >= current.mins + 20) {
            const transitData = await getTransitTime(current.lat, current.lng, anchorEnd.lat, anchorEnd.lng);
            const travelToEnd = transitData.mins;
            const arrivalAtEnd = current.mins + travelToEnd;

            if (arrivalAtEnd <= anchorEnd.startMins + 30) {
                sequence.push({
                    mic: anchorEnd,
                    arriveBy: anchorEnd.startMins,
                    transitFromPrev: { mins: travelToEnd, type: transitData.type, subwayRoute: transitData.route },
                    isAnchorEnd: true
                });
            } else {
                showToast(`"${anchorEnd.venueName || anchorEnd.venue}" starts too late to fit in your route. Try extending your duration or choosing an earlier final venue.`, 'error');
            }
        }

        // NOTE: Subway routes are now fetched during selection (above)
        // No need for separate post-selection fetch

        // Check results
        if (sequence.length > 0) {
            if (sequence.length < minMics) {
                showNoResultsWithContext(day, sequence.length, minMics);
                document.getElementById('no-results').classList.remove('hidden');
                showToast(`Found ${sequence.length} mic${sequence.length > 1 ? 's' : ''} but you wanted ${minMics}+. Try expanding your area or time range.`, 'error');
                announceToScreenReader(`Found only ${sequence.length} mics. ${minMics} or more were requested.`);
            } else {
                await renderResults(sequence, origin, timePerVenue);
                document.getElementById('results').classList.remove('hidden');

                // Announce to screen readers
                const stopText = sequence.length === 1 ? 'stop' : 'stops';
                announceToScreenReader(`Route found with ${sequence.length} ${stopText}. Your itinerary is now displayed.`);

                if (exactMics && sequence.length === exactMics) {
                    showToast(`Found exactly ${exactMics} mics!`, 'success');
                }
            }
        } else {
            showNoResultsWithContext(day, 0, minMics);
            document.getElementById('no-results').classList.remove('hidden');
            announceToScreenReader('No mics found matching your filters. Try adjusting your search criteria.');
        }

    } catch (e) {
        // Show user-friendly error message with helpful suggestions
        let userMessage = "Something went wrong. ";
        if (e.message && e.message.length < 200) {
            userMessage = e.message;
        } else if (e.name === 'AbortError') {
            userMessage = "Request was cancelled. Try again.";
        } else if (e.message?.includes('network') || e.message?.includes('fetch')) {
            userMessage = "Network error. Check your connection and try again.";
        } else {
            userMessage = "Unable to plan route. Try different filters or refresh the page.";
        }
        showToast(userMessage, 'error');
        haptic('error');
    } finally {
        document.getElementById('loading').classList.add('hidden');
        resetButtons();
        planningAbortController = null;
    }
}
