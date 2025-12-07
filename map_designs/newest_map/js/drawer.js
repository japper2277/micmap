/* =================================================================
   DRAWER
   Drawer toggle, mobile swipe, viewport handling
   ================================================================= */

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

// Search clear function
function clearSearchInput() {
    document.getElementById('search-input').value = '';
    document.getElementById('search-clear-btn').classList.remove('visible');
}
