// Plan My Night - Utility Functions

// --- FETCH WITH RETRY ---
async function fetchWithRetry(url, options = {}, retries = 2) {
    const timeout = options.timeout || 15000; // 15s default timeout

    for (let i = 0; i <= retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();

        } catch (error) {
            const isLastAttempt = i === retries;
            const isTimeout = error.name === 'AbortError';
            const isNetworkError = error.message.includes('Failed to fetch') ||
                                   error.message.includes('NetworkError');

            // Retry silently - user will see final error if all attempts fail

            if (isLastAttempt) {
                if (isTimeout) {
                    throw new Error('Request timed out. Please check your connection.');
                }
                if (isNetworkError) {
                    throw new Error('Network error. Please check your connection.');
                }
                throw error;
            }

            // Exponential backoff before retry
            const delay = Math.min(1000 * Math.pow(2, i), 5000);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

// Check if online
function isOnline() {
    return navigator.onLine;
}

// --- ACCESSIBILITY HELPERS ---

// Announce message to screen readers
function announceToScreenReader(message, priority = 'polite') {
    const announcer = document.getElementById('sr-announcer');
    if (!announcer) return;

    // Set priority and atomic for reliable announcement
    announcer.setAttribute('aria-live', priority);
    announcer.setAttribute('aria-atomic', 'true');

    // Use a more reliable announcement pattern:
    // 1. Temporarily hide from accessibility tree
    // 2. Update content
    // 3. Re-expose to trigger announcement
    announcer.setAttribute('aria-hidden', 'true');
    announcer.textContent = message;

    // Use requestAnimationFrame for smoother timing
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            announcer.removeAttribute('aria-hidden');
        });
    });
}

// Focus management helper
function trapFocus(container) {
    const focusableElements = container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    container.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;

        if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
        }
    });
}

// --- UI HELPERS ---
let toastTimeout = null;

function showToast(msg, type = 'info') {
    const t = document.getElementById('toast');

    // Clear any existing timeout
    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }

    // Build toast content with dismiss button
    t.innerHTML = `
        <span class="toast-message">${escapeHtml(msg)}</span>
        <button class="toast-dismiss" onclick="dismissToast()" aria-label="Dismiss notification">&times;</button>
    `;

    t.classList.remove('toast-success', 'toast-error');

    // Set appropriate aria-live based on type for accessibility
    // Errors should be announced immediately (assertive)
    // Success/info can be polite
    t.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

    if (type === 'success') t.classList.add('toast-success');
    if (type === 'error') t.classList.add('toast-error');
    t.classList.add('show');

    // Auto-dismiss after delay (longer for errors)
    const delay = type === 'error' ? 5000 : 3000;
    toastTimeout = setTimeout(() => dismissToast(), delay);
}

function dismissToast() {
    const t = document.getElementById('toast');
    t.classList.remove('show');
    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }
}

// Haptic feedback for button interactions (mobile)
function haptic(style = 'light') {
    if (navigator.vibrate) {
        const patterns = {
            light: 8,
            medium: 15,
            heavy: 25,
            success: [10, 50, 10],  // Double tap for success
            error: [30, 50, 30, 50, 30]  // Triple tap for error
        };
        navigator.vibrate(patterns[style] || patterns.light);
    }
}

// --- TIME UTILITIES ---
function timeToMins(str) {
    if (!str) return 0;
    const [t, amp] = str.split(' ');
    let [h, m] = t.split(':').map(Number);
    if (amp === 'PM' && h !== 12) h += 12;
    if (amp === 'AM' && h === 12) h = 0;
    return h * 60 + m;
}

