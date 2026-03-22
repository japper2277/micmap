# My Night Brutal QA Audit

Date: March 22, 2026
Audited surfaces: inline `My Night` on the main map, dedicated `Plan My Night` planner
Audit mode: report-only, no fixes applied

## Method
- Re-ran existing route/date unit tests with `node --test map_designs/newest_map/js/tests/*.test.cjs` and confirmed 8/8 passing.
- Performed static code review on the state, render, share, planner, and transit flows.
- Ran targeted runtime harnesses against the feature scripts to verify high-risk behaviors without mutating repo state.
- No interactive browser session was available for this pass, so touch/visual/layout scenarios are marked `code reviewed` or `not verified` instead of `live verified`.

## Baseline
- Existing automated coverage is narrow and focused on date helpers, persistence helpers, and commute hydration.
- There is no direct automated coverage for the dedicated planner's edit flows (`swap`, `remove`, `undo`, `insert`) or the inline mobile `My Night` sheet behavior.
- This means green tests currently do not prove the feature is healthy.

## Findings

### P1. Exiting plan mode wipes the visible route even after it is saved
Affected surface: inline `My Night`
Proof: `test verified` via ad hoc runtime harness + `code reviewed`
Repro:
1. Enter plan mode and add at least one mic.
2. Exit plan mode with the header close action.
Expected:
- The route stays visible in the active day's `My Night` state after exit.
- Exiting plan mode should change presentation, not silently clear the visible itinerary.
Actual:
- `exitPlanMode()` persists the route, then immediately clears `STATE.route` and `STATE.dismissed`.
- Runtime harness result: `{"route":[],"dismissed":[],"planMode":false,"persisted":1,"rendered":["today"],"markerUpdated":1}`.
Impact:
- The primary flow loses visible user state at the moment they leave plan mode.
- Users can think their route was deleted even though it still exists in `STATE.schedules`.
Likely root cause:
- [`map_designs/newest_map/js/app.js:639`](../map_designs/newest_map/js/app.js) persists first, then hard-resets route state at lines 645-647 before re-rendering.
Confidence: High
Recommended next action:
- Preserve `STATE.route` on exit and let the non-plan UI render the saved route for the active date.

### P1. The dedicated planner ties planning-day logic to wall-clock `new Date()` instead of the route's actual planning day
Affected surface: `Plan My Night`
Proof: `test verified` via ad hoc runtime harness + `code reviewed`
Repro:
1. Simulate 2:00 AM EDT on Sunday, March 22, 2026 and call `setDayToToday()`.
2. Process a mic with `day: "Friday"` and `startTime: "12:00 PM"` at noon on Sunday, March 22, 2026.
Expected:
- The planner's default day, "time has passed" validation, and mic status should be derived from the planning context, not raw wall-clock "today".
- Future-day routes should never inherit `Live` / `Soon` status from the current date.
Actual:
- Runtime harness result for `setDayToToday()`: `Sunday`.
- Runtime harness result for processed Friday mic: `{"day":"Friday","status":"live","start":"Sun Mar 22 2026 12:00:00 GMT-0400 (Eastern Daylight Time)"}`.
Impact:
- After-midnight sessions can default to the wrong day.
- Future-day and non-today plans can be mislabeled as `Live` or `Soon`.
- Shared routes can carry misleading urgency/status badges.
Likely root cause:
- [`map_designs/newest_map/planmynight/js/app.js:640`](../map_designs/newest_map/planmynight/js/app.js) selects the default day from `new Date()`.
- [`map_designs/newest_map/planmynight/js/utils.js:179`](../map_designs/newest_map/planmynight/js/utils.js) and [`map_designs/newest_map/planmynight/js/utils.js:184`](../map_designs/newest_map/planmynight/js/utils.js) build time state from the current wall clock.
- [`map_designs/newest_map/planmynight/js/data.js:6`](../map_designs/newest_map/planmynight/js/data.js) and [`map_designs/newest_map/planmynight/js/data.js:10`](../map_designs/newest_map/planmynight/js/data.js) compute mic status from that wall-clock date.
- [`map_designs/newest_map/planmynight/js/utils.js:425`](../map_designs/newest_map/planmynight/js/utils.js) validates "start time has already passed" against wall-clock today.
Confidence: High
Recommended next action:
- Centralize planning-day semantics and route all default-day, status, and validation logic through that source of truth.

