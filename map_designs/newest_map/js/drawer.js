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
    // If calendar is open, close it first
    if (STATE.currentMode === 'calendar') {
        hideDateCarousel();
        render('calendar');
    }

    // Simple binary toggle - peek or open
    const currentState = getDrawerState();
    let targetState;

    if (forceOpen !== undefined) {
        targetState = forceOpen ? DRAWER_STATES.OPEN : DRAWER_STATES.PEEK;
    } else {
        targetState = currentState === DRAWER_STATES.OPEN ? DRAWER_STATES.PEEK : DRAWER_STATES.OPEN;
    }

    setDrawerState(targetState);
}

// Drawer state constants - TWO STATES ONLY
const DRAWER_STATES = {
    PEEK: 'peek',
    OPEN: 'open'
};

// Get current drawer state
function getDrawerState() {
    const drawer = document.getElementById('list-drawer');
    return drawer.classList.contains('drawer-open') ? DRAWER_STATES.OPEN : DRAWER_STATES.PEEK;
}

// Set drawer to specific state with haptic feedback
function setDrawerState(newState) {
    const drawer = document.getElementById('list-drawer');
    const icon = document.getElementById('chevron-icon');
    const btn = document.getElementById('drawer-btn');
    const searchWrapper = document.querySelector('.search-wrapper');
    const backdrop = document.getElementById('drawer-backdrop');
    const isDesktop = window.matchMedia('(min-width: 640px)').matches;
    const isMobile = !isDesktop;

    // Remove all state classes
    drawer.classList.remove('drawer-peek', 'drawer-open');

    // Haptic feedback on state change (if supported)
    if ('vibrate' in navigator) {
        navigator.vibrate(8);
    }

    const isOpen = newState === DRAWER_STATES.OPEN;

    // Apply appropriate class
    drawer.classList.add(isOpen ? 'drawer-open' : 'drawer-peek');
    STATE.drawerState = newState;
    STATE.isDrawerOpen = isOpen;

    // Backdrop for mobile full state
    if (backdrop && isMobile) {
        backdrop.classList.toggle('active', isOpen);
    }

    // Update UI elements
    icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    btn.classList.toggle('bg-white/10', isOpen);
    btn.classList.toggle('text-white', isOpen);
    searchWrapper.classList.toggle('active', isOpen);

    // Close search dropdown when opening drawer
    if (isOpen && typeof searchService !== 'undefined' && searchService.hideDropdown) {
        searchService.hideDropdown();
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.blur();
    }

    // Update ARIA
    document.querySelectorAll('[aria-controls="list-drawer"], [aria-controls="list-content"]').forEach(toggleBtn => {
        toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Announce state change
    announceToScreenReader(isOpen ? 'Mic list expanded' : 'Mic list minimized');
}

// Mobile swipe with velocity detection - simple two-state snapping
function setupMobileSwipe() {
    const drawer = document.getElementById('list-drawer');
    const header = document.getElementById('drawer-header');
    const listContent = document.getElementById('list-content');

    let startY = 0;
    let startTime = 0;
    let currentY = 0;
    let isSwiping = false;

    // Tuned for snappy feel
    const DRAG_THRESHOLD = 30;      // 20% of ~150px travel
    const VELOCITY_THRESHOLD = 0.5; // px/ms - fast flick wins

    function isMobile() {
        return window.matchMedia('(max-width: 639px)').matches;
    }

    function startSwipe(e) {
        if (!isMobile()) return;
        startY = e.touches[0].clientY;
        currentY = startY;
        startTime = Date.now();
        isSwiping = true;
    }

    // Auto-expand drawer when user interacts with list content in peek mode
    listContent.addEventListener('touchstart', () => {
        if (!isMobile()) return;
        if (getDrawerState() === DRAWER_STATES.PEEK) {
            setDrawerState(DRAWER_STATES.OPEN);
        }
    }, { passive: true });

    // Header/handle swipes - always work
    header.addEventListener('touchstart', startSwipe, { passive: true });

    // List content swipes - only when scrolled to top (to collapse)
    listContent.addEventListener('touchstart', (e) => {
        if (!isMobile() || listContent.scrollTop > 0) return;
        startSwipe(e);
    }, { passive: true });

    // Track movement
    drawer.addEventListener('touchmove', (e) => {
        if (!isSwiping || !isMobile()) return;
        currentY = e.touches[0].clientY;
    }, { passive: true });

    // Handle swipe end - velocity beats distance
    drawer.addEventListener('touchend', () => {
        if (!isSwiping || !isMobile()) return;
        isSwiping = false;

        const deltaY = currentY - startY;
        const deltaTime = Math.max(Date.now() - startTime, 1);
        const velocity = Math.abs(deltaY) / deltaTime;
        const currentState = getDrawerState();

        // Velocity wins: fast flick in either direction snaps immediately
        if (velocity > VELOCITY_THRESHOLD) {
            setDrawerState(deltaY > 0 ? DRAWER_STATES.PEEK : DRAWER_STATES.OPEN);
            return;
        }

        // Slow drag: use threshold
        if (Math.abs(deltaY) < DRAG_THRESHOLD) return; // Too small, ignore

        if (deltaY < 0 && currentState === DRAWER_STATES.PEEK) {
            setDrawerState(DRAWER_STATES.OPEN);
        } else if (deltaY > 0 && currentState === DRAWER_STATES.OPEN) {
            setDrawerState(DRAWER_STATES.PEEK);
        }
    });
}

// Fix drawer state when viewport changes between mobile/desktop
function fixDrawerStateForViewport() {
    const drawer = document.getElementById('list-drawer');
    const searchWrapper = document.querySelector('.search-wrapper');
    const icon = document.getElementById('chevron-icon');
    const btn = document.getElementById('drawer-btn');
    const backdrop = document.getElementById('drawer-backdrop');
    const isDesktop = window.matchMedia('(min-width: 640px)').matches;

    // Remove all state classes first
    drawer.classList.remove('drawer-peek', 'drawer-open');

    // Always use peek/open - drawer never fully hides
    const state = STATE.drawerState || DRAWER_STATES.PEEK;
    drawer.classList.add(`drawer-${state}`);

    const isOpen = state === DRAWER_STATES.OPEN;
    if (backdrop) backdrop.classList.toggle('active', isOpen && !isDesktop);

    icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    btn.classList.toggle('bg-white/10', isOpen);
    btn.classList.toggle('text-white', isOpen);
    searchWrapper.classList.toggle('active', isOpen);
}

// Initialize drawer state based on screen size
function initDrawerState() {
    const drawer = document.getElementById('list-drawer');

    // Always start in peek state - drawer never fully hides
    STATE.drawerState = DRAWER_STATES.PEEK;
    STATE.isDrawerOpen = false;
    drawer.classList.add('drawer-peek');
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
