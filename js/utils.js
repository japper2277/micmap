// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================
// Helper functions used throughout the app

// =============================================================================
// DISTANCE & LOCATION
// =============================================================================

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = R * c;
    return distanceKm * 0.621371; // Convert to miles
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

// =============================================================================
// TIME & DATE
// =============================================================================

function formatTime(timeString) {
    const match = timeString.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) {
        console.warn(`Invalid time format: ${timeString}`);
        return { hour: 19, minute: 0 }; // Default to 7:00 PM
    }
    const [hourStr, minuteStr, ampm] = match.slice(1);
    let hour = parseInt(hourStr);
    if (ampm.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
    return { hour, minute: parseInt(minuteStr) };
}

function isMicActive(mic) {
    const now = new Date();
    const today = now.getDay();
    const currentDayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today];

    if (mic.day !== currentDayName) {
        return false;
    }

    const { hour: micHour, minute: micMinute } = formatTime(mic.startTime);
    const micTime = new Date(now);
    micTime.setHours(micHour, micMinute, 0);

    const activeStart = new Date(now.getTime());
    activeStart.setHours(now.getHours() - 1); // Mic started up to 1 hour ago

    const activeEnd = new Date(now.getTime());
    activeEnd.setHours(now.getHours() + 2); // Mic starts up to 2 hours from now

    return micTime >= activeStart && micTime <= activeEnd;
}

function isMicOpenNow(mic) {
    const now = new Date();
    const today = now.getDay();
    const currentDayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][today];

    if (mic.day !== currentDayName) return 'closed';

    const { hour: micHour, minute: micMinute } = formatTime(mic.startTime);
    const micStartTime = new Date(now);
    micStartTime.setHours(micHour, micMinute, 0);

    // Assume mics run for configured duration
    const micEndTime = new Date(micStartTime);
    micEndTime.setHours(micEndTime.getHours() + MIC_TIMING.duration);

    const oneHourBefore = new Date(micStartTime);
    oneHourBefore.setHours(oneHourBefore.getHours() - MIC_TIMING.opensBefore);

    if (now >= micStartTime && now <= micEndTime) return 'open';
    if (now >= oneHourBefore && now < micStartTime) return 'soon';
    return 'closed';
}

// =============================================================================
// COST PARSING
// =============================================================================

function parseCost(costString) {
    if (!costString) return 0;
    const lower = costString.toLowerCase();
    if (lower === 'free' || lower.includes('free')) return 0;
    const match = costString.match(/\$(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

function matchesCostFilter(mic, filter) {
    if (!filter) return true;
    const cost = parseCost(mic.cost);
    switch (filter) {
        case 'free': return cost === 0;
        case 'under10': return cost > 0 && cost < 10;
        case '10-20': return cost >= 10 && cost <= 20;
        case 'over20': return cost > 20;
        default: return true;
    }
}

// =============================================================================
// FAVORITES
// =============================================================================

function toggleFavorite(micId) {
    const index = state.favorites.indexOf(micId);
    const mic = mockMics.find(m => m.id === micId);

    if (index > -1) {
        state.favorites.splice(index, 1);
        if (FEATURES.toastNotificationsEnabled) {
            showToast(`Removed from favorites`, 'info');
        }
    } else {
        state.favorites.push(micId);
        if (FEATURES.toastNotificationsEnabled) {
            showToast(`Added to favorites!`, 'success');
        }
    }

    saveToLocalStorage(STORAGE_KEYS.favorites, state.favorites);
    filterMics(); // Re-render to update UI
}

function isFavorite(micId) {
    return state.favorites.includes(micId);
}

// =============================================================================
// NEIGHBORHOODS
// =============================================================================

function populateNeighborhoods(borough) {
    const neighborhoods = borough ?
        [...new Set(mockMics.filter(m => m.borough === borough).map(m => m.neighborhood))].sort() :
        [];

    const neighborhoodFilter = document.getElementById(DOM_IDS.neighborhoodFilter);
    neighborhoodFilter.innerHTML = '<option value="">All Neighborhoods</option>';

    neighborhoods.forEach(n => {
        const option = document.createElement('option');
        option.value = n;
        option.textContent = n;
        neighborhoodFilter.appendChild(option);
    });
}

// =============================================================================
// TOP PICKS ALGORITHM
// =============================================================================

function calculateTopPicks(mics) {
    if (mics.length === 0 || !FEATURES.topPicksEnabled) return [];

    const scoredMics = mics.map(mic => {
        let score = 0;

        // Active mics get high priority
        if (isMicActive(mic)) {
            score += TOP_PICKS_CONFIG.scoreWeights.isActive;
        }

        // More comics = more popular
        score += (mic.comics || 0) * TOP_PICKS_CONFIG.scoreWeights.comics;

        // Closer is better (if we have user location)
        if (mic.distance !== null) {
            score += mic.distance * TOP_PICKS_CONFIG.scoreWeights.distance;
        }

        // Favored tags boost score
        if (mic.tags) {
            mic.tags.forEach(tag => {
                if (TOP_PICKS_CONFIG.favoredTags.includes(tag)) {
                    score += TOP_PICKS_CONFIG.scoreWeights.hasTag;
                }
            });
        }

        return { ...mic, score };
    });

    // Sort by score (descending)
    scoredMics.sort((a, b) => b.score - a.score);

    // Return top N
    return scoredMics.slice(0, Math.min(TOP_PICKS_CONFIG.count, scoredMics.length));
}

// =============================================================================
// TOAST NOTIFICATIONS
// =============================================================================

function showToast(message, type = 'success') {
    if (!FEATURES.toastNotificationsEnabled) return;

    // Create toast container if it doesn't exist
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'fixed bottom-20 right-4 z-[2000] space-y-2';
        document.body.appendChild(toastContainer);
    }

    // Create toast element
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-600' : type === 'error' ? 'bg-red-600' : 'bg-blue-600';
    toast.className = `${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2 transform transition-all duration-300 translate-x-[400px]`;

    const icon = type === 'success' ?
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` :
        `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    toast.innerHTML = `${icon}<span class="font-medium">${message}</span>`;
    toastContainer.appendChild(toast);

    // Slide in
    setTimeout(() => {
        toast.classList.remove('translate-x-[400px]');
        toast.classList.add('translate-x-0');
    }, 10);

    // Slide out and remove
    setTimeout(() => {
        toast.classList.remove('translate-x-0');
        toast.classList.add('translate-x-[400px]');
        setTimeout(() => toast.remove(), 300);
    }, DEFAULTS.toastDuration);
}

// =============================================================================
// DEBOUNCE
// =============================================================================

function debounce(func, delay) {
    return function(...args) {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = setTimeout(() => func.apply(this, args), delay);
    };
}
