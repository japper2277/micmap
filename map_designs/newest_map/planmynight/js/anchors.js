// Plan My Night - Anchor Mic (Inline Dropdown)

let anchorActiveRole = 'start';

function flashAnchorChips() {
    const chipsEl = document.getElementById('anchor-chips');
    if (!chipsEl) return;
    chipsEl.classList.remove('anchor-chips-flash');
    // Force reflow so the animation can retrigger
    void chipsEl.offsetWidth;
    chipsEl.classList.add('anchor-chips-flash');
    setTimeout(() => chipsEl.classList.remove('anchor-chips-flash'), 650);
}

function updateAnchorRoleSummaries() {
    const roleIds = {
        start: document.getElementById('anchor-start-id')?.value,
        must: document.getElementById('anchor-must-id')?.value,
        end: document.getElementById('anchor-end-id')?.value
    };

    ['start', 'must', 'end'].forEach(role => {
        const el = document.getElementById(`anchor-role-summary-${role}`);
        if (!el) return;

        const micId = roleIds[role];
        if (!micId) {
            el.textContent = 'Not set';
            return;
        }

        const mic = anchorCurrentDayMics?.find(m => m.id === micId);
        if (!mic) {
            el.textContent = 'Not set';
            return;
        }

        const name = mic.venueName || mic.venue || 'Unknown';
        const time = minsToTime(mic.startMins);
        el.textContent = `${name} · ${time}`;
    });
}

