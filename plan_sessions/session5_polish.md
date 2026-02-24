# Session 5: Polish & Animations - Plan My Night

## Phase 1: Research

### Micro-interactions & Patterns

**1. Stripe Checkout (Smooth Animations)**
*   **Key Characteristic:** Physics-based springs or cubic-beziers that feel "weighted" rather than linear.
*   **Timing:** 200ms - 300ms for small interactions (hover, click). 400ms-600ms for layout shifts.
*   **Easing:** `cubic-bezier(0.25, 0.1, 0.25, 1)` (ease) or `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring-like overshoot).

**2. Linear App (Delightful Transitions)**
*   **Key Characteristic:** Snappy, immediate feedback. Staggered list entrances.
*   **Pattern:** Lists don't appear all at once; items slide in one by one (stagger ~30-50ms).
*   **Feedback:** Subtle scale effects (0.98 down, 1.00 up) on active states.

**3. Notion (Empty States)**
*   **Key Characteristic:** Friendly, illustrative, and instructive.
*   **Pattern:** Grayed-out placeholder text or a simple SVG illustration + clear "Call to Action" text.
*   **Message:** "Click 'Add to Plan' on any mic to start building your night."

**4. Figma (Loading Skeletons)**
*   **Key Characteristic:** Pulsing gray blocks that match the shape of the content to come.
*   **Animation:** `shimmer` effect (gradient moving left to right).

**5. Apple iOS (Haptic Patterns)**
*   **Light:** 10ms-20ms (Selection changes, toggles).
*   **Medium:** 30ms-40ms (Locking in a value, significant state change).
*   **Heavy:** Error states or "success" completion.
*   **Web API:** `navigator.vibrate(8)` is a subtle "tick".

## Phase 2: Implementation Plan

*   [ ] **Fade-in for schedule card:** Use `opacity` and `transform: translateY` transitions.
*   [ ] **Slide animation:** For the expand/collapse of the "My Plan" drawer or list items.
*   [ ] **Haptics:** Add `navigator.vibrate(8)` to "Add to Plan", "Remove", and "Optimize Route".
*   [ ] **Empty State:** Replace the empty list with a "Pick your first mic" illustration/div.
*   [ ] **Skeleton Loading:** Show 3 fake "mic cards" while the route is calculating.
*   [ ] **Stagger Entrance:** CSS classes for `.mic-card:nth-child(n)`.
*   [ ] **"Start My Night" CTA:** A primary button at the bottom of the plan.

## Phase 3: Grading & Log

| Change | Score (1-100) | Notes |
| :--- | :--- | :--- |
| ... | ... | ... |
