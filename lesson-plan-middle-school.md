# How I Built an NYC Open Mic Map
## A 3-Hour Lesson Plan for Middle Schoolers (No Coding Required!)

---

## Overview

**Grade Level:** 6-8
**Duration:** 3-3.5 hours (with buffer activities for early finishers)
**Materials Needed:**
- Printed NYC borough maps (1 per group)
- Colored stickers/dots (red, green, gray, blue)
- Index cards
- Markers
- Smartphones or tablets (for live demo)
- Printed "venue cards" (provided below)
- Scratch paper
- Timer/clock
- Large poster paper (for final activity)

**Learning Objectives:**
By the end of this lesson, students will be able to:
1. Explain how apps turn addresses into map locations
2. Understand how filtering helps users find relevant information
3. Solve real-world problems using logical thinking
4. Recognize that building apps involves solving many small problems
5. Design solutions for user experience challenges
6. Understand that failure and iteration are normal parts of building software

---

## Lesson Structure

| Time | Section | Activity |
|------|---------|----------|
| 0:00-0:15 | Intro | What is MicFinder? Live Demo |
| 0:15-0:40 | Problem 1 | The Address Problem (Geocoding) |
| 0:40-1:05 | Problem 2 | The Overlap Problem (Clustering) |
| 1:05-1:20 | Break | Snack + Q&A |
| 1:20-1:50 | Problem 3 | The "When?" Problem (Filtering) |
| 1:50-2:15 | Problem 4 | The Status Problem (Live vs Upcoming) |
| 2:15-2:40 | Problem 5 | The "How Far?" Problem (Transit) |
| 2:40-2:55 | Problem 6 | The Phone vs Computer Problem (Responsive Design) |
| 2:55-3:15 | Problem 7 | The "It Didn't Work!" Problem (Learning from Failures) |
| 3:15-3:20 | Wrap-Up | Reflection + Discussion |

---

## SECTION 1: Introduction (15 min)

### The Hook (5 min)
**Say to students:**

> "Imagine you're a comedian in New York City. Every night, there are places called 'open mics' where anyone can get on stage and perform for 5 minutes. But here's the problem: there are over 100 of these happening every week, all over the city, at different times, some free, some cost money. How do you figure out where to go tonight?"

**Ask:** "What would you do to find one?"

*Expected answers: Google it, ask friends, look on Instagram, etc.*

**Reveal:** "I built an app that solves this problem. Let me show you."

### Live Demo (10 min)
Pull up micfinder.nyc on a large screen and demonstrate:
1. The map with colored dots
2. Tapping a venue to see details
3. Filtering by "Free" vs "Paid"
4. The drawer with the list
5. "Happening Now" section
6. **Show on phone AND computer** - notice how it looks different!

**Key point:** "Building this app meant solving about 20 different problems. Today, I'm going to teach you the 7 most important ones, and YOU'RE going to solve them the same way I did - including learning from the ones that didn't work!"

---

## SECTION 2: Problem 1 - The Address Problem (25 min)

### The Challenge (5 min)
**Say:**

> "I have a spreadsheet with 150 open mics. Each one has a venue name and address like '123 Main Street, Brooklyn, NY.' But a map doesn't understand addresses. A map only understands numbers - specifically, two numbers called latitude and longitude."

**Write on board:**
```
What I have:    "Comedy Club, 123 Main St, Brooklyn NY"
What map needs: 40.7128, -74.0060
```

**Ask:** "How do I turn one into the other?"

### Mini-Lesson: Coordinates (5 min)
- Show a simple world map with latitude/longitude grid
- Explain: Latitude = how far north/south (like floors in a building)
- Longitude = how far east/west (like seats in a row)
- NYC is roughly 40.7° North, 74° West

### STUDENT ACTIVITY: Human Geocoding (10 min)

**Setup:** Give each group:
- A printed NYC map with a coordinate grid overlay
- 5 index cards with addresses (simplified)

**The Problem:**
```
Your job is to be the "translator" between addresses and coordinates.

ADDRESS LIST:
1. Times Square, Manhattan
2. Prospect Park, Brooklyn
3. Yankee Stadium, Bronx
4. Coney Island, Brooklyn
5. Central Park Zoo, Manhattan

Use your grid map to find the approximate coordinates for each location.
Write them as (latitude, longitude).
```

**Debrief:**
- How accurate were your guesses?
- What made this hard?
- Imagine doing this for 150 addresses!

**Reveal the real solution:**
> "I used something called a 'geocoding API.' It's like a robot that knows every address in the world and can instantly tell you the coordinates. I send it an address, it sends back numbers. I had to do this 150 times, but the computer did it in about 2 minutes."

