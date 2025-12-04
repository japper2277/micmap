# MicMap Bug Report
**Generated:** 2025-11-03
**Total Bugs Found:** 30

---

## Table of Contents
1. [Critical Bugs (4)](#critical-bugs)
2. [High Severity Bugs (5)](#high-severity-bugs)
3. [Medium Severity Bugs (10)](#medium-severity-bugs)
4. [Low Severity Bugs (11)](#low-severity-bugs)
5. [Summary & Fix Priority](#summary--fix-priority)

---

## Critical Bugs

Application-breaking issues that prevent core functionality from working properly.

### Bug #1: Missing Data Loading Logic
**File:** `js/app.js:410`
**Severity:** CRITICAL
**Status:** ✅ FIXED

**Description:**
The app initializes and calls `filterMics()` but never loads data from the API or Google Sheets. The `mockMics` array is used directly without any attempt to fetch real data.

**Impact:**
The application only shows mock/hardcoded data and never attempts to fetch live data from Google Sheets or the API. Users see stale information.

**Fix:**
```javascript
// After line 400 (after setupEventListeners), add:
async function loadInitialData() {
    try {
        // Try Google Sheets first
        if (typeof googleSheets !== 'undefined') {
            const sheetsData = await googleSheets.fetchFromSheets();
            if (sheetsData && sheetsData.length > 0) {
                mockMics = sheetsData;
                console.log('Loaded data from Google Sheets');
            }
        }
    } catch (error) {
        console.warn('Could not load from Google Sheets, using mock data:', error);
    }

    filterMics();
    updateViewToggle();
}

// Replace line 410 with:
loadInitialData();
```

---

### Bug #2: Undefined Function References (Null Safety)
**File:** `js/utils.js:32, 224`
**Severity:** CRITICAL
**Status:** ✅ FIXED

**Description:**
The `formatTime()` function uses regex without null checking, which will throw an error if the time format doesn't match the expected pattern.

**Impact:**
Will crash the app with uncaught TypeError: "Cannot read property 'slice' of null" if any mic has an unexpected time format.

**Current Code (Line 32):**
```javascript
const [hourStr, minuteStr, ampm] = timeString.match(/(\d+):(\d+) (AM|PM)/).slice(1);
```

**Fix:**
```javascript
const match = timeString.match(/(\d+):(\d+)\s*(AM|PM)/i);
if (!match) {
    console.warn(`Invalid time format: ${timeString}`);
    return { hour: 19, minute: 0 }; // Default to 7:00 PM
}
const [hourStr, minuteStr, ampm] = match.slice(1);
```

---

### Bug #3: Missing Papa Parse Dependency
**File:** `js/sheets-sync.js:402`
**Severity:** CRITICAL
**Status:** ✅ FIXED

**Description:**
The code references `Papa` (Papa Parse library) for CSV parsing but it's not included in `index.html`.

**Impact:**
CSV parsing will fail with "Papa is not defined" ReferenceError when trying to sync Google Sheets.

**Fix:**
Add to `index.html` before the closing `</body>` tag (line 208):
```html
<!-- Papa Parse for CSV parsing -->
<script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>

<!-- Load app scripts -->
<script src="js/config.js"></script>
```

---

### Bug #4: Exposed Google Sheets API Key
**File:** `js/sheets-sync.js:21`
**Severity:** CRITICAL (Security)
**Status:** ⚠️ PARTIALLY FIXED (warnings added, should move to backend)

**Description:**
Google Sheets API key is hardcoded in the client-side JavaScript: `'AIzaSyBL_zeouBAs0g43BirfK4YIz6mfjYpraP8'`

**Impact:**
API key can be stolen and abused by viewing page source, potentially leading to quota exhaustion, data theft, or security breach. Anyone can use this key for their own purposes.

**Fix:**
**Option 1 (Recommended):** Move API calls to backend server
- Create a backend endpoint (e.g., `/api/mics`)
- Backend fetches from Google Sheets using a server-side API key
- Frontend calls your backend, not Google Sheets directly

**Option 2 (Quick Fix):** Use API Key Restrictions
- Go to Google Cloud Console
- Add HTTP referrer restrictions (only allow your domain)
- Enable only Google Sheets API
- Note: This is less secure than Option 1

---

## High Severity Bugs

Major functionality issues that significantly impact user experience.

### Bug #5: Map Not Resizing on Window Resize
**File:** `js/app.js:284`
**Severity:** HIGH
**Status:** ✅ FIXED

**Description:**
`map.invalidateSize()` is called but the Leaflet `map` variable is defined in the global scope of `map.js`, not `app.js`. The variable may not be accessible.

**Impact:**
Map may not resize properly when the window is resized, causing visual glitches, cut-off markers, or misaligned overlays.

**Fix:**
In `map.js`, export the map variable:
```javascript
// Add after map initialization (around line 10)
window.mapInstance = map;
```

In `app.js` (line 284), update the resize handler:
```javascript
window.addEventListener('resize', () => {
    if (window.mapInstance) {
        window.mapInstance.invalidateSize();
    }
});
```

---

### Bug #6: Incorrect Time Filter Logic
**File:** `js/ui.js:268-278`
**Severity:** HIGH
**Status:** ❌ Not Fixed

**Description:**
Time filter ranges don't match config correctly. Config says afternoon is 12-17, but the code filters `12 <= hour && hour <= 17` which includes 5:00 PM (hour 17). This creates an overlap with evening.

**Impact:**
5:00 PM mics appear in both afternoon AND evening filters, causing confusion. The filters should be mutually exclusive.

**Current Code (Line 270-271):**
```javascript
if (time === 'afternoon') {
    return hour >= 12 && hour <= 17;
```

**Fix:**
```javascript
if (time === 'afternoon') {
    return hour >= 12 && hour < 17; // Exclude 5 PM
```

---

### Bug #7: Filter Badge Element Missing
**File:** `js/ui.js:441`
**Severity:** HIGH
**Status:** ✅ FIXED

**Description:**
Code references `document.getElementById('filter-badge')` but this element doesn't exist in `index.html`.

**Impact:**
Filter badge count won't display, causing silent failure. Users won't see how many active filters they have.

**Fix:**
Add to `index.html` near line 56-60 (in the results counter section):
```html
<div id="results-counter" class="mt-3 px-3 py-1.5 bg-[var(--surface-light)] rounded-lg inline-block">
    <span class="text-xs font-semibold text-[var(--text-tertiary)]">
        <span id="results-count" class="text-[var(--brand-blue)] font-bold">0</span> mics found
        <span id="filter-badge" class="ml-2 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full hidden"></span>
    </span>
</div>
```

---

### Bug #8: Invalid SVG in CSS for Map Markers
**File:** `css/styles.css:246, 257, 278, 300`
**Severity:** HIGH
**Status:** ❌ Not Fixed

**Description:**
SVG data URIs use CSS custom properties like `var(--brand-blue)`. CSS variables don't work inside data URIs because they're treated as static strings.

**Impact:**
Map markers may not display correct colors or may not appear at all in certain browsers.

**Fix:**
Replace CSS variables with actual hex color values. Example (line 246):

**Current:**
```css
background-image: url('data:image/svg+xml;utf8,<svg ...><circle fill="var(--brand-blue)"></circle></svg>');
```

**Fixed:**
```css
background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="8" fill="%232563eb" stroke="white" stroke-width="2"/></svg>');
```

Note: Use URL encoding for `#` → `%23`

---

### Bug #9: Mobile Panel Drag Height Initialization
**File:** `js/app.js:403-407`
**Severity:** HIGH
**Status:** ❌ Not Fixed

**Description:**
Panel height is initialized on load, but mobile viewport height can change (e.g., when address bar hides/shows on scroll). Initial height might be wrong.

**Impact:**
On mobile, the panel may not start at the correct height, especially on iOS Safari where the viewport changes dynamically.

**Fix:**
```javascript
// Replace lines 403-407 with:
function initializeMobilePanel() {
    if (window.innerWidth < 1024) {
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        dom.leftPanel.style.height = `${viewportHeight * 0.25}px`;
    }
}

// Call on load and orientation change
initializeMobilePanel();
window.addEventListener('orientationchange', () => {
    setTimeout(initializeMobilePanel, 100);
});
```

---

## Medium Severity Bugs

Moderate functionality issues that affect usability but don't break core features.

### Bug #10: Missing Favicon
**File:** `index.html`
**Severity:** MEDIUM
**Status:** ❌ Not Fixed

**Description:**
No favicon defined in HTML `<head>` section.

**Impact:**
Browser shows default icon, making the site look unprofessional. Poor branding in browser tabs and bookmarks.

**Fix:**
Add to `<head>` section (after line 7):
```html
<link rel="icon" href="favicon.ico" type="image/x-icon">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png">
```

Then create favicon files in the root directory.

---

### Bug #11: Incorrect Filter Chip Removal
**File:** `js/ui.js:418`
**Severity:** MEDIUM
**Status:** ❌ Not Fixed

**Description:**
Filter chips use inline `onclick` with function serialization: `onclick="(${chip.remove})()"`, which won't work because you can't serialize function references into strings.

**Impact:**
Clicking "X" on filter chips to remove them won't work. Users have to use the main filter controls.

**Fix:**
The code already handles this correctly on lines 429-433 with proper event listeners. Remove the inline onclick:

```javascript
// Line 418 - Remove onclick attribute:
return `
    <div class="filter-chip" data-filter-type="${chip.type}">
        <span>${chip.label}</span>
        <button class="remove-filter-chip" aria-label="Remove filter">×</button>
    </div>
`;
```

---

### Bug #12: Poor Geolocation Error Handling
**File:** `js/app.js:69-72`
**Severity:** MEDIUM
**Status:** ❌ Not Fixed

**Description:**
Geolocation error shows a basic `alert()`, which is intrusive and not user-friendly.

**Impact:**
Poor UX when geolocation fails. Alert blocks the entire page and looks unprofessional.

**Fix:**
```javascript
// Replace lines 69-72 with:
function showLocationError(error) {
    const messages = {
        1: 'Location access denied. Please enable location services.',
        2: 'Location unavailable. Please try again.',
        3: 'Location request timed out. Please try again.'
    };

    // Show toast notification instead
    showToast(messages[error.code] || 'Could not get your location', 'error');
}

navigator.geolocation.getCurrentPosition(
    handleNearMeSuccess,
    showLocationError
);
```

---

### Bug #13: Empty Address in Mock Data
**File:** `js/data.js:172`
**Severity:** MEDIUM
**Status:** ❌ Not Fixed

**Description:**
"The Tiny Cupboard" mic (line 172) has an empty `address` field.

**Impact:**
Can't generate Google Maps directions link properly. Map marker might not appear or be geocoded incorrectly.

**Fix:**
Add the correct address:
```javascript
{
    name: "The Tiny Cupboard",
    address: "123 Example St, Brooklyn, NY 11201", // Add real address
    neighborhood: "Brooklyn Heights",
    // ... rest of data
}
```

Or handle empty addresses gracefully in the UI:
```javascript
// In ui.js, check before generating directions link:
const directionsLink = mic.address && mic.address.trim()
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mic.address)}`
    : '#';
```

---

### Bug #14: Inconsistent Day Validation
**File:** `js/sheets-sync.js:459`
**Severity:** MEDIUM
**Status:** ❌ Not Fixed

**Description:**
Valid days array uses lowercase, but comparison doesn't normalize the input. If Google Sheets has "Monday" instead of "monday", the row will be skipped.

**Impact:**
Data inconsistency. Valid rows might be rejected due to case sensitivity.

**Fix:**
```javascript
// Line 459, normalize to lowercase:
const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const day = row.day ? row.day.toLowerCase().trim() : '';

if (!day || !validDays.includes(day)) {
    console.warn(`Invalid day: ${row.day}`);
    return null;
}
```

---

### Bug #15: Cost Badge Positioning Issue
**File:** `js/ui.js:36`
**Severity:** MEDIUM
**Status:** ❌ Not Fixed

**Description:**
Cost badge is placed inside sign-up HTML string, but for in-person type (default case), it's concatenated incorrectly, causing layout issues.

**Impact:**
Cost appears in wrong position for in-person sign-ups, breaking the visual layout of mic cards.

**Fix:**
Restructure to consistently place cost badge (lines 25-50):
```javascript
function getSignUpHTML(mic) {
    const costBadge = mic.cost !== undefined
        ? `<span class="text-xs font-semibold ${getCostColor(mic.cost)}">$${mic.cost}</span>`
        : '<span class="text-xs font-semibold text-gray-500">Free</span>';

    if (mic.signUpType === 'first-come') {
        return `<span class="text-xs text-[var(--text-secondary)]">First come, first served ${costBadge}</span>`;
    }
    // ... handle other types similarly
}
```

---

### Bug #16: No Environment Configuration
**File:** `js/config.js` and `js/api.js`
**Severity:** MEDIUM
**Status:** ❌ Not Fixed

**Description:**
No environment variable support (dev vs. production). API URLs and configs are hardcoded.

**Impact:**
Hardcoded URLs make deployment difficult. Need to manually change code for production.

**Fix:**
Add environment detection in `config.js`:
```javascript
const ENV = {
    isDevelopment: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    apiBaseURL: window.location.hostname === 'localhost'
        ? 'http://localhost:3001/api/v1'
        : 'https://api.micmap.com/api/v1',
    enableDebugLogs: window.location.hostname === 'localhost'
};

export default ENV;
```

---

### Bug #17: Unused JavaScript Files
**File:** `api.js`, `geocoding.js`, `venue-addresses.js`
**Severity:** MEDIUM
**Status:** ❌ Not Fixed

**Description:**
Several JS files exist in the `js/` directory but aren't imported in `index.html`.

**Impact:**
Dead code creates confusion about which files are actually being used. Increases maintenance burden.

**Fix:**
Either:
1. Import them if they're needed: Add `<script src="js/api.js"></script>` before `app.js`
2. Or remove them if they're not needed
3. Or add a comment in `index.html` explaining why they're not loaded

---

### Bug #18: Global Variable Pollution
**File:** Multiple files (`map.js`, `app.js`, `ui.js`)
**Severity:** MEDIUM
**Status:** ❌ Not Fixed

**Description:**
Many variables declared in global scope (map, markers, dom, state, etc.).

**Impact:**
Namespace collision risk. Hard to debug. Could conflict with external libraries.

**Fix:**
Wrap in IIFE or use modules:
```javascript
// In app.js:
(function() {
    'use strict';

    // All your app code here
    const dom = { ... };
    const state = { ... };

    // Only expose what's necessary
    window.MicMapApp = {
        init: init,
        filterMics: filterMics
    };
})();
```

---

### Bug #19: No Global Error Handler
**File:** None (missing feature)
**Severity:** MEDIUM
**Status:** ❌ Not Fixed

**Description:**
No global error handler to catch unhandled promise rejections or runtime errors.

**Impact:**
App crashes silently on errors. Users see blank screen with no explanation.

**Fix:**
Add to `app.js` initialization:
```javascript
// Global error handlers
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    showToast('Something went wrong. Please refresh the page.', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('Something went wrong. Please refresh the page.', 'error');
});
```

---

### Bug #20: Missing Loading State
**File:** `js/app.js:410`
**Severity:** MEDIUM
**Status:** ❌ Not Fixed

**Description:**
No loading indicator shown while fetching data from API or Google Sheets.

**Impact:**
Users see blank screen during data load, creating confusion about whether the app is working.

**Fix:**
```javascript
async function loadInitialData() {
    showLoadingState(); // Add this

    try {
        if (typeof googleSheets !== 'undefined') {
            const sheetsData = await googleSheets.fetchFromSheets();
            if (sheetsData && sheetsData.length > 0) {
                mockMics = sheetsData;
            }
        }
    } catch (error) {
        console.warn('Could not load data:', error);
    } finally {
        hideLoadingState(); // Add this
    }

    filterMics();
}
```

---

## Low Severity Bugs

Minor issues and edge cases that have minimal impact on functionality.

### Bug #21: Console Logs in Production
**Files:** Multiple files throughout codebase
**Severity:** LOW
**Status:** ❌ Not Fixed

**Description:**
Extensive `console.log()` statements throughout production code.

**Impact:**
Performance overhead, information leakage in production, cluttered console.

**Fix:**
Wrap in environment check:
```javascript
const DEBUG = window.location.hostname === 'localhost';

function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

// Replace console.log with debugLog throughout
```

---

### Bug #22: Missing SEO Meta Tags
**File:** `index.html`
**Severity:** LOW
**Status:** ❌ Not Fixed

**Description:**
Missing Open Graph and Twitter Card meta tags for social sharing.

**Impact:**
Poor social media link previews when sharing the site.

**Fix:**
Add to `<head>` section:
```html
<!-- Open Graph -->
<meta property="og:title" content="MicMap - NYC Comedy Open Mics">
<meta property="og:description" content="Find comedy open mics near you in NYC. Filter by day, time, borough, and more.">
<meta property="og:image" content="https://yourdomain.com/og-image.png">
<meta property="og:url" content="https://yourdomain.com">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="MicMap - NYC Comedy Open Mics">
<meta name="twitter:description" content="Find comedy open mics near you in NYC">
<meta name="twitter:image" content="https://yourdomain.com/twitter-image.png">
```

---

### Bug #23: Hardcoded NYC Coordinates with Random Offset
**File:** `js/api.js:158-159`
**Severity:** LOW
**Status:** ❌ Not Fixed

**Description:**
Fallback coordinates add random offset (`Math.random() * 0.01`), which could place markers in water or outside NYC.

**Impact:**
Inaccurate map markers for venues without proper geocoding.

**Fix:**
Use borough centroids as fallback:
```javascript
const boroughCentroids = {
    'Manhattan': [40.7831, -73.9712],
    'Brooklyn': [40.6782, -73.9442],
    'Queens': [40.7282, -73.7949],
    'Bronx': [40.8448, -73.8648],
    'Staten Island': [40.5795, -74.1502]
};

function getFallbackCoords(borough) {
    return boroughCentroids[borough] || [40.7589, -73.9851]; // NYC center
}
```

---

### Bug #24: No HTTPS Enforcement
**File:** `js/api.js:7`
**Severity:** LOW
**Status:** ❌ Not Fixed

**Description:**
API baseURL uses `http://` instead of `https://`.

**Impact:**
Mixed content warnings in production if site is served over HTTPS. Security risk.

**Fix:**
```javascript
// Line 7:
const baseURL = 'https://localhost:3001/api/v1';

// Or better, use relative URLs:
const baseURL = '/api/v1';
```

---

### Bug #25: Missing Alt Text on SVG Icons
**File:** `index.html`
**Severity:** LOW
**Status:** ❌ Not Fixed

**Description:**
SVG icons used throughout UI have no `aria-label` or `role` attributes.

**Impact:**
Poor accessibility for screen readers. Fails WCAG compliance.

**Fix:**
Add accessibility attributes to all SVGs:
```html
<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Search icon" ...>
    <circle cx="11" cy="11" r="8"></circle>
    <path d="m21 21-4.35-4.35"></path>
</svg>
```

---

### Bug #26: Empty Lines in Data Structure
**File:** `js/data.js:11, 42, 73`
**Severity:** LOW
**Status:** ❌ Not Fixed

**Description:**
Empty lines after `startTime` field suggest missing data (endTime?).

**Impact:**
Data structure unclear, potential for future bugs if field is expected but missing.

**Fix:**
Either document the empty line or add the missing field:
```javascript
{
    name: "Mic Name",
    startTime: "7:00 PM",
    // endTime: "9:00 PM", // Uncomment if needed
    address: "123 Example St",
}
```

---

### Bug #27: Magic Numbers in Code
**Files:** `app.js:312, 322, 355`
**Severity:** LOW
**Status:** ❌ Not Fixed

**Description:**
Hardcoded values like `0.25`, `0.9`, `20` in panel drag handler without explanation.

**Impact:**
Hard to maintain and understand what these numbers represent.

**Fix:**
Extract to named constants:
```javascript
const PANEL_CONFIG = {
    MIN_HEIGHT_RATIO: 0.25,
    MAX_HEIGHT_RATIO: 0.9,
    DRAG_THRESHOLD: 20,
    SNAP_VELOCITY: 0.3
};

// Use in code:
if (dragVelocity < -PANEL_CONFIG.SNAP_VELOCITY) {
    // ...
}
```

---

### Bug #28: No Input Validation
**File:** `js/app.js:13`
**Severity:** LOW
**Status:** ❌ Not Fixed

**Description:**
Search input has no sanitization or validation before using in filter.

**Impact:**
Potential XSS if mic data comes from untrusted source. Could also cause regex errors with special characters.

**Fix:**
```javascript
function sanitizeSearchQuery(query) {
    // Remove potentially dangerous characters
    return query.replace(/[<>]/g, '').trim();
}

dom.searchInput.addEventListener('input', (e) => {
    state.searchQuery = sanitizeSearchQuery(e.target.value.toLowerCase());
    filterMics();
});
```

---

### Bug #29: Silent API Fallback
**File:** `js/api.js:73`
**Severity:** LOW
**Status:** ❌ Not Fixed

**Description:**
Fallback to `mockMics` happens silently without user notification when API fails.

**Impact:**
Users don't know they're viewing stale data. Could be confused why new mics aren't showing.

**Fix:**
```javascript
catch (error) {
    console.error('Error fetching mics:', error);
    showToast('Using cached data. Some mics may be outdated.', 'warning');
    return mockMics;
}
```

---

### Bug #30: No Type Definitions
**Files:** Multiple files
**Severity:** LOW
**Status:** ❌ Not Fixed

**Description:**
No JSDoc comments on most functions describing parameters and return values.

**Impact:**
Hard to understand expected parameters and return values. Makes maintenance difficult.

**Fix:**
Add JSDoc comments:
```javascript
/**
 * Filters mics based on current state
 * @param {Array<Object>} mics - Array of mic objects
 * @param {Object} filters - Filter criteria
 * @returns {Array<Object>} Filtered array of mics
 */
function filterMics(mics, filters) {
    // ...
}
```

---

## Summary & Fix Priority

### Bugs by Severity
- **Critical:** 4 bugs (13%)
- **High:** 5 bugs (17%)
- **Medium:** 10 bugs (33%)
- **Low:** 11 bugs (37%)

### Recommended Fix Order

#### Must Fix (Blocks Launch)
1. Bug #1: Add data loading logic
2. Bug #2: Remove exposed API key
3. Bug #3: Add Papa Parse dependency
4. Bug #4: Fix formatTime() null checking

#### Should Fix (Before Production)
5. Bug #7: Add filter badge element
6. Bug #8: Fix SVG marker colors
7. Bug #6: Fix time filter logic
8. Bug #5: Fix map resize
9. Bug #12: Improve error handling
10. Bug #19: Add global error handler

#### Nice to Fix (Improves UX)
11. Bug #10: Add favicon
12. Bug #13: Fix empty addresses
13. Bug #20: Add loading state
14. Bug #16: Add environment config
15. Bug #22: Add SEO meta tags

#### Can Fix Later (Low Impact)
16-30. All remaining low severity bugs

### Testing Checklist

After fixing bugs, test:
- ✅ App loads without console errors
- ✅ Data loads from Google Sheets
- ✅ Search and filters work
- ✅ Map displays correctly with markers
- ✅ Map markers are the correct color
- ✅ Mobile panel dragging works
- ✅ Time filters don't overlap
- ✅ Filter badges display correctly
- ✅ Geolocation works
- ✅ No exposed API keys in source

---

**End of Bug Report**
