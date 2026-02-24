# 2_10_26 — Flyer Scanner: Mic Data Extraction Pipeline

## Status: V1 BUILT AND WORKING

## What It Does
Takes a screenshot/photo of an open mic flyer, sends it to Gemini Flash Lite vision API, extracts structured mic data, and optionally inserts into MongoDB.

## Usage
```bash
cd api

# Extract + prompt to insert into DB
node scripts/scan-flyer.js /path/to/flyer.png

# Extract only, no DB write
node scripts/scan-flyer.js /path/to/flyer.png --dry-run

# Extract + auto-insert (no confirmation prompt)
node scripts/scan-flyer.js /path/to/flyer.png --auto
```

## V1 Test Results (Grisly Pear flyer)
- Extracted 21 mics from a single flyer image
- Both locations (West Village + Times Square) detected
- Coordinates resolved from existing DB entries
- Cancellation notes captured
- Minor Gemini accuracy issues: some times misread (5:00 vs 5:30), cancellation notes applied too broadly
- **Recommendation:** Always review with `--dry-run` first, then insert

## Files
- `api/scripts/scan-flyer.js` — Main script
- `api/package.json` — Added `@google/generative-ai` dependency

## Environment
- Requires `GEMINI_API_KEY` in `api/.env` (already added)
- Uses existing `MONGODB_URI`, `REDIS_URL`, `HERE_API_KEY`

## Known Limitations (V1)
- Gemini Flash Lite occasionally misreads times (5:00 vs 5:30)
- Multi-location venues may get same coordinates if addresses aren't on the flyer
- No way to edit extracted data before insert (edit the JSON file manually)
- Cost field comes back as-is from flyer (e.g. "$5 - CASH ONLY" instead of "$5 cash")

## Possible Fix: Use `gemini-2.0-flash` instead of `flash-lite` for better accuracy

---

## Versioned Roadmap

### V1: CLI Script — DONE
Drop a flyer image, get structured JSON, optionally insert into DB.

### V2: Watch Folder (not built yet)
Monitor a folder (e.g. `~/Desktop/flyers/`) for new images, auto-process them, output JSON to a `review/` folder for manual approval before inserting.

```bash
node scripts/scan-flyer.js --watch ~/Desktop/flyers/
```

Additions needed:
- `fs.watch()` on configurable folder
- JSON output to `review/` folder
- `--import review/file.json` command to insert reviewed data

### V3: API Endpoint (not built yet)
POST endpoint on the backend for uploading flyers from anywhere (phone, web).

```
POST /admin/scan-flyer
Body: { image: <base64> }
Response: { mics: [...] }
```

Additions needed:
- `multer` for file upload
- New route in `server.js`
- Auth middleware (API key)
- Could power a "Submit a Mic" feature in the app

---

## Architecture
```
Image file (PNG/JPG/WEBP)
    │
    ▼
Gemini Flash Lite Vision API
    │ (structured prompt with Mic schema)
    ▼
JSON array of mic entries
    │
    ├── Validate required fields
    ├── Resolve coordinates (HERE geocoding or DB lookup)
    ├── Preview table in terminal
    │
    ▼
MongoDB insert + Redis cache clear
```

## Existing Code Reused
- `api/models/Mic.js` — Schema for validation
- `api/utils/cache-invalidation.js` — Redis cache clearing
- `api/config/cache.js` — Redis connection
- HERE geocoding API (already configured in server.js)
- Script pattern from `api/scripts/fix-grisly-pear.js`