### EARLY FINISHER ACTIVITY: Reverse Geocoding (5 min)
```
BONUS CHALLENGE: Reverse Geocoding

I give you coordinates. YOU tell me the location!

1. (40.748, -73.986) - Hint: Very tall and famous
2. (40.689, -74.044) - Hint: A gift from France
3. (40.753, -73.977) - Hint: Trains leave here for the whole country

What's harder: Address → Coordinates or Coordinates → Address? Why?
```

---

## SECTION 3: Problem 2 - The Overlap Problem (25 min)

### The Challenge (5 min)

**Setup:** Show a zoomed-out map image with many dots overlapping in Manhattan.

**Say:**

> "Here's a problem I didn't expect. Look at this map. In the East Village neighborhood, there are 12 open mics. When I put 12 dots on the map, they all overlap into one big blob. You can't click on any of them. You can't even see that there are 12!"

**Draw on board:**
- Show 12 dots all on top of each other = mess
- vs. one dot that says "12" = clear

### STUDENT ACTIVITY: The Party Problem (15 min)

**The Scenario:**
> "Imagine you're planning a huge birthday party map. You have 30 friends coming, and you need to put dots on a map showing where each friend lives. But 8 of your friends all live in the same apartment building!"

**Give each group:**
- A blank grid (10x10)
- 30 small stickers/dots
- This address list:

```
FRIEND LOCATIONS (Grid Coordinates):

GROUP A - All live at (3,7):
Alex, Jordan, Sam, Taylor, Morgan, Casey, Riley, Quinn

GROUP B - All live at (8,2):
Pat, Jamie, Drew

GROUP C - Spread out:
Chris (1,1), Dana (2,5), Frankie (5,5),
Gabe (7,8), Harper (9,3), Ira (4,2),
Jules (6,6), Kai (8,8), Lee (1,9),
Max (3,3), Nico (5,1), Olive (7,4),
Piper (9,9), Reese (2,8), Sage (6,2),
Tatum (4,7), Uma (8,5), Val (1,4), Winter (5,9)
```

**Part 1:** Place all 30 dots on the grid at their coordinates. What happens?

**Part 2:** Now solve it! Your rules:
- If 2+ friends are at the same spot, use ONE dot with a number on it
- The map should be readable
- Someone looking at it should know exactly how many friends are in each spot

**Debrief Questions:**
1. How did you show that 8 people are at (3,7)?
2. What if two friends live one square apart? Do you combine them or keep separate?
3. What's the rule for "close enough to combine"?

**Reveal the real solution:**
> "In my app, I use something called 'clustering.' If two venues are within 200 meters of each other, I combine them into one marker that shows a number. So you might see a dot that says '7p +3' meaning there's an open mic at 7pm, plus 3 more venues nearby."

### EARLY FINISHER ACTIVITY: The Zoom Problem (5 min)
```
BONUS CHALLENGE: Zoom Levels

Here's a twist I had to solve: What happens when users ZOOM IN on the map?

When zoomed OUT (seeing all of NYC):
- Lots of dots overlap
- Clustering is helpful
- Show: "7pm +5"

When zoomed IN (seeing one block):
- Dots don't overlap anymore
- Clustering hides information!
- Should show each venue separately

PROBLEM: Design rules for when to cluster and when NOT to cluster.

Consider:
- At what zoom level do you stop clustering?
- What if two venues are in the SAME building but different floors?
- What if a user zooms in on a cluster - what should happen?
```

---

## BREAK (15 min)
Snack time + informal Q&A

---

## SECTION 4: Problem 3 - The "When?" Problem (30 min)

### The Challenge (5 min)

**Say:**

> "My app shows 150 open mics. But nobody wants to see all 150 at once! If it's Tuesday, you only care about Tuesday mics. If you only have $5, you only want free ones. If it's already 9pm, you don't care about the one that started at 6pm."

**Write on board:**
```
ALL MICS: 150
Tuesday only: 22
Tuesday + Free: 14
Tuesday + Free + After 9pm: 4
```

**Ask:** "How should the app decide what to show you?"

### Mini-Lesson: Filters (5 min)

Explain filters like a series of questions:
1. Is this mic on the day I selected? YES → keep, NO → hide
2. Does it match my price filter? YES → keep, NO → hide
3. Does it match my time filter? YES → keep, NO → hide

Each filter removes options until you have exactly what you want.

### STUDENT ACTIVITY: The Cafeteria Problem (15 min)

**The Scenario:**
> "You run a school cafeteria app. Students can filter the menu to find foods they want."

**Give each group this menu:**

