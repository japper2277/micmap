// Plan My Night - Search Functionality

// Build unified search index
function buildSearchIndex() {
    searchableItems = [];

    // Add neighborhoods
    if (Array.isArray(NEIGHBORHOODS)) {
        NEIGHBORHOODS.forEach(n => {
            searchableItems.push({
                type: 'neighborhood',
                name: n.name,
                subtitle: n.borough,
                icon: '📍',
                lat: n.lat,
                lng: n.lng,
                data: n,
                searchTerms: `${n.name.toLowerCase()} ${n.borough.toLowerCase()}`
            });
        });
    }

    // Add subway stations
    if (Array.isArray(subwayStations)) {
        subwayStations.forEach(s => {
            const lines = s.lines || [];
            searchableItems.push({
                type: 'subway',
                name: s.name,
                subtitle: lines.join(' '),
                icon: '🚇',
                lat: s.lat,
                lng: s.lng,
                data: s,
                searchTerms: `${s.name.toLowerCase()} ${lines.map(l => `${l.toLowerCase()} ${l.toLowerCase()} train`).join(' ')}`
            });
        });
    }

    // Add subway lines
    const subwayLines = ['A', 'C', 'E', 'B', 'D', 'F', 'M', 'G', 'J', 'Z', 'L', 'N', 'Q', 'R', 'W', 'S', '1', '2', '3', '4', '5', '6', '7'];
    subwayLines.forEach(line => {
        searchableItems.push({
            type: 'line',
            name: `${line} Train`,
            subtitle: 'Subway Line',
            icon: '🚇',
            line: line,
            searchTerms: `${line.toLowerCase()} ${line.toLowerCase()} train ${line.toLowerCase()} line`
        });
    });

    // Add mics
    if (Array.isArray(allMics)) {
        allMics.forEach(m => {
            const name = m.venueName || m.venue || 'Unknown';
            const neighborhood = m.neighborhood || '';
            const borough = m.borough || '';
            searchableItems.push({
                type: 'mic',
                name: name,
                subtitle: `${neighborhood}${neighborhood && borough ? ', ' : ''}${borough}`.trim(),
                icon: '🎤',
                lat: m.lat,
                lng: m.lng,
                meta: `${m.day || ''} • ${m.startTime || ''}`,
                data: m,
                searchTerms: `${name.toLowerCase()} ${neighborhood.toLowerCase()} ${borough.toLowerCase()}`
            });
        });
    }

    // Initialize Fuse.js
    fuse = new Fuse(searchableItems, {
        keys: ['searchTerms'],
        threshold: 0.3,
        distance: 100,
        minMatchCharLength: 2,
        ignoreLocation: true
    });
}

// Save recent search
function saveRecentSearch(item) {
    try {
        let recents = JSON.parse(localStorage.getItem('recentSearches') || '[]');
        recents = recents.filter(r => r.name !== item.name);
        recents.unshift(item);
        recents = recents.slice(0, 5);
        localStorage.setItem('recentSearches', JSON.stringify(recents));
    } catch (e) {
        // localStorage may be full or unavailable - fail silently
    }
}

// Get recent searches from localStorage
function getRecentSearches() {
    try {
        return JSON.parse(localStorage.getItem('recentSearches') || '[]');
    } catch {
        return [];
    }
}

// Note: highlightMatch() is defined in utils.js

