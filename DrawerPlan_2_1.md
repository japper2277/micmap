# MicFinder NYC - Drawer UI Audit & Improvement Plan
**Date:** February 1, 2026
**Version:** DrawerPlan_2_1

---

## Part 1: UI Grading (Score: 61/100) ⬆️ +14 from start

### Grading Criteria (10 Factors)

| # | Factor | Score | Issues | Changes |
|---|--------|-------|--------|---------|
| 1 | **Visual Hierarchy** | 5/10 | ~~Schedule card competes~~; "Plan My Night" header doesn't stand out; time headers blend in | P2: Sticky card + green top border |
| 2 | **Information Density** | 5/10 | Too much info per card; overwhelming on mobile | — |
| 3 | **Color System** | 6/10 | ~~price "$$8.71" bug~~; Green accent system cleaner | P1: Fixed bug |
| 4 | **Typography** | 5/10 | ~~Time format inconsistent~~; too many font weights | P1: Fixed time format |
| 5 | **Spacing & Layout** | 6/10 | ~~expanded section poor padding~~; Cards still cramped | P2: Better padding |
| 6 | **Interactive Affordances** | 7/10 ⬆️ | ~~"+ Add" too small~~; ~~remove button invisible~~; chevron unclear | P2: Remove 36px, P3: Add btn 44px |
| 7 | **State Communication** | 7/10 ⬆️ | ~~no feedback when adding~~; Green left border subtle | P2: Pulse, P3: Toast |
| 8 | **Consistency** | 5/10 | ~~Schedule card differs~~; header controls mismatched | P2: Cleaner design |
| 9 | **Scannability** | 6/10 | Time headers help; too much visual noise | — |
| 10 | **Delight/Polish** | 7/10 ⬆️ | ~~lacks micro-interactions~~; needs more refinement | P2+P3: Pop/pulse animations |

**TOTAL: 61/100** ⬆️ from 47 (+14 improvement)

---

## Part 2: Competitor Comparison

### 1. Google Maps Trip Planner
| Aspect | Google Maps | MicFinder | Gap |
|--------|-------------|-----------|-----|
| Itinerary View | Clean vertical timeline with numbered stops | Cramped expanded list | -30% |
| Visual Markers | Color-coded pins by category | Generic time pills | -25% |
| Actions | Clear "Add stop" flow | Inline "+ Add" button | -15% |
| Schedule UI | Separate "Your places" panel | Inline collapsed card | -20% |

**Key Takeaway:** Google uses a **dedicated panel** for saved places, not inline with search results.

### 2. Citymapper
| Aspect | Citymapper | MicFinder | Gap |
|--------|------------|-----------|-----|
| Route Builder | Step-by-step with arrival/departure times | No time blocking | -40% |
| Transit Display | Large, clear subway badges | Small inline badges | -20% |
| Information Density | One piece of info at a time | Everything at once | -35% |
| Bottom Sheet | Progressive disclosure (peek → half → full) | Same content at all states | -25% |

**Key Takeaway:** Citymapper uses **progressive disclosure** - shows less when peeked, more when expanded.

### 3. Wanderlog
| Aspect | Wanderlog | MicFinder | Gap |
|--------|-----------|-----------|-----|
| Day View | Clear day-by-day tabs | Single list | -30% |
| Drag & Drop | Reorder itinerary items | No reordering | -35% |
| Map Integration | Connected pins with route lines | Separate map/list | -20% |
| Visual Design | Clean white cards, orange accents | Dark cards, green accents | -15% |

**Key Takeaway:** Wanderlog's **drag-to-reorder** and **connected map pins** create clear mental model.

### 4. Uber (Base Design System)
| Aspect | Uber | MicFinder | Gap |
|--------|------|-----------|-----|
| Bottom Sheet | 3 defined states with snap points | Rough states | -25% |
| Cards | Clear ActionCard pattern | Custom cards | -20% |
| Primary Action | Large, obvious CTA button | Small "+ Add" | -35% |
| Loading States | Skeleton screens | Spinner only | -20% |

**Key Takeaway:** Uber's **ActionCard pattern** - single purpose per card, large clear CTA.

### 5. Eventbrite
| Aspect | Eventbrite | MicFinder | Gap |
|--------|------------|-----------|-----|
| Event Cards | Large image, clear title/date | No images, dense text | -25% |
| Categories | Horizontal scroll sections | Single vertical list | -20% |
| Saved Events | Dedicated "Saved" tab | Inline schedule card | -30% |
| Date Display | Orange accent, prominent | Competing with other info | -25% |

**Key Takeaway:** Eventbrite uses **dedicated "Saved" section** and **category groupings**.

---

## Part 3: Critical Issues to Fix

### P0 - Bugs (Must Fix)
1. **Double dollar sign** - "$$8.71" in schedule card (price display bug)
2. **Time format inconsistency** - "2:00 PM" vs "2pm" in same view

