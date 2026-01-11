#!/usr/bin/env node
/**
 * Transform new mic data format to existing mics.json format
 *
 * Usage: node scripts/transform-mics.js
 *
 * Input:  api/mics-new-raw.json (new format from spreadsheet)
 * Output: api/mics-transformed.json (format matching existing mics.json)
 */

const fs = require('fs');
const path = require('path');

// Paths
const inputPath = path.join(__dirname, '../api/mics-new-raw.json');
const existingPath = path.join(__dirname, '../api/mics.json');
const outputPath = path.join(__dirname, '../api/mics-transformed.json');

// Manual coordinates for new venues not in existing data
// Note: keys should match the POST-alias normalized names
const NEW_VENUE_COORDS = {
  "pioneer bar": { lat: 40.7472543, lng: -73.9918207 },  // "pioneers bar" aliases to this
  "red doors": { lat: 40.5758196, lng: -73.9798853 },    // "the red doors" aliases to this
};

// Venue name aliases - map variations to canonical names
const VENUE_ALIASES = {
  "rodney's comedy club": "rodney's",
  "new york comedy club east 4th": "new york comedy club east village",
  "new york comedy club 24th st": "new york comedy club midtown",
  "grisly pear mic-a-thon": "grisly pear midtown",
  "the grisly pear mic-a-thon": "grisly pear midtown",
  "pioneers bar": "pioneer bar",
  "the red doors": "red doors",
  "merkin comedy hole": "merkin hall",
  "grove34": "grove 34",
  "brooklyn comedy collective eris": "brooklyn comedy collective",
};

// Normalize venue name for matching
function normalizeVenue(name) {
  if (!name) return '';
  let normalized = name.toLowerCase()
    .replace(/^the\s+/i, '')  // Remove leading "The "
    .replace(/[\u2018\u2019\u0027\u02BC\u0060\u00B4]/g, "'")  // Normalize all apostrophe variants to straight '
    .replace(/[,\s]+/g, ' ')  // Normalize whitespace
    .trim();

  // Check if there's an alias for this venue
  if (VENUE_ALIASES[normalized]) {
    normalized = VENUE_ALIASES[normalized];
  }

  return normalized;
}

// Load existing mics to get lat/lng coordinates by venue name
function loadExistingCoords() {
  try {
    const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
    const coordMap = {};
    existing.forEach(mic => {
      if (mic.venue && mic.lat && mic.lng) {
        // Match by normalized venue name
        const normalizedVenue = normalizeVenue(mic.venue);
        if (!coordMap[normalizedVenue]) {
          coordMap[normalizedVenue] = { lat: mic.lat, lng: mic.lng, address: mic.address };
        }
      }
    });
    return coordMap;
  } catch (e) {
    console.warn('Could not load existing mics.json for coordinates:', e.message);
    return {};
  }
}

// Normalize time format (e.g., "7:00pm" -> "7:00 PM")
function normalizeTime(timeStr) {
  if (!timeStr) return null;
  let t = timeStr.trim();
  // Add space before AM/PM if missing
  t = t.replace(/(\d)(am|pm)/i, '$1 $2');
  // Uppercase AM/PM
  t = t.replace(/\s*(am|pm)\s*/i, (match) => ' ' + match.trim().toUpperCase());
  return t.trim();
}

// Build contact string from hosts and changes_updates
function buildContact(hosts, changes) {
  const parts = [];
  if (hosts && hosts !== '#N/A') parts.push(hosts);
  if (changes && changes !== '#N/A' && changes.startsWith('@')) {
    parts.push(`(${changes})`);
  }
  return parts.join(' ') || null;
}

// Normalize stage time (e.g., "5" -> "5min", "3-5 min" -> "3-5min")
function normalizeStageTime(stageTime) {
  if (!stageTime) return null;
  let st = stageTime.toString().trim();
  // Remove "min" suffix if present, then re-add consistently
  st = st.replace(/\s*min(s|utes?)?\s*/gi, '');
  return st + 'min';
}

// Transform a single mic record
function transformMic(raw, index, coordMap) {
  const addr = (raw.location || '').trim();
  const venueName = (raw.venue_name || '').trim().replace(/\n/g, '');

  // Match by normalized venue name - check existing coords first, then new venue coords
  const normalizedVenue = normalizeVenue(venueName);
  const coords = coordMap[normalizedVenue] || NEW_VENUE_COORDS[normalizedVenue] || { lat: null, lng: null };

  return {
    id: index,
    name: raw.open_mic || 'Open Mic',
    day: raw.day || null,
    startTime: normalizeTime(raw.start_time),
    endTime: normalizeTime(raw.latest_end_time),
    venue: venueName,
    borough: raw.borough || null,
    neighborhood: raw.neighborhood || null,
    address: addr,
    cost: raw.cost || null,
    stageTime: normalizeStageTime(raw.stage_time),
    signup: raw.sign_up_instructions || null,
    contact: buildContact(raw.hosts_organizers, raw.changes_updates),
    notes: raw.other_rules || null,
    lat: coords.lat,
    lng: coords.lng
  };
}

// Main
function main() {
  console.log('Loading existing coordinates...');
  const coordMap = loadExistingCoords();
  console.log(`  Found ${Object.keys(coordMap).length} venues with coordinates`);

  console.log('Loading new mic data...');
  const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  console.log(`  Found ${rawData.length} mics in new data`);

  // Filter for NYC only and active mics
  const nycActive = rawData.filter(m =>
    m.city === 'New York' && m.active === true
  );
  console.log(`  ${nycActive.length} active NYC mics`);

  // Transform
  console.log('Transforming...');
  const transformed = nycActive.map((mic, i) => transformMic(mic, i, coordMap));

  // Count mics with/without coordinates
  const withCoords = transformed.filter(m => m.lat && m.lng).length;
  const needsGeocode = transformed.filter(m => !m.lat || !m.lng).length;
  console.log(`  ${withCoords} mics have coordinates`);
  console.log(`  ${needsGeocode} mics need geocoding`);

  // Write output
  fs.writeFileSync(outputPath, JSON.stringify(transformed, null, 2));
  console.log(`\nSaved to: ${outputPath}`);

  // Also save list of addresses needing geocoding
  if (needsGeocode > 0) {
    const needsGeocodeList = transformed
      .filter(m => !m.lat || !m.lng)
      .map(m => ({ id: m.id, name: m.name, venue: m.venue, address: m.address }));
    const geocodePath = path.join(__dirname, '../api/mics-needs-geocode.json');
    fs.writeFileSync(geocodePath, JSON.stringify(needsGeocodeList, null, 2));
    console.log(`Addresses needing geocoding saved to: ${geocodePath}`);
  }
}

main();
