/* =================================================================
   APP
   Data loading, event listeners, initialization
   ================================================================= */

// Trigger backend live-data compare on website launch (once per tab session).
function triggerLaunchLiveCompare() {
    const sessionKey = 'lbCompareTriggeredAt';
    try {
        if (sessionStorage.getItem(sessionKey)) return;
        sessionStorage.setItem(sessionKey, String(Date.now()));
    } catch (_) {
        // Ignore storage failures and still try once.
    }

    const endpoint = `${CONFIG.apiBase}/api/v1/admin/lb-compare/run`;
    fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'website-launch' })
    }).catch(() => {
        // Silent failure: this should never block page load.
    });
}

// Load JSON and initialize
async function loadData() {
    // Show skeleton loading while fetching
    if (typeof showListSkeleton === 'function') {
        showListSkeleton();
    }

    try {
        const response = await fetch(CONFIG.apiPath);
        const data = await response.json();
        const rawMics = data.mics || data; // Handle both { mics: [...] } and raw array
        STATE.mics = processMics(rawMics);

        // Hardcoded venue warnings (shown as banner cards at top of list)
        CONFIG.dayNames.forEach(day => {
            STATE.mics.push({
                id: `warning-comedy-shop-${day}`,
                title: 'Comedy Shop',
                venueName: 'Comedy Shop',
                venue: 'Comedy Shop',
                day: day,
                warning: "Multiple women have alleged sexual abuse by this venue's owner",
                warningLink: 'https://www.instagram.com/p/DUPKOE_EaCE/',
                lat: 40.7288305,
                lng: -74.0001342
            });
        });

        // Hydrate route from saved schedules for the active planning day
        const activeDate = (typeof getActivePlanningDate === 'function')
            ? getActivePlanningDate()
            : new Date();
        const todayKey = activeDate.toDateString();
        if (STATE.schedules[todayKey] && STATE.schedules[todayKey].length > 0) {
            // Only load IDs that exist in current mic data
            STATE.route = STATE.schedules[todayKey].filter(id =>
                STATE.mics.some(m => m.id === id)
            );
        }

        // Check if there are any mics left for today
        const now = new Date();
        const planningNow = (typeof getComedyAdjustedNow === 'function')
            ? getComedyAdjustedNow()
            : now;
        const todayName = CONFIG.dayNames[planningNow.getDay()];
        const todayMics = STATE.mics.filter(m => {
            if (m.day !== todayName) return false;
            // Only count mics that haven't started > 30 min ago
            const diffMins = m.start ? (m.start - now) / 60000 : 999;
            return diffMins >= -30;
        });

        // If no mics left today, switch to tomorrow
        if (todayMics.length === 0) {
            STATE.currentMode = 'tomorrow';
            const tomorrow = addDays(planningNow, 1);
            STATE.selectedCalendarDate = tomorrow.toDateString();
            updateCalendarButtonDisplay(STATE.selectedCalendarDate);
            render('tomorrow');
        } else {
            render('today');
        }

        // Apply marker states for saved schedule
        if (STATE.route.length > 0) {
            if (typeof updateRouteClass === 'function') updateRouteClass();
            if (typeof updateMarkerStates === 'function') updateMarkerStates();
        }

        // Check for deep link to a specific mic (e.g. ?mic=abc123 or legacy #mic=abc123)
        if (typeof openMicFromDeepLink === 'function') {
            openMicFromDeepLink();
        } else if (typeof openMicFromHash === 'function') {
            openMicFromHash();
        }

        // Check if transit calculation was pending (location arrived before mics loaded)
        if (STATE.pendingTransitCalc && STATE.userLocation) {
            STATE.pendingTransitCalc = false;
            if (typeof transitService !== 'undefined' && transitService.calculateFromOrigin) {
                const searchInput = document.getElementById('search-input');
                if (searchInput) searchInput.value = 'My Location';
                transitService.calculateFromOrigin(STATE.userLocation.lat, STATE.userLocation.lng, 'My Location', null, { silent: true, skipOriginMarker: true });
            }
        }
    } catch (err) {
        // Show error state with retry button in the list
        const container = document.getElementById('list-content');
        if (container) {
            container.innerHTML = `
                <div style="text-align:center; padding:48px 24px; color:#8e8e93;">
                    <div style="font-size:32px; margin-bottom:12px;">📡</div>
                    <div style="font-size:15px; font-weight:600; color:#fff; margin-bottom:4px;">Couldn't load open mics</div>
                    <div style="font-size:13px; margin-bottom:16px;">Check your connection and try again</div>
                    <button onclick="loadData()" style="background:#f43f5e; color:#fff; border:none; padding:10px 24px; border-radius:999px; font-size:14px; font-weight:600; cursor:pointer;">Try again</button>
                </div>`;
        }
    }
}

