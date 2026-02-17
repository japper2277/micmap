function decodeHtmlEntities(str) {
  if (!str) return '';
  const ta = document.createElement('textarea');
  ta.innerHTML = str;
  return ta.value;
}

function escapeHtml(str) {
  if (!str) return '';
  // Decode first to avoid double-encoding API data that already contains entities
  const decoded = decodeHtmlEntities(str);
  return decoded.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Auto-link URLs in already-escaped text
function linkifyText(escapedStr) {
  return escapedStr.replace(
    /(https?:\/\/[^\s<&]+)/g,
    '<a href="$1" target="_blank" rel="noopener" style="color:#64D2FF;word-break:break-all">$1</a>'
  );
}

// Extract neighborhood/borough from address
function extractNeighborhood(where) {
  if (!where) return '';
  const parts = where.split(',').map(s => s.trim());
  if (parts.length < 2) return ''; // No comma = can't extract, show full address

  const boroughs = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten island'];
  const boroughAbbrevs = { 'bk': 'Brooklyn', 'nyc': '', 'ny': '' };

  // Scan from end to find neighborhood or borough
  for (let i = parts.length - 1; i >= 1; i--) {
    const clean = parts[i].toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (!clean || clean.match(/^\d/)) continue; // skip zip codes, numbers

    // Check borough abbreviations
    if (boroughAbbrevs[clean] !== undefined) {
      return boroughAbbrevs[clean] || (i > 1 ? parts[i - 1].trim() : '');
    }
    // Check full borough names
    if (boroughs.includes(clean)) return parts[i].trim();
    // Otherwise it's likely a neighborhood
    return parts[i].trim();
  }
  return '';
}

// Split comma-joined category strings into individual tags
function splitCategories(categoryList) {
  const result = [];
  categoryList.forEach(c => {
    c.split(',').forEach(part => {
      const trimmed = part.trim();
      if (trimmed) result.push(trimmed);
    });
  });
  return result;
}

function render() {
  const container = document.getElementById('event-list');
  let events = [...STATE.events];

  // Apply filters
  const { category, cost, date } = STATE.activeFilters;

  if (category !== 'All') {
    events = events.filter(e => e.primaryCategory.includes(category));
  }
  if (cost === 'Free') {
    events = events.filter(e => e.isFree);
  } else if (cost === 'Paid') {
    events = events.filter(e => !e.isFree);
  }
  if (date !== 'All') {
    events = events.filter(e => e.startDate && e.startDate.toDateString() === date);
  }
  if (STATE.searchQuery) {
    const q = STATE.searchQuery.toLowerCase();
    events = events.filter(e =>
      (e.title && e.title.toLowerCase().includes(q)) ||
      (e.where && e.where.toLowerCase().includes(q))
    );
  }

  // Sort by date
  events.sort((a, b) => a.startDate - b.startDate);

  STATE.filteredEvents = events;

  // Update count
  document.getElementById('event-count').textContent = `· ${events.length} event${events.length !== 1 ? 's' : ''}`;

  // Render markers
  renderMarkers(events);

  // Render list
  if (events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No events match your filters</p>
        <button onclick="resetFilters()" class="reset-btn">Reset Filters</button>
      </div>`;
    return;
  }

  // Group by date
  const byDate = {};
  events.forEach(e => {
    const key = e.startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(e);
  });

  // Screen-reader-only summary table for map alternative (Gap 4)
  let html = `<table class="sr-only" aria-label="Event summary">
    <caption>All ${events.length} events currently shown</caption>
    <thead><tr><th>Time</th><th>Event</th><th>Location</th><th>Category</th><th>Cost</th></tr></thead>
    <tbody>${events.map(e => {
      const catLabel = CONFIG.categoryLabels[e.primaryCategory] || CONFIG.categoryLabels.default;
      return `<tr><td>${escapeHtml(e.timeStr)}</td><td>${escapeHtml(e.title)}</td><td>${escapeHtml(e.where)}</td><td>${catLabel}</td><td>${e.isFree ? 'Free' : escapeHtml(e.priceDisplay || 'Paid')}</td></tr>`;
    }).join('')}</tbody>
  </table>`;

  for (const [dateStr, dateEvents] of Object.entries(byDate)) {
    html += `<div class="date-header" role="heading" aria-level="2">${escapeHtml(dateStr)}</div>`;
    dateEvents.forEach((e, i) => {
      html += renderCard(e, i);
    });
  }

  container.innerHTML = html;
}

function renderCard(event, index = 0) {
  const color = CONFIG.categoryColors[event.primaryCategory] || CONFIG.categoryColors.default;
  const catIcon = CONFIG.categoryIcons[event.primaryCategory] || CONFIG.categoryIcons.default;
  const catLabel = CONFIG.categoryLabels[event.primaryCategory] || CONFIG.categoryLabels.default;
  const imgAlt = event.img ? escapeHtml(event.title) : '';
  const imgHtml = event.img
    ? `<img class="card-img" src="${escapeHtml(event.img)}" alt="${imgAlt}" loading="lazy" onload="this.classList.add('loaded')" />`
    : `<div class="card-img card-img-placeholder" style="background:${color}20;color:${color}"><span aria-hidden="true">${catIcon}</span></div>`;
  const neighborhood = extractNeighborhood(event.where);
  const linkHtml = event.link
    ? `<a href="${escapeHtml(event.link.url)}" target="_blank" rel="noopener" class="card-link">${escapeHtml(event.link.text || 'More info')}</a>`
    : '';
  const costBadge = event.isFree
    ? '<span class="badge badge-free">Free</span>'
    : `<span class="badge badge-paid">${escapeHtml(event.priceDisplay)}</span>`;
  return `
    <div class="event-card" data-id="${event.id}" role="article" tabindex="0"
         style="animation-delay:${Math.min(index * 30, 300)}ms"
         onmouseenter="highlightMarker('${event.id}')"
         onmouseleave="unhighlightMarker('${event.id}')"
         onfocus="highlightMarker('${event.id}')"
         onblur="unhighlightMarker('${event.id}')"
         onclick="onCardClick('${event.id}')"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();onCardClick('${event.id}')}">
      <div class="card-top">
        ${imgHtml}
        <div class="card-info">
          <div class="card-time" style="color:${color}">
            <span class="time-icon" role="img" aria-label="${catLabel}">${catIcon}</span>
            ${escapeHtml(event.timeStr)}
          </div>
          <h3 class="card-title">${escapeHtml(event.title)}</h3>
          <div class="card-where">${escapeHtml(neighborhood || event.where)}</div>
          <div class="card-meta">
            ${costBadge}
          </div>
        </div>
        <span class="card-chevron" aria-hidden="true">›</span>
      </div>
    </div>`;
}

function toggleDesc(descId) {
  const el = document.getElementById(descId);
  const btn = el.nextElementSibling;
  el.classList.toggle('expanded');
  const isExpanded = el.classList.contains('expanded');
  btn.textContent = isExpanded ? 'less' : 'more';
  btn.setAttribute('aria-expanded', String(isExpanded));
}

function toggleNoteExpand(btn) {
  const wrap = btn.parentElement;
  wrap.classList.toggle('expanded');
  const isExpanded = wrap.classList.contains('expanded');
  btn.textContent = isExpanded ? 'Show less' : 'Show more';
  btn.setAttribute('aria-expanded', String(isExpanded));
}

function onCardClick(eventId) {
  const event = STATE.events.find(e => e.id === eventId);
  if (event) {
    flyToEvent(event);
    showEventDetail(event);
  }
}

let _lastFocusBeforeModal = null;

function showEventDetail(event) {
  _lastFocusBeforeModal = document.activeElement;
  STATE.selectedEvent = event;
  const overlay = document.getElementById('detail-panel');
  const color = CONFIG.categoryColors[event.primaryCategory] || CONFIG.categoryColors.default;

  // Google Maps directions link
  const mapsUrl = event.where
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(event.where)}`
    : '#';

  // Price badge
  const priceBadge = event.isFree
    ? '<span class="info-badge info-badge-price">Free</span>'
    : (event.priceDisplay ? `<span class="info-badge info-badge-price">${escapeHtml(event.priceDisplay)}</span>` : '');

  // Category badges — split comma-joined tags
  const cats = splitCategories(event.categoryList);
  const catBadges = cats.map(c => {
    const catColor = CONFIG.categoryColors[event.primaryCategory] || CONFIG.categoryColors.default;
    return `<span class="info-badge" style="background:${catColor}15;border-color:${catColor}40;color:${catColor}">${escapeHtml(c)}</span>`;
  }).join('');

  overlay.innerHTML = `
    <div class="modal-backdrop" onclick="closeDetail()"></div>
    <div class="venue-card">
      <button class="modal-close-btn" onclick="closeDetail()" aria-label="Close">&times;</button>
      ${event.img ? `<div class="venue-card-img-wrap" onclick="event.stopPropagation();expandImage('${escapeHtml(event.img)}')"><img class="venue-card-img" src="${escapeHtml(event.img)}" alt="" onload="this.classList.add('loaded')" /><div class="img-expand-hint">Tap to expand</div></div>` : ''}
      <div class="header-section">
        <div class="modal-drag-handle"></div>
        <div class="header-top">
          <h2>${escapeHtml(event.title)}</h2>
          <span class="time-display">${escapeHtml(event.timeStr || '')}</span>
        </div>
        <a class="sub-header" href="${mapsUrl}" target="_blank" rel="noopener">
          <svg class="maps-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 6.9 8 11.7z"/></svg>
          <span class="address">${escapeHtml(event.where)}</span>
          <span class="maps-arrow">→</span>
        </a>
        <div class="info-row">
          ${priceBadge}
          ${catBadges}
        </div>
        ${event.description ? `
          <div class="note-text-wrap">
            <div class="note-text">${linkifyText(escapeHtml(event.description))}</div>
            ${event.description.length > 200 ? '<button class="note-expand-btn" aria-expanded="false" onclick="toggleNoteExpand(this)">Show more</button>' : ''}
          </div>` : ''}
        ${event.link ? `
          <div class="action-stack">
            <a href="${escapeHtml(event.link.url)}" target="_blank" rel="noopener" class="btn btn-primary">
              ${escapeHtml(event.link.text || 'More info')} →
            </a>
          </div>
        ` : ''}
      </div>
    </div>`;
  overlay.classList.add('open');

  // Focus the close button after animation
  requestAnimationFrame(() => {
    const closeBtn = overlay.querySelector('.modal-close-btn');
    if (closeBtn) closeBtn.focus();
  });
}

function trapFocusInModal(e) {
  const panel = document.getElementById('detail-panel');
  if (!panel.classList.contains('open')) return;
  if (e.key !== 'Tab') return;
  const focusable = panel.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
document.addEventListener('keydown', trapFocusInModal);

function closeDetail() {
  document.getElementById('detail-panel').classList.remove('open');
  STATE.selectedEvent = null;
  if (_lastFocusBeforeModal) {
    _lastFocusBeforeModal.focus();
    _lastFocusBeforeModal = null;
  }
}

// Close modal on Escape key or browser back
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDetail();
});
window.addEventListener('popstate', () => closeDetail());

