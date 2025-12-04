// =============================================================================
// UI & RENDERING FUNCTIONS
// =============================================================================
// Functions for creating and rendering mic cards, filtering, etc.

// =============================================================================
// MIC CARD CREATION
// =============================================================================

function createMicCard(mic, isTopPick = false) {
    const micCard = document.createElement('div');
    const isOpen = isMicOpenNow(mic) === 'open';
    const openClass = isOpen ? 'ring-2 ring-green-500 shadow-green-500/50' : '';
    micCard.className = `mic-card bg-[var(--surface-light)] rounded-xl shadow-xl border border-[var(--border-color)] overflow-hidden cursor-pointer transform hover:scale-[1.01] transition-all duration-200 relative ${isTopPick ? 'top-pick-card' : ''} ${openClass}`;
    micCard.dataset.micId = mic.id;

    // Tags
    const allTagsHTML = mic.tags.map(tag =>
        `<span class="bg-blue-800/50 text-blue-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">${tag}</span>`
    ).join('');

    // Sign-up rendering with cost badge
    let signUpHTML = '';
    const details = mic.signUpDetails;
    const costBadge = `<span class="text-sm font-bold bg-green-700/50 text-green-300 px-3 py-1.5 rounded-full whitespace-nowrap">${mic.cost || 'Free'}</span>`;

    switch (details.type) {
        case 'url':
            signUpHTML = `${costBadge}<a href="${details.value}" target="_blank" rel="noopener noreferrer" class="flex-grow text-center bg-[var(--brand-blue)] hover:bg-[var(--brand-blue-hover)] text-white font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 action-btn">Sign Up Online</a>`;
            break;
        case 'email':
            signUpHTML = `${costBadge}<a href="mailto:${details.value}" class="flex-grow text-center bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200 action-btn">Email to Sign Up</a>`;
            break;
        case 'in-person':
        default:
            signUpHTML = `<div class="w-full bg-[var(--surface-medium)] p-3 rounded-lg text-center"><p class="text-sm text-[var(--text-primary)]">${costBadge} ${details.value}</p></div>`;
            break;
    }

    const mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${mic.lat},${mic.lon}`;

    // Open/Closed status badge
    const openStatus = isMicOpenNow(mic);
    let statusBadge = '';
    if (openStatus === 'open') {
        statusBadge = `<span class="absolute top-3 left-3 bg-green-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md flex items-center"><span class="w-1.5 h-1.5 bg-white rounded-full mr-1.5 animate-pulse"></span>Open Now</span>`;
    } else if (openStatus === 'soon') {
        statusBadge = `<span class="absolute top-3 left-3 bg-yellow-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-md">Opens Soon</span>`;
    }

    // Favorite icon
    const favIcon = isFavorite(mic.id) ?
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>` :
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;

    micCard.innerHTML = `
        ${statusBadge}
        <button class="favorite-btn absolute top-3 right-3 ${isFavorite(mic.id) ? 'text-red-500' : 'text-gray-400 hover:text-red-400'} transition-colors z-10" data-mic-id="${mic.id}" title="${isFavorite(mic.id) ? 'Remove from favorites' : 'Add to favorites'}">
            ${favIcon}
        </button>
        ${isTopPick ? `<div class="top-pick-badge absolute top-0 left-0 bg-[var(--top-pick-gold)] text-gray-900 font-extrabold px-3 py-1.5 rounded-br-lg shadow-md flex items-center"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="mr-1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>TOP PICK</div>` : ''}

        <div class="p-4 flex flex-col h-full">
            <!-- Section 1: Name, Location, Day, Time -->
            <div class="mb-3 pb-3 border-b border-[var(--border-color)]">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h2 class="text-xl font-bold text-[var(--text-primary)] mb-1">${mic.name}</h2>
                        <p class="text-sm text-[var(--text-secondary)]">${mic.neighborhood}, ${mic.borough}</p>
                    </div>
                    <div class="text-right flex-shrink-0 ml-4">
                        <p class="text-lg font-bold text-[var(--brand-blue)]">${mic.day}</p>
                        <p class="text-base text-[var(--text-secondary)]">${mic.startTime}</p>
                    </div>
                </div>
                <div class="flex justify-between items-center text-sm">
                    ${mic.distance !== null ? (() => {
                        const walkingTime = Math.round(mic.distance * 20);
                        return `<p class="font-semibold text-[var(--success-green)]">${mic.distance.toFixed(1)} mi <span class="text-[var(--text-tertiary)] font-normal">(~${walkingTime} min)</span></p>`;
                    })() : '<div></div>'}

                    <div class="flex items-center space-x-3">
                        ${mic.stageTime ? `
                        <div class="flex items-center text-[var(--text-secondary)]" title="Stage Time">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mr-1 text-[var(--text-tertiary)]"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                            <span class="font-medium">${mic.stageTime}</span>
                        </div>` : ''}

                        <div id="heat-indicator-${mic.id}" class="flex items-center font-bold text-[var(--warning-orange)]" title="Comics Checking In">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="mr-1"><path d="M8.5 14.5A2.5 2.5 0 0011 17v3a2 2 0 104 0v-3a2.5 2.5 0 002.5-2.5v-7A2.5 2.5 0 0015 5V3a1 1 0 10-2 0v2a2.5 2.5 0 00-2.5 2.5v7z"/></svg>
                            <span class="ml-0.5">${mic.comics}</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section 2: Tags -->
            <div class="mb-3 flex flex-wrap gap-2">${allTagsHTML}</div>

            <!-- Section 3: Sign-Up & Cost -->
            <div class="mb-3 pb-3 border-b border-[var(--border-color)] space-y-2">
                <div class="flex items-center justify-center space-x-3">${signUpHTML}</div>
                <p class="text-xs text-center text-[var(--text-tertiary)]">Host: ${mic.host || 'N/A'}</p>
            </div>

            <!-- Section 4: Actions -->
            <div class="mt-auto space-y-2">
                <div class="grid grid-cols-2 gap-2">
                    <a href="${mapsLink}" target="_blank" rel="noopener noreferrer" class="col-span-1 block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-lg transition-colors duration-200 flex items-center justify-center text-sm action-btn">Directions</a>
                    <button class="check-in-btn col-span-1 w-full bg-[var(--warning-orange)] hover:bg-orange-600 text-white font-semibold py-2 px-3 rounded-lg text-sm action-btn" data-mic-id="${mic.id}">Check In</button>
                </div>
                <button class="share-btn w-full bg-[var(--surface-medium)] hover:bg-[var(--surface-light)] text-[var(--text-primary)] font-semibold py-2 px-3 rounded-lg text-sm flex items-center justify-center space-x-2 transition-colors duration-200 border border-[var(--border-color)]" data-mic-id="${mic.id}" data-mic-name="${mic.name}" data-mic-day="${mic.day}" data-mic-time="${mic.startTime}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="18" cy="5" r="3"></circle>
                        <circle cx="6" cy="12" r="3"></circle>
                        <circle cx="18" cy="19" r="3"></circle>
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    <span>Share</span>
                </button>
            </div>
        </div>
    `;

    return micCard;
}

// =============================================================================
// RENDERING
// =============================================================================

function renderMics(micsToRender) {
    const micList = document.getElementById(DOM_IDS.micList);
    micList.innerHTML = '';

    // Update results counter
    const resultsCountElement = document.getElementById('results-count');
    if (resultsCountElement) {
        resultsCountElement.textContent = micsToRender.length;


        // Animate counter update
        resultsCountElement.style.transform = 'scale(1.1)';
        setTimeout(() => {
            resultsCountElement.style.transform = 'scale(1)';
        }, 150);
    }

    // Update filter badge count
    updateFilterBadge();

    // Apply sorting
    let sortedMics = [...micsToRender];

    // Primary sort: Open mics always first
    sortedMics.sort((a, b) => {
        const aOpen = isMicOpenNow(a) === 'open' ? 1 : 0;
        const bOpen = isMicOpenNow(b) === 'open' ? 1 : 0;
        if (bOpen !== aOpen) return bOpen - aOpen;

        // Secondary sort based on user selection
        switch(state.selectedSort) {
            case 'time':
                // Sort by start time
                const aTime = formatTime(a.startTime);
                const bTime = formatTime(b.startTime);
                return (aTime.hour * 60 + aTime.minute) - (bTime.hour * 60 + bTime.minute);

            case 'popularity':
                // Sort by comics count (descending)
                return (b.comics || 0) - (a.comics || 0);

            case 'distance':
            default:
                // Sort by distance (ascending)
                if (a.distance === null && b.distance === null) return 0;
                if (a.distance === null) return 1;
                if (b.distance === null) return -1;
                return a.distance - b.distance;
        }
    });

    state.topPicks = calculateTopPicks(sortedMics);

    // Render Top Picks
    if (state.topPicks.length > 0 && FEATURES.topPicksEnabled) {
        const topPicksHeader = document.createElement('h3');
        topPicksHeader.className = 'text-xl font-bold text-[var(--text-primary)] mb-3 mt-2 px-1';
        topPicksHeader.textContent = '⭐ Top Picks';
        micList.appendChild(topPicksHeader);

        state.topPicks.forEach(mic => {
            micList.appendChild(createMicCard(mic, true));
        });

        const otherMicsHeader = document.createElement('h3');
        otherMicsHeader.className = 'text-xl font-bold text-[var(--text-primary)] mb-3 mt-6 px-1';
        otherMicsHeader.textContent = 'Other Mics';
        micList.appendChild(otherMicsHeader);
    }

    // Render Other Mics
    const otherMics = sortedMics.filter(mic => !state.topPicks.some(tp => tp.id === mic.id));

    if (otherMics.length === 0 && state.topPicks.length === 0) {
        micList.innerHTML = `
            <div class="text-center p-8 text-gray-400">
                <p class="text-lg mb-2">No mics found.</p>
                <p class="text-sm">Try adjusting your filters or searching a different area.</p>
            </div>
        `;
    } else {
        otherMics.forEach(mic => {
            micList.appendChild(createMicCard(mic, false));
        });
    }

    updateMapMarkers();
}

// =============================================================================
// FILTERING
// =============================================================================

function filterMics() {
    const now = new Date();
    const today = now.getDay();
    const currentDayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today];

    // Calculate distances
    let filtered = mockMics.map(mic => {
        if (state.currentPosition) {
            mic.distance = getDistanceFromLatLonInKm(
                state.currentPosition[0],
                state.currentPosition[1],
                mic.lat,
                mic.lon
            );
        } else {
            mic.distance = null;
        }
        return mic;
    }).sort((a, b) => {
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
    });

    // Search query filter
    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        filtered = filtered.filter(mic =>
            mic.name.toLowerCase().includes(query) ||
            mic.borough.toLowerCase().includes(query) ||
            mic.neighborhood.toLowerCase().includes(query) ||
            (mic.tags && mic.tags.some(tag => tag.toLowerCase().includes(query)))
        );
    }

    // Day filter (empty string = "Any Day", shows all days)
    if (state.selectedDay) {
        filtered = filtered.filter(mic => mic.day === state.selectedDay);
    }
    // If no day is selected (Any Day), show all days - no filtering needed

    // Time filter
    if (state.selectedTime === 'afternoon') {
        filtered = filtered.filter(mic => {
            const { hour } = formatTime(mic.startTime);
            return hour >= 12 && hour < 17;
        });
    } else if (state.selectedTime === 'evening') {
        filtered = filtered.filter(mic => {
            const { hour } = formatTime(mic.startTime);
            return hour >= 17 && hour <= 23;
        });
    }

    // Borough filter
    if (state.selectedBorough) {
        filtered = filtered.filter(mic => mic.borough === state.selectedBorough);
    }

    // Neighborhood filter
    if (state.selectedNeighborhood) {
        filtered = filtered.filter(mic => mic.neighborhood === state.selectedNeighborhood);
    }

    // Cost filter
    if (state.selectedCost) {
        filtered = filtered.filter(mic => matchesCostFilter(mic, state.selectedCost));
    }

    // Favorites filter
    if (state.favoritesOnly) {
        filtered = filtered.filter(mic => isFavorite(mic.id));
    }

    state.mics = filtered;
    renderMics(filtered);
    renderFilterChips();
}

// =============================================================================
// FILTER CHIPS
// =============================================================================

function renderFilterChips() {
    const container = document.getElementById('filter-chips-container');
    const chips = [];

    // Day chip
    if (state.selectedDay) {
        chips.push({
            label: state.selectedDay,
            remove: () => {
                state.selectedDay = '';
                document.querySelectorAll('.day-pill').forEach(btn => btn.classList.remove('active'));
                document.querySelector(`.day-pill[data-day=""]`).classList.add('active');
                filterMics();
            }
        });
    }

    // Time chip
    if (state.selectedTime && state.selectedTime !== 'all') {
        const timeLabels = { afternoon: 'Afternoon', evening: 'Evening' };
        chips.push({
            label: timeLabels[state.selectedTime],
            remove: () => {
                state.selectedTime = 'all';
                document.querySelectorAll('.time-filter-btn').forEach(btn => btn.classList.remove('active'));
                document.querySelector(`.time-filter-btn[data-time="all"]`).classList.add('active');
                filterMics();
            }
        });
    }

    // Borough chip
    if (state.selectedBorough) {
        chips.push({
            label: state.selectedBorough,
            remove: () => {
                state.selectedBorough = '';
                document.getElementById(DOM_IDS.boroughFilter).value = '';
                state.selectedNeighborhood = '';
                populateNeighborhoods('');
                filterMics();
            }
        });
    }

    // Neighborhood chip
    if (state.selectedNeighborhood) {
        chips.push({
            label: state.selectedNeighborhood,
            remove: () => {
                state.selectedNeighborhood = '';
                document.getElementById(DOM_IDS.neighborhoodFilter).value = '';
                filterMics();
            }
        });
    }

    // Cost chip
    if (state.selectedCost) {
        const costLabels = {
            free: 'Free',
            under10: 'Under $10',
            '10-20': '$10-$20',
            over20: 'Over $20'
        };
        chips.push({
            label: costLabels[state.selectedCost],
            remove: () => {
                state.selectedCost = '';
                document.getElementById(DOM_IDS.costFilter).value = '';
                filterMics();
            }
        });
    }

    // Favorites chip
    if (state.favoritesOnly) {
        chips.push({
            label: 'Favorites Only',
            remove: () => {
                state.favoritesOnly = false;
                document.getElementById(DOM_IDS.favoritesOnly).checked = false;
                filterMics();
            }
        });
    }

    // Search chip
    if (state.searchQuery) {
        chips.push({
            label: `"${state.searchQuery}"`,
            remove: () => {
                state.searchQuery = '';
                document.getElementById(DOM_IDS.searchInput).value = '';
                filterMics();
            }
        });
    }

    // Render chips
    if (chips.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="flex flex-wrap gap-2">
            ${chips.map(chip => `
                <button class="filter-chip flex items-center space-x-1 bg-[var(--brand-blue)] text-white text-xs font-medium px-2.5 py-1 rounded-full hover:bg-[var(--brand-blue-hover)] transition-colors duration-200" onclick="(${chip.remove})()">
                    <span>${chip.label}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `).join('')}
        </div>
    `;

    // Re-attach event listeners (since we're using innerHTML)
    const chipElements = container.querySelectorAll('.filter-chip');
    chipElements.forEach((el, i) => {
        el.onclick = chips[i].remove;
    });
}

