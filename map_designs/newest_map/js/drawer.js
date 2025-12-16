/* =================================================================
   DRAWER
   Drawer toggle, mobile swipe, viewport handling
   ================================================================= */

// Screen reader announcement helper
function announceToScreenReader(message) {
    let announcer = document.getElementById('sr-announcer');
    if (!announcer) {
        announcer = document.createElement('div');
        announcer.id = 'sr-announcer';
        announcer.setAttribute('role', 'status');
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        announcer.className = 'sr-only';
        // Visually hidden but accessible
        announcer.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
        document.body.appendChild(announcer);
    }
    // Clear and set to trigger announcement
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = message; }, 100);
}

function toggleDrawer(forceOpen) {
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    const currentState = getDrawerState();

    // If calendar is open, close it first
    if (STATE.currentMode === 'calendar') {
        hideDateCarousel();
        render('calendar');
    }

    // Determine target state
    let targetState;
    if (forceOpen !== undefined) {
        targetState = forceOpen ? DRAWER_STATES.OPEN : DRAWER_STATES.PEEK;
    } else {
        // Toggle behavior: cycle through states on mobile, binary on desktop
        if (isDesktop) {
            targetState = STATE.isDrawerOpen ? DRAWER_STATES.PEEK : DRAWER_STATES.OPEN;
        } else {
            // Mobile: tap cycles peek -> half -> open -> peek
            switch (currentState) {
                case DRAWER_STATES.PEEK:
                    targetState = DRAWER_STATES.HALF;
                    break;
                case DRAWER_STATES.HALF:
                    targetState = DRAWER_STATES.OPEN;
                    break;
                case DRAWER_STATES.OPEN:
                    targetState = DRAWER_STATES.PEEK;
                    break;
                default:
                    targetState = DRAWER_STATES.HALF;
            }
        }
    }

    setDrawerState(targetState);
}

// Drawer state constants
const DRAWER_STATES = {
    PEEK: 'peek',
    HALF: 'half',
    OPEN: 'open'
};

// Get current drawer state
function getDrawerState() {
    const drawer = document.getElementById('list-drawer');
    if (drawer.classList.contains('drawer-open')) return DRAWER_STATES.OPEN;
    if (drawer.classList.contains('drawer-half')) return DRAWER_STATES.HALF;
    return DRAWER_STATES.PEEK;
}

// Set drawer to specific state with haptic feedback
function setDrawerState(newState) {
    const drawer = document.getElementById('list-drawer');
    const icon = document.getElementById('chevron-icon');
    const btn = document.getElementById('drawer-btn');
    const searchWrapper = document.querySelector('.search-wrapper');
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;

    // Remove all state classes
    drawer.classList.remove('drawer-closed', 'drawer-peek', 'drawer-half', 'drawer-open');

    // Haptic feedback on state change (if supported)
    if ('vibrate' in navigator) {
        navigator.vibrate(10);
    }

    if (isDesktop) {
        // Desktop only has open/closed
        if (newState === DRAWER_STATES.PEEK) {
            drawer.classList.add('drawer-closed');
            STATE.isDrawerOpen = false;
        } else {
            drawer.classList.add('drawer-open');
            STATE.isDrawerOpen = true;
        }
    } else {
        // Mobile has 3 states
        switch (newState) {
            case DRAWER_STATES.OPEN:
                drawer.classList.add('drawer-open');
                STATE.isDrawerOpen = true;
                STATE.drawerState = DRAWER_STATES.OPEN;
                break;
            case DRAWER_STATES.HALF:
                drawer.classList.add('drawer-half');
                STATE.isDrawerOpen = true;
                STATE.drawerState = DRAWER_STATES.HALF;
                break;
            case DRAWER_STATES.PEEK:
            default:
                drawer.classList.add('drawer-peek');
                STATE.isDrawerOpen = false;
                STATE.drawerState = DRAWER_STATES.PEEK;
                break;
        }
    }

    // Update UI elements
    if (STATE.isDrawerOpen) {
        icon.style.transform = 'rotate(180deg)';
        btn.classList.add('bg-white/10', 'text-white');
        searchWrapper.classList.add('active');

        // Close search dropdown when opening drawer
        if (typeof searchService !== 'undefined' && searchService.hideDropdown) {
            searchService.hideDropdown();
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.blur();
        }
    } else {
        icon.style.transform = 'rotate(0deg)';
        btn.classList.remove('bg-white/10', 'text-white');
        searchWrapper.classList.remove('active');
    }

    // Update ARIA
    document.querySelectorAll('[aria-controls="list-drawer"], [aria-controls="list-content"]').forEach(toggleBtn => {
        toggleBtn.setAttribute('aria-expanded', STATE.isDrawerOpen ? 'true' : 'false');
    });

    // Announce state change
    const stateLabels = {
        [DRAWER_STATES.PEEK]: 'Mic list minimized',
        [DRAWER_STATES.HALF]: 'Mic list half expanded',
        [DRAWER_STATES.OPEN]: 'Mic list fully expanded'
    };
    announceToScreenReader(stateLabels[newState] || 'Mic list collapsed');
}

