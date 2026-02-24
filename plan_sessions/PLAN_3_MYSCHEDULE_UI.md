# PLAN 3: My Schedule Card - UI/UX & Suggested Mics Feature

## SCOPE BOUNDARIES (DO NOT TOUCH)
- ONLY work on the "My Schedule" collapsible card UI/UX
- ONLY add "Suggested Mics" feature to this card
- DO NOT fix plan mode logic bugs (Plan 1)
- DO NOT change +6:00/+8:00 buttons (Plan 2)
- DO NOT add calendar features (Plan 4)
- DO NOT change map markers (Plan 5)

## Files in Scope
- `map_designs/newest_map/js/render.js` - Schedule card rendering (lines 705-811)
- `map_designs/newest_map/js/planner.js` - Schedule data/reorder logic
- `map_designs/newest_map/css/stream.css` - Schedule card styles
- `map_designs/newest_map/css/drawer.css` - Drawer positioning

---

## CURRENT IMPLEMENTATION

### My Schedule Card Structure
```
┌─────────────────────────────────────────────┐
│ [clipboard] 1  My Schedule     6:00 PM  ∨  │ <- Header (clickable)
├─────────────────────────────────────────────┤
│ 6:00 PM  The Fear City CC    ⋮⋮   ✕        │ <- Schedule item
│          $5                                 │
├─────────────────────────────────────────────┤
│                        [ Sort by time ]     │ <- Tools row
└─────────────────────────────────────────────┘
```

### Current Features
- Collapsible card (click header to expand/collapse)
- Shows count of scheduled mics
- Shows time range (e.g., "6:00 PM")
- Each item shows: time, venue name, price, drag handle, remove button
- "Sort by time" button at bottom
- Conflict banner when schedule has overlaps

---

## CURRENT IMPLEMENTATION GRADE

### Grading Factors (1-100 scale)

| Factor | Score | Notes |
|--------|-------|-------|
| 1. Visual Hierarchy | ?/100 | Is the most important info prominent? |
| 2. Information Density | ?/100 | Right amount of info, not cluttered? |
| 3. Affordances | ?/100 | Are interactive elements obvious? |
| 4. Collapse/Expand UX | ?/100 | Smooth, intuitive toggle? |
| 5. Item Layout | ?/100 | Time, venue, price well-organized? |
| 6. Drag Handle | ?/100 | Is ⋮⋮ obvious for reordering? |
| 7. Remove Button | ?/100 | Clear, not accidentally tappable? |
| 8. Color System | ?/100 | Good use of color for states? |
| 9. Typography | ?/100 | Font sizes, weights appropriate? |
| 10. Spacing | ?/100 | Consistent, breathable layout? |
| 11. Mobile Touch | ?/100 | Touch targets 44px+? |
| 12. Animation | ?/100 | Smooth expand/collapse/reorder? |
| 13. Empty State | ?/100 | What shows when no mics scheduled? |
| 14. Suggested Mics | 0/100 | FEATURE DOESN'T EXIST YET |
| 15. Quick Actions | ?/100 | Easy to add more, clear schedule? |

**TOTAL: ?/1500 = ?/100 average**

---

## COMPARISON BENCHMARKS

### Industry Standard: Uber "Your Trip"
- Clean card with pickup/dropoff
- Easy to add stops with "+" button
- Suggested destinations based on history
- Smooth reorder animation

### Industry Standard: Google Calendar Day View
- Clear time blocks
- Color-coded events
- Easy drag to reschedule
- "Suggested times" for scheduling

### Industry Standard: Apple Reminders
- Collapsible lists
- Drag to reorder
- Swipe to delete
- Suggested next actions

---

## SUGGESTED MICS FEATURE

### User Need
After adding 1-2 mics, user wants suggestions for what to add next:
- Mics that fit the time gaps
- Mics nearby the scheduled ones
- Mics with good ratings/reviews