### P2. The inline mobile `My Night` sheet header shows today's date instead of the active planning date
Affected surface: inline `My Night`
Proof: `test verified` via ad hoc runtime harness + `code reviewed`
Repro:
1. Load a route whose only mic starts on March 25, 2026.
2. Open the mobile `My Night` sheet on March 22, 2026.
Expected:
- The sheet header should reflect the active planning date or selected schedule date.
Actual:
- Runtime harness result: header text was `Tonight, Mar 22`.
Impact:
- Saved routes for tomorrow or any calendar-selected date are mislabeled as if they are for today.
- Users can follow, share, or edit the wrong schedule context.
Likely root cause:
- [`map_designs/newest_map/js/render.js:1905`](../map_designs/newest_map/js/render.js) through [`map_designs/newest_map/js/render.js:1913`](../map_designs/newest_map/js/render.js) build the header from `new Date()` instead of `getActivePlanningDate()` / `STATE.selectedCalendarDate`.
Confidence: High
Recommended next action:
- Derive the sheet header label from the same active planning date logic used by calendar mode and saved schedules.

### P2. Planner route-option tabs swallow specific route-builder failures and replace them with a generic toast
Affected surface: `Plan My Night`
Proof: `test verified` via ad hoc runtime harness + `code reviewed`
Repro:
1. Build a route state where `buildRouteForPriority()` returns a structured error such as a pinned mic being unreachable.
2. Switch to a different route tab like `Less Travel`.
Expected:
- The tab switch should surface the specific error message and suggestion returned by the planner.
Actual:
- Runtime harness result: `Could not build this route option. Try again.`
- The more useful route-builder message never reaches the user on tab switch.
Impact:
- Users lose the exact reason a route option failed right when they are comparing alternatives.
- This makes pinned-mic and constraint failures harder to recover from.
Likely root cause:
- [`map_designs/newest_map/planmynight/js/planner.js:34`](../map_designs/newest_map/planmynight/js/planner.js) through [`map_designs/newest_map/planmynight/js/planner.js:47`](../map_designs/newest_map/planmynight/js/planner.js) handle empty routes generically.
- The route-builder returns specific structured errors at [`map_designs/newest_map/planmynight/js/planner.js:257`](../map_designs/newest_map/planmynight/js/planner.js) and [`map_designs/newest_map/planmynight/js/planner.js:306`](../map_designs/newest_map/planmynight/js/planner.js), but that detail is ignored in `selectRouteTab()`.
Confidence: High
Recommended next action:
- Reuse the same structured error handling path in `selectRouteTab()` that `planMyNight()` already uses for first-run failures.

### P2. The primary mobile `My Night` share action sends an empty URL while the desktop flow builds a real share link
Affected surface: inline `My Night`
Proof: `test verified` via ad hoc runtime harness + `code reviewed`
Repro:
1. Add a route and tap the mobile `Share` button in the `My Night` bottom sheet.
2. Capture the payload passed to `navigator.share`.
Expected:
- Mobile share should include the same reusable `micfinder.io/share` link the desktop flow builds.
Actual:
- Runtime harness payload: `{"title":"My Night - Open Mic Plan","text":"My Night Plan:\n8:00 PM - Mic A","url":""}`.
- The desktop share menu's `Share Link` path builds `https://micfinder.io/share/?plan=...`, but the mobile sheet does not.
Impact:
- The main mobile share CTA degrades to plain text instead of a shareable plan link.
- Mobile and desktop users get materially different outcomes from "Share".
Likely root cause:
- [`map_designs/newest_map/index.html:280`](../map_designs/newest_map/index.html) routes the mobile button to `shareMyNight()`.
- [`map_designs/newest_map/js/render.js:2163`](../map_designs/newest_map/js/render.js) expects `buildShareUrl()`, but no implementation exists in the map bundle.
- [`map_designs/newest_map/js/utils.js:514`](../map_designs/newest_map/js/utils.js) already builds the proper share URL for the desktop `copyScheduleAsText()` path.
Confidence: High
Recommended next action:
- Unify mobile and desktop share generation so both use the same canonical plan URL builder.

