# Plan Mode Implementation

**Goal**: Add route planning to MicFinder - users build a night of open mics by clicking markers on the map.

**Approach**: Map-first interaction. Drawer is secondary. One step at a time. Test after each. Commit after each.

**Reference**: `plan-mode-simple-demo.html` - standalone demo with all features working.

---

## Completed Steps

| Step | Description | Commit |
|------|-------------|--------|
| 1.1 | State variables (planMode, route, setDuration, timeWindow) | `feat(plan): add plan mode state variables` |
| 1.2 | Plan button HTML | `feat(plan): add plan button HTML` |
| 1.3 | Plan button CSS (rose, green when active) | `style(plan): add plan button styles` |
| 1.4 | togglePlanMode() and exitPlanMode() functions | `feat(plan): add togglePlanMode and exitPlanMode functions` |
| 1.5 | Wire up button click handler | `feat(plan): wire up plan button click handler` |
| 2.1 | Plan header in drawer (not fixed top) | `refactor(plan): move plan header into drawer` |
| 2.2 | Drag handle position fix | `fix(plan): move drag handle up in plan mode` |

---

## Phase 3: Map Marker Interactions (MAP IS HERO)
**Status**: [ ] Not started

The map is the primary interaction. Users click markers to add/remove mics from route.

### Step 3.1: Create planner.js with route functions
**File**: `map_designs/newest_map/js/planner.js` (NEW)

```javascript
/* =================================================================
   PLANNER
   Map-first route planning - click markers to build route
   ================================================================= */

// Add mic to route
function addToRoute(micId) {
    if (STATE.route.includes(micId)) return;

    STATE.route.push(micId);
    // Sort by start time
    STATE.route.sort((a, b) => {
        const micA = STATE.mics.find(m => m.id === micId);
        const micB = STATE.mics.find(m => m.id === micId);
        return micA.start - micB.start;
    });

    updateMarkerStates();
    updateRouteLine();
    renderPlanDrawer();
}

// Remove mic from route
function removeFromRoute(micId) {
    STATE.route = STATE.route.filter(id => id !== micId);
    updateMarkerStates();
    updateRouteLine();
    renderPlanDrawer();
}

// Toggle mic in/out of route (called when marker clicked)
function toggleMicInRoute(micId) {
    if (!STATE.planMode) return;

    if (STATE.route.includes(micId)) {
        removeFromRoute(micId);
    } else {
        addToRoute(micId);
    }
}
```

**Test**: Functions exist, no errors

**Commit**: `feat(plan): add route management functions`

---

### Step 3.2: Hook marker clicks to toggleMicInRoute
**File**: `map_designs/newest_map/js/map.js`

In marker click handler, check for plan mode:
```javascript
// In marker click handler
if (STATE.planMode) {
    toggleMicInRoute(mic.id);
    return; // Don't open modal
}
// Normal behavior - open modal
```

**Test**: Click marker in plan mode → adds to route (check STATE.route in console)

**Commit**: `feat(plan): wire marker clicks to route in plan mode`

---

### Step 3.3: Add marker state CSS
**File**: `map_designs/newest_map/css/map.css`

```css
/* Plan Mode Marker States */
.marker-selected .map-pin {
    background: #22c55e !important;
    border-color: #22c55e !important;
}

.marker-glow .map-pin {
    border: 2px solid #22c55e;
    box-shadow: 0 0 15px rgba(34, 197, 94, 0.6);
    animation: pulse-glow 2s infinite;
}

@keyframes pulse-glow {
    0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
    70% { box-shadow: 0 0 0 12px rgba(34, 197, 94, 0); }
    100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

.marker-suggested .map-pin {
    border: 2px solid #f43f5e;
    box-shadow: 0 0 12px rgba(244, 63, 94, 0.4);
}

.marker-dimmed {
    opacity: 0.2;
    filter: grayscale(1);
    pointer-events: none;
}
```

**Test**: Manually add class to marker → see visual change