// Manual refresh — re-fetches mic data and re-renders current view
async function refreshMicData() {
    const btn = document.getElementById('btn-refresh');
    if (btn) {
        btn.classList.add('spinning');
        btn.disabled = true;
    }
    try {
        const response = await fetch(CONFIG.apiPath);
        const data = await response.json();
        const rawMics = data.mics || data;
        STATE.mics = processMics(rawMics);

        // Re-add venue warnings
        CONFIG.dayNames.forEach(day => {
            STATE.mics.push({
                id: `warning-comedy-shop-${day}`,
                title: 'Comedy Shop',
                venueName: 'Comedy Shop',
                venue: 'Comedy Shop',
                day: day,
                warning: "Multiple women have alleged sexual abuse by this venue's owner",
                warningLink: 'https://www.instagram.com/p/DUPKOE_EaCE/',
                lat: 40.7288305,
                lng: -74.0001342
            });
        });

        // Re-render the current view mode (don't re-run mode routing)
        render(STATE.currentMode);

        if (typeof toastService !== 'undefined') {
            toastService.show('Mics updated', 'success', 2000);
        }
    } catch (err) {
        if (typeof toastService !== 'undefined') {
            toastService.show('Couldn\'t refresh — check your connection', 'error', 3000);
        }
    } finally {
        if (btn) {
            btn.classList.remove('spinning');
            btn.disabled = false;
        }
    }
}

// Refresh statuses every minute (so "Live" badges update in real-time)
function refreshStatuses() {
    STATE.mics.forEach(mic => {
        mic.status = getStatus(mic.start);
    });
}

// Click on map dismisses date carousel (but keeps selected date)
map.on('click', () => {
    const carousel = document.getElementById('date-carousel');
    if (carousel && carousel.classList.contains('active')) {
        hideDateCarousel();
    }
});

// Handle orientation change
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        map.invalidateSize();
        fixDrawerStateForViewport();
    }, 100);
});

// Track viewport for breakpoint detection
let lastViewportWidth = window.innerWidth;
const BREAKPOINT = 640;

// Handle window resize
window.addEventListener('resize', () => {
    const currentWidth = window.innerWidth;
    const crossedBreakpoint = (lastViewportWidth >= BREAKPOINT && currentWidth < BREAKPOINT) ||
                              (lastViewportWidth < BREAKPOINT && currentWidth >= BREAKPOINT);

    // If crossed breakpoint, update drawer state immediately (no delay)
    if (crossedBreakpoint) {
        fixDrawerStateForViewport();
    }

    lastViewportWidth = currentWidth;

    // Debounce map resize and non-breakpoint drawer updates
    clearTimeout(STATE.resizeTimeout);
    STATE.resizeTimeout = setTimeout(() => {
        map.invalidateSize();
        if (!crossedBreakpoint) {
            fixDrawerStateForViewport();
        }
    }, 150);
});

