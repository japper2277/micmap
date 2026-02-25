# UX Fixes

## High Priority

### ~~1. Focus trap on venue modal + Escape to close~~ DONE
- Focus trap was already implemented in modal.js (all 3 open paths)
- Added Escape key handler for filter popovers in filters.js
- **Grade: B** — Escape handler now covers all 4 popovers (time, borough, price, more menu) with focus return to trigger button. Two competing global `keydown` listeners exist (modal.js + filters.js); filters.js checks if modal is open first (good), and load order is deterministic in this app (modal.js loads before filters.js). Missing: Escape doesn't close the drawer on mobile.

### ~~2. Retry on API failure~~ DONE
- Error state with "Try again" button in list on fetch failure (app.js)
- Geolocation error now shows toast with "Retry" action (map.js)
- **Grade: C+** — Retry-on-fetch uses inline HTML with hardcoded `#f43f5e` instead of `var(--rose)` — fragile and inconsistent with the token system. Geolocation retry detects PERMISSION_DENIED (code 1) and shows a different message, but the retry action still calls `getUserLocation()` which will just get denied again on iOS Safari. Should show "Enable in Settings" instead of "Retry" for code 1. No differentiation between timeout (code 3) and position unavailable (code 2).

### ~~3. Standardize color tokens~~ DONE
- Unified to `--green: #22c55e`, `--green-dark: #16a34a`, `--red: #ef4444`, `--red-dark: #dc2626` in base.css
- Replaced primary status hex values with var() across CSS files
- **Grade: B** — The main status colors (`--green`, `--red`) are properly tokenized. But `--green-dark` and `--red-dark` are defined in base.css and never actually used — hardcoded `#16a34a` appears 13+ times and `#dc2626` appears 3+ times across map.css, stream.css, modal.css. Additional untracked color synonyms: `#4ade80` (green-lighter, 5+ uses), `#e11d48` (rose-dark, 3 uses), `#6b7280` (future gray) — none have CSS variables. The core sweep was solid but the token system is incomplete.

### ~~4. Debounce render()~~ DONE
- Added `renderDebounced()` wrapper (50ms) in render.js
- All 9 filter-triggered render calls in filters.js now use debounced version
- **Grade: B-** — Core debounce logic is correct and covers all filter operations. But several render paths bypass the debounce: map zoom threshold crossing calls `render()` directly, pin-drop transit recalculation triggers unprotected render, and the tomorrow-fallback in `loadData()` calls `render()` directly. 50ms may be too aggressive — at 60fps that's only 3 frames, and on slower devices rapid filter changes could collapse into a single render losing user feedback.

---

## Medium Priority

### ~~5. Popover keyboard support~~ DONE
- Enter/Space toggles time/borough/price/commute from filter buttons
- Arrow keys navigate options inside open popover
- Popover auto-focuses active option on open
- **Grade: B+** — Arrow key navigation with wrapping is solid. Enter/Space on filter buttons correctly opens popovers or cycles non-popover filters. Enter on a focused popover option now triggers `click()` on the element, completing the keyboard-only flow: Tab to filter → Enter to open → Arrow to navigate → Enter to select. Uses `focused.click()` which fires the native onclick handler. Clean and minimal.

### ~~6. Fix popover event listener leak~~ DONE
- Removed all 4 boolean tracking flags and 6 per-popover outside-click functions
- Replaced with persistent document click listeners that check all popovers
- **Grade: A-** — No dangling boolean flags remain (verified). The replacement is two persistent click listeners (one for time picker dropdowns, one for all popovers) rather than one consolidated listener, but both are minimal and efficient. O(4) iteration per click is negligible. `typeof` guards handle missing close functions. No race conditions, no state to drift. Cleanest fix in the batch.

### ~~7. Colorblind-safe status markers~~ DONE
- Upcoming pills: 2px solid white border; upcoming tickets: 2px outline; upcoming dots: white ring + glow
- Future pills: flat, borderless; future dots: hollow (transparent bg + gray border, smaller at 6px vs 8px)
- Live: solid fill + pulse animation
- **Grade: B-** — Good structural differentiation: upcoming has white border ring, future is hollow/flat, live pulses. Three non-color signals (border, fill style, animation). But live (green) vs upcoming (red) is still primarily color-dependent — a protanopia user sees both as similar brownish tones with different borders. A shape difference (rounded vs angular pill) or text prefix ("LIVE" vs "SOON") would be more effective. Future is well-differentiated via hollow shape.

### ~~8. Better discoverability for custom time range~~ DONE
- Removed divider that buried Custom Range below a visual wall
- Added dashed-border + tinted background to Custom Range option so it reads as "this one is different"
- When custom is already active and user reopens the time popover, custom inputs auto-expand (no extra tap)
- Active state gets rose-tinted border + background to reinforce selection
- Filter pill shows actual range (e.g. "5pm-9pm") synced to both desktop and mobile labels
- **Grade: B+** — Three real improvements: removing the divider is the biggest win, auto-expand on reopen removes a tap, and dashed-border treatment makes Custom Range visually distinct. The chevron rotation on active is a nice touch. Still not perfect — on first visit it's the 5th option so a new user might not scroll to it. But the dashed border draws the eye and repeat use is now frictionless.

