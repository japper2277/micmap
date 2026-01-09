# Transit API Fix Plan

## Phase 1: Fix `extractArrivals` bugs (DONE)
**596 bugs → 93 bugs**

| Fix | Bug Type | Count | Status |
|-----|----------|-------|--------|
| 1. Filter by requested line | WRONG_LINE | 143 | ✅ Done |
| 2. Dedupe by tripId | DUPLICATES | 34 | ✅ Done |
| 3. Add destination | NO_DESTINATION | 288 | ✅ Done |
| 4. Slice after filtering | INCOMPLETE | 85 | ✅ Done |
| 5. Strip X suffix (6X→6) | UX cleanup | - | ✅ Done |

**File:** `api/server.js` lines 443-554

---

## Phase 1b: Fix direction labels (NOW)
**93 bugs → ~50 bugs**

### Problem
Direction labels in `customDirections` are wrong for J/Z/M lines.
Verified against Transiter API (ground truth).

### Current vs Correct

| Line | N stopId goes to | Our N Label | Correct N Label |
|------|------------------|-------------|-----------------|
| L | 8 Av (Manhattan) | "Manhattan" | ✅ Correct |
| G | Court Sq (Queens) | "Queens" | ✅ Correct |
| J | Jamaica Center (Queens) | "Manhattan" | ❌ "Jamaica" |
| Z | Jamaica Center (Queens) | "Manhattan" | ❌ "Jamaica" |
| M | Jamaica Center (Queens) | "Manhattan" | ❌ "Queens" |

| Line | S stopId goes to | Our S Label | Correct S Label |
|------|------------------|-------------|-----------------|
| L | Canarsie (Brooklyn) | "Brooklyn" | ✅ Correct |
| G | Church Av (Brooklyn) | "Brooklyn" | ✅ Correct |
| J | Broad St (Manhattan) | "Queens" | ❌ "Manhattan" |
| Z | Broad St (Manhattan) | "Queens" | ❌ "Manhattan" |
| M | Forest Hills (Queens) | "Brooklyn" | ❌ "Queens" |

### Fix needed

**File:** `api/server.js` lines 494-501

```javascript
// Current (WRONG)
'J': { N: 'Manhattan', S: 'Queens' },
'Z': { N: 'Manhattan', S: 'Queens' },
'M': { N: 'Manhattan', S: 'Brooklyn' },

// Fixed
'J': { N: 'Jamaica', S: 'Manhattan' },
'Z': { N: 'Jamaica', S: 'Manhattan' },
'M': { N: 'Queens', S: 'Queens' },
```

**File:** `docs/transit-api-audit/test-all-venues.js` lines 233-237

```javascript
// Current test filter (missing 'jamaica' and 'manhattan' for S)
if (dir === 'N') return d.includes('uptown') || d.includes('manhattan') || d.includes('queens');
return d.includes('downtown') || d.includes('brooklyn');

// Fixed - add 'jamaica' to N, 'manhattan' to S
if (dir === 'N') return d.includes('uptown') || d.includes('manhattan') || d.includes('queens') || d.includes('jamaica');
return d.includes('downtown') || d.includes('brooklyn') || d.includes('manhattan');
```

---

## Phase 2: Fix venue/station mappings (NEXT)
**~50 bugs → ~10 bugs**

### Bad coordinates (6 venues)
- Eastville Comedy Club
- Phoenix Bar
- Phoenix Bar Avenue A
- New York Comedy Club Midtown
- Caravan of Dreams
- Windjammer

### Wrong station IDs
- Comedy Shop → using A32, should be D20
- Broadway Comedy Club → using 902 (shuttle), needs R16/127
- Times Sq venues → need multi-stop mapping

### Complex stations needing per-line stop IDs
```javascript
// Union Square
{ "4": "635", "5": "635", "6": "635", "L": "L03", "N": "R20", "Q": "R20", "R": "R20", "W": "R20" }

// Times Square
{ "1": "127", "2": "127", "3": "127", "7": "725", "N": "R16", "Q": "R16", "R": "R16", "W": "R16", "S": "902" }

// Herald Square
{ "B": "D17", "D": "D17", "F": "D17", "M": "D17", "N": "R17", "Q": "R17", "R": "R17", "W": "R17" }
```

---

## Phase 3: Schedule & Alert Integration (LATER)

### 3a. Alert-aware routing
- Fetch `/api/mta/alerts` before routing
- If line is suspended/delayed, adjust route
- Show alert in UI: "⚠️ 4 running local"

**Current example:** 4 train running local from 42 St, but Dijkstra still calculates express timing.

### 3b. Late night schedule (12am-6am)
Lines that don't run:
- B → suggest D instead
- W → suggest N instead
- Z → J covers same route

### 3c. Weekend schedule
- Some express trains run local
- Adjust stop counts and timing

### 3d. Rush hour only lines
- Z train (rush hour peak direction only)
- 7X express (rush hour only)
- 6X express (rush hour only)

---

## Test Commands

```bash
# Run full venue test
node docs/transit-api-audit/test-all-venues.js

# Compare single venue
node docs/transit-api-audit/test-compare-apis.js

# Test specific route
curl "http://localhost:3001/api/subway/routes?userLat=40.7288&userLng=-74.0001&venueLat=40.7527&venueLng=-73.9094"

# Check alerts
curl "http://localhost:3001/api/mta/alerts"
```

---

## Files

| File | Purpose |
|------|---------|
| `api/server.js` | Main API - extractArrivals needs fixing |
| `scripts/subway-router.js` | Dijkstra routing - works correctly |
| `public/data/stations.json` | Station data with stop IDs |
| `public/data/graph.json` | Subway graph for Dijkstra |

---

## Progress

- [x] Identify bugs (596 found)
- [x] Create test suite
- [x] Document root causes
- [x] Phase 1: Fix extractArrivals (596 → 93 bugs)
- [x] Phase 1b: Fix direction labels (J/Z/M) (93 → ~80 bugs)
- [x] Phase 2: Fix venue/station mappings (80 → 46 bugs)
  - Fixed station search radius (0.3mi → 1.0mi)
  - Fixed test coordinates to match mics.json
  - Fixed 7 train MTA feed URL (was gtfs-7, should be gtfs)
  - Fixed Grove 34 coordinates (was Herald Sq, should be Astoria)
- [x] Phase 3: Schedule & alert integration
  - 3a: Routes now include relevant MTA alerts
  - 3b: Late night (12am-6am) auto-swaps B→D, W→N, Z→J
  - 3c: Response includes schedule context (isWeekend, note)
  - 3d: Rush hour lines (Z/7X/6X) filtered by real-time validation
