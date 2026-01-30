# Plan Mode Implementation

**Goal**: Add route planning to MicFinder - users can build a night of open mics.

**Approach**: One small step at a time. Test after each. Commit after each.

---

## Phase 1: State Foundation
**Status**: [ ] Not started

### Step 1.1: Add state variables
**File**: `map_designs/newest_map/js/state.js`

Add to STATE object:
```javascript
// Plan Mode State
planMode: false,              // Is plan mode active?
route: [],                    // Array of mic IDs
setDuration: 45,              // Minutes at each mic
timeWindowStart: 700,         // 7pm
timeWindowEnd: 1100           // 11pm
```

**Test**: Open console, type `STATE.planMode` → should return `false`

**Commit**: `feat(plan): add plan mode state variables`

---

### Step 1.2: Add plan button HTML
**File**: `map_designs/newest_map/index.html`

Find the locate button div, add plan button after it:
```html
<!-- Plan Mode Button -->
<button id="plan-btn" class="map-control-btn" aria-label="Plan my night">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
        <path d="M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        <path d="M9 14l2 2 4-4"/>
    </svg>
</button>
```

**Test**: See new button on map (unstyled initially)

**Commit**: `feat(plan): add plan button to HTML`

---

### Step 1.3: Style plan button
**File**: `map_designs/newest_map/css/controls.css`

Add styles:
```css
/* Plan Mode Button */
#plan-btn {
    background: #f43f5e;
    color: white;
}

#plan-btn:hover {
    background: #e11d48;
}

#plan-btn.active {
    background: #22c55e;
}
```

**Test**: Button is rose colored, hover darkens it

**Commit**: `style(plan): add plan button styles`

---

### Step 1.4: Add toggle functions
**File**: `map_designs/newest_map/js/app.js`

Add functions (near other UI functions):
```javascript
function togglePlanMode() {
    STATE.planMode = !STATE.planMode;
    document.getElementById('plan-btn').classList.toggle('active', STATE.planMode);
    document.body.classList.toggle('plan-mode', STATE.planMode);

    if (STATE.planMode) {
        console.log('Plan mode: ON');
    } else {
        exitPlanMode();
    }
}

function exitPlanMode() {
    STATE.planMode = false;
    STATE.route = [];
    document.getElementById('plan-btn').classList.remove('active');
    document.body.classList.remove('plan-mode');
    console.log('Plan mode: OFF');
}
```

**Test**: Click plan button → console shows "Plan mode: ON", button turns green

**Commit**: `feat(plan): add togglePlanMode and exitPlanMode functions`

---

### Step 1.5: Wire up button click
**File**: `map_designs/newest_map/js/app.js`

In `init()` function, add event listener:
```javascript
// Plan mode button
document.getElementById('plan-btn')?.addEventListener('click', togglePlanMode);
```

**Test**: Click button → toggles plan mode on/off

**Commit**: `feat(plan): wire up plan button click handler`

---

## Phase 2: Plan Mode Header
**Status**: [ ] Not started

### Step 2.1: Add header HTML
**File**: `map_designs/newest_map/index.html`

Add after opening body tag:
```html
<!-- Plan Mode Header -->
<div id="plan-header" class="plan-header">
    <button class="plan-header-cancel" onclick="exitPlanMode()">Cancel</button>
    <div class="plan-header-title">PLAN MY NIGHT</div>
    <div class="plan-header-spacer"></div>
</div>
```

**Test**: Header exists in DOM (hidden by default)

**Commit**: `feat(plan): add plan mode header HTML`

---

### Step 2.2: Style header
**File**: `map_designs/newest_map/css/controls.css`

```css
/* Plan Mode Header */
.plan-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    background: rgba(24, 24, 27, 0.95);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    z-index: 1000;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    transform: translateY(-100%);
    opacity: 0;
    transition: transform 0.3s ease, opacity 0.3s ease;
}

body.plan-mode .plan-header {
    transform: translateY(0);
    opacity: 1;
}

.plan-header-cancel {
    background: none;
    border: none;
    color: #f43f5e;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    padding: 8px 12px;
}

.plan-header-title {
    font-size: 17px;
    font-weight: 600;
    color: white;
}

.plan-header-spacer {
    width: 60px;
}
```

**Test**: Enter plan mode → header slides down from top

**Commit**: `style(plan): add plan header styles with slide animation`

---

## Phase 3: Drawer Integration
**Status**: [ ] Not started

### Step 3.1: Create planner.js file
**File**: `map_designs/newest_map/js/planner.js` (NEW)

```javascript
/* =================================================================
   PLANNER
   Plan mode drawer rendering and route management
   ================================================================= */

function renderPlanDrawer() {
    const container = document.getElementById('list-content');
    if (!container) return;

    // For now, just show a placeholder
    container.innerHTML = `
        <div style="padding: 20px; text-align: center; color: rgba(255,255,255,0.6);">
            <p style="font-size: 15px; margin-bottom: 8px;">Plan Mode Active</p>
            <p style="font-size: 13px;">Pick mics to build your route</p>
        </div>
    `;
}
```

**Test**: File exists, no syntax errors

**Commit**: `feat(plan): create planner.js with placeholder renderPlanDrawer`

---

### Step 3.2: Add script to HTML
**File**: `map_designs/newest_map/index.html`

Add before app.js:
```html
<script src="js/planner.js"></script>
```

**Test**: No console errors on page load

**Commit**: `feat(plan): add planner.js script to index.html`

---

### Step 3.3: Call renderPlanDrawer on toggle
**File**: `map_designs/newest_map/js/app.js`

Update togglePlanMode():
```javascript
function togglePlanMode() {
    STATE.planMode = !STATE.planMode;
    document.getElementById('plan-btn').classList.toggle('active', STATE.planMode);
    document.body.classList.toggle('plan-mode', STATE.planMode);

    if (STATE.planMode) {
        renderPlanDrawer();
    } else {
        exitPlanMode();
    }
}
```

Update exitPlanMode():
```javascript
function exitPlanMode() {
    STATE.planMode = false;
    STATE.route = [];
    document.getElementById('plan-btn').classList.remove('active');
    document.body.classList.remove('plan-mode');
    render(STATE.currentMode); // Restore normal drawer
}
```

**Test**: Enter plan mode → drawer shows placeholder text

**Commit**: `feat(plan): integrate renderPlanDrawer with toggle`

---

## Phase 4-10: [To be detailed after Phase 3 works]

- Phase 4: Mic list with add buttons
- Phase 5: Route display with connectors
- Phase 6: Timing logic (glow/dimmed)
- Phase 7: Map marker states
- Phase 8: SVG route line
- Phase 9: Final view screen
- Phase 10: Share/save features

---

## Progress Tracker

| Phase | Step | Status | Commit |
|-------|------|--------|--------|
| 1 | 1.1 State vars | [ ] | |
| 1 | 1.2 Button HTML | [ ] | |
| 1 | 1.3 Button CSS | [ ] | |
| 1 | 1.4 Toggle funcs | [ ] | |
| 1 | 1.5 Wire click | [ ] | |
| 2 | 2.1 Header HTML | [ ] | |
| 2 | 2.2 Header CSS | [ ] | |
| 3 | 3.1 planner.js | [ ] | |
| 3 | 3.2 Add script | [ ] | |
| 3 | 3.3 Integrate | [ ] | |

---

## Testing After Each Commit

1. `git status` - verify only expected files changed
2. Open app in browser
3. Check console for errors
4. Test the specific feature
5. Test existing features still work (filters, modal, drawer)
