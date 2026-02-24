# PLAN 4: Calendar Planning & Google Calendar Integration

## SCOPE BOUNDARIES (DO NOT TOUCH)
- ONLY work on calendar/date planning UI
- ONLY add Google Calendar export/sync
- DO NOT fix plan mode bugs (Plan 1)
- DO NOT change +6:00/+8:00 buttons (Plan 2)
- DO NOT change My Schedule card design (Plan 3)
- DO NOT change map markers (Plan 5)

## Files in Scope
- `map_designs/newest_map/js/calendar.js` - Date picker (existing)
- `map_designs/newest_map/js/planner.js` - Route/schedule state
- `map_designs/newest_map/index.html` - New calendar UI elements
- `map_designs/newest_map/css/controls.css` - Calendar styles
- NEW: Calendar planning view components

## Reference Mockups
- `/Users/jaredapper/Desktop/micmap/map-planner-v2.html`
- `/Users/jaredapper/Desktop/micmap/planner-prototype.html`
- `/Users/jaredapper/Desktop/micmap/plannight.md`

---

## FEATURE REQUIREMENTS

### 1. Calendar Planning View
- User can see a week/month calendar
- Days with scheduled mics are highlighted
- Tap a day to see that day's schedule
- Plan multiple nights in advance

### 2. Google Calendar Integration
- "Add to Google Calendar" button
- Creates events for each scheduled mic
- Includes venue name, address, time
- Optional: recurring mic reminders

---

## CURRENT STATE

### Existing Calendar Feature
- Date picker carousel (today/tomorrow/calendar picker)
- Can view mics for any date
- No multi-day planning
- No Google Calendar integration

### What's Missing
- Week/month calendar view
- Multi-day schedule overview
- Export to Google Calendar
- Sync with Google Calendar

---

## CURRENT IMPLEMENTATION GRADE

### Grading Factors (1-100 scale)

| Factor | Score | Notes |
|--------|-------|-------|
| 1. Date Selection | ?/100 | Current carousel UX |
| 2. Week View | 0/100 | DOESN'T EXIST |
| 3. Month View | 0/100 | DOESN'T EXIST |
| 4. Multi-Day Planning | 0/100 | DOESN'T EXIST |
| 5. Schedule Overview | 0/100 | DOESN'T EXIST |
| 6. Google Calendar Export | 0/100 | DOESN'T EXIST |
| 7. Google Calendar Sync | 0/100 | DOESN'T EXIST |
| 8. Visual Design | ?/100 | Calendar aesthetics |
| 9. Mobile UX | ?/100 | Touch-friendly calendar |
| 10. Navigation | ?/100 | Easy to move between days/weeks |
| 11. Accessibility | ?/100 | Screen reader support |
| 12. Performance | ?/100 | Fast calendar rendering |

**TOTAL: ?/1200 = ?/100 average**

---

## COMPARISON BENCHMARKS

### Industry Standard: Google Calendar
- Clean week/month views
- Easy event creation
- Color-coded categories
- Quick navigation

### Industry Standard: Fantastical
- Natural language input
- Beautiful calendar visuals
- Quick glance at upcoming
- Easy sharing

### Industry Standard: Notion Calendar
- Minimalist design
- Easy drag-and-drop
- Integration with other tools
- Week view with time blocks

---

## DESIGN PROPOSAL

### Calendar View Options

#### Option A: Week Strip
```
┌─────────────────────────────────────────────┐
│  < Jan 2026 >                               │
├─────────────────────────────────────────────┤
│ SUN  MON  TUE  WED  THU  FRI  SAT          │
│  26   27   28   29   30   31    1           │
│       ●         ●    ●●                     │ <- dots = scheduled mics
└─────────────────────────────────────────────┘
```

#### Option B: Full Calendar Modal
```
┌─────────────────────────────────────────────┐
│      ←  January 2026  →                     │
├─────────────────────────────────────────────┤
│ S    M    T    W    T    F    S             │
│                1    2    3    4              │
│ 5    6    7    8    9   10   11             │
│      ●              ●●                       │
│ 12   13   14   15   16   17   18            │
│ 19   20   21   22   23   24   25            │
│ 26   27   28   29   30   31                 │
├─────────────────────────────────────────────┤
│ Jan 9: 2 mics scheduled                     │
│ • 7pm Grisly Pear                           │
│ • 9pm Creek & Cave                          │
├─────────────────────────────────────────────┤
│ [Add to Google Calendar]                    │
└─────────────────────────────────────────────┘
```

