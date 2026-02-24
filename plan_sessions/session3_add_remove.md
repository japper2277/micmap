# Session 3: Add-to-Route Interactions

## Phase 1: Research

### Interaction Patterns

| App | Add Pattern | Remove Pattern | Feedback |
|-----|-------------|----------------|----------|
| **Spotify** | Heart icon / "+" icon (add to playlist) | Tap heart again / Context menu | Toast: "Added to Liked Songs" |
| **Google Maps** | "Add stop" text button | "X" icon next to stop | Map updates route immediately |
| **Airbnb** | Heart icon (Save to wishlist) | Tap heart again (filled -> outline) | Toast + Heart fills red |
| **Apple Reminders** | "+" button or New Item | Swipe left -> Delete | List item appears immediately |
| **Todoist** | Quick Add button (floating) | Checkbox to complete | Toast with "Undo" |

### Design Decisions for MicFinder

Based on the research and `DrawerPlan_2_1.md`:

1.  **Add Button:**
    *   **Placement:** Right edge of the venue card.
    *   **Style:** Icon-only button (44px green circle with + SVG) as per `DrawerPlan_2_1.md` (Phase 3).
    *   **Interaction:** Tap adds to `STATE.route`.

2.  **Remove Button:**
    *   **Placement:** Inside the "Plan My Night" schedule card (which serves as the "route/playlist" view).
    *   **Style:** "X" button, distinct but not destructive-looking (red might be too much, maybe gray/white).

3.  **Feedback (Add):**
    *   **Immediate:** Button transforms or creates a "flying" element (optional complex) or just a Pulse animation on the Schedule Card to show something landed there.
    *   **Notification:** Toast "Added {Venue Name}".

4.  **Feedback (Remove):**
    *   **Immediate:** Item fades out/collapses from the list.

5.  **Confirmation:**
    *   "Done - X Stops" button to perhaps finalize or view the map route (if different from current view).

## Phase 2: Implementation Log

### Step 1: Add Button & Logic
*   Target: `js/render.js` (venue cards) & `js/planner.js` (logic).
*   Change: Add `addToRoute(id)` function.
*   Change: Render `+` button on cards.

### Step 2: Remove Interaction
*   Target: `js/render.js` (schedule card) & `js/planner.js` (logic).
*   Change: Add `removeFromRoute(id)` function.
*   Change: Render `X` button on schedule items.

### Step 3: Visual Feedback
*   Target: `css/stream.css`.
*   Change: Add animations (Pulse, Toast styles).

## Phase 3: Grading & Scores

(To be updated after changes)
