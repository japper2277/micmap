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

    // Deactivate desktop calendar button
    const btnCalendar = document.getElementById('btn-calendar');
    if (btnCalendar) btnCalendar.classList.remove('active');
}

function updateDateCarouselHighlight(dateString) {
    document.querySelectorAll('.date-capsule').forEach(cap => {
        const isActive = cap.dataset.date === dateString;
        cap.classList.toggle('active-date', isActive);
        cap.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

// Render dots on calendar capsules for days with scheduled items (disabled)
function renderCalendarDots() {
    return;

    const capsules = container.querySelectorAll('.date-capsule');
    capsules.forEach(cap => {
        const dateString = cap.dataset.date;
        const schedule = STATE.schedules[dateString];
        const hasSchedule = schedule && schedule.length > 0;

        // Remove existing dots
        const existingDot = cap.querySelector('.calendar-dot');
        if (existingDot) existingDot.remove();

        if (hasSchedule) {
            const dot = document.createElement('div');
            dot.className = 'calendar-dot';
            dot.style.cssText = `
                width: 4px;
                height: 4px;
                background-color: #22c55e;
                border-radius: 50%;
                margin-top: 6px;
                box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
            `;
            // Append dot to the capsule
            cap.appendChild(dot);
        }
    });
}


function selectDate(dateString) {
    STATE.currentMode = 'calendar';
    STATE.selectedCalendarDate = dateString;

    // Update visual highlight
    document.querySelectorAll('.date-capsule').forEach(cap => {
        const isActive = cap.dataset.date === dateString;
        cap.classList.toggle('active-date', isActive);
        cap.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Update the header calendar button to show selected date
    updateCalendarButtonDisplay(dateString);

    // Close the date carousel
    hideDateCarousel();

    // Render immediately with the selected date
    render('calendar');

    // If transit mode is active, recalculate routes for new day's mics (silent = don't move map)
    if (STATE.isTransitMode && STATE.userOrigin) {
        transitService.calculateFromOrigin(
            STATE.userOrigin.lat,
            STATE.userOrigin.lng,
            STATE.userOrigin.name,
            null,
            { silent: true }
        );
    }
}

// Update the calendar button in header to show the selected date
function updateCalendarButtonDisplay(dateString) {
    const date = new Date(dateString);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const displayText = `${days[date.getDay()]} ${date.getDate()}`;

    // Desktop calendar button
    const calText = document.getElementById('cal-text');
    if (calText) calText.textContent = displayText;

    // Mobile calendar button
    const mobileCalText = document.getElementById('mobile-cal-text');
    if (mobileCalText) mobileCalText.textContent = displayText;
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
    const currentTime = new Date();
    const carousel = document.getElementById('date-carousel');
    const isCarouselOpen = carousel && carousel.classList.contains('active');

    if (mode === 'calendar') {
        // Toggle calendar open/closed - don't reset filters, just show/hide picker
        if (isCarouselOpen) {
            // Just close the carousel - keep the currently selected date/mode
            hideDateCarousel();
        } else {
            updateToggleUI('calendar');
            showDateCarousel();
            STATE.currentMode = 'calendar';
        }
    } else {
        // Only reset filters when actually changing to a different day mode
        resetFilters();
        updateToggleUI(mode);
        hideDateCarousel();
        STATE.currentMode = mode;
        STATE.selectedCalendarDate = (mode === 'today') ? currentTime.toDateString() : addDays(currentTime, 1).toDateString();
        updateCalendarButtonDisplay(STATE.selectedCalendarDate);
        render(mode);

        // If transit mode is active, recalculate routes for new day's mics (silent = don't move map)
        if (STATE.isTransitMode && STATE.userOrigin) {
            transitService.calculateFromOrigin(
                STATE.userOrigin.lat,
                STATE.userOrigin.lng,
                STATE.userOrigin.name,
                null,
                { silent: true }
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

    const monthAbbrs = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

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
        capsule.className = `date-capsule flex-shrink-0 w-12 h-14 rounded-lg transition-all cursor-pointer flex flex-col items-center justify-center text-center text-neutral-400 font-bold bg-black/40
                             ${isActive ? 'active-date' : ''}`;
        capsule.dataset.date = dateString;
        capsule.setAttribute('role', 'option');
        capsule.setAttribute('aria-label', ariaLabel);
        capsule.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        capsule.onclick = () => selectDate(dateString);

        // Different labels: TODAY for first, month abbr for 1st of month, day name for others
        if (i === 0) {
            capsule.innerHTML = `<span class="text-[10px] uppercase text-rose-400 font-semibold tracking-wide" aria-hidden="true">TODAY</span><span class="text-2xl mt-0.5 leading-none text-white" aria-hidden="true">${dateNum}</span>`;
        } else if (dateNum === 1) {
            const monthAbbr = monthAbbrs[date.getMonth()];
            capsule.innerHTML = `<span class="text-[10px] uppercase text-amber-400 font-semibold tracking-wide" aria-hidden="true">${monthAbbr}</span><span class="text-2xl mt-0.5 leading-none text-white" aria-hidden="true">${dateNum}</span>`;
        } else {
            capsule.innerHTML = `<span class="text-[11px] uppercase opacity-70 tracking-wide" aria-hidden="true">${dayStr}</span><span class="text-2xl mt-0.5 leading-none text-white" aria-hidden="true">${dateNum}</span>`;
        }
        container.appendChild(capsule);
    }

    // Add styles for active state, hover/press feedback
    const style = document.createElement('style');
    style.innerHTML = `
        .date-capsule {
            border: 2px solid transparent;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .date-capsule.active-date {
            background: rgba(244, 63, 94, 0.15);
            border: 2px solid var(--rose);
            box-shadow: 0 0 12px var(--rose-glow);
        }
        .date-capsule.active-date span {
            color: white !important;
        }
        @media (hover: hover) {
            .date-capsule:hover:not(.active-date) {
                background: rgba(255, 255, 255, 0.12);
                border-color: rgba(255, 255, 255, 0.2);
                transform: translateY(-2px);
            }
        }
        .date-capsule:active {
            transform: scale(0.95) !important;
            background: rgba(255, 255, 255, 0.15);
        }
        .date-capsule:focus-visible {
            outline: none;
            box-shadow: 0 0 0 2px var(--rose), 0 0 0 4px rgba(244, 63, 94, 0.3);
        }
    `;
    document.head.appendChild(style);
}