### Google Calendar Integration

#### Export Flow
1. User clicks "Add to Google Calendar" button
2. Opens Google Calendar event creation with:
   - Title: "Open Mic @ [Venue]"
   - Time: Mic start time
   - Location: Venue address
   - Description: Price, signup info, link back to app
3. User confirms in Google Calendar

#### Implementation Options
1. **URL Scheme** (simplest): Generate Google Calendar URL
   ```
   https://calendar.google.com/calendar/render?action=TEMPLATE
   &text=Open+Mic+@+Grisly+Pear
   &dates=20260109T190000/20260109T210000
   &location=107+MacDougal+St,+New+York
   &details=...
   ```

2. **Google Calendar API** (more complex): Full read/write sync
   - Requires OAuth
   - Can detect conflicts
   - Can update events

---

## IMPLEMENTATION PLAN

### Phase 1: Calendar UI
- [ ] Add week strip below date picker
- [ ] Highlight days with scheduled mics
- [ ] Tap day to filter to that day
- [ ] Show schedule summary for selected day

### Phase 2: Google Calendar Export
- [ ] Add "Add to Calendar" button in schedule card
- [ ] Generate Google Calendar URL for single mic
- [ ] Generate Google Calendar URL for full schedule
- [ ] Open in new tab/window

### Phase 3: Calendar View Modal (Optional)
- [ ] Full month view modal
- [ ] Day detail view
- [ ] Quick navigation

### Phase 4: Polish & Grade
- [ ] Test all flows
- [ ] Grade each factor
- [ ] Iterate until 95+

---

## TECHNICAL DETAILS

### Google Calendar URL Format
```javascript
function generateGoogleCalendarUrl(mic) {
  const title = encodeURIComponent(`Open Mic @ ${mic.venue}`);
  const startTime = formatGoogleTime(mic.start);
  const endTime = formatGoogleTime(new Date(mic.start.getTime() + 90*60000));
  const location = encodeURIComponent(mic.address);
  const details = encodeURIComponent(`Price: ${mic.price}\n${mic.signupInstructions}`);

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startTime}/${endTime}&location=${location}&details=${details}`;
}

function formatGoogleTime(date) {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}
```

### Storage for Multi-Day Schedules
```javascript
// localStorage structure
{
  "schedules": {
    "2026-01-09": ["mic-id-1", "mic-id-2"],
    "2026-01-10": ["mic-id-3"],
    // ...
  }
}
```

---

## CHANGES IMPLEMENTED

| # | Change | File:Line | Description |
|---|--------|-----------|-------------|
| 1 | | | |

---

## POST-FIX GRADES

| Factor | Before | After | Delta |
|--------|--------|-------|-------|
| 1. Date Selection | | | |
| 2. Week View | 0 | | |
| ... | | | |

**TOTAL: ?/100 -> ?/100**

---

## TERMINAL PROMPT

```
You are adding Calendar Planning and Google Calendar Integration to MicFinder NYC.

CRITICAL CONSTRAINTS:
- ONLY work on calendar UI and Google Calendar export
- DO NOT fix plan mode bugs (separate plan)
- DO NOT change +6:00/+8:00 buttons (separate plan)
- DO NOT change My Schedule card design (separate plan)
- DO NOT change map markers (separate plan)

CONTEXT:
- Currently: simple date picker carousel (today/tomorrow/pick date)
- Need: better calendar view + Google Calendar export
- Reference mockups in repo: map-planner-v2.html, planner-prototype.html

FILES:
- map_designs/newest_map/js/calendar.js - existing date picker
- map_designs/newest_map/js/planner.js - schedule state
- map_designs/newest_map/css/controls.css - calendar styles

YOUR TASK:
1. Read existing calendar implementation
2. Look at mockups for design ideas
3. Grade current state on 12 factors
4. Implement in phases:
   - Phase 1: Week strip showing which days have mics scheduled
   - Phase 2: "Add to Google Calendar" button (URL scheme, not API)
   - Phase 3: Polish
5. Test thoroughly
6. Re-grade until ALL factors score 95+/100

For Google Calendar: USE URL SCHEME, not API. This is simpler and doesn't require OAuth.
```
