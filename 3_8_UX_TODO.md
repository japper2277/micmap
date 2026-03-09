# UX TODO — Mobile Modal

1. **Too many info pills** — 5min, FREE, Walk-in, Verified, commute pill can wrap to 2 lines on small phones. Consider combining "Walk-in" + "FREE" or dropping one.

2. **"Sign Up Online" + "Going?" distinction unclear** — users may not understand the difference. Consider making "Going?" the only button that handles signup redirect internally.

3. **"Did you pay?" flow fragile** — relies on `visibilitychange` which can be flaky on some mobile browsers. Add fallback timeout or show immediately after tapping "Sign Up Online."

4. **No flyer/image on mobile** — modal is all text. Add small flyer thumbnail (if available) for visual weight and trust.

5. **Share button placement** — competes with time in header. Could move to action row at bottom where thumb already is.