```
CAFETERIA MENU

| Item | Price | Category | Contains Nuts | Vegetarian | Spicy |
|------|-------|----------|---------------|------------|-------|
| Pizza | $3 | Main | No | Yes | No |
| Burger | $4 | Main | No | No | No |
| Salad | $3 | Main | Yes (walnuts) | Yes | No |
| Chicken Tenders | $4 | Main | No | No | No |
| Fries | $2 | Side | No | Yes | No |
| Onion Rings | $2 | Side | No | Yes | No |
| Apple | $1 | Snack | No | Yes | No |
| Cookie | $1 | Snack | Yes (peanuts) | Yes | No |
| Buffalo Wings | $5 | Main | No | No | Yes |
| Veggie Wrap | $4 | Main | No | Yes | Yes |
```

**PROBLEMS TO SOLVE:**

**Problem A:** Marco has a nut allergy. What can he eat?
*Write the filtering rule, then list the items.*

**Problem B:** Sofia is vegetarian and has $3. What are her options?
*Write TWO filtering rules, then list the items.*

**Problem C:** Jake wants something spicy, but he's also vegetarian. What can he get?
*What happens when filters give you NO results?*

**Problem D:** The lunch line is long. Elena only has time for a snack (not a main). She has $1. What can she get?
*Be careful - one answer might surprise you!*

**Problem E (CHALLENGE):** Write filtering rules that would give you EXACTLY these 3 items: Pizza, Fries, Apple
*Hint: There might not be a single set of filters that works perfectly!*

**Debrief:**
- Problem C shows that sometimes filters give zero results - the app needs to handle this
- Problem E shows that some combinations are impossible with simple filters
- In my app, if filters return zero results, I show a message: "No mics match your filters"

### EARLY FINISHER ACTIVITY: Filter Order Problem (5 min)
```
BONUS CHALLENGE: Does Filter Order Matter?

You have 100 items. You apply these filters:
- Filter A removes 80% of items
- Filter B removes 50% of items

Question 1: If you apply A first, then B:
- After A: How many items left?
- After B: How many items left?

Question 2: If you apply B first, then A:
- After B: How many items left?
- After A: How many items left?

Question 3: Does the ORDER of filters change the final result?

Question 4: Does the ORDER affect how FAST the computer works?
(Hint: Is it faster to search through 100 items or 20 items?)
```

---

## SECTION 5: Problem 4 - The Status Problem (25 min)

### The Challenge (5 min)

**Say:**

> "Here's a tricky problem. It's 7:30pm on a Tuesday. There's an open mic that started at 7pm. Should I show it?"

**Draw timeline on board:**
```
6pm     7pm     7:30pm    8pm     9pm
         |        |
         |        NOW
         Started
```

**Ask:** "Is this mic still useful to show? What if it started at 6pm? What about 5pm?"

### Mini-Lesson: Status Categories (5 min)

**Explain the three statuses I created:**

1. **LIVE (Green)** - Started within the last 90 minutes
   - "You can still catch this!"

2. **UPCOMING (Red)** - Starts within the next 2 hours
   - "Get ready, this is soon!"

3. **FUTURE (Gray)** - Starts more than 2 hours from now
   - "Tonight, but you have time"

**The hidden rule:** If something started MORE than 90 minutes ago, hide it completely.

### STUDENT ACTIVITY: The Movie Theater Problem (15 min)

**The Scenario:**
> "You're building an app for a movie theater. You need to decide what color badge each movie gets and whether to show it at all."

**Setup:** It is currently **4:45pm**

```
TODAY'S MOVIES:

| Movie | Start Time | End Time |
|-------|------------|----------|
| Spider-Man | 1:00pm | 3:30pm |
| Frozen 3 | 2:30pm | 4:30pm |
| Dune 2 | 3:15pm | 6:00pm |
| Mario Movie | 5:00pm | 7:00pm |
| Avengers | 6:30pm | 9:00pm |
| Barbie 2 | 7:00pm | 9:00pm |
| Late Night Horror | 10:00pm | 12:00am |
```

**Your Rules:**
- **GREEN (Live):** Movie started within last 90 min AND not over yet
- **RED (Upcoming):** Starts within next 2 hours
- **GRAY (Future):** Starts more than 2 hours from now
- **HIDDEN:** Movie ended OR started more than 90 min ago

**PROBLEMS:**

**Problem A:** Label each movie with its status (GREEN/RED/GRAY/HIDDEN)

**Problem B:** It's now **6:00pm**. Re-do the labels. What changed?

**Problem C:** Here's a bug report from a user:
> "I looked at the app at 4:50pm and it showed Mario Movie as RED (upcoming). I looked again at 5:10pm and it was GREEN (live). Then at 7:00pm it was HIDDEN. But the movie doesn't end until 7:00pm! Why did it disappear at 7pm when it was still playing?"

What went wrong? How would you fix the rule?

