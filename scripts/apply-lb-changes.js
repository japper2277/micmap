#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const REPORT_PATH = path.join(__dirname, '../logs/laughing-buddha-compare.json');
const MICS_PATH = path.join(__dirname, '../api/mics.json');

const DRY_RUN = process.argv.includes('--dry-run');
const REMOVE_STALE = process.argv.includes('--remove-stale');

// Venue templates — coords/address/borough/neighborhood for known venues
const VENUE_TEMPLATES = {
  'the buddha room': {
    venueName: 'The Buddha Room',
    address: '410 8th Ave 2nd Floor New York, NY 10001',
    borough: 'Manhattan',
    neighborhood: 'Midtown',
    lat: 40.7498782,
    lon: -73.9947359,
    cost: '$5.50 + 1 drink min',
    signUpDetails: 'https://www.laughingbuddhacomedy.com/mics',
    host: '@laughingbuddhacomedy (@laughingbuddhacomedy)'
  },
  'la diáspora': {
    venueName: 'La Diáspora',
    address: '91 Baxter St, New York, NY 10013',
    borough: 'Manhattan',
    neighborhood: 'Tribeca',
    lat: 40.7157,
    lon: -74.0027,
    cost: 'Free',
    signUpDetails: 'https://www.laughingbuddhacomedy.com/mics',
    host: '@laughingbuddhacomedy (@laughingbuddhacomedy)'
  },
  'la diaspora': {
    venueName: 'La Diáspora',
    address: '91 Baxter St, New York, NY 10013',
    borough: 'Manhattan',
    neighborhood: 'Tribeca',
    lat: 40.7157,
    lon: -74.0027,
    cost: 'Free',
    signUpDetails: 'https://www.laughingbuddhacomedy.com/mics',
    host: '@laughingbuddhacomedy (@laughingbuddhacomedy)'
  }
};

function normalizeVenueName(v) {
  return String(v || '').toLowerCase().trim()
    .replace(/[áàâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u');
}

function buildMicName(liveTitle) {
  // Strip the time prefix: "8:00 PM Mic Show @The Buddha Room - ..." → "Mic Show"
  const withoutTime = liveTitle.replace(/^\d{1,2}:\d{2}\s*(?:AM|PM)\s*/i, '').trim();
  const withoutVenue = withoutTime.split('@')[0].trim();
  const withoutSuffix = withoutVenue.replace(/[-–]\s*win a free open mic.*/i, '').trim();
  return withoutSuffix || 'Open Mic';
}

function buildNewMic(liveRow) {
  const venueKey = normalizeVenueName(liveRow.venue);
  const template = VENUE_TEMPLATES[venueKey];

  if (!template) {
    console.warn(`  ⚠️  No template for venue: "${liveRow.venue}" — skipping`);
    return null;
  }

  const micName = buildMicName(liveRow.title || '');

  return {
    name: `Laughing Buddha ${micName}`.replace(/\s+/g, ' ').trim(),
    day: liveRow.day,
    startTime: liveRow.time,
    endTime: null,
    venueName: template.venueName,
    borough: template.borough,
    neighborhood: template.neighborhood,
    address: template.address,
    lat: template.lat,
    lon: template.lon,
    cost: template.cost,
    stageTime: null,
    signUpDetails: liveRow.href || template.signUpDetails,
    host: template.host,
    notes: null
  };
}

function isDuplicate(newMic, mics) {
  return mics.some(m =>
    m.day === newMic.day &&
    m.startTime === newMic.startTime &&
    (m.venueName || '').toLowerCase() === (newMic.venueName || '').toLowerCase()
  );
}

function main() {
  if (!fs.existsSync(REPORT_PATH)) {
    console.error('No report found. Run check-laughing-buddha.js first.');
    process.exit(1);
  }

  const report = JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'));
  const mics = JSON.parse(fs.readFileSync(MICS_PATH, 'utf8'));

  console.log(`Report from: ${report.generatedAt}`);
  console.log(`Live-only (to add): ${report.unmatchedLive.length}`);
  console.log(`Local-only (stale): ${report.missingInLive.length}`);
  console.log(DRY_RUN ? '\n[DRY RUN — no files will be written]\n' : '');

  // --- ADDITIONS ---
  const toAdd = [];
  const skipped = [];

  for (const live of report.unmatchedLive) {
    const newMic = buildNewMic(live);
    if (!newMic) { skipped.push(live); continue; }

    if (isDuplicate(newMic, mics)) {
      console.log(`  SKIP (already exists): ${newMic.day} ${newMic.startTime} @ ${newMic.venueName}`);
      continue;
    }

    toAdd.push(newMic);
    console.log(`  ADD: ${newMic.day} ${newMic.startTime} | ${newMic.name} @ ${newMic.venueName}`);
  }

  // --- REMOVALS ---
  const toRemove = [];

  // Build a set of all live day+time+venue combos (matched + unmatched)
  // so we can protect entries the scraper missed but that are still real
  const allLive = [
    ...report.unmatchedLive.map((l) => ({ day: l.day, time: l.time, venue: (l.venue || '').toLowerCase() })),
    ...report.matches.map((m) => ({ day: m.live.day, time: m.live.time, venue: (m.live.venue || '').toLowerCase() }))
  ];

  function isStillOnSite(stale) {
    const staleVenue = (stale.venueName || '').toLowerCase();
    return allLive.some((l) => {
      if (l.day !== stale.day || l.time !== stale.startTime) return false;
      // Venue name overlap check — at least one word in common
      const lTokens = l.venue.split(/\s+/);
      const sTokens = staleVenue.split(/\s+/);
      return lTokens.some((t) => t.length > 2 && sTokens.includes(t));
    });
  }

  if (REMOVE_STALE) {
    for (const stale of report.missingInLive) {
      if (isStillOnSite(stale)) {
        console.log(`  KEEP (still on site): ${stale.day} ${stale.startTime} | ${stale.name} @ ${stale.venueName}`);
        continue;
      }
      const idx = mics.findIndex(m =>
        m.day === stale.day &&
        m.startTime === stale.startTime &&
        m.name === stale.name
      );
      if (idx >= 0) {
        toRemove.push(idx);
        console.log(`  REMOVE: ${stale.day} ${stale.startTime} | ${stale.name} @ ${stale.venueName}`);
      }
    }
  } else {
    console.log(`\nStale local-only mics (${report.missingInLive.length}) — run with --remove-stale to delete them:`);
    report.missingInLive.forEach(m => {
      console.log(`  ${m.day} ${m.startTime} | ${m.name} @ ${m.venueName}`);
    });
  }

  console.log(`\nSummary: ${toAdd.length} to add, ${toRemove.length} to remove, ${skipped.length} skipped`);

  if (DRY_RUN) {
    console.log('\nDry run complete. Re-run without --dry-run to apply.');
    return;
  }

  if (toAdd.length === 0 && toRemove.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Apply removals (reverse order to preserve indices)
  const sortedRemovals = [...toRemove].sort((a, b) => b - a);
  for (const idx of sortedRemovals) mics.splice(idx, 1);

  // Apply additions
  for (const mic of toAdd) mics.push(mic);

  fs.writeFileSync(MICS_PATH, JSON.stringify(mics, null, 2));
  console.log(`\nWrote ${mics.length} mics to ${MICS_PATH}`);
  console.log('Next: run the seed script and clear cache.');
  console.log('  cd api && node scripts/seed-database.js');
  console.log('  curl -X POST https://micmap-production.up.railway.app/admin/clear-cache');
}

main();