// Initialize everything
function init() {
    // Cleanup legacy schedule/session keys now replaced by planSchedules.
    localStorage.removeItem('planRoute');
    localStorage.removeItem('planDismissed');
    localStorage.removeItem('planTimeWindowStart');
    localStorage.removeItem('planTimeWindowEnd');

    // Seed calendar chip labels from the active selected date.
    const seedDate = STATE.selectedCalendarDate || ((typeof getComedyAdjustedNow === 'function') ? getComedyAdjustedNow().toDateString() : new Date().toDateString());
    STATE.selectedCalendarDate = seedDate;
    if (typeof updateCalendarButtonDisplay === 'function') {
        updateCalendarButtonDisplay(seedDate);
    }

    // Initialize modal DOM references
    initModal();

    // Initialize drawer state
    initDrawerState();

    // Setup mobile swipe
    setupMobileSwipe();

    // Setup keyboard scroll for list content
    setupKeyboardScroll();

    // Setup filter row accessibility (roving tabindex + scroll indicators)
    setupFilterRovingTabindex();
    setupFilterScrollIndicators();

    // Get user location
    getUserLocation();

    // Generate date carousel
    generateDateCarousel();

    // Initialize toast notifications
    if (typeof toastService !== 'undefined') {
        toastService.init();
    }

    // Initialize search service
    if (typeof searchService !== 'undefined') {
        searchService.init();
    }

    // Load transit data (for matrix-based estimates)
    if (typeof loadTransitData === 'function') {
        loadTransitData();
    }

    // Load data and render
    loadData();

    // Kick off live-data parity check in the background on app launch.
    triggerLaunchLiveCompare();

    // Load Slotted signup availability
    loadSlottedData();
    loadCotlData();
    loadBushwickData();

    // Tomorrow notice button handler
    const tomorrowBtn = document.getElementById('tomorrow-btn');
    if (tomorrowBtn) {
        tomorrowBtn.onclick = () => {
            const tomorrowNotice = document.getElementById('tomorrow-notice');
            if (tomorrowNotice) tomorrowNotice.classList.remove('show');
            setModeFromToggle('tomorrow');
        };
    }

    // Refresh statuses every minute
    setInterval(refreshStatuses, 60000);

    // Show onboarding hints for first-time visitors
    showOnboardingHints();

    // Handle back/forward navigation for deep links (?mic= and legacy #mic=)
    window.addEventListener('popstate', () => {
        const params = new URLSearchParams(window.location.search);
        const hasMicParam = params.has('mic');
        const hasMicHash = window.location.hash.startsWith('#mic=');

        if ((hasMicParam || hasMicHash) && typeof openMicFromDeepLink === 'function') {
            openMicFromDeepLink();
        } else if (!hasMicParam && !hasMicHash && venueModal && venueModal.classList.contains('active')) {
            closeVenueModal();
        }
    });
}

// First-visit onboarding — sequential toast hints, cancels on interaction
function showOnboardingHints() {
    if (localStorage.getItem('micmap_onboarded')) return;
    if (typeof toastService === 'undefined') return;

    const hints = [
        { msg: 'Tap any marker to see mic details', delay: 2500 },
        { msg: 'Use filters to narrow by time, price, or borough', delay: 7000 },
        { msg: 'Tap the crosshair to find mics near you', delay: 11500 },
    ];

    const timers = [];
    let shown = 0;

    function cancelRemaining() {
        timers.forEach(t => clearTimeout(t));
        timers.length = 0;
        localStorage.setItem('micmap_onboarded', '1');
        // Clean up listener after cancellation
        document.removeEventListener('click', onInteract);
        document.removeEventListener('touchstart', onInteract);
    }

    function onInteract() {
        // User engaged with the app — cancel pending hints
        if (timers.length > 0) cancelRemaining();
    }

    // Listen for user interaction to cancel remaining hints
    document.addEventListener('click', onInteract, { once: true });
    document.addEventListener('touchstart', onInteract, { once: true });

    hints.forEach(({ msg, delay }, i) => {
        const t = setTimeout(() => {
            toastService.show(msg, 'info', 3500);
            shown++;
            // Mark onboarded after last hint fires
            if (shown === hints.length) {
                localStorage.setItem('micmap_onboarded', '1');
                document.removeEventListener('click', onInteract);
                document.removeEventListener('touchstart', onInteract);
            }
        }, delay);
        timers.push(t);
    });
}

