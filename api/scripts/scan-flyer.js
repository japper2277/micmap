/**
 * Flyer Scanner v1 — Extract mic data from flyer images
 * Uses Gemini Flash Lite vision to read flyers and output structured mic data
 *
 * Usage:
 *   node scripts/scan-flyer.js <image-path>              # Extract + prompt to insert
 *   node scripts/scan-flyer.js <image-path> --dry-run    # Extract only, no DB
 *   node scripts/scan-flyer.js <image-path> --auto       # Extract + auto-insert (no prompt)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const HERE_API_KEY = process.env.HERE_API_KEY;

// Supported image types
const MIME_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif'
};

// Vision prompt for mic data extraction
const EXTRACTION_PROMPT = `You are a data extraction tool for an open mic finder app in New York City.

Analyze this flyer image and extract ALL open mic events listed. Return a JSON array where each element represents one mic time slot.

For each mic, extract these fields:
- name: The brand/business name shown prominently on the flyer (e.g. "Grisly Pear", "Comedy Cellar"). This is NOT the neighborhood — it's the name of the organization running the mics.
- day: Day of week (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday)
- startTime: Start time in "H:MM PM" format (e.g. "4:30 PM", "9:00 PM")
- endTime: End time in "H:MM PM" format if shown, or null
- venueName: Same as name — the brand/business name, NOT the neighborhood or location label
- address: Full street address if shown (e.g. "107 MacDougal St, New York, NY")
- borough: NYC borough (Manhattan, Brooklyn, Queens, Bronx, Staten Island) — infer from address/neighborhood if possible
- neighborhood: NYC neighborhood if shown or inferable from the address
- cost: Price info exactly as shown (e.g. "$5 cash", "Free", "1 Drink Minimum")
- stageTime: Minutes of stage time per performer if shown (as a number), or null
- signUpDetails: How to sign up (e.g. "Sign up in person", URL, email)
- host: Host/organizer name and social handle if shown
- notes: Any special notes (cancellations, schedule changes, item minimums, etc.)

IMPORTANT RULES:
- The "name" and "venueName" should be the BUSINESS NAME (the big title on the flyer), NOT a location/neighborhood label. If a flyer says "GRISLY PEAR" at the top and lists locations like "West Village" and "Times Square", the venueName is "Grisly Pear", not "West Village".
- If the same brand has multiple locations, differentiate with a suffix (e.g. "Grisly Pear" for the main location, "Grisly Pear Midtown" for the second)
- If a venue has multiple time slots on the same day, create SEPARATE entries for each time slot
- If a schedule applies to multiple days (e.g. "M/T/W/Th"), create SEPARATE entries for EACH day individually
- If Saturday and Sunday have the same time, create SEPARATE entries for each
- "M/T/W/Th" means Monday, Tuesday, Wednesday, Thursday — expand ALL of them
- Include ALL days and ALL times shown, don't skip any. If two times are listed under one day group (e.g. "4:30PM" and "6:00PM" under "M/T/W/TH"), that means TWO separate mics per day. You must create entries for BOTH times for EACH day.
- Read times carefully. "5:30PM" and "5:00PM" are different. Transcribe exactly what is printed.
- If something is unclear or not shown, use null
- Return ONLY valid JSON array, no markdown, no explanation

Example output:
[
  {"name":"Venue Name","day":"Monday","startTime":"4:30 PM","endTime":"6:00 PM","venueName":"Venue Name","address":"123 Main St, New York, NY","borough":"Manhattan","neighborhood":"Greenwich Village","cost":"$5 cash","stageTime":5,"signUpDetails":"Sign up in person","host":null,"notes":"Schedule subject to change"}
]`;

function titleCase(str) {
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function parseArgs() {
    const args = process.argv.slice(2);
    const flags = {
        dryRun: args.includes('--dry-run'),
        auto: args.includes('--auto'),
        help: args.includes('--help') || args.includes('-h')
    };
    const imagePath = args.find(a => !a.startsWith('--'));
    return { imagePath, flags };
}

function printUsage() {
    console.log(`
  Flyer Scanner v1 — Extract mic data from images

  Usage:
    node scripts/scan-flyer.js <image-path>              Extract + prompt to insert
    node scripts/scan-flyer.js <image-path> --dry-run    Extract only, no DB
    node scripts/scan-flyer.js <image-path> --auto       Extract + auto-insert

  Supported formats: PNG, JPG, JPEG, WEBP, GIF
`);
}

function printTable(mics) {
    // Find column widths
    const cols = {
        day: Math.max(3, ...mics.map(m => (m.day || '').length)),
        startTime: Math.max(5, ...mics.map(m => (m.startTime || '').length)),
        venueName: Math.max(5, ...mics.map(m => (m.venueName || '').length)),
        cost: Math.max(4, ...mics.map(m => (m.cost || '').length)),
        notes: Math.max(5, ...mics.map(m => (m.notes || '').slice(0, 40).length))
    };

    const pad = (s, n) => (s || '').padEnd(n);
    const line = `+-${'-'.repeat(cols.day)}-+-${'-'.repeat(cols.startTime)}-+-${'-'.repeat(cols.venueName)}-+-${'-'.repeat(cols.cost)}-+-${'-'.repeat(cols.notes)}-+`;

    console.log(line);
    console.log(`| ${pad('Day', cols.day)} | ${pad('Time', cols.startTime)} | ${pad('Venue', cols.venueName)} | ${pad('Cost', cols.cost)} | ${pad('Notes', cols.notes)} |`);
    console.log(line);
    mics.forEach(m => {
        console.log(`| ${pad(m.day, cols.day)} | ${pad(m.startTime, cols.startTime)} | ${pad(m.venueName, cols.venueName)} | ${pad(m.cost, cols.cost)} | ${pad((m.notes || '').slice(0, 40), cols.notes)} |`);
    });
    console.log(line);
}

async function geocodeAddress(address) {
    if (!HERE_API_KEY || !address) return null;

    try {
        const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&apiKey=${HERE_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.items && data.items.length > 0) {
            const pos = data.items[0].position;
            return { lat: pos.lat, lon: pos.lng };
        }
    } catch (e) {
        console.warn(`  Geocoding failed for "${address}": ${e.message}`);
    }
    return null;
}

async function lookupExistingVenue(venueName) {
    try {
        const Mic = require('../models/Mic');
        const existing = await Mic.findOne({
            venueName: { $regex: new RegExp(`^${venueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        }).lean();

        if (existing) {
            return {
                lat: existing.lat,
                lon: existing.lon,
                address: existing.address,
                borough: existing.borough,
                neighborhood: existing.neighborhood
            };
        }
    } catch (e) {}
    return null;
}

async function extractFromImage(imagePath) {
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = MIME_TYPES[ext];
    if (!mimeType) {
        throw new Error(`Unsupported image format: ${ext}. Use PNG, JPG, WEBP, or GIF.`);
    }

    const imageData = fs.readFileSync(imagePath);
    const base64 = imageData.toString('base64');

    console.log(`\nSending to Gemini Flash Lite...`);

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

    const result = await model.generateContent([
        { text: EXTRACTION_PROMPT },
        {
            inlineData: {
                mimeType,
                data: base64
            }
        }
    ]);

    const text = result.response.text();

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
    }

    try {
        const mics = JSON.parse(jsonStr);
        // Normalize: title-case venue names (Gemini sometimes returns ALL CAPS)
        mics.forEach(m => {
            if (m.name) m.name = titleCase(m.name);
            if (m.venueName) m.venueName = titleCase(m.venueName);
        });
        return mics;
    } catch (e) {
        console.error('\nFailed to parse Gemini response as JSON.');
        console.error('Raw response:', text);
        throw new Error('Invalid JSON response from Gemini');
    }
}

function validateMics(mics) {
    const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const errors = [];

    mics.forEach((m, i) => {
        if (!m.name) errors.push(`Mic ${i + 1}: missing name`);
        if (!m.day || !validDays.includes(m.day)) errors.push(`Mic ${i + 1}: invalid day "${m.day}"`);
        if (!m.startTime) errors.push(`Mic ${i + 1}: missing startTime`);
        if (!m.venueName) errors.push(`Mic ${i + 1}: missing venueName`);
    });

    return errors;
}

async function enrichWithCoordinates(mics) {
    console.log('\nResolving coordinates...');

    // Group by venue+address to avoid duplicate lookups but differentiate locations
    const venueCache = {};

    for (const mic of mics) {
        // Use venue+address as key to differentiate multi-location venues
        const key = `${(mic.venueName || '').toLowerCase()}|${(mic.address || '').toLowerCase()}`;

        if (!venueCache[key]) {
            // Try geocoding address first (most accurate for multi-location)
            if (mic.address) {
                const coords = await geocodeAddress(mic.address);
                if (coords) {
                    venueCache[key] = { ...coords, address: mic.address };
                    console.log(`  ${mic.venueName} (${mic.address}): geocoded`);
                }
            }

            // Fall back to DB lookup
            if (!venueCache[key]) {
                const existing = await lookupExistingVenue(mic.venueName);
                if (existing) {
                    venueCache[key] = existing;
                    console.log(`  ${mic.venueName}: found in DB`);
                } else {
                    console.warn(`  ${mic.venueName}: could not resolve coordinates`);
                }
            }
        }

        const cached = venueCache[key];
        if (cached) {
            mic.lat = cached.lat;
            mic.lon = cached.lon;
            if (!mic.address && cached.address) mic.address = cached.address;
            if (!mic.borough && cached.borough) mic.borough = cached.borough;
            if (!mic.neighborhood && cached.neighborhood) mic.neighborhood = cached.neighborhood;
        }
    }

    return mics;
}

async function insertIntoDb(mics) {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const Mic = require('../models/Mic');

    // Check for existing entries at same venue to offer replacement
    const venueNames = [...new Set(mics.map(m => m.venueName))];
    for (const name of venueNames) {
        const existing = await Mic.countDocuments({
            venueName: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        if (existing > 0) {
            console.log(`  Replacing ${existing} existing "${name}" entries`);
            await Mic.deleteMany({
                venueName: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
            });
        }
    }

    const result = await Mic.insertMany(mics);
    console.log(`Inserted ${result.length} mics`);

    // Clear Redis cache
    try {
        const { invalidateMicsCache } = require('../utils/cache-invalidation');
        await invalidateMicsCache();
    } catch (e) {
        console.log('Redis cache clear skipped (not connected)');
    }

    await mongoose.disconnect();
}

function askConfirm(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.toLowerCase().startsWith('y'));
        });
    });
}

async function run() {
    const { imagePath, flags } = parseArgs();

    if (flags.help || !imagePath) {
        printUsage();
        process.exit(0);
    }

    if (!GEMINI_API_KEY) {
        console.error('Error: GEMINI_API_KEY not found in .env');
        process.exit(1);
    }

    // Resolve path
    const fullPath = path.resolve(imagePath);
    if (!fs.existsSync(fullPath)) {
        console.error(`Error: File not found: ${fullPath}`);
        process.exit(1);
    }

    console.log(`\nScanning: ${path.basename(fullPath)}`);

    // 1. Extract data from image
    let mics = await extractFromImage(fullPath);
    console.log(`\nExtracted ${mics.length} mics`);

    // 2. Validate
    const errors = validateMics(mics);
    if (errors.length > 0) {
        console.warn('\nValidation warnings:');
        errors.forEach(e => console.warn(`  - ${e}`));
    }

    // 3. Enrich with coordinates (always connect to DB for lookups)
    if (MONGODB_URI) {
        await mongoose.connect(MONGODB_URI);
    }
    mics = await enrichWithCoordinates(mics);
    if (MONGODB_URI && flags.dryRun) {
        await mongoose.disconnect();
    }

    // Filter out mics without coordinates
    const withCoords = mics.filter(m => m.lat && m.lon);
    const withoutCoords = mics.filter(m => !m.lat || !m.lon);

    if (withoutCoords.length > 0) {
        console.warn(`\n${withoutCoords.length} mics missing coordinates (will be skipped):`);
        withoutCoords.forEach(m => console.warn(`  - ${m.venueName} (${m.day} ${m.startTime})`));
    }

    // 4. Display results
    console.log(`\nFound ${withCoords.length} mics with coordinates:\n`);
    printTable(withCoords);

    // 5. Save JSON output
    const outputPath = fullPath.replace(/\.[^.]+$/, '.json');
    fs.writeFileSync(outputPath, JSON.stringify(withCoords, null, 2));
    console.log(`\nJSON saved to: ${outputPath}`);

    // 6. Insert into DB
    if (flags.dryRun) {
        console.log('\n--dry-run: Skipping database insert');
        return;
    }

    if (withCoords.length === 0) {
        console.log('\nNo mics with coordinates to insert.');
        return;
    }

    const shouldInsert = flags.auto || await askConfirm(`\nInsert ${withCoords.length} mics into database? (y/n): `);

    if (shouldInsert) {
        await insertIntoDb(withCoords);
        console.log('\nDone!');
    } else {
        console.log('\nSkipped. JSON file saved for manual review.');
    }
}

run().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
