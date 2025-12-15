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
    const drawer = document.getElementById('list-drawer');
    const icon = document.getElementById('chevron-icon');
    const btn = document.getElementById('drawer-btn');
    const searchWrapper = document.querySelector('.search-wrapper');

    STATE.isDrawerOpen = forceOpen !== undefined ? forceOpen : !STATE.isDrawerOpen;
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;

    if (STATE.isDrawerOpen) {
        // If calendar is open, close it and show mics for selected date
        if (STATE.currentMode === 'calendar') {
            hideDateCarousel();
            render('calendar');
        }
        // Close search dropdown to prevent overlap
        if (typeof searchService !== 'undefined' && searchService.hideDropdown) {
            searchService.hideDropdown();
            // Also blur input to dismiss keyboard on mobile
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.blur();
        }
        // Open drawer
        drawer.classList.remove('drawer-closed', 'drawer-peek');
        drawer.classList.add('drawer-open');
        icon.style.transform = 'rotate(180deg)';
        btn.classList.add('bg-white/10', 'text-white');
        searchWrapper.classList.add('active');
    } else {
        // Close drawer (desktop: hidden, mobile: peek)
        drawer.classList.remove('drawer-open');
        drawer.classList.add(isDesktop ? 'drawer-closed' : 'drawer-peek');
        icon.style.transform = 'rotate(0deg)';
        btn.classList.remove('bg-white/10', 'text-white');
        searchWrapper.classList.remove('active');
    }

    // Accessibility: Update aria-expanded on all drawer toggle buttons
    document.querySelectorAll('[aria-controls="list-drawer"], [aria-controls="list-content"]').forEach(toggleBtn => {
        toggleBtn.setAttribute('aria-expanded', STATE.isDrawerOpen ? 'true' : 'false');
    });

    // Announce state change to screen readers
    announceToScreenReader(STATE.isDrawerOpen ? 'Mic list expanded' : 'Mic list collapsed');
}

// Mobile swipe functionality - swipe up to expand, swipe down to peek
function setupMobileSwipe() {
    const header = document.getElementById('drawer-header');
    let startY = 0;
    let currentY = 0;
    let isSwiping = false;
    const threshold = 30;

    function isMobile() {
        return window.matchMedia('(max-width: 767px)').matches;
    }

    header.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) return;
        startY = e.touches[0].clientY;
        isSwiping = true;
    }, { passive: true });

    header.addEventListener('touchmove', (e) => {
        if (!isSwiping || !isMobile()) return;
        currentY = e.touches[0].clientY;
    }, { passive: true });

    header.addEventListener('touchend', () => {
        if (!isSwiping || !isMobile()) return;
        isSwiping = false;

        const deltaY = currentY - startY;
        if (STATE.isDrawerOpen && deltaY > threshold) {
            toggleDrawer(false); // Collapse to peek
        } else if (!STATE.isDrawerOpen && deltaY < -threshold) {
            toggleDrawer(true); // Expand from peek
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
    drawer.classList.remove('drawer-closed', 'drawer-peek', 'drawer-open');

    if (STATE.isDrawerOpen) {
        drawer.classList.add('drawer-open');
        icon.style.transform = 'rotate(180deg)';
        btn.classList.add('bg-white/10', 'text-white');
        searchWrapper.classList.add('active');
    } else {
        // Use appropriate closed state for viewport
        drawer.classList.add(isDesktop ? 'drawer-closed' : 'drawer-peek');
        icon.style.transform = 'rotate(0deg)';
        btn.classList.remove('bg-white/10', 'text-white');
        searchWrapper.classList.remove('active');
    }
}

// Initialize drawer state based on screen size
function initDrawerState() {
    const drawer = document.getElementById('list-drawer');
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
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