// Swipe-to-dismiss on mobile modal
(function setupModalSwipe() {
  let startY = 0, currentY = 0, dragging = false;
  const panel = document.getElementById('detail-panel');

  panel.addEventListener('touchstart', (e) => {
    const card = panel.querySelector('.venue-card');
    if (!card || card.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    dragging = true;
  }, { passive: true });

  panel.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    currentY = e.touches[0].clientY;
    const dy = currentY - startY;
    if (dy > 0) {
      const card = panel.querySelector('.venue-card');
      if (card) {
        card.classList.remove('snapping');
        const progress = Math.min(dy / 200, 1);
        card.style.transform = `translateY(${dy}px)`;
        card.style.opacity = 1 - progress * 0.4;
      }
    }
  }, { passive: true });

  panel.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    const dy = currentY - startY;
    const card = panel.querySelector('.venue-card');
    if (dy > 120) {
      closeDetail();
      if (card) { card.style.transform = ''; card.style.opacity = ''; }
    } else if (card) {
      // Spring snap-back
      card.classList.add('snapping');
      card.style.transform = '';
      card.style.opacity = '';
      card.addEventListener('transitionend', () => card.classList.remove('snapping'), { once: true });
    }
    currentY = startY; // reset for next gesture
  });
})();

function showClusterPicker(events, lat, lng) {
  // Deduplicate events with same title + time + location
  const grouped = {};
  events.forEach(e => {
    const key = `${e.title}|${e.timeStr}|${e.where}`;
    if (!grouped[key]) grouped[key] = { event: e, count: 0, dates: [] };
    grouped[key].count++;
    if (e.startDate) {
      const dateStr = e.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!grouped[key].dates.includes(dateStr)) grouped[key].dates.push(dateStr);
    }
  });

  const uniqueCount = Object.keys(grouped).length;
  const totalCount = events.length;
  const titleText = uniqueCount === 1
    ? `1 event · ${totalCount} dates`
    : `${uniqueCount} events here`;

  const listHtml = Object.values(grouped).map(({ event: e, count, dates }) => {
    const color = CONFIG.categoryColors[e.primaryCategory] || CONFIG.categoryColors.default;
    const icon = CONFIG.categoryIcons[e.primaryCategory] || CONFIG.categoryIcons.default;
    const time = e.timeStr || '';
    const countBadge = count > 1 ? `<span class="cluster-venue-count">${count}×</span>` : '';
    const dateInfo = dates.length > 1 ? `<div class="cluster-venue-dates">${dates.join(' · ')}</div>` : '';
    return `<div class="cluster-venue-item" onclick="onClusterItemClick('${e.id}')">
      <div class="cluster-venue-time" style="color:${color}">${icon} ${escapeHtml(time)} ${countBadge}</div>
      <div class="cluster-venue-name">${escapeHtml(e.title)}</div>
      <div class="cluster-venue-where">${escapeHtml(e.where)}</div>
      ${dateInfo}
      <div class="cluster-venue-cta">View details →</div>
    </div>`;
  }).join('');

  L.popup({
    className: 'cluster-picker-popup',
    closeButton: true,
    autoClose: true,
    maxWidth: 280
  })
  .setLatLng([lat, lng])
  .setContent(`<div class="cluster-picker">
    <div class="cluster-picker-title">${titleText}</div>
    <div class="cluster-picker-list">${listHtml}</div>
  </div>`)
  .openOn(map);
}

function onClusterItemClick(eventId) {
  map.closePopup();
  const event = STATE.events.find(e => e.id === eventId);
  if (event) showEventDetail(event);
}

function resetFilters() {
  STATE.activeFilters = { category: 'All', cost: 'All', date: 'All' };
  STATE.searchQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) { searchInput.value = ''; }
  const searchClear = document.getElementById('search-clear');
  if (searchClear) { searchClear.hidden = true; }
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.filter-btn[data-value="All"]').forEach(b => b.classList.add('active'));
  render();
}

// Fullscreen image lightbox
function expandImage(src) {
  const overlay = document.createElement('div');
  overlay.className = 'image-lightbox';
  overlay.innerHTML = `
    <img src="${src}" alt="Full size poster" />
    <button class="lightbox-close" aria-label="Close">&times;</button>
  `;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
}
