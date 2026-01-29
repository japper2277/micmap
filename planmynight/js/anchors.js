// Plan My Night - Anchor Mic (Inline Dropdown)

// Populate anchor mic data from loaded mics
function populateAnchorDropdowns() {
    anchorMicsByDay = {};
    allMics.forEach(m => {
        if (!anchorMicsByDay[m.day]) anchorMicsByDay[m.day] = [];
        anchorMicsByDay[m.day].push(m);
    });
    // Sort each day by start time
    Object.keys(anchorMicsByDay).forEach(day => {
        anchorMicsByDay[day].sort((a, b) => a.startMins - b.startMins);
    });
    updateAnchorOptions();
}

// Update available mics when day changes
function updateAnchorOptions() {
    const selectedDay = document.getElementById('day-select').value;
    anchorCurrentDayMics = anchorMicsByDay[selectedDay] || [];
    // Clear selections if they don't match the new day
    ['start', 'must', 'end'].forEach(role => {
        const hiddenInput = document.getElementById(`anchor-${role}-id`);
        if (hiddenInput.value) {
            const stillValid = anchorCurrentDayMics.some(m => m.id === hiddenInput.value);
            if (!stillValid) clearAnchorMic(role);
        }
    });
    renderAnchorChips();
}

// Show anchor dropdown
function showAnchorDropdown() {
    const container = document.getElementById('anchor-dropdown-container');
    const dropdown = document.getElementById('anchor-dropdown');
    const input = document.getElementById('anchor-search-input');

    container.classList.add('dropdown-open');
    dropdown.classList.add('visible');

    // Render results
    renderAnchorResults(input.value);
}

// Hide anchor dropdown
function hideAnchorDropdown() {
    const container = document.getElementById('anchor-dropdown-container');
    const dropdown = document.getElementById('anchor-dropdown');

    container.classList.remove('dropdown-open');
    dropdown.classList.remove('visible');
}