**Commit**: `style(plan): add marker state styles (selected, glow, dimmed)`

---

### Step 3.4: Implement updateMarkerStates()
**File**: `map_designs/newest_map/js/planner.js`

```javascript
function updateMarkerStates() {
    if (STATE.route.length === 0) {
        // Reset all markers
        Object.values(STATE.markerLookup).forEach(marker => {
            const el = marker.getElement();
            if (el) {
                el.classList.remove('marker-selected', 'marker-glow', 'marker-suggested', 'marker-dimmed');
            }
        });
        return;
    }

    const lastMicId = STATE.route[STATE.route.length - 1];

    // Update each marker based on timing
    STATE.mics.forEach(mic => {
        const marker = STATE.markerLookup[mic.id];
        if (!marker) return;

        const el = marker.getElement();
        if (!el) return;

        // Clear previous states
        el.classList.remove('marker-selected', 'marker-glow', 'marker-suggested', 'marker-dimmed');

        if (STATE.route.includes(mic.id)) {
            el.classList.add('marker-selected');
        } else {
            const status = getMicStatus(mic.id, lastMicId);
            if (status === 'glow') el.classList.add('marker-glow');
            else if (status === 'suggested') el.classList.add('marker-suggested');
            else if (status === 'dimmed') el.classList.add('marker-dimmed');
        }
    });
}
```

**Test**: Add mic to route → other markers update states

**Commit**: `feat(plan): implement updateMarkerStates for visual feedback`

---

## Phase 4: Timing Logic
**Status**: [ ] Not started

Calculate if a mic is reachable based on when you'd arrive.

### Step 4.1: Implement getMicStatus()
**File**: `map_designs/newest_map/js/planner.js`

```javascript
// Calculate if a mic is reachable and how good the timing is
function getMicStatus(candidateId, lastMicId) {
    const candidate = STATE.mics.find(m => m.id === candidateId);
    const anchor = STATE.mics.find(m => m.id === lastMicId);
    if (!candidate || !anchor) return 'visible';

    // When does anchor mic end? (start + setDuration)
    const anchorEndTime = new Date(anchor.start.getTime() + STATE.setDuration * 60000);

    // Estimate travel time (use transit time if available, else 20 min default)
    const travelMins = candidate.transitTime || 20;
    const arrivalTime = new Date(anchorEndTime.getTime() + travelMins * 60000);

    // How much buffer before the candidate mic starts?
    const waitMins = (candidate.start - arrivalTime) / 60000;

    // Status based on wait time
    if (waitMins < -5) return 'dimmed';      // Too late (5m grace)
    if (waitMins <= 15) return 'glow';       // Perfect! Arrive 0-15m early
    if (waitMins <= 45) return 'suggested';  // Good, but some waiting
    return 'dimmed';                          // Too much dead time (45+ mins)
}
```

**Test**: Console log getMicStatus results for different mics

**Commit**: `feat(plan): implement timing logic for mic reachability`

---

## Phase 5: Route Line SVG
**Status**: [ ] Not started

Draw curved dashed green line connecting route stops on map.

### Step 5.1: Add SVG overlay to map
**File**: `map_designs/newest_map/index.html`

Add inside #map div:
```html
<svg id="route-line" class="route-line-svg">
    <path id="route-path" fill="none" stroke="#22c55e" stroke-width="3" stroke-dasharray="8 8" stroke-linecap="round"/>
</svg>
```

### Step 5.2: Style route line
**File**: `map_designs/newest_map/css/map.css`

```css
.route-line-svg {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 400;
}
```

### Step 5.3: Implement updateRouteLine()
**File**: `map_designs/newest_map/js/planner.js`

