async function init() {
  document.getElementById('event-list').innerHTML = '<div class="loading" role="status" aria-live="polite">Loading events...</div>';

  initMap();
  setupFilters();
  setupSearch();

  // Parse URL params for default filters
  const params = new URLSearchParams(window.location.search);
  if (params.get('category')) STATE.activeFilters.category = params.get('category');
  if (params.get('cost')) STATE.activeFilters.cost = params.get('cost');

  // Fetch events (server returns lat/lng already)
  const events = await scraperService.fetchEvents();
  STATE.events = events;

  // Build date carousel from actual event dates
  generateDateCarousel();

  render();

  window.addEventListener('resize', () => {
    STATE.isMobile = window.innerWidth < 640;
    map.invalidateSize();
  });
}

function generateDateCarousel() {
  const container = document.getElementById('date-carousel');

  // Get unique dates from events, sorted
  const dateSet = new Set();
  STATE.events.forEach(e => {
    if (e.startDate) {
      const key = e.startDate.toDateString();
      dateSet.add(key);
    }
  });
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dates = [...dateSet]
    .filter(ds => new Date(ds) >= todayStart)
    .sort((a, b) => new Date(a) - new Date(b));

  // "All" toggle — visually separate from date capsules
  let html = `<button class="date-capsule-all active" data-date="All" role="tab" aria-selected="true" onclick="selectDate(this, 'All')">
    <span class="capsule-label">All</span>
  </button>`;

  html += `<div class="carousel-divider"></div>`;

  const today = new Date().toDateString();
  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  let lastMonth = -1;

  dates.forEach(dateStr => {
    const d = new Date(dateStr);
    const dayName = days[d.getDay()];
    const dateNum = d.getDate();
    const isToday = dateStr === today;
    const count = STATE.events.filter(e => e.startDate && e.startDate.toDateString() === dateStr).length;
    const todayClass = isToday ? ' is-today' : '';
    const todayDot = isToday ? '<span class="today-dot"></span>' : '';

    // Insert sticky month header when month changes
    if (d.getMonth() !== lastMonth) {
      lastMonth = d.getMonth();
      html += `<div class="carousel-month-header">${months[d.getMonth()]}</div>`;
    }

    const dateLabel = `${isToday ? 'Today' : dayName} ${dateNum}, ${count} event${count !== 1 ? 's' : ''}`;
    html += `<button class="date-capsule${todayClass}" data-date="${dateStr}" role="tab" aria-selected="false" aria-label="${dateLabel}" onclick="selectDate(this, '${dateStr}')">
      ${todayDot ? `<span class="today-dot" aria-hidden="true"></span>` : ''}
      <span class="capsule-day">${isToday ? 'TODAY' : dayName}</span>
      <span class="capsule-num">${dateNum}</span>
      <span class="capsule-count">${count}</span>
    </button>`;
  });

  container.innerHTML = html;

  // Arrow key navigation for date tabs
  container.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    const idx = tabs.indexOf(document.activeElement);
    if (idx === -1) return;
    e.preventDefault();
    const next = e.key === 'ArrowRight' ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
    tabs[next].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });
}

function selectDate(el, dateStr) {
  // Update active state
  document.querySelectorAll('.date-capsule, .date-capsule-all').forEach(c => {
    c.classList.remove('active');
    c.setAttribute('aria-selected', 'false');
  });
  el.classList.add('active');
  el.setAttribute('aria-selected', 'true');

  STATE.activeFilters.date = dateStr;
  render();
}

function setupSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');
  let debounceTimer;

  input.addEventListener('input', () => {
    clearBtn.hidden = !input.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      STATE.searchQuery = input.value.trim();
      render();
    }, 300);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.hidden = true;
    STATE.searchQuery = '';
    render();
    input.focus();
  });
}

function setupFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.dataset.filter;
      const value = btn.dataset.value;

      document.querySelectorAll(`.filter-btn[data-filter="${group}"]`).forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');

      STATE.activeFilters[group] = value;
      render();
    });
  });

  // Arrow key navigation within radio groups
  document.querySelectorAll('.filter-group[role="radiogroup"]').forEach(group => {
    group.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const btns = [...group.querySelectorAll('.filter-btn')];
      const idx = btns.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      const next = e.key === 'ArrowRight' ? (idx + 1) % btns.length : (idx - 1 + btns.length) % btns.length;
      btns[next].focus();
      btns[next].click();
    });
  });
}

// Mobile bottom sheet drawer
function setupDrawer() {
  if (window.innerWidth > 640) return;

  const sidebar = document.querySelector('.sidebar');
  const handle = document.getElementById('drawer-handle');
  const eventList = document.getElementById('event-list');
  if (!sidebar || !handle) return;

  const PEEK_HEIGHT = 200; // px visible in peek state
  let startY = 0, currentY = 0, dragging = false, isOpen = false;
  let pullCollapsing = false; // track pull-to-collapse from scroll top

  function getDrawerHeight() { return sidebar.offsetHeight; }

  function open() {
    sidebar.classList.add('drawer-open');
    sidebar.classList.remove('drawer-peek');
    isOpen = true;
    if (typeof map !== 'undefined') setTimeout(() => map.invalidateSize(), 350);
  }

  function close() {
    sidebar.classList.remove('drawer-open');
    sidebar.classList.add('drawer-peek');
    isOpen = false;
    if (typeof map !== 'undefined') setTimeout(() => map.invalidateSize(), 350);
  }

  // Tap header to toggle
  handle.addEventListener('click', () => {
    if (dragging) return;
    isOpen ? close() : open();
  });

  // --- Swipe gesture on the header ---
  handle.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    currentY = startY;
    dragging = false;
    sidebar.style.transition = 'none';
  }, { passive: true });

  handle.addEventListener('touchmove', (e) => {
    currentY = e.touches[0].clientY;
    const dy = currentY - startY;
    if (Math.abs(dy) > 5) dragging = true;
    if (!dragging) return;

    const peekOffset = getDrawerHeight() - PEEK_HEIGHT;
    const baseOffset = isOpen ? 0 : peekOffset;
    const newOffset = Math.max(0, Math.min(peekOffset, baseOffset + dy));
    sidebar.style.transform = `translateY(${newOffset}px)`;
  }, { passive: true });

  handle.addEventListener('touchend', () => {
    sidebar.style.transition = '';
    sidebar.style.transform = '';

    if (!dragging) return;
    const dy = currentY - startY;

    if (isOpen && dy > 60) {
      close();
    } else if (!isOpen && dy < -60) {
      open();
    } else {
      isOpen ? open() : close();
    }
    setTimeout(() => { dragging = false; }, 0);
  });

  // --- Pull-to-collapse: swipe down on event list when scrolled to top ---
  if (eventList) {
    let listStartY = 0, listCurrentY = 0;

    eventList.addEventListener('touchstart', (e) => {
      // If not open, expand on touch
      if (!isOpen) { open(); return; }
      listStartY = e.touches[0].clientY;
      listCurrentY = listStartY;
      pullCollapsing = false;
    }, { passive: true });

    eventList.addEventListener('touchmove', (e) => {
      if (!isOpen) return;
      listCurrentY = e.touches[0].clientY;
      const dy = listCurrentY - listStartY;

      // Only trigger pull-to-collapse when scrolled to top and pulling down
      if (eventList.scrollTop <= 0 && dy > 5) {
        pullCollapsing = true;
        sidebar.style.transition = 'none';
        const peekOffset = getDrawerHeight() - PEEK_HEIGHT;
        const offset = Math.min(peekOffset, Math.max(0, dy));
        sidebar.style.transform = `translateY(${offset}px)`;
      }
    }, { passive: true });

    eventList.addEventListener('touchend', () => {
      if (!pullCollapsing) return;
      const dy = listCurrentY - listStartY;
      sidebar.style.transition = '';
      sidebar.style.transform = '';

      if (dy > 80) {
        close();
      } else {
        open(); // snap back
      }
      pullCollapsing = false;
    });
  }

  // Start in peek state
  sidebar.classList.add('drawer-peek');
}

init();
setupDrawer();
