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

// Mobile swipe with velocity detection - works on entire drawer
function setupMobileSwipe() {
    const drawer = document.getElementById('list-drawer');
    const listContent = document.getElementById('list-content');

    let startY = 0;
    let startTime = 0;
    let currentY = 0;
    let isSwiping = false;
    let startScrollTop = 0;

    const THRESHOLD = 20; // Minimum distance for swipe
    const VELOCITY_THRESHOLD = 0.5; // pixels per ms for fast swipe

    function isMobile() {
        return window.matchMedia('(max-width: 767px)').matches;
    }

    // Touch start - capture initial position and time
    drawer.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        // Skip if touching interactive elements
        if (e.target.closest('button:not(.drawer-filter-btn)') ||
            e.target.closest('a') ||
            e.target.closest('input')) return;

        startY = e.touches[0].clientY;
        currentY = startY;
        startTime = Date.now();
        startScrollTop = listContent ? listContent.scrollTop : 0;
        isSwiping = true;
    }, { passive: true });

    // Touch move - track current position
    drawer.addEventListener('touchmove', (e) => {
        if (!isSwiping || !isMobile()) return;
        currentY = e.touches[0].clientY;
    }, { passive: true });

    // Touch end - calculate velocity and determine next state
    drawer.addEventListener('touchend', () => {
        if (!isSwiping || !isMobile()) return;
        isSwiping = false;

        const deltaY = currentY - startY;
        const deltaTime = Date.now() - startTime;
        const velocity = Math.abs(deltaY) / deltaTime; // px/ms
        const currentState = getDrawerState();

        // If scrolled within content and at top, allow collapse
        // If not at top, don't trigger state change
        if (listContent && startScrollTop > 0 && deltaY > 0) {
            return; // User is scrolling content, not drawer
        }

        // Fast swipe - skip intermediate states
        if (velocity > VELOCITY_THRESHOLD && Math.abs(deltaY) > THRESHOLD) {
            if (deltaY < 0) {
                // Fast swipe up -> go to open
                setDrawerState(DRAWER_STATES.OPEN);
            } else {
                // Fast swipe down -> go to peek
                setDrawerState(DRAWER_STATES.PEEK);
            }
            return;
        }

        // Normal swipe - move to adjacent state
        if (Math.abs(deltaY) > THRESHOLD) {
            if (deltaY < 0) {
                // Swipe up - expand
                switch (currentState) {
                    case DRAWER_STATES.PEEK:
                        setDrawerState(DRAWER_STATES.HALF);
                        break;
                    case DRAWER_STATES.HALF:
                        setDrawerState(DRAWER_STATES.OPEN);
                        break;
                }
            } else {
                // Swipe down - collapse
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