**Problem D (CHALLENGE):** A user complains:
> "The Late Night Horror movie is GRAY all day. But I want to buy tickets early! Can you add a 4th status?"

Design a 4th status. What would you call it? What color? What's the rule?

### EARLY FINISHER ACTIVITY: Edge Cases (5 min)
```
BONUS CHALLENGE: Weird Situations

What status should these get? (Current time: 7:00pm)

1. A mic that starts at 7:00pm EXACTLY (right now)
   - Is it LIVE or UPCOMING?

2. A mic that started at 5:31pm (89 minutes ago)
   - GREEN or HIDDEN? (Remember: rule is 90 minutes)

3. A mic that runs from 6pm to 6pm the NEXT DAY (24-hour event)
   - How do you handle events that span midnight?

4. A mic with no listed end time
   - When do you hide it?

These "edge cases" are where most bugs happen!
```

---

## SECTION 6: Problem 5 - The "How Far?" Problem (25 min)

### The Challenge (5 min)

**Say:**

> "A user in Brooklyn asks: 'Show me only open mics I can get to in 30 minutes.' Sounds simple, right? But think about it..."

**Problems to consider:**
- 30 minutes by what? Walking? Subway? Car? Bike?
- Traffic changes throughout the day
- Subway delays happen
- Some routes require transfers

**Ask:** "If I tell you a place is 2 miles away, can you tell me how long it takes to get there?"

### Mini-Lesson: Distance vs. Time (5 min)

**Draw on board:**

```
SAME DISTANCE, DIFFERENT TIMES:

Location A → Location B: 2 miles

By foot: ~40 minutes
By bike: ~12 minutes
By subway: ~8 minutes (if nearby station)
By subway: ~25 minutes (if far from station + transfer)
By car (no traffic): ~6 minutes
By car (rush hour): ~30 minutes
```

**Key insight:** You can't just measure distance. You need to ask another service (Google Maps, etc.) to calculate actual travel time.

### STUDENT ACTIVITY: The Pizza Delivery Problem (15 min)

**The Scenario:**
> "You run a pizza shop. Customers can only order delivery if they're within your '20-minute delivery zone.' But what IS your 20-minute zone?"

**Setup:** Your pizza shop is at the center of this grid. Each square = 1 block.

```
     1   2   3   4   5   6   7   8   9
   +---+---+---+---+---+---+---+---+---+
 A |   |   |   |   |   |   |   |   |   |
   +---+---+---+---+---+---+---+---+---+
 B |   |   |   |   |   |   |   |   |   |
   +---+---+---+---+---+---+---+---+---+
 C |   |   |   |   |   |   |   |   |   |
   +---+---+---+---+---+---+---+---+---+
 D |   |   |   |   | P |   |   |   |   |  ← Pizza shop at D5
   +---+---+---+---+---+---+---+---+---+
 E |   |   |   |   |   |   |   |   |   |
   +---+---+---+---+---+---+---+---+---+
 F |   |   |   |   |   |   |   |   |   |
   +---+---+---+---+---+---+---+---+---+
 G |   |   |   |   |   |   |   |   |   |
   +---+---+---+---+---+---+---+---+---+

RULES:
- 1 block = 1 minute by scooter (no traffic)
- The avenue between columns 6 and 7 is always congested:
  crossing it takes 5 extra minutes
- There's a highway between rows D and E that can't be crossed
  except at column 2 (adds 3 minutes to go around)
```

**PROBLEMS:**

**Problem A:** Can you deliver to B5? (How many minutes?)

**Problem B:** Can you deliver to D8? (Remember the congestion!)

**Problem C:** Can you deliver to F5? (Remember the highway!)

**Problem D:** Draw your actual "20-minute delivery zone" on the grid. Is it a circle? (Spoiler: No!)

**Problem E (NEW):** A customer at G9 really wants pizza. What's the fastest route and how long?

**Debrief:**
> "This is why my app has to ask Google Maps for EVERY route. I can't just draw a circle around you and say 'everything in this circle is 30 minutes away.' The subway system, traffic, and walking routes make it way more complicated."

### EARLY FINISHER ACTIVITY: The Caching Problem (5 min)
```
BONUS CHALLENGE: Saving Time (Caching)

Every time I ask Google Maps for travel time, it costs money and takes time.
If 100 users all search from Times Square, should I ask Google 100 times?

NO! I can SAVE (cache) the answer!

PROBLEM: Design rules for when to save answers vs. ask again:

1. User A asks: "Times Square to Comedy Cellar" at 6pm
   → I ask Google, save answer: "15 minutes"

2. User B asks: "Times Square to Comedy Cellar" at 6:05pm
   → Should I use saved answer or ask Google again?

3. User C asks: "Times Square to Comedy Cellar" at 9pm
   → Rush hour is over. Should I use saved answer?

4. User D asks: "Penn Station to Comedy Cellar" at 6pm
   → Different starting point. Should I use saved answer?

Write rules for: When is a saved answer still good? When must you ask again?
```

