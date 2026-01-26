/* =================================================================
   SEARCH SERVICE
   Local venue search + NYC geocoding (neighborhoods + subway stations)

   KEY BEHAVIOR:
   - Auto-fires transit calculation on location select (no button)
   - 150ms debounce on typing (Google Maps standard)
   - Keyboard navigation (ArrowUp/Down/Enter/Escape)
   - Recent searches stored in localStorage
   - Text highlighting on matching characters
   - Venue deduplication (same venue won't show multiple times)
   ================================================================= */

const searchService = {
    debounceTimer: null,
    dropdown: null,
    input: null,
    clearBtn: null,
    wrapper: null,
    selectedIndex: -1,
    recentSearches: [],
    MAX_RECENT_SEARCHES: 5,

    init() {
        this.input = document.getElementById('search-input');
        this.clearBtn = document.getElementById('search-clear-btn');
        this.wrapper = document.querySelector('.search-wrapper');
        this.searchIcon = document.querySelector('.search-icon');
        if (!this.input) {
            console.warn('Search input not found');
            return;
        }
        this.loadRecentSearches();
        this.createDropdown();
        this.bindEvents();
        this.setupClearButton();
    },

    // Recent searches - stored in localStorage
    loadRecentSearches() {
        try {
            const stored = localStorage.getItem('micfinder_recent_searches');
            this.recentSearches = stored ? JSON.parse(stored) : [];
        } catch (e) {
            this.recentSearches = [];
        }
    },

    saveRecentSearch(item) {
        // item = { type: 'venue'|'location', name: string, lat?: number, lng?: number, id?: string }
        if (!item || !item.name) return;

        // Remove duplicate if exists
        this.recentSearches = this.recentSearches.filter(r =>
            !(r.name === item.name && r.type === item.type)
        );

        // Add to front
        this.recentSearches.unshift(item);

        // Keep only MAX_RECENT_SEARCHES
        this.recentSearches = this.recentSearches.slice(0, this.MAX_RECENT_SEARCHES);

        // Save to localStorage
        try {
            localStorage.setItem('micfinder_recent_searches', JSON.stringify(this.recentSearches));
        } catch (e) {
            // localStorage full or unavailable
        }
    },

    clearRecentSearches() {
        this.recentSearches = [];
        try {
            localStorage.removeItem('micfinder_recent_searches');
        } catch (e) {}
    },

    setupClearButton() {
        if (!this.clearBtn) return;

        this.clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.clearSearch();
            this.input.focus(); // Keep focus after clearing
        });
    },

    clearSearch() {
        this.input.value = '';
        this.input.placeholder = 'Search venues or places';
        this.updateClearButtonVisibility();
        this.hideDropdown();
        // Clear transit mode if active
        if (typeof transitService !== 'undefined') {
            transitService.clearTransitMode();
        }
    },

    updateClearButtonVisibility() {
        if (!this.wrapper) return;
        const hasValue = this.input.value.trim().length > 0;
        this.wrapper.classList.toggle('has-value', hasValue);
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
        // Input handler with 150ms debounce (Google Maps uses ~150ms)
        this.input.addEventListener('input', (e) => {
            clearTimeout(this.debounceTimer);
            const query = e.target.value.trim();

            // Update clear button visibility on every input
            this.updateClearButtonVisibility();

            if (query.length < 2) {
                this.hideDropdown();
                return;
            }

            this.debounceTimer = setTimeout(() => this.search(query), 150);
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
            const val = this.input.value.trim();
            if (val === '' || val === 'My Location' || val === 'Current Location' || val === 'Dropped Pin') {
                // Show empty state for blank or location-based values
                this.renderEmptyState();
            } else if (val.length >= 2) {
                // Re-run search to populate dropdown with results
                this.search(val);
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
        let html = '';
        let optionIndex = 0;

        // "Use Current Location" option
        html += `
            <div class="dropdown-item current-location" id="search-option-${optionIndex++}" role="option" aria-selected="false" data-action="location">
                <div class="item-icon" aria-hidden="true">${this.icons.nav}</div>
                <div class="item-text">
                    <span class="item-name">Use Current Location</span>
                    <span class="item-sub">Show transit times from where you are</span>
                </div>
            </div>`;

        // Recent searches section (if any)
        if (this.recentSearches.length > 0) {
            html += `<div class="section-header" role="presentation">Recent</div>`;
            this.recentSearches.forEach((recent) => {
                const icon = recent.type === 'venue' ? this.icons.mic : this.icons.pin;
                const iconClass = recent.type === 'venue' ? 'venue-type' : 'location-type';
                if (recent.type === 'venue' && recent.id) {
                    html += `
                        <div class="dropdown-item ${iconClass}" id="search-option-${optionIndex++}" role="option" aria-selected="false" data-action="venue" data-id="${recent.id}">
                            <div class="item-icon" aria-hidden="true">${icon}</div>
                            <div class="item-text">
                                <span class="item-name">${this.escapeHtml(recent.name)}</span>
                            </div>
                            ${recent.sub ? `<span class="item-subtext">${this.escapeHtml(recent.sub)}</span>` : ''}
                        </div>`;
                } else if (recent.lat && recent.lng) {
                    html += `
                        <div class="dropdown-item ${iconClass}" id="search-option-${optionIndex++}" role="option" aria-selected="false" data-action="geo" data-lat="${recent.lat}" data-lng="${recent.lng}" data-name="${this.escapeHtml(recent.name)}">
                            <div class="item-icon" aria-hidden="true">${icon}</div>
                            <div class="item-text">
                                <span class="item-name">${this.escapeHtml(recent.name)}</span>
                            </div>
                            ${recent.sub ? `<span class="item-subtext">${this.escapeHtml(recent.sub)}</span>` : ''}
                        </div>`;
                }
            });
        }

        // Popular neighborhoods section
        html += `<div class="section-header" role="presentation">Popular Neighborhoods</div>`;
        this.popularHoods.forEach((hood) => {
            html += `
                <div class="dropdown-item location-type" id="search-option-${optionIndex++}" role="option" aria-selected="false" data-action="geo" data-lat="${hood.lat}" data-lng="${hood.lng}" data-name="${this.escapeHtml(hood.name)}">
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

    // Show loading state briefly
    showLoading() {
        this.dropdown.innerHTML = '<div class="search-loading"><div class="loading-spinner"></div></div>';
        this.showDropdown();
    },

    // Highlight matching text in search results (bold the matched portion)
    highlightMatch(text, query) {
        if (!query || !text) return this.escapeHtml(text);
        const escaped = this.escapeHtml(text);
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return escaped.replace(regex, '<mark>$1</mark>');
    },

    async search(query) {
        this.selectedIndex = -1;
        this.currentQuery = query; // Store for highlighting
        const results = { venues: [], locations: [] };

        // 1. Local venue search (your mic data) - deduplicate by venue name
        const q = query.toLowerCase();
        const seenVenues = new Set();
        results.venues = STATE.mics
            .filter(m => {
                const title = (m.title || m.venue || '').toLowerCase();
                const hood = (m.hood || m.neighborhood || '').toLowerCase();
                if (!title.includes(q) && !hood.includes(q)) return false;

                // Deduplicate by venue name (same venue may have multiple mics on different days)
                const venueName = (m.title || m.venue || '').toLowerCase().trim();
                if (seenVenues.has(venueName)) return false;
                seenVenues.add(venueName);
                return true;
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

        this.renderDropdown(results, query);
    },

    renderDropdown(results, query = '') {
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
                // Highlight matching text
                const highlightedTitle = this.highlightMatch(title, query);
                const highlightedHood = this.highlightMatch(hood, query);
                html += `
                    <div class="dropdown-item venue-type" id="search-option-${optionIndex++}" role="option" aria-selected="false" data-action="venue" data-id="${v.id}">
                        <div class="item-icon" aria-hidden="true">${this.icons.mic}</div>
                        <div class="item-text">
                            <span class="item-name">${highlightedTitle}</span>
                        </div>
                        <span class="item-subtext">${highlightedHood}</span>
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
                // Highlight matching text
                const highlightedName = this.highlightMatch(l.name, query);
                const highlightedSubtext = this.highlightMatch(subtext, query);
                html += `
                    <div class="dropdown-item ${itemClass}" id="search-option-${optionIndex++}" role="option" aria-selected="false" data-action="geo" data-lat="${l.lat}" data-lng="${l.lng}" data-name="${this.escapeHtml(l.name)}">
                        <div class="item-icon" aria-hidden="true">${icon}</div>
                        <div class="item-text">
                            <span class="item-name">${highlightedName}</span>
                        </div>
                        <span class="item-subtext">${highlightedSubtext}</span>
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

    // Haptic feedback for selections (iOS/Android)
    triggerHaptic() {
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
    },

    // Event delegation for dropdown clicks (more reliable than inline onclick)
    bindDropdownClicks() {
        this.dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const action = item.dataset.action;

                // Haptic feedback on selection
                this.triggerHaptic();

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
            this.updateClearButtonVisibility();
            this.input.blur();

            // Save to recent searches
            this.saveRecentSearch({
                type: 'venue',
                name: mic.title || mic.venue,
                id: mic.id,
                sub: mic.hood || mic.neighborhood || ''
            });

            // Collapse drawer so user can see the map (mobile only)
            const isMobile = window.matchMedia('(max-width: 767px)').matches;
            if (isMobile && typeof toggleDrawer === 'function' && STATE.isDrawerOpen) {
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
            if (typeof transitService !== 'undefined') {
                transitService.calculateFromOrigin(mic.lat, mic.lng, mic.title || mic.venue, mic);
            }
        }
    },

    selectLocation(lat, lng, name) {
        this.hideDropdown();
        // Don't put location in search input - it confuses search vs location state
        this.input.value = '';
        this.input.placeholder = `From: ${name}`;
        this.updateClearButtonVisibility();
        this.input.blur();

        // Save to recent searches
        this.saveRecentSearch({
            type: 'location',
            name: name,
            lat: lat,
            lng: lng
        });

        // Collapse drawer so user can see the map (mobile only)
        const isMobile = window.matchMedia('(max-width: 767px)').matches;
        if (isMobile && typeof toggleDrawer === 'function' && STATE.isDrawerOpen) {
            toggleDrawer(false);
        }

        // Fly to location
        if (typeof map !== 'undefined') {
            map.flyTo([lat, lng], 14, { duration: 1 });
        }

        // Trigger transit calculation from this location
        if (typeof transitService !== 'undefined') {
            transitService.calculateFromOrigin(lat, lng, name);
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

                // Success - stop animation, show location in placeholder (not input value)
                if (geoBtn) geoBtn.classList.remove('finding');
                this.input.value = '';
                this.input.placeholder = 'From: Current Location';
                this.updateClearButtonVisibility();

                // Clear any existing search/origin marker to prevent duplicates
                if (STATE.searchMarker && typeof map !== 'undefined') {
                    map.removeLayer(STATE.searchMarker);
                    STATE.searchMarker = null;
                }

                // Add/update user location marker (navigation arrow style)
                if (typeof map !== 'undefined' && typeof L !== 'undefined') {
                    const navIcon = L.divIcon({
                        className: 'user-location-marker',
                        html: `<div class="nav-arrow-icon">
                                 <svg viewBox="0 0 24 24" fill="white" width="16" height="16">
                                   <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
                                 </svg>
                               </div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    });

                    if (STATE.userMarker) {
                        STATE.userMarker.setLatLng([latitude, longitude]);
                    } else {
                        STATE.userMarker = L.marker([latitude, longitude], { icon: navIcon }).addTo(map);
                    }
                }

                // Collapse drawer so user can see the map (mobile only)
                const isMobile = window.matchMedia('(max-width: 767px)').matches;
                if (isMobile && typeof toggleDrawer === 'function' && STATE.isDrawerOpen) {
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
                this.input.placeholder = 'Search venues or places';
                this.updateClearButtonVisibility();

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
            // Keep search icon static - no confusing icon swap
        }
    },

    hideDropdown() {
        if (this.dropdown) {
            this.dropdown.classList.remove('active');
            this.input.setAttribute('aria-expanded', 'false');
            this.input.removeAttribute('aria-activedescendant');
            // Keep search icon static - no confusing icon swap
        }
        this.selectedIndex = -1;
    },

    clear() {
        if (this.input) {
            this.input.value = '';
            this.input.placeholder = 'Search venues or places';
            this.updateClearButtonVisibility();
        }
        this.hideDropdown();
        if (typeof transitService !== 'undefined') {
            transitService.clearTransitMode();
        }
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};