// Load Comedians on the Loose signup slot availability (scraped hourly via GitHub Actions)
async function loadCotlData() {
    try {
        const res = await fetch(`${CONFIG.apiBase}/api/v1/mics/slots/cotl`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) {
            STATE.slottedSlots[data.venueName] = data;
        }
    } catch (e) {
        // Non-critical — silently fail
    }
}

// Load Bushwick Comedy Club signup slot availability
async function loadBushwickData() {
    try {
        const res = await fetch(`${CONFIG.apiBase}/api/v1/mics/slots/bushwick`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) {
            STATE.slottedSlots[data.venueName] = data;
        }
    } catch (e) {
        // Non-critical — silently fail
    }
}

// Load Slotted.co signup slot availability
async function loadSlottedData() {
    try {
        const res = await fetch(`${CONFIG.apiBase}/api/v1/mics/slots/seshopenmics`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.success) {
            STATE.slottedSlots[data.venueName] = data;
        }
    } catch (e) {
        // Non-critical — silently fail
    }
}

// Load transit station data for arrivals/fallback
async function loadTransitData() {
    try {
        const response = await fetch(`${CONFIG.apiBase}/data/stations.json`);
        if (!response.ok) throw new Error('Failed to fetch stations');
        const stationsObj = await response.json();

        // Transform object to array with gtfsStopId and lines
        const stations = Object.entries(stationsObj).map(([id, station]) => {
            // Extract lines from nodes (e.g., "101S_1" -> "1")
            const lines = new Set();
            (station.nodes || []).forEach(node => {
                const match = node.match(/_([A-Z0-9]+)$/);
                if (match) lines.add(match[1]);
            });

            // Build name with lines like "Station Name (1 2 3)"
            const lineStr = [...lines].sort().join(' ');
            const nameWithLines = lineStr ? `${station.name} (${lineStr})` : station.name;

            return {
                ...station,
                gtfsStopId: id,
                name: nameWithLines,
                lines: [...lines]
            };
        });

        window.TRANSIT_DATA = { stations };
    } catch (e) {
        // Failed to load transit data - will use fallback estimates
        window.TRANSIT_DATA = { stations: [] };
    }
}

