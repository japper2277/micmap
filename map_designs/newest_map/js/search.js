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
        this.voiceBtn = document.getElementById('voice-search-btn');
        this.wrapper = document.querySelector('.search-wrapper');
        this.searchIcon = document.querySelector('.search-icon');
        this.originChip = document.getElementById('origin-chip');
        this.originChipName = document.getElementById('origin-chip-name');
        this.originChipClear = document.getElementById('origin-chip-clear');
        if (!this.input) {
            console.warn('Search input not found');
            return;
        }
        this.loadRecentSearches();
        this.createDropdown();
        this.bindEvents();
        this.setupClearButton();
        this.setupOriginChip();
        this.setupVoiceSearch();
    },

    // Voice search using Web Speech API
    setupVoiceSearch() {
        if (!this.voiceBtn) return;

        // Check for browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.voiceBtn.style.display = 'none';
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        this.isListening = false;

        this.recognition.onstart = () => {
            this.isListening = true;
            this.voiceBtn.classList.add('listening');
            this.input.placeholder = 'Listening...';
        };

        this.recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            this.input.value = transcript;
            this.updateClearButtonVisibility();

            // If final result, trigger search
            if (event.results[0].isFinal) {
                this.search(transcript);
            }
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this.voiceBtn.classList.remove('listening');
            this.input.placeholder = 'Search venues';
        };

        this.recognition.onerror = (event) => {
            this.isListening = false;
            this.voiceBtn.classList.remove('listening');
            this.input.placeholder = 'Search venues';
            if (event.error === 'not-allowed') {
                if (typeof toastService !== 'undefined') {
                    toastService.show('Microphone access denied', 'error');
                }
            }
        };

        this.voiceBtn.addEventListener('click', () => {
            if (this.isListening) {
                this.recognition.stop();
            } else {
                this.recognition.start();
            }
        });
    },

    // Origin chip - shows current transit origin
    setupOriginChip() {
        if (!this.originChipClear) return;
        this.originChipClear.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideOriginChip();
            if (typeof transitService !== 'undefined') {
                transitService.clearTransitMode();
            }
        });
    },

    showOriginChip(name) {
        if (!this.originChip || !this.originChipName) return;
        this.originChipName.textContent = name;
        this.originChip.classList.add('active');
    },

    hideOriginChip() {
        if (!this.originChip) return;
        this.originChip.classList.remove('active');
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

        // Add timestamp
        item.timestamp = Date.now();

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

    // Format relative time (e.g., "2h ago", "Yesterday", "3d ago")
    formatRelativeTime(timestamp) {
        if (!timestamp) return '';
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days}d ago`;
        return '';
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
        this.updateClearButtonVisibility();
        this.hideDropdown();
        this.hideOriginChip();
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
        // Keyboard shortcut: "/" or Cmd+K to focus search
        document.addEventListener('keydown', (e) => {
            // "/" key (not in input) or Cmd/Ctrl+K
            if ((e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) ||
                ((e.metaKey || e.ctrlKey) && e.key === 'k')) {
                e.preventDefault();
                this.input.focus();
                this.input.select();
            }
        });

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
                if (this.input.value.trim() === '') {
                    this.hideDropdown();
                    this.input.blur();
                } else {
                    // Clear input first, then blur on second Escape
                    this.input.value = '';
                    this.updateClearButtonVisibility();
                    this.hideDropdown();
                }
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
        subway: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="14" rx="2"></rect><path d="M4 11h16"></path><circle cx="8" cy="19" r="2"></circle><circle cx="16" cy="19" r="2"></circle></svg>`,
        walk: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"></circle><path d="M15 22l-3-8-2 3-3 1"></path><path d="M9 14l1-4 4-1 2 4"></path></svg>`
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

        // Recent venues only (search is now venue-only, location set via GPS/pin drop)
        const recentVenues = this.recentSearches.filter(r => r.type === 'venue');
        if (recentVenues.length > 0) {
            html += `<div class="section-header with-action" role="presentation">Recent <button class="section-clear" data-action="clear-recents">Clear</button></div>`;
            recentVenues.forEach((recent) => {
                if (recent.id) {
                    const timeAgo = this.formatRelativeTime(recent.timestamp);
                    html += `
                        <div class="dropdown-item venue-type" id="search-option-${optionIndex++}" role="option" aria-selected="false" data-action="venue" data-id="${recent.id}">
                            <div class="item-icon" aria-hidden="true">${this.icons.mic}</div>
                            <div class="item-text">
                                <span class="item-name">${this.escapeHtml(recent.name)}</span>
                                ${timeAgo ? `<span class="item-time-ago">${timeAgo}</span>` : ''}
                            </div>
                            ${recent.sub ? `<span class="item-subtext">${this.escapeHtml(recent.sub)}</span>` : ''}
                        </div>`;
                }
            });
        } else {
            // No recent venues - show mics near user's location with commute times
            if (STATE.userLocation && STATE.mics.length > 0) {
                const { lat: userLat, lng: userLng } = STATE.userLocation;

                // Get mics with real transit times (from mic.transitMins)
                const nearbyMics = STATE.mics
                    .filter(m => !m.warning)
                    .filter(m => m.transitMins !== undefined) // Only mics with calculated transit
                    .map(m => ({
                        ...m,
                        commuteMin: m.transitMins,
                        isWalk: m.transitType === 'walk',
                        isTransit: m.transitType === 'transit'
                    }))
                    .filter((m, i, arr) => arr.findIndex(v => (v.title || v.venue) === (m.title || m.venue)) === i)
                    .sort((a, b) => a.commuteMin - b.commuteMin)
                    .slice(0, 5);

                if (nearbyMics.length > 0) {
                    html += `<div class="section-header" role="presentation">Near You</div>`;
                    nearbyMics.forEach((m) => {
                        const timeIcon = m.isWalk ? this.icons.walk : this.icons.subway;
                        const timeLabel = `${m.commuteMin} min`;
                        html += `
                            <div class="dropdown-item venue-type" id="search-option-${optionIndex++}" role="option" aria-selected="false" data-action="venue" data-id="${m.id}">
                                <div class="item-icon" aria-hidden="true">${this.icons.mic}</div>
                                <div class="item-text">
                                    <span class="item-name">${this.escapeHtml(m.title || m.venue)}</span>
                                </div>
                                <span class="item-subtext commute-time"><span class="time-icon">${timeIcon}</span>${timeLabel}</span>
                            </div>`;
                    });
                } else {
                    html += `<div class="dropdown-empty"><span>Type to search venues</span></div>`;
                }
            } else {
                html += `<div class="dropdown-empty"><span>Type to search venues</span></div>`;
            }
        }

        this.dropdown.innerHTML = html;
        this.bindDropdownClicks();
        this.showDropdown();
    },

    // Show shimmer loading state
    showLoading() {
        this.dropdown.innerHTML = `
            <div class="search-shimmer">
                <div class="shimmer-item"><div class="shimmer-icon"></div><div class="shimmer-text"><div class="shimmer-line medium"></div><div class="shimmer-line short"></div></div></div>
                <div class="shimmer-item"><div class="shimmer-icon"></div><div class="shimmer-text"><div class="shimmer-line medium"></div><div class="shimmer-line short"></div></div></div>
            </div>`;
        this.showDropdown();
    },

    // Highlight matching text in search results (supports fuzzy matching)
    highlightMatch(text, query) {
        if (!query || !text) return this.escapeHtml(text);

        const escaped = this.escapeHtml(text);
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();

        // Try exact substring match first
        if (lowerText.includes(lowerQuery)) {
            const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
            return escaped.replace(regex, '<mark>$1</mark>');
        }

        // Fuzzy highlight: mark each matched character
        let result = '';
        let qi = 0;
        for (let i = 0; i < text.length; i++) {
            const char = this.escapeHtml(text[i]);
            if (qi < lowerQuery.length && lowerText[i] === lowerQuery[qi]) {
                result += `<mark>${char}</mark>`;
                qi++;
            } else {
                result += char;
            }
        }
        return result;
    },

    // Fuzzy match score - higher is better match
    fuzzyMatch(text, query) {
        if (!text || !query) return 0;
        text = text.toLowerCase();
        query = query.toLowerCase();

        // Exact match
        if (text.includes(query)) return 100;

        // Fuzzy: check if all chars appear in order
        let ti = 0, qi = 0, score = 0;
        while (ti < text.length && qi < query.length) {
            if (text[ti] === query[qi]) {
                score += 10;
                // Bonus for consecutive matches
                if (ti > 0 && text[ti-1] === query[qi-1]) score += 5;
                qi++;
            }
            ti++;
        }
        // All query chars found?
        return qi === query.length ? score : 0;
    },

    async search(query) {
        this.showLoading(); // Show shimmer while searching
        this.selectedIndex = -1;
        this.currentQuery = query; // Store for highlighting
        const results = { venues: [], suggestions: [] };

        // Venue search with fuzzy matching
        const q = query.toLowerCase();
        const now = new Date();
        // Filter to the currently viewed day
        let activeDayName;
        if (STATE.currentMode === 'tomorrow') {
            activeDayName = CONFIG.dayNames[(now.getDay() + 1) % 7];
        } else if (STATE.currentMode === 'calendar' && STATE.selectedCalendarDate) {
            activeDayName = CONFIG.dayNames[new Date(STATE.selectedCalendarDate).getDay()];
        } else {
            activeDayName = CONFIG.dayNames[now.getDay()];
        }
        const seenVenues = new Set();
        const scored = STATE.mics
            .filter(m => !m.warning)
            .filter(m => m.day === activeDayName)
            .map(m => {
                const title = (m.title || m.venue || '').toLowerCase();
                const hood = (m.hood || m.neighborhood || '').toLowerCase();
                const titleScore = this.fuzzyMatch(title, q);
                const hoodScore = this.fuzzyMatch(hood, q) * 0.5; // Hood match worth less
                return { ...m, score: Math.max(titleScore, hoodScore) };
            })
            .sort((a, b) => b.score - a.score)
            .filter(m => {
                if (m.score === 0) return false;
                // Deduplicate by venue name (today's entry wins due to sort)
                const venueName = (m.title || m.venue || '').toLowerCase().trim();
                if (seenVenues.has(venueName)) return false;
                seenVenues.add(venueName);
                return true;
            });

        results.venues = scored.slice(0, 6).map(m => ({ ...m, type: 'venue' }));

        // If no results, find suggestions (close matches for "Did you mean?")
        if (results.venues.length === 0) {
            const allVenues = [...new Set(STATE.mics.filter(m => !m.warning && m.day === activeDayName).map(m => m.title || m.venue))];
            results.suggestions = allVenues
                .map(name => ({ name, score: this.fuzzyMatch(name, q) }))
                .filter(v => v.score > 20) // Weak matches
                .sort((a, b) => b.score - a.score)
                .slice(0, 2)
                .map(v => v.name);
        }

        this.renderDropdown(results, query);
    },

    renderDropdown(results, query = '') {
        let html = '';
        let optionIndex = 0;

        // Venues only (location set via GPS button or pin drop)
        if (results.venues.length > 0) {
            results.venues.forEach(v => {
                const title = v.title || v.venue || 'Unknown';
                const hood = v.hood || v.neighborhood || '';
                // Highlight matching text
                const highlightedTitle = this.highlightMatch(title, query);
                const highlightedHood = this.highlightMatch(hood, query);

                // Show real transit time if available (from mic.transitMins)
                let rightContent = hood ? `<span class="item-subtext">${highlightedHood}</span>` : '';

                if (v.transitMins !== undefined) {
                    const isWalk = v.transitType === 'walk';
                    const timeIcon = isWalk ? this.icons.walk : this.icons.subway;
                    rightContent = `<span class="item-subtext commute-time"><span class="time-icon">${timeIcon}</span>${v.transitMins} min</span>`;
                }

                html += `
                    <div class="dropdown-item venue-type" id="search-option-${optionIndex++}" role="option" aria-selected="false" data-action="venue" data-id="${v.id}">
                        <div class="item-icon" aria-hidden="true">${this.icons.mic}</div>
                        <div class="item-text">
                            <span class="item-name">${highlightedTitle}</span>
                        </div>
                        ${rightContent}
                    </div>`;
            });

            // Screen reader announcement
            this.announceResults(`${results.venues.length} venue${results.venues.length === 1 ? '' : 's'} found`);
        } else {
            // No results - show suggestions if available
            if (results.suggestions && results.suggestions.length > 0) {
                html += `<div class="dropdown-empty" role="status">
                    <span>No venues found</span>
                    <div class="did-you-mean">Did you mean: ${results.suggestions.map(s =>
                        `<button class="suggestion-link" data-suggestion="${this.escapeHtml(s)}">${this.escapeHtml(s)}</button>`
                    ).join(' or ')}</div>
                </div>`;
            } else {
                html += '<div class="dropdown-empty" role="status">No venues found</div>';
            }
            this.announceResults('No venues found');
        }

        this.dropdown.innerHTML = html;
        this.bindDropdownClicks();
        this.showDropdown();
    },

    // Screen reader announcements
    announceResults(message) {
        let announcer = document.getElementById('search-announcer');
        if (!announcer) {
            announcer = document.createElement('div');
            announcer.id = 'search-announcer';
            announcer.setAttribute('aria-live', 'polite');
            announcer.setAttribute('aria-atomic', 'true');
            announcer.className = 'sr-only';
            document.body.appendChild(announcer);
        }
        announcer.textContent = message;
    },

    // Haptic feedback for selections (iOS/Android)
    triggerHaptic() {
        if (navigator.vibrate) {
            navigator.vibrate(10);
        }
    },

    // Event delegation for dropdown clicks
    bindDropdownClicks() {
        this.dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Haptic feedback on selection
                this.triggerHaptic();

                // Venues only (location set via GPS button or map pin drop)
                if (item.dataset.action === 'venue') {
                    this.selectVenue(item.dataset.id);
                }
            });
        });

        // Clear recents button
        const clearBtn = this.dropdown.querySelector('[data-action="clear-recents"]');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.clearRecentSearches();
                this.renderEmptyState(); // Re-render to show "Near You" or empty
            });
        }

        // "Did you mean" suggestion links
        this.dropdown.querySelectorAll('.suggestion-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const suggestion = link.dataset.suggestion;
                this.input.value = suggestion;
                this.updateClearButtonVisibility();
                this.search(suggestion);
            });
        });
    },

    selectVenue(micId) {
        const mic = STATE.mics.find(m => m.id === micId || String(m.id) === String(micId));
        if (mic) {
            // Find today's mic at this venue for the modal
            const currentDayName = CONFIG.dayNames[new Date().getDay()];
            const venueName = (mic.title || mic.venue || '').toLowerCase().trim();
            const todayMic = STATE.mics.find(m =>
                (m.title || m.venue || '').toLowerCase().trim() === venueName &&
                m.lat === mic.lat && m.lng === mic.lng &&
                m.day === currentDayName
            ) || mic; // Fall back to matched mic if no today entry

            this.hideDropdown();
            this.input.value = todayMic.title || todayMic.venue;
            this.updateClearButtonVisibility();
            this.input.blur();

            // Save to recent searches
            this.saveRecentSearch({
                type: 'venue',
                name: todayMic.title || todayMic.venue,
                id: todayMic.id,
                sub: todayMic.hood || todayMic.neighborhood || ''
            });

            // Collapse drawer so user can see the map (mobile only)
            const isMobile = window.matchMedia('(max-width: 767px)').matches;
            if (isMobile && typeof toggleDrawer === 'function' && STATE.isDrawerOpen) {
                toggleDrawer(false);
            }

            // Fly to venue on map
            if (typeof map !== 'undefined') {
                map.flyTo([todayMic.lat, todayMic.lng], 14, { duration: 1 });
            }

            // Open venue modal if available
            if (typeof openVenueModal === 'function') {
                openVenueModal(todayMic);
            }
            // Note: We don't call transitService.calculateFromOrigin here
            // Venues are destinations, not origins. The user's current origin stays unchanged.
        }
    },

    selectLocation(lat, lng, name) {
        this.hideDropdown();
        this.input.value = '';
        this.updateClearButtonVisibility();
        this.input.blur();

        // Show origin chip instead of polluting placeholder
        this.showOriginChip(name);

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
        this.hideDropdown();
        // Show temporary loading state in chip
        this.showOriginChip('Locating...');

        // Reset pin button if it was active
        document.getElementById('pinBtn')?.classList.remove('active');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                STATE.userLocation = { lat: latitude, lng: longitude };

                // Success - stop animation, show origin chip
                if (geoBtn) geoBtn.classList.remove('finding');
                this.input.value = '';
                this.updateClearButtonVisibility();
                this.showOriginChip('Current Location');

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
                // Error - stop animation, hide chip
                if (geoBtn) geoBtn.classList.remove('finding');
                this.input.value = '';
                this.updateClearButtonVisibility();
                this.hideOriginChip();

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
            this.updateClearButtonVisibility();
        }
        this.hideDropdown();
        this.hideOriginChip();
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