```javascript
function updateRouteLine() {
    const path = document.getElementById('route-path');
    if (!path || STATE.route.length < 2) {
        if (path) path.setAttribute('d', '');
        return;
    }

    // Get pixel positions for each mic in route
    const points = STATE.route.map(micId => {
        const mic = STATE.mics.find(m => m.id === micId);
        const marker = STATE.markerLookup[micId];
        if (!marker) return null;
        const pos = map.latLngToContainerPoint([mic.lat, mic.lng]);
        return { x: pos.x, y: pos.y };
    }).filter(Boolean);

    if (points.length < 2) return;

    // Build curved path
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const midX = (prev.x + curr.x) / 2;
        const midY = (prev.y + curr.y) / 2;
        // Add curve
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const curveAmount = dist * 0.2;
        const direction = i % 2 === 0 ? 1 : -1;
        const perpX = (-dy / dist) * curveAmount * direction;
        const perpY = (dx / dist) * curveAmount * direction;
        const cpX = midX + perpX;
        const cpY = midY + perpY;
        d += ` Q ${cpX} ${cpY} ${curr.x} ${curr.y}`;
    }

    path.setAttribute('d', d);
}

// Update on map move
map.on('move', updateRouteLine);
map.on('zoom', updateRouteLine);
```

**Test**: Add 2+ mics to route → see green dashed line

**Commit**: `feat(plan): add SVG route line on map`

---

## Phase 6: Drawer Content (Secondary)
**Status**: [ ] Not started

Drawer shows current route and allows removal. NOT primary interaction.

### Step 6.1: Implement renderPlanDrawer()
**File**: `map_designs/newest_map/js/planner.js`

```javascript
function renderPlanDrawer() {
    const container = document.getElementById('list-content');
    if (!container) return;

    if (STATE.route.length === 0) {
        container.innerHTML = `
            <div class="plan-empty">
                <p class="plan-empty-title">Tap markers to build your route</p>
                <p class="plan-empty-sub">Glowing markers have perfect timing</p>
            </div>
        `;
        return;
    }

    let html = '<div class="plan-route">';
    html += '<div class="plan-section-title">Your Route</div>';

    STATE.route.forEach((micId, i) => {
        const mic = STATE.mics.find(m => m.id === micId);
        if (!mic) return;

        html += renderRouteMicItem(mic);

        // Transit connector between stops
        if (i < STATE.route.length - 1) {
            html += renderTransitConnector(micId, STATE.route[i + 1]);
        }
    });

    html += '</div>';

    // Done button
    html += `
        <div class="plan-cta">
            <button class="plan-done-btn" onclick="showFinalView()">
                Done - ${STATE.route.length} stop${STATE.route.length > 1 ? 's' : ''}
            </button>
        </div>
    `;

    container.innerHTML = html;
}
```

**Test**: Add mics via map → drawer updates

**Commit**: `feat(plan): implement drawer route display`

---

## Phase 7: Final View & Share
**Status**: [ ] Not started

Full screen summary with share/copy/save options.

(Details to be added after Phase 6 works)

---

## Progress Tracker

| Phase | Step | Description | Status |
|-------|------|-------------|--------|
| 1 | 1.1-1.5 | State & Toggle Foundation | [x] Done |
| 2 | 2.1-2.2 | Drawer Header | [x] Done |
| 3 | 3.1 | Create planner.js with route functions | [ ] |
| 3 | 3.2 | Hook marker clicks | [ ] |
| 3 | 3.3 | Marker state CSS | [ ] |
| 3 | 3.4 | updateMarkerStates() | [ ] |
| 4 | 4.1 | getMicStatus() timing logic | [ ] |
| 5 | 5.1-5.3 | Route line SVG | [ ] |
| 6 | 6.1 | Drawer content | [ ] |
| 7 | - | Final view & share | [ ] |

---

## Key Principle: MAP IS HERO

- Users click markers on map to add/remove mics
- Markers glow/dim based on timing from last selection
- Route line shows path on map
- Drawer is secondary - just shows current route
- Drawer stays in peek mode

---

## Testing After Each Commit

1. `git status` - verify only expected files changed
2. Open app in browser
3. Check console for errors
4. Test the specific feature
5. Test existing features still work (filters, modal, drawer)
