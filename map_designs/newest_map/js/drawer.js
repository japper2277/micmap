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

// Mobile gesture engine for drawer
function setupMobileSwipe() {
    const drawer = document.getElementById('list-drawer');
    const listContent = document.getElementById('list-content');
    if (!drawer || !listContent) return;

    // Gesture state
    let isDragging = false;
    let startY = 0;
    let startTranslateY = 0;
    let currentTranslateY = 0;
    let velocityTracker = [];
    let lastMoveTime = 0;
    let dragTarget = null; // 'header' or 'content'

    // Snap points (in pixels from bottom)
    const getSnapPoints = () => {
        const drawerHeight = drawer.offsetHeight;
        return {
            peek: drawerHeight - 120,  // Show 120px
            open: 0                     // Full drawer
        };
    };

    // Get current translateY from computed style or inline
    const getCurrentTranslateY = () => {
        const transform = drawer.style.transform || window.getComputedStyle(drawer).transform;
        if (!transform || transform === 'none') return 0;
        const match = transform.match(/translateY\(([^)]+)\)/);
        if (match) {
            const value = match[1];
            if (value.includes('calc')) {
                // Calculate from peek state formula
                const drawerHeight = drawer.offsetHeight;
                return drawerHeight - 120;
            }
            return parseFloat(value) || 0;
        }
        return 0;
    };

    // Calculate velocity from recent touch points (pixels per second)
    const getVelocity = () => {
        if (velocityTracker.length < 2) return 0;
        const recent = velocityTracker.slice(-5); // Last 5 points
        const first = recent[0];
        const last = recent[recent.length - 1];
        const dt = (last.time - first.time) / 1000; // seconds
        if (dt === 0) return 0;
        return (last.y - first.y) / dt;
    };

    // Set drawer position without transition
    const setTranslateY = (y) => {
        const snaps = getSnapPoints();
        // Clamp with rubber-band resistance at bounds
        if (y < snaps.open) {
            // Above open position - rubber band
            y = snaps.open + (y - snaps.open) * 0.3;
        } else if (y > snaps.peek) {
            // Below peek position - rubber band
            y = snaps.peek + (y - snaps.peek) * 0.3;
        }
        drawer.style.transform = `translateY(${y}px)`;
        currentTranslateY = y;
    };

    // Animate to snap point
    const animateToSnap = (targetY, velocity) => {
        const distance = Math.abs(targetY - currentTranslateY);
        // Velocity-based duration: faster swipe = faster animation
        // Base: 300ms, min: 150ms, max: 400ms
        const absVel = Math.abs(velocity);
        let duration = 300;
        if (absVel > 500) {
            duration = Math.max(150, 300 - (absVel - 500) * 0.1);
        }
        duration = Math.min(400, Math.max(150, duration));

        drawer.style.transition = `transform ${duration}ms cubic-bezier(0.32, 0.72, 0, 1)`;
        drawer.style.transform = `translateY(${targetY}px)`;

        // Update state after animation
        const snaps = getSnapPoints();
        const isOpen = targetY === snaps.open;

        setTimeout(() => {
            drawer.style.transition = '';
            // Sync with CSS classes
            drawer.classList.remove('drawer-peek', 'drawer-open');
            drawer.classList.add(isOpen ? 'drawer-open' : 'drawer-peek');
            STATE.drawerState = isOpen ? DRAWER_STATES.OPEN : DRAWER_STATES.PEEK;
            STATE.isDrawerOpen = isOpen;

            // Haptic feedback at snap
            if ('vibrate' in navigator) navigator.vibrate(8);

            // Update backdrop
            const backdrop = document.getElementById('drawer-backdrop');
            if (backdrop) backdrop.classList.toggle('active', isOpen);

            // Update UI elements
            const icon = document.getElementById('chevron-icon');
            const btn = document.getElementById('drawer-btn');
            if (icon) icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
            if (btn) btn.classList.toggle('bg-white/10', isOpen);
        }, duration);
    };

    // Determine target snap point from position and velocity
    const getTargetSnap = (y, velocity) => {
        const snaps = getSnapPoints();
        const midpoint = (snaps.peek + snaps.open) / 2;

        // High velocity overrides position
        if (velocity > 800) return snaps.peek;  // Fast swipe down
        if (velocity < -800) return snaps.open;  // Fast swipe up

        // Medium velocity biases toward direction
        if (velocity > 300) return y < midpoint * 0.7 ? snaps.open : snaps.peek;
        if (velocity < -300) return y > midpoint * 1.3 ? snaps.peek : snaps.open;

        // Low velocity - snap to nearest
        return y > midpoint ? snaps.peek : snaps.open;
    };

    // Touch start handler
    const onTouchStart = (e) => {
        // Only on mobile
        if (window.matchMedia('(min-width: 768px)').matches) return;

        const touch = e.touches[0];
        const target = e.target;

        // Determine if touching header area or content
        const headerArea = drawer.querySelector('.mics-header-row') || drawer.querySelector('.drag-handle');
        const isHeaderTouch = headerArea && (headerArea.contains(target) || target.closest('.drag-handle'));

        // Always allow drag from header
        if (isHeaderTouch) {
            dragTarget = 'header';
        } else if (listContent.contains(target)) {
            // Content touch - only allow pull-to-collapse at scroll top
            // Or expand gesture in peek mode
            if (STATE.drawerState === DRAWER_STATES.PEEK) {
                dragTarget = 'content-peek';
            } else if (listContent.scrollTop <= 0) {
                dragTarget = 'content-top';
            } else {
                return; // Let normal scroll happen
            }
        } else {
            return;
        }

        isDragging = true;
        startY = touch.clientY;

        // Get current position
        drawer.style.transition = 'none';
        startTranslateY = getCurrentTranslateY();
        currentTranslateY = startTranslateY;

        // Reset velocity tracker
        velocityTracker = [{ y: touch.clientY, time: Date.now() }];
    };

    // Touch move handler
    const onTouchMove = (e) => {
        if (!isDragging) return;

        const touch = e.touches[0];
        const deltaY = touch.clientY - startY;
        const now = Date.now();

        // Track velocity
        velocityTracker.push({ y: touch.clientY, time: now });
        if (velocityTracker.length > 10) velocityTracker.shift();

        // For content-peek, only allow upward drag (to open)
        if (dragTarget === 'content-peek' && deltaY > 0) {
            isDragging = false;
            return;
        }

        // For content-top, only allow downward drag (to collapse)
        if (dragTarget === 'content-top' && deltaY < 0) {
            isDragging = false;
            drawer.style.transition = '';
            return;
        }

        // Prevent scroll during drag
        e.preventDefault();

        // Move drawer
        const newY = startTranslateY + deltaY;
        setTranslateY(newY);

        // Haptic at midpoint crossing
        const snaps = getSnapPoints();
        const midpoint = (snaps.peek + snaps.open) / 2;
        const wasAbove = (currentTranslateY < midpoint);
        const isAbove = (newY < midpoint);
        if (wasAbove !== isAbove && 'vibrate' in navigator) {
            navigator.vibrate(5);
        }
    };

    // Touch end handler
    const onTouchEnd = (e) => {
        if (!isDragging) return;
        isDragging = false;
        dragTarget = null;

        const velocity = getVelocity();
        const targetY = getTargetSnap(currentTranslateY, velocity);
        animateToSnap(targetY, velocity);
    };

    // Touch cancel - same as end
    const onTouchCancel = () => {
        if (!isDragging) return;
        isDragging = false;
        dragTarget = null;

        // Snap back to nearest
        const velocity = getVelocity();
        const targetY = getTargetSnap(currentTranslateY, velocity);
        animateToSnap(targetY, velocity);
    };

    // Attach handlers to drawer (captures header and content)
    drawer.addEventListener('touchstart', onTouchStart, { passive: true });
    drawer.addEventListener('touchmove', onTouchMove, { passive: false });
    drawer.addEventListener('touchend', onTouchEnd, { passive: true });
    drawer.addEventListener('touchcancel', onTouchCancel, { passive: true });

    // Handle scroll-to-expand in peek mode
    listContent.addEventListener('scroll', () => {
        if (STATE.drawerState === DRAWER_STATES.PEEK && listContent.scrollTop > 10) {
            // User is trying to scroll down in peek - expand drawer
            setDrawerState(DRAWER_STATES.OPEN);
        }
    }, { passive: true });
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
