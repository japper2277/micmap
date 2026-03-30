# `newest_map` QA / Debug Audit

Generated: 2026-03-22 12:13:49 EDT

Primary scope: active `map_designs/newest_map` changes and their directly connected API, OG-share, and iOS recorder hooks.

## Executive Summary

- Product findings:
  - `P1`: 2 confirmed
  - `P2`: 3 confirmed
  - `P3`: 1 likely
- Current blockers:
  - API/Jest runtime is blocked in this environment before product assertions run.
  - Native iOS build verification is blocked by local toolchain availability.
- Smoke-check status:
  - `npm run ig:test`: pass
  - `client npm run build`: pass
  - `node --check` on changed JS files: pass
  - `plutil -lint ios/App/App/Info.plist`: pass
  - `api npm test -- --runInBand`: blocked by environment
  - `xcodebuild ... build`: blocked by environment

## Current Blockers

| Area | Blocker | Evidence | Impact |
| --- | --- | --- | --- |
| API tests | `MongoMemoryServer.create()` fails with `listen EPERM: operation not permitted 0.0.0.0` in `api/__tests__/setup.js` | `npm test -- --runInBand` output | API suite is red in this environment before meaningful product assertions run. |
| Local API probing | `supertest` also hits the same listener restriction here | ad hoc route probe failed with `listen EPERM` | Route behavior beyond static inspection cannot be validated end-to-end inside this sandbox. |
| iOS build | `xcodebuild` unavailable because active dev dir points at Command Line Tools, not full Xcode | `xcode-select: error: tool 'xcodebuild' requires Xcode...` | Native compile/runtime validation could not be completed from this machine state. |

## Findings Table

| Severity | Area | Title | Confidence | Reproducibility | Owner Suggestion |
| --- | --- | --- | --- | --- | --- |
| `P1` | OG/API | Plan OG cards call `/api/static-map?markers=...`, but the API only supports `lat`/`lng` | Confirmed | Always | API + edge function |
| `P1` | OG/API | Static map requests exceed Google Static Maps documented `size` limits | Confirmed | Always | API + edge function |
| `P2` | Share / Deep Links | `shareMic()` mutates the current URL even on canceled share and clipboard fallback | Confirmed | Always | Web app |
| `P2` | Share / Environment | Share and OG code hard-code production hosts | Confirmed | Always | Web app + edge function |
| `P2` | iOS / Capacitor | Record Set button is shown for any `window.Capacitor` host and assumes plugin presence | Confirmed | Always in matching hosts | Web app + iOS integration |
| `P3` | Filter parity | `isMicVisible()` no longer mirrors `render()` after alternating-week filtering was added | Likely | Latent | Web app |

## Smoke Checks

### Passing

- Root IG tests:
  - Command: `npm run ig:test`
  - Result: 21/21 passing
- Client build:
  - Command: `cd client && npm run build`
  - Result: success
- Syntax checks:
  - `node --check map_designs/newest_map/js/modal.js`
  - `node --check map_designs/newest_map/js/render.js`
  - `node --check map_designs/newest_map/js/utils.js`
  - `node --check api/server.js`
  - `node --check netlify/edge-functions/og-inject.js`
  - Result: all passed
- Plist lint:
  - Command: `plutil -lint ios/App/App/Info.plist`
  - Result: `OK`

### Blocked

- API tests:
  - Command: `cd api && npm test -- --runInBand`
  - Result: blocked by `MongoMemoryServer` socket bind failure
- iOS build:
  - Command: `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -derivedDataPath /tmp/micmap-derived CODE_SIGNING_ALLOWED=NO build`
  - Result: blocked by local Xcode toolchain configuration

## Detailed Findings

### 1. `P1` `Confirmed` — Plan OG cards request an unsupported `/api/static-map` contract

**Area:** Netlify OG edge function + API

**Repro steps**

1. Generate any shared plan page through the OG edge function path (`?plan=...`).
2. Let `buildPlanPage()` assemble the hero image URL.
3. Observe that the plan page emits `/api/static-map?markers=...`.
4. Compare that with the API route contract in `api/server.js`.

**Expected**

- The plan OG page should call the static-map endpoint using parameters the API route actually accepts.

**Actual**

- The plan OG page emits `markers`, but the API route rejects anything without `lat` and `lng`.

**Evidence**