function minsToTime(mins) {
    let h = Math.floor(mins / 60);
    let m = mins % 60;
    let am = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2, '0')} ${am}`;
}

// Always get fresh time
function getNow() {
    return new Date();
}

// Parse time string to Date object for today
function parseTime(timeStr) {
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return null;
    let hours = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const period = match[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    const d = new Date();
    d.setHours(hours, mins, 0, 0);
    return d;
}

// --- DISTANCE CALCULATIONS ---
// Returns distance in miles
function haversine(lat1, lon1, lat2, lon2) {
    const R = 3959; // miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- TRAVEL PREFERENCES ---
function getMaxWalkMinsFromUI() {
    // Default: 10 min walk threshold
    return 10;
}

function getWalkableMilesFromUI() {
    // ~20 min per mile walking = 0.5 miles for 10 min
    return 0.5;
}

function getTransitAccuracyFromUI() {
    // Always allow estimates as fallback
    return 'allow_estimates';
}

// Backwards compat alias (deprecated - use haversine)
function haversineDistance(lat1, lng1, lat2, lng2) {
    // Convert miles to km for legacy callers expecting km
    return haversine(lat1, lng1, lat2, lng2) * 1.60934;
}

// --- MIC DATA HELPERS ---
// Standardized access to venue name
function getVenueName(mic) {
    return mic.venueName || mic.venue || mic.name || 'Unknown Venue';
}

// Standardized access to cost (returns number)
function getMicCost(mic) {
    const cost = mic.cost ?? mic.price ?? 0;
    if (typeof cost === 'number') return cost;
    if (typeof cost === 'string') {
        if (cost.toLowerCase() === 'free') return 0;
        const num = parseFloat(cost.replace(/[^0-9.]/g, ''));
        return isNaN(num) ? 0 : num;
    }
    return 0;
}

// Check if mic is free
function isFree(mic) {
    return getMicCost(mic) === 0;
}

// --- STRING UTILITIES ---
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Highlight matching text in a string (XSS-safe)
function highlightMatch(text, query, className = 'font-bold') {
    if (!query || !text) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const q = query.toLowerCase();
    const idx = text.toLowerCase().indexOf(q);
    if (idx < 0) return escaped;

    // Find the actual position in escaped string (may differ due to entity encoding)
    const before = escapeHtml(text.slice(0, idx));
    const match = escapeHtml(text.slice(idx, idx + query.length));
    const after = escapeHtml(text.slice(idx + query.length));
    return `${before}<strong class="${className}">${match}</strong>${after}`;
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// --- EXTRACTION UTILITIES ---
function extractSignupUrl(signupText) {
    if (!signupText) return null;
    const fullUrlMatch = signupText.match(/(https?:\/\/[^\s]+)/);
    if (fullUrlMatch) return fullUrlMatch[1];
    const domainMatch = signupText.match(/(?:^|\s)((?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/i);
    if (domainMatch) return 'https://' + domainMatch[1];
    return null;
}

function extractSignupEmail(signupText) {
    if (!signupText) return null;
    const emailMatch = signupText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return emailMatch ? emailMatch[1] : null;
}

// --- STATUS UTILITIES ---
function getStatus(startDate) {
    const diffMins = startDate ? (startDate - getNow()) / 60000 : 999;
    if (diffMins > -90 && diffMins <= 0) return 'live';
    if (diffMins > 0 && diffMins <= 120) return 'upcoming';
    return 'future';
}

function detectSignupType(signupText) {
    if (!signupText) return { type: 'unknown', requiresAdvance: false };

    const text = signupText.toLowerCase();

    const advanceKeywords = [
        'email', 'dm ', '@', 'instagram', 'ig ', 'https://', 'http://',
        'slotted.co', 'jotform', 'google form', 'form goes up',
        'in advance', 'beforehand', 'day before', 'comment on'
    ];

    const requiresAdvance = advanceKeywords.some(keyword => text.includes(keyword));

    let type = 'unknown';
    if (text.includes('sign up in person') || text.includes('sign up at venue') || text.includes('sign up there')) {
        type = 'in-person';
    } else if (text.includes('email') || text.includes('@') && text.includes('.com')) {
        type = 'email';
    } else if (text.includes('dm ') || text.includes('instagram') || text.includes('ig ') || text.includes('@')) {
        type = 'instagram';
    } else if (text.includes('http')) {
        type = 'online';
    } else if (text.includes('sign up')) {
        type = 'in-person';
    }

    return { type, requiresAdvance };
}

// --- SUBWAY LINE HELPERS ---
function getLineColor(line) {
    return LINE_COLORS[line] || '#666';
}

function renderLineBadges(lines) {
    if (!lines || lines.length === 0) return '';
    return lines.slice(0, 5).map(line => {
        const color = getLineColor(line);
        const darkText = DARK_TEXT_LINES.includes(line) ? 'dark-text' : '';
        return `<span class="mic-line-badge ${darkText}" style="background:${color}">${line}</span>`;
    }).join('');
}

// --- AREA SUGGESTION ---
function suggestAreaFromOrigin(lat, lng) {
    // Simple bounding boxes for NYC boroughs
    if (lat > 40.7 && lat < 40.82 && lng > -74.02 && lng < -73.93) return 'Manhattan';
    if (lat > 40.57 && lat < 40.74 && lng > -74.04 && lng < -73.83) return 'Brooklyn';
    if (lat > 40.68 && lat < 40.81 && lng > -73.96 && lng < -73.7) return 'Queens';
    if (lat > 40.78 && lng > -73.93 && lng < -73.76) return 'Bronx';
    return null;
}

function showAreaSuggestion(text) {
    const el = document.getElementById('area-suggestion');
    if (text) {
        el.textContent = text;
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

// --- DURATION CALCULATION ---
// Calculate duration in minutes from start and end time inputs
function getDurationMins() {
    const startTime = document.getElementById('start-time')?.value || '19:00';
    const endTime = document.getElementById('end-time-select')?.value || '22:00';

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    let startMins = startH * 60 + startM;
    let endMins = endH * 60 + endM;

    // Handle crossing midnight (e.g., 10pm to 1am)
    if (endMins <= startMins) {
        endMins += 24 * 60;
    }

    return endMins - startMins;
}

// --- INPUT VALIDATION ---
function validateTimeInputs() {
    const startTimeInput = document.getElementById('start-time');
    const endTimeSelect = document.getElementById('end-time-select');

    if (!startTimeInput || !startTimeInput.value) {
        startTimeInput?.classList.add('error-shake');
        setTimeout(() => startTimeInput?.classList.remove('error-shake'), 400);
        return { valid: false, message: 'Please select a start time' };
    }

    const [startH, startM] = startTimeInput.value.split(':').map(Number);
    const startMins = startH * 60 + startM;
    const durationMins = getDurationMins();

    // Validate duration is reasonable
    if (durationMins < 60) {
        return {
            valid: false,
            message: 'Your time window is too short. Pick a later end time.'
        };
    }

    if (durationMins > 480) { // More than 8 hours
        return {
            valid: false,
            message: 'Your route would be very long. Try an earlier end time.'
        };
    }

    // Validate start time isn't in the past (for today's date)
    const daySelect = document.getElementById('day-select');
    const selectedDay = daySelect?.value;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];

    if (selectedDay === today) {
        const now = new Date();
        const currentMins = now.getHours() * 60 + now.getMinutes();
        if (startMins < currentMins - 30) { // Allow 30min grace
            return {
                valid: false,
                message: 'Start time has already passed. Pick a later time or different day.'
            };
        }
    }

    return { valid: true };
}

// --- NO RESULTS HELPERS ---
function showNoResultsWithContext(currentDay, foundCount, minMics) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDayIndex = days.indexOf(currentDay);
    const tomorrowIndex = (currentDayIndex + 1) % 7;
    const tomorrow = days[tomorrowIndex];

    // Update the "Try Tomorrow" button text
    const tomorrowText = document.getElementById('try-tomorrow-text');
    if (tomorrowText) {
        tomorrowText.textContent = `Try ${tomorrow}`;
    }

    // Count mics available tomorrow (if data is loaded)
    if (typeof allMics !== 'undefined' && allMics.length > 0) {
        const tomorrowMics = allMics.filter(m => m.day === tomorrow).length;
        if (tomorrowMics > 0) {
            const suggestionBox = document.getElementById('no-results-suggestion');
            const suggestionText = document.getElementById('suggestion-text');
            if (suggestionBox && suggestionText) {
                suggestionText.textContent = `💡 ${tomorrowMics} mic${tomorrowMics > 1 ? 's' : ''} available on ${tomorrow}!`;
                suggestionBox.classList.remove('hidden');
            }
        }
    }

    // Update detail text based on context
    const detailEl = document.getElementById('no-results-detail');
    if (detailEl) {
        if (foundCount > 0 && foundCount < minMics) {
            detailEl.textContent = `Found ${foundCount} mic${foundCount > 1 ? 's' : ''}, but you requested ${minMics} or more. Try loosening your filters.`;
        } else {
            detailEl.textContent = `No mics matched your filters for ${currentDay}. Try a different day or expand your search area.`;
        }
    }
}

// Reset filters and retry planning
function resetFiltersAndRetry() {
    haptic('medium');

    // Reset area filters
    if (typeof selectedAreas !== 'undefined') {
        selectedAreas.clear();
    }

    // Reset borough chips
    document.querySelectorAll('.borough-chip').forEach(chip => {
        chip.classList.remove('selected', 'expanded');
        chip.setAttribute('aria-pressed', 'false');
    });
    const allChip = document.getElementById('all-areas-chip');
    if (allChip) {
        allChip.classList.add('selected');
        allChip.setAttribute('aria-pressed', 'true');
    }

    // Hide neighborhood row
    const neighborhoodRow = document.getElementById('neighborhood-row');
    if (neighborhoodRow) neighborhoodRow.classList.add('hidden');

    // Reset checkboxes
    if (typeof updateAreaCheckboxes === 'function') updateAreaCheckboxes();

    // Reset price filter to "All"
    const priceAllRadio = document.querySelector('input[name="price"][value="all"]');
    if (priceAllRadio) {
        priceAllRadio.checked = true;
        priceAllRadio.closest('.radio-pill').classList.add('active');
        document.querySelectorAll('input[name="price"]').forEach(r => {
            if (r.value !== 'all') r.closest('.radio-pill').classList.remove('active');
        });
    }

    // Reset max commute to "Any"
    const commuteAllRadio = document.querySelector('input[name="max-commute"][value="999"]');
    if (commuteAllRadio) {
        commuteAllRadio.checked = true;
        commuteAllRadio.closest('.radio-pill').classList.add('active');
        document.querySelectorAll('input[name="max-commute"]').forEach(r => {
            if (r.value !== '999') r.closest('.radio-pill').classList.remove('active');
        });
    }

    // Reset signup filter to "All"
    const signupAllRadio = document.querySelector('input[name="signup"][value="all"]');
    if (signupAllRadio) {
        signupAllRadio.checked = true;
        signupAllRadio.closest('.radio-pill')?.classList.add('active');
        document.querySelectorAll('input[name="signup"]').forEach(r => {
            if (r.value !== 'all') r.closest('.radio-pill')?.classList.remove('active');
        });
    }

    // Reset priority
    document.querySelector('input[name="priority"][value="most_mics"]')?.closest('.radio-pill')?.click();

    // Reset time per venue
    document.querySelector('input[name="time-per-venue"][value="60"]')?.closest('.radio-pill')?.click();

    // Clear pinned anchors
    const anchorIds = ['anchor-start-id', 'anchor-must-id', 'anchor-end-id'];
    anchorIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // Hide no-results
    document.getElementById('no-results').classList.add('hidden');

    showToast('Filters reset! Try searching again.', 'success');

    if (typeof updateFilterCountBadge === 'function') {
        updateFilterCountBadge();
    }

    if (typeof savePlannerPrefs === 'function') {
        savePlannerPrefs();
    }

    // Focus on the submit button
    const btn = document.getElementById('plan-btn') || document.getElementById('plan-btn-desktop');
    if (btn) btn.focus();
}

// Try searching for the next day that has mics
function tryDifferentDay() {
    haptic('medium');

    const daySelect = document.getElementById('day-select');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentIndex = days.indexOf(daySelect.value);

    // Find next day that has mics (check up to 7 days)
    let nextDay = null;
    let nextDayMicCount = 0;
    for (let offset = 1; offset <= 7; offset++) {
        const checkIndex = (currentIndex + offset) % 7;
        const checkDay = days[checkIndex];
        const micCount = typeof allMics !== 'undefined'
            ? allMics.filter(m => m.day === checkDay).length
            : 0;

        if (micCount > 0) {
            nextDay = checkDay;
            nextDayMicCount = micCount;
            break;
        }
    }

    // Fall back to next calendar day if no mics found on any day
    if (!nextDay) {
        nextDay = days[(currentIndex + 1) % 7];
    }

    daySelect.value = nextDay;

    // Hide no-results
    document.getElementById('no-results').classList.add('hidden');

    // Update anchor options for new day
    if (typeof updateAnchorOptions === 'function') updateAnchorOptions();

    if (nextDayMicCount > 0) {
        showToast(`Switched to ${nextDay} (${nextDayMicCount} mics)`, 'success');
    } else {
        showToast(`Switched to ${nextDay}`, 'info');
    }

    // Auto-trigger search
    planMyNight();
}
