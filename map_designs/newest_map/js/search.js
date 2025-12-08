/* =================================================================
   SEARCH SERVICE
   Local venue search + Mapbox geocoding via backend proxy

   KEY BEHAVIOR:
   - Auto-fires transit calculation on location select (no button)
   - 500ms debounce on typing
   - Keyboard navigation (ArrowUp/Down/Enter/Escape)
   ================================================================= */

const searchService = {
    debounceTimer: null,
    dropdown: null,
    input: null,
    selectedIndex: -1,

    init() {
        this.input = document.getElementById('search-input');
        if (!this.input) {
            console.warn('Search input not found');
            return;
        }
        this.createDropdown();
        this.bindEvents();
    },

    createDropdown() {
        this.dropdown = document.createElement('div');
        this.dropdown.id = 'search-dropdown';
        this.dropdown.className = 'search-dropdown';

        const wrapper = document.querySelector('.search-wrapper');
        if (wrapper) {
            wrapper.parentNode.insertBefore(this.dropdown, wrapper.nextSibling);
        }
    },

    bindEvents() {
        // Input handler with 500ms debounce
        this.input.addEventListener('input', (e) => {
            clearTimeout(this.debounceTimer);
            const query = e.target.value.trim();

            if (query.length < 2) {
                this.hideDropdown();
                return;
            }

            this.debounceTimer = setTimeout(() => this.search(query), 500);
        });

        // Keyboard navigation
        this.input.addEventListener('keydown', (e) => {
            const items = this.dropdown.querySelectorAll('.dropdown-item');
            if (!items.length) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
                this.highlightItem(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                this.highlightItem(items);
            } else if (e.key === 'Enter' && this.selectedIndex >= 0) {
                e.preventDefault();
                items[this.selectedIndex].click();
            } else if (e.key === 'Escape') {
                this.hideDropdown();
                this.input.blur();
            }
        });

        this.input.addEventListener('focus', () => {
            if (this.input.value.length >= 2) {
                this.showDropdown();
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-wrapper') && !e.target.closest('.search-dropdown')) {
                this.hideDropdown();
            }
        });
    },

    highlightItem(items) {
        items.forEach((item, i) => {
            item.classList.toggle('highlighted', i === this.selectedIndex);
        });
        if (this.selectedIndex >= 0) {
            items[this.selectedIndex].scrollIntoView({ block: 'nearest' });
        }
    },

    async search(query) {
        this.selectedIndex = -1;
        const results = { venues: [], locations: [] };

        // 1. Local venue search (FREE)
        const q = query.toLowerCase();
        results.venues = STATE.mics
            .filter(m => {
                const title = (m.title || m.venue || '').toLowerCase();
                const hood = (m.hood || m.neighborhood || '').toLowerCase();
                return title.includes(q) || hood.includes(q);
            })
            .slice(0, 3)
            .map(m => ({ ...m, type: 'venue' }));

        // 2. Nominatim geocoding via backend proxy
        if (query.length > 2) {
            try {
                const res = await fetch(`${CONFIG.apiBase}/api/proxy/geocode?query=${encodeURIComponent(query)}`);
                if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
                const data = await res.json();
                results.locations = (data.results || []).map(r => ({ ...r, type: 'location' }));
            } catch (e) {
                console.warn('Geocode failed:', e.message);
            }
        }

        this.renderDropdown(results);
    },

    renderDropdown(results) {
        let html = '';

        // "Use My Location" option (always show, triggers geolocation API)
        html += `
            <div class="dropdown-section">
                <div class="dropdown-item use-location" onclick="searchService.useMyLocation()">
                    <div class="item-icon location-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <circle cx="12" cy="12" r="3"/>
                            <line x1="12" y1="2" x2="12" y2="5"/>
                            <line x1="12" y1="19" x2="12" y2="22"/>
                            <line x1="2" y1="12" x2="5" y2="12"/>
                            <line x1="19" y1="12" x2="22" y2="12"/>
                        </svg>
                    </div>
                    <div class="item-text">
                        <span class="item-name">Use My Location</span>
                    </div>
                </div>
            </div>`;

        // Venues section
        if (results.venues.length > 0) {
            html += `<div class="dropdown-section"><div class="section-header">Venues</div>`;
            results.venues.forEach(v => {
                const title = v.title || v.venue || 'Unknown';
                const hood = v.hood || v.neighborhood || '';
                html += `
                    <div class="dropdown-item" onclick="searchService.selectVenue('${v.id || v._id}')">
                        <div class="item-icon venue-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                <line x1="12" y1="19" x2="12" y2="23"/>
                            </svg>
                        </div>
                        <div class="item-text">
                            <span class="item-name">${this.escapeHtml(title)}</span>
                            <span class="item-sub">${this.escapeHtml(hood)}</span>
                        </div>
                    </div>`;
            });
            html += '</div>';
        }

        // Locations section
        if (results.locations.length > 0) {
            html += `<div class="dropdown-section"><div class="section-header">Locations</div>`;
            results.locations.forEach(l => {
                html += `
                    <div class="dropdown-item" onclick="searchService.selectLocation(${l.lat}, ${l.lng}, '${this.escapeHtml(l.name).replace(/'/g, "\\'")}')">
                        <div class="item-icon pin-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                <circle cx="12" cy="10" r="3"/>
                            </svg>
                        </div>
                        <div class="item-text">
                            <span class="item-name">${this.escapeHtml(l.name)}</span>
                            <span class="item-sub">${this.escapeHtml(l.address || '')}</span>
                        </div>
                    </div>`;
            });
            html += '</div>';
        }

        if (results.venues.length === 0 && results.locations.length === 0) {
            html += '<div class="dropdown-empty">No results found</div>';
        }

        this.dropdown.innerHTML = html;
        this.showDropdown();
    },

    selectVenue(micId) {
        const mic = STATE.mics.find(m => (m.id || m._id) === micId);
        if (mic) {
            this.hideDropdown();
            this.input.value = mic.title || mic.venue;

            // Fly to venue on map
            if (typeof map !== 'undefined') {
                map.flyTo([mic.lat, mic.lng], 15, { duration: 1 });
            }

            // Open venue modal if available
            if (typeof openVenueModal === 'function') {
                openVenueModal(mic);
            }

            // Ghost Venue Fix: Pass mic so its neighborhood is always queried
            transitService.calculateFromOrigin(mic.lat, mic.lng, mic.title || mic.venue, mic);
        }
    },

    selectLocation(lat, lng, name) {
        this.hideDropdown();
        this.input.value = name;
        // Auto-fire transit calculation (no button needed)
        transitService.calculateFromOrigin(lat, lng, name, null);
    },

    // Handle "Use My Location" with geolocation API
    useMyLocation() {
        if (!navigator.geolocation) {
            if (typeof toastService !== 'undefined') {
                toastService.show('Geolocation not supported by your browser', 'error');
            }
            return;
        }

        this.input.value = 'Locating...';
        this.hideDropdown();

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                STATE.userLocation = { lat: latitude, lng: longitude };
                this.input.value = 'My Location';
                transitService.calculateFromOrigin(latitude, longitude, 'My Location', null);
            },
            (error) => {
                this.input.value = '';
                if (error.code === error.PERMISSION_DENIED) {
                    if (typeof toastService !== 'undefined') {
                        toastService.show('Location access denied. Tap map to set location.', 'warning');
                    }
                } else {
                    if (typeof toastService !== 'undefined') {
                        toastService.show('Could not get location. Tap map to set location.', 'error');
                    }
                }
                // FALLBACK: Enable map click mode
                if (typeof enableMapClickMode === 'function') {
                    enableMapClickMode();
                }
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    },

    showDropdown() {
        if (this.dropdown) {
            this.dropdown.classList.add('active');
        }
    },

    hideDropdown() {
        if (this.dropdown) {
            this.dropdown.classList.remove('active');
        }
        this.selectedIndex = -1;
    },

    clear() {
        if (this.input) {
            this.input.value = '';
        }
        this.hideDropdown();
        transitService.clearTransitMode();
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};
