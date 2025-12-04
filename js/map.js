// =============================================================================
// MAP FUNCTIONS
// =============================================================================
// Leaflet map initialization, markers, and interactions

// Global map variables
let map, markers, markerIcons, markerClusterGroup;

// =============================================================================
// MAP INITIALIZATION
// =============================================================================

function initMap() {
    map = L.map(DOM_IDS.mapView, { zoomControl: false }).setView(
        MAP_CONFIG.defaultCenter,
        MAP_CONFIG.defaultZoom
    );

    L.tileLayer(MAP_CONFIG.tileLayer, {
        attribution: MAP_CONFIG.tileAttribution
    }).addTo(map);

    markerClusterGroup = L.markerClusterGroup(MAP_CONFIG.markerClusterOptions);
    map.addLayer(markerClusterGroup);

    // Export map instance globally for resize handling
    window.mapInstance = map;

    // Custom icon definitions
    markerIcons = {
        default: L.divIcon({
            className: 'leaflet-marker-icon default-pin',
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32]
        }),
        topPick: L.divIcon({
            className: 'leaflet-marker-icon top-pick-pin',
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -40]
        }),
        highlight: L.divIcon({
            className: 'leaflet-marker-icon highlight-pin',
            iconSize: [36, 36],
            iconAnchor: [18, 36],
            popupAnchor: [0, -36]
        }),
        openNow: L.divIcon({
            className: 'leaflet-marker-icon open-now-pin',
            iconSize: [38, 38],
            iconAnchor: [19, 38],
            popupAnchor: [0, -38]
        })
    };

    // Map event listeners
    // (No special handling needed for filters container in new layout)

    map.on('popupopen', function(e) {
        const marker = e.popup._source;
        state.hoveredMicId = marker.options.micId;
        updateMapMarkers();
    });

    map.on('popupclose', function(e) {
        state.hoveredMicId = null;
        updateMapMarkers();
    });
}

// =============================================================================
// MAP POPUP CREATION
// =============================================================================

function createMapPopup(mic) {
    const mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${mic.lat},${mic.lon}`;

    let signUpButton = '';
    if (mic.signUpDetails.type === 'url') {
        signUpButton = `<a href="${mic.signUpDetails.value}" target="_blank" rel="noopener noreferrer" class="col-span-1 block w-full text-center bg-[var(--brand-blue)] hover:bg-[var(--brand-blue-hover)] text-white font-semibold py-2 px-3 rounded-lg text-sm action-btn">Sign Up</a>`;
    } else if (mic.signUpDetails.type === 'email') {
        signUpButton = `<a href="mailto:${mic.signUpDetails.value}" class="col-span-1 block w-full text-center bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 px-3 rounded-lg text-sm action-btn">Email</a>`;
    } else {
        signUpButton = `<div class="col-span-2 bg-[var(--surface-light)] p-2 rounded-lg text-center"><p class="text-xs text-[var(--text-secondary)]">${mic.signUpDetails.value}</p></div>`;
    }

    return `
        <div class="p-3 w-[260px] text-[var(--text-primary)] font-inter bg-[var(--surface-light)] rounded-xl shadow-2xl border border-[var(--border-color)]">
            <h4 class="text-lg font-bold text-[var(--text-primary)] mb-1">${mic.name}</h4>
            <p class="text-xs text-[var(--text-secondary)] mb-3">${mic.neighborhood}, ${mic.borough}</p>
            <div class="flex justify-between items-center text-sm mb-3 pb-3 border-b border-[var(--border-color)]">
                <p class="font-semibold text-[var(--brand-blue)]">${mic.day}, ${mic.startTime}</p>
                <div class="flex items-center text-[var(--warning-orange)] font-bold">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="mr-1"><path d="M8.5 14.5A2.5 2.5 0 0011 17v3a2 2 0 104 0v-3a2.5 2.5 0 002.5-2.5v-7A2.5 2.5 0 0015 5V3a1 1 0 10-2 0v2a2.5 2.5 0 00-2.5 2.5v7z"/></svg>
                    <span>${mic.comics}</span>
                </div>
            </div>
            ${mic.stageTime ? `
            <div class="flex items-center text-[var(--text-secondary)] text-xs mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1 text-[var(--text-tertiary)]"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span class="font-medium">${mic.stageTime}</span>
            </div>` : ''}
            <div class="grid grid-cols-2 gap-2 mt-3">
                <a href="${mapsLink}" target="_blank" rel="noopener noreferrer" class="col-span-1 block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-lg text-sm action-btn">Directions</a>
                ${signUpButton}
            </div>
        </div>
    `;
}

// =============================================================================
// UPDATE MAP MARKERS
// =============================================================================

function updateMapMarkers() {
    markerClusterGroup.clearLayers();
    markers = [];
    let bounds = [];

    state.mics.forEach(mic => {
        if (mic.lat && mic.lon) {
            const isTopPick = state.topPicks.some(tp => tp.id === mic.id);
            const isHovered = state.hoveredMicId === mic.id;
            const isOpenNow = isMicOpenNow(mic) === 'open';

            // Determine which icon to use (priority: hovered > openNow > topPick > default)
            let icon = markerIcons.default;
            if (isHovered) {
                icon = markerIcons.highlight;
            } else if (isOpenNow) {
                icon = markerIcons.openNow;
            } else if (isTopPick && FEATURES.topPicksEnabled) {
                icon = markerIcons.topPick;
            }

            const marker = L.marker([mic.lat, mic.lon], { icon: icon, micId: mic.id });
            marker.bindPopup(createMapPopup(mic), { closeButton: false, autoPan: false });

            // Marker hover events
            marker.on('mouseover', () => {
                state.hoveredMicId = mic.id;
                updateMapMarkers();

                // Highlight corresponding card
                const correspondingCard = document.querySelector(`[data-mic-id="${mic.id}"]`);
                if (correspondingCard) {
                    correspondingCard.classList.add('border-[var(--brand-blue)]');
                }
            });

            marker.on('mouseout', () => {
                state.hoveredMicId = null;
                updateMapMarkers();

                // Remove highlight from card
                const correspondingCard = document.querySelector(`[data-mic-id="${mic.id}"]`);
                if (correspondingCard) {
                    correspondingCard.classList.remove('border-[var(--brand-blue)]');
                }
            });

            markers.push(marker);
            bounds.push([mic.lat, mic.lon]);
        }
    });

    // Add markers to cluster group
    if (markers.length > 0) {
        markerClusterGroup.addLayers(markers);

        // Fit bounds if map is primary view or on desktop
        if (state.view === 'map' || window.innerWidth >= 1024) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }
}