---

## SECTION 7: Problem 6 - The Phone vs Computer Problem (15 min)

### The Challenge (5 min)

**Say:**

> "Look at my app on this big computer screen. Now look at it on my phone. They look COMPLETELY different! Why?"

**Show side by side:**
- Computer: Map takes up most of screen, list on the side
- Phone: Map on top, list slides up from bottom

**Ask:** "Why can't I just shrink the computer version to fit on a phone?"

*Expected answers: Too small to tap, can't see details, fingers are bigger than mouse cursors*

### Mini-Lesson: Responsive Design (5 min)

**Explain the key differences:**

| Computer | Phone |
|----------|-------|
| Big screen (1920+ pixels wide) | Small screen (375 pixels wide) |
| Mouse (precise clicks) | Fingers (need big tap targets) |
| Can see many things at once | Need to focus on one thing |
| Keyboard shortcuts | Swipe gestures |

**The term:** This is called "responsive design" - the app RESPONDS to the device it's on.

### STUDENT ACTIVITY: Redesign Challenge (5 min)

**Quick Exercise:**

> "You're designing a music player app. On a computer, you show: album art, song list, play controls, lyrics, and artist bio - all at once."

**Draw on scratch paper:**
1. Sketch the COMPUTER layout (everything visible)
2. Sketch the PHONE layout - you can only show 2 things at a time!
   - What do you prioritize?
   - How does the user get to the other features?
   - Where do you put the play/pause button?

**Share & discuss:** Different students will make different choices - that's the point! There's no single right answer.

### EARLY FINISHER ACTIVITY: The Thumb Zone (5 min)
```
BONUS CHALLENGE: The Thumb Zone

When people use phones, they hold it with one hand and tap with their thumb.

        [Phone Screen]
     +------------------+
     |   HARD TO REACH  |   ← Top corners are awkward
     |                  |
     |    OK ZONE       |   ← Middle is decent
     |                  |
     |   EASY ZONE      |   ← Bottom center is easiest
     +------------------+
           👍 thumb here

PROBLEM: Look at these common app features. Where should each go?

Features to place:
- "Call 911" emergency button
- "Delete all my data" button
- "Play/Pause" button
- "Settings" (used rarely)
- "Home" (used constantly)
- "Post" button for social media

Questions:
1. Why might you put a DANGEROUS button in a hard-to-reach spot?
2. Why should the most-used button be in the easy zone?
3. What happens if you put "Delete" right next to "Save"?
```

---

## SECTION 7: The "It Didn't Work!" Problem - Learning from Failures (20 min)

### The Reality of Building Apps (5 min)

**Say:**

> "I've shown you 6 problems and how I solved them. But here's the truth: NONE of those solutions worked the first time. I tried things that failed. I built features users hated. I had to start over multiple times. And that's NORMAL. That's how building things actually works."

**Ask:** "Has anyone here ever built something - a LEGO set, a craft project, a science experiment - that didn't work the first time?"

*Let students share briefly*

**Key point:** "The difference between a beginner and an expert isn't that experts don't fail. It's that experts EXPECT to fail and know how to learn from it."

### What I Tried First (10 min)

**Tell these real stories from the project:**

#### Story 1: The Tiny Markers Disaster
> "My first version of the map had tiny little dots for markers - just circles, maybe 8 pixels wide. I thought 'smaller markers = cleaner map.' WRONG. On my phone, I couldn't tap them! My thumb would miss and tap the venue next to it. I had to make them 3x bigger and add padding around the tap area."

**Ask:** "Why did this seem like a good idea at first? Why did it fail?"

#### Story 2: The "Show Everything" Mistake
> "At first, when you opened the app, it showed ALL 150 mics at once - every day of the week, all on the map together. I thought 'more information = better!' The map was a mess of overlapping dots. Users said 'I can't find anything!' So I added the day filter to show only today's mics by default."

**Ask:** "When is MORE information actually WORSE? Can you think of other examples?"

#### Story 3: The Distance Trap
> "For the commute filter, my first version just measured straight-line distance. 'Show me mics within 2 miles.' But in NYC, you can't walk through buildings! A venue 2 miles away might take 15 minutes by subway OR 45 minutes if you have to walk around a river. I had to switch to using real transit time."

**Ask:** "What other situations where straight-line distance doesn't work? (Hint: mountains? water? highways?)"