// Render single search item
function renderSearchItem(item, index) {
    const escapedItem = JSON.stringify(item).replace(/'/g, '&apos;');
    const detail = item.subtitle || item.type;
    const isSelected = index === selectedSearchIndex;
    return `
        <div class="dropdown-item ${isSelected ? 'selected' : ''}"
             data-index="${index}"
             role="option"
             aria-selected="${isSelected}"
             id="search-option-${index}"
             onclick='selectSearchItem(${escapedItem})'>
            <span class="item-icon" aria-hidden="true">${item.icon}</span>
            <div class="item-text">
                <div class="item-name">${highlightMatch(item.name, currentQuery)}</div>
                ${detail ? `<div class="item-detail">${detail}</div>` : ''}
            </div>
        </div>
    `;
}

// Initialize search functionality
function initSearch() {
    const searchInput = document.getElementById('origin-search');
    const dropdown = document.getElementById('origin-dropdown');
    const clearBtn = document.getElementById('search-clear-btn');
    const dropdownContainer = document.querySelector('.dropdown-container');

    function showDropdown() {
        dropdown.classList.add('visible');
        dropdownContainer.classList.add('dropdown-open');
        searchInput.setAttribute('aria-expanded', 'true');
    }

    function hideDropdown() {
        dropdown.classList.remove('visible');
        dropdownContainer.classList.remove('dropdown-open');
        searchInput.setAttribute('aria-expanded', 'false');
    }

    function updateClearButton() {
        if (searchInput.value.length > 0) {
            clearBtn.classList.add('visible');
        } else {
            clearBtn.classList.remove('visible');
        }
    }

    function renderSearchDropdown(results) {
        if (!results || results.length === 0) {
            dropdown.innerHTML = `
                <div class="dropdown-item" style="justify-content: center; color: rgba(255,255,255,0.4);">
                    No results found
                </div>
            `;
            showDropdown();
            return;
        }

        let html = '';
        results.forEach((item, index) => {
            html += renderSearchItem(item, index);
        });

        dropdown.innerHTML = html;
        showDropdown();
    }

    function updateSearchSelection() {
        const items = dropdown.querySelectorAll('.dropdown-item');
        items.forEach((item, i) => {
            const isSelected = i === selectedSearchIndex;
            item.classList.toggle('selected', isSelected);
            item.setAttribute('aria-selected', isSelected);
            if (isSelected) {
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                searchInput.setAttribute('aria-activedescendant', `search-option-${i}`);
            }
        });
        if (selectedSearchIndex < 0) {
            searchInput.removeAttribute('aria-activedescendant');
        }
    }

    function showQuickSuggestions() {
        let suggestions = [];

        // Add recent searches
        const recent = getRecentSearches().slice(0, 5);
        recent.forEach(item => {
            suggestions.push({ ...item, icon: '🕐' });
        });

        // Add variety from each category
        if (searchableItems && searchableItems.length > 0) {
            const neighborhoods = searchableItems.filter(i => i.type === 'neighborhood').slice(0, 8);
            const lines = searchableItems.filter(i => i.type === 'line').slice(0, 6);
            const mics = searchableItems.filter(i => i.type === 'mic').slice(0, 8);

            const maxLen = Math.max(neighborhoods.length, lines.length, mics.length);
            for (let i = 0; i < maxLen; i++) {
                if (neighborhoods[i]) suggestions.push(neighborhoods[i]);
                if (lines[i]) suggestions.push(lines[i]);
                if (mics[i]) suggestions.push(mics[i]);
            }
        }

        if (suggestions.length > 0) {
            renderSearchDropdown(suggestions);
        } else {
            dropdown.innerHTML = `
                <div class="dropdown-item" style="justify-content: center; color: rgba(255,255,255,0.5); font-size: 13px;">
                    Start typing to search...
                </div>
            `;
            showDropdown();
        }
    }

    // Search with fuzzy matching
    const performSearch = debounce((query) => {
        currentQuery = query;
        selectedSearchIndex = -1;

        if (query.length < 1) {
            hideDropdown();
            return;
        }

        if (!fuse) {
            // Search index not ready yet - wait for data load
            return;
        }

        const results = fuse.search(query, { limit: 50 });
        const items = results.map(r => r.item);
        renderSearchDropdown(items);
    }, 80);

    // Event listeners
    searchInput.addEventListener('input', (e) => {
        updateClearButton();
        performSearch(e.target.value.trim());
    });

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.trim().length > 0) {
            performSearch(searchInput.value.trim());
        } else {
            showQuickSuggestions();
        }
    });

    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        haptic('light');
        searchInput.value = '';
        updateClearButton();
        hideDropdown();
        searchInput.focus();
    });

    // Keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.dropdown-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedSearchIndex = Math.min(selectedSearchIndex + 1, items.length - 1);
            updateSearchSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedSearchIndex = Math.max(selectedSearchIndex - 1, 0);
            updateSearchSelection();
        } else if (e.key === 'Enter' && selectedSearchIndex >= 0) {
            e.preventDefault();
            items[selectedSearchIndex].click();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideDropdown();
            selectedSearchIndex = -1;
        }
    });

    // Click-outside handler
    document.addEventListener('click', (e) => {
        const container = document.querySelector('.dropdown-container');
        if (container && !container.contains(e.target)) {
            hideDropdown();
        }
    });

    // Global select function
    window.selectSearchItem = (item) => {
        haptic('light');
        saveRecentSearch(item);

        if (item.type === 'neighborhood') {
            selectedOrigin = item.data;
        } else if (item.type === 'subway') {
            selectedOrigin = { lat: item.lat, lng: item.lng, name: item.name };
        } else if (item.type === 'line') {
            const stationsOnLine = subwayStations.filter(s => s.lines && s.lines.includes(item.line));
            if (stationsOnLine.length > 0) {
                selectedOrigin = { lat: stationsOnLine[0].lat, lng: stationsOnLine[0].lng, name: item.name };
            } else {
                showToast(`No stations found for ${item.name}`);
                return;
            }
        } else if (item.type === 'mic') {
            selectedOrigin = { lat: item.lat, lng: item.lng, name: item.name };
        }

        selectOriginUI(selectedOrigin);
    };

    // Legacy support
    window.selectOriginByName = (name) => {
        const n = NEIGHBORHOODS.find(x => x.name === name);
        if (n) {
            selectedOrigin = n;
            selectOriginUI(n);
        }
    };
}

function selectOriginUI(origin) {
    const selectedOriginEl = document.getElementById('selected-origin');
    const dropdown = document.getElementById('origin-dropdown');
    const dropdownContainer = document.querySelector('.dropdown-container');
    const originInput = document.getElementById('origin-search');

    selectedOriginEl.classList.remove('hidden');
    selectedOriginEl.classList.add('slide-in-right');
    document.getElementById('selected-origin-text').textContent = origin.name;
    originInput.value = '';

    // Clear any validation error state
    originInput.setAttribute('aria-invalid', 'false');
    dropdownContainer.classList.remove('error-shake');

    dropdown.classList.remove('visible');
    dropdownContainer.classList.remove('dropdown-open');

    setTimeout(() => selectedOriginEl.classList.remove('slide-in-right'), 300);

    // Auto-suggest area based on origin location
    if (origin.lat && origin.lng && selectedAreas.size === 0) {
        const suggestedBorough = suggestAreaFromOrigin(origin.lat, origin.lng);
        if (suggestedBorough) {
            showAreaSuggestion(`Showing mics in ${suggestedBorough}`);
            selectedAreas.add(suggestedBorough);
            const chip = document.querySelector(`.borough-chip[data-borough="${suggestedBorough}"]`);
            if (chip) chip.classList.add('selected');
            updateAreaCheckboxes();
        }
    }
}

window.clearOrigin = () => {
    haptic('light');
    selectedOrigin = null;
    document.getElementById('selected-origin').classList.add('hidden');
    showAreaSuggestion(null);
    const btn = document.getElementById('geo-btn');
    btn.classList.remove('success');
    btn.innerHTML = '<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg> <span id="geo-btn-text">Use My Location</span>';
};
