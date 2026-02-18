/* =================================================================
   APP
   Data loading, event listeners, initialization
   ================================================================= */

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
                warning: {
                    message: "Multiple women have alleged sexual abuse by this venue's owner",
                    link: 'https://www.instagram.com/p/DUPKOE_EaCE/'
                },
                lat: 40.7288305,
                lng: -74.0001342
            });
        });

        // Check if there are any mics left for today
        const now = new Date();
        const todayName = CONFIG.dayNames[now.getDay()];
        const todayMics = STATE.mics.filter(m => {
            if (m.day !== todayName) return false;
            // Only count mics that haven't started > 30 min ago
            const diffMins = m.start ? (m.start - now) / 60000 : 999;
            return diffMins >= -30;
        });

        // If no mics left today, switch to tomorrow
        if (todayMics.length === 0) {
            STATE.currentMode = 'tomorrow';
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            STATE.selectedCalendarDate = tomorrow.toDateString();
            updateCalendarButtonDisplay(STATE.selectedCalendarDate);
            render('tomorrow');
        } else {
            render('today');
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
        // Failed to load mics - user will see empty list
        if (typeof toastService !== 'undefined') {
            toastService.show('Failed to load open mics', 'error');
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
    // Set calendar date buttons to current day + date
    const now = new Date();
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const displayText = `${days[now.getDay()]} ${now.getDate()}`;

    // Desktop calendar
    const calText = document.getElementById('cal-text');
    if (calText) calText.textContent = displayText;

    // Mobile calendar
    const mobileCalText = document.getElementById('mobile-cal-text');
    if (mobileCalText) mobileCalText.textContent = displayText;

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

    // Load Slotted signup availability
    loadSlottedData();

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

// Run init when DOM is ready
init();
