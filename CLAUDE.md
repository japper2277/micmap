# MicFinder NYC - Project Bible

## Overview
MicFinder NYC is an interactive map app for discovering open mics in New York City. Users can filter by day, time, price, borough, and commute time from their location.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         NETLIFY (Frontend)                       │
│                    map_designs/newest_map/                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  index.html                                              │    │
│  │    ├── CDN: Tailwind CSS, Leaflet.js                    │    │
│  │    ├── css/*.css (7 files)                              │    │
│  │    └── js/*.js (16 files, order matters!)               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ fetch()
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      RAILWAY (Backend API)                       │
│              https://micmap-production.up.railway.app            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  api/server.js (Express)                                │    │
│  │    ├── MongoDB (mic data)                               │    │
│  │    ├── Redis (caching)                                  │    │
│  │    ├── MTA GTFS Realtime (subway arrivals)              │    │
│  │    ├── Google Distance Matrix API (transit times)       │    │
│  │    └── HERE API (walking times, geocoding)              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Frontend Load Sequence

### 1. HTML Parsing (`index.html`)
```
1. <head> loads:
   - Tailwind CSS (CDN)
   - Leaflet CSS + JS (CDN)
   - App CSS files (base → map → drawer → stream → modal → controls → responsive)

2. <body> renders:
   - #map div (Leaflet container)
   - #locate-btn (geolocation button)
   - Search bar + filters
   - #list-drawer (mic list panel)
   - #venue-modal (venue detail modal)
   - Filter popovers (borough, time)

3. Scripts load IN ORDER (dependencies!):
   config.js     → CONFIG object (API_BASE, filter options)
   state.js      → STATE object (global app state)
   utils.js      → Helper functions (parseTime, escapeHtml, etc.)
   map.js        → Leaflet map init, marker creation
   modal.js      → Venue modal logic
   drawer.js     → Drawer states, swipe gestures
   filters.js    → Filter cycling, popover toggles
   calendar.js   → Date picker carousel
   toast.js      → Toast notifications
   nyc-geocoder.js → Local NYC geocoding
   search.js     → Search service
   transit.js    → Transit time calculations
   mta.js        → MTA subway data service
   settings.js   → User settings
   render.js     → Main render() function
   app.js        → init() + loadData()
```

### 2. Initialization Flow (`app.js`)
```javascript
init() is called immediately when app.js loads:

init()
  ├── initModal()              // Cache modal DOM refs
  ├── initDrawerState()        // Set drawer to PEEK (mobile) or OPEN (desktop)
  ├── setupMobileSwipe()       // Touch gestures for drawer
  ├── setupKeyboardScroll()    // Arrow key scrolling
  ├── setupFilterRovingTabindex()
  ├── setupFilterScrollIndicators()
  ├── getUserLocation()        // Request geolocation (async, non-blocking)
  ├── generateDateCarousel()   // Build date picker UI
  ├── toastService.init()
  ├── searchService.init()
  ├── settingsService.init()
  ├── loadTransitData()        // Fetch /data/stations.json
  ├── loadData()               // MAIN: Fetch mics from API
  └── setInterval(refreshStatuses, 60000)  // Update "Live" badges
```

### 3. Data Loading (`loadData()`)
```javascript
loadData()
  │
  ├── fetch(CONFIG.apiPath)    // GET /api/v1/mics
  │     └── https://micmap-production.up.railway.app/api/v1/mics
  │
  ├── Response: { success, count, mics: [...] }
  │
  ├── processMics(rawMics)     // Transform API data
  │     ├── Parse time strings to Date objects
  │     ├── Calculate status (live/upcoming/future)
  │     ├── Extract signup URLs/emails from text
  │     ├── Extract Instagram handles
  │     ├── Normalize field names (lon→lng, _id→id)
  │     └── Store in STATE.mics
  │
  └── render('today')          // Initial render
```

### 4. Render Pipeline (`render.js`)
```javascript
render(mode)  // mode = 'today' | 'tomorrow' | 'calendar'
  │
  ├── Clear existing markers: markersGroup.clearLayers()
  ├── Clear list: container.innerHTML = ''
  │
  ├── Filter mics by mode (day of week)
  │     ├── today: Current day, hide if started >30min ago
  │     ├── tomorrow: Next day
  │     └── calendar: Selected date
  │
  ├── Apply user filters:
  │     ├── Price (Free/Paid)
  │     ├── Time (afternoon/evening/latenight/custom)
  │     ├── Borough (Manhattan/Brooklyn/Queens/Bronx)
  │     ├── Commute (when transit mode active)
  │     └── Map bounds (when "Sync W/Map" enabled)
  │
  ├── Calculate status for each mic:
  │     ├── 'live'     → Green (started <90min ago)
  │     ├── 'upcoming' → Red (<2 hours away)
  │     └── 'future'   → Gray (tonight/later)
  │
  ├── Cluster nearby venues (200m radius):
  │     └── Prevents overlapping markers
  │
  ├── Create map markers:
  │     ├── Pill style (zoomed out): "7p" with color
  │     └── Ticket style (zoom ≥16): "7p + Venue Name"
  │
  ├── Sort mics by start time
  │
  ├── Split into sections:
  │     ├── "Happening Now" card (collapsed, expandable)
  │     └── Upcoming mics grouped by hour
  │
  └── Render cards to #list-content
```

---

## State Management (`state.js`)

```javascript
const STATE = {
    // Data
    mics: [],                    // All mics from API

    // View mode
    currentMode: 'today',        // 'today' | 'tomorrow' | 'calendar'
    selectedCalendarDate: null,

    // UI
    isDrawerOpen: false,
    drawerState: 'peek',         // 'peek' | 'open' (mobile only)
    happeningNowExpanded: false,

    // Map
    markerLookup: {},            // { micId: Leaflet.Marker }
    isProgrammaticMove: false,   // Suppress events during fly animations

    // Filters
    activeFilters: {
        price: 'All',            // 'All' | 'Free' | 'Paid'
        time: 'All',             // 'All' | 'afternoon' | 'evening' | 'latenight' | 'custom'
        commute: 'All',          // 'All' | 15 | 30 | 45 | 60
        borough: 'All'           // 'All' | 'Manhattan' | 'Brooklyn' | 'Queens' | 'Bronx'
    },

    // Geolocation
    userLocation: null,          // { lat, lng }
    userMarker: null,            // Blue dot marker

    // Transit Mode
    userOrigin: null,            // { lat, lng, name }
    transitTimes: {},            // { clusterId: seconds }
    isTransitMode: false,
    transitCache: {},
    isCalculatingTransit: false,

    // User Preferences (localStorage)
    walkPreference: '15min',
    syncWithMap: false           // Filter list to visible bounds
};
```

---

## API Endpoints (Backend)

### Core
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/mics` | GET | All mics. Query params: `day`, `borough`, `neighborhood`, `cost`, `sort` |
| `/data/stations.json` | GET | Static subway station data |
| `/health` | GET | Quick health check |
| `/health/deep` | GET | Full health check (MongoDB, Redis) |

### Transit Proxies
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/proxy/transit` | POST | Google Distance Matrix (transit times) |
| `/api/proxy/here/walk` | GET | HERE walking time for single route |
| `/api/proxy/here/walk-batch` | POST | HERE walking times (multiple destinations) |
| `/api/proxy/here/geocode` | GET | HERE geocoding |
| `/api/proxy/geocode` | GET | Google geocoding |

### MTA Realtime
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mta/alerts` | GET | Current service alerts |
| `/api/mta/arrivals/:line/:stopId` | GET | Live train arrivals |

### Subway Routing
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/subway/routes` | GET | Calculate subway routes (origin/dest) |

---

## Key Frontend Files

### Configuration (`js/config.js`)
```javascript
const API_BASE = 'https://micmap-production.up.railway.app';

const CONFIG = {
    apiBase: API_BASE,
    apiPath: `${API_BASE}/api/v1/mics`,
    mapCenter: [40.72, -74.00],      // NYC default
    mapZoom: 15,                      // Desktop
    mobileMapZoom: 17,                // Mobile
    dayNames: ['Sunday', 'Monday', ...],
    filterCycles: { ... },
    filterLabels: { ... },
    timeRanges: {
        afternoon: { start: 12, end: 17 },
        evening: { start: 17, end: 21 },
        latenight: { start: 21, end: 24 }
    }
};
```

### Map (`js/map.js`)
- Initializes Leaflet map with CartoDB Voyager tiles
- `createPin(status, time, extraCount, venueName)` - Creates markers
- `getUserLocation()` - Requests geolocation
- `centerOnUser()` - Flies to user location + triggers transit mode
- `locateMic(lat, lng, id)` - Flies to mic and opens modal
- Re-renders on zoom threshold crossing (pill ↔ ticket style)

### Drawer (`js/drawer.js`)
- Two states: `PEEK` (minimized) and `OPEN` (expanded)
- `setupMobileSwipe()` - Touch gestures with velocity detection
- Pull-to-collapse when scrolled to top
- Auto-expand when user scrolls list in peek mode
- `fixDrawerStateForViewport()` - Handles resize/orientation

### Render (`js/render.js`)
- Main `render(mode)` function
- Proximity clustering (200m radius)
- "Happening Now" collapsed card
- Hour-grouped list with sticky headers
- Card hover highlights map marker
- Transit mode: "Show more" button for distant venues

### Utils (`js/utils.js`)
- `escapeHtml(str)` - XSS prevention
- `parseTime(timeStr)` - "7:00 PM" → Date
- `processMics(rawMics)` - API response transformer
- `getStatus(startDate)` - live/upcoming/future
- `calculateDistance()` - Haversine formula
- `getHereWalkingTime()` - Walking API with cache

---

## Deployment

### Frontend (Netlify)
```
netlify.toml:
  publish = "map_designs/newest_map"
  command = "echo 'No build needed - static site'"

Auto-deploys from: github.com/japper2277/micmap (main branch)
```

### Backend (Railway)
```
Deployed at: https://micmap-production.up.railway.app
Local dev: cd api && npm start (port 3001)

Environment variables needed:
  - MONGODB_URI
  - REDIS_URL
  - GOOGLE_MAPS_API_KEY
  - HERE_API_KEY
  - MTA_API_KEY (optional)
```

---

## Data Flow Diagram

```
User opens app
       │
       ▼
┌─────────────────┐
│  index.html     │
│  loads scripts  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    init()       │
│  (app.js)       │
└────────┬────────┘
         │
         ├──────────────────────────────────┐
         │                                  │
         ▼                                  ▼
┌─────────────────┐                ┌─────────────────┐
│  loadData()     │                │ getUserLocation │
│  GET /api/v1/   │                │  (async)        │
│     mics        │                └────────┬────────┘
└────────┬────────┘                         │
         │                                  │
         ▼                                  ▼
┌─────────────────┐                ┌─────────────────┐
│  processMics()  │                │ STATE.user      │
│  transform data │                │   Location      │
└────────┬────────┘                └─────────────────┘
         │
         ▼
┌─────────────────┐
│  STATE.mics     │
│  (all mics)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    render()     │
│  'today' mode   │
└────────┬────────┘
         │
         ├─────────────────┬─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Filter mics │   │  Cluster    │   │  Create     │
│ by day/time │   │  nearby     │   │  markers    │
│ /price/etc  │   │  venues     │   │  on map     │
└─────────────┘   └─────────────┘   └─────────────┘
         │
         ▼
┌─────────────────┐
│ Render cards    │
│ to #list-content│
└─────────────────┘
```

---

## Mobile UX

- **Breakpoint**: 640px (Tailwind `sm:`)
- **Drawer states**: PEEK (bottom sheet) ↔ OPEN (full screen)
- **Gestures**:
  - Swipe up on header → Open
  - Swipe down on header → Peek
  - Pull down at scroll top → Collapse (Google Maps style)
  - Scroll list in peek → Auto-expand
  - Tap backdrop → Close to peek
- **Haptic feedback**: 8ms vibration on state change

---

## File Structure

```
micmap/
├── CLAUDE.md                    # This file
├── netlify.toml                 # Frontend deployment config
├── package.json                 # Root scripts (start, watch, generate)
│
├── map_designs/newest_map/      # ← DEPLOYED TO NETLIFY
│   ├── index.html
│   ├── css/
│   │   ├── base.css
│   │   ├── map.css
│   │   ├── drawer.css
│   │   ├── stream.css
│   │   ├── modal.css
│   │   ├── controls.css
│   │   └── responsive.css
│   └── js/
│       ├── config.js
│       ├── state.js
│       ├── utils.js
│       ├── map.js
│       ├── modal.js
│       ├── drawer.js
│       ├── filters.js
│       ├── calendar.js
│       ├── toast.js
│       ├── nyc-geocoder.js
│       ├── search.js
│       ├── transit.js
│       ├── mta.js
│       ├── settings.js
│       ├── render.js
│       └── app.js
│
├── api/                         # ← DEPLOYED TO RAILWAY
│   ├── server.js                # Express server (all routes)
│   ├── package.json
│   ├── mics.csv                 # Raw mic data
│   ├── mics-geocoded.csv        # With coordinates
│   ├── mics.json                # Generated JSON
│   ├── config/
│   ├── middleware/
│   ├── models/
│   ├── scripts/
│   └── public/data/             # Static data (stations.json)
│
├── public/data/                 # Local static data
│   ├── stations.json
│   └── graph.json
│
├── old/                         # Archive of old iterations
├── card_designs/                # Card design explorations
└── scripts/                     # Utility scripts
```

---

## Git

- **Repo**: https://github.com/japper2277/micmap.git
- **Branch**: main
- **Netlify**: Auto-deploys on push to main

---

## Local Development

```bash
# Frontend - open in browser (no build)
open map_designs/newest_map/index.html

# Or use live server
npx live-server map_designs/newest_map

# Backend
cd api
npm install
npm start       # Port 3001
npm run dev     # With nodemon
npm test        # Jest tests
```

---

## Common Tasks

### Add a new filter
1. Add to `CONFIG.filterCycles` in `config.js`
2. Add label to `CONFIG.filterLabels`
3. Add filter logic in `render()` (around line 190)
4. Add UI button in `index.html` filter row

### Add a new API endpoint
1. Add route in `api/server.js`
2. If proxying external API, add rate limiting
3. Add to this doc's API table

### Change map styling
- Tile layer in `map.js` line 12
- Marker styles in `createPin()` function
- CSS in `css/map.css`

### Debug transit times
- Check `transitService` in browser console
- Verify `STATE.transitTimes` has data
- Check `/api/proxy/transit` response in Network tab

---

## Working with Claude Code

### Session Workflow
1. **Start with Plan Mode** - Press `Shift+Tab` twice to enter plan mode
2. Write your PR goal, iterate on the plan
3. Switch to auto-accept edits mode for 1-shot completion
4. Good planning upfront = faster execution

### Parallel Sessions
- Run multiple Claude instances in separate terminal tabs for independent tasks
- Use `--teleport` to hand off sessions between CLI and claude.ai/code web interface

### Model Choice
- Use Opus 4.5 with thinking for complex tasks (better tool use, requires less steering)

### Useful Commands
- `/help` - Get help with Claude Code
- `/config` - View/edit configuration
- `/reset` - Clear context and start fresh
- `Shift+Tab` - Cycle through permission modes

### Project-Specific Tips
- **Frontend changes**: Test in browser with `npx live-server map_designs/newest_map`
- **Backend changes**: Run `cd api && npm test`
- **Mobile**: Always check mobile view (640px breakpoint)
- **Filters**: Test filter combinations in render.js

### What NOT to Do
- Don't add unnecessary abstractions or helpers for one-time operations
- Don't add docstrings/comments to code you didn't change
- Don't create new files when editing existing ones works
- Don't over-engineer - keep changes minimal and focused
