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

// Create pin icon based on status
// 3-tier system: live (green pulse), upcoming (red), future (gray hollow)
function createPin(status) {
    if (status === 'live') {
        // LIVE: Green pulsing dot
        return L.divIcon({
            className: 'bg-transparent',
            html: `<div class="pin-container pin-live-container">
                    <div class="pin-live-dot"></div>
                   </div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
    } else if (status === 'upcoming' || status === 'urgent' || status === 'soon') {
        // UPCOMING: Red solid dot (< 2 hours away)
        return L.divIcon({
            className: 'bg-transparent',
            html: `<div class="pin-container pin-upcoming-container">
                    <div class="pin-upcoming-dot"></div>
                   </div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
    } else {
        // FUTURE: Gray hollow circle (tonight or tomorrow+)
        return L.divIcon({
            className: 'bg-transparent',
            html: `<div class="pin-container pin-future-container">
                    <div class="pin-future-dot"></div>
                   </div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });
    }
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