- [netlify/edge-functions/og-inject.js](../netlify/edge-functions/og-inject.js):568-569 builds:
  - ```${API_BASE}/api/static-map?markers=${encodeURIComponent(markers)}&w=1200&h=630````
  - ```${API_BASE}/api/static-map?markers=${encodeURIComponent(markers)}&w=1200&h=800````
- [api/server.js](../api/server.js):965-978 only reads:
  - `lat`
  - `lng`
  - `zoom`
  - `w`
  - `h`
- [api/server.js](../api/server.js):967 returns `400` when `lat` or `lng` is missing.

**Suspected root cause**

- The edge function and API route were evolved independently and no shared contract test exists for the static-map URL shape.

**Fix direction**

- Pick one contract and enforce it in both places:
  - Option A: extend `/api/static-map` to accept `markers`.
  - Option B: keep `/api/static-map` single-center only and have the edge function compute center/markers in the route-compatible format.
- Add one shared test for the plan OG builder plus one API route test that fails if `markers` becomes unsupported again.

**Verification steps**

1. Load a `?plan=` share URL after the fix.
2. Confirm the generated image URL is accepted by `/api/static-map`.
3. Confirm the hero map and OG meta image render for multi-stop plans.

**Missing automated test**

- Edge function unit test: build a plan page and assert the generated static-map URL matches the API contract.
- API route test: verify a plan-style request returns a redirect instead of `400`.

---

### 2. `P1` `Confirmed` — Static map requests exceed Google Static Maps documented size limits

**Area:** API static-map route + OG/share image generation

**Repro steps**

1. Open the single-mic OG path or plan OG path in code.
2. Follow the generated `/api/static-map` URL.
3. Observe the route forwards `w=1200` and `h=630/800` to Google Static Maps, plus `scale=2`.

**Expected**

- Generated static-map URLs should stay within Google’s supported `size` limits so OG images reliably render.

**Actual**

- The code emits `size=1200x630` or `size=1200x800`, which is above the Maps Static API’s documented `size` limit.

**Evidence**

- [netlify/edge-functions/og-inject.js](../netlify/edge-functions/og-inject.js):109-110 uses:
  - `w=1200&h=800`
  - `w=1200&h=630`
