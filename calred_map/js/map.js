let map, markersGroup;

function initMap() {
  const isMobile = window.innerWidth < 640;
  map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView(CONFIG.mapCenter, isMobile ? CONFIG.mobileMapZoom : CONFIG.mapZoom);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);
  markersGroup = L.featureGroup().addTo(map);

  // Re-cluster markers when zoom crosses thresholds
  let lastPrecision = -1;
  map.on('zoomend', () => {
    const z = map.getZoom();
    const p = z >= 16 ? 4 : z >= 14 ? 3 : 2;
    if (p !== lastPrecision && STATE.filteredEvents) {
      lastPrecision = p;
      renderMarkers(STATE.filteredEvents, { skipFitBounds: true });
    }
  });
}

// Format time like MicFinder: "7p", "10:30a"
function shortTime(timeStr) {
  if (!timeStr) return '?';
  const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return timeStr;
  let [, h, min, ampm] = m;
  const suffix = ampm.toUpperCase() === 'AM' ? 'a' : 'p';
  if (min === '00') return `${h}${suffix}`;
  return `${h}:${min}${suffix}`;
}

// Get status based on event start time
function getEventStatus(event) {
  const now = new Date();
  const diff = event.startDate - now;
  const minsDiff = diff / 60000;
  if (minsDiff < -90) return 'past';
  if (minsDiff < 0) return 'live';
  if (minsDiff < 120) return 'upcoming';
  return 'future';
}

function renderMarkers(events, options = {}) {
  const skipFitBounds = options.skipFitBounds || false;

  markersGroup.clearLayers();
  STATE.markerLookup = {};

  // Zoom-dependent clustering
  const zoom = map.getZoom();
  const precision = zoom >= 16 ? 4 : zoom >= 14 ? 3 : 2;
  const byLocation = {};
  events.forEach(e => {
    if (!e.lat || !e.lng) return;
    const key = `${e.lat.toFixed(precision)},${e.lng.toFixed(precision)}`;
    if (!byLocation[key]) byLocation[key] = [];
    byLocation[key].push(e);
  });

  Object.values(byLocation).forEach(group => {
    const marker = createMarkerForGroup(group);
    group.forEach(e => { STATE.markerLookup[e.id] = marker; });
    markersGroup.addLayer(marker);
  });

  if (!skipFitBounds && markersGroup.getLayers().length > 0) {
    map.fitBounds(markersGroup.getBounds().pad(0.1));
  }
}

function createMarkerForGroup(group) {
  const primary = group[0];
  const time = shortTime(primary.timeStr);
  const extraCount = group.length - 1;

  const cat = primary.primaryCategory || '';
  let catClass = 'cat-default';
  if (cat.includes('music')) catClass = 'cat-music';
  else if (cat.includes('image') || cat.includes('performance')) catClass = 'cat-performance';
  else if (cat.includes('political')) catClass = 'cat-political';
  else if (cat.includes('mutual') || cat.includes('community')) catClass = 'cat-community';
  else if (cat.includes('literary') || cat.includes('research')) catClass = 'cat-literary';

  const chipHtml = extraCount > 0
    ? `<div class="venue-chip">+${extraCount}</div>`
    : '';

  const textWidth = time.length * 11 + 12;
  const totalWidth = Math.max(textWidth, 44) + (extraCount > 0 ? 20 : 0);
  const totalHeight = 42;

  const markerTitle = extraCount > 0
    ? `${primary.title} and ${extraCount} more at ${time}`
    : `${primary.title} at ${time}`;

  const marker = L.marker([primary.lat, primary.lng], {
    title: markerTitle,
    alt: markerTitle,
    icon: L.divIcon({
      className: 'bg-transparent',
      html: `<div class="cluster-pill ${catClass}" aria-hidden="true">
              <span class="pill-main-text">${time}</span>
              ${chipHtml}
              <div class="pill-tail" aria-hidden="true"></div>
             </div>`,
      iconSize: [totalWidth, totalHeight],
      iconAnchor: [totalWidth / 2, totalHeight]
    })
  });

  marker.on('click', () => {
    if (group.length === 1) {
      showEventDetail(primary);
    } else {
      showClusterPicker(group, primary.lat, primary.lng);
    }
  });

  // Make marker keyboard-accessible (Gap 2)
  marker.once('add', () => {
    const el = marker.getElement();
    if (el) {
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', markerTitle);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          marker.fire('click');
        }
      });
    }
  });

  return marker;
}

function highlightMarker(eventId) {
  const marker = STATE.markerLookup[eventId];
  if (marker) {
    const el = marker.getElement();
    if (el) el.classList.add('marker-highlight');
  }
}

function unhighlightMarker(eventId) {
  const marker = STATE.markerLookup[eventId];
  if (marker) {
    const el = marker.getElement();
    if (el) el.classList.remove('marker-highlight');
  }
}

function flyToEvent(event) {
  if (event.lat && event.lng) {
    map.flyTo([event.lat, event.lng], 16, { duration: 0.8 });
  }
}