#### Story 4: The API Cost Explosion
> "When I first added transit times, every time ANYONE loaded the map, I asked Google Maps for directions to EVERY venue. If 10 people used the app, I made 1,500 requests! Google charges money per request. My first month's bill was $200! Now I cache (save) the answers and reuse them."

**Ask:** "How could I have tested this BEFORE real users found it?"

#### Story 5: The Desktop-Only Design
> "I built the whole app on my laptop. It looked great on my big monitor. Then I opened it on my phone and... the drawer didn't work. The buttons were too small. The list covered the whole map. I had to redesign the entire layout for mobile. I should have started with mobile first!"

**Ask:** "Why is it smarter to design for phones FIRST, then add desktop features, instead of the other way around?"

#### Story 6: The Status Color Confusion
> "Originally, I used blue for 'live' mics and red for 'upcoming.' But users kept clicking the red ones thinking they were urgent/important. Red means 'stop' or 'danger' to most people! I switched to green for live (like a green light = go!) and red for upcoming (like 'get ready'). The colors matter!"

**Ask:** "What other colors have specific meanings? (traffic lights, warning signs, etc.)"

### STUDENT ACTIVITY: Failure Analysis (5 min)

**Give each group one of these scenarios:**

```
SCENARIO A: Instagram Story Disaster
A developer built a new Instagram feature: "Post your story to ALL your followers at once, no exceptions."
Users HATED it. Why? What should they have done instead?

SCENARIO B: The Auto-Correct Fail
A keyboard app decided to auto-correct EVERY word, even names and slang.
Users kept typing "gonna" and it changed to "going to."
What went wrong? How could they fix it?

SCENARIO C: The Notification Nightmare
A game app sent a push notification every time ANYTHING happened:
"Your friend logged in!" "Someone beat your score!" "It's been 1 hour since you played!"
Users uninstalled the app. Why? What's the right amount of notifications?

SCENARIO D: The Undo Button That Wasn't
A drawing app let you draw amazing art, but had NO undo button.
One wrong stroke = start over completely.
Why did the developer think this was OK? (Hint: "Real artists don't need undo!")
Why were they wrong?
```

**Each group:**
1. Identifies the problem
2. Explains why the developer thought it would work
3. Designs a better solution

**Share out:** Quick 30-second pitches from each group

### Key Takeaways (2 min)

**Write on board:**
```
GOOD DEVELOPERS:
✓ Test with real users early
✓ Start simple, add features slowly
✓ Expect their first idea to need changes
✓ Ask "What could go wrong?" BEFORE launching

BAD DEVELOPERS:
✗ Think they know what users want without asking
✗ Add every feature they can think of
✗ Launch to everyone without testing
✗ Get defensive when users complain
```

---

## SECTION 8: Wrap-Up (5 min)

### The Big Picture (3 min)

**Recap the problems:**

| Problem | Real-World Name | What We Learned |
|---------|----------------|-----------------|
| Address → Numbers | Geocoding | Computers need coordinates, not addresses |
| Overlapping dots | Clustering | Group nearby things to avoid visual mess |
| Too much info | Filtering | Let users narrow down with rules |
| Is it still relevant? | Status Logic | Time-based rules need careful thought |
| How long to get there? | Routing | Distance ≠ Time |
| Phone vs Computer | Responsive Design | Same app, different layouts |
| It didn't work! | Iteration & Failure | First attempts fail - that's normal and expected |

**Say:**

> "Building an app isn't about writing code. It's about solving problems. The code is just how you tell the computer your solution. Every app you use - Instagram, Google Maps, your favorite game - was built by people who had to solve hundreds of problems like these. And they all failed many times before they got it right."

### Reflection Questions (2 min)

Quick share-out:

1. Which problem surprised you the most?
2. Which one would you want to work on if you were building an app?

### Take-Home Challenge

> "Think of an app you use every day. Write down 3 problems the developers probably had to solve. For each one, describe the problem and guess how they solved it."

---

## BONUS ACTIVITIES (If Time Remains)

Use these if the class finishes early or for advanced groups:

### Bonus Activity A: Design Your Own Map App (10-15 min)

**Challenge:** Design a map app for ONE of these:
- Best pizza places in your neighborhood
- Dog parks in the city
- Free water fountains
- Skateboard spots

**Requirements - answer these questions:**
1. What information does each location need? (name, address, what else?)
2. What filters would users want?
3. What "status" would locations have? (open/closed? crowded/empty?)
4. Any clustering needed?
5. Phone vs computer - what's different?

**Present:** Each group has 1 minute to pitch their app.

---

### Bonus Activity B: Bug Hunt (10 min)

**Scenario:** Users are reporting bugs! Figure out what went wrong.