function setActiveAnchorRole(role) {
    if (!ANCHOR_ROLES?.[role]) return;
    anchorActiveRole = role;

    document.querySelectorAll('.anchor-role-btn').forEach(btn => {
        const isActive = btn.dataset.role === role;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Re-render results so the “Tap to set as …” hint stays accurate
    const searchInput = document.getElementById('anchor-search-input');
    if (document.getElementById('anchor-dropdown')?.classList.contains('visible')) {
        renderAnchorResults(searchInput?.value || '');
    }
}

function initAnchorRoleSelector() {
    const buttons = document.querySelectorAll('.anchor-role-btn');
    if (!buttons || buttons.length === 0) return;

    buttons.forEach(btn => {
        if (btn.dataset.initialized === 'true') return;
        btn.dataset.initialized = 'true';
        btn.addEventListener('click', () => {
            setActiveAnchorRole(btn.dataset.role);
        });
    });

    // Ensure UI matches default state
    setActiveAnchorRole(anchorActiveRole);
}

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
    updateAnchorRoleSummaries();
}

// Show anchor dropdown
function showAnchorDropdown() {
    const container = document.getElementById('anchor-dropdown-container');
    const dropdown = document.getElementById('anchor-dropdown');
    const input = document.getElementById('anchor-search-input');

    container.classList.add('dropdown-open');
    dropdown.classList.add('visible');
    if (input) input.setAttribute('aria-expanded', 'true');

    // Render results
    renderAnchorResults(input.value);
}

// Hide anchor dropdown
function hideAnchorDropdown() {
    const container = document.getElementById('anchor-dropdown-container');
    const dropdown = document.getElementById('anchor-dropdown');
    const input = document.getElementById('anchor-search-input');

    container.classList.remove('dropdown-open');
    dropdown.classList.remove('visible');
    if (input) input.setAttribute('aria-expanded', 'false');
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

    const activeRoleInfo = ANCHOR_ROLES[anchorActiveRole] || ANCHOR_ROLES.start;

    const headerHtml = !q
        ? `<div class="anchor-dropdown-header" aria-hidden="true">Tap a mic to set ${escapeHtml(activeRoleInfo.label)} ${activeRoleInfo.icon}</div>`
        : '';

    const itemsHtml = mics.slice(0, 8).map(mic => {
        const name = mic.venueName || mic.venue || 'Unknown';
        const time = minsToTime(mic.startMins);
        const hood = mic.neighborhood && mic.neighborhood !== 'NYC' ? mic.neighborhood : '';
        const costStr = mic.cost || '';
        const price = costStr && costStr.toLowerCase() !== 'free' ? costStr : '';
        const meta = [time, hood, price].filter(Boolean).join(' · ');

        // Highlight matching text in name (uses shared highlightMatch from utils.js)
        const displayName = highlightMatch(name, q, 'match-highlight');

        const roles = [];
        if (startId === mic.id) roles.push('start');
        if (mustId === mic.id) roles.push('must');
        if (endId === mic.id) roles.push('end');

        const isActiveRoleSelected =
            (anchorActiveRole === 'start' && startId === mic.id) ||
            (anchorActiveRole === 'must' && mustId === mic.id) ||
            (anchorActiveRole === 'end' && endId === mic.id);

        const actionVerb = isActiveRoleSelected ? 'Unpin' : 'Set';
        const actionLabel = `${actionVerb} ${activeRoleInfo.label}`;
        const visualPill = isActiveRoleSelected ? 'Pinned' : actionLabel;

        const badgesHtml = roles.map(r => {
            const info = ANCHOR_ROLES[r];
            return `<span class="anchor-selected-badge ${r}">${escapeHtml(info.label)}</span>`;
        }).join('');

        return `
            <button type="button"
                    class="anchor-dropdown-item${isActiveRoleSelected ? ' active-role-selected' : ''}"
                    role="option"
                    aria-label="${escapeHtml(name)}. ${actionLabel}."
                    onclick="selectAnchorMic(anchorActiveRole, '${mic.id}')">
                <div class="anchor-dropdown-info">
                    <div class="anchor-dropdown-name">${displayName}</div>
                    <div class="anchor-dropdown-meta">${escapeHtml(meta)}</div>
                </div>
                <div class="anchor-dropdown-right">
                    ${badgesHtml ? `<div class="anchor-selected-badges" aria-hidden="true">${badgesHtml}</div>` : ''}
                    <div class="anchor-set-pill ${isActiveRoleSelected ? 'pinned' : 'primary'}" aria-hidden="true">${escapeHtml(visualPill)}</div>
                </div>
            </button>
        `;
    }).join('');

    dropdown.innerHTML = headerHtml + itemsHtml;
}

// Select an anchor mic with a specific role
function selectAnchorMic(role, micId) {
    const hiddenInput = document.getElementById(`anchor-${role}-id`);

    const roleInfo = ANCHOR_ROLES?.[role] || ANCHOR_ROLES.start;
    const mic = anchorCurrentDayMics?.find(m => m.id === micId);
    const micName = mic?.venueName || mic?.venue || 'This mic';

    // Toggle: if same mic is already selected, deselect it
    if (hiddenInput.value === micId) {
        hiddenInput.value = '';
        showToast(`${roleInfo.label} cleared`, 'info');
    } else {
        // Guardrail: a mic can only occupy one role at a time.
        const roles = ['start', 'must', 'end'];
        const conflicts = roles.filter(r => r !== role && document.getElementById(`anchor-${r}-id`)?.value === micId);
        conflicts.forEach(r => {
            const input = document.getElementById(`anchor-${r}-id`);
            if (input) input.value = '';
        });

        hiddenInput.value = micId;

        if (conflicts.length > 0) {
            const conflictLabels = conflicts.map(r => ANCHOR_ROLES[r]?.label || r).join(', ');
            showToast(`Moved “${micName}” to ${roleInfo.label} (removed from ${conflictLabels})`, 'success');
        } else {
            showToast(`Set ${roleInfo.label}: “${micName}”`, 'success');
        }
    }

    // Re-render results to update button states
    const searchInput = document.getElementById('anchor-search-input');
    renderAnchorResults(searchInput?.value || '');

    // Update chips display
    renderAnchorChips();
    updateAnchorRoleSummaries();
    flashAnchorChips();

    const chipsEl = document.getElementById('anchor-chips');
    if (chipsEl && chipsEl.children.length > 0) {
        setTimeout(() => {
            try {
                chipsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (_) {}
        }, 60);
    }

    // Keep the interaction tight: after pinning, return focus to the search box
    // (helps keyboard users and prevents focus loss when the list re-renders)
    if (document.getElementById('anchor-dropdown')?.classList.contains('visible')) {
        document.getElementById('anchor-search-input')?.focus();
    }

    // Update filter count badge
    updateFilterCountBadge();
}

// Clear anchor mic selection
function clearAnchorMic(role) {
    const hiddenInput = document.getElementById(`anchor-${role}-id`);
    hiddenInput.value = '';
    renderAnchorChips();
    updateAnchorRoleSummaries();
    updateFilterCountBadge();

    // Re-render dropdown if visible
    const dropdown = document.getElementById('anchor-dropdown');
    if (dropdown.classList.contains('visible')) {
        const searchInput = document.getElementById('anchor-search-input');
        renderAnchorResults(searchInput?.value || '');
    }
}

// Check if a mic passes current filters
function micPassesCurrentFilters(mic) {
    if (!mic) return false;

    // Check price filter
    if (typeof formFilterState !== 'undefined' && formFilterState.price === 'free') {
        const cost = mic.cost || mic.price || 0;
        if (typeof cost === 'number' && cost > 0) return false;
        if (typeof cost === 'string' && cost.toLowerCase() !== 'free' && cost !== '0' && cost !== '') return false;
    }

    // Check price radio (fallback)
    const priceRadio = document.querySelector('input[name="price"]:checked')?.value;
    if (priceRadio === 'free') {
        const cost = mic.cost || mic.price || 0;
        if (typeof cost === 'number' && cost > 0) return false;
        if (typeof cost === 'string' && cost.toLowerCase() !== 'free' && cost !== '0' && cost !== '') return false;
    }

    // Check borough/area filter
    if (typeof formFilterState !== 'undefined' && formFilterState.borough && formFilterState.borough !== 'all') {
        if (formFilterState.neighborhood) {
            if (mic.neighborhood !== formFilterState.neighborhood) return false;
        } else {
            if (mic.borough !== formFilterState.borough) return false;
        }
    }

    // Check selectedAreas if present
    if (typeof selectedAreas !== 'undefined' && selectedAreas.size > 0) {
        const matchesBorough = mic.borough && selectedAreas.has(mic.borough);
        const matchesNeighborhood = mic.neighborhood && selectedAreas.has(mic.neighborhood);
        if (!matchesBorough && !matchesNeighborhood) return false;
    }

    return true;
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

        // FIX: Check if mic passes current filters
        const passesFilters = micPassesCurrentFilters(mic);
        const warningClass = passesFilters ? '' : ' filter-warning';
        const warningIcon = passesFilters ? '' : '<span class="anchor-chip-warning" title="This mic may not appear in results with current filters">⚠️</span>';

        chips.push(`
            <div class="anchor-chip${warningClass}">
                <span class="anchor-chip-icon">${roleInfo.icon}</span>
                <div class="anchor-chip-content">
                    <span class="anchor-chip-role">${roleInfo.label}</span>
                    <span class="anchor-chip-name" title="${escapeHtml(name)}">${escapeHtml(name)} · ${time}</span>
                </div>
                ${warningIcon}
                <button type="button" class="anchor-chip-clear" onclick="clearAnchorMic('${role}')" aria-label="Remove ${roleInfo.label}">
                    &times;
                </button>
            </div>
        `);
    });

    container.innerHTML = chips.join('');
    updateAnchorRoleSummaries();
}