// =============================================================================
// FILTER BADGE UPDATE
// =============================================================================

function updateFilterBadge() {
    const filterBadge = document.getElementById('filter-badge');
    if (!filterBadge) return;

    let activeFilters = 0;

    if (state.searchQuery) activeFilters++;
    if (state.selectedDay) activeFilters++;
    if (state.selectedTime && state.selectedTime !== 'any') activeFilters++;
    if (state.selectedBorough) activeFilters++;
    if (state.selectedNeighborhood) activeFilters++;
    if (state.selectedCost) activeFilters++;
    if (state.favoritesOnly) activeFilters++;

    if (activeFilters > 0) {
        filterBadge.textContent = activeFilters;
        filterBadge.classList.remove('hidden');
    } else {
        filterBadge.classList.add('hidden');
    }
}

// =============================================================================
// LOADING STATE
// =============================================================================

function showLoadingState() {
    const micList = document.getElementById(DOM_IDS.micList);
    micList.innerHTML = `
        <div class="space-y-4">
            ${[1, 2, 3].map(() => `
                <div class="bg-[var(--surface-light)] rounded-xl p-5 border border-[var(--border-color)]">
                    <div class="skeleton h-6 w-3/4 rounded mb-3"></div>
                    <div class="skeleton h-4 w-1/2 rounded mb-4"></div>
                    <div class="skeleton h-24 w-full rounded"></div>
                </div>
            `).join('')}
        </div>
    `;
}

// =============================================================================
// CURRENT TIME DISPLAY
// =============================================================================

function updateCurrentTimeDisplay() {
    const now = new Date();
    const options = { weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: true };
    const timeString = now.toLocaleString('en-US', options);
    document.title = `MicMap - ${timeString}`;
}