### ~~9. Consolidate filter state management~~ DONE
- Removed `STATE.isDrawerOpen` entirely — all 7 reads now use `STATE.drawerState === DRAWER_STATES.OPEN`
- Removed 4 writes and 1 property declaration across drawer.js, state.js
- Zero remaining references to `isDrawerOpen` in any JS file (verified)
- **Grade: A** — Complete, clean removal. Single source of truth for drawer state. No remnants, no backwards-compat shims. Eliminates a real bug vector where two properties had to stay in sync.

---

## Low Priority (Polish)

### ~~10. Pull-to-refresh~~ DONE
- Added refresh button (spinning arrows icon) in drawer header controls group
- `refreshMicData()` in app.js calls `loadData()` with spinning animation feedback
- CSS for `.refresh-btn` with `.spinning` state animation
- **Grade: B** — `refreshMicData()` now fetches fresh data independently from `loadData()` and calls `render(STATE.currentMode)` to preserve the current view. Calendar mode, tomorrow mode, and custom filters all survive a refresh. Shows success/error toast for feedback. The venue warnings are duplicated between `loadData()` and `refreshMicData()` (could extract a shared helper), but it works correctly. Doesn't re-hydrate saved routes on refresh — acceptable since route state is already in memory.

### ~~11. Toast stacking~~ DONE
- New toasts now dismiss existing toasts before appearing
- **Grade: B** — Core "last one wins" logic is correct for this app's use case. But race conditions exist: if `show()` is called 3 times in <100ms, you get visual flashing during overlapping fade-out/fade-in transitions. Action callbacks on old toasts can fire during the 300ms fade-out window after a new toast replaces them. A simple debounce would fix both issues.

### ~~12. Landscape orientation~~ DONE
- Added `@media (max-height: 500px) and (orientation: landscape)` block in responsive.css
- Shrinks search bar (48→40px), filter pills (44→34px), and repositions filter bar
- Drawer peek reduced from 120px to 80px to leave more map visible
- Drawer open height capped at 60vh instead of 68vh
- **Grade: B** — Media query now includes `max-width: 767px` guard, so it only targets landscape phones — won't fire on short desktop windows or landscape tablets. Saves ~60px of vertical space on a 375px landscape viewport (~16% more map). The drawer math is tight (search 40px + filters 34px + 60vh drawer = ~151px list content on shortest phones) but usable — most users spend brief moments in landscape.

### ~~13. Onboarding hints~~ DONE
- First-visit sequential toast hints (3 messages, staggered at 2.5s/7s/11.5s)
- Tap markers, use filters, tap crosshair — the 3 most important actions
- localStorage flag `micmap_onboarded` prevents repeat showing
- **Grade: B** — Hints now cancel on first user interaction (click or touch). Any tap on the map, a marker, a filter, or the drawer cancels all pending hint timers. localStorage flag is only set after the last hint fires or after cancellation — if user closes before seeing any hints, they'll see them next visit. Cleanup removes event listeners after use. Still no "replay from settings" option, but the core issues (fire-and-forget, premature flag, no cancellation) are all resolved.

### ~~14. Undo on schedule clear~~ N/A
No "clear all" button exists in the UI. Route is only cleared on `exitPlanMode()` which persists to schedules first. Not a real issue.

---

## Transit (Later)

### 15. Loading indicators for transit calculations
Transit calculations take 2-3s with zero feedback — users think the app is frozen.
- Show spinner/progress during transit time calculations
- Show inline loader when switching date modes or applying filters that trigger re-render
- The commute toast exists (`#commute-toast`) but isn't used consistently

### 16. Retry on transit API failure
Transit API failures silently fail with no recovery path.
- Show inline error with retry instead of silent fail

---

## Summary

| Fix | Grade | Notes |
|-----|-------|-------|
| 1. Focus trap + Escape | B | All 4 popovers covered, dual listener order is deterministic |
| 2. Retry on API failure | C+ | Hardcoded styles, PERMISSION_DENIED retry is useless on iOS |
| 3. Color tokens | B | Main tokens done, but --green-dark/--red-dark defined and never used |
| 4. Debounce render | B- | Filters debounced, but map zoom and pin-drop bypass it |
| 5. Popover keyboard | B+ | Full keyboard flow: open → arrow navigate → Enter to select |
| 6. Listener leak fix | A- | Clean, no leaks, two listeners instead of one (minor) |
| 7. Colorblind markers | B- | Good structural cues, live vs upcoming still color-dependent |
| 8. Custom time discoverability | B+ | Dashed border, auto-expand, divider removed |
| 9. State consolidation | A | Complete removal, zero remnants |
| 10. Pull-to-refresh | B | Preserves current view mode, success/error toast feedback |
| 11. Toast stacking | B | Works but race conditions on rapid calls |
| 12. Landscape | B | max-width guard added, scoped to phones only |
| 13. Onboarding | B | Cancels on interaction, deferred localStorage flag |
| 14. Undo schedule clear | N/A | Problem doesn't exist |

**Overall: B** — Three clean wins (listener leak A-, state consolidation A, keyboard B+). Solid middle tier (landscape, onboarding, refresh, color tokens, custom time, toast all at B/B+). Remaining weak spots: retry (C+, needs iOS-aware messaging), debounce (B-, map zoom bypasses it), colorblind markers (B-, live vs upcoming still color-dependent).