```
BUG REPORT #1:
"I searched for open mics in Queens, but the app showed me one in Manhattan!"

Possible causes:
A) The venue's address was entered wrong
B) The geocoding gave wrong coordinates
C) The filter isn't working
D) The venue moved but data wasn't updated

How would you figure out which one?
```

```
BUG REPORT #2:
"Two mics show as '5 minutes away' but one is across the street
and the other is 2 miles away!"

Possible causes:
A) The travel time API is broken
B) One is walking time, one is subway time
C) The coordinates are wrong
D) There's a bug in how we display the number

How would you figure out which one?
```

```
BUG REPORT #3:
"On my phone, I can't tap on the markers - they're too small!"

Possible causes:
A) The markers need to be bigger on phones
B) The user's phone is very old
C) The tap detection area is too small
D) Too many markers are overlapping

What would you try first?
```

---

### Bonus Activity C: The Data Entry Problem (10 min)

**The Hidden Problem:** Where does the data come from?

**Say:**

> "I told you about 150 open mics. But someone had to TYPE all that information! And venues change - they close, move, change their hours."

**Discussion questions:**
1. If you hire someone to enter all the data, how do you make sure they don't make mistakes?
2. What if a venue owner wants to update their own listing?
3. How do you know when a venue closes permanently?
4. What if two people enter the same venue with slightly different info?

**Mini-activity:** Here are two entries for the "same" venue. Which is correct?

```
Entry 1:
Name: "Comedy Cellar"
Address: "117 MacDougal Street, Manhattan"
Time: "Sunday 7:00 PM"
Price: "Free"

Entry 2:
Name: "The Comedy Cellar"
Address: "117 MacDougal St, New York NY 10012"
Time: "Sun 7pm"
Price: "$0"
```

Are these the same place? How can a computer tell?

---

### Bonus Activity D: Real vs Fake Data (5 min)

**Quick Discussion:** Why I used real data for this app

> "Some apps use fake data for demos. I used REAL open mic data. Why does that matter?"

