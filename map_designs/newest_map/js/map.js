/* =================================================================
   MAP
   Leaflet map initialization, pins, geolocation
   ================================================================= */

// Initialize map
const map = L.map('map', { zoomControl: false, attributionControl: false })
    .setView(CONFIG.mapCenter, CONFIG.mapZoom);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    subdomains: 'abcd'
}).addTo(map);

const markersGroup = L.layerGroup().addTo(map);

// Create pill-style marker with time
// Shows time like "6:00p" with optional "+X" for multiple mics
function createPin(status, timeStr, extraCount) {
    const displayTime = timeStr || '?';

    // Add count if multiple mics at this venue
    const countBadge = extraCount > 0 ? `<span class="pill-count">+${extraCount}</span>` : '';

    // Status determines color
    let pillClass = 'pill-future'; // gray
    if (status === 'live') {
        pillClass = 'pill-live'; // green
    } else if (status === 'upcoming' || status === 'urgent' || status === 'soon') {
        pillClass = 'pill-upcoming'; // red
    }

    // Calculate width based on content
    const baseWidth = displayTime.length * 8 + 20;
    const countWidth = extraCount > 0 ? 24 : 0;
    const totalWidth = Math.max(baseWidth + countWidth, 54);

    return L.divIcon({
        className: 'bg-transparent',
        html: `<div class="time-pill ${pillClass}">
                <span class="pill-time">${displayTime}</span>${countBadge}
               </div>`,
        iconSize: [totalWidth, 26],
        iconAnchor: [totalWidth / 2, 13]
    });
}

// Get user location
function getUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                STATE.userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
            },
            () => {
                // Geolocation error - silently ignore, user can manually enable later
            }
        );
    }
}

// Center map on user's location AND trigger transit mode
function centerOnUser() {
    const btn = document.getElementById('locate-btn');

    if (STATE.userLocation) {
        // We have location - fly to it
        STATE.isProgrammaticMove = true;
        map.flyTo([STATE.userLocation.lat, STATE.userLocation.lng], 14, { duration: 1 });
        btn.classList.add('active');

        // Add/update user marker
        if (STATE.userMarker) {
            STATE.userMarker.setLatLng([STATE.userLocation.lat, STATE.userLocation.lng]);
        } else {
            STATE.userMarker = L.circleMarker([STATE.userLocation.lat, STATE.userLocation.lng], {
                radius: 8,
                fillColor: '#3b82f6',
                fillOpacity: 1,
                color: 'white',
                weight: 3
            }).addTo(map);
        }

        // Trigger transit calculations from user location
        if (typeof transitService !== 'undefined' && transitService.calculateFromOrigin) {
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = 'My Location';
            transitService.calculateFromOrigin(STATE.userLocation.lat, STATE.userLocation.lng, 'My Location', null);
        }

        // Remove active state after animation
        setTimeout(() => btn.classList.remove('active'), 1500);
    } else {
        // Request location
        if (navigator.geolocation) {
            btn.style.opacity = '0.5';
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    STATE.userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    btn.style.opacity = '1';
                    centerOnUser(); // Recurse now that we have location
                },
                () => {
                    btn.style.opacity = '1';
                    if (typeof toastService !== 'undefined') {
                        toastService.show('Unable to get location. Enable location services.', 'error');
                    } else {
                        alert('Unable to get your location. Please enable location services.');
                    }
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            if (typeof toastService !== 'undefined') {
                toastService.show('Geolocation not supported by your browser', 'error');
            } else {
                alert('Geolocation is not supported by your browser.');
            }
        }
    }
}

// Fly to a specific mic location
function locateMic(lat, lng, id) {
    STATE.isProgrammaticMove = true;
    map.flyTo([lat, lng], 15, { duration: 1.2, easeLinearity: 0.25 });

    // Minimize drawer on mobile so user can see the map
    if (window.matchMedia('(max-width: 767px)').matches && STATE.isDrawerOpen) {
        toggleDrawer(false);
    }

    // Open the venue modal after fly animation completes
    setTimeout(() => {
        const mic = STATE.mics.find(m => m.id === id);
        if (mic) {
            openVenueModal(mic);
        }
    }, 1300);
}

// Map event: track programmatic moves
map.on('moveend', () => {
    if (STATE.isProgrammaticMove) {
        STATE.isProgrammaticMove = false;
    }
});
