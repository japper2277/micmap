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
    // Simple toggle between peek and open - no drag animation
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
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
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

    // Update plan drawer if in plan mode (to show/hide swipe hint)
    if (STATE.planMode && typeof renderPlanDrawer === 'function') {
        renderPlanDrawer();
    }

    // Force scroll context recalculation (fixes scroll not working after state change)
    const listContent = document.getElementById('list-content');
    if (listContent) {
        listContent.style.overflowY = 'hidden';
        void listContent.offsetHeight; // Force reflow
        listContent.style.overflowY = 'auto';
    }

    // Backdrop for mobile full state
    if (backdrop && isMobile) {
        backdrop.classList.toggle('active', isOpen);
    }

    // Update UI elements (with null checks)
    if (icon) icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    if (btn) btn.classList.toggle('bg-white/10', isOpen);
    if (btn) btn.classList.toggle('text-white', isOpen);
    if (searchWrapper) searchWrapper.classList.toggle('active', isOpen);

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

// Mobile swipe disabled - tap only
function setupMobileSwipe() {
    // Swipe/drag disabled - drawer toggles via tap on handle only
}

// Fix drawer state when viewport changes between mobile/desktop
function fixDrawerStateForViewport() {
    const drawer = document.getElementById('list-drawer');
    const searchWrapper = document.querySelector('.search-wrapper');
    const icon = document.getElementById('chevron-icon');
    const btn = document.getElementById('drawer-btn');
    const backdrop = document.getElementById('drawer-backdrop');
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;

    // Remove all state classes first
    drawer.classList.remove('drawer-peek', 'drawer-open');

    // Always use peek/open - drawer never fully hides
    const state = STATE.drawerState || DRAWER_STATES.PEEK;
    drawer.classList.add(`drawer-${state}`);

    const isOpen = state === DRAWER_STATES.OPEN;
    if (backdrop) backdrop.classList.toggle('active', isOpen && !isDesktop);

    // Update UI elements (with null checks)
    if (icon) icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    if (btn) btn.classList.toggle('bg-white/10', isOpen);
    if (btn) btn.classList.toggle('text-white', isOpen);
    if (searchWrapper) searchWrapper.classList.toggle('active', isOpen);
}

// Initialize drawer state based on screen size
function initDrawerState() {
    const drawer = document.getElementById('list-drawer');
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;

    if (isDesktop) {
        // Desktop: start open
        STATE.drawerState = DRAWER_STATES.OPEN;
        STATE.isDrawerOpen = true;
        drawer.classList.add('drawer-open');
    } else {
        // Mobile: start in peek
        STATE.drawerState = DRAWER_STATES.PEEK;
        STATE.isDrawerOpen = false;
        drawer.classList.add('drawer-peek');
    }
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
