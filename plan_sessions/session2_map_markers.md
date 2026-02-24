# Session 2: Map Markers & Route Lines

## Phase 1: Research

### App Analysis

#### Google Maps (Multi-stop Directions)
*   **Markers:**
    *   Origin: Hollow circle or specific icon.
    *   Destinations: Red pins (A, B, C...).
    *   Waypoints: Small white dots on the route line.
*   **Route Line:**
    *   Solid blue line for the primary route.
    *   Grey lines for alternative routes.
    *   Dashed line often implies walking portions or specific transit types.
*   **Selection:** Clicking a step in the directions list highlights that segment on the map.
*   **Zoom:** Auto-zooms to fit the entire route (bounds).

#### Citymapper
*   **Markers:**
    *   Start/End: distinct green/red icons.
    *   Transfers: specific icons for subway/bus stops.
*   **Route Line:**
    *   Color-coded by transit line (e.g., Green for 4/5/6 train).
    *   Solid for ride, dashed for walking.
*   **Zoom:** Focuses on the active leg of the journey.

#### Rome2Rio
*   **Route Visualization:** Shows multiple modes of transport connected.
*   **Lines:** Clearly distinct styles for flight, train, bus, car.

#### Wanderlog
*   **Connected Pins:** Numbered pins (1, 2, 3) connected by a line.
*   **Visuals:** Very clean, colorful map.

### Design Decisions for MicFinder "Plan My Night"

Based on the research and `plannight.md` specifications:

1.  **Selected Markers:**
    *   **Style:** Green circle with a white checkmark (✓).
    *   **Z-Index:** Highest, to appear on top of everything else.
    *   **Behavior:** Permanent while in the plan.

2.  **Available Markers (The "Field"):**
    *   **Style:** Standard "Pill" or "Ticket" style (existing implementation).
    *   **Behavior:** Tapping adds to the plan (or opens modal with "Add" option).

3.  **Dimmed Markers:**
    *   **Style:** Reduced opacity (e.g., 0.4) or greyscale.
    *   **Context:** Mics that don't fit the criteria or are far outside the route (optional for now, but good for focus).

4.  **Route Lines:**
    *   **Style:** Dashed polyline connecting the selected markers in chronological order.
    *   **Color:** Dark grey or a theme color (e.g., Purple/Blue).
    *   **Dash Array:** `5, 10` (5px line, 10px gap) to signify a "planned" sequence, not necessarily a physical road route yet.

5.  **Zoom Behavior:**
    *   **Auto-fit:** When a mic is added/removed, call `map.fitBounds(featureGroup)` to show the whole route with padding.

## Phase 2: Implementation Log

| Change | Commit Hash | Score (1-100) | Notes |
| :--- | :--- | :--- | :--- |
| (Pending) | | | |

