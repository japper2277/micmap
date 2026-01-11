/* =================================================================
   CALENDAR
   Date carousel, mode switching, toggle UI
   ================================================================= */

// Calendar Functions
function showDateCarousel() {
    const carousel = document.getElementById('date-carousel');
    carousel.classList.add('active');

    // Desktop uses inline transform, mobile uses CSS
    if (window.innerWidth >= 768) {
        carousel.style.transform = 'translateY(0)';
    }

    // Activate mobile calendar button
    const mobileCalBtn = document.getElementById('mobile-calendar-btn');
    if (mobileCalBtn) mobileCalBtn.classList.add('active');
}

function hideDateCarousel() {
    const carousel = document.getElementById('date-carousel');
    carousel.classList.remove('active');

    // Desktop uses inline transform, mobile uses CSS
    if (window.innerWidth >= 768) {
        carousel.style.transform = 'translateY(100%)';
    } else {
        carousel.style.transform = '';
    }

    // Deactivate mobile calendar button
    const mobileCalBtn = document.getElementById('mobile-calendar-btn');
    if (mobileCalBtn) mobileCalBtn.classList.remove('active');
}

function updateDateCarouselHighlight(dateString) {
    document.querySelectorAll('.date-capsule').forEach(cap => {
        const isActive = cap.dataset.date === dateString;
        cap.classList.toggle('active-date', isActive);
        cap.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

// Update range highlight for Airbnb-style date range picker
function updateRangeHighlight() {
    const capsules = document.querySelectorAll('.date-capsule');
    const startDate = STATE.dateRangeStart ? new Date(STATE.dateRangeStart) : null;
    const endDate = STATE.dateRangeEnd ? new Date(STATE.dateRangeEnd) : null;

    capsules.forEach((cap, index) => {
        const capDate = new Date(cap.dataset.date);

        // Remove all range classes first
        cap.classList.remove('range-start', 'range-end', 'range-middle', 'active-date');

        if (startDate && capDate.toDateString() === startDate.toDateString()) {
            cap.classList.add('range-start');
            if (!endDate) cap.classList.add('active-date'); // Single selection
        }

        if (endDate && capDate.toDateString() === endDate.toDateString()) {
            cap.classList.add('range-end');
        }

        if (startDate && endDate && capDate > startDate && capDate < endDate) {
            cap.classList.add('range-middle');
        }
    });
}

// Airbnb-style range selection
function selectDate(dateString) {
    const clickedDate = new Date(dateString);
    const startDate = STATE.dateRangeStart ? new Date(STATE.dateRangeStart) : null;
    const endDate = STATE.dateRangeEnd ? new Date(STATE.dateRangeEnd) : null;

    // If we have a complete range, or clicking on an already selected date, reset
    if (endDate || (startDate && clickedDate.toDateString() === startDate.toDateString())) {
        STATE.dateRangeStart = dateString;
        STATE.dateRangeEnd = null;
    }
    // If we have a start date and clicking a date after it, complete the range
    else if (startDate && clickedDate > startDate) {
        STATE.dateRangeEnd = dateString;
    }
    // If clicking before start date, make this the new start
    else if (startDate && clickedDate < startDate) {
        STATE.dateRangeStart = dateString;
        STATE.dateRangeEnd = null;
    }
    // No start date yet, set it
    else {
        STATE.dateRangeStart = dateString;
        STATE.dateRangeEnd = null;
    }

    // Update mode and selected date for compatibility
    STATE.currentMode = 'calendar';
    STATE.selectedCalendarDate = STATE.dateRangeStart;

    // Update visual highlight
    updateRangeHighlight();

    // Only close carousel and render when range is complete (or single day selected after double-tap)
    if (STATE.dateRangeEnd || (STATE.dateRangeStart && !endDate && startDate && clickedDate.toDateString() === startDate.toDateString())) {
        hideDateCarousel();

        document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        const btnCalendar = document.getElementById('btn-calendar');
        if (btnCalendar) btnCalendar.classList.add('active');

        const mobileCalBtn = document.getElementById('mobile-calendar-btn');
        if (mobileCalBtn) mobileCalBtn.classList.remove('active');

        if (!STATE.isDrawerOpen) toggleDrawer(true);

        render('calendar');

        // If transit mode is active, recalculate routes
        if (STATE.isTransitMode && STATE.userOrigin) {
            transitService.calculateFromOrigin(
                STATE.userOrigin.lat,
                STATE.userOrigin.lng,
                STATE.userOrigin.name,
                null
            );
        }
    }
}

// Update the sliding toggle UI
function updateToggleUI(mode) {
    const slider = document.getElementById('header-slider');
    const btnToday = document.getElementById('btn-today');
    const btnTomorrow = document.getElementById('btn-tomorrow');
    const btnCalendar = document.getElementById('btn-calendar');

    // Reset all states (null-safe since Today/Tomorrow toggle was removed)
    if (btnToday) btnToday.classList.remove('active');
    if (btnTomorrow) btnTomorrow.classList.remove('active');
    if (btnCalendar) btnCalendar.classList.remove('active');

    if (mode === 'today') {
        if (slider) slider.style.transform = 'translateX(0px)';
        if (btnToday) btnToday.classList.add('active');
    } else if (mode === 'tomorrow') {
        if (slider) slider.style.transform = 'translateX(66px)';
        if (btnTomorrow) btnTomorrow.classList.add('active');
    } else if (mode === 'calendar') {
        if (btnCalendar) btnCalendar.classList.add('active');
    }
}

// Called from the toggle buttons
function setModeFromToggle(mode) {
    const carousel = document.getElementById('date-carousel');
    const isCarouselOpen = carousel.classList.contains('active');

    const btnCalendar = document.getElementById('btn-calendar');
    if (btnCalendar) btnCalendar.classList.remove('active');

    // Update selected date based on mode
    const currentTime = new Date();
    if (mode === 'today') {
        STATE.selectedCalendarDate = currentTime.toDateString();
    } else if (mode === 'tomorrow') {
        STATE.selectedCalendarDate = addDays(currentTime, 1).toDateString();
    }

    // Update calendar highlight if it's open
    if (isCarouselOpen) {
        updateDateCarouselHighlight(STATE.selectedCalendarDate);
    } else {
        hideDateCarousel();
    }

    setMode(mode);
}

function setMode(mode) {
    // Reset filters when changing modes
    resetFilters();

    const currentTime = new Date();
    const carousel = document.getElementById('date-carousel');
    const isCarouselOpen = carousel && carousel.classList.contains('active');

    if (mode === 'calendar') {
        // Toggle calendar if already open
        if (isCarouselOpen) {
            hideDateCarousel();
            // Switch back to today mode
            mode = 'today';
            updateToggleUI('today');
            STATE.currentMode = 'today';
            STATE.selectedCalendarDate = currentTime.toDateString();
            // Reset date range when closing calendar
            STATE.dateRangeStart = null;
            STATE.dateRangeEnd = null;
            render('today');

            // If transit mode is active, recalculate routes for new day's mics
            if (STATE.isTransitMode && STATE.userOrigin) {
                transitService.calculateFromOrigin(
                    STATE.userOrigin.lat,
                    STATE.userOrigin.lng,
                    STATE.userOrigin.name,
                    null
                );
            }
        } else {
            updateToggleUI('calendar');
            showDateCarousel();
            STATE.currentMode = 'calendar';
            // Initialize range highlight when opening
            updateRangeHighlight();
        }
    } else {
        updateToggleUI(mode);
        hideDateCarousel();
        STATE.currentMode = mode;
        STATE.selectedCalendarDate = (mode === 'today') ? currentTime.toDateString() : addDays(currentTime, 1).toDateString();
        // Reset date range when switching to today/tomorrow
        STATE.dateRangeStart = null;
        STATE.dateRangeEnd = null;
        render(mode);

        // If transit mode is active, recalculate routes for new day's mics
        if (STATE.isTransitMode && STATE.userOrigin) {
            transitService.calculateFromOrigin(
                STATE.userOrigin.lat,
                STATE.userOrigin.lng,
                STATE.userOrigin.name,
                null
            );
        }
    }
}

function generateDateCarousel() {
    const container = document.getElementById('cal-grid');
    container.setAttribute('role', 'listbox');
    container.setAttribute('aria-label', 'Select a date');

    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    for (let i = 0; i < 7; i++) {
        const date = addDays(new Date(), i);
        const dayStr = days[date.getDay()];
        const dateNum = date.getDate();
        const dateString = date.toDateString();
        const isActive = dateString === STATE.selectedCalendarDate;

        // Create accessible label: "Monday, December 16"
        const fullDayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        const monthName = months[date.getMonth()];
        const ariaLabel = `${fullDayName}, ${monthName} ${dateNum}`;

        const capsule = document.createElement('button');
        capsule.className = `date-capsule flex-shrink-0 w-14 h-16 rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center text-center text-neutral-400 font-bold bg-black/40 hover:bg-white/10 active:scale-95
                             ${isActive ? 'active-date' : ''}`;
        capsule.dataset.date = dateString;
        capsule.setAttribute('role', 'option');
        capsule.setAttribute('aria-label', ariaLabel);
        capsule.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        capsule.onclick = () => selectDate(dateString);
        capsule.innerHTML = `<span class="text-xs uppercase" aria-hidden="true">${dayStr}</span><span class="text-2xl mt-0.5 leading-none text-white" aria-hidden="true">${dateNum}</span>`;
        container.appendChild(capsule);
    }

    // Add active date styles
    const style = document.createElement('style');
    style.innerHTML = `.date-capsule.active-date { background: var(--rose); color: white !important; box-shadow: 0 0 15px var(--rose-glow); } .date-capsule.active-date span { color: white !important; }`;
    document.head.appendChild(style);
}
