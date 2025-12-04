# MicMap Architecture Documentation

## Table of Contents
1. [Overview](#overview)
2. [File Structure](#file-structure)
3. [Quick Start Guide](#quick-start-guide)
4. [Adding a New Mic](#adding-a-new-mic)
5. [Customization Guide](#customization-guide)
6. [Code Organization](#code-organization)
7. [Feature Toggles](#feature-toggles)
8. [How Filtering Works](#how-filtering-works)
9. [State Management](#state-management)
10. [Troubleshooting](#troubleshooting)

---

## Overview

MicMap is a comedy open mic finder web application for NYC. It helps comedians discover open mics near them with advanced filtering by day, time, borough, neighborhood, cost, and favorites.

**Tech Stack:**
- **Vanilla JavaScript** - No frameworks, pure JS
- **Leaflet.js** - Interactive maps with marker clustering
- **Tailwind CSS** - Utility-first CSS framework
- **localStorage** - Persistent favorites and search history

**Key Features:**
- 📍 Interactive map with custom markers
- 🔍 Real-time search with debouncing
- 📅 Filter by day, time, borough, neighborhood, cost
- ⭐ Favorites system with localStorage
- 🏆 Top Picks algorithm
- 📱 Fully responsive (mobile & desktop)
- 🔔 Toast notifications
- 🗺️ User location detection

---

## File Structure

```
micmap/
│
├── index.html              # Main HTML file (loads all scripts)
│
├── css/
│   └── styles.css          # Custom styles (CSS variables, markers, animations)
│
├── js/
│   ├── config.js           # All configuration constants
│   ├── data.js             # Mic data (20 NYC venues)
│   ├── state.js            # Global state management
│   ├── utils.js            # Helper functions (distance, time, favorites, etc.)
│   ├── ui.js               # Rendering & filtering logic
│   ├── map.js              # Leaflet map initialization & markers
│   └── app.js              # Event handlers & app initialization
│
├── ARCHITECTURE.md         # This file
└── new.html                # Original single-file version (deprecated)
```

**Load Order (Important!):**
Scripts must be loaded in this exact order:
1. `config.js` - Constants used by all other files
2. `data.js` - Mic data
3. `state.js` - State object (depends on config and data)
4. `utils.js` - Helper functions
5. `ui.js` - Rendering functions (depends on utils)
6. `map.js` - Map logic (depends on config and utils)
7. `app.js` - Initialization (depends on all above)

---

## Quick Start Guide

### Running Locally

1. **Download the project** or clone the repository
2. **Open `index.html` in a browser**
   - You can simply double-click `index.html`
   - Or use a local server: `python -m http.server 8000`
3. **Done!** The app should load with 20 NYC comedy mics

### Testing Features

- **Search:** Type "tough crowd" or "greenwich village"
- **Near Me:** Click "Near Me" button (allow location access)
- **Filters:** Try filtering by "Monday" + "Evening"
- **Favorites:** Click the heart icon on any mic card
- **Top Picks:** Mics with high "heat" (comics count) appear at the top

---

## Adding a New Mic

### Step-by-Step Guide

1. **Open `js/data.js`**

2. **Find the correct day section** (e.g., `MONDAY MICS`, `TUESDAY MICS`)

3. **Copy an existing mic object** as a template

4. **Fill in the details:**

```javascript
{
    id: 21,  // ⚠️ MUST BE UNIQUE! Use next available number
    name: "Funny Bone Comedy Club",
    day: "Tuesday",  // Must match: Monday, Tuesday, Wednesday, etc.
    startTime: "8:00 PM",  // Format: "H:MM AM/PM"
    borough: "Brooklyn",  // Manhattan, Brooklyn, Queens, Bronx, Staten Island
    neighborhood: "Williamsburg",
    lat: 40.7081,  // Get from Google Maps
    lon: -73.9571,
    signUpDetails: {
        // Choose ONE of these three types:

        // Option 1: Online sign-up
        type: 'url',
        value: 'https://example.com/signup'

        // Option 2: Email sign-up
        // type: 'email',
        // value: 'host@example.com'

        // Option 3: In-person sign-up
        // type: 'in-person',
        // value: 'Sign up at the bar starting at 7:30 PM'
    },
    cost: "Free",  // "Free", "$5", "$10", etc.
    host: "Jane Doe",
    stageTime: "5 min",  // Optional: "3 min", "5 min", "7 min"
    comics: 8,  // Starting "heat" number (will increase with check-ins)
    tags: ["Supportive", "Good Sound"],  // Choose from existing tags or create new ones
    environment: "Public Venue",  // "Public Venue", "Private Space", "Bar"
    lastUpdated: "2025-01-15"  // Today's date YYYY-MM-DD
}
```

5. **Add comma after previous mic** (if not last in array)

6. **Get coordinates (lat/lon):**
   - Go to [Google Maps](https://maps.google.com)
   - Right-click on the venue location
   - Click the coordinates (e.g., "40.7303, -74.0022")
   - Copy the latitude (first number) and longitude (second number)

7. **Save the file** and refresh your browser

### Common Tags
- "Tough Crowd" - Challenging audience
- "Supportive" - Friendly, encouraging crowd
- "Long Sets" - 5+ minute stage time
- "Variety Show" - Mixed entertainment (comedy + music/etc.)
- "Good Sound" - Quality microphone/sound system
- "Outdoor" - Outdoor venue
- "Bar Show" - Takes place in a bar
- "Late Night" - Starts after 10 PM

---

## Customization Guide

### Changing Colors

**File:** `css/styles.css` (lines 8-22)

```css
:root {
    --brand-blue: #5C6BC0;         /* Main brand color */
    --brand-blue-hover: #455A80;   /* Hover state */
    --background-dark: #1A1A2E;    /* Page background */
    --surface-light: #3A3A50;      /* Card backgrounds */
    --surface-medium: #2C2C40;     /* Panel background */
    --text-primary: #E0E0E0;       /* Main text color */
    --text-secondary: #B0B0C0;     /* Secondary text */
    --text-tertiary: #808090;      /* Tertiary text */
    --border-color: #4A4A60;       /* Border color */
    --top-pick-gold: #FFD700;      /* Top pick badge */
    --top-pick-glow: #FFEA00;      /* Top pick glow effect */
    --success-green: #66BB6A;      /* Success messages */
    --warning-orange: #FFA726;     /* Warning/heat indicator */
}
```

**To change the theme:**
1. Edit these color values
2. Use a color picker: [Coolors.co](https://coolors.co)
3. Save and refresh

### Changing Default Settings

**File:** `js/config.js` (lines 17-25)

```javascript
const DEFAULTS = {
    selectedTime: 'evening',           // Default time filter: 'all', 'afternoon', 'evening'
    mapZoom: 13,                       // Default map zoom level (1-18)
    userLocationZoom: 14,              // Zoom when user clicks "Near Me"
    searchHistoryLimit: 5,             // Max saved searches
    toastDuration: 3000,               // Toast notification duration (ms)
    debounceDelay: 300,                // Search input debounce delay (ms)
    panelHeightMobile: 0.25            // Initial mobile panel height (25% of screen)
};
```

### Changing Map Settings

**File:** `js/config.js` (lines 27-42)

```javascript
const MAP_CONFIG = {
    defaultCenter: [40.7128, -74.0060],  // NYC coordinates [lat, lon]
    defaultZoom: 12,                      // Starting zoom level
    tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    tileAttribution: '© OpenStreetMap contributors',
    markerClusterOptions: {
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        maxClusterRadius: 50               // Smaller = less clustering
    }
};
```

**To use a different map style:**
Replace `tileLayer` URL. Popular options:
- **Dark Mode:** `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`
- **Light Mode:** `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
- **Satellite:** Requires Mapbox API key

### Changing Mic Open Time Logic

**File:** `js/config.js` (lines 44-47)

```javascript
const MIC_TIMING = {
    opensBefore: 1,  // Mic shows "Opens Soon" badge 1 hour before start
    duration: 3      // Assume mic runs for 3 hours, shows "Open Now" during this time
};
```

---

## Code Organization

### `js/config.js` - Configuration
**Purpose:** Central place for all constants and configuration
**Key Exports:**
- `COLORS` - Color palette
- `DEFAULTS` - Default settings
- `MAP_CONFIG` - Map configuration
- `FEATURES` - Feature toggles
- `DOM_IDS` - HTML element IDs
- `STORAGE_KEYS` - localStorage keys
- `FILTER_OPTIONS` - Filter dropdown options
- `TOP_PICKS_CONFIG` - Top picks algorithm settings

### `js/data.js` - Mic Data
**Purpose:** All mic venue data organized by day
**Key Export:**
- `mockMics` - Array of 20 mic objects

**Mic Object Structure:**
```javascript
{
    id: 1,                  // Unique identifier
    name: "Venue Name",
    day: "Monday",
    startTime: "9:00 PM",
    borough: "Manhattan",
    neighborhood: "Greenwich Village",
    lat: 40.7303,           // Latitude
    lon: -74.0022,          // Longitude
    signUpDetails: {
        type: 'url',        // 'url', 'email', or 'in-person'
        value: 'https://...'
    },
    cost: "$5",
    host: "Host Name",
    stageTime: "4 min",
    comics: 12,             // "Heat" indicator
    tags: ["Tag1", "Tag2"],
    environment: "Public Venue",
    lastUpdated: "2024-10-19"
}
```

### `js/state.js` - State Management
**Purpose:** Global application state with localStorage persistence
**Key Export:**
- `state` - Global state object

**State Properties:**
```javascript
state = {
    // Map & Location
    currentPosition: null,              // [lat, lon] or null
    userLocationMarker: null,           // Leaflet marker object

    // Filters
    searchQuery: '',
    selectedDay: '',
    selectedTime: 'evening',
    selectedBorough: '',
    selectedNeighborhood: '',
    selectedCost: '',
    favoritesOnly: false,

    // Persistence (localStorage)
    favorites: [],                      // Array of mic IDs
    searchHistory: [],                  // Array of search strings

    // UI State
    mics: [],                           // Currently filtered mics
    topPicks: [],                       // Top picks based on algorithm
    view: 'list' or 'map',             // Mobile view state
    hoveredMicId: null,                 // Currently hovered mic
    isPanelDragging: false,             // Mobile panel drag state
    lastPanelHeight: number,            // Last mobile panel height
    debounceTimer: null                 // Search debounce timer
}
```

### `js/utils.js` - Helper Functions
**Purpose:** Reusable utility functions
**Key Functions:**
- `getDistanceFromLatLonInKm()` - Calculate distance between coordinates
- `formatTime()` - Parse time strings (e.g., "9:00 PM")
- `isMicActive()` - Check if mic is currently active
- `isMicOpenNow()` - Returns 'open', 'soon', or 'closed'
- `parseCost()` - Parse cost strings (e.g., "$5" → 5)
- `matchesCostFilter()` - Check if mic matches cost filter
- `toggleFavorite()` - Add/remove favorite
- `isFavorite()` - Check if mic is favorited
- `addToSearchHistory()` - Add search to history
- `populateNeighborhoods()` - Populate neighborhood dropdown
- `calculateTopPicks()` - Top picks scoring algorithm
- `showToast()` - Display toast notification
- `debounce()` - Debounce function wrapper

### `js/ui.js` - Rendering & Filtering
**Purpose:** DOM manipulation and mic filtering
**Key Functions:**
- `createMicCard(mic, isTopPick)` - Generate mic card HTML
- `renderMics(micsArray)` - Render mic cards to list
- `filterMics()` - Apply all filters and re-render
- `updateCurrentTimeDisplay()` - Update page title with current time

### `js/map.js` - Map Logic
**Purpose:** Leaflet map initialization and marker management
**Key Functions:**
- `initMap()` - Initialize Leaflet map
- `createMapPopup(mic)` - Generate popup HTML for marker
- `updateMapMarkers()` - Update all markers on map

**Marker Types:**
- `default` - Standard blue marker
- `topPick` - Gold star marker (animated)
- `highlight` - Enlarged blue marker (when hovered)

### `js/app.js` - Event Handlers & Initialization
**Purpose:** Wire up event listeners and start the app
**Key Functions:**
- `handleLocationSearch()` - Search input handler
- `handleDayFilterChange()` - Day filter handler
- `handleTimeFilterClick()` - Time filter button handler
- `handleNearMeClick()` - Geolocation handler
- `handleBoroughChange()` - Borough filter handler
- `handleNeighborhoodChange()` - Neighborhood filter handler
- `handleCostFilterChange()` - Cost filter handler
- `handleFavoritesOnlyChange()` - Favorites checkbox handler
- `handleClearFilters()` - Clear all filters handler
- `handleMicCardHover()` - Card hover handler (highlights map marker)
- `handleCheckInClick()` - Check-in button handler
- `setupEventListeners()` - Attach all event listeners
- `setupPanelDragHandler()` - Mobile panel drag functionality
- `updateViewToggle()` - Update mobile view toggle state

**Initialization Sequence (DOMContentLoaded):**
1. Initialize DOM references
2. Initialize Leaflet map
3. Update current time display
4. Setup all event listeners
5. Set initial mobile panel state
6. Run initial filter/render
7. Update view toggle state

---

## Feature Toggles

Want to disable a feature? Edit `js/config.js` (lines 49-56):

```javascript
const FEATURES = {
    topPicksEnabled: true,              // Show "Top Picks" section
    favoritesEnabled: true,             // Allow favoriting mics
    checkInsEnabled: true,              // Allow check-ins (increases heat)
    userLocationEnabled: true,          // "Near Me" button
    searchHistoryEnabled: true,         // Save search history
    toastNotificationsEnabled: true,    // Show toast notifications
    distanceEnabled: true               // Show distances when user location is known
};
```

**To disable a feature:**
1. Change `true` to `false`
2. Save and refresh
3. The UI will automatically hide related elements

---

## How Filtering Works

### Filter Pipeline

1. **Calculate Distances** (if user location is known)
   - Uses Haversine formula
   - Sorts by distance (closest first)

2. **Search Query Filter**
   - Searches: name, borough, neighborhood, tags
   - Case-insensitive
   - Partial match (e.g., "green" matches "Greenwich Village")

3. **Day Filter**
   - Default: Today's day
   - User can select specific day or "All Days"

4. **Time Filter**
   - "All" - No filter
   - "Afternoon" - 12:00 PM - 4:59 PM
   - "Evening" - 5:00 PM - 11:59 PM

5. **Borough Filter**
   - Exact match on borough name

6. **Neighborhood Filter**
   - Exact match on neighborhood name
   - Dropdown dynamically populated based on selected borough

7. **Cost Filter**
   - "Free" - $0
   - "Under $10" - $1-$9
   - "$10-$20" - $10-$20
   - "Over $20" - $21+

8. **Favorites Filter**
   - Shows only favorited mics

9. **Render Results**
   - Top Picks section (if enabled)
   - Other Mics section
   - "No mics found" message if empty

### Top Picks Algorithm

**File:** `js/utils.js` - `calculateTopPicks()` function

**Scoring Weights** (configurable in `js/config.js`):
```javascript
scoreWeights: {
    isActive: 50,      // Currently active (within 1 hour of start time)
    comics: 2,         // 2 points per comic signed up
    distance: -5,      // -5 points per mile (closer is better)
    hasTag: 5          // 5 points for each favored tag
}
```

**Favored Tags:**
- "Supportive"
- "Long Sets"
- "Good Sound"

**Algorithm:**
1. Score each mic based on weights
2. Sort by score (highest first)
3. Return top 3 mics

**Example:**
- Mic is active: +50 points
- 12 comics signed up: +24 points (12 × 2)
- 0.8 miles away: -4 points (0.8 × -5)
- Has "Supportive" tag: +5 points
- **Total:** 75 points

---

## State Management

### localStorage Persistence

Two pieces of data are saved to localStorage:

1. **Favorites** (`localStorage.getItem('micmap_favorites')`)
   - Saved as JSON array of mic IDs
   - Updated when user clicks heart icon
   - Loaded on app initialization

2. **Search History** (`localStorage.getItem('micmap_searchHistory')`)
   - Saved as JSON array of search strings
   - Updated when user searches
   - Limited to 5 most recent searches

**Helper Functions** (`js/state.js`):
```javascript
saveToLocalStorage(key, value)    // Save data
loadFromLocalStorage(key, fallback) // Load data with fallback
```

### State Updates

When state changes:
1. Update `state` object
2. Call `filterMics()` to re-render
3. Save to localStorage if needed (favorites/search history)

**Example:**
```javascript
// User clicks favorite button
function toggleFavorite(micId) {
    // Update state
    if (state.favorites.includes(micId)) {
        state.favorites = state.favorites.filter(id => id !== micId);
    } else {
        state.favorites.push(micId);
    }

    // Save to localStorage
    saveToLocalStorage(STORAGE_KEYS.favorites, state.favorites);

    // Re-render
    filterMics();
}
```

---

## Troubleshooting

### Map Not Showing

**Problem:** Blank white rectangle where map should be

**Solutions:**
1. Check browser console for errors
2. Verify Leaflet CSS/JS are loaded (check `index.html` CDN links)
3. Check `#map-view` element has height/width
4. Try hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

### Markers Not Appearing

**Problem:** Map loads but no markers visible

**Solutions:**
1. Check `mockMics` array in `js/data.js` has valid `lat`/`lon` values
2. Verify coordinates are in correct format (numbers, not strings)
3. Check browser console for JavaScript errors
4. Zoom out - markers may be outside current view

### Favorites Not Persisting

**Problem:** Favorites reset when page refreshes

**Solutions:**
1. Check if localStorage is enabled in browser
2. Open DevTools → Application → Local Storage
3. Look for `micmap_favorites` key
4. Try in incognito mode to test if extensions are interfering

### Filters Not Working

**Problem:** Selecting filters doesn't update results

**Solutions:**
1. Check browser console for errors
2. Verify `filterMics()` is being called
3. Check filter values match data exactly (case-sensitive)
4. Try "Clear All Filters" button

### Mobile View Issues

**Problem:** Panel not draggable or view toggle not working

**Solutions:**
1. Test on actual mobile device (not just desktop browser resize)
2. Check `@media (min-width: 1024px)` breakpoint in `css/styles.css`
3. Verify touch events are working (check `setupPanelDragHandler()` in `app.js`)

### Distance/Location Not Working

**Problem:** "Near Me" button doesn't work or distances not showing

**Solutions:**
1. Ensure HTTPS (geolocation requires secure context)
2. Check browser location permissions
3. Verify `FEATURES.userLocationEnabled` is `true` in `config.js`
4. Check browser console for geolocation errors

---

## Performance Tips

1. **Debounce Search:** Already implemented (300ms delay). Increase `DEFAULTS.debounceDelay` if needed.

2. **Marker Clustering:** Already enabled via Leaflet.markercluster. Adjust `maxClusterRadius` in `MAP_CONFIG` to change clustering density.

3. **Reduce Toast Duration:** Lower `DEFAULTS.toastDuration` for faster toast dismissal.

4. **Disable Features:** Turn off unused features in `FEATURES` object to reduce computation.

---

## Contributing

Want to add features or fix bugs?

1. **Test your changes** in multiple browsers (Chrome, Firefox, Safari)
2. **Test on mobile** (responsive design is critical)
3. **Update this documentation** if you change configuration options
4. **Comment your code** - future developers will thank you
5. **Keep the modular structure** - don't merge files back into single file

---

## License

This project is open source. Use it, modify it, share it!

---

## Contact

Questions? Improvements? Open an issue or submit a pull request!

**Happy coding! 🎤✨**