### P3. The planner's remove-confirm modal leaves global `keydown` listeners behind on non-Escape dismiss paths
Affected surface: `Plan My Night`
Proof: `code reviewed`
Repro:
1. Open the remove-confirm modal.
2. Dismiss it with overlay click, `Cancel`, or `Remove`.
3. Repeat multiple times.
Expected:
- The modal should always remove its document-level `keydown` listener during cleanup.
Actual:
- The listener is only removed when the user presses `Escape`.
- Overlay/cancel/delete cleanup resolves the modal without unregistering the listener.
Impact:
- Long sessions can accumulate dead listeners and produce increasingly unpredictable escape-key behavior.
- This is a low-severity stability leak, not a primary-user-flow blocker.
Likely root cause:
- [`map_designs/newest_map/planmynight/js/transit.js:83`](../map_designs/newest_map/planmynight/js/transit.js) cleans up the modal, but only [`map_designs/newest_map/planmynight/js/transit.js:96`](../map_designs/newest_map/planmynight/js/transit.js) removes the listener, and only on the Escape path.
Confidence: Medium
Recommended next action:
- Remove the document listener inside the shared `cleanup()` function so every dismiss path is symmetrical.

## Coverage Matrix

| Scenario | Status | Notes |
| --- | --- | --- |
| Existing schedule/date helper tests | test verified | `node --test map_designs/newest_map/js/tests/*.test.cjs` passed 8/8 |
| Inline `My Night` sheet date/header accuracy | test verified | Ad hoc runtime harness reproduced wrong `Tonight, Mar 22` header for March 25 route |
| Inline exit-plan-mode state preservation | test verified | Ad hoc runtime harness showed `STATE.route` cleared on exit |
| Inline add/remove/reorder/duration happy path | code reviewed | No browser-session verification in this pass |
| Inline mobile share payload | test verified | Ad hoc runtime harness captured empty `url` in `navigator.share` payload |
| Planner default day and planning-day logic | test verified | Ad hoc runtime harness showed `setDayToToday()` selects `Sunday` at 2:00 AM EDT on March 22, 2026 |
| Planner future-day status correctness | test verified | Ad hoc runtime harness marked a Friday mic as `live` on Sunday wall-clock noon |
| Planner first-run route generation | code reviewed | No live API/browser run in this pass |
| Planner alternate-tab error handling | test verified | Ad hoc runtime harness reproduced generic toast replacing specific error |
| Planner swap/remove/undo/insert editing flows | code reviewed | High-risk area, no direct automated coverage found |
| Geolocation permission flows | code reviewed | No device/browser permission prompt available in this pass |
| Visual layout, touch feel, motion, accessibility focus behavior | not verified | Requires interactive browser/device session |

## Residual Risk / Testing Gaps
- The green unit suite does not exercise the inline mobile sheet, planner tabs, or planner editing flows.
- The highest-risk unproven runtime area is the dedicated planner's edit stack (`swap`, `remove`, `undo`, `insert`) under real browser conditions.
- A live mobile/browser pass is still needed for animations, focus management, scroll behavior, and tap-target ergonomics.

## Scorecard

| Surface | Score | Verdict |
| --- | --- | --- |
| Inline `My Night` | 61/100 | Core idea works, but route state, dating, and mobile sharing are not reliable enough |
| `Plan My Night` planner | 52/100 | Strong UI ambition, weak date semantics and thin runtime safety net |
| Overall feature set | 56/100 | Not ship-ready |

## Remediation Backlog
- Fix state continuity first: preserve the visible route when leaving plan mode.
- Fix planning-day semantics second: one source of truth for default day, status, and time validation.
- Fix share consistency third: one canonical share-link generator used by both mobile and desktop.
- Add direct tests for planner tabs, planner editing flows, and the inline mobile sheet before any release candidate.
