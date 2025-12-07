/* =================================================================
   CALENDAR
   Date carousel, mode switching, toggle UI
   ================================================================= */

// Calendar Functions
function showDateCarousel() {
    document.getElementById('date-carousel').style.transform = 'translateY(0)';
}

function hideDateCarousel() {
    document.getElementById('date-carousel').style.transform = 'translateY(100%)';
}

function updateDateCarouselHighlight(dateString) {
    document.querySelectorAll('.date-capsule').forEach(cap => {
        cap.classList.toggle('active-date', cap.dataset.date === dateString);
    });
}

function selectDate(dateString) {
    STATE.currentMode = 'calendar';
    STATE.selectedCalendarDate = dateString;
    hideDateCarousel();

    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-calendar').classList.add('active');

    if (!STATE.isDrawerOpen) toggleDrawer(true);

    updateDateCarouselHighlight(dateString);
    render('calendar');
}

// Update the sliding toggle UI
function updateToggleUI(mode) {
    const slider = document.getElementById('header-slider');
    const btnToday = document.getElementById('btn-today');
    const btnTomorrow = document.getElementById('btn-tomorrow');
    const btnCalendar = document.getElementById('btn-calendar');

    // Reset all states
    btnToday.classList.remove('active');
    btnTomorrow.classList.remove('active');
    btnCalendar.classList.remove('active');

    if (mode === 'today') {
        slider.style.transform = 'translateX(0px)';
        btnToday.classList.add('active');
    } else if (mode === 'tomorrow') {
        slider.style.transform = 'translateX(66px)';
        btnTomorrow.classList.add('active');
    } else if (mode === 'calendar') {
        btnCalendar.classList.add('active');
    }
}

// Called from the toggle buttons
function setModeFromToggle(mode) {
    const carousel = document.getElementById('date-carousel');
    const isCarouselOpen = carousel.style.transform === 'translateY(0)' || carousel.style.transform === 'translateY(0px)';

    document.getElementById('btn-calendar').classList.remove('active');

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

    if (mode === 'calendar') {
        // Toggle calendar if already in calendar mode
        if (STATE.currentMode === 'calendar') {
            hideDateCarousel();
            // Switch back to today mode
            mode = 'today';
            updateToggleUI('today');
            STATE.currentMode = 'today';
            STATE.selectedCalendarDate = currentTime.toDateString();
            render('today');
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
    }
}

function generateDateCarousel() {
    const container = document.getElementById('cal-grid');
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

    for (let i = 0; i < 7; i++) {
        const date = addDays(new Date(), i);
        const dayStr = days[date.getDay()];
        const dateNum = date.getDate();
        const dateString = date.toDateString();

        const capsule = document.createElement('div');
        capsule.className = `date-capsule flex-shrink-0 w-14 h-16 rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center text-center text-neutral-400 font-bold bg-black/40 hover:bg-white/10 active:scale-95
                             ${dateString === STATE.selectedCalendarDate ? 'active-date' : ''}`;
        capsule.dataset.date = dateString;
        capsule.onclick = () => selectDate(dateString);
        capsule.innerHTML = `<span class="text-xs uppercase">${dayStr}</span><span class="text-2xl mt-0.5 leading-none text-white">${dateNum}</span>`;
        container.appendChild(capsule);
    }

    // Add active date styles
    const style = document.createElement('style');
    style.innerHTML = `.date-capsule.active-date { background: var(--rose); color: white !important; box-shadow: 0 0 15px var(--rose-glow); } .date-capsule.active-date span { color: white !important; }`;
    document.head.appendChild(style);
}