// Render anchor search results in dropdown
function renderAnchorResults(query) {
    const dropdown = document.getElementById('anchor-dropdown');
    const q = (query || '').toLowerCase().trim();

    let mics = anchorCurrentDayMics;
    if (q) {
        mics = mics.filter(m => {
            const name = (m.venueName || m.venue || '').toLowerCase();
            const hood = (m.neighborhood || '').toLowerCase();
            return name.includes(q) || hood.includes(q);
        });
    }

    if (mics.length === 0) {
        dropdown.innerHTML = `
            <div class="anchor-empty-state" style="padding: 20px;">
                <div style="color: #71717a; font-size: 13px;">No mics found${q ? ` for "${escapeHtml(q)}"` : ''}</div>
            </div>
        `;
        return;
    }

    // Get current selections
    const startId = document.getElementById('anchor-start-id').value;
    const mustId = document.getElementById('anchor-must-id').value;
    const endId = document.getElementById('anchor-end-id').value;

    dropdown.innerHTML = mics.slice(0, 5).map(mic => {
        const name = mic.venueName || mic.venue || 'Unknown';
        const time = minsToTime(mic.startMins);
        const hood = mic.neighborhood && mic.neighborhood !== 'NYC' ? mic.neighborhood : '';
        const costStr = mic.cost || '';
        const price = costStr && costStr.toLowerCase() !== 'free' ? costStr : '';
        const meta = [time, hood, price].filter(Boolean).join(' · ');

        // Highlight matching text in name (uses shared highlightMatch from utils.js)
        const displayName = highlightMatch(name, q, 'match-highlight');

        // Determine which role buttons are selected for this mic
        const isStart = startId === mic.id;
        const isMust = mustId === mic.id;
        const isEnd = endId === mic.id;

        return `
            <div class="anchor-dropdown-item" role="option" aria-label="${escapeHtml(name)}">
                <div class="anchor-dropdown-info">
                    <div class="anchor-dropdown-name">${displayName}</div>
                    <div class="anchor-dropdown-meta">${escapeHtml(meta)}</div>
                </div>
                <div class="anchor-dropdown-actions">
                    <button type="button"
                            class="anchor-action-btn${isStart ? ' selected' : ''}"
                            onclick="selectAnchorMic('start', '${mic.id}'); event.stopPropagation();"
                            aria-label="Set as starting point"
                            aria-pressed="${isStart}"
                            title="Start here">
                        <span class="icon" aria-hidden="true">🎯</span>
                    </button>
                    <button type="button"
                            class="anchor-action-btn${isMust ? ' selected' : ''}"
                            onclick="selectAnchorMic('must', '${mic.id}'); event.stopPropagation();"
                            aria-label="Set as must-visit stop"
                            aria-pressed="${isMust}"
                            title="Must hit">
                        <span class="icon" aria-hidden="true">📌</span>
                    </button>
                    <button type="button"
                            class="anchor-action-btn${isEnd ? ' selected' : ''}"
                            onclick="selectAnchorMic('end', '${mic.id}'); event.stopPropagation();"
                            aria-label="Set as final stop"
                            aria-pressed="${isEnd}"
                            title="End here">
                        <span class="icon" aria-hidden="true">🏁</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Select an anchor mic with a specific role
function selectAnchorMic(role, micId) {
    const hiddenInput = document.getElementById(`anchor-${role}-id`);

    // Toggle: if same mic is already selected, deselect it
    if (hiddenInput.value === micId) {
        hiddenInput.value = '';
    } else {
        hiddenInput.value = micId;
    }

    // Re-render results to update button states
    const searchInput = document.getElementById('anchor-search-input');
    renderAnchorResults(searchInput?.value || '');

    // Update chips display
    renderAnchorChips();

    // Update filter count badge
    updateFilterCountBadge();
}

// Clear anchor mic selection
function clearAnchorMic(role) {
    const hiddenInput = document.getElementById(`anchor-${role}-id`);
    hiddenInput.value = '';
    renderAnchorChips();
    updateFilterCountBadge();

    // Re-render dropdown if visible
    const dropdown = document.getElementById('anchor-dropdown');
    if (dropdown.classList.contains('visible')) {
        const searchInput = document.getElementById('anchor-search-input');
        renderAnchorResults(searchInput?.value || '');
    }
}

// Render selected anchor chips
function renderAnchorChips() {
    const container = document.getElementById('anchor-chips');
    if (!container) return;

    const chips = [];

    ['start', 'must', 'end'].forEach(role => {
        const micId = document.getElementById(`anchor-${role}-id`)?.value;
        if (!micId) return;

        const mic = anchorCurrentDayMics.find(m => m.id === micId);
        if (!mic) return;

        const name = mic.venueName || mic.venue || 'Unknown';
        const time = minsToTime(mic.startMins);
        const roleInfo = ANCHOR_ROLES[role];

        chips.push(`
            <div class="anchor-chip">
                <span class="anchor-chip-icon">${roleInfo.icon}</span>
                <div class="anchor-chip-content">
                    <span class="anchor-chip-role">${roleInfo.label}</span>
                    <span class="anchor-chip-name" title="${escapeHtml(name)}">${escapeHtml(name)} · ${time}</span>
                </div>
                <button type="button" class="anchor-chip-clear" onclick="clearAnchorMic('${role}')" aria-label="Remove ${roleInfo.label}">
                    &times;
                </button>
            </div>
        `);
    });

    container.innerHTML = chips.join('');
}

// Setup anchor dropdown event listeners
function setupAnchorDropdown() {
    const searchInput = document.getElementById('anchor-search-input');
    const clearBtn = document.getElementById('anchor-clear-btn');
    const container = document.getElementById('anchor-dropdown-container');

    if (searchInput) {
        // Show dropdown on focus
        searchInput.addEventListener('focus', () => {
            showAnchorDropdown();
        });

        // Hide dropdown on blur (with delay for button clicks)
        searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                hideAnchorDropdown();
            }, 200);
        });

        // Search as you type (debounced for performance)
        const debouncedRender = debounce((value) => renderAnchorResults(value), 100);
        searchInput.addEventListener('input', (e) => {
            debouncedRender(e.target.value);
            // Show/hide clear button
            if (clearBtn) {
                clearBtn.classList.toggle('visible', e.target.value.length > 0);
            }
        });

        // Keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            const dropdown = document.getElementById('anchor-dropdown');
            const items = dropdown?.querySelectorAll('.anchor-dropdown-item');

            if (e.key === 'Escape') {
                searchInput.blur();
                hideAnchorDropdown();
                return;
            }

            if (!items || items.length === 0) return;

            // Get currently focused item
            const focusedItem = dropdown.querySelector('.anchor-dropdown-item:focus-within');
            const focusedIndex = focusedItem ? Array.from(items).indexOf(focusedItem) : -1;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIndex = focusedIndex < items.length - 1 ? focusedIndex + 1 : 0;
                const firstBtn = items[nextIndex].querySelector('button');
                if (firstBtn) firstBtn.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIndex = focusedIndex > 0 ? focusedIndex - 1 : items.length - 1;
                const firstBtn = items[prevIndex].querySelector('button');
                if (firstBtn) firstBtn.focus();
            } else if (e.key === 'Tab' && !e.shiftKey && focusedIndex === -1 && items.length > 0) {
                // Tab into dropdown from search input
                e.preventDefault();
                const firstBtn = items[0].querySelector('button');
                if (firstBtn) firstBtn.focus();
            }
        });
    }

    // Clear button
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.classList.remove('visible');
            renderAnchorResults('');
            searchInput.focus();
        });
    }
}
