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
        this.searchIcon = document.querySelector('.search-icon');
        if (!this.input) {
            console.warn('Search input not found');
            return;
        }
        this.createDropdown();
        this.bindEvents();
        this.setupBackButton();
    },

    setupBackButton() {
        if (!this.searchIcon) return;

        // Make search icon clickable
        this.searchIcon.style.cursor = 'pointer';
        this.searchIcon.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.dropdown?.classList.contains('active')) {
                this.hideDropdown();
                this.input.blur();
            }
        });
    },

    createDropdown() {
        this.dropdown = document.createElement('div');
        this.dropdown.id = 'search-dropdown';
        this.dropdown.className = 'search-dropdown';
        // Accessibility: listbox role for dropdown
        this.dropdown.setAttribute('role', 'listbox');
        this.dropdown.setAttribute('aria-label', 'Search results');

        const wrapper = document.querySelector('.search-wrapper');
        if (wrapper) {
            wrapper.parentNode.insertBefore(this.dropdown, wrapper.nextSibling);
        }

        // Link input to dropdown for screen readers
        this.input.setAttribute('aria-controls', 'search-dropdown');
        this.input.setAttribute('aria-autocomplete', 'list');
        this.input.setAttribute('aria-expanded', 'false');
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
            if (this.input.value.trim() === '') {
                this.renderEmptyState();
            } else if (this.input.value.length >= 2) {
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
            const isHighlighted = i === this.selectedIndex;
            item.classList.toggle('highlighted', isHighlighted);
            item.setAttribute('aria-selected', isHighlighted ? 'true' : 'false');
        });
        if (this.selectedIndex >= 0) {
            items[this.selectedIndex].scrollIntoView({ block: 'nearest' });
            // Update aria-activedescendant for screen readers
            this.input.setAttribute('aria-activedescendant', items[this.selectedIndex].id);
        } else {
            this.input.removeAttribute('aria-activedescendant');
        }
    },

    // SVG Icons
    icons: {
        nav: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>`,
        mic: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line></svg>`,
        pin: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
        subway: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="14" rx="2"></rect><path d="M4 11h16"></path><path d="M12 3v8"></path><circle cx="8" cy="19" r="2"></circle><circle cx="16" cy="19" r="2"></circle><path d="M8 17v-2"></path><path d="M16 17v-2"></path></svg>`
    },

    // Popular neighborhoods for empty state (with coordinates to avoid geocoding)
    popularHoods: [
        { name: 'East Village', sub: 'Manhattan', lat: 40.7265, lng: -73.9815 },
        { name: 'Williamsburg', sub: 'Brooklyn', lat: 40.7081, lng: -73.9571 },
        { name: 'Hell\'s Kitchen', sub: 'Manhattan', lat: 40.7638, lng: -73.9918 },
        { name: 'Bushwick', sub: 'Brooklyn', lat: 40.6944, lng: -73.9213 }
    ],

    renderEmptyState() {
        let html = `
            <div class="dropdown-item current-location" id="search-option-0" role="option" aria-selected="false" data-action="location">
                <div class="item-icon" aria-hidden="true">${this.icons.nav}</div>
                <div class="item-text">
                    <span class="item-name">Use Current Location</span>
                    <span class="item-sub">Show transit times from where you are</span>
                </div>
            </div>
            <div class="section-header" role="presentation">Popular Neighborhoods</div>`;

        this.popularHoods.forEach((hood, idx) => {
            html += `
                <div class="dropdown-item location-type" id="search-option-${idx + 1}" role="option" aria-selected="false" data-action="geo" data-lat="${hood.lat}" data-lng="${hood.lng}" data-name="${this.escapeHtml(hood.name)}">
                    <div class="item-icon" aria-hidden="true">${this.icons.pin}</div>
                    <div class="item-text">
                        <span class="item-name">${this.escapeHtml(hood.name)}</span>
                    </div>
                    <span class="item-subtext">${this.escapeHtml(hood.sub)}</span>
                </div>`;
        });

        this.dropdown.innerHTML = html;
        this.bindDropdownClicks();
        this.showDropdown();
    },

    async search(query) {
        this.selectedIndex = -1;
        const results = { venues: [], locations: [] };

        // 1. Local venue search (your mic data)
        const q = query.toLowerCase();
        results.venues = STATE.mics
            .filter(m => {
                const title = (m.title || m.venue || '').toLowerCase();
                const hood = (m.hood || m.neighborhood || '').toLowerCase();
                return title.includes(q) || hood.includes(q);
            })
            .slice(0, 3)
            .map(m => ({ ...m, type: 'venue' }));

        // 2. Local NYC geocoder (neighborhoods + subway stations) - ZERO API CALLS
        if (query.length >= 2 && typeof nycGeocoder !== 'undefined') {
            const localResults = nycGeocoder.search(query);
            results.locations = localResults.map(r => ({
                name: r.name,
                address: r.sub,
                lat: r.lat,
                lng: r.lng,
                type: 'location',
                locationType: r.type // 'neighborhood' or 'subway'
            }));
        }

        this.renderDropdown(results);
    },

    renderDropdown(results) {
        let html = '';
        let optionIndex = 0;

        // "Use My Location" option (always show) - with subtitle for clarity
        html += `
            <div class="dropdown-item current-location" id="search-option-${optionIndex++}" role="option" aria-selected="false" data-action="location">
                <div class="item-icon" aria-hidden="true">${this.icons.nav}</div>
                <div class="item-text">
                    <span class="item-name">Use Current Location</span>
                    <span class="item-sub">Show transit times from where you are</span>
                </div>
            </div>`;

        // Venues section
        if (results.venues.length > 0) {
            html += `<div class="section-header" role="presentation">Venues</div>`;
            results.venues.forEach(v => {
                const title = v.title || v.venue || 'Unknown';
                const hood = v.hood || v.neighborhood || '';
                html += `
                    <div class="dropdown-item venue-type" id="search-option-${optionIndex++}" role="option" aria-selected="false" data-action="venue" data-id="${v.id}">
                        <div class="item-icon" aria-hidden="true">${this.icons.mic}</div>
                        <div class="item-text">
                            <span class="item-name">${this.escapeHtml(title)}</span>
                        </div>
                        <span class="item-subtext">${this.escapeHtml(hood)}</span>
                    </div>`;
            });
        }

        // Locations section (neighborhoods + subway stations)
        if (results.locations.length > 0) {
            html += `<div class="section-header" role="presentation">Locations</div>`;
            results.locations.forEach(l => {
                const isSubway = l.locationType === 'subway';
                const icon = isSubway ? this.icons.subway : this.icons.pin;
                const subtext = l.address || '';
                const itemClass = isSubway ? 'location-type subway-type' : 'location-type';
                html += `
                    <div class="dropdown-item ${itemClass}" id="search-option-${optionIndex++}" role="option" aria-selected="false" data-action="geo" data-lat="${l.lat}" data-lng="${l.lng}" data-name="${this.escapeHtml(l.name)}">
                        <div class="item-icon" aria-hidden="true">${icon}</div>
                        <div class="item-text">
                            <span class="item-name">${this.escapeHtml(l.name)}</span>
                        </div>
                        <span class="item-subtext">${this.escapeHtml(subtext)}</span>
                    </div>`;
            });
        }

        if (results.venues.length === 0 && results.locations.length === 0) {
            html += '<div class="dropdown-empty" role="status">No results found</div>';
        }

        this.dropdown.innerHTML = html;
        this.bindDropdownClicks();
        this.showDropdown();
    },

    // Event delegation for dropdown clicks (more reliable than inline onclick)
    bindDropdownClicks() {
        this.dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const action = item.dataset.action;

                if (action === 'location') {
                    this.useMyLocation();
                } else if (action === 'venue') {
                    this.selectVenue(item.dataset.id);
                } else if (action === 'geo') {
                    const lat = parseFloat(item.dataset.lat);
                    const lng = parseFloat(item.dataset.lng);
                    const name = item.dataset.name;
                    this.selectLocation(lat, lng, name);
                }
            });
        });
    },

    selectVenue(micId) {
        const mic = STATE.mics.find(m => m.id === micId || String(m.id) === String(micId));
        if (mic) {
            this.hideDropdown();
            this.input.value = mic.title || mic.venue;
            this.input.blur();

            // Collapse drawer so user can see the map
            if (typeof toggleDrawer === 'function' && STATE.isDrawerOpen) {
                toggleDrawer(false);
            }

            // Fly to venue on map
            if (typeof map !== 'undefined') {
                map.flyTo([mic.lat, mic.lng], 14, { duration: 1 });
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
        this.input.blur();

        // Collapse drawer so user can see the map
        if (typeof toggleDrawer === 'function' && STATE.isDrawerOpen) {
            toggleDrawer(false);
        }

        // Fly to location
        if (typeof map !== 'undefined') {
            map.flyTo([lat, lng], 14, { duration: 1 });
        }
    },

    // Handle "Use My Location" with geolocation API
    useMyLocation() {
        const geoBtn = document.getElementById('geoBtn');

        if (!navigator.geolocation) {
            if (typeof toastService !== 'undefined') {
                toastService.show('Geolocation not supported by your browser', 'error');
            }
            return;
        }

        // Visual feedback - pulse animation
        if (geoBtn) geoBtn.classList.add('finding');
        this.input.value = '';
        this.input.placeholder = 'Locating you...';
        this.hideDropdown();

        // Reset pin button if it was active
        document.getElementById('pinBtn')?.classList.remove('active');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                STATE.userLocation = { lat: latitude, lng: longitude };

                // Success - stop animation, show result
                if (geoBtn) geoBtn.classList.remove('finding');
                this.input.value = 'Current Location';
                this.input.placeholder = 'Search address...';

                // Collapse drawer so user can see the map
                if (typeof toggleDrawer === 'function' && STATE.isDrawerOpen) {
                    toggleDrawer(false);
                }

                // Zoom to location
                if (typeof map !== 'undefined') {
                    map.flyTo([latitude, longitude], 14, { duration: 1 });
                }

                transitService.calculateFromOrigin(latitude, longitude, 'My Location', null, { skipOriginMarker: true });
            },
            (error) => {
                // Error - stop animation
                if (geoBtn) geoBtn.classList.remove('finding');
                this.input.value = '';
                this.input.placeholder = 'Search address...';

                if (error.code === error.PERMISSION_DENIED) {
                    if (typeof toastService !== 'undefined') {
                        toastService.show('Location access denied. Tap map to set location.', 'warning');
                    }
                } else {
                    if (typeof toastService !== 'undefined') {
                        toastService.show('Could not get location. Tap map to set location.', 'error');
                    }
                }
                // FALLBACK: Enable pin drop mode
                if (typeof togglePinDropMode === 'function') {
                    togglePinDropMode();
                }
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    },

    showDropdown() {
        if (this.dropdown) {
            this.dropdown.classList.add('active');
            this.input.setAttribute('aria-expanded', 'true');
            // Swap to back arrow (filled style)
            if (this.searchIcon) {
                this.searchIcon.innerHTML = `<path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>`;
                this.searchIcon.classList.add('is-back');
            }
        }
    },

    hideDropdown() {
        if (this.dropdown) {
            this.dropdown.classList.remove('active');
            this.input.setAttribute('aria-expanded', 'false');
            this.input.removeAttribute('aria-activedescendant');
            // Swap back to magnifying glass (filled style)
            if (this.searchIcon) {
                this.searchIcon.innerHTML = `<path d="M10.5 4C6.9 4 4 6.9 4 10.5C4 14.1 6.9 17 10.5 17C12 17 13.4 16.5 14.5 15.6L18.4 19.5C18.8 19.9 19.4 19.9 19.8 19.5C20.2 19.1 20.2 18.5 19.8 18.1L15.9 14.2C16.6 13.1 17 11.9 17 10.5C17 6.9 14.1 4 10.5 4ZM6 10.5C6 8 8 6 10.5 6C13 6 15 8 15 10.5C15 13 13 15 10.5 15C8 15 6 13 6 10.5Z"/>`;
                this.searchIcon.classList.remove('is-back');
            }
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