- [netlify/edge-functions/og-inject.js](../netlify/edge-functions/og-inject.js):568-569 repeats the same dimensions for plans.
- [api/server.js](../api/server.js):966-976 forwards those values directly into Google’s Static Maps URL and adds `scale=2`.
- Official reference:
  - [Google Maps Static API overview](https://developers.google.com/maps/documentation/maps-static/overview)
  - The documented `size` limit remains `640x640` for the request parameter.

**Suspected root cause**

- OG image dimensions were chosen for social-card layout, but the implementation forwards them directly to Google Static Maps instead of clamping them to the provider’s request-size constraints.

**Fix direction**

- Clamp request `size` to supported dimensions before redirecting to Google Static Maps.
- If larger rendered assets are required, rely on `scale=2` inside the provider limit or introduce a server-side image composition step instead of asking Google for oversized source images.

**Verification steps**

1. Generate a single-mic OG page.
2. Generate a plan OG page.
3. Confirm the static-map URL stays within provider limits.
4. Confirm the returned image loads in meta previews and hero backgrounds.

**Missing automated test**

- Unit test on static-map URL generation asserting `w <= 640` and `h <= 640`.
- Edge function test verifying generated OG URLs never exceed provider-supported request dimensions.

---

### 3. `P2` `Confirmed` — `shareMic()` mutates the current URL even when share is canceled or clipboard fallback is used

**Area:** Web share flow / deep links

**Repro steps**

1. Trigger `shareMic(micId)` from a card or modal action.
2. Note that `setMicInUrl(micId)` runs before `navigator.share()` or clipboard copy.
3. Cancel native share, or use clipboard fallback.
4. Inspect the page URL.

**Expected**

- The share action should generate a deep link without unexpectedly mutating the current page state when the share is canceled.

**Actual**

- The browser URL is changed immediately and remains changed:
  - canceled native share from a plan page becomes `?plan=...&mic=...`
  - clipboard fallback becomes `?mic=...`

**Evidence**

- [map_designs/newest_map/js/modal.js](../map_designs/newest_map/js/modal.js):1949-1963:
  - builds `shareUrl`
  - calls `setMicInUrl(micId)` before any share/copy outcome is known
- VM check output:
  - canceled share from plan URL => `https://micfinder.io/?plan=a%3A45&mic=mic-1`
  - clipboard fallback => `https://micfinder.io/?mic=mic-2`
- Boot order:
  - [map_designs/newest_map/js/app.js](../map_designs/newest_map/js/app.js):61-70 opens `?mic=` before loading `?plan=`
- URL cleanup:
  - [map_designs/newest_map/js/modal.js](../map_designs/newest_map/js/modal.js):2032-2036 removes `plan` after loading a shared plan, but does not clear `mic`.

**Suspected root cause**

- The code uses current-URL mutation as a shortcut for generating shareable deep links, but does not restore the previous URL on cancel/failure and does not isolate plan-share state from mic-share state.

**Fix direction**

- Do not mutate browser URL just to compute a share link.
- Generate the deep link string directly.
- If current URL must be updated, snapshot and restore it in a `finally` block when the share is canceled or when sharing from non-modal contexts.

**Verification steps**

1. Share a mic from list/card and cancel native share.
2. Confirm the current page URL is unchanged.
3. Share from a plan page and confirm the current page does not end up with mixed `plan` + `mic` params.
4. Refresh after a canceled share and confirm no unexpected modal opens.

**Missing automated test**

- Unit test around `shareMic()` covering:
  - native share success
  - native share reject/cancel
  - clipboard fallback
  - existing `?plan=` query state

---

### 4. `P2` `Confirmed` — Share and OG code hard-code production hosts

**Area:** Share links / edge function environment fidelity

**Repro steps**

1. Inspect the share-link and edge-function URL construction.
2. Compare generated hosts with the current request origin or deployment environment.

**Expected**

- Preview, staging, and local environments should generate links and API calls against their own environment unless production is explicitly intended.

**Actual**

- Current code hard-codes production hosts:
  - share links always use `https://micfinder.io`
  - OG edge fetches and static-map URLs always use `https://micmap-production.up.railway.app`

**Evidence**

- [map_designs/newest_map/js/modal.js](../map_designs/newest_map/js/modal.js):1950 hard-codes `https://micfinder.io/?mic=${micId}`.
- [netlify/edge-functions/og-inject.js](../netlify/edge-functions/og-inject.js):1 hard-codes `API_BASE = 'https://micmap-production.up.railway.app'`.
- [netlify/edge-functions/og-inject.js](../netlify/edge-functions/og-inject.js):113, 119, 134, 610, 818 use `https://micfinder.io` directly in share/meta URLs.

**Suspected root cause**

- Production URLs were inlined during implementation instead of being derived from request origin or deployment configuration.

**Fix direction**

- Centralize app origin and API base in environment-aware config.
- In the edge function, derive canonical/share URLs from `request.url` origin unless explicitly overridden.
- In browser JS, prefer `window.location.origin` or injected config for share links.

**Verification steps**

1. Open the feature in a preview environment.
2. Trigger share and inspect copied/shared URL.
3. Confirm OG pages fetch data and assets from the same environment being tested.

**Missing automated test**

- Unit test that the edge function derives URLs from request origin/config.
- Share-flow test asserting copied URL uses environment-configured origin rather than a hard-coded production host.

---

### 5. `P2` `Confirmed` — Record Set button is shown for any Capacitor host and assumes plugin presence

**Area:** Web modal / native integration

**Repro steps**

1. Initialize the modal in any environment where `window.Capacitor` exists.
2. Observe the Record Set button visibility.
3. Compare the UI behavior with the POC claim that the feature is “iOS only”.

**Expected**

- The button should only be shown when the current platform is supported and the plugin is actually available.

**Actual**

- The button is shown whenever `window.Capacitor` exists.
- The click handler assumes `window.Capacitor.Plugins.WhisperTranscription.presentRecorder()` exists.
- There is no platform check and no plugin-availability check before exposure.

**Evidence**

- [map_designs/newest_map/js/modal.js](../map_designs/newest_map/js/modal.js):99-117 gates only on `window.Capacitor`.
- [ios/WHISPERKIT-POC.md](../ios/WHISPERKIT-POC.md):17 and 46 claim the button is “Only visible on iOS”.
- VM check output:
  - `record_display flex`
  - `has_click_handler function`
  - This was reproduced with only `window.Capacitor = { Plugins: {} }`.

**Suspected root cause**

- The feature was wired as “Capacitor present => show button”, which is weaker than “supported platform + plugin installed + ready”.

**Fix direction**

- Gate UI on all three conditions:
  - Capacitor present
  - platform is `ios`
  - `Plugins.WhisperTranscription` exists and reports ready status
- Prefer an async readiness check via `getStatus()` before showing the button.

**Verification steps**

1. Plain web: button remains hidden.
2. Capacitor iOS with plugin: button visible and functional.
3. Capacitor non-iOS or missing plugin: button hidden or disabled with clear explanation.

**Missing automated test**

- DOM/unit test covering:
  - no Capacitor
  - Capacitor without plugin
  - Capacitor with plugin
  - supported vs unsupported platform

---

### 6. `P3` `Likely` — `isMicVisible()` no longer mirrors `render()` after alternating-week filtering was added

**Area:** Filter parity / future regression risk

**Repro steps**

1. Compare the filtering logic in `render()` vs `isMicVisible()`.
2. Note the new `weekNumbers` filtering in `render()`.
3. Check whether the same rule exists in `isMicVisible()`.

**Expected**

- The helper explicitly documented as “Must mirror the exact filtering logic in render()” should include the new alternating-week rule.

**Actual**

- `render()` filters on `m.weekNumbers`.
- `isMicVisible()` does not.

**Evidence**

- [map_designs/newest_map/js/render.js](../map_designs/newest_map/js/render.js):322-341 adds `weekOfMonth` and `m.weekNumbers.includes(weekOfMonth)`.
- [map_designs/newest_map/js/utils.js](../map_designs/newest_map/js/utils.js):375-405 says it must mirror `render()` but contains no `weekNumbers` check.

**Suspected root cause**

- The new alternating-week feature was added in the main render path without updating the older helper.

**Fix direction**

- If `isMicVisible()` is still part of the intended API surface, update it to match `render()`.
- If not used anymore, delete it to avoid future drift.

**Verification steps**

1. Add/update tests for alternating-week mics.
2. If the helper is retained, assert the helper and render path agree on the same sample data.

**Missing automated test**

- Unit test covering `weekNumbers` across 1st, 2nd, 3rd, and 5th weekday occurrences.

## Areas Reviewed With No Confirmed Product Defect Yet

- Transit modal visibility changes:
  - Static inspection found the new hide/show toggles internally consistent.
  - Runtime browser validation was not completed in this terminal-only environment.
- Alternating-week render filter:
  - Main render path appears internally consistent.
  - The only confirmed issue here is helper parity drift and missing test coverage.
- iOS dependency wiring:
  - The Xcode project contains the WhisperKit package references and source files.
  - Native compile validation was still blocked by the local Xcode toolchain state.

## Test Gap Mapping

Smallest tests that would have prevented the current regressions:

- OG/API contract:
  - Add one edge-function unit test that snapshots the generated static-map URLs for single-mic and plan pages.
  - Add one API route test that asserts accepted query shapes for static-map requests.
- Share/deep-link:
  - Add one unit-style VM test for `shareMic()` with share success, share cancel, clipboard fallback, and existing `?plan=` state.
  - Add one boot-order test for `openMicFromDeepLink()` + `loadPlanFromDeepLink()` when both params are present.
- Recorder gating:
  - Add one DOM/unit test for modal initialization with/without Capacitor, plugin, and supported platform.
- Alternating-week filtering:
  - Extend the existing `map_designs/newest_map/js/tests/*.test.cjs` set with explicit week-of-month fixtures.

## Final Triage

### Must Fix Before Ship

- Static-map contract mismatch for plan OG cards.
- Oversized Google Static Maps requests.
- `shareMic()` URL mutation side effects.

### Safe To Defer Briefly, But Should Be Fixed Soon

- Hard-coded production hosts for share and OG flows.
- Recorder button gating based only on `window.Capacitor`.
- Filter parity drift in `isMicVisible()`.

### Tooling / Infrastructure Cleanup

- Make API tests runnable in restricted environments or pin `MongoMemoryServer` to a safe local bind strategy.
- Restore full Xcode toolchain access on audit machines if native smoke builds are expected.
- Add focused automated coverage around share/deep-link, OG/static-map, and recorder gating paths.

## External Reference

- Google Maps Static API overview: [developers.google.com/maps/documentation/maps-static/overview](https://developers.google.com/maps/documentation/maps-static/overview)