### P1 - Usability (High Impact)
3. **Schedule card too similar to mic cards** - needs stronger visual separation
4. **"+ Add" button too small** - should be more prominent
5. **Remove (X) button barely visible** - needs better contrast
6. **No feedback on add action** - needs animation/toast
7. **Chevron direction unclear** - should indicate expand/collapse state

### P2 - Visual Design (Medium Impact)
8. **Header "Plan My Night" doesn't stand out** - needs stronger styling
9. **Information overload on cards** - too many badges per line
10. **Green left border too subtle** - needs stronger "in schedule" indicator
11. **Time headers blend in** - need better visual weight
12. **Action buttons misaligned** - right column icons inconsistent

### P3 - Polish (Nice to Have)
13. **No micro-interactions** - add subtle animations
14. **No empty state** - when schedule is empty
15. **No skeleton loading** - for schedule card
16. **Drag to reorder** - schedule items

---

## Part 4: Implementation Plan

### Phase 1: Fix Bugs (30 min) ✅ COMPLETE
- [x] **1.1** Fix double dollar sign in `render.js` schedule card price display
- [x] **1.2** Standardize time format to "2:00 PM" everywhere

### Phase 2: Schedule Card Redesign (2 hours) ✅ COMPLETE
- [x] **2.1** Make schedule card **sticky** at top (position: sticky + backdrop-filter)
- [x] **2.2** Add **green top border** (3px solid) instead of full border
- [x] **2.3** Increase **count badge size** (15px → 22px, weight 800)
- [x] **2.4** Add **pulse animation** (schedulePulse keyframes + just-added class)
- [x] **2.5** Expand section: increased padding, green left accent on items
- [x] **2.6** Make remove (X) button larger (28px → 36px) with hover scale effect

### Phase 3: "Add" Button Redesign (1 hour) ✅ COMPLETE
- [x] **3.1** Change "+ Add" to **icon-only button** (44px green circle with + SVG)
- [x] **3.2** Position at **right edge** of card (absolute positioned, vertically centered)
- [x] **3.3** Add **scale animation** on tap (pop + fade animation via `addBtnPop` keyframes)
- [x] **3.4** Show **toast notification** "Added {venue}" on success

### Phase 4: Card Simplification (1.5 hours)
- [ ] **4.1** Move **borough badge** to second row
- [ ] **4.2** Combine **neighborhood + price** on same line
- [ ] **4.3** Make **subway badges smaller** (24px → 20px)
- [ ] **4.4** Add **"In Schedule" badge** (green checkmark) replacing "+ Add"

### Phase 5: Header Improvements (1 hour)
- [ ] **5.1** Make "Plan My Night" **bolder** with green underline accent
- [ ] **5.2** Move "Stay X min" to a **smaller pill** style
- [ ] **5.3** Add **"Exit"** button (X) to quickly exit plan mode
- [ ] **5.4** Show **mic count** in header ("12 available")

### Phase 6: Time Headers (30 min)
- [ ] **6.1** Make time headers **larger** (16px → 18px)
- [ ] **6.2** Add **subtle background** (rgba white 5%)
- [ ] **6.3** Make them **sticky** when scrolling within that hour

### Phase 7: Polish & Animations (1 hour)
- [ ] **7.1** Add **fade-in animation** for schedule card appearance
- [ ] **7.2** Add **slide animation** for schedule expand/collapse
- [ ] **7.3** Add **haptic feedback** on add/remove actions
- [ ] **7.4** Add **empty state** illustration when schedule is empty

---

## Part 5: File Changes Map

| File | Changes |
|------|---------|
| `css/stream.css` | Schedule card styles, sticky positioning, animations |
| `css/controls.css` | Header styles, exit button |
| `js/render.js` | Price fix, time format, card layout, badges |
| `js/planner.js` | Toast notifications, animations |
| `index.html` | Exit button, header structure |

---

## Part 6: Success Metrics

After implementation, the UI should score:
- Visual Hierarchy: 4 → **7** (+3)
- Information Density: 5 → **7** (+2)
- Color System: 5 → **8** (+3)
- Typography: 4 → **7** (+3)
- Spacing & Layout: 5 → **8** (+3)
- Interactive Affordances: 4 → **8** (+4)
- State Communication: 5 → **8** (+3)
- Consistency: 4 → **7** (+3)
- Scannability: 6 → **8** (+2)
- Delight/Polish: 5 → **7** (+2)

**Target Score: 75/100** (+28 improvement)

---

## Part 7: Reference Links

- [Google Maps Trip Planning](https://www.routific.com/blog/google-maps-trip-planner)
- [Citymapper UX Analysis](https://medium.com/@saylibetawar/ux-ui-pre-work-challenge-1-citymapper-design-thinking-d7178393337d)
- [Wanderlog Behavioral Design](https://designli.co/blog/how-wanderlog-app-simplifies-trip-planning-using-behavioral-design/)
- [Uber Base Design System](https://base.uber.com/)
- [Eventbrite App Redesign](https://www.instrument.com/work/eventbrite-app)
