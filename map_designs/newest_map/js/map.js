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
function createPin(status) {
    if (status === 'live' || status === 'urgent') {
        // LIVE: Text badge with pulsing dot
        return L.divIcon({
            className: 'bg-transparent',
            html: `<div class="pin-live-container">
                    <div class="pin-live-badge">
                        <div class="relative flex items-center justify-center w-3 h-3">
                            <div class="pulse-ring"></div>
                            <div class="relative w-2 h-2 bg-white rounded-full"></div>
                        </div>
                        <span class="text-[11px] font-bold text-white tracking-widest leading-none font-mono">LIVE NOW</span>
                    </div>
                   </div>`,
            iconSize: [100, 45],
            iconAnchor: [50, 40]
        });
    } else if (status === 'soon') {
        // SOON: White dot with orange border
        return L.divIcon({
            className: 'bg-transparent',
            html: `<div class="pin-soon-container">
                    <div class="pin-soon-dot"></div>
                   </div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
    } else {
        // LATER/FUTURE: Small gray dot
        return L.divIcon({
            className: 'bg-transparent',
            html: `<div class="pin-later-container">
                    <div class="pin-later-dot"></div>
                   </div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
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
                console.log('User location:', STATE.userLocation);
            },
            (error) => {
                console.log('Geolocation error:', error);
            }
        );
    }
}

// Center map on user's location
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
                (error) => {
                    btn.style.opacity = '1';
                    console.log('Location denied:', error);
                    alert('Unable to get your location. Please enable location services.');
                },
                { enableHighAccuracy: true, timeout: 10000 }
            );
        } else {
            alert('Geolocation is not supported by your browser.');
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

    // Open the marker's tooltip after fly animation completes
    setTimeout(() => {
        const marker = STATE.markerLookup[id];
        if (marker) {
            marker.openTooltip();
        }
    }, 1300);
}

// Map event: track programmatic moves
map.on('moveend', () => {
    if (STATE.isProgrammaticMove) {
        STATE.isProgrammaticMove = false;
    }
});
