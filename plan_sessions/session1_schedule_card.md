# Session 1: Schedule Card & Header Implementation
Date: February 3, 2026
Plan: DrawerPlan_2_1.md

## Phase 1: Research

### 1. Google Maps Trip Planner
**Description:**
Google Maps uses a dedicated "Your places" or "Saved" panel. When planning a route with multiple stops, it shows a vertical timeline.
**Key Features:**
- **Vertical Timeline:** Numbered stops connected by a line.
- **Visual Markers:** Color-coded pins (A, B, C...) matching the map.
- **Drag & Drop:** Easy reordering of stops.
- **Information:** Shows travel time between stops prominently.
**Relevance:** The "Schedule" in MicFinder acts like a multi-stop route. The vertical connection and clear numbering are valuable.

### 2. Citymapper (Saved Places / Trip)
**Description:**
Citymapper focuses on the "journey". When a trip is saved or active, it uses a bottom sheet that can peek, expand to half, or full screen.
**Key Features:**
- **Progressive Disclosure:** Peek shows just the next step/arrival. Expanded shows full itinerary.
- **Subway Badges:** Large, high-contrast badges (e.g., [6] in green circle) that are easy to scan.
- **Simplicity:** One primary piece of info per row.
**Relevance:** MicFinder needs to handle "Transit" mode better. The large badges and progressive disclosure (collapsed vs expanded schedule card) are key.

### 3. Wanderlog (Day View)
**Description:**
A travel planning app that organizes trips by day.
**Key Features:**
- **Day Tabs:** Clear separation of days.
- **Cards:** Clean white cards with photos on the left, text on right.
- **Map Connection:** Hovering a card highlights the pin on the map.
- **Visuals:** Uses photos heavily to make the itinerary feel exciting.
**Relevance:** MicFinder's "Plan My Night" is a mini-itinerary. We lack photos, but the clear card structure and map-list connection are important.

### 4. TripIt (Headers)
**Description:**
Itinerary manager that groups items by date/time.
**Key Features:**
- **Headers:** distinct headers for dates (e.g., "Tue, Feb 3").
- **Time blocking:** Events are listed chronologically with start/end times.
- **Details:** Expandable cards for flight/hotel details.
**Relevance:** Our "Time Headers" (Phase 6) should mimic this clarity—distinct from the cards but clearly organizing them.

### 5. Uber (Bottom Sheet)
**Description:**
Ride-sharing app with a highly polished bottom sheet interaction.
**Key Features:**
- **Snap Points:** Smooth transition between peek, half, and full states.
- **Action Cards:** Each row is a clear actionable item (e.g., "Choose a ride").
- **Primary Action:** The "Confirm" button is always visible and prominent.
**Relevance:** The MicFinder drawer is a bottom sheet. The "Plan My Night" schedule card needs to feel like a primary dashboard for the night.

## Phase 2: Implementation Log

### Baseline
Starting state of `map_designs/newest_map`:
- Schedule card is currently inline.
- "Plan My Night" header is present but lacks emphasis.
- Badges are standard size.

---