// Debug function for drawer scroll issues
window.debugDrawerScroll = function() {
    const drawer = document.getElementById('list-drawer');
    const content = document.getElementById('list-content');
    const header = document.getElementById('drawer-header');

    // Force inline styles to ensure scroll works
    content.style.overflowY = 'scroll';
    content.style.overscrollBehavior = 'contain';

    const drawerStyles = window.getComputedStyle(drawer);
    const contentStyles = window.getComputedStyle(content);

    console.log('=== DRAWER SCROLL DEBUG ===');
    console.log('Viewport:', window.innerWidth, 'x', window.innerHeight);
    console.log('--vh value:', getComputedStyle(document.documentElement).getPropertyValue('--vh'));
    console.log('');
    console.log('DRAWER (#list-drawer):');
    console.log('  Classes:', drawer.className);
    console.log('  State:', STATE.drawerState);
    console.log('  height:', drawerStyles.height);
    console.log('  maxHeight:', drawerStyles.maxHeight);
    console.log('  overflow:', drawerStyles.overflow);
    console.log('  overflowY:', drawerStyles.overflowY);
    console.log('  Rect:', drawer.getBoundingClientRect());
    console.log('');
    console.log('CONTENT (#list-content):');
    console.log('  Classes:', content.className);
    console.log('  height:', contentStyles.height);
    console.log('  maxHeight:', contentStyles.maxHeight);
    console.log('  overflow:', contentStyles.overflow);
    console.log('  overflowY:', contentStyles.overflowY);
    console.log('  scrollHeight:', content.scrollHeight);
    console.log('  clientHeight:', content.clientHeight);
    console.log('  scrollTop:', content.scrollTop);
    console.log('  Can scroll:', content.scrollHeight > content.clientHeight);
    console.log('  Rect:', content.getBoundingClientRect());
    console.log('');
    console.log('HEADER (#drawer-header):');
    console.log('  height:', header.getBoundingClientRect().height);
    console.log('========================');

    // Test scroll programmatically using multiple methods
    console.log('');
    console.log('SCROLL TESTS:');

    // Test 1: scrollTop
    content.scrollTop = 100;
    console.log('  scrollTop = 100:', content.scrollTop);
    content.scrollTop = 0;

    // Test 2: scrollTo
    content.scrollTo(0, 100);
    console.log('  scrollTo(0, 100):', content.scrollTop);
    content.scrollTo(0, 0);

    // Test 3: scrollBy
    content.scrollBy(0, 100);
    console.log('  scrollBy(0, 100):', content.scrollTop);
    content.scrollTo(0, 0);

    // Test 4: Check if content has children
    console.log('  Children count:', content.children.length);
    console.log('  First child:', content.children[0]?.tagName, content.children[0]?.className?.slice(0, 30));

    // Test 5: Check parent chain for potential blockers
    let parent = content.parentElement;
    while (parent && parent !== document.body) {
        const ps = window.getComputedStyle(parent);
        if (ps.overflow === 'hidden' || ps.overflowY === 'hidden') {
            console.log('  BLOCKER FOUND:', parent.id || parent.tagName, 'overflow:', ps.overflow);
        }
        parent = parent.parentElement;
    }

    const scrollWorked = (content.scrollTop = 100, content.scrollTop === 100);
    content.scrollTop = 0;

    return {
        canScroll: content.scrollHeight > content.clientHeight,
        scrollHeight: content.scrollHeight,
        clientHeight: content.clientHeight,
        overflowY: contentStyles.overflowY,
        scrollWorked: scrollWorked
    };
};

// Open Plan My Night feature
function openPlanMyNight() {
    // Navigate to the planner page (index redirects to planner.html)
    try {
        if (typeof syncSharedStateFromMicMap === 'function') syncSharedStateFromMicMap();
    } catch (_) {
        // ignore
    }
    window.location.href = 'planmynight/';
}

// Toggle plan mode on/off
function togglePlanMode() {
    STATE.planMode = !STATE.planMode;
    document.body.classList.toggle('plan-mode', STATE.planMode);

    if (STATE.planMode) {
        document.body.classList.remove('map-interacted', 'commute-loaded'); // Reset states
        if (typeof resetPlanOverlayTimer === 'function') resetPlanOverlayTimer(); // Start overlay timer
        setupPlanMapListeners(); // Setup map interaction listeners
        initPlanFilterRow(); // Initialize the time filter row in header
        render(STATE.currentMode);
        updateMarkerStates(); // Show commute labels on markers AFTER render (adds commute-loaded)
    } else {
        exitPlanMode();
    }
}

// Exit plan mode and reset state
function exitPlanMode() {
    // Save current route to schedules before clearing
    if (STATE.route.length > 0 && typeof persistPlanState === 'function') {
        persistPlanState();
    }
    STATE.planMode = false;
    STATE.route = [];
    STATE.dismissed = [];
    document.body.classList.remove('plan-mode', 'has-route', 'map-interacted', 'commute-loaded');
    updateMarkerStates(); // Clear marker states
    render(STATE.currentMode); // Restore normal drawer
}

// Run init when DOM is ready
init();