// Mobile swipe with velocity detection - works on header + drag handle
function setupMobileSwipe() {
    const drawer = document.getElementById('list-drawer');
    const header = document.getElementById('drawer-header');
    const listContent = document.getElementById('list-content');

    let startY = 0;
    let startTime = 0;
    let currentY = 0;
    let isSwiping = false;
    let isHeaderSwipe = false; // Track if swipe started on header

    const THRESHOLD = 15; // Minimum distance for swipe
    const VELOCITY_THRESHOLD = 0.8; // Only skip states on very fast swipes

    function isMobile() {
        return window.matchMedia('(max-width: 767px)').matches;
    }

    // Header swipes - always work, ignore buttons
    header.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        startY = e.touches[0].clientY;
        currentY = startY;
        startTime = Date.now();
        isSwiping = true;
        isHeaderSwipe = true;
    }, { passive: true });

    // List content swipes - only for collapsing when at top
    listContent.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        // Only track if we're at the top of scroll
        if (listContent.scrollTop <= 0) {
            startY = e.touches[0].clientY;
            currentY = startY;
            startTime = Date.now();
            isSwiping = true;
            isHeaderSwipe = false;
        }
    }, { passive: true });

    // Track movement on entire drawer
    drawer.addEventListener('touchmove', (e) => {
        if (!isSwiping || !isMobile()) return;
        currentY = e.touches[0].clientY;
    }, { passive: true });

    // Handle swipe end
    drawer.addEventListener('touchend', () => {
        if (!isSwiping || !isMobile()) return;

        const deltaY = currentY - startY;
        const deltaTime = Math.max(Date.now() - startTime, 1);
        const velocity = Math.abs(deltaY) / deltaTime;
        const currentState = getDrawerState();

        isSwiping = false;

        // For content swipes (not header), only allow downward collapse
        if (!isHeaderSwipe && deltaY <= 0) {
            isHeaderSwipe = false;
            return;
        }

        // Determine action based on swipe
        const isFastSwipe = velocity > VELOCITY_THRESHOLD;
        const isValidSwipe = Math.abs(deltaY) > THRESHOLD;

        if (!isValidSwipe) {
            isHeaderSwipe = false;
            return;
        }

        if (deltaY < 0) {
            // Swipe UP - expand
            if (isFastSwipe) {
                setDrawerState(DRAWER_STATES.OPEN);
            } else {
                switch (currentState) {
                    case DRAWER_STATES.PEEK:
                        setDrawerState(DRAWER_STATES.HALF);
                        break;
                    case DRAWER_STATES.HALF:
                        setDrawerState(DRAWER_STATES.OPEN);
                        break;
                }
            }
        } else {
            // Swipe DOWN - collapse
            if (isFastSwipe) {
                setDrawerState(DRAWER_STATES.PEEK);
            } else {
                switch (currentState) {
                    case DRAWER_STATES.OPEN:
                        setDrawerState(DRAWER_STATES.HALF);
                        break;
                    case DRAWER_STATES.HALF:
                        setDrawerState(DRAWER_STATES.PEEK);
                        break;
                }
            }
        }

        isHeaderSwipe = false;
    });
}

// Fix drawer state when viewport changes between mobile/desktop
function fixDrawerStateForViewport() {
    const drawer = document.getElementById('list-drawer');
    const searchWrapper = document.querySelector('.search-wrapper');
    const icon = document.getElementById('chevron-icon');
    const btn = document.getElementById('drawer-btn');
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;

    // Remove all state classes first
    drawer.classList.remove('drawer-closed', 'drawer-peek', 'drawer-half', 'drawer-open');

    if (isDesktop) {
        // Desktop: binary open/closed
        if (STATE.isDrawerOpen) {
            drawer.classList.add('drawer-open');
            icon.style.transform = 'rotate(180deg)';
            btn.classList.add('bg-white/10', 'text-white');
            searchWrapper.classList.add('active');
        } else {
            drawer.classList.add('drawer-closed');
            icon.style.transform = 'rotate(0deg)';
            btn.classList.remove('bg-white/10', 'text-white');
            searchWrapper.classList.remove('active');
        }
    } else {
        // Mobile: restore to current state or default to peek
        const state = STATE.drawerState || DRAWER_STATES.PEEK;
        drawer.classList.add(`drawer-${state}`);

        if (state !== DRAWER_STATES.PEEK) {
            icon.style.transform = 'rotate(180deg)';
            btn.classList.add('bg-white/10', 'text-white');
            searchWrapper.classList.add('active');
        } else {
            icon.style.transform = 'rotate(0deg)';
            btn.classList.remove('bg-white/10', 'text-white');
            searchWrapper.classList.remove('active');
        }
    }
}

// Initialize drawer state based on screen size
function initDrawerState() {
    const drawer = document.getElementById('list-drawer');
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;

    // Initialize state tracking
    STATE.drawerState = isDesktop ? null : DRAWER_STATES.PEEK;

    drawer.classList.add(isDesktop ? 'drawer-closed' : 'drawer-peek');
}

// Keyboard scroll support for list-content
function setupKeyboardScroll() {
    const listContent = document.getElementById('list-content');
    if (!listContent) return;

    listContent.addEventListener('keydown', (e) => {
        const scrollAmount = 100;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                listContent.scrollBy({ top: scrollAmount, behavior: 'smooth' });
                break;
            case 'ArrowUp':
                e.preventDefault();
                listContent.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
                break;
            case 'PageDown':
                e.preventDefault();
                listContent.scrollBy({ top: listContent.clientHeight * 0.8, behavior: 'smooth' });
                break;
            case 'PageUp':
                e.preventDefault();
                listContent.scrollBy({ top: -listContent.clientHeight * 0.8, behavior: 'smooth' });
                break;
            case 'Home':
                e.preventDefault();
                listContent.scrollTo({ top: 0, behavior: 'smooth' });
                break;
            case 'End':
                e.preventDefault();
                listContent.scrollTo({ top: listContent.scrollHeight, behavior: 'smooth' });
                break;
        }
    });
}
