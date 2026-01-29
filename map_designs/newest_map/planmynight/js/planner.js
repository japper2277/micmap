// Plan My Night - Main Planning Algorithm

// Abort controller for cancelling in-progress planning
let planningAbortController = null;

// Cache the most recent planning context so tabs can compute alternate routes without re-prefetch
let lastPlanContext = null;
let activeRoutePriority = 'most_mics';

function setActiveRouteTab(priority) {
    const tabs = document.getElementById('route-tabs');
    if (!tabs) return;
    tabs.querySelectorAll('.radio-pill').forEach(btn => {
        const isActive = btn.dataset.priority === priority;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
}

async function selectRouteTab(priority) {
    activeRoutePriority = priority;
    setActiveRouteTab(priority);

    if (!lastPlanContext) return;

    const cached = lastPlanContext.routes?.[priority];
    if (cached && cached.sequence?.length) {
        await renderResults(cached.sequence, cached.origin, cached.timePerVenue);
        return;
    }

    // Compute on-demand using the cached planning context
    try {
        showTimelineSkeleton(3);
        const route = await buildRouteForPriority(lastPlanContext, priority);
        if (!route.sequence || route.sequence.length === 0) {
            showToast('No route found for this option. Try loosening filters.', 'error');
            return;
        }
        lastPlanContext.routes[priority] = route;
        await renderResults(route.sequence, route.origin, route.timePerVenue);
    } catch (e) {
        showToast('Could not build this route option. Try again.', 'error');
    }
}

window.selectRouteTab = selectRouteTab;

window.recalculateWithRealTransit = () => {
    const realOnly = document.querySelector('input[name="transit-accuracy"][value="real_only"]');
    if (realOnly) {
        realOnly.checked = true;
        const pill = realOnly.closest('.radio-pill');
        const group = pill?.closest('.radio-pills');
        if (group) group.querySelectorAll('.radio-pill').forEach(p => p.classList.remove('active'));
        if (pill) pill.classList.add('active');
    }
    showToast('Recalculating with real transit times...', 'info');
    planMyNight();
};

function getStopsRangeFromUI(goal, stopsValue) {
    if (goal === 'single') {
        return { minMics: 1, maxMics: 1 };
    }

    switch (stopsValue) {
        case '1':
            return { minMics: 1, maxMics: 1 };
        case '2-3':
            return { minMics: 2, maxMics: 3 };
        case '3-5':
            return { minMics: 3, maxMics: 5 };
        case 'flexible':
        default:
            // Goal is crawl, so default to multiple stops
            return { minMics: 2, maxMics: 5 };
    }
}

function scoreCandidate({
    priority,
    travelMins,
    arrivalMins,
    micStartMins,
    planningStartMins
}) {
    const lateMins = Math.max(0, arrivalMins - micStartMins);
    const waitMins = Math.max(0, micStartMins - arrivalMins);
    const sinceStart = Math.max(0, micStartMins - planningStartMins);

    if (priority === 'least_travel') {
        return travelMins * 3 + waitMins * 1 + lateMins * 8;
    }

    if (priority === 'best_timing') {
        // Prefer routes that line up well (less waiting / less lateness), travel is secondary
        return waitMins * 3 + travelMins * 1.25 + lateMins * 10;
    }

    // most_mics
    // Bias toward earlier mics so we can fit more later
    return travelMins * 1.5 + waitMins * 1 + lateMins * 10 + sinceStart * 0.05;
}

async function buildRouteForPriority(ctx, priority) {
    const {
        eligible,
        origin,
        startMins,
        endMins,
        timePerVenue,
        maxCommuteMins,
        minMics,
        maxMics,
        anchorStart,
        anchorMust,
        anchorEnd,
        getTransitBetween,
        planningStartMins
    } = ctx;

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
        const travelToStart = anchorStart._transitMins;
        if (!Number.isFinite(travelToStart)) {
            throw new Error(`Your starting mic "${anchorStart.venueName || anchorStart.venue}" is unreachable with your current transit accuracy settings. Try allowing estimates or pick a different mic.`);
        }
        if (maxCommuteMins < 999 && travelToStart > maxCommuteMins) {
            throw new Error(`Your starting mic "${anchorStart.venueName || anchorStart.venue}" is ${travelToStart} mins away, but your max commute is ${maxCommuteMins} mins. Try increasing your max commute or choosing a closer venue.`);
        }

        sequence.push({
            mic: anchorStart,
            arriveBy: anchorStart.startMins,
            transitFromPrev: {
                mins: travelToStart,
                type: anchorStart._transitType,
                subwayRoute: anchorStart._subwayRoute,
                isEstimate: !!anchorStart._transitIsEstimate
            },
            isAnchorStart: true
        });
        current = { lat: anchorStart.lat, lng: anchorStart.lng, mins: anchorStart.startMins + timePerVenue };
    }

    // 2. Find middle mics (greedy)
    const anchorCount = (anchorStart ? 1 : 0) + (anchorMust ? 1 : 0) + (anchorEnd ? 1 : 0);
    const targetMaxMics = Math.max(1, maxMics - anchorCount);
    let mustHitInserted = false;

    while (sequence.length < (anchorStart ? 1 : 0) + (mustHitInserted ? 1 : 0) + targetMaxMics && pool.length > 0) {
        // Check if must-hit mic should be inserted now
        if (anchorMust && !mustHitInserted && anchorMust.startMins >= current.mins + 20) {
            const transitData = await getTransitBetween(current.lat, current.lng, anchorMust.lat, anchorMust.lng);
            const travelToMust = transitData.mins;
            const arrivalAtMust = current.mins + travelToMust;

            const nextPoolMic = pool.find(m => m.startMins >= current.mins + 20);
            const shouldInsertNow = !nextPoolMic ||
                anchorMust.startMins <= (nextPoolMic ? nextPoolMic.startMins : Infinity) ||
                arrivalAtMust <= anchorMust.startMins + 30;

            if (Number.isFinite(travelToMust) && shouldInsertNow && arrivalAtMust <= anchorMust.startMins + 30) {
                sequence.push({
                    mic: anchorMust,
                    arriveBy: anchorMust.startMins,
                    transitFromPrev: {
                        mins: travelToMust,
                        type: transitData.type,
                        subwayRoute: transitData.route,
                        isEstimate: !!transitData.isEstimate
                    },
                    isAnchorMust: true
                });
                current = { lat: anchorMust.lat, lng: anchorMust.lng, mins: anchorMust.startMins + timePerVenue };
                mustHitInserted = true;
                continue;
            }
        }

        let bestMic = null;
        let bestScore = Infinity;
        let bestTransit = null;

        // Check if we're still at origin (can use pre-fetched times)
        const isAtOrigin = current.lat === origin.lat && current.lng === origin.lng;

        for (let mic of pool) {
            if (mic.startMins < current.mins + 20) continue;
            if (mic.startMins > endMins) continue;
            if (anchorMust && !mustHitInserted && mic.startMins > anchorMust.startMins) continue;

            let transitData;
            if (isAtOrigin && mic._transitMins !== undefined) {
                transitData = { mins: mic._transitMins, type: mic._transitType, route: mic._subwayRoute, isEstimate: !!mic._transitIsEstimate };
            } else {
                transitData = await getTransitBetween(current.lat, current.lng, mic.lat, mic.lng);
            }

            const travelMins = transitData.mins;
            if (!Number.isFinite(travelMins)) continue;
            if (maxCommuteMins < 999 && travelMins > maxCommuteMins) continue;

            const arrival = current.mins + travelMins;
            if (arrival > mic.startMins + 30) continue;

            const score = scoreCandidate({
                priority,
                travelMins,
                arrivalMins: arrival,
                micStartMins: mic.startMins,
                planningStartMins
            });

            if (score < bestScore) {
                bestScore = score;
                bestMic = mic;
                bestTransit = transitData;
            }
        }

        if (!bestMic) break;

        sequence.push({
            mic: bestMic,
            arriveBy: bestMic.startMins,
            transitFromPrev: {
                mins: bestTransit.mins,
                type: bestTransit.type,
                subwayRoute: bestTransit.route,
                isEstimate: !!bestTransit.isEstimate
            }
        });
        current = { lat: bestMic.lat, lng: bestMic.lng, mins: bestMic.startMins + timePerVenue };
        pool = pool.filter(m => m.id !== bestMic.id);
    }

    // If must-hit wasn't inserted, try to force it
    if (anchorMust && !mustHitInserted) {
        const transitData = await getTransitBetween(current.lat, current.lng, anchorMust.lat, anchorMust.lng);
        const travelToMust = transitData.mins;
        const arrivalAtMust = current.mins + travelToMust;

        if (Number.isFinite(travelToMust) && arrivalAtMust <= anchorMust.startMins + 30) {
            sequence.push({
                mic: anchorMust,
                arriveBy: anchorMust.startMins,
                transitFromPrev: {
                    mins: travelToMust,
                    type: transitData.type,
                    subwayRoute: transitData.route,
                    isEstimate: !!transitData.isEstimate
                },
                isAnchorMust: true
            });
            current = { lat: anchorMust.lat, lng: anchorMust.lng, mins: anchorMust.startMins + timePerVenue };
        }
    }

    // 3. End with anchor end
    if (anchorEnd && anchorEnd.startMins >= current.mins + 20) {
        const transitData = await getTransitBetween(current.lat, current.lng, anchorEnd.lat, anchorEnd.lng);
        const travelToEnd = transitData.mins;
        const arrivalAtEnd = current.mins + travelToEnd;

        if (Number.isFinite(travelToEnd) && arrivalAtEnd <= anchorEnd.startMins + 30) {
            sequence.push({
                mic: anchorEnd,
                arriveBy: anchorEnd.startMins,
                transitFromPrev: {
                    mins: travelToEnd,
                    type: transitData.type,
                    subwayRoute: transitData.route,
                    isEstimate: !!transitData.isEstimate
                },
                isAnchorEnd: true
            });
        }
    }

    // Trim if over max
    if (sequence.length > maxMics) {
        sequence = sequence.slice(0, maxMics);
    }

    // Validate min
    if (sequence.length < minMics) {
        return { sequence: [], origin, timePerVenue };
    }

    return { sequence, origin, timePerVenue };
}

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

        const goal = document.querySelector('input[name="goal"]:checked')?.value || 'crawl';
        const stopsValue = document.querySelector('input[name="stops"]:checked')?.value || 'flexible';
        const { minMics, maxMics } = getStopsRangeFromUI(goal, stopsValue);

        const priority = document.querySelector('input[name="priority"]:checked')?.value || 'most_mics';
        activeRoutePriority = priority;
        setActiveRouteTab(priority);

        // Travel prefs
        const walkableMiles = typeof getWalkableMilesFromUI === 'function' ? getWalkableMilesFromUI() : 0.5;
        const accuracy = typeof getTransitAccuracyFromUI === 'function' ? getTransitAccuracyFromUI() : 'allow_estimates';
        const requireRealOnly = accuracy === 'real_only';

        // Alternatives
        const altsPerStop = parseInt(document.querySelector('input[name="alts-per-stop"]:checked')?.value || '2', 10);
        if (typeof PlannerState?.setAlternativesConfig === 'function') {
            PlannerState.setAlternativesConfig({ maxResults: altsPerStop });
        }

        const exactMics = null;

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

                // Walkable distance - estimate walk time
                if (distance < walkableMiles) {
                    mic._transitMins = Math.round(distance * 20);
                    mic._transitType = 'walk';
                    mic._subwayRoute = null;
                    mic._transitIsEstimate = false;
                    return;
                }

                // Get real transit time from API
                try {
                    const route = await fetchSubwayRoute(origin.lat, origin.lng, mic.lat, mic.lng);
                    if (route) {
                        mic._transitMins = route.adjustedTotalTime || route.totalTime || route.duration;
                        mic._transitType = 'transit';
                        mic._subwayRoute = route;
                        mic._transitIsEstimate = false;
                        return;
                    }
                } catch (e) {
                    // API failed - will use fallback estimate
                }

                if (requireRealOnly) {
                    mic._transitMins = Infinity;
                    mic._transitType = 'unavailable';
                    mic._subwayRoute = null;
                    mic._transitIsEstimate = true;
                    return;
                }

                // Fallback estimate only on API failure
                mic._transitMins = Math.round(distance * 20);
                mic._transitType = 'estimate';
                mic._subwayRoute = null;
                mic._transitIsEstimate = true;
            }));

            // Update progress
            const progress = Math.min(i + BATCH_SIZE, eligible.length);
            document.getElementById('loading-detail').textContent =
                `Calculating transit times... ${progress}/${eligible.length}`;
        }

        document.getElementById('loading-detail').textContent = 'Building optimal route...';

        // Remove mics that are unreachable when "Real times only" is enabled
        eligible = eligible.filter(m => Number.isFinite(m._transitMins));

        // Find anchor mics
        const anchorStart = anchorStartId ? eligible.find(m => m.id === anchorStartId) : null;
        const anchorMust = anchorMustId ? eligible.find(m => m.id === anchorMustId) : null;
        const anchorEnd = anchorEndId ? eligible.find(m => m.id === anchorEndId) : null;

        if (anchorStartId && !anchorStart) {
            throw new Error('Your pinned Start mic is not available with the current filters/transit settings.');
        }
        if (anchorMustId && !anchorMust) {
            throw new Error('Your pinned Must-hit mic is not available with the current filters/transit settings.');
        }
        if (anchorEndId && !anchorEnd) {
            throw new Error('Your pinned End mic is not available with the current filters/transit settings.');
        }

        // Shared transit cache for on-demand tab switching
        const transitCache = {};
        const CACHE_MAX_SIZE = 200;

        async function getTransitBetween(fromLat, fromLng, toLat, toLng) {
            const cacheKey = `${fromLat.toFixed(3)},${fromLng.toFixed(3)}|${toLat.toFixed(3)},${toLng.toFixed(3)}|${walkableMiles.toFixed(2)}`;
            if (transitCache[cacheKey]) return transitCache[cacheKey];

            const cacheKeys = Object.keys(transitCache);
            if (cacheKeys.length >= CACHE_MAX_SIZE) {
                cacheKeys.slice(0, Math.floor(CACHE_MAX_SIZE * 0.2)).forEach(k => delete transitCache[k]);
            }

            const distance = haversine(fromLat, fromLng, toLat, toLng);

            if (distance < walkableMiles) {
                const mins = Math.max(Math.round(distance * 20), 5);
                const result = { mins, type: 'walk', route: null, isEstimate: false };
                transitCache[cacheKey] = result;
                return result;
            }

            try {
                const route = await fetchSubwayRoute(fromLat, fromLng, toLat, toLng);
                if (route) {
                    const mins = route.adjustedTotalTime || route.totalTime || route.duration;
                    const result = { mins, type: 'transit', route, isEstimate: false };
                    transitCache[cacheKey] = result;
                    return result;
                }
            } catch (_) {}

            if (requireRealOnly) {
                const result = { mins: Infinity, type: 'unavailable', route: null, isEstimate: true };
                transitCache[cacheKey] = result;
                return result;
            }

            const estimate = distance < 0.3 ? Math.round(distance * 20) : Math.round(5 + distance * 3);
            const result = { mins: Math.max(estimate, 10), type: 'estimate', route: null, isEstimate: true };
            transitCache[cacheKey] = result;
            return result;
        }

        // Build and render the currently selected priority route
        const planningStartMins = startMins;
        const ctx = {
            eligible,
            origin,
            startMins,
            endMins,
            timePerVenue,
            maxCommuteMins,
            minMics,
            maxMics,
            anchorStart,
            anchorMust,
            anchorEnd,
            getTransitBetween,
            planningStartMins,
            routes: {}
        };

        lastPlanContext = ctx;

        const route = await buildRouteForPriority(ctx, priority);
        ctx.routes[priority] = route;

        const sequence = route.sequence;

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