### Proposed Design
```
┌─────────────────────────────────────────────┐
│ [clipboard] 2  My Schedule     6-9 PM   ∨  │
├─────────────────────────────────────────────┤
│ 6:00 PM  The Fear City CC         ✕        │
│ 9:00 PM  Creek & Cave             ✕        │
├─────────────────────────────────────────────┤
│ Suggested                                   │
│ ┌─────────────────────────────────────────┐│
│ │ 7:30 PM  Grisly Pear  FREE  [+ Add]    ││
│ │          Fits between your mics         ││
│ └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### Suggestion Algorithm
1. Find time gaps > 60 min between scheduled mics
2. Find mics that start in those gaps
3. Filter by reachability (can user get there in time?)
4. Sort by: proximity to scheduled venues, then time fit
5. Show top 2-3 suggestions

---

## UI/UX IMPROVEMENTS TO CONSIDER

### 1. Header Design
- Add total estimated duration
- Better expand/collapse indicator
- Quick "Clear All" action?

### 2. Item Design
- More compact? Less compact?
- Show transit time between items?
- Inline edit time?

### 3. Reorder UX
- Drag handle more prominent
- Animation smoother
- Haptic feedback

### 4. Suggested Mics
- Section below scheduled items
- "Fits your schedule" badge
- One-tap add
- Dismiss suggestion (don't show again)

### 5. Empty State
- "Tap a mic to add to your schedule"
- Show first suggested mic?

---

## IMPLEMENTATION PLAN

### Phase 1: UI Polish
- [ ] Grade current design
- [ ] Fix any visual issues
- [ ] Improve animations

### Phase 2: Suggested Mics
- [ ] Add suggestion algorithm to planner.js
- [ ] Render suggestions section in render.js
- [ ] Style suggestions in stream.css
- [ ] Add "Add" button functionality
- [ ] Add dismiss functionality

### Phase 3: Regrade
- [ ] Test all features
- [ ] Grade again
- [ ] Iterate until 95+

---

## BUGS/ISSUES FOUND

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | | | |

---

## CHANGES IMPLEMENTED

| # | Change | File:Line | Description |
|---|--------|-----------|-------------|
| 1 | | | |

---

## POST-FIX GRADES

| Factor | Before | After | Delta |
|--------|--------|-------|-------|
| 1. Visual Hierarchy | | | |
| ... | | | |
| 14. Suggested Mics | 0 | | +? |

**TOTAL: ?/100 -> ?/100**

---

## TERMINAL PROMPT

```
You are improving the "My Schedule" card UI/UX in MicFinder NYC and adding a "Suggested Mics" feature.

CRITICAL CONSTRAINTS:
- ONLY work on the My Schedule collapsible card
- ONLY add Suggested Mics to this card
- DO NOT fix plan mode logic bugs (separate plan)
- DO NOT change +6:00/+8:00 button styling (separate plan)
- DO NOT add calendar features (separate plan)
- DO NOT change map markers (separate plan)

CONTEXT:
- My Schedule card appears in plan mode when user has 1+ mics scheduled
- It's a collapsible card showing scheduled mics with time, venue, price
- User can reorder (drag), remove (X), sort by time
- You need to ADD a "Suggested Mics" section that shows:
  - Mics that fit time gaps in the schedule
  - Easy one-tap add

FILES:
- map_designs/newest_map/js/render.js (lines 705-811) - card rendering
- map_designs/newest_map/js/planner.js - schedule logic
- map_designs/newest_map/css/stream.css - card styles

YOUR TASK:
1. Read current implementation
2. Test at localhost:8080 - enter plan mode, add mics, examine schedule card
3. Grade on 15 factors (be brutal, 100 is perfection)
4. Compare to Uber trip card, Google Calendar, Apple Reminders
5. Fix any visual/UX issues first
6. Add "Suggested Mics" feature:
   - Algorithm: find mics that fit time gaps between scheduled mics
   - UI: show below schedule items, one-tap add
   - Make it simple and unobtrusive
7. Re-test and re-grade
8. Iterate until ALL factors score 95+/100

The suggested mics should be SIMPLE - don't overcomplicate. Just show 1-3 mics that fit the gaps.
```
