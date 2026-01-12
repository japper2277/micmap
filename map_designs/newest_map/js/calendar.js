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

function selectDate(dateString) {
    STATE.currentMode = 'calendar';
    STATE.selectedCalendarDate = dateString;

    // Update visual highlight - also clear allweek if it was active
    document.querySelectorAll('.date-capsule').forEach(cap => {
        const isActive = cap.dataset.date === dateString;
        cap.classList.toggle('active-date', isActive);
        cap.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Update the header calendar button to show selected date
    updateCalendarButtonDisplay(dateString);

    // Render immediately with the selected date
    render('calendar');

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

// Update the calendar button in header to show the selected date
function updateCalendarButtonDisplay(dateString) {
    const date = new Date(dateString);
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const day = days[date.getDay()];
    const dateNum = date.getDate();

    // Desktop calendar button
    const calDay = document.getElementById('cal-month');
    const calDate = document.getElementById('cal-date-num');
    if (calDay) calDay.textContent = day;
    if (calDate) calDate.textContent = dateNum;

    // Mobile calendar button
    const mobileCalDay = document.getElementById('mobile-cal-month');
    const mobileCalDate = document.getElementById('mobile-cal-date-num');
    if (mobileCalDay) mobileCalDay.textContent = day;
    if (mobileCalDate) mobileCalDate.textContent = dateNum;
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
        // Toggle calendar open/closed
        if (isCarouselOpen) {
            // Just close the carousel - keep the currently selected date/mode
            hideDateCarousel();
        } else {
            updateToggleUI('calendar');
            showDateCarousel();
            STATE.currentMode = 'calendar';
        }
    } else {
        updateToggleUI(mode);
        hideDateCarousel();
        STATE.currentMode = mode;
        STATE.selectedCalendarDate = (mode === 'today') ? currentTime.toDateString() : addDays(currentTime, 1).toDateString();
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
        const isActive = dateString === STATE.selectedCalendarDate && STATE.currentMode !== 'allweek';

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

    // Add separator
    const separator = document.createElement('div');
    separator.className = 'date-separator';
    container.appendChild(separator);

    // Add "All Week" button
    const isAllWeekActive = STATE.currentMode === 'allweek';
    const allWeekBtn = document.createElement('button');
    allWeekBtn.className = `date-capsule all-week-btn flex-shrink-0 w-16 h-16 rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center text-center text-neutral-400 font-bold bg-black/40 hover:bg-white/10 active:scale-95
                         ${isAllWeekActive ? 'active-date' : ''}`;
    allWeekBtn.dataset.date = 'allweek';
    allWeekBtn.setAttribute('role', 'option');
    allWeekBtn.setAttribute('aria-label', 'View all week');
    allWeekBtn.setAttribute('aria-pressed', isAllWeekActive ? 'true' : 'false');
    allWeekBtn.onclick = () => selectAllWeek();
    allWeekBtn.innerHTML = `<span class="text-xs uppercase" aria-hidden="true">ALL</span><span class="text-base mt-0.5 leading-none text-white font-bold" aria-hidden="true">WEEK</span>`;
    container.appendChild(allWeekBtn);

    // Add active date styles
    const style = document.createElement('style');
    style.innerHTML = `.date-capsule.active-date { background: var(--rose); color: white !important; box-shadow: 0 4px 15px var(--rose-glow); transform: scale(1.05); } .date-capsule.active-date span { color: white !important; } .date-separator { width: 1px; background: #333; margin: 5px 5px; flex-shrink: 0; }`;
    document.head.appendChild(style);
}

function selectAllWeek() {
    STATE.currentMode = 'allweek';

    // Update highlights
    document.querySelectorAll('.date-capsule').forEach(cap => {
        const isAllWeek = cap.dataset.date === 'allweek';
        cap.classList.toggle('active-date', isAllWeek);
        cap.setAttribute('aria-pressed', isAllWeek ? 'true' : 'false');
    });

    // Update header calendar button to show "ALL WEEK"
    const calDay = document.getElementById('cal-month');
    const calDate = document.getElementById('cal-date-num');
    if (calDay) calDay.textContent = 'ALL';
    if (calDate) calDate.textContent = '7';

    const mobileCalDay = document.getElementById('mobile-cal-month');
    const mobileCalDate = document.getElementById('mobile-cal-date-num');
    if (mobileCalDay) mobileCalDay.textContent = 'ALL';
    if (mobileCalDate) mobileCalDate.textContent = '7';

    // Render all week's mics
    render('allweek');

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