// Setup anchor dropdown event listeners
function setupAnchorDropdown() {
    const searchInput = document.getElementById('anchor-search-input');
    const clearBtn = document.getElementById('anchor-clear-btn');
    const container = document.getElementById('anchor-dropdown-container');

    initAnchorRoleSelector();

    if (searchInput) {
        // Show dropdown on focus
        searchInput.addEventListener('focus', () => {
            showAnchorDropdown();
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
            const focusedItem = document.activeElement?.classList?.contains('anchor-dropdown-item') ? document.activeElement : null;
            const focusedIndex = focusedItem ? Array.from(items).indexOf(focusedItem) : -1;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const nextIndex = focusedIndex < items.length - 1 ? focusedIndex + 1 : 0;
                items[nextIndex]?.focus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prevIndex = focusedIndex > 0 ? focusedIndex - 1 : items.length - 1;
                items[prevIndex]?.focus();
            }
        });
    }

    // Keep dropdown open while focus is anywhere inside the anchor area
    if (container) {
        container.addEventListener('focusin', () => {
            showAnchorDropdown();
        });

        container.addEventListener('focusout', () => {
            // Defer to allow clicks/focus changes to settle
            setTimeout(() => {
                if (!container.contains(document.activeElement)) {
                    hideAnchorDropdown();
                }
            }, 0);
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