**Consider:**
- Real data has weird edge cases (a mic that runs from 11pm to 2am crosses midnight!)
- Real data has missing information (some venues don't list a price)
- Real data gets outdated
- Real users will immediately know if data is wrong

**Question:** What would happen if I showed a venue as "Free" but it actually costs $20?

---

## APPENDIX: Answer Keys

### Problem 1: Human Geocoding
Approximate coordinates:
1. Times Square: (40.758, -73.985)
2. Prospect Park: (40.660, -73.969)
3. Yankee Stadium: (40.829, -73.926)
4. Coney Island: (40.575, -73.985)
5. Central Park Zoo: (40.768, -73.972)

**Early Finisher - Reverse Geocoding:**
1. (40.748, -73.986) = Empire State Building
2. (40.689, -74.044) = Statue of Liberty
3. (40.753, -73.977) = Grand Central Terminal

### Problem 2: The Party Problem
- Point (3,7) should have one sticker labeled "8"
- Point (8,2) should have one sticker labeled "3"
- All other points get single stickers
- Total visible stickers: 21 (not 30)

### Problem 3: Cafeteria Filtering

**A:** Marco (no nuts): Pizza, Burger, Chicken Tenders, Fries, Onion Rings, Apple, Buffalo Wings, Veggie Wrap (8 items)

**B:** Sofia (vegetarian + $3 or less): Pizza, Fries, Onion Rings, Apple (4 items)

**C:** Jake (spicy + vegetarian): Veggie Wrap (1 item) - Works! But barely.

**D:** Elena (snack + $1): Apple only. Cookie has nuts for $1, so depends if she has allergies!

**E:** Challenge - There's no perfect filter combo. All three are vegetarian, but so are other things. You'd need a "favorites" feature!

**Early Finisher - Filter Order:**
- Final result is the same regardless of order
- BUT: Applying the 80% filter first means the 50% filter only has to check 20 items instead of 100 → faster!

### Problem 4: Movie Theater Status

**At 4:45pm:**
- Spider-Man: HIDDEN (ended)
- Frozen 3: HIDDEN (started 2hr 15min ago, AND ended)
- Dune 2: GREEN (started 1hr 30min ago, still playing)
- Mario Movie: RED (starts in 15 min)
- Avengers: RED (starts in 1hr 45min)
- Barbie 2: GRAY (starts in 2hr 15min)
- Late Night Horror: GRAY (starts in 5hr 15min)

**At 6:00pm:**
- Spider-Man: HIDDEN
- Frozen 3: HIDDEN
- Dune 2: HIDDEN (started 2hr 45min ago)
- Mario Movie: GREEN (started 1hr ago)
- Avengers: RED (starts in 30min)
- Barbie 2: RED (starts in 1hr)
- Late Night Horror: GRAY (starts in 4hr)

**C Bug:** The 90-minute rule is wrong for movies. A movie that started at 5pm and runs until 7pm shouldn't hide at 6:30pm. Better rule: Show as GREEN until the movie ENDS, not until 90 min after start.

**D Challenge:** Possible 4th status: "TONIGHT" (Blue) - for showtimes more than 4 hours away but still today. Or "PRESALE" for advance tickets.

### Problem 5: Pizza Delivery

**A:** B5 is 2 blocks north = 2 minutes. Yes!

**B:** D8 is 3 blocks east. Crossing between 6-7 adds 5 min. Total: 3 + 5 = 8 minutes. Yes!

**C:** F5 is 2 blocks south. Must cross highway. Go to column 2 (3 blocks west = 3 min), cross at column 2, go to row F (2 blocks south = 2 min), go back east to column 5 (3 blocks = 3 min). Total: 3 + 2 + 3 + 3 min detour = 11 minutes. Yes!

**D:** The zone is NOT a circle. It's squished on the right (congestion) and pinched in the middle (highway). It might look like a figure-8 or irregular blob.

**E:** G9 from D5: Go down to highway (blocked), detour to column 2, cross, go to G2, then east to G9. That's: 3 west + 3 south + 7 east + 3 detour = 16 minutes + congestion crossing (5 min) = 21 minutes. Just over the limit!

---

## APPENDIX: Printable Materials

### Venue Cards for Activities
*Print and cut these for hands-on sorting activities*

```
┌─────────────────────────────┐
│ COMEDY CELLAR               │
│ 117 MacDougal St, Manhattan │
│ Tuesday 7:00 PM             │
│ Price: $10                  │
│ Type: Stand-up Comedy       │
└─────────────────────────────┘

┌─────────────────────────────┐
│ THE CREEK                   │
│ 10-93 Jackson Ave, Queens   │
│ Tuesday 8:00 PM             │
│ Price: FREE                 │
│ Type: Stand-up Comedy       │
└─────────────────────────────┘

┌─────────────────────────────┐
│ UNION HALL                  │
│ 702 Union St, Brooklyn      │
│ Tuesday 6:30 PM             │
│ Price: FREE                 │
│ Type: Variety Show          │
└─────────────────────────────┘

┌─────────────────────────────┐
│ EASTVILLE COMEDY            │
│ 487 Atlantic Ave, Brooklyn  │
│ Wednesday 9:00 PM           │
│ Price: $5                   │
│ Type: Stand-up Comedy       │
└─────────────────────────────┘

┌─────────────────────────────┐
│ STAND UP NY                 │
│ 236 W 78th St, Manhattan    │
│ Tuesday 7:30 PM             │
│ Price: $15                  │
│ Type: Stand-up Comedy       │
└─────────────────────────────┘

┌─────────────────────────────┐
│ Q.E.D.                      │
│ 27-16 23rd Ave, Queens      │
│ Monday 7:00 PM              │
│ Price: FREE                 │
│ Type: Storytelling          │
└─────────────────────────────┘

┌─────────────────────────────┐
│ CAVEAT                      │
│ 21 A Clinton St, Manhattan  │
│ Thursday 8:30 PM            │
│ Price: $8                   │
│ Type: Variety Show          │
└─────────────────────────────┘

┌─────────────────────────────┐
│ TINY CUPBOARD               │
│ 120 E 23rd St, Manhattan    │
│ Friday 9:00 PM              │
│ Price: FREE                 │
│ Type: Stand-up Comedy       │
└─────────────────────────────┘
```

---

## Teacher Notes

### Common Misconceptions to Address
1. "Coding is just typing" - Emphasize that 80% is problem-solving
2. "Apps just work" - Show the complexity behind simple features
3. "You need to be good at math" - Logic matters more than calculation
4. "One person builds an app" - Mention teams, APIs, services

### Extension Activities
- Have students design their OWN map app (for pizza places, parks, etc.)
- Explore real geocoding with Google Maps
- Discuss privacy implications of location sharing
- Look at other clustering examples (Google Maps restaurant clusters)

### Differentiation
- **Struggling students:** Pair up for activities, provide partially-completed answer sheets
- **Advanced students:** Give them the Early Finisher activities, ask them to find edge cases
- **ESL students:** Provide visual diagrams alongside word problems

### Timing Adjustments
- **Running behind:** Skip the Early Finisher activities, shorten Problem 6
- **Running ahead:** Use Bonus Activities A-D
- **Perfect timing:** Include 1-2 Early Finisher discussions as class shares

### Classroom Setup
- Groups of 3-4 work best
- Have materials pre-sorted by group to save time
- Project the live app on a big screen for demos

---

*Lesson plan created for MicFinder NYC - micfinder.nyc*
