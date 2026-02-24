# Code Audit Status

## Fixed
| # | Finding | Fix |
|---|---------|-----|
| 1 | Missing `./services/slotted` import crash | Try/catch with stubs |
| 6 | `parseInt(limit)` NaN → empty results | `parseInt(limit) \|\| 3` fallback |
| 7 | Double logging (request logged twice) | `res._logged` guard |
| 9 | Transit proxy skips destination validation | Added `isValidCoord()` check |

## Still Needs Fixing
| # | Finding | Severity | Area |
|---|---------|----------|------|
| 2 | Wrong-direction subway validation | Bug | `server.js` ~L1300 |
| 3 | DST month heuristics wrong ~2 weeks/year | Bug | `server.js` ~L1246 |
| 4 | After-midnight departures get today's date | Bug | `server.js` subway routes |
| 10 | Serial MTA calls in nested loops | Perf | `server.js` route validation |

### #2 — Wrong-direction stop ID
Destination uses non-directional `toStationId` while origin uses directional stop ID (with N/S suffix). Alternative-line validation compares apples to oranges → valid routes get rejected.

### #3 — DST heuristics
```js
// Current (wrong ~2 weeks/year):
month <= 2 → EST, month >= 11 → EST, else EDT
```
Early March (before spring-forward) and late October (before fall-back) get the wrong offset. Should use `America/New_York` timezone conversion instead.

### #4 — After-midnight departure dates
Wrapped after-midnight departures (e.g., 25:30 → 1:30 AM) get stamped with today's date. At night this produces timestamps in the past. Need to detect the wrap and add +1 day.

### #10 — Serial MTA fetches
Route validation has nested `for` loops with `await` per iteration. Worst case: 100+ serial MTA API calls. Should batch independent calls with `Promise.all()`.

## Not Worth Fixing
| # | Finding | Reason |
|---|---------|--------|
| 5 | React list keys unstable | Hallucinated — no React in this project |
| 8 | HERE quota reset not at midnight | Cosmetic — quota still prevents overage |
| 11 | Redis `KEYS` command | Admin-only endpoints, fine at this scale |
| 12 | Dijkstra priority queue O(n² log n) | Works — optimize if latency becomes a problem |
